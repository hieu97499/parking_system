"""
Nhan dien bien so xe (ANPR) – toi uu cho bien so Viet Nam 2 dong
  Buoc 1: Tim vung bien so bang contour detection (khong can YOLO)
  Buoc 2: Crop + upscale + bilateral filter + unsharp mask + CLAHE
  Buoc 3: Thu EasyOCR voi nhieu bien the xu ly anh (CLAHE, Otsu, adaptive)
           → Tra ve ngay khi dat bien so hop le + conf >= 0.65
  Buoc 4: Neu EasyOCR that bai hoan toan → doctr (fallback chậm)
  Fallback: OCR toan frame neu khong detect duoc ROI
"""

import re
import cv2
import numpy as np
import logging
import base64
import subprocess
import json
import sys
import os
from threading import Lock, Thread
from queue import Queue, Empty
import config

logger = logging.getLogger(__name__)

class PlateRecognizer:
    _instance = None

    def __init__(self):
        self._ocr    = None
        self._ready  = False
        self._lock   = Lock()
        self._paddle_proc = None
        self._load_models()

    @classmethod
    def get(cls) -> "PlateRecognizer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_models(self):

        self._ocr = None
        try:
            import easyocr
            self._ocr = easyocr.Reader(["en"], gpu=True, verbose=False)
            _blank = np.ones((64, 200, 3), np.uint8) * 255
            self._ocr.readtext(_blank, detail=0)
            logger.info("Plate OCR (EasyOCR) da san sang")
        except Exception as e:
            logger.error(f"Loi load EasyOCR: {e}")

        self._doctr = None
        try:
            from doctr.models import ocr_predictor
            self._doctr = ocr_predictor(
                det_arch='db_resnet50', reco_arch='crnn_vgg16_bn', pretrained=True
            )
            self._doctr([np.ones((64, 200, 3), np.uint8) * 255])
            logger.info("Plate OCR (doctr) da san sang")
        except Exception as e:
            logger.warning(f"doctr khong kha dung: {e}")

        self._ready = self._ocr is not None

        self._paddle_proc = None
        import threading
        threading.Thread(target=self._start_paddle_worker, daemon=True).start()

    def _start_paddle_worker(self):
        try:
            import time
            worker_path = os.path.join(os.path.dirname(__file__), 'paddle_worker.py')
            _log_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
            os.makedirs(_log_dir, exist_ok=True)
            _stderr_log = open(os.path.join(_log_dir, 'paddle_worker.log'), 'w', encoding='utf-8')
            proc = subprocess.Popen(
                [sys.executable, worker_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=_stderr_log,
                text=True,
                bufsize=1,
                env={**os.environ,
                     'PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK': 'True',
                     'PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT': '0'},
            )

            deadline = time.time() + 90
            while time.time() < deadline:
                if proc.poll() is not None:
                    logger.warning("PaddleOCR worker ket thuc som")
                    return
                line = proc.stdout.readline()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if msg.get("status") == "ready":
                        with self._lock:
                            self._paddle_proc = proc
                            self._ready = True
                        logger.info("Plate OCR (PaddleOCR subprocess) da san sang")
                        return
                except Exception:
                    pass
            logger.warning("PaddleOCR subprocess timeout – tat process")
            proc.terminate()
        except Exception as e:
            logger.warning(f"Khong the khoi dong PaddleOCR subprocess: {e}")

    def _normalize_plate(self, text: str) -> str:
        """
        Chuan hoa bien so Viet Nam, sua loi OCR pho bien.
        Dinh dang moi: XX[A-Z][0-9]-XXXXX  vd: 15B4-06744
        Dinh dang cu:  XX[A-Z]-XXXXX        vd: 51A-12345
        """

        CHAR_FIX = str.maketrans({
            'O': '0', 'Q': '0', 'D': '0',
            'I': '1', 'L': '1', '|': '1',
            'Z': '2', 'G': '6', 'T': '7',
            'B': '8', 'S': '5', '$': '5',
        })

        DIGIT_TO_CHAR = str.maketrans({
            '0': 'D',
            '1': 'T',
            '5': 'S',
            '6': 'G',
            '8': 'B',
            '7': 'T',
            '9': 'G',
            '4': 'A',
            '3': 'E',
            '2': 'Z',
        })

        SERIES_FIX = {
            'I': 'T',
            'J': 'T',
            'O': 'D',
        }

        if '|' in text:
            parts     = text.split('|', 1)
            raw1      = re.sub(r'[^A-Z0-9]', '', parts[0].upper())
            raw2      = re.sub(r'[^A-Z0-9]', '', parts[1].upper())
            if len(raw1) >= 3 and len(raw2) >= 3:
                q0 = raw1[0].translate(CHAR_FIX)
                q1 = raw1[1].translate(CHAR_FIX)
                q2 = raw1[2] if not raw1[2].isdigit() else raw1[2].translate(DIGIT_TO_CHAR)
                q2 = SERIES_FIX.get(q2, q2)
                if len(raw1) >= 4:
                    q3     = raw1[3].translate(CHAR_FIX)
                    prefix = q0 + q1 + q2 + q3
                else:
                    prefix = q0 + q1 + q2
                suffix = re.sub(r'[^0-9]', '', raw2.translate(CHAR_FIX))
                if suffix:
                    return f"{prefix}-{suffix}"

        raw = re.sub(r'[^A-Z0-9]', '', text.upper())
        if len(raw) < 4:
            return raw

        p0 = raw[0].translate(CHAR_FIX)
        p1 = raw[1].translate(CHAR_FIX)
        p2 = raw[2] if not raw[2].isdigit() else raw[2].translate(DIGIT_TO_CHAR)
        p2 = SERIES_FIX.get(p2, p2)
        rest = raw[3:]

        if rest and rest[0].isdigit() and len(rest) >= 4:
            p3     = rest[0].translate(CHAR_FIX)
            prefix = p0 + p1 + p2 + p3
            suffix = re.sub(r'[^0-9]', '', rest[1:].translate(CHAR_FIX))

        else:
            prefix = p0 + p1 + p2
            suffix = re.sub(r'[^0-9]', '', rest.translate(CHAR_FIX))

        return f"{prefix}-{suffix}" if suffix else prefix

    _PLATE_RE = re.compile(
        r'^(\d{2}[A-Z]\d-\d{4,5}|\d{2}[A-Z]-\d{4,5}|\d{2}[A-Z]{2}-\d{4,5})$'
    )

    def _is_valid_plate(self, text: str) -> bool:
        return bool(self._PLATE_RE.match(text))

    def _alt_no_subseries(self, plate: str) -> str:
        """
        Neu bien so dang XX[L]0-XXXX (chu so phu = 0, kha hiem trong VN),
        thi '0' co the la '3' hoac 'O' bi OCR nham.
        Tra ve candidate XX[L]-0XXXX (5 chu so, khong co chu so phu).
        """
        m = re.match(r'^(\d{2}[A-Z])0-(\d{4})$', plate)
        if m:
            return f"{m.group(1)}-0{m.group(2)}"
        return ""

    def _find_plate_roi(self, image: np.ndarray):
        """
        Tim vung bien so bang contour detection.
        Bien so VN: nen trang/vang, ty le chieu rong/cao ~2:1 (xe may) hoac ~3.3:1 (o to).
        Tra ve (roi_img, x, y, w, h) hoac None.
        """
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        blur = cv2.GaussianBlur(enhanced, (5, 5), 0)

        _, th1 = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        th2 = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                    cv2.THRESH_BINARY_INV, 19, 9)

        candidates = []
        for thresh in [th2, cv2.bitwise_not(th1)]:

            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 6))
            dilated = cv2.dilate(thresh, kernel, iterations=1)

            cnts, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
            for cnt in cnts:
                rx, ry, rw, rh = cv2.boundingRect(cnt)
                area = rw * rh
                ar   = rw / max(rh, 1)

                if area < w * h * 0.003:   continue
                if area > w * h * 0.35:    continue
                if not (1.5 <= ar <= 6.0): continue

                roi_gray = gray[ry:ry + rh, rx:rx + rw]
                contrast = float(roi_gray.std())
                if contrast < 20:
                    continue

                ar_score = 1.0 - abs(ar - 2.5) / 5.0
                score    = area * max(ar_score, 0.1) * (contrast / 60.0)
                candidates.append((score, rx, ry, rw, rh))

        if not candidates:
            return None

        candidates.sort(key=lambda c: c[0], reverse=True)
        _, rx, ry, rw, rh = candidates[0]

        pad = max(4, int(rh * 0.1))
        x1, y1 = max(0, rx - pad), max(0, ry - pad)
        x2, y2 = min(w, rx + rw + pad), min(h, ry + rh + pad)
        roi = image[y1:y2, x1:x2]
        return roi if roi.size > 0 else None

    @staticmethod
    def _to_gray(img):
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img.copy()

    @staticmethod
    def _resize_gray(gray, min_w, max_w):
        w = gray.shape[1]
        if w < min_w:
            return cv2.resize(gray, None, fx=min_w/w, fy=min_w/w, interpolation=cv2.INTER_CUBIC)
        if w > max_w:
            return cv2.resize(gray, None, fx=max_w/w, fy=max_w/w, interpolation=cv2.INTER_AREA)
        return gray

    def _preprocess_for_ocr(self, img_bgr):
        return self._preprocess_variants(img_bgr, is_roi=True)[0]

    def _preprocess_variants(self, img, is_roi=True):

        gray_orig  = self._to_gray(img)
        denoised_s = cv2.bilateralFilter(gray_orig, 5, 50, 50)

        if is_roi:

            denoised = self._resize_gray(denoised_s, min_w=400, max_w=640)
        else:

            denoised = self._resize_gray(denoised_s, min_w=320, max_w=480)

        clahe   = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
        v1_base = clahe.apply(denoised)
        blur1   = cv2.GaussianBlur(v1_base, (0, 0), 2.0)
        v1      = cv2.addWeighted(v1_base, 1.9, blur1, -0.9, 0)

        _, v2 = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        ker_h  = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1))
        ker_sq = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        v3_inv = cv2.bitwise_not(v2)
        v3_inv = cv2.morphologyEx(v3_inv, cv2.MORPH_CLOSE, ker_h)
        v3_inv = cv2.morphologyEx(v3_inv, cv2.MORPH_CLOSE, ker_sq)
        v3_inv = cv2.morphologyEx(v3_inv, cv2.MORPH_OPEN,  ker_sq)
        v3     = cv2.bitwise_not(v3_inv)

        return [v1, v2, v3]
    def _run_ocr(self, img):
        if self._ocr is None:
            return [], 0.0
        results = self._ocr.readtext(
            img,
            detail=1,
            paragraph=False,
            allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            width_ths=0.4,
            contrast_ths=0.05,
            mag_ratio=1.5,
        )
        if not results:
            return [], 0.0
        results = sorted(results, key=lambda r: sum(pt[1] for pt in r[0]) / 4)
        conf    = float(np.mean([r[2] for r in results]))
        return results, conf

    def _run_ocr_paddle(self, img, timeout: float = 6.0):
        """PaddleOCR via subprocess -> (raw_text, confidence). timeout=6s de trach readline block."""
        if self._paddle_proc is None or self._paddle_proc.poll() is not None:
            return "", 0.0
        try:
            bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) if img.ndim == 2 else img
            ok, buf = cv2.imencode('.jpg', bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if not ok:
                return "", 0.0
            b64 = base64.b64encode(buf.tobytes()).decode()
            msg = json.dumps({"img": b64})
            self._paddle_proc.stdin.write(msg + '\n')
            self._paddle_proc.stdin.flush()

            _q: Queue = Queue()
            def _read_line():
                try:
                    _q.put(self._paddle_proc.stdout.readline())
                except Exception:
                    _q.put(None)
            t = Thread(target=_read_line, daemon=True)
            t.start()
            t.join(timeout)
            if t.is_alive():
                logger.warning(f"PaddleOCR readline timeout ({timeout}s) – bo qua")
                return "", 0.0
            try:
                resp_line = _q.get_nowait()
            except Empty:
                return "", 0.0
            if not resp_line:
                return "", 0.0
            resp = json.loads(resp_line)
            return resp.get("text", ""), float(resp.get("conf", 0.0))
        except Exception as e:
            logger.warning(f"PaddleOCR subprocess error: {e}")
            return "", 0.0

    def _run_ocr_doctr(self, img: np.ndarray) -> tuple:
        """
        Chay doctr OCR. Tra ve (raw_text, confidence).
        img: anh BGR hoac grayscale (numpy uint8).
        """
        if self._doctr is None:
            return "", 0.0
        try:

            if img.ndim == 2:
                rgb = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
            else:
                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

            result = self._doctr([rgb])
            words, confs = [], []
            for page in result.pages:

                all_words = []
                for block in page.blocks:
                    for line in block.lines:
                        for word in line.words:

                            cx = (word.geometry[0][0] + word.geometry[1][0]) / 2
                            cy = (word.geometry[0][1] + word.geometry[1][1]) / 2
                            all_words.append((cy, cx, word.value.upper(), word.confidence))

                all_words.sort(key=lambda w: (round(w[0] * 10), w[1]))

                if all_words:
                    rows_d = [[all_words[0]]]
                    for w in all_words[1:]:
                        if w[0] - rows_d[-1][-1][0] > 0.15:
                            rows_d.append([])
                        rows_d[-1].append(w)
                    for row in rows_d:
                        words.append("".join(w[2] for w in row))
                        confs.extend(w[3] for w in row)

            text = "".join(words)
            conf = float(np.mean(confs)) if confs else 0.0
            return text, conf
        except Exception as e:
            logger.warning(f"doctr OCR loi: {e}")
            return "", 0.0

    def _reconstruct_2line(self, results: list) -> str:
        """
        Ghep cac text box (da sort theo Y) thanh chuoi bien so.

        Bien so xe may VN 2 dong:
          Dong 1: ma tinh + seri (vd: 15B4  hoac  15-B4)
          Dong 2: so thu tu      (vd: 06744)

        Neu OCR chia sai (vd: '15B' | '4' | '06744'), ham nay se ghep
        dung thu tu trai→phai trong moi dong roi noi 2 dong lai.
        """
        if not results:
            return ""
        if len(results) == 1:
            return results[0][1]

        def y_mid(r):  return sum(pt[1] for pt in r[0]) / 4
        def box_h(r):  return max(pt[1] for pt in r[0]) - min(pt[1] for pt in r[0])

        avg_h = max(sum(box_h(r) for r in results) / len(results), 10)

        rows  = [[results[0]]]
        for i in range(1, len(results)):
            if y_mid(results[i]) - y_mid(results[i - 1]) > avg_h * 0.4:
                rows.append([])
            rows[-1].append(results[i])

        merged = ""
        for i, row in enumerate(rows):
            row.sort(key=lambda r: min(pt[0] for pt in r[0]))
            if i > 0:
                merged += "|"
            merged += "".join(r[1] for r in row)

        return merged

    def recognize(self, image_bytes: bytes, time_budget_s: float = 8.0) -> dict:
        """
        Nhan dien bien so tu JPEG bytes.
        Returns: {"plate": "15B4-06744", "confidence": 0.88, "roi_image": None, "ocr_raw": str}
        time_budget_s: tong thoi gian toi da cho tat ca strategies (mac dinh 8s).
        """
        import time as _time
        _deadline = _time.time() + time_budget_s

        with self._lock:
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                return {"plate": "", "confidence": 0.0, "roi_image": None, "ocr_raw": ""}

            h, w = image.shape[:2]
            if w > 640:
                image = cv2.resize(image, (640, int(h * 640 / w)))

            if not self._ready:
                return {"plate": "", "confidence": 0.0, "roi_image": None, "ocr_raw": ""}

        try:
            candidates = []

            roi = self._find_plate_roi(image)
            source = roi if roi is not None else image
            source_label = "ROI" if roi is not None else "FULL"

            if self._paddle_proc is not None and self._paddle_proc.poll() is None:

                _paddle_imgs = [source, self._preprocess_variants(source, is_roi=(roi is not None))[0]]
                for vi, variant in enumerate(_paddle_imgs):
                    raw_p, conf_p = self._run_ocr_paddle(variant)
                    plate_p       = self._normalize_plate(raw_p)
                    logger.info(f"[{source_label}/Paddle/V{vi+1}] raw='{raw_p}' -> plate='{plate_p}' conf={conf_p:.2f}")
                    if self._is_valid_plate(plate_p):
                        candidates.append((plate_p, conf_p))

                        alt = self._alt_no_subseries(plate_p)
                        if alt and self._is_valid_plate(alt):
                            candidates.append((alt, conf_p * 0.90))
                        if conf_p >= 0.75:
                            logger.info(f"[{source_label}/Paddle/V{vi+1}] Early exit conf={conf_p:.2f}")
                            break
                    else:
                        tokens = re.findall(r'[A-Z0-9]+', raw_p.upper())
                        for i in range(len(tokens)):
                            for j in range(i + 1, min(i + 4, len(tokens) + 1)):
                                p2 = self._normalize_plate("".join(tokens[i:j]))
                                if self._is_valid_plate(p2):
                                    candidates.append((p2, conf_p * 0.85))

            top_conf = max((c for _, c in candidates), default=0.0)
            if top_conf < 0.80 and _time.time() < _deadline:
                variants = self._preprocess_variants(source, is_roi=(roi is not None))
                for vi, variant in enumerate(variants):
                    if _time.time() >= _deadline:
                        logger.info(f"[EasyOCR] Time budget exhausted at V{vi+1}")
                        break
                    results, conf = self._run_ocr(variant)
                    raw           = self._reconstruct_2line(results)
                    plate         = self._normalize_plate(raw)
                    logger.info(f"[{source_label}/EasyOCR/V{vi+1}] raw='{raw}' -> plate='{plate}' conf={conf:.2f}")

                    capped_conf = min(conf, 0.88)
                    if self._is_valid_plate(plate):
                        candidates.append((plate, capped_conf))

                        alt = self._alt_no_subseries(plate)
                        if alt and self._is_valid_plate(alt):
                            candidates.append((alt, capped_conf * 0.90))
                        if capped_conf >= 0.65:
                            logger.info(f"[{source_label}/EasyOCR/V{vi+1}] Early exit conf={capped_conf:.2f}")
                            break
                    else:
                        tokens = re.findall(r'[A-Z0-9]+', raw.upper())
                        for i in range(len(tokens)):
                            for j in range(i + 1, min(i + 4, len(tokens) + 1)):
                                p2 = self._normalize_plate("".join(tokens[i:j]))
                                if self._is_valid_plate(p2):
                                    candidates.append((p2, capped_conf * 0.85))

            if not candidates and roi is not None and _time.time() < _deadline:
                for vi, variant in enumerate(self._preprocess_variants(image, is_roi=False)):
                    if _time.time() >= _deadline:
                        logger.info(f"[FULL-FB] Time budget exhausted at V{vi+1}")
                        break
                    results, conf = self._run_ocr(variant)
                    raw           = self._reconstruct_2line(results)
                    plate         = self._normalize_plate(raw)
                    logger.info(f"[FULL-FB/V{vi+1}] raw='{raw}' -> plate='{plate}' conf={conf:.2f}")
                    if self._is_valid_plate(plate):
                        candidates.append((plate, conf * 0.9))
                        if conf >= 0.65:
                            break
                    else:
                        tokens = re.findall(r'[A-Z0-9]+', raw.upper())
                        for i in range(len(tokens)):
                            for j in range(i + 1, min(i + 4, len(tokens) + 1)):
                                p2 = self._normalize_plate("".join(tokens[i:j]))
                                if self._is_valid_plate(p2):
                                    candidates.append((p2, conf * 0.75))

            if not candidates and self._doctr is not None and _time.time() < _deadline:
                best_variant = self._preprocess_variants(source, is_roi=(roi is not None))[0]
                raw_d, conf_d = self._run_ocr_doctr(best_variant)
                plate_d = self._normalize_plate(raw_d)
                logger.info(f"[doctr] raw='{raw_d}' -> plate='{plate_d}' conf={conf_d:.2f}")
                if self._is_valid_plate(plate_d):
                    candidates.append((plate_d, conf_d))
                elif len(plate_d) >= 7:
                    candidates.append((plate_d, conf_d * 0.5))

            if not candidates:
                return {"plate": "", "confidence": 0.0, "roi_image": None, "ocr_raw": ""}

            best_plate, best_conf = max(candidates, key=lambda x: x[1])
            logger.info(f"[RESULT] plate='{best_plate}' conf={best_conf:.2f}")
            return {
                "plate":      best_plate,
                "confidence": round(min(best_conf, 1.0), 4),
                "roi_image":  None,
                "ocr_raw":    best_plate,
            }

        except Exception as e:
            logger.error(f"Loi plate recognition: {e}", exc_info=True)
            return {"plate": "", "confidence": 0.0, "roi_image": None, "ocr_raw": ""}
