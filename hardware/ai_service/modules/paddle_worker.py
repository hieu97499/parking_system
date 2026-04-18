"""
Paddle OCR worker process.
Reads base64-encoded JPEG images from stdin (one JSON per line),
writes result JSON to stdout.

Protocol:
  stdin:  {"img": "<base64 JPEG>"}  or {"cmd": "exit"}
  stdout: {"text": "...", "conf": 0.95}  or {"text": "", "conf": 0.0, "error": "..."}
"""
import sys
import json
import base64
import os
import numpy as np

os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')

os.environ['PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT'] = '0'

import torch as _torch_preload

import paddle
paddle.set_flags({'FLAGS_use_mkldnn': 0})

from paddleocr import PaddleOCR
import cv2

_COMMON = {
    'use_doc_orientation_classify': False,
    'use_doc_unwarping': False,
    'use_textline_orientation': False,
}

ocr = None
for _params in [

    {**_COMMON, 'lang': 'en',
     'text_detection_model_name': 'PP-OCRv5_mobile_det',
     'text_recognition_model_name': 'en_PP-OCRv5_mobile_rec'},

    {**_COMMON, 'lang': 'en',
     'text_detection_model_name': 'PP-OCRv4_mobile_det',
     'text_recognition_model_name': 'en_PP-OCRv4_mobile_rec'},

    {**_COMMON, 'lang': 'en'},
]:
    try:
        ocr = PaddleOCR(**_params)

        _blank = np.ones((64, 200, 3), np.uint8) * 200
        list(ocr.predict(_blank))
        break
    except Exception as _e:
        sys.stderr.write(f'[paddle_worker] init fail with {_params}: {_e}\n')
        sys.stderr.flush()
        ocr = None

if ocr is None:
    print(json.dumps({'status': 'error', 'msg': 'PaddleOCR init failed'}), flush=True)
    sys.exit(1)

def run_ocr(img_bgr):
    result = list(ocr.predict(img_bgr))
    all_boxes = []
    if result:
        for page in result:
            if not isinstance(page, dict):
                continue
            rec_texts  = page.get('rec_texts',  []) or []
            rec_scores = page.get('rec_scores', []) or []
            dt_polys   = page.get('dt_polys',   []) or []
            for text, score, poly in zip(rec_texts, rec_scores, dt_polys):
                if not text:
                    continue
                _poly = poly if (poly is not None and len(poly) > 0) else None
                ys = [float(p[1]) for p in _poly] if _poly is not None else [0.0]
                xs = [float(p[0]) for p in _poly] if _poly is not None else [0.0]
                cy = float(np.mean(ys))
                cx = float(np.mean(xs))
                all_boxes.append((cy, cx, str(text).upper(), float(score)))
    if not all_boxes:
        return "", 0.0
    all_boxes.sort(key=lambda w: (round(w[0] / 10) * 10, w[1]))
    rows = [[all_boxes[0]]]
    for box in all_boxes[1:]:
        if box[0] - rows[-1][-1][0] > 12:
            rows.append([])
        rows[-1].append(box)
    merged_rows = []
    confs = []
    for row in rows:
        row.sort(key=lambda w: w[1])
        merged_rows.append("".join(w[2] for w in row))
        confs.extend(w[3] for w in row)
    merged = "|".join(merged_rows)
    return merged, float(np.mean(confs)) if confs else 0.0

print(json.dumps({"status": "ready"}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
        if msg.get("cmd") == "exit":
            break
        img_bytes = base64.b64decode(msg["img"])
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            print(json.dumps({"text": "", "conf": 0.0, "error": "decode failed"}), flush=True)
            continue
        text, conf = run_ocr(img)
        print(json.dumps({"text": text, "conf": conf}), flush=True)
    except Exception as e:
        print(json.dumps({"text": "", "conf": 0.0, "error": str(e)}), flush=True)
