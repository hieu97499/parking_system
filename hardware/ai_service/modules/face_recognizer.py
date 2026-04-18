"""
Nhận diện khuôn mặt (Face Recognition)

Flow:
  1. YOLOv8 (face_detector.pt)  – detect và crop vùng khuôn mặt
  2. InsightFace (buffalo_sc)    – trích xuất embedding 512 chiều
  3. Cosine similarity           – so sánh với ảnh đã đăng ký trong uploads/faces/
"""

import os
import cv2
import numpy as np
import logging
from pathlib import Path
from threading import Lock
from typing import Optional
import config

logger = logging.getLogger(__name__)

class FaceRecognizer:
    _instance = None

    def __init__(self):
        self._detector = None
        self._embedder = None
        self._ready    = False
        self._lock     = Lock()
        self._known_embeddings: dict[str, list[np.ndarray]] = {}
        self._load_models()

    @classmethod
    def get(cls) -> "FaceRecognizer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_models(self):
        face_model_path = Path(config.MODELS_DIR) / "face_detector.pt"
        if not face_model_path.exists():
            logger.warning(f"Khong tim thay face model: {face_model_path}")
            return
        try:
            from ultralytics import YOLO
            import insightface
            from insightface.app import FaceAnalysis

            self._detector = YOLO(str(face_model_path))

            self._embedder = FaceAnalysis(
                name="buffalo_sc",
                root=config.MODELS_DIR,
                providers=["CPUExecutionProvider"]
            )
            self._embedder.prepare(ctx_id=-1, det_size=(320, 320))

            self._ready = True
            logger.info(f"Face model da load: {face_model_path.name} + InsightFace buffalo_sc")
        except Exception as e:
            logger.error(f"Loi load face model: {e}")

    def _extract_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        1. YOLO detect face → crop vùng mặt lớn nhất
        2. InsightFace trích xuất embedding → normalize
        """
        if not self._ready:
            return None
        try:

            results = self._detector(image, verbose=False)
            boxes   = results[0].boxes
            if len(boxes) == 0:

                face_img = image
            else:
                best_idx = int(boxes.conf.argmax())
                x1, y1, x2, y2 = map(int, boxes.xyxy[best_idx])

                h, w = image.shape[:2]
                pad_x = int((x2 - x1) * 0.1)
                pad_y = int((y2 - y1) * 0.1)
                x1 = max(0, x1 - pad_x); y1 = max(0, y1 - pad_y)
                x2 = min(w, x2 + pad_x); y2 = min(h, y2 + pad_y)
                face_img = image[y1:y2, x1:x2]

            if face_img.size == 0:
                return None

            faces = self._embedder.get(face_img)
            if not faces:

                faces = self._embedder.get(image)
            if not faces:
                return None

            emb = faces[0].embedding
            emb = emb / (np.linalg.norm(emb) + 1e-6)
            return emb.astype(np.float32)

        except Exception as e:
            logger.error(f"Loi embedding: {e}")
            return None

    def reload_known_faces(self) -> int:
        """Quét lại uploads/faces/{user_id}/ và cập nhật embedding."""
        if not self._ready:
            logger.warning("Face model chua san sang – bo qua reload")
            return 0

        faces_root = Path(config.FACES_DIR)
        if not faces_root.exists():
            logger.warning(f"Thu muc anh khuon mat khong ton tai: {faces_root}")
            return 0

        new_known: dict[str, list[np.ndarray]] = {}
        loaded_users = 0

        for user_dir in faces_root.iterdir():
            if not user_dir.is_dir():
                continue
            user_id    = user_dir.name
            embeddings = []

            for img_file in list(user_dir.glob("*.jpg")) + list(user_dir.glob("*.png")):
                img = cv2.imread(str(img_file))
                if img is None:
                    continue
                emb = self._extract_embedding(img)
                if emb is not None:
                    embeddings.append(emb)

            if embeddings:
                new_known[user_id] = embeddings
                loaded_users += 1

        with self._lock:
            self._known_embeddings = new_known

        logger.info(f"Da load {loaded_users} user voi khuon mat da dang ky")
        return loaded_users

    def recognize(self, image_bytes: bytes) -> dict:
        """
        Nhận diện khuôn mặt từ JPEG bytes.
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
            for uid, emb_list in self._known_embeddings.items():
                for emb in emb_list:
                    sim = float(np.dot(query_emb, emb))
                    if sim > best_sim:
                        best_sim = sim
                        best_uid = uid

        matched = best_uid is not None and best_sim >= config.FACE_CONF_THRESHOLD
        return {
            "user_id":    best_uid if matched else None,
            "confidence": round(best_sim, 4),
            "matched":    matched,
        }
