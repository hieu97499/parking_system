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

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ["*"],
    allow_methods  = ["*"],
    allow_headers  = ["*"],
)

camera   = CameraManager.get()
plate_ai = PlateRecognizer.get()
face_ai  = FaceRecognizer.get()

class ImagePayload(BaseModel):
    image_b64: str

def _save_capture(image_bytes: bytes, prefix: str) -> str:
    """Lưu ảnh chụp vào CAPTURES_DIR, trả về đường dẫn tương đối."""
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
    return {"cameras": camera.list_cameras()}

class CamAssignment(BaseModel):
    entry_plate: int
    entry_face:  int
    exit_plate:  int
    exit_face:   int

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

    config.ENTRY_PLATE_CAM = payload.entry_plate
    config.ENTRY_FACE_CAM  = payload.entry_face
    config.EXIT_PLATE_CAM  = payload.exit_plate
    config.EXIT_FACE_CAM   = payload.exit_face

    return {"ok": True, "assignment": updates}

@app.get("/cameras/assignment")
def get_cam_assignment():
    """Trả về assignment hiện tại (index camera cho từng vai trò)."""
    return {
        "entry_plate": config.ENTRY_PLATE_CAM,
        "entry_face":  config.ENTRY_FACE_CAM,
        "exit_plate":  config.EXIT_PLATE_CAM,
        "exit_face":   config.EXIT_FACE_CAM,
    }

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

def _mjpeg_generator(cam_index: int):
    """Generator liên tục yield MJPEG frames từ camera.
    Dùng KEEP-pool của camera_manager – không mở VideoCapture riêng,
    tránh xung đột 2 handle trên cùng 1 camera vật lý trên Windows.

    Khi camera chưa sẵn sàng, yield placeholder JPEG đen để browser
    KHÔNG bao giờ cắt kết nối – khi camera mở được sẽ tự hiển thị video thật.
    """
    boundary = b"--frame"

    time.sleep(cam_index * 0.025)
    try:
        while True:
            data = camera.stream_frame(cam_index)
            if data:
                fps_delay = 1.0 / getattr(config, "CAMERA_FPS", 15)
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

@app.get("/stream/{cam_index}")
def stream_camera(cam_index: int):
    """MJPEG stream liên tục từ camera chỉ định."""
    return StreamingResponse(
        _mjpeg_generator(cam_index),
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
                timeout=4.0)
        except asyncio.TimeoutError:
            plate_img, plate_path = None, None
            logger.warning(f"ENTRY plate capture timeout – cam {config.ENTRY_PLATE_CAM} có thể bị hỏng")

        await asyncio.sleep(config.FACE_CAPTURE_DELAY)

        try:
            face_res = await asyncio.wait_for(
                _run_face_with_retry(config.ENTRY_FACE_CAM, "entry_face"),
                timeout=8.0)
        except asyncio.TimeoutError:
            face_res = {"user_id": None, "confidence": 0.0, "face_image_path": None}
            logger.warning(f"ENTRY face recognition timeout – cam {config.ENTRY_FACE_CAM}")

        try:
            plate_res = await asyncio.wait_for(
                _run_plate_with_retry(config.ENTRY_PLATE_CAM, "entry_plate", plate_img, plate_path),
                timeout=8.0)
        except asyncio.TimeoutError:
            plate_res = {"plate": "", "confidence": 0.0, "plate_image_path": plate_path}
            logger.warning(f"ENTRY plate recognition timeout – cam {config.ENTRY_PLATE_CAM}")

        return {
            "plate":              plate_res["plate"],
            "plate_confidence":   plate_res["confidence"],
            "plate_image_path":   plate_res["plate_image_path"],
            "face_user_id":       face_res["user_id"],
            "face_confidence":    face_res["confidence"],
            "face_image_path":    face_res["face_image_path"],
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
                timeout=4.0)
        except asyncio.TimeoutError:
            plate_img, plate_path = None, None
            logger.warning(f"EXIT plate capture timeout – cam {config.EXIT_PLATE_CAM} có thể bị hỏng")

        await asyncio.sleep(config.FACE_CAPTURE_DELAY)

        try:
            face_res = await asyncio.wait_for(
                _run_face_with_retry(config.EXIT_FACE_CAM, "exit_face"),
                timeout=8.0)
        except asyncio.TimeoutError:
            face_res = {"user_id": None, "confidence": 0.0, "face_image_path": None}
            logger.warning(f"EXIT face recognition timeout – cam {config.EXIT_FACE_CAM}")

        try:
            plate_res = await asyncio.wait_for(
                _run_plate_with_retry(config.EXIT_PLATE_CAM, "exit_plate", plate_img, plate_path),
                timeout=8.0)
        except asyncio.TimeoutError:
            plate_res = {"plate": "", "confidence": 0.0, "plate_image_path": plate_path}
            logger.warning(f"EXIT plate recognition timeout – cam {config.EXIT_PLATE_CAM}")

        return {
            "plate":              plate_res["plate"],
            "plate_confidence":   plate_res["confidence"],
            "plate_image_path":   plate_res["plate_image_path"],
            "face_user_id":       face_res["user_id"],
            "face_confidence":    face_res["confidence"],
            "face_image_path":    face_res["face_image_path"],
            "processing_time_ms": round((time.time() - t0) * 1000),
        }

@app.post("/faces/reload")
def reload_faces():
    """Reload toàn bộ khuôn mặt đã đăng ký từ uploads/faces/."""
    count = face_ai.reload_known_faces()
    return {"loaded_users": count}

@app.on_event("startup")
async def startup():
    logger.info(f"AI Service khởi động – UPLOADS_DIR={config.UPLOADS_DIR}")
    face_ai.reload_known_faces()
    import asyncio
    loop = asyncio.get_event_loop()
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
            for idx in cam_indices:
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
