# LUỒNG DỮ LIỆU HỆ THỐNG BÃI ĐỖ XE THÔNG MINH
# Chi tiết toàn bộ data flow – file, dòng code, giao thức

---

## MỤC LỤC

1. [Kiến trúc tổng thể và cổng dịch vụ](#1-kiến-trúc-tổng-thể)
2. [Luồng 1 – Người dùng đăng ký / đăng nhập](#2-luồng-đăng-ký--đăng-nhập-người-dùng)
3. [Luồng 2 – Đăng ký xe và ảnh biển số](#3-luồng-đăng-ký-xe-và-ảnh-biển-số)
4. [Luồng 3 – Đăng ký khuôn mặt](#4-luồng-đăng-ký-khuôn-mặt)
5. [Luồng 4 – Xe vào bãi (End-to-End)](#5-luồng-xe-vào-bãi-end-to-end)
6. [Luồng 5 – Xe ra bãi (End-to-End)](#6-luồng-xe-ra-bãi-end-to-end)
7. [Luồng 6 – Real-time Socket.IO đến Admin Web](#7-luồng-real-time-socketio-đến-admin-web)
8. [Luồng 7 – Admin Web các trang dữ liệu](#8-luồng-admin-web-các-trang-dữ-liệu)
9. [Luồng 8 – Điều khiển barrier thủ công từ Admin](#9-luồng-điều-khiển-barrier-thủ-công)
10. [Luồng 9 – Ví điện tử người dùng](#10-luồng-ví-điện-tử)
11. [Luồng 10 – Đăng ký thẻ tháng](#11-luồng-thẻ-tháng)
12. [Sơ đồ tổng hợp toàn hệ thống](#12-sơ-đồ-tổng-hợp)

---

## 1. Kiến trúc tổng thể

```
[Phần cứng]          [Phần mềm]                        [Người dùng]
                                                         
Arduino UNO (I2C)                                       
  ↕ I2C (0x08/0x09)                                    
ESP8266 NodeMCU                                         Admin Web (React)
  ↕ TCP :4003         Hardware Bridge (Node.js :4003)  ↕ HTTP/REST :4000
                       ↕ WebSocket :4002   ←→→→→→→→→→→  ↕ WS :4002
                       ↕ HTTP :5001                     
                      AI Service (Python :5001)         User WebApp (React)
                       ↕ HTTP :4000                     ↕ HTTP/REST :4000
                      Backend API (Node.js :4000)
                       ↕ TCP/SQL :5432
                      PostgreSQL :5432
```

### Bảng cổng dịch vụ

| Dịch vụ | File khởi động | Cổng | Giao thức |
|---------|---------------|------|-----------|
| Backend API | `BuildWeb/backend/src/index.js` dòng 107 | 4000 | HTTP REST + Socket.IO |
| AI Service | `hardware/ai_service/main.py` | 5001 | HTTP REST (FastAPI) |
| Hardware Bridge | `hardware/bridge/index.js` | 4003 (TCP ESP8266) + 4002 (WebSocket) | TCP + WS |
| User WebApp | `WebApp/` (Vite dev) | 5175 | Browser SPA |
| Admin Web | `BuildWeb/admin-web/` (Vite dev) | 3000 | Browser SPA |
| PostgreSQL | - | 5432 | TCP/SQL |

---

## 2. Luồng Đăng ký / Đăng nhập Người dùng

### 2.1 Đăng ký tài khoản

```
[User WebApp]                          [Backend API]                  [PostgreSQL]
pages/Register.jsx                     routes/user/auth.js            DB: users, wallets
   |                                        |                               |
   | Form submit: {full_name,               |                               |
   |   phone_number, password}              |                               |
   |                                        |                               |
   |─── POST /api/user/auth/register ──────>|                               |
   |    (services.js: authApi.register())   |                               |
   |    client.js dòng 14–17               | bcrypt.hash(password, 10)     |
   |                                        |── INSERT INTO users ─────────>|
   |                                        |── INSERT INTO wallets(0đ) ───>|
   |                                        |<── { user_id, token } ────────|
   |<── 201 { token, user } ───────────────|                               |
   |                                        |                               |
   | localStorage.setItem('user_token')     |                               |
   | → navigate('/dashboard')              |                               |
```

**File & dòng code chi tiết:**
- `WebApp/src/pages/Register.jsx` – form submit gọi `authApi.register(data)`
- `WebApp/src/api/services.js` dòng 3 – `authApi.register: (data) => api.post('/auth/register', data)`
- `WebApp/src/api/client.js` dòng 14–17 – `fetch('/api/user/auth/register', { method:'POST', body: JSON.stringify(body) })`
- `BuildWeb/backend/src/index.js` dòng 55 – `app.use('/api/user/auth', require('./routes/user/auth'))`
- `BuildWeb/backend/src/routes/user/auth.js` – handler POST `/register`: hash mật khẩu bcrypt, INSERT users, INSERT wallets(balance=0)

---

### 2.2 Đăng nhập người dùng

```
[User WebApp]                          [Backend API]                  [PostgreSQL]
pages/Login.jsx                        routes/user/auth.js            DB: users
   |                                        |                               |
   |─── POST /api/user/auth/login ─────────>|                               |
   |    { phone_number, password }          |                               |
   |    (rate limited: 10 req/15min)        |── SELECT * FROM users  ──────>|
   |    index.js dòng 54                    |   WHERE phone_number=$1       |
   |                                        |<── user row ──────────────────|
   |                                        | bcrypt.compare(password, hash)|
   |                                        | jwt.sign({user_id}, SECRET)   |
   |<── 200 { token, user } ───────────────|                               |
   |                                        |                               |
   | localStorage.setItem('user_token',token)                              |
   | store/useStore.js: setUser(user)       |                               |
   | → navigate('/dashboard')              |                               |
```

**File & dòng code chi tiết:**
- `WebApp/src/api/client.js` dòng 3 – `const BASE_URL = '/api/user'` (proxy qua Vite config)
- `WebApp/src/api/client.js` dòng 5–7 – `getToken()` đọc `localStorage.getItem('user_token')`
- `WebApp/src/api/client.js` dòng 9–30 – hàm `request()`: gắn `Authorization: Bearer <token>`, xử lý 401 → redirect login
- `BuildWeb/backend/src/index.js` dòng 32–35 – `loginLimiter: max 10 req / 15 phút`
- `BuildWeb/backend/src/index.js` dòng 54 – `app.use('/api/user/auth/login', loginLimiter)`

---

### 2.3 Đăng nhập Admin

```
[Admin Web]                            [Backend API]                  [PostgreSQL]
pages/Login.jsx                        routes/auth.js                 DB: admins, admin_sessions
   |                                        |                               |
   |─── POST /api/auth/login ──────────────>|                               |
   |    { username, password }              |── SELECT * FROM admins ──────>|
   |    (rate limited 10/15min)             |<── admin row ─────────────────|
   |                                        | bcrypt.compare()              |
   |                                        | jwt.sign({admin_id, role})    |
   |                                        |── INSERT admin_sessions ─────>|
   |<── 200 { token, admin } ─────────────|                               |
   |                                        |                               |
   | localStorage.setItem('admin_token')    |                               |
```

**File & dòng code chi tiết:**
- `BuildWeb/admin-web/src/api/client.js` dòng 1 – `const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'`
- `BuildWeb/admin-web/src/api/client.js` dòng 4–6 – `getToken()` đọc `localStorage.getItem('admin_token')`
- `BuildWeb/admin-web/src/api/services.js` dòng 3 – `authApi.login: (username, password) => api.post('/auth/login', ...)`
- `BuildWeb/backend/src/index.js` dòng 44–46 – `app.use('/api/auth/login', loginLimiter)` (cùng rateLimit 10/15min)
- `BuildWeb/backend/src/routes/auth.js` – POST `/login`: bcrypt verify → jwt.sign → INSERT admin_sessions

---

## 3. Luồng Đăng ký Xe và Ảnh Biển số

```
[User WebApp]              [Backend API]                     [PostgreSQL]       [Disk]
pages/Vehicles.jsx         routes/user/vehicles.js           DB: vehicles       uploads/
   |                              |                               |               |
   | Form: {license_plate,        |                               |               |
   |   nickname, vehicle_type}    |                               |               |
   |─── POST /api/user/vehicles ─>|                               |               |
   |    services.js dòng 12       |── INSERT INTO vehicles ──────>|               |
   |    vehiclesApi.add(data)      |   (user_id từ JWT)           |               |
   |<── 201 { vehicle_id } ───────|                               |               |
   |                              |                               |               |
   | Upload ảnh biển số:          |                               |               |
   |─── POST /api/user/vehicles   |                               |               |
   |    /:id/plate-image ─────────>|                               |               |
   |    { image_data: "base64..." }|── decode base64             |               |
   |    services.js dòng 15        |── lưu file JPEG ────────────────────────────>|
   |                               |   uploads/plates/           |               |
   |                               |── UPDATE vehicles           |               |
   |                               |   SET plate_image_path ────>|               |
   |<── 200 { path } ─────────────|                               |               |
```

**File & dòng code chi tiết:**
- `WebApp/src/api/services.js` dòng 12 – `vehiclesApi.add: (data) => api.post('/vehicles', data)`
- `WebApp/src/api/services.js` dòng 15 – `vehiclesApi.uploadPlateImage: (id, imageData) => api.post('/vehicles/${id}/plate-image', { image_data: imageData })`
- `BuildWeb/backend/src/index.js` dòng 57 – `app.use('/api/user/vehicles', require('./routes/user/vehicles'))`
- `BuildWeb/backend/src/routes/user/vehicles.js` – xác thực JWT qua middleware userAuth, INSERT vehicles với `user_id` lấy từ token
- `BuildWeb/backend/src/index.js` dòng 37 – `app.use(express.json({ limit: '10mb' }))` (cho phép base64 ảnh)
- `BuildWeb/backend/src/index.js` dòng 39 – `app.use('/uploads', express.static(...))` – phục vụ file tĩnh ảnh

---

## 4. Luồng Đăng ký Khuôn mặt

```
[User WebApp]          [Backend API]              [AI Service]           [Disk/DB]
pages/Authorizations   routes/user/faceImages.js  main.py                uploads/faces/
  .jsx (hoặc Register) routes/user/auth.js         /faces/reload          face_embeddings
   |                          |                         |                      |
   | Chụp ảnh từ webcam       |                         |                      |
   | (canvas.toDataURL())     |                         |                      |
   |── POST /api/user/        |                         |                      |
   |   face-images ──────────>|                         |                      |
   |   { image_data: base64 } |                         |                      |
   |   services.js dòng 51    |                         |                      |
   |                          | decode base64           |                      |
   |                          | Gọi InsightFace         |                      |
   |                          | trực tiếp trong backend |                      |
   |                          |── lưu JPEG ────────────────────────────────>|
   |                          |   uploads/faces/        |       uploads/faces/ |
   |                          |── INSERT               |                      |
   |                          |  face_embeddings ──────────────────────────>|
   |                          |   (embedding 512D)      |         face_embeddings|
   |                          |                         |                      |
   |                          |── POST /faces/reload ──>|                      |
   |                          |                         | Đọc lại thư mục     |
   |                          |                         | uploads/faces/       |
   |                          |                         | Re-extract embedding |
   |                          |                         | → cập nhật RAM cache |
   |<── 201 { face_id } ─────|                         |                      |
```

**File & dòng code chi tiết:**
- `WebApp/src/api/services.js` dòng 51–54 – `faceImagesApi.upload: (imageData) => api.post('/face-images', { image_data: imageData })`
- `BuildWeb/backend/src/index.js` dòng 62 – `app.use('/api/user/face-images', require('./routes/user/faceImages'))`
- `BuildWeb/backend/src/routes/user/faceImages.js` – POST handler: decode base64 → lưu JPEG vào `uploads/faces/<user_id>/` → INSERT vào bảng `face_embeddings`
- Sau khi INSERT, backend gọi `POST http://localhost:5001/faces/reload` để AI Service re-load embedding
- `hardware/ai_service/main.py` – endpoint `POST /faces/reload`: đọc lại thư mục `uploads/faces/`, trích xuất embedding InsightFace buffalo_sc, lưu vào `face_ai._known_embeddings` (dict trong RAM)
- `hardware/ai_service/modules/face_recognizer.py` – hàm `_extract_embedding()`: YOLO detect face → InsightFace `get()` → normalize embedding l2-norm

---

## 5. Luồng Xe Vào Bãi (End-to-End)

Đây là luồng phức tạp nhất, đi qua 5 lớp phần mềm và phần cứng.

### Bước 1 – Phần cứng phát hiện xe

```
[Cảm biến HYSRF05]         [Arduino UNO]                 [ESP8266 NodeMCU]
   |                              |                               |
   | Xe cách < 80cm               |                               |
   | → Echo HIGH                  |                               |
   |─────────────────────────────>| Tính khoảng cách             |
   |                              | (pulseIn Echo D10)            |
   |                              | Nếu < 80cm:                  |
   |                              | → emit I2C status bit0=1     |
   |                              | ESP8266 poll I2C 0x08        |
   |                              |<──── I2C poll mỗi 200ms ─────|
   |                              |───── trả byte trạng thái ───>|
   |                              |      bit0=sensor detected     |
   |                              |                               | Serial.println
   |                              |                               | "ENTRY:SENSOR:DETECTED"
   |                              |                               |─── TCP write ──────────>
```

**File & dòng code:**
- `hardware/arduino/entry_gate/entry_gate.ino` – vòng loop đo khoảng cách, giao tiếp I2C slave 0x08
- `hardware/esp8266/esp8266_gate_bridge/esp8266_gate_bridge.ino` – I2C Master poll Arduino mỗi 200ms, khi nhận bit=1 thì `client.println("ENTRY:SENSOR:DETECTED")`

---

### Bước 2 – Hardware Bridge nhận sự kiện TCP

```
[ESP8266]                   [Hardware Bridge]
   |                         esp8266Handler.js
   |                              |
   |─── TCP write ───────────────>|
   | "ENTRY:SENSOR:DETECTED\n"   | _server.listen(:4003)  (dòng 60)
   |                              | socket.on('data', ...)  (dòng 28)
   |                              | _rxBuf += data → split('\n') (dòng 29–36)
   |                              | _handleLine("ENTRY:SENSOR:DETECTED") (dòng 37)
   |                              |   gatePart = "entry"
   |                              |   msgPart  = "SENSOR:DETECTED"
   |                              |   this.emit('entry:detected') (dòng 88)
   |                              |
   |                         controller.js
   |                              | serial.on('entry:detected', handleEntry) (dòng 148)
   |                              | → handleEntry() được gọi
```

**File & dòng code:**
- `hardware/bridge/src/esp8266Handler.js` dòng 56–62 – `this._server.listen(cfg.ESP8266_TCP_PORT, '0.0.0.0', ...)` lắng nghe TCP port 4003
- `hardware/bridge/src/esp8266Handler.js` dòng 28–36 – `socket.on('data', ...)` tích lũy buffer và tách dòng `\n`
- `hardware/bridge/src/esp8266Handler.js` dòng 63–104 – `_handleLine()`: parse "ENTRY:SENSOR:DETECTED" → `this.emit('entry:detected')`
- `hardware/bridge/src/controller.js` dòng 148–150 – `serial.on('entry:detected', handleEntry)`

> **Lưu ý fallback Serial USB:** Nếu không dùng ESP8266 mà kết nối Arduino trực tiếp qua USB:
> - `hardware/bridge/src/serialHandler.js` dòng 35–48 – `SerialPort open` đọc dữ liệu Serial
> - `hardware/bridge/src/serialHandler.js` dòng 107–115 – parse `"SENSOR:DETECTED"` → `this.emit('entry:detected')`
> - `hardware/bridge/src/controller.js` dòng 2 – `const serial = require('./esp8266Handler')` (có thể đổi sang serialHandler)

---

### Bước 3 – Debounce và phát WS event

```
[controller.js handleEntry()]
   |
   | _debounced('entry')           (dòng 12–18)
   |   Kiểm tra _processing.entry  (dòng 13)
   |   Kiểm tra Date.now() - _lastTrigger.entry < DEBOUNCE_MS (3000ms) (dòng 14)
   |   → False nếu đang xử lý hoặc quá gần
   |
   | _processing.entry = true      (dòng 24)
   |
   | ws.broadcast('ENTRY_DETECTED', { gate:'entry', ts:Date.now() })  (dòng 27)
   |────────────────────────────────────────────────────────────────────>
   |                                                          wsServer.js
   |                                                          broadcast()  (dòng 37–43)
   |                                                          Admin Web nhận event
```

**File & dòng code:**
- `hardware/bridge/src/controller.js` dòng 12–18 – hàm `_debounced()`: double-trigger prevention
- `hardware/bridge/src/controller.js` dòng 24 – đặt cờ `_processing.entry = true`
- `hardware/bridge/src/wsServer.js` dòng 37–44 – `broadcast(type, data)`: gửi JSON đến tất cả WS client đang kết nối (readyState === 1)

---

### Bước 4 – Gọi AI Service

```
[controller.js]               [AI Service main.py]           [Camera USB]
   |                                |                              |
   | aiResult = await               |                              |
   | ai.processEntry()    (dòng 31) |                              |
   |──── POST /process/entry ──────>|                              |
   |     aiClient.js dòng 11        |                              |
   |     axios.post('/process/entry')── _entry_semaphore.acquire   |
   |                                |                              |
   |                                | Step 1: capture plate image  |
   |                                |── camera.capture(ENTRY_PLATE_CAM=0) ──>|
   |                                | _capture_img_only() (dòng ~230)       |
   |                                |<── JPEG bytes ────────────────────────|
   |                                | _save_capture() → uploads/captures/entry_plate_*.jpg
   |                                |
   |                                | Step 2: sleep FACE_CAPTURE_DELAY (config.py)
   |                                |
   |                                | Step 3: recognize face (retry loop)
   |                                |── camera.capture(ENTRY_FACE_CAM=1) ──>|
   |                                |<── JPEG bytes ────────────────────────|
   |                                | face_ai.recognize(img_bytes)
   |                                |   modules/face_recognizer.py
   |                                |   1. YOLO detect face → bbox
   |                                |   2. InsightFace buffalo_sc → embedding 512D
   |                                |   3. cosine_similarity vs _known_embeddings
   |                                |   → { user_id, confidence }
   |                                |
   |                                | Step 4: recognize plate (retry)
   |                                | plate_ai.recognize(plate_img_bytes)
   |                                |   modules/plate_recognizer.py
   |                                |   1. Contour detect ROI
   |                                |   2. EasyOCR readtext() → text, conf
   |                                |   3. Fallback PaddleOCR nếu conf thấp
   |                                |   → { plate:"51A-12345", confidence:0.87 }
   |                                |
   |<── 200 JSON ──────────────────|
   |  { plate, plate_confidence,    |
   |    plate_image_path,           |
   |    face_user_id,               |
   |    face_confidence,            |
   |    face_image_path,            |
   |    processing_time_ms }        |
```

**File & dòng code:**
- `hardware/bridge/src/aiClient.js` dòng 11–13 – `processEntry(): http.post('/process/entry')` (axios, baseURL = cfg.AI_SERVICE_URL = `http://localhost:5001`)
- `hardware/ai_service/main.py` dòng ~310 – `@app.post('/process/entry')` với `_entry_semaphore` (Semaphore(1))
- `hardware/ai_service/main.py` dòng ~325 – `_capture_img_only(config.ENTRY_PLATE_CAM, "entry_plate")` chụp camera index 0
- `hardware/ai_service/main.py` dòng ~287 – `_run_face_with_retry()`: vòng retry `FACE_MAX_RETRIES` lần interval 0.8s
- `hardware/ai_service/main.py` dòng ~305 – `_run_plate_with_retry()`: vòng retry `PLATE_MAX_RETRIES` lần interval 0.5s
- `hardware/ai_service/modules/face_recognizer.py` dòng ~55–80 – `_extract_embedding()`: YOLO → InsightFace
- `hardware/ai_service/modules/plate_recognizer.py` – EasyOCR + contour detection cho biển số Việt Nam

---

### Bước 5 – Báo cáo Backend

```
[controller.js]               [Backend API]                  [PostgreSQL]
   | dòng 40–47                    |                               |
   | backend.reportEntry({         |                               |
   |   plate, plate_confidence,    |                               |
   |   plate_image_path,           |                               |
   |   face_user_id,               |                               |
   |   face_confidence,            |                               |
   |   face_image_path,            |                               |
   |   device_id                   |                               |
   | })                            |                               |
   |──── POST /api/hardware/entry ─>                               |
   |     backendClient.js dòng 14   |                               |
   |     Header: x-hardware-key    |                               |
   |                               | hardwareAuth() (dòng 5–10)   |
   |                               | Verify x-hardware-key        |
   |                               |                               |
   |                               | Normalize plate (uppercase, trim spaces)
   |                               |── SELECT lot_id FROM devices ─>|
   |                               |── SELECT vehicles JOIN users ─>|
   |                               |   WHERE license_plate=$1      |
   |                               |── Check plate_confidence >= 0.5
   |                               |── Check face_confidence >= 0.55
   |                               |── Verify face_user_id == vehicle owner
   |                               |── Check xe chưa trong bãi    |
   |                               |── SELECT monthly_passes       |
   |                               |   WHERE vehicle_id=$1 AND active
   |                               |── INSERT parking_sessions ───>|
   |                               |   { user_id, vehicle_id,      |
   |                               |     license_plate, lot_id,    |
   |                               |     status='active',          |
   |                               |     session_type,             |
   |                               |     entry_composite_image_path}
   |                               |── INSERT event_logs ─────────>|
   |                               |── io.emit('new_session', ...) ─────── Socket.IO
   |                               |── COMMIT                      |
   |<── 200 { allowed:true,         |                               |
   |          session_id,           |                               |
   |          message,              |                               |
   |          monthly_pass }        |                               |
```

**File & dòng code:**
- `hardware/bridge/src/backendClient.js` dòng 5–11 – tạo axios instance với header `x-hardware-key`
- `hardware/bridge/src/backendClient.js` dòng 14–16 – `reportEntry(payload): http.post('/api/hardware/entry', payload)`
- `BuildWeb/backend/src/routes/hardware.js` dòng 5–10 – `hardwareAuth()` middleware: kiểm tra `x-hardware-key`
- `BuildWeb/backend/src/routes/hardware.js` dòng 13 – `router.post('/entry', hardwareAuth, async(req, res) => {...})`
- `BuildWeb/backend/src/routes/hardware.js` dòng 44–46 – kiểm tra ngưỡng PLATE_THRESH (0.5) và FACE_THRESH (0.55)
- `BuildWeb/backend/src/routes/hardware.js` dòng 80–83 – `if (plateOwner !== face_user_id)` → từ chối
- `BuildWeb/backend/src/index.js` dòng 103 – `app.set('io', io)` – lưu Socket.IO instance vào app

---

### Bước 6 – Mở Barrier

```
[controller.js]               [Hardware Bridge]              [ESP8266]     [Arduino]
   |                          esp8266Handler.js                   |              |
   | backendRes.allowed=true                                       |              |
   | serial.openBarrier('entry') (dòng 63)                        |              |
   |── openBarrier('entry') ──>| _send("ENTRY:OPEN") (dòng 115)  |              |
   |                           | this._client.write("ENTRY:OPEN\n")|             |
   |                           |──── TCP write ──────────────────>|              |
   |                           |                                  | I2C write 0x01 to 0x08
   |                           |                                  |─────────────>|
   |                           |                                  |   Servo rotate 90°
   |                           |                                  |   (Barrier mở)
   | ws.broadcast('BARRIER_OPENED', { gate:'entry' })   (dòng 64)|              |
   |────────────── WS broadcast ───────────────────────────────────────── Admin Web
```

**File & dòng code:**
- `hardware/bridge/src/controller.js` dòng 63 – `serial.openBarrier('entry')`
- `hardware/bridge/src/esp8266Handler.js` dòng 115 – `openBarrier(gate): this._send('ENTRY:OPEN')`
- `hardware/bridge/src/esp8266Handler.js` dòng 108–113 – `_send(msg): this._client.write(msg + '\n')`
- `hardware/arduino/entry_gate/entry_gate.ino` – nhận I2C byte 0x01 (`Wire.onReceive`) → `servo.write(90)`

---

## 6. Luồng Xe Ra Bãi (End-to-End)

```
[Cảm biến cổng ra]
   │ (tương tự bước 1–3 cổng vào nhưng gate='exit')
   ▼
[ESP8266 gửi "EXIT:SENSOR:DETECTED"]
   │
[controller.js handleExit() dòng 90]
   │
   ├─ ws.broadcast('EXIT_DETECTED', ...)
   │
   ├─ ai.processExit()  → POST /process/exit  (aiClient.js dòng 18)
   │   main.py: chụp biển số cam EXIT_PLATE_CAM + nhận diện khuôn mặt cam EXIT_FACE_CAM
   │   Trả về { plate, plate_confidence, face_user_id, face_confidence, ... }
   │
   ├─ backend.reportExit(payload)  → POST /api/hardware/exit  (backendClient.js dòng 20)
   │   routes/hardware.js POST /exit:
   │     ├ Tìm phiên đang active theo license_plate
   │     ├ Tính phí: (exit_time - entry_time) × rate_per_hour
   │     │   Nếu có monthly_pass → fee = 0
   │     ├ UPDATE parking_sessions SET status='completed', exit_time, fee
   │     ├ Nếu fee > 0 → UPDATE wallets SET balance = balance - fee
   │     ├ INSERT event_logs (exit_event)
   │     ├ io.emit('session_closed', ...)  → Socket.IO Admin Web
   │     └ COMMIT → trả về { allowed:true, fee, monthly_pass, message }
   │
   ├─ ws.broadcast('SESSION_CLOSED', { fee, ... })
   │
   └─ serial.openBarrier('exit')
       → ESP8266 TCP "EXIT:OPEN"
       → Arduino I2C 0x09 byte 0x01
       → Servo 90° (barrier mở)
```

**File & dòng code:**
- `hardware/bridge/src/controller.js` dòng 90–145 – toàn bộ hàm `handleExit()`
- `hardware/bridge/src/controller.js` dòng 104 – `aiResult = await ai.processExit()`
- `hardware/bridge/src/controller.js` dòng 110–117 – `backendRes = await backend.reportExit({...})`
- `hardware/bridge/src/aiClient.js` dòng 18 – `processExit(): http.post('/process/exit')`
- `hardware/bridge/src/backendClient.js` dòng 20 – `reportExit(payload): http.post('/api/hardware/exit', payload)`
- `hardware/ai_service/main.py` – `@app.post('/process/exit')` dùng `_exit_semaphore`

---

## 7. Luồng Real-time Socket.IO đến Admin Web

### 7.1 Thiết lập kết nối

```
[Admin Web]                            [Backend API]
pages/Dashboard.jsx                    index.js
   |                                        |
   | import { io } from 'socket.io-client' |
   | io('http://localhost:4000')            |
   |──── WebSocket Upgrade ────────────────>|
   |                                        | io.on('connection', socket => {
   |                                        |   console.log('Admin Web kết nối:', socket.id)
   |                                        |   socket.on('disconnect', ...)
   |                                        | })   (index.js dòng 90–97)
   |<── { type:'connected' } ──────────────|
```

### 7.2 Events được Backend phát

Khi có xe vào/ra, Backend dùng `io` instance (lưu tại `app.get('io')`) để broadcast:

| Event Socket.IO | Thời điểm phát | Payload |
|----------------|----------------|---------|
| `new_session` | Sau INSERT parking_sessions | `{ session_id, license_plate, user_name, entry_time }` |
| `session_closed` | Sau UPDATE parking_sessions exit | `{ session_id, fee, exit_time }` |
| `device_status` | Sau PATCH /api/devices/:id/status | `{ device_id, status, note }` |
| `new_alert` | Khi INSERT vào alerts | `{ alert_id, severity, message }` |

### 7.3 Events từ Hardware Bridge WebSocket (port 4002)

Admin Web cũng kết nối WebSocket trực tiếp đến Bridge port 4002:

| Event WS | File phát | Mô tả |
|---------|-----------|-------|
| `ENTRY_DETECTED` | controller.js dòng 27 | Cảm biến cổng vào kích hoạt |
| `EXIT_DETECTED` | controller.js dòng 93 | Cảm biến cổng ra kích hoạt |
| `AI_RESULT` | controller.js dòng 34 | Kết quả nhận diện biển số + mặt |
| `SESSION_CREATED` | controller.js dòng 55 | Phiên mới được tạo |
| `SESSION_CLOSED` | controller.js dòng 123 | Phiên kết thúc |
| `BARRIER_OPENED` | controller.js dòng 64 | Barrier mở |
| `BARRIER_CLOSED` | controller.js dòng 159 | Barrier đóng (sau khi xe qua) |
| `DEVICE_CONNECTED` | controller.js dòng 165 | Thiết bị kết nối |
| `DEVICE_DISCONNECTED` | controller.js dòng 169 | Thiết bị mất kết nối |
| `ERROR` | controller.js nhiều chỗ | Lỗi nhận diện hoặc xác thực |

**File & dòng code:**
- `BuildWeb/backend/src/index.js` dòng 82–99 – khởi tạo Socket.IO server, cấu hình CORS
- `BuildWeb/backend/src/index.js` dòng 103 – `app.set('io', io)` lưu instance
- `hardware/bridge/src/wsServer.js` dòng 11–34 – `wss.on('connection', ...)` nhận kết nối Admin Web
- `hardware/bridge/src/wsServer.js` dòng 37–44 – `broadcast(type, data)`: JSON.stringify + gửi đến mọi client

---

## 8. Luồng Admin Web Các Trang Dữ Liệu

### 8.1 Dashboard – Trang tổng quan

```
[Admin Web Dashboard]          [Backend API]              [PostgreSQL]
pages/Dashboard.jsx                |                            |
   |                               |                            |
   | useEffect (mount + 30s poll)  |                            |
   |                               |                            |
   |── GET /api/dashboard/stats ──>|── SELECT COUNT, SUM ──────>|
   |   services.js dòng 10         |   parking_sessions, lots   |
   |<── { total_capacity,          |<── aggregated data ────────|
   |      occupied, revenue_today, |                            |
   |      session_count }          |                            |
   |                               |                            |
   |── GET /api/dashboard/hourly-  |── SELECT hour, COUNT ─────>|
   |   traffic?date=today ────────>|   GROUP BY hour            |
   |   services.js dòng 11         |<── [{ hour, count }] ──────|
   |<── [{ hour:0..23, count }]    |                            |
   |                               |                            |
   |── GET /api/dashboard/active-  |── SELECT ps.* JOIN users ─>|
   |   sessions ──────────────────>|   WHERE status='active'    |
   |   services.js dòng 12         |<── [{ plate, user, time }] |
   |<── [active session list] ─────|                            |
```

### 8.2 Báo cáo – Reports

```
[Admin Web Reports]            [Backend API]              [PostgreSQL]
pages/Reports.jsx                  |                            |
   |                               |                            |
   | Chọn range 7 / 30 ngày        |                            |
   |── GET /api/reports/daily      |                            |
   |   ?from=2026-04-01            |── SELECT DATE(entry_time), |
   |   &to=2026-04-30 ────────────>|   SUM(fee), COUNT          |
   |   services.js dòng 52         |   FROM parking_sessions +  |
   |                               |   guest_sessions           |
   |                               |   GROUP BY date            |
   |<── [{ date, member_revenue,   |<── rows ───────────────────|
   |      guest_revenue,           |                            |
   |      total_sessions,          |                            |
   |      auth_success_rate }]     |                            |
   |                               |                            |
   | Recharts BarChart render      |                            |
   | Nút "Xuất CSV": tạo           |                            |
   | Blob + a.click() download     |                            |
```

### 8.3 Danh sách phiên – Sessions

```
[Admin Web Sessions]           [Backend API]              [PostgreSQL]
pages/Sessions.jsx                 |                            |
   |                               |                            |
   | Tìm kiếm, lọc, phân trang     |                            |
   |── GET /api/sessions           |                            |
   |   ?search=51A&status=active   |── UNION ALL query: ───────>|
   |   &page=1&limit=50 ──────────>|   parking_sessions JOIN users|
   |   services.js dòng 16         |   UNION ALL guest_sessions |
   |                               |   WHERE + ILIKE + ORDER BY |
   |                               |   entry_time DESC          |
   |                               |   LIMIT $x OFFSET $y       |
   |<── { total, data:[...] } ─────|<── rows ───────────────────|
   |                               |                            |
   | Bảng hiển thị                 |                            |
   | Nút "Kết thúc cưỡng bức":    |                            |
   |── PATCH /api/sessions/:id/    |── UPDATE parking_sessions  |
   |   force-end ─────────────────>|   SET status='force_ended' |
   |   { reason }                  |── INSERT event_logs ───────|
   |   services.js dòng 23         |── io.emit(...)             |
```

---

## 9. Luồng Điều khiển Barrier Thủ công

### 9.1 Admin click "Mở barrier" từ trang Devices

```
[Admin Web Devices]            [Backend API]              [Hardware Bridge]    [ESP8266]
pages/Devices.jsx                  |                      wsServer.js               |
   |                               |                            |                   |
   | Nhấn nút "Mở cổng vào"        |                            |                   |
   |── POST /api/barriers/         |                            |                   |
   |   {device_id}/open ──────────>|                            |                   |
   |   { reason: "manual" }        |── INSERT                  |                   |
   |   services.js dòng 72         |   manual_overrides ───────>|                   |
   |   barriersApi.open()          |── INSERT event_logs        |                   |
   |                               |── io.emit('barrier_opened')|                   |
   |                               |                            |                   |
   |                               | Gọi Hardware Bridge WS:    |                   |
   |                               |── WebSocket send ─────────>|                   |
   |                               |   { type:'OPEN_BARRIER',   |                   |
   |                               |     gate:'entry' }         |                   |
   |                               |                ws.on('message') dòng 19       |
   |                               |                serial.openBarrier('entry')     |
   |                               |                            |── TCP "ENTRY:OPEN" ─>|
   |<── 200 { success } ──────────|                            |                   |
```

### 9.2 Admin điều khiển barrier trực tiếp qua WS (Devices page)

```
[Admin Web Devices]            [Hardware Bridge wsServer.js]
   |                               |
   | WebSocket connect :4002       |
   |──── WS connect ──────────────>| wss.on('connection', ...) dòng 14
   |                               |
   | Nhấn "Mở" / "Đóng" barrier    |
   |──── WS send ─────────────────>|
   |  { type:'OPEN_BARRIER',       | ws.on('message', raw => { (dòng 22)
   |    gate:'entry' }             |   const { type, gate } = JSON.parse(raw)
   |                               |   serial.openBarrier(gate)  (dòng 23)
   |                               | })
   |                               |── TCP/Serial write "ENTRY:OPEN" → ESP8266/Arduino
```

**File & dòng code:**
- `BuildWeb/admin-web/src/api/services.js` dòng 72 – `barriersApi.open: (deviceId, reason) => api.post('/barriers/${deviceId}/open', { reason })`
- `BuildWeb/backend/src/routes/barriers.js` – handler POST: INSERT manual_overrides, INSERT event_logs, io.emit, gọi WS Bridge
- `hardware/bridge/src/wsServer.js` dòng 19–29 – nhận lệnh OPEN_BARRIER/CLOSE_BARRIER/SIMULATE_SENSOR
- `hardware/bridge/src/wsServer.js` dòng 23–24 – `serial.openBarrier(gate)` / `serial.closeBarrier(gate)`

---

## 10. Luồng Ví Điện tử

```
[User WebApp]              [Backend API]                    [PostgreSQL]
pages/Wallet.jsx           routes/user/wallet.js            DB: wallets, wallet_transactions
   |                              |                               |
   | Xem số dư:                   |                               |
   |── GET /api/user/wallet ──────>                               |
   |   services.js dòng 24        |── SELECT balance FROM wallets |
   |                              |   WHERE user_id=$1 ──────────>|
   |<── { balance, ... } ─────────|<── row ────────────────────── |
   |                              |                               |
   | Nạp tiền (mô phỏng):         |                               |
   |── POST /api/user/wallet/     |                               |
   |   topup ─────────────────────>                               |
   |   { amount: 100000 }         |── BEGIN                       |
   |   services.js dòng 26        |── UPDATE wallets              |
   |                              |   SET balance += amount ─────>|
   |                              |── INSERT wallet_transactions  |
   |                              |   (type='topup') ────────────>|
   |                              |── COMMIT                      |
   |<── { new_balance } ──────────|                               |
   |                              |                               |
   | Phí đỗ xe được trừ tự động   |                               |
   | khi xe ra (luồng 6 ở trên)   |                               |
   |  → UPDATE wallets SET        |                               |
   |    balance -= fee            |                               |
```

**File & dòng code:**
- `WebApp/src/api/services.js` dòng 24–27 – `walletApi: { info, transactions, topup }`
- `WebApp/src/pages/Wallet.jsx` – hiển thị số dư và lịch sử giao dịch
- `BuildWeb/backend/src/index.js` dòng 60 – `app.use('/api/user/wallet', require('./routes/user/wallet'))`

---

## 11. Luồng Thẻ Tháng

```
[User WebApp]              [Backend API]              [PostgreSQL]
pages/MonthlyPasses.jsx    routes/user/monthlyPasses  DB: monthly_passes, wallets
   |                              |                          |
   | Xem giá:                     |                          |
   |── GET /api/user/monthly-     |── SELECT * FROM          |
   |   passes/price ─────────────>|   pricing_plans ─────────>|
   |<── [{ vehicle_type, price }] |<── rows ─────────────────|
   |                              |                          |
   | Đăng ký thẻ tháng:           |                          |
   |── POST /api/user/monthly-    |                          |
   |   passes ────────────────────>                          |
   |   { vehicle_id, months:1 }   |── BEGIN                  |
   |   services.js dòng 61        |── Check wallet balance   |
   |                              |── UPDATE wallets -= price |
   |                              |── INSERT monthly_passes   |
   |                              |   (valid_until = NOW +   |
   |                              |    30 * months days) ───>|
   |                              |── INSERT wallet_transactions
   |                              |── COMMIT                 |
   |<── 201 { pass_id, valid_until}|                          |
   |                              |                          |
   | (Khi xe vào bãi:             |                          |
   |  hardware.js dòng ~110       |                          |
   |  SELECT monthly_passes       |                          |
   |  WHERE vehicle_id AND active |                          |
   |  → fee=0, session_type='monthly_pass')                   |
```

**File & dòng code:**
- `WebApp/src/api/services.js` dòng 57–63 – `monthlyPassesApi`
- `BuildWeb/backend/src/routes/hardware.js` – trong handler `/entry`: kiểm tra monthly_pass hiệu lực để bỏ phí

---

## 12. Sơ đồ Tổng hợp Toàn hệ thống

```
═══════════════════════════════════════════════════════════════════════════════
                         LUỒNG DỮ LIỆU TOÀN HỆ THỐNG
═══════════════════════════════════════════════════════════════════════════════

PHẦN CỨNG NHÚNG
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  [HYSRF05]──(D9/D10)──[Arduino UNO]──(I2C 0x08/0x09)──[ESP8266 NodeMCU]  │
│   khoảng cách          entry_gate.ino  exit_gate.ino    esp8266_gate_      │
│   < 80cm               Servo D6        Servo D6         bridge.ino         │
│                                                              │              │
└──────────────────────────────────────────────────────────────│──────────────┘
                                                               │ TCP :4003
                                                               │ "ENTRY:SENSOR:DETECTED\n"
                                                               │ "EXIT:SENSOR:DETECTED\n"
                                                               ▼
HARDWARE BRIDGE (Node.js – hardware/bridge/)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  esp8266Handler.js         controller.js           wsServer.js             │
│  ┌─────────────────┐       ┌──────────────────┐    ┌──────────────────┐   │
│  │ TCP :4003 server│       │ handleEntry()    │    │ WS :4002 server  │   │
│  │ parse lines     │──────>│ handleExit()     │───>│ broadcast()      │   │
│  │ emit events     │       │ _debounced()     │    │ recv OPEN/CLOSE  │   │
│  └─────────────────┘       └──────┬───────────┘    └──────────────────┘   │
│   (fallback: serialHandler.js     │                        ▲               │
│    SerialPort USB COM6/COM11)      │                        │               │
│                                   │ HTTP                   │ WS             │
└───────────────────────────────────┼────────────────────────┼───────────────┘
                                    │                         │
         ┌──────────────────────────┤                         │
         │ POST /process/entry      │                         │
         │ POST /process/exit       │                         │
         ▼                          │ POST /api/hardware/     │
AI SERVICE (Python – hardware/ai_service/)   └──> /entry      │
┌──────────────────────────────────────┐         /exit        │
│                                      │              │        │
│  main.py (FastAPI :5001)             │              │        │
│  ┌─────────────────────────┐         │              │        │
│  │ /process/entry          │         │              │        │
│  │   CameraManager         │         │              │        │
│  │   cam0 → plate image    │         │              │        │
│  │   cam1 → face image     │         │              │        │
│  │   PlateRecognizer       │         │              │        │
│  │     contour+EasyOCR     │         │              │        │
│  │     PaddleOCR fallback  │         │              │        │
│  │   FaceRecognizer        │         │              │        │
│  │     YOLO detect         │         │              │        │
│  │     InsightFace embed   │         │              │        │
│  │     cosine_similarity   │         │              │        │
│  └─────────────────────────┘         │              │        │
│  uploads/captures/ (JPEG saved)      │              │        │
└──────────────────────────────────────┘              │        │
                                                       ▼        │
BACKEND API (Node.js – BuildWeb/backend/)              │        │
┌──────────────────────────────────────────────────────┤        │
│                                                      │        │
│  index.js (Express :4000 + Socket.IO)                │        │
│  routes/hardware.js ← POST /entry /exit ─────────────┘        │
│    hardwareAuth(x-hardware-key)                               │
│    Verify plate+face confidence                               │
│    Match face_user_id == vehicle owner                        │
│    Check monthly_pass                                         │
│    INSERT parking_sessions / guest_sessions        ┌──────────┘
│    INSERT event_logs                               │ WS :4002
│    io.emit('new_session', ...)──────────────────────────────────┐
│                                                               │  │
│  routes/auth.js          ← POST /api/auth/login               │  │
│  routes/user/auth.js     ← POST /api/user/auth/{login,register}  │
│  routes/sessions.js      ← GET  /api/sessions                 │  │
│  routes/dashboard.js     ← GET  /api/dashboard/*              │  │
│  routes/users.js         ← GET/PATCH /api/users/*             │  │
│  routes/reports.js       ← GET  /api/reports/daily            │  │
│  routes/devices.js       ← GET/PATCH /api/devices/*           │  │
│  routes/barriers.js      ← POST /api/barriers/*/open          │  │
│  routes/user/vehicles.js ← *    /api/user/vehicles            │  │
│  routes/user/wallet.js   ← *    /api/user/wallet              │  │
│  routes/user/faceImages  ← *    /api/user/face-images         │  │
│  routes/user/monthlyPass ← *    /api/user/monthly-passes      │  │
│                                                               │  │
│               middleware/auth.js    (JWT verify admin)        │  │
│               middleware/userAuth.js (JWT verify user)        │  │
│               middleware/errorHandler.js                      │  │
└───────────────────────────────────────────────────────────────┼──┘
                │ SQL                                           │
                ▼                                               │
PostgreSQL :5432                                                │
┌───────────────────────────────────────────────────────────┐  │
│ users  vehicles  face_embeddings  monthly_passes           │  │
│ parking_sessions  guest_sessions  wallets                  │  │
│ admins  admin_sessions  devices  alerts  event_logs        │  │
│ device_status_logs  manual_overrides  pricing_plans        │  │
│ parking_lots  wallet_transactions                          │  │
└───────────────────────────────────────────────────────────┘  │
                                                                │
CLIENT FRONTEND                                                 │
┌──────────────────────┐    ┌──────────────────────────────────┴──┐
│  User WebApp (React) │    │  Admin Web (React)                    │
│  WebApp/src/          │    │  BuildWeb/admin-web/src/              │
│                       │    │                                       │
│  api/client.js        │    │  api/client.js                        │
│    BASE_URL='/api/user'│   │    BASE_URL='http://localhost:4000/api'│
│    Bearer user_token  │    │    Bearer admin_token                 │
│    → fetch() calls    │    │    → fetch() calls                    │
│                       │    │                                       │
│  api/services.js      │    │  api/services.js                      │
│    authApi            │    │    authApi, dashboardApi              │
│    vehiclesApi        │    │    sessionsApi, usersApi               │
│    walletApi          │    │    reportsApi, alertsApi               │
│    sessionsApi        │    │    devicesApi, configApi               │
│    faceImagesApi      │    │    barriersApi                        │
│    monthlyPassesApi   │    │                                       │
│    notificationsApi   │    │  Socket.IO client ──────────────────>│
│                       │    │  WS :4002 client ──────────────────> │
│  store/useStore.js    │    │  (real-time dashboard updates)        │
│    Zustand state mgmt │    │                                       │
└──────────────────────┘    └───────────────────────────────────────┘
        │                              │
        └──── HTTP REST :4000 ─────────┘
```

---

## Chi tiết Token xác thực

### JWT giải mã flow

```
[Client]                       [Backend Middleware]
   |                                |
   | Header: Authorization:         |
   |  Bearer eyJhbGciOiJIUz...      |
   |────────────────────────────── >|
   |                                | middleware/auth.js (Admin):
   |                                |   jwt.verify(token, process.env.JWT_SECRET)
   |                                |   → { admin_id, role, iat, exp }
   |                                |   req.admin = decoded
   |                                |   next()
   |                                |
   |                                | middleware/userAuth.js (User):
   |                                |   jwt.verify(token, process.env.JWT_SECRET)
   |                                |   → { user_id, phone_number, iat, exp }
   |                                |   req.user = decoded
   |                                |   next()
```

Token hết hạn (401) → `client.js` dòng 22–26:
```js
if (res.status === 401) {
  localStorage.removeItem('user_token');   // hoặc 'admin_token'
  localStorage.removeItem('user_info');
  window.location.href = '/login';
  return;
}
```

---

## Tóm tắt các endpoint và file xử lý

| HTTP Method + Path | File xử lý | Giao thức xác thực |
|-------------------|-----------|-------------------|
| POST /api/auth/login | routes/auth.js | Public (rate-limited) |
| GET /api/dashboard/stats | routes/dashboard.js | Admin JWT |
| GET /api/sessions | routes/sessions.js | Admin JWT |
| GET /api/users | routes/users.js | Admin JWT |
| GET /api/reports/daily | routes/reports.js | Admin JWT |
| GET/PATCH /api/devices | routes/devices.js | Admin JWT |
| GET/PATCH /api/config/* | routes/config.js | Admin JWT |
| POST /api/barriers/:id/open | routes/barriers.js | Admin JWT |
| POST /api/hardware/entry | routes/hardware.js | x-hardware-key header |
| POST /api/hardware/exit | routes/hardware.js | x-hardware-key header |
| POST /api/user/auth/register | routes/user/auth.js | Public |
| POST /api/user/auth/login | routes/user/auth.js | Public (rate-limited) |
| * /api/user/vehicles | routes/user/vehicles.js | User JWT |
| * /api/user/wallet | routes/user/wallet.js | User JWT |
| * /api/user/face-images | routes/user/faceImages.js | User JWT |
| * /api/user/monthly-passes | routes/user/monthlyPasses.js | User JWT |
| * /api/user/sessions | routes/user/sessions.js | User JWT |
| POST /process/entry | ai_service/main.py | Nội bộ (không có auth) |
| POST /process/exit | ai_service/main.py | Nội bộ (không có auth) |
| POST /faces/reload | ai_service/main.py | Nội bộ (không có auth) |

---

*Tài liệu luồng dữ liệu – Hệ thống Bãi Đỗ Xe Thông Minh – Tháng 4/2026*
