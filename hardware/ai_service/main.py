"""
AI Service – FastAPI
Cổng: 5001 (mặc định)

Endpoints:
  GET  /health                   – kiểm tra trạng thái
  GET  /cameras                  – liệt kê camera có sẵn
  POST /capture/{cam_index}      – chụp ảnh từ camera chỉ định
  POST /recognize/plate          – nhận diện biển số (nhận JPEG bytes)
  POST /recognize/face           – nhận diện khuôn mặt (nhận JPEG bytes)
  POST /process/entry            – toàn bộ luồng vào (capture + plate + face)
  POST /process/exit             – toàn bộ luồng ra  (capture + plate)
  POST /faces/reload             – reload known faces từ uploads/faces/
"""

import asyncio
import base64
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import re
from typing import Union

import httpx
from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

import config
from modules.camera_manager  import CameraManager, get_placeholder_jpeg
from modules.plate_recognizer import PlateRecognizer
from modules.face_recognizer  import FaceRecognizer

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ai_worker")

_entry_semaphore = asyncio.Semaphore(1)
_exit_semaphore  = asyncio.Semaphore(1)

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger("ai_service")

app = FastAPI(title="Parking AI Service", version="1.0.0")

class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],
    allow_methods  = ["*"],
    allow_headers  = ["*"],
    expose_headers = ["*"],
)
app.add_middleware(PrivateNetworkAccessMiddleware)

camera   = CameraManager.get()
plate_ai = PlateRecognizer.get()
face_ai  = FaceRecognizer.get()

class ImagePayload(BaseModel):
    image_b64: str

