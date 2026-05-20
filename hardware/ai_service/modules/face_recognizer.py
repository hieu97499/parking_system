"""
Nhận diện khuôn mặt (Face Recognition) - Phiên bản đa góc

Flow:
  1. YOLOv8 (face_detector.pt)  – detect và crop vùng khuôn mặt
  2. InsightFace (buffalo_sc)    – trích xuất embedding 512 chiều
  3. Cosine similarity           – so sánh với TẤT CẢ embedding góc đã đăng ký

Cải tiến đa góc:
  - Mỗi user lưu tối đa 5 ảnh theo góc: front, left, right, up, down
  - File ảnh đặt tên theo góc: front.jpg, left.jpg, right.jpg, up.jpg, down.jpg
  - Khi nhận diện: tính cosine với toàn bộ embeddings, lấy MAX
    → AI tự động khớp với góc mặt hiện tại của người dùng
"""

import os
import base64
import cv2
import numpy as np
import logging
from pathlib import Path
from threading import Lock
from typing import Optional
import httpx
import config

logger = logging.getLogger(__name__)

# Các góc hợp lệ (phải trùng với tên file ảnh)
VALID_ANGLES = {'front', 'left', 'right', 'up', 'down'}
ANGLE_WEIGHTS = {
    'front': 1.0,   # Chính diện – độ tin cậy cao nhất
    'left':  0.95,
    'right': 0.95,
    'up':    0.9,
    'down':  0.9,
}


