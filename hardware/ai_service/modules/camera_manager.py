import cv2
import time
import logging
import threading
from threading import Lock
from typing import Optional
import config

_PLACEHOLDER_JPEG: Optional[bytes] = None

def get_placeholder_jpeg() -> bytes:
    """Trả về JPEG đen nhỏ (lazy-init). Thread-safe vì GIL bảo vệ phép gán bytes."""
    global _PLACEHOLDER_JPEG
    if _PLACEHOLDER_JPEG is None:
        try:
            import numpy as np
            black = np.zeros((240, 320, 3), dtype=np.uint8)
            _, buf = cv2.imencode(".jpg", black, [cv2.IMWRITE_JPEG_QUALITY, 50])
            _PLACEHOLDER_JPEG = buf.tobytes()
        except Exception:

            _PLACEHOLDER_JPEG = (
                b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
                b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
                b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
                b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x1e>\x00"
                b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00"
                b"\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00"
                b"\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00"
                b"\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00"
                b"\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07\"q\x142\x81"
                b"\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19"
                b"\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz"
                b"\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99"
                b"\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7"
                b"\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5"
                b"\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1"
                b"\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00"
                b"\x00?\x00\xfb\xd4P\x00\x00\x00\x1f\xff\xd9"
            )
    return _PLACEHOLDER_JPEG

logger = logging.getLogger(__name__)

CAPTURE_MODE = getattr(config, "CAPTURE_MODE", "LAZY")

WARMUP_FRAMES = getattr(config, "WARMUP_FRAMES", 5)