def _save_capture(image_bytes: bytes, prefix: str) -> str:
    """Upload ảnh lên backend server để lưu vào disk trên server.
    Nếu thất bại (server chưa sẵn sàng), fallback lưu local."""
    b64 = base64.b64encode(image_bytes).decode()
    try:
        resp = httpx.post(
            config.BACKEND_URL.rstrip('/') + '/api/hardware/upload-image',
            json={"image_b64": b64, "prefix": prefix},
            headers={"x-hardware-key": config.HARDWARE_API_KEY},
            timeout=5.0,
        )
        if resp.status_code == 200:
            return resp.json()["path"]
        logger.warning(f"Upload ảnh: server trả {resp.status_code} – fallback local")
    except Exception as e:
        logger.warning(f"Upload ảnh lên server thất bại ({e}) – fallback lưu local")

    # fallback: lưu local (dùng khi chạy không có server)
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid      = uuid.uuid4().hex[:6]
    filename = f"{prefix}_{ts}_{uid}.jpg"
    filepath = os.path.join(config.CAPTURES_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"captures/{filename}"

def _b64_to_bytes(b64: str) -> bytes:
    """Base64 → bytes. Xử lý cả chuỗi có hoặc không có data:/ prefix."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)

@app.get("/health")
def health():
    return {
        "status":           "ok",
        "plate_model_ready": plate_ai._ready,
        "face_model_ready":  face_ai._ready,
        "known_faces_count": len(face_ai._known_embeddings),
        "timestamp":         datetime.now().isoformat(),
    }

@app.get("/cameras")
def list_cameras():
    usb_cams = camera.list_cameras()
    for c in usb_cams:
        c["source_type"] = "usb"
        c["source"] = c["index"]

    # Thu thập các RTSP URL đã cấu hình (loại trùng)
    rtsp_urls: dict[str, dict] = {}
    for attr in ("ENTRY_PLATE_CAM", "ENTRY_FACE_CAM", "EXIT_PLATE_CAM", "EXIT_FACE_CAM"):
        val = getattr(config, attr, None)
        if isinstance(val, str) and val.lower().startswith(("rtsp", "http")):
            if val not in rtsp_urls:
                # Lấy kích thước từ pool nếu đã kết nối
                with camera._get_cam_lock(val):
                    cap = camera._cameras.get(val)
                    if cap and cap.isOpened():
                        import cv2 as _cv2
                        w = int(cap.get(_cv2.CAP_PROP_FRAME_WIDTH))
                        h = int(cap.get(_cv2.CAP_PROP_FRAME_HEIGHT))
                    else:
                        w, h = 0, 0
                m = re.search(r'@([\d.]+):', val)
                ip = m.group(1) if m else re.search(r'://(.*?):', val.replace('rtsp://', '')).group(1) if '://' in val else val
                rtsp_urls[val] = {
                    "source": val,
                    "source_type": "rtsp",
                    "name": f"IP Cam {ip}",
                    "width": w,
                    "height": h,
                }

    import re as _re_local  # noqa – already imported at top level but ensure available
    return {"cameras": usb_cams + list(rtsp_urls.values())}

class CamAssignment(BaseModel):
    entry_plate: Union[int, str]
    entry_face:  Union[int, str]
    exit_plate:  Union[int, str]
    exit_face:   Union[int, str]

def _parse_cam_source(val):
    """Chuyển giá trị assignment về đúng kiểu: int cho USB, str cho RTSP."""
    if isinstance(val, int):
        return val
    try:
        return int(str(val))
    except (ValueError, TypeError):
        return str(val)

@app.get("/cameras/assignment")
def get_cam_assignment():
    """Trả về assignment hiện tại (đọc từ env/config)."""
    return {
        "entry_plate": config.ENTRY_PLATE_CAM,
        "entry_face":  config.ENTRY_FACE_CAM,
        "exit_plate":  config.EXIT_PLATE_CAM,
        "exit_face":   config.EXIT_FACE_CAM,
    }

@app.post("/cameras/assignment")
def save_cam_assignment(payload: CamAssignment):
    """Lưu assignment vào .env và cập nhật config runtime (không cần restart)."""
    env_path = Path(__file__).parent / ".env"

    lines: list[str] = []
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            lines = f.readlines()

    updates = {
        "ENTRY_PLATE_CAM": str(payload.entry_plate),
        "ENTRY_FACE_CAM":  str(payload.entry_face),
        "EXIT_PLATE_CAM":  str(payload.exit_plate),
        "EXIT_FACE_CAM":   str(payload.exit_face),
    }
    keys_written: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('#') and '=' in stripped:
            k = stripped.split('=', 1)[0].strip()
            if k in updates:
                new_lines.append(f"{k}={updates[k]}\n")
                keys_written.add(k)
                continue
        new_lines.append(line)
    for k, v in updates.items():
        if k not in keys_written:
            new_lines.append(f"{k}={v}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    config.ENTRY_PLATE_CAM = _parse_cam_source(payload.entry_plate)
    config.ENTRY_FACE_CAM  = _parse_cam_source(payload.entry_face)
    config.EXIT_PLATE_CAM  = _parse_cam_source(payload.exit_plate)
    config.EXIT_FACE_CAM   = _parse_cam_source(payload.exit_face)

    return {"ok": True, "assignment": updates}

@app.post("/capture/{cam_index}")
async def capture_single(cam_index: int):
    """Chụp ảnh từ camera theo index và trả về base64 (timeout 4s)."""
    loop = asyncio.get_event_loop()
    try:
        data = await asyncio.wait_for(
            loop.run_in_executor(_executor, camera.capture, cam_index),
            timeout=4.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail=f"Camera {cam_index} timeout")
    if data is None:
        raise HTTPException(status_code=503, detail=f"Không chụp được từ camera {cam_index}")
    return {
        "cam_index": cam_index,
        "image_b64": base64.b64encode(data).decode(),
    }

def _mjpeg_generator(cam_source):
    """Generator liên tục yield MJPEG frames từ camera.
    cam_source: int (USB index) hoặc str (RTSP URL).
    """
    boundary = b"--frame"

    if isinstance(cam_source, int):
        time.sleep(cam_source * 1.5)
    try:
        while True:
            data = camera.stream_frame(cam_source)
            if data:
                fps_delay = 1.0 / getattr(config, "STREAM_FPS", 10)
            else:

                data = get_placeholder_jpeg()
                fps_delay = 0.5
            yield (
                boundary + b"\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + data + b"\r\n"
            )
            time.sleep(fps_delay)
    except GeneratorExit:
        pass

@app.get("/stream/preview")
def stream_preview(src: str = Query(..., description="USB index (số) hoặc RTSP URL đã cấu hình")):
    """MJPEG stream preview cho modal phân công – chấp nhận USB index hoặc RTSP URL đã cấu hình."""
    configured = {
        config.ENTRY_PLATE_CAM, config.ENTRY_FACE_CAM,
        config.EXIT_PLATE_CAM,  config.EXIT_FACE_CAM,
    }
    try:
        source = int(src)
    except ValueError:
        source = src
    # Validate: chỉ cho phép nguồn đã cấu hình hoặc USB index 0-9
    if source not in configured:
        if not (isinstance(source, int) and 0 <= source <= 9):
            raise HTTPException(status_code=403, detail="Nguồn camera không được phép")
    return StreamingResponse(
        _mjpeg_generator(source),
        media_type="multipart/x-mixed-replace;boundary=frame",
    )

@app.get("/stream/{cam_index}")
def stream_camera(cam_index: int):
    """MJPEG stream liên tục từ camera theo USB index."""
    return StreamingResponse(
        _mjpeg_generator(cam_index),
        media_type="multipart/x-mixed-replace;boundary=frame",
    )

_ROLE_MAP = {
    "entry_plate": lambda: config.ENTRY_PLATE_CAM,
    "entry_face":  lambda: config.ENTRY_FACE_CAM,
    "exit_plate":  lambda: config.EXIT_PLATE_CAM,
    "exit_face":   lambda: config.EXIT_FACE_CAM,
}

@app.get("/stream/role/{role}")
def stream_role(role: str):
    """MJPEG stream từ camera được gán cho vai trò (entry_plate, entry_face, ...)."""
    if role not in _ROLE_MAP:
        raise HTTPException(status_code=404, detail=f"Role '{role}' không hợp lệ")
    source = _ROLE_MAP[role]()
    return StreamingResponse(
        _mjpeg_generator(source),
        media_type="multipart/x-mixed-replace;boundary=frame",
    )

@app.post("/recognize/plate")
def recognize_plate(payload: ImagePayload):
    """Nhận diện biển số từ ảnh base64."""
    img_bytes = _b64_to_bytes(payload.image_b64)
    result    = plate_ai.recognize(img_bytes)
    return result

@app.post("/recognize/face")
def recognize_face(payload: ImagePayload):
    """Nhận diện khuôn mặt từ ảnh base64."""
    img_bytes = _b64_to_bytes(payload.image_b64)
    result    = face_ai.recognize(img_bytes)
    return result

def _capture_img_only(cam_index: int, prefix: str) -> tuple:
    """Thread task: chỉ chụp và lưu ảnh, KHÔNG chạy AI. Trả về (bytes, path)."""
    img = camera.capture(cam_index)
    if img:
        return img, _save_capture(img, prefix)
    logger.error(f"Khong chup duoc camera {cam_index}")
    return None, None

def _capture_and_plate(cam_index: int, prefix: str) -> dict:
    """Thread task: chụp + nhận diện biển số."""
    img = camera.capture(cam_index)
    out = {"plate": "", "confidence": 0.0, "plate_image_path": None}
    if img:
        out["plate_image_path"] = _save_capture(img, prefix)
        r = plate_ai.recognize(img)
        out["plate"]      = r.get("plate", "")
        out["confidence"] = r.get("confidence", 0.0)
    else:
        logger.error(f"Khong chup duoc camera {cam_index}")
    return out

def _capture_and_face(cam_index: int, prefix: str) -> dict:
    """Thread task: chụp + nhận diện khuôn mặt."""
    img = camera.capture(cam_index)
    out = {"user_id": None, "confidence": 0.0, "face_image_path": None}
    if img:
        out["face_image_path"] = _save_capture(img, prefix)
        r = face_ai.recognize(img)
        out["user_id"]    = r.get("user_id")
        out["confidence"] = r.get("confidence", 0.0)
    else:
        logger.error(f"Khong chup duoc camera {cam_index}")
    return out

async def _run_face_with_retry(cam_idx: int, prefix: str) -> dict:
    """Chụp + nhận diện mặt, thử lại tối đa FACE_MAX_RETRIES lần nếu confidence thấp."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_executor, _capture_and_face, cam_idx, prefix)
    for attempt in range(config.FACE_MAX_RETRIES):
        if result["confidence"] >= config.FACE_CONF_THRESHOLD:
            break
        logger.info(
            f"Face retry {attempt+1}/{config.FACE_MAX_RETRIES} "
            f"(conf={result['confidence']:.3f} < {config.FACE_CONF_THRESHOLD})"
        )
        await asyncio.sleep(0.8)
        retry = await loop.run_in_executor(_executor, _capture_and_face, cam_idx, f"{prefix}_r{attempt+1}")
        if retry["confidence"] > result["confidence"]:
            result = retry
    return result

async def _run_plate_with_retry(cam_idx: int, prefix: str, first_img: bytes, first_path: str) -> dict:
    """Chạy OCR trên ảnh đã chụp sẵn; nếu confidence thấp, chụp lại + OCR thêm."""
    loop = asyncio.get_event_loop()
    result = {"plate": "", "confidence": 0.0, "plate_image_path": first_path}
    if first_img:
        r = await loop.run_in_executor(_executor, plate_ai.recognize, first_img)
        result["plate"]      = r.get("plate", "")
        result["confidence"] = r.get("confidence", 0.0)

    for attempt in range(config.PLATE_MAX_RETRIES):
        if result["confidence"] >= config.PLATE_CONF_THRESHOLD:
            break
        logger.info(
            f"Plate retry {attempt+1}/{config.PLATE_MAX_RETRIES} "
            f"(conf={result['confidence']:.3f} < {config.PLATE_CONF_THRESHOLD})"
        )
        await asyncio.sleep(0.5)
        new_img, new_path = await loop.run_in_executor(
            _executor, _capture_img_only, cam_idx, f"{prefix}_r{attempt+1}")
        if new_img:
            r2 = await loop.run_in_executor(_executor, plate_ai.recognize, new_img)
            if r2.get("confidence", 0.0) > result["confidence"]:
                result = {
                    "plate":              r2.get("plate", ""),
                    "confidence":         r2.get("confidence", 0.0),
                    "plate_image_path":   new_path,
                }
    return result

@app.post("/process/entry")
async def process_entry():
    """
    Luồng vào – chạy song song với exit:
    _entry_semaphore đảm bảo chỉ 1 request vào chạy tại một lúc (tránh double-trigger).
      1. Chụp biển số ngay (camera capture, ~100ms)
      2. Chờ FACE_CAPTURE_DELAY giây cho người đứng đúng vị trí
      3. Nhận diện mặt (AI nhẹ, ~300ms, có retry)
      4. Nhận diện biển số SAU khi face xong (AI nặng OCR, không bị giành tài nguyên)
    """
    async with _entry_semaphore:
        t0   = time.time()
        loop = asyncio.get_event_loop()

        try:
            plate_img, plate_path = await asyncio.wait_for(
                loop.run_in_executor(_executor, _capture_img_only, config.ENTRY_PLATE_CAM, "entry_plate"),
                timeout=12.0)
        except asyncio.TimeoutError:
            plate_img, plate_path = None, None
            logger.warning(f"ENTRY plate capture timeout – cam {config.ENTRY_PLATE_CAM} có thể bị hỏng")

        await asyncio.sleep(config.FACE_CAPTURE_DELAY)

        try:
            face_res = await asyncio.wait_for(
                _run_face_with_retry(config.ENTRY_FACE_CAM, "entry_face"),
                timeout=20.0)
        except asyncio.TimeoutError:
            face_res = {"user_id": None, "confidence": 0.0, "face_image_path": None}
            logger.warning(f"ENTRY face recognition timeout – cam {config.ENTRY_FACE_CAM}")

        try:
            plate_res = await asyncio.wait_for(
                _run_plate_with_retry(config.ENTRY_PLATE_CAM, "entry_plate", plate_img, plate_path),
                timeout=20.0)
        except asyncio.TimeoutError:
            plate_res = {"plate": "", "confidence": 0.0, "plate_image_path": plate_path}
            logger.warning(f"ENTRY plate recognition timeout – cam {config.ENTRY_PLATE_CAM}")

        no_object = (not plate_res["plate"]) and (face_res["user_id"] is None)
        if no_object:
            logger.warning("ENTRY: Khong co doi tuong nhan dien (khung hinh trong)")

        return {
            "plate":              plate_res["plate"],
            "plate_confidence":   plate_res["confidence"],
            "plate_image_path":   plate_res["plate_image_path"],
            "face_user_id":       face_res["user_id"],
            "face_confidence":    face_res["confidence"],
            "face_image_path":    face_res["face_image_path"],
            "no_object":          no_object,
            "message":            "Không có đối tượng nhận diện" if no_object else "",
            "processing_time_ms": round((time.time() - t0) * 1000),
        }

@app.post("/process/exit")
async def process_exit():
    """
    Luồng ra – chạy song song với entry:
    _exit_semaphore đảm bảo chỉ 1 request ra chạy tại một lúc (tránh double-trigger).
    """
    async with _exit_semaphore:
        t0   = time.time()
        loop = asyncio.get_event_loop()

        try:
            plate_img, plate_path = await asyncio.wait_for(
                loop.run_in_executor(_executor, _capture_img_only, config.EXIT_PLATE_CAM, "exit_plate"),
                timeout=12.0)
        except asyncio.TimeoutError:
            plate_img, plate_path = None, None
            logger.warning(f"EXIT plate capture timeout – cam {config.EXIT_PLATE_CAM} có thể bị hỏng")

        await asyncio.sleep(config.FACE_CAPTURE_DELAY)

        try:
            face_res = await asyncio.wait_for(
                _run_face_with_retry(config.EXIT_FACE_CAM, "exit_face"),
                timeout=20.0)
        except asyncio.TimeoutError:
            face_res = {"user_id": None, "confidence": 0.0, "face_image_path": None}
            logger.warning(f"EXIT face recognition timeout – cam {config.EXIT_FACE_CAM}")

        try:
            plate_res = await asyncio.wait_for(
                _run_plate_with_retry(config.EXIT_PLATE_CAM, "exit_plate", plate_img, plate_path),
                timeout=20.0)
        except asyncio.TimeoutError:
            plate_res = {"plate": "", "confidence": 0.0, "plate_image_path": plate_path}
            logger.warning(f"EXIT plate recognition timeout – cam {config.EXIT_PLATE_CAM}")

        no_object = (not plate_res["plate"]) and (face_res["user_id"] is None)
        if no_object:
            logger.warning("EXIT: Khong co doi tuong nhan dien (khung hinh trong)")

        return {
            "plate":              plate_res["plate"],
            "plate_confidence":   plate_res["confidence"],
            "plate_image_path":   plate_res["plate_image_path"],
            "face_user_id":       face_res["user_id"],
            "face_confidence":    face_res["confidence"],
            "face_image_path":    face_res["face_image_path"],
            "no_object":          no_object,
            "message":            "Không có đối tượng nhận diện" if no_object else "",
            "processing_time_ms": round((time.time() - t0) * 1000),
        }

@app.post("/faces/reload")
def reload_faces(force: bool = False):
    """
    Smart sync khuôn mặt từ server.
    - Mặc định: thử tải embeddings từ DB (nhanh), fallback tải ảnh nếu cần.
    - ?force=true : bỏ qua DB cache, tải lại ảnh và tính embedding mới.
    """
    if force:
        face_ai.sync_from_backend()
        count = face_ai.reload_known_faces()
        face_ai.upload_embeddings_to_backend()
    else:
        count = face_ai.smart_sync()
    return {"loaded_users": count}

@app.on_event("startup")
async def startup():
    logger.info(f"AI Service khởi động – BACKEND_URL={config.BACKEND_URL}")
    face_ai.smart_sync()
    import asyncio
    loop = asyncio.get_event_loop()

    # Auto-sync khuôn mặt định kỳ để bắt user mới đăng ký trên WebApp
    sync_interval = getattr(config, "FACE_SYNC_INTERVAL", 60)
    if sync_interval and sync_interval > 0:
        import threading
        def _face_autosync():
            while True:
                time.sleep(sync_interval)
                try:
                    n = face_ai.smart_sync()
                    logger.debug(f"auto-sync: {n} user trong cache")
                except Exception as e:
                    logger.warning(f"auto-sync face thất bại: {e}")
        threading.Thread(target=_face_autosync, daemon=True).start()
        logger.info(f"Face auto-sync bật, mỗi {sync_interval}s")

    cam_indices = list({
        config.ENTRY_PLATE_CAM, config.ENTRY_FACE_CAM,
        config.EXIT_PLATE_CAM,  config.EXIT_FACE_CAM,
    })

    from modules.camera_manager import CAPTURE_MODE as _CAP_MODE

    if _CAP_MODE == "KEEP":

        startup_delay = getattr(config, "CAMERA_STARTUP_DELAY", 3.0)
        logger.info(f"Chờ {startup_delay}s cho Windows khởi tạo camera driver...")
        await asyncio.sleep(startup_delay)

        await loop.run_in_executor(_executor, camera.warm_cameras, cam_indices)

        import threading
        def _open_cameras_staggered():
            # Chỉ pre-open USB integer cameras; RTSP tự kết nối khi stream_frame được gọi
            int_cams = sorted(idx for idx in cam_indices if isinstance(idx, int))
            for idx in int_cams:
                time.sleep(2.0)
                try:
                    camera.stream_frame(idx)
                    logger.info(f"Camera {idx} pre-opened for stream OK")
                except Exception as e:
                    logger.warning(f"Camera {idx} pre-open failed: {e}")
        threading.Thread(target=_open_cameras_staggered, daemon=True).start()

        _cam_fail_at:    dict = {}
        _cam_fail_count: dict = {}
        def _cam_keepalive():
            while True:
                time.sleep(0.5)
                now = time.time()
                for idx in cam_indices:
                    failures = _cam_fail_count.get(idx, 0)
                    backoff = min(5.0 * (2 ** min(failures, 3)), 60.0)
                    if now - _cam_fail_at.get(idx, 0) < backoff:
                        continue

                    if idx in camera._aliased_indices:
                        camera._aliased_indices.discard(idx)
                        logger.info(f"Camera {idx} thử lại sau khi bị aliased (user có thể cắm thêm cam)")
                    try:
                        result = camera.stream_frame(idx)
                        if result is None:
                            logger.warning(f"Camera {idx} keepalive None – retry sau {min(backoff*2,60):.0f}s")
                            _cam_fail_at[idx]    = now
                            _cam_fail_count[idx] = failures + 1
                        else:
                            _cam_fail_count[idx] = 0
                    except Exception as e:
                        logger.warning(f"Camera {idx} keepalive lỗi: {e}")
                        _cam_fail_at[idx]    = now
                        _cam_fail_count[idx] = failures + 1
        threading.Thread(target=_cam_keepalive, daemon=True).start()
    else:

        logger.info("LAZY mode – bỏ qua keepalive/staggered (USB hub mode)")

@app.on_event("shutdown")
async def shutdown():
    camera.release_all()
    logger.info("AI Service đã dừng")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.AI_HOST, port=config.AI_PORT, reload=False)