class FaceRecognizer:
    _instance = None

    def __init__(self):
        self._embedder = None
        self._ready    = False
        self._lock     = Lock()
        # Cấu trúc mới: {user_id: [{'angle': str, 'emb': np.ndarray, 'weight': float}]}
        self._known_embeddings: dict[str, list[dict]] = {}
        self._load_models()

    @classmethod
    def get(cls) -> "FaceRecognizer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_models(self):
        try:
            from insightface.app import FaceAnalysis

            self._embedder = FaceAnalysis(
                name="buffalo_sc",
                root=config.MODELS_DIR,
                providers=["CPUExecutionProvider"]
            )
            self._embedder.prepare(ctx_id=-1, det_size=(320, 320))

            self._ready = True
            logger.info("InsightFace buffalo_sc loaded (det_500m + ArcFace w600k_mbf)")
        except Exception as e:
            logger.error(f"Loi load InsightFace: {e}")

    def _extract_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """InsightFace tự detect + trích xuất embedding 512 chiều."""
        if not self._ready:
            return None
        try:
            faces = self._embedder.get(image)
            if not faces:
                return None

            # Chọn khuôn mặt có diện tích lớn nhất (gần camera nhất)
            best = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
            emb = best.embedding
            emb = emb / (np.linalg.norm(emb) + 1e-6)
            return emb.astype(np.float32)

        except Exception as e:
            logger.error(f"Loi embedding: {e}")
            return None

    def sync_from_backend(self) -> int:
        """
        Tải toàn bộ ảnh khuôn mặt đã đăng ký từ backend server về local cache.
        Gọi trước reload_known_faces() để luôn dùng dữ liệu mới nhất từ server.
        Returns: số lượng ảnh đã tải, hoặc -1 nếu lỗi kết nối.
        """
        backend_url = getattr(config, 'BACKEND_URL', 'http://localhost:4000')
        api_key     = getattr(config, 'HARDWARE_API_KEY', '')
        if not backend_url or 'localhost' in backend_url and not api_key:
            logger.info("sync_from_backend: chạy local, bỏ qua sync")
            return 0
        try:
            resp = httpx.get(
                backend_url.rstrip('/') + '/api/hardware/faces/download',
                headers={'x-hardware-key': api_key},
                timeout=30.0,
            )
            if resp.status_code != 200:
                logger.warning(f"sync_from_backend: server trả {resp.status_code} – dùng cache local")
                return -1
            data = resp.json()
            faces_root = Path(config.FACES_DIR)
            count = 0
            for user in data.get('users', []):
                user_dir = faces_root / user['user_id']
                user_dir.mkdir(parents=True, exist_ok=True)
                for img in user.get('images', []):
                    img_path = user_dir / img['filename']
                    img_bytes = base64.b64decode(img['image_b64'])
                    img_path.write_bytes(img_bytes)
                    count += 1
            logger.info(f"sync_from_backend: tải {count} ảnh của {len(data.get('users', []))} user")
            return count
        except Exception as e:
            logger.warning(f"sync_from_backend thất bại ({e}) – dùng cache local")
            return -1

    def upload_embeddings_to_backend(self) -> bool:
        """
        Upload embeddings vừa tính được lên server để cache.
        Lần sau AI Service có thể tải embeddings thay vì ảnh (nhanh hơn nhiều).
        Returns: True nếu upload thành công.
        """
        backend_url = getattr(config, 'BACKEND_URL', 'http://localhost:4000')
        api_key     = getattr(config, 'HARDWARE_API_KEY', '')
        if not backend_url or 'localhost' in backend_url:
            return False
        with self._lock:
            snapshot = dict(self._known_embeddings)
        payload = []
        for user_id, entries in snapshot.items():
            for entry in entries:
                payload.append({
                    'user_id':   int(user_id) if user_id.isdigit() else user_id,
                    'angle':     entry['angle'] or 'unknown',
                    'embedding': entry['emb'].tolist(),
                })
        if not payload:
            return False
        try:
            resp = httpx.put(
                backend_url.rstrip('/') + '/api/hardware/faces/embeddings',
                json={'embeddings': payload},
                headers={'x-hardware-key': api_key},
                timeout=30.0,
            )
            if resp.status_code == 200:
                logger.info(f"upload_embeddings: đã lưu {resp.json().get('saved', 0)} embedding lên server")
                return True
            logger.warning(f"upload_embeddings: server trả {resp.status_code}")
            return False
        except Exception as e:
            logger.warning(f"upload_embeddings thất bại ({e})")
            return False

    def smart_sync(self) -> int:
        """
        Chiến lược đồng bộ thông minh:
          1. Thử tải embeddings đã cache từ DB (JSON nhỏ, ~KB) → nhanh
          2. Nếu có đủ embeddings → load trực tiếp, KHÔNG cần tải ảnh
          3. Nếu không có (lần đầu hoặc DB rỗng) → tải ảnh từ server → tính embedding → cache lên DB

        Returns: số user đã load vào bộ nhớ.
        """
        backend_url = getattr(config, 'BACKEND_URL', 'http://localhost:4000')
        api_key     = getattr(config, 'HARDWARE_API_KEY', '')

        # Nếu không có server thì đọc file local như cũ
        if not backend_url or 'localhost' in backend_url:
            return self.reload_known_faces()

        # ── BƯỚC 1: Thử đọc embeddings từ DB ──────────────────────────
        try:
            resp = httpx.get(
                backend_url.rstrip('/') + '/api/hardware/faces/embeddings',
                headers={'x-hardware-key': api_key},
                timeout=15.0,
            )
            if resp.status_code == 200:
                rows = resp.json().get('embeddings', [])
                if rows:
                    new_known: dict[str, list[dict]] = {}
                    for row in rows:
                        uid   = str(row['user_id'])
                        angle = row['angle']
                        emb   = np.array(row['embedding'], dtype=np.float32)
                        emb   = emb / (np.linalg.norm(emb) + 1e-6)
                        entry = {
                            'angle':  angle if angle in VALID_ANGLES else None,
                            'emb':    emb,
                            'weight': ANGLE_WEIGHTS.get(angle, 0.9),
                        }
                        new_known.setdefault(uid, []).append(entry)
                    with self._lock:
                        self._known_embeddings = new_known
                    logger.info(
                        f"smart_sync: tải {len(rows)} embeddings của "
                        f"{len(new_known)} user từ DB (không cần ảnh)"
                    )
                    return len(new_known)
        except Exception as e:
            logger.warning(f"smart_sync: lấy embeddings từ DB thất bại ({e})")

        # ── BƯỚC 2: Fallback – tải ảnh → tính embedding → upload DB ──
        logger.info("smart_sync: không có embedding trong DB – tải ảnh từ server...")
        self.sync_from_backend()
        count = self.reload_known_faces()
        if count > 0:
            self.upload_embeddings_to_backend()
        return count

    def reload_known_faces(self) -> int:
        """
        Quét lại uploads/faces/{user_id}/ và cập nhật embedding đa góc.

        Ưu tiên file đặt tên theo góc (front.jpg, left.jpg, ...):
          - Nếu tìm thấy → lưu kèm thông tin angle + weight
          - Nếu không có tên góc → vẫn load bình thường (backward compatible)
        """
        if not self._ready:
            logger.warning("Face model chua san sang – bo qua reload")
            return 0

        faces_root = Path(config.FACES_DIR)
        if not faces_root.exists():
            logger.warning(f"Thu muc anh khuon mat khong ton tai: {faces_root}")
            return 0

        new_known: dict[str, list[dict]] = {}
        loaded_users = 0
        total_embeddings = 0

        for user_dir in faces_root.iterdir():
            if not user_dir.is_dir():
                continue
            user_id    = user_dir.name
            emb_entries = []

            img_files = list(user_dir.glob("*.jpg")) + list(user_dir.glob("*.png"))
            for img_file in img_files:
                img = cv2.imread(str(img_file))
                if img is None:
                    continue

                emb = self._extract_embedding(img)
                if emb is None:
                    continue

                # Xác định angle từ tên file
                stem = img_file.stem.lower()
                if stem in VALID_ANGLES:
                    angle  = stem
                    weight = ANGLE_WEIGHTS.get(stem, 0.9)
                else:
                    angle  = None
                    weight = 0.9  # Ảnh cũ không có tên góc

                emb_entries.append({
                    'angle':  angle,
                    'emb':    emb,
                    'weight': weight,
                })
                total_embeddings += 1

            if emb_entries:
                new_known[user_id] = emb_entries
                loaded_users += 1

                angle_list = [e['angle'] for e in emb_entries if e['angle']]
                logger.info(
                    f"User {user_id}: {len(emb_entries)} embeddings, "
                    f"angles={angle_list}"
                )

        with self._lock:
            self._known_embeddings = new_known

        logger.info(
            f"Da load {loaded_users} user, "
            f"{total_embeddings} embeddings (multi-angle)"
        )
        return loaded_users

    def recognize(self, image_bytes: bytes) -> dict:
        """
        Nhận diện khuôn mặt từ JPEG bytes – chế độ đa góc.

        So sánh query embedding với TẤT CẢ góc đã đăng ký,
        lấy similarity cao nhất (có tính trọng số theo góc).

        Returns: {"user_id": "uuid-...", "confidence": 0.92, "matched": True}
        """
        if not self._ready:
            return {"user_id": None, "confidence": 0.0, "matched": False}

        with self._lock:
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None:
                return {"user_id": None, "confidence": 0.0, "matched": False}

            query_emb = self._extract_embedding(image)
            if query_emb is None:
                return {"user_id": None, "confidence": 0.0, "matched": False}

            best_uid = None
            best_sim = 0.0

            for uid, emb_entries in self._known_embeddings.items():
                # Tính weighted cosine similarity với mỗi góc
                user_best = 0.0
                for entry in emb_entries:
                    raw_sim = float(np.dot(query_emb, entry['emb']))
                    weighted_sim = raw_sim * entry['weight']
                    if weighted_sim > user_best:
                        user_best = weighted_sim

                if user_best > best_sim:
                    best_sim = user_best
                    best_uid = uid

        matched = best_uid is not None and best_sim >= config.FACE_CONF_THRESHOLD
        return {
            "user_id":    best_uid if matched else None,
            "confidence": round(best_sim, 4),
            "matched":    matched,
        }

    def get_user_angles(self, user_id: str) -> list[str]:
        """Trả về danh sách các góc đã có embedding của user."""
        with self._lock:
            entries = self._known_embeddings.get(user_id, [])
            return [e['angle'] for e in entries if e['angle']]