class CameraManager:
    """
    Quản lý 4 webcam USB Full HD.

    Chế độ LAZY (mặc định, khuyến nghị khi dùng hub):
      - Mỗi lần capture: mở camera → warm-up → chụp → ĐÓNG NGAY
      - USB bandwidth = 0 giữa các lần chụp
      - Phù hợp trigger-based (chỉ chụp khi sensor báo có xe)
      - Overhead ~0.8-1.5s mỗi lần mở (chấp nhận được vì xe đã dừng chờ)

    Chế độ KEEP:
      - Camera giữ mở liên tục, stream ngầm
      - Capture nhanh hơn (~50ms) nhưng tốn USB bandwidth 24/7
    """

    _instance: Optional["CameraManager"] = None

    def __init__(self):
        self._cameras: dict[int, cv2.VideoCapture] = {}
        self._lock     = Lock()
        self._cam_locks: dict[int, Lock] = {}
        self._init_lock = Lock()

        self._msmf_pending: dict[int, threading.Thread] = {}

        self._msmf_timeout_count: dict[int, int] = {}

        self._aliased_indices: set[int] = set()

        self._cam_fingerprints: dict[int, bytes] = {}
        logger.info(f"CameraManager khoi dong, che do: {CAPTURE_MODE}")

    @classmethod
    def get(cls) -> "CameraManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_cam_lock(self, cam_index: int) -> Lock:
        """Lấy lock riêng cho từng camera – tạo mới nếu chưa có."""
        if cam_index not in self._cam_locks:
            self._cam_locks[cam_index] = Lock()
        return self._cam_locks[cam_index]

    def _open_cap(self, cam_index: int) -> cv2.VideoCapture:
        """Mở camera và đặt độ phân giải.
        Dùng DSHOW trước (ổn định hơn MSMF khi stream đa camera liên tục),
        fallback sang MSMF nếu DSHOW không hỗ trợ camera cụ thể.
        """
        delays = [0, 1.5]
        for wait in delays:
            if wait:
                time.sleep(wait)
            for backend, name in [(cv2.CAP_DSHOW, "DSHOW"), (cv2.CAP_MSMF, "MSMF")]:
                cap = self._try_open_cap(cam_index, backend, timeout=3.0)
                if cap is None or not cap.isOpened():
                    if cap is not None:
                        try: cap.release()
                        except Exception: pass
                    continue

                native_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                native_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                if native_w >= config.CAMERA_WIDTH and native_h >= config.CAMERA_HEIGHT:

                    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  config.CAMERA_WIDTH)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)

                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FPS, getattr(config, "CAMERA_FPS", 15))
                final_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                final_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                logger.info(f"Camera {cam_index} mo OK [{name}] "
                            f"native={native_w}x{native_h} → {final_w}x{final_h}")
                return cap
        raise RuntimeError(f"Khong mo duoc camera index={cam_index} sau {len(delays)} lan")

    def _try_open_cap(self, cam_index: int, backend: int, timeout: float = 3.0) -> Optional[cv2.VideoCapture]:
        """Mở VideoCapture trong thread riêng với timeout để tránh MSMF treo vô hạn.

        Với MSMF: nếu thread cũ vẫn đang pending (zombie), bỏ qua và trả None.
        Sau 2 lần MSMF timeout, tự động bỏ qua MSMF cho camera đó.
        """
        is_msmf = (backend == cv2.CAP_MSMF)

        if is_msmf:

            if self._msmf_timeout_count.get(cam_index, 0) >= 2:
                return None

            prev = self._msmf_pending.get(cam_index)
            if prev and prev.is_alive():
                logger.debug(f"Camera {cam_index} MSMF thread still alive – skip new open")
                return None

        result: list = [None]
        exc:    list = [None]

        def _do():
            try:
                result[0] = cv2.VideoCapture(cam_index, backend)
            except Exception as e:
                exc[0] = e

        t = threading.Thread(target=_do, daemon=True)
        if is_msmf:
            self._msmf_pending[cam_index] = t
        t.start()
        t.join(timeout)
        if t.is_alive():
            logger.warning(f"Camera {cam_index} backend={backend} open timeout after {timeout}s")
            if is_msmf:
                self._msmf_timeout_count[cam_index] = self._msmf_timeout_count.get(cam_index, 0) + 1
            return None
        if exc[0]:
            return None

        if result[0] and result[0].isOpened() and is_msmf:
            self._msmf_timeout_count[cam_index] = 0
        return result[0]

    def _warmup(self, cap: cv2.VideoCapture, n: int = WARMUP_FRAMES):
        """Chờ MSMF pipeline sẵn sàng. Retry tối đa 8 lần × 0.1s = 0.8 giây."""
        time.sleep(0.05)
        for attempt in range(8):
            ret, frame = cap.read()
            if ret and frame is not None:

                for _ in range(max(0, n - 1)):
                    cap.read()
                return
            time.sleep(0.1)

    def capture(self, cam_index: int, retries: int = 3) -> Optional[bytes]:
        """
        Chụp 1 frame từ camera.
        Trả về JPEG bytes hoặc None nếu thất bại.
        """
        if CAPTURE_MODE == "LAZY":
            return self._capture_lazy(cam_index, retries)
        else:
            return self._capture_keep(cam_index, retries)

    @staticmethod
    def _frame_fingerprint(frame) -> bytes:
        """Resize về 8×8 grayscale, dùng để so sánh frame hai camera.
        Nếu fingerprint gần giống nhau → camera bị aliased (cùng thiết bị, index khác)."""
        small = cv2.resize(frame, (8, 8))
        gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        return bytes(gray.flatten().tolist())

    @staticmethod
    def _fingerprints_aliased(fp1: bytes, fp2: bytes) -> bool:
        """So sánh 2 fingerprint – True nếu rất giống nhau (aliased MSMF).
        Ngưỡng 0.5% – chỉ bắt aliased thật sự (diff ≈ 0).
        Hai camera khác nhau cùng chụp 1 phòng luôn có noise RGB khác nhau, diff > ngưỡng."""
        if len(fp1) != len(fp2):
            return False
        diff = sum(abs(a - b) for a, b in zip(fp1, fp2))

        return diff < 81

    def _capture_lazy(self, cam_index: int, retries: int) -> Optional[bytes]:
        """Mở → warm-up → chụp → đóng.
        Dùng per-camera lock để các cam KHÁC nhau có thể chụp song song.
        """
        with self._get_cam_lock(cam_index):
            for attempt in range(retries):
                cap = None
                try:
                    cap = self._open_cap(cam_index)
                    self._warmup(cap)

                    ret, frame = cap.read()
                    if not ret or frame is None:
                        raise RuntimeError("Doc frame that bai")

                    _, buf = cv2.imencode(".jpg", frame,
                                         [cv2.IMWRITE_JPEG_QUALITY, 95])
                    return buf.tobytes()

                except Exception as e:
                    logger.warning(f"Camera {cam_index} lan {attempt+1}: {e}")
                    time.sleep(0.3)
                finally:
                    if cap is not None:
                        cap.release()

            logger.error(f"Camera {cam_index}: chup that bai sau {retries} lan")
            return None

    def _capture_keep(self, cam_index: int, retries: int) -> Optional[bytes]:
        """Giữ camera mở liên tục – mỗi camera có lock riêng, 2 cam chụp song song."""
        lock = self._get_cam_lock(cam_index)
        for attempt in range(retries):
            try:

                with lock:
                    if (cam_index not in self._cameras
                            or not self._cameras[cam_index].isOpened()):

                        pass
                    else:
                        cap = self._cameras[cam_index]
                        ret, frame = cap.read()
                        if not ret or frame is None:
                            raise RuntimeError("Doc frame that bai")
                        _, buf = cv2.imencode(".jpg", frame,
                                             [cv2.IMWRITE_JPEG_QUALITY, 90])
                        return buf.tobytes()

                with self._init_lock:
                    with lock:
                        if (cam_index not in self._cameras
                                or not self._cameras[cam_index].isOpened()):
                            self._cameras[cam_index] = self._open_cap(cam_index)
                            self._warmup(self._cameras[cam_index])
                    with lock:
                        cap = self._cameras[cam_index]
                        ret, frame = cap.read()
                        if not ret or frame is None:
                            raise RuntimeError("Doc frame that bai")
                        _, buf = cv2.imencode(".jpg", frame,
                                             [cv2.IMWRITE_JPEG_QUALITY, 90])
                        return buf.tobytes()

            except Exception as e:
                logger.warning(f"Camera {cam_index} lan {attempt+1}: {e}")
                with lock:
                    if cam_index in self._cameras:
                        try: self._cameras[cam_index].release()
                        except Exception: pass
                        del self._cameras[cam_index]
                time.sleep(0.2)

        logger.error(f"Camera {cam_index}: chup that bai sau {retries} lan")
        return None

    def warm_cameras(self, cam_indices: list):
        """Pre-open các camera ở chế độ KEEP khi khởi động – lần capture đầu sẽ nhanh.
        Kiểm tra frame thực để loại bỏ camera "mở được nhưng không đọc được frame".
        Dùng _init_lock để tuần tự hoá: tránh DSHOW/Windows bị quá tải khi mở 4 cam cùng lúc.
        Retry tối đa MAX_RETRIES lần với 2s nghỉ giữa mỗi lần.
        """
        if CAPTURE_MODE != "KEEP":
            return
        MAX_WARM_RETRIES = 3
        for idx in sorted(cam_indices):
            success = False
            for attempt in range(MAX_WARM_RETRIES):
                cap = None
                try:
                    with self._init_lock:
                        cap = self._open_cap(idx)

                        ok = False
                        for _ in range(WARMUP_FRAMES + 5):
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                ok = True
                                break
                            time.sleep(0.1)
                        if not ok:
                            raise RuntimeError(f"Camera {idx} opened but no frames (broken pipeline)")

                        fp_new = self._frame_fingerprint(frame)
                        for open_idx, fp_existing in self._cam_fingerprints.items():
                            if self._fingerprints_aliased(fp_new, fp_existing):
                                raise RuntimeError(
                                    f"Camera {idx} bị aliased với camera {open_idx} "
                                    f"(DSHOW wraparound – chỉ {len(self._cam_fingerprints)} cam vật lý)"
                                )
                        lock = self._get_cam_lock(idx)
                        with lock:
                            self._cameras[idx] = cap
                            cap = None
                        self._cam_fingerprints[idx] = fp_new
                    logger.info(f"Camera {idx} pre-warmed OK (attempt {attempt + 1})")
                    success = True
                    break
                except Exception as e:
                    logger.warning(f"Camera {idx} warm attempt {attempt + 1}/{MAX_WARM_RETRIES}: {e}")
                    if cap is not None:
                        try: cap.release()
                        except Exception: pass
                    if attempt < MAX_WARM_RETRIES - 1:
                        time.sleep(2.0)
            if not success:
                self._aliased_indices.add(idx)
                logger.error(f"Camera {idx} warm thất bại sau {MAX_WARM_RETRIES} lần – sẽ hiển thị màn đen")

    def stream_frame(self, cam_index: int) -> Optional[bytes]:
        """Đọc 1 frame từ KEEP-pool để phát MJPEG.

        Fast path: camera đã có trong pool → đọc trực tiếp (nhanh).
        Slow path: camera chưa/đã hỏng → mở qua _init_lock (tuần tự,
          tránh MSMF bị quá tải khi 4 stream khởi động cùng lúc).
        Camera bị aliased (DSHOW wraparound) → trả None ngay (→ placeholder đen).
        """

        if cam_index in self._aliased_indices:
            return None

        cam_lock = self._get_cam_lock(cam_index)

        with cam_lock:
            cap = self._cameras.get(cam_index)
            if cap and cap.isOpened():
                try:
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        _, buf = cv2.imencode(".jpg", frame,
                                             [cv2.IMWRITE_JPEG_QUALITY, 80])
                        return buf.tobytes()
                except Exception as e:
                    logger.warning(f"stream_frame read cam{cam_index}: {e}")

                try:
                    self._cameras[cam_index].release()
                except Exception:
                    pass
                del self._cameras[cam_index]

        with self._init_lock:
            with cam_lock:

                cap = self._cameras.get(cam_index)
                if not cap or not cap.isOpened():
                    try:
                        cap = self._open_cap(cam_index)
                        self._warmup(cap)

                        ret_a, frame_a = cap.read()
                        if ret_a and frame_a is not None:
                            fp_new = self._frame_fingerprint(frame_a)
                            for open_idx, fp_existing in self._cam_fingerprints.items():
                                if self._fingerprints_aliased(fp_new, fp_existing):
                                    cap.release()
                                    self._aliased_indices.add(cam_index)
                                    logger.warning(
                                        f"stream_frame cam{cam_index} aliased với cam{open_idx} "
                                        f"(DSHOW wraparound) – đánh dấu placeholder"
                                    )
                                    return None
                            self._cam_fingerprints[cam_index] = fp_new
                        self._cameras[cam_index] = cap
                    except Exception as e:
                        logger.warning(f"stream_frame init cam{cam_index}: {e}")
                        self._aliased_indices.add(cam_index)
                        return None

        with cam_lock:
            cap = self._cameras.get(cam_index)
            if cap and cap.isOpened():
                try:
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        _, buf = cv2.imencode(".jpg", frame,
                                             [cv2.IMWRITE_JPEG_QUALITY, 80])
                        return buf.tobytes()
                except Exception as e:
                    logger.warning(f"stream_frame first-read cam{cam_index}: {e}")
        return None

    def release_all(self):
        """Đóng tất cả camera đang mở (KEEP mode)."""
        for idx in list(self._cameras.keys()):
            lock = self._get_cam_lock(idx)
            with lock:
                try:
                    self._cameras[idx].release()
                except Exception:
                    pass
        self._cameras.clear()

    def list_cameras(self) -> list[dict]:
        """Trả về danh sách camera có sẵn (index 0-5).

        KEEP mode: chỉ báo cáo camera đang hoạt động trong pool (không thử mở mới,
          tránh hanging khi có camera bị hỏng phần cứng).
        LAZY mode: probe nhanh với _try_open_cap (1s timeout), kiểm tra frame.
        """
        result = []

        if CAPTURE_MODE == "KEEP":

            seen_fingerprints: list = []
            for i in range(6):
                cam_lock = self._get_cam_lock(i)
                acquired = cam_lock.acquire(blocking=True, timeout=2.0)
                if not acquired:
                    continue
                try:
                    cap = self._cameras.get(i)
                    if cap and cap.isOpened():

                        frames = []
                        for _ in range(6):
                            ret, frm = cap.read()
                            if ret and frm is not None:
                                frames.append(frm)
                                if len(frames) >= 2:
                                    break
                            time.sleep(0.05)
                        if frames:
                            fp = self._frame_fingerprint(frames[0])
                            fp2_temp = self._frame_fingerprint(frames[1]) if len(frames) >= 2 else fp
                            temporal_diff = sum(abs(a - b) for a, b in zip(fp, fp2_temp))
                            aliased = (any(self._fingerprints_aliased(fp, prev)
                                          for prev in seen_fingerprints)
                                       and temporal_diff < 5)
                            if not aliased:
                                seen_fingerprints.append(fp)
                                result.append({
                                    "index": i,
                                    "width":  int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                                    "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                                })
                    else:

                        probe = self._try_open_cap(i, cv2.CAP_MSMF, timeout=1.5)
                        if probe is None or not probe.isOpened():
                            if probe: probe.release()
                            probe = self._try_open_cap(i, cv2.CAP_DSHOW, timeout=1.5)
                        if probe and probe.isOpened():
                            frames = []
                            for _ in range(10):
                                ret, frm = probe.read()
                                if ret and frm is not None:
                                    frames.append(frm)
                                    if len(frames) >= 2:
                                        break
                                time.sleep(0.08)
                            if frames:
                                fp = self._frame_fingerprint(frames[0])
                                fp2_temp = self._frame_fingerprint(frames[1]) if len(frames) >= 2 else fp
                                temporal_diff = sum(abs(a - b) for a, b in zip(fp, fp2_temp))
                                aliased = (any(self._fingerprints_aliased(fp, prev)
                                              for prev in seen_fingerprints)
                                           and temporal_diff < 5)
                                if not aliased:
                                    seen_fingerprints.append(fp)
                                    result.append({
                                        "index": i,
                                        "width":  int(probe.get(cv2.CAP_PROP_FRAME_WIDTH)),
                                        "height": int(probe.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                                    })
                            probe.release()
                        elif probe:
                            probe.release()
                        time.sleep(0.5)
                finally:
                    cam_lock.release()
        else:

            seen_fingerprints: list = []
            time.sleep(0.3)
            for i in range(6):
                cam_lock = self._get_cam_lock(i)
                acquired = cam_lock.acquire(blocking=True, timeout=2.0)
                if not acquired:
                    logger.debug(f"list_cameras: cam {i} lock timeout – bỏ qua")
                    continue
                try:
                    cap = self._try_open_cap(i, cv2.CAP_MSMF, timeout=1.5)
                    if cap is None or not cap.isOpened():
                        if cap: cap.release()
                        cap = self._try_open_cap(i, cv2.CAP_DSHOW, timeout=1.5)
                    if cap and cap.isOpened():

                        frames = []
                        for _ in range(12):
                            ret, frm = cap.read()
                            if ret and frm is not None:
                                frames.append(frm)
                                if len(frames) >= 2:
                                    break
                            time.sleep(0.08)

                        if frames:
                            fp = self._frame_fingerprint(frames[0])

                            if len(frames) >= 2:
                                fp2_temp = self._frame_fingerprint(frames[1])
                                temporal_diff = sum(abs(a - b) for a, b in zip(fp, fp2_temp))
                            else:
                                temporal_diff = 99

                            aliased_by_spatial  = any(self._fingerprints_aliased(fp, prev)
                                                      for prev in seen_fingerprints)

                            truly_aliased = aliased_by_spatial and (temporal_diff < 5)

                            if truly_aliased:
                                logger.info(
                                    f"Camera {i}: MSMF aliased được phát hiện "
                                    f"(spatial_match=True, temporal_diff={temporal_diff}) – bỏ qua")
                            else:
                                seen_fingerprints.append(fp)
                                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                                result.append({"index": i, "width": w, "height": h})
                        cap.release()
                    elif cap:
                        cap.release()

                    time.sleep(0.5)
                finally:
                    cam_lock.release()
        return result

