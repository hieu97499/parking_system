# BÀI THUYẾT TRÌNH: HỆ THỐNG BÃI XE THÔNG MINH
## Đồ án tốt nghiệp

---

# TỔNG QUAN HỆ THỐNG

## Kiến trúc tổng thể

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Phần cứng  │────▶│   Bridge    │────▶│  AI Service │     │   Backend   │
│ (IoT Gate)  │◀────│  Service    │◀────│  (FastAPI)  │     │ (Express.js)│
└─────────────┘     └──────┬──────┘     └─────────────┘     └──────┬──────┘
                           │                                        │
                           └──────────── HTTP ──────────────────────┘
                                                                    │
                    ┌─────────────┐     ┌─────────────┐     ┌──────┴──────┐
                    │  WebApp     │     │  AdminWeb   │     │ OperatorWeb │
                    │ (React)     │     │  (React)    │     │  (React)    │
                    └─────────────┘     └─────────────┘     └─────────────┘
```

---

# PHÂN CÔNG CÔNG VIỆC

| Sinh viên | Phạm vi |
|-----------|---------|
| SV1 | Thiết kế hệ thống thiết bị IoT, AI Service |
| SV2 | Xử lý logic thanh toán, tính phí, bảo mật giao dịch |
| SV3 | Hệ thống quản trị web, quản lý bãi xe, cloud server |

---
---

# PHẦN 1: SINH VIÊN 1
## Thiết kế hệ thống thiết bị IoT & AI Service

---

## 1.1. Tổng quan thiết bị IoT

### Sơ đồ cổng vào/ra

```
┌───────────────────── CỔNG VÀO ─────────────────────┐
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Camera   │  │ Camera   │  │ Cảm biến hồng    │  │
│  │ biển số  │  │ khuôn mặt│  │ ngoại (IR)       │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                  │            │
│       └──────────────┼──────────────────┘            │
│                      ▼                               │
│             ┌─────────────────┐                      │
│             │   ESP8266       │◀──── WiFi TCP ─────▶ Bridge
│             │   Controller    │                      │
│             └────────┬────────┘                      │
│                      ▼                               │
│             ┌─────────────────┐                      │
│             │  Servo Barrier  │                      │
│             └─────────────────┘                      │
└──────────────────────────────────────────────────────┘
```

---

## 1.2. Phần cứng sử dụng

| Thiết bị | Số lượng | Vai trò |
|----------|----------|---------|
| Camera IP (RTSP) | 4 | Chụp biển số + khuôn mặt (2/cổng) |
| ESP8266 | 2 | Điều khiển cổng vào/ra qua WiFi TCP |
| Arduino (Entry/Exit Gate) | 2 | Xử lý cảm biến + servo |
| Cảm biến hồng ngoại (IR) | 2 | Phát hiện xe đến cổng |
| Servo motor | 2 | Điều khiển barrier |
| Máy tính điều khiển | 1 | Chạy Bridge + AI Service |

---

## 1.3. Truyền thông giữa các thành phần

### Giao thức kết nối

```
Camera ──── RTSP (1280×720, 15fps) ────▶ AI Service (OpenCV)

ESP8266 ──── WiFi TCP Socket ────▶ Bridge Service (Node.js)

Arduino ──── Serial/I2C ────▶ ESP8266

Bridge ──── HTTP REST ────▶ AI Service (localhost:5001)

Bridge ──── HTTP REST ────▶ Backend (VPS)

Bridge ──── WebSocket ────▶ OperatorWeb (realtime)
```

---

## 1.4. Luồng xử lý tại cổng vào

```
1. Cảm biến IR phát hiện xe → ESP8266 gửi tín hiệu TCP
2. Bridge nhận tín hiệu → Gọi AI Service (POST /process/entry)
3. AI Service:
   a. Camera 1: Chụp ảnh → YOLOv8 detect biển số → PaddleOCR đọc ký tự
   b. Camera 2: Chụp ảnh → YOLOv8 detect mặt → InsightFace nhận diện
4. Trả kết quả JSON: { plate, user_id, confidence }
5. Bridge gửi Backend xác thực → Tạo parking session
6. Mở barrier (servo) → Cập nhật slot count
```

---

## 1.5. AI Service – Kiến trúc

### Công nghệ sử dụng

| Thành phần | Công nghệ | Vai trò |
|------------|-----------|---------|
| Framework | FastAPI + Uvicorn | HTTP server async |
| Camera | OpenCV (RTSP) | Thu thập frame |
| Detect biển số | YOLOv8 (conf ≥ 0.5) | Phát hiện vùng biển số |
| OCR | PaddleOCR | Đọc ký tự biển số |
| Detect mặt | YOLOv8 (conf ≥ 0.6) | Phát hiện khuôn mặt |
| Nhận diện mặt | InsightFace (buffalo_sc) | Trích xuất embedding 512D |
| Tính toán | NumPy | Cosine similarity |

---

## 1.6. AI Service – Endpoints

| Endpoint | Chức năng |
|----------|-----------|
| `GET /health` | Kiểm tra trạng thái |
| `GET /cameras` | Liệt kê camera |
| `POST /capture/{cam_index}` | Chụp ảnh từ camera |
| `POST /recognize/plate` | Nhận diện biển số |
| `POST /recognize/face` | Nhận diện khuôn mặt |
| `POST /process/entry` | Pipeline đầy đủ cổng vào |
| `POST /process/exit` | Pipeline đầy đủ cổng ra |
| `POST /faces/reload` | Reload face embeddings |

---

## 1.7. Pipeline nhận diện biển số

```
Ảnh gốc (1280×720)
    │
    ▼
┌────────────────┐
│ YOLOv8 detect  │ ──▶ Bounding box biển số (conf ≥ 0.5)
└───────┬────────┘
        ▼
┌────────────────┐
│  Crop & Resize │
└───────┬────────┘
        ▼
┌────────────────┐
│  PaddleOCR     │ ──▶ Chuỗi ký tự thô
└───────┬────────┘
        ▼
┌────────────────┐
│ Regex Validate │ ──▶ [0-9]{2}[A-Z]{1,2}[0-9]{4,5}
└───────┬────────┘
        ▼
   Biển số hợp lệ
```

---

## 1.8. Pipeline nhận diện khuôn mặt

```
Ảnh gốc (1280×720)
    │
    ▼
┌──────────────────┐
│ YOLOv8 detect    │ ──▶ Bounding box khuôn mặt (conf ≥ 0.6)
└───────┬──────────┘
        ▼
┌──────────────────┐
│ InsightFace      │ ──▶ Vector embedding 512 chiều
│ (buffalo_sc)     │
└───────┬──────────┘
        ▼
┌──────────────────┐
│ Cosine Similarity│ ──▶ So sánh với DB (face_embeddings)
│ (NumPy)          │
└───────┬──────────┘
        ▼
   user_id + confidence
```

---

## 1.9. Công cụ phần mềm – SV1

| Công cụ | Phiên bản | Mục đích |
|---------|-----------|----------|
| Python | 3.10+ | Ngôn ngữ chính AI Service |
| OpenCV | 4.x | Đọc RTSP stream, tiền xử lý ảnh |
| NumPy | 1.x | Tính toán vector, cosine similarity |
| YOLOv8 | Ultralytics | Phát hiện biển số + khuôn mặt |
| InsightFace | buffalo_sc | Nhận diện khuôn mặt (embedding) |
| PaddleOCR | - | Đọc ký tự biển số (hỗ trợ tiếng Việt) |
| FastAPI | - | API framework cho AI Service |
| VS Code | - | IDE phát triển |

---
---

# PHẦN 2: SINH VIÊN 2
## Xây dựng phân hệ xử lý logic thanh toán, tính phí, bảo mật giao dịch

---

## 2.1. Tổng quan phân hệ thanh toán

### Chức năng chính

- Quản lý **parking sessions** (member + guest)
- Tính phí tự động theo thời gian gửi xe
- Xác thực danh tính tại cổng (biển số + khuôn mặt)
- Bảo mật giao dịch với JWT + bcrypt
- Ghi log toàn bộ sự kiện giao dịch

---

## 2.2. Luồng xử lý thanh toán

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Cổng vào   │────▶│   Bridge    │────▶│   Backend    │
│  (Entry)    │     │  Service    │     │  (Express)   │
└─────────────┘     └──────┬──────┘     └──────┬───────┘
                           │                    │
                           │              ┌─────▼──────┐
                           │              │ Tạo Session │
                           │              │ entry_time  │
                           │              │ license_plate│
                           │              │ user_id     │
                           │              └────────────┘
                           │
┌─────────────┐     ┌──────┴──────┐     ┌──────────────┐
│  Cổng ra    │────▶│   Bridge    │────▶│   Backend    │
│  (Exit)     │     │  Service    │     │  (Express)   │
└─────────────┘     └─────────────┘     └──────┬───────┘
                                                │
                                          ┌─────▼──────┐
                                          │ Kết session │
                                          │ exit_time   │
                                          │ Tính phí    │
                                          │ Thu tiền    │
                                          └────────────┘
```

---

## 2.3. Cơ chế tính phí

### Phân loại phiên gửi xe

| Loại | Mô tả | Tính phí |
|------|--------|----------|
| **Member** | Người dùng đã đăng ký (có user_id) | Theo gói/thời gian |
| **Guest** | Khách vãng lai (chỉ có biển số) | Theo giờ gửi |

### Công thức tính phí

```
fee = ceil((exit_time - entry_time) / pricing_unit) × unit_price
```

- Hỗ trợ nhiều mức giá theo loại xe, thời gian
- Lưu kết quả vào trường `fee` trong `parking_sessions` / `guest_sessions`

---

## 2.4. Xác thực tại cổng

### Cổng vào (Entry Verification)

```
1. AI nhận diện biển số + khuôn mặt
2. Bridge gửi Backend:
   - license_plate
   - user_id (từ face recognition)
   - entry images
3. Backend kiểm tra:
   ✓ Biển số đã đăng ký? → Member session
   ✗ Không có user_id? → Guest session
4. Tạo parking_session record
5. Phản hồi Bridge → Mở barrier
```

### Cổng ra (Exit Verification)

```
1. AI nhận diện biển số
2. Backend tra cứu session đang active với biển số đó
3. Đối chiếu thông tin → Tính phí → Kết session
4. Phản hồi Bridge → Mở barrier
```

---

## 2.5. Bảo mật giao dịch

### Xác thực & Phân quyền

| Cơ chế | Công nghệ | Mục đích |
|--------|-----------|----------|
| Mã hóa mật khẩu | bcrypt (salt rounds) | Bảo vệ mật khẩu admin |
| Token xác thực | JWT (jsonwebtoken) | Xác thực API requests |
| Session tracking | admin_sessions table | Ghi nhận phiên đăng nhập |
| Token hash | SHA-256 | Lưu token an toàn trong DB |
| IP logging | req.ip | Truy vết truy cập |

---

## 2.6. Middleware bảo mật

```
Request ──▶ auth.js middleware ──▶ Route handler
              │
              ├── Kiểm tra Authorization header
              ├── Verify JWT token (JWT_SECRET)
              ├── Decode payload: { id, username, role }
              ├── Kiểm tra token trong admin_sessions
              └── Gắn req.admin = decoded info
```

### Phân quyền theo role

- **super_admin**: Toàn quyền quản trị
- **admin**: Quản lý bãi xe, người dùng
- **operator**: Vận hành, xử lý sự cố tại cổng

---

## 2.7. Bridge Service – Cầu nối thanh toán

### Vai trò trong luồng giao dịch

```javascript
// Luồng xử lý tại Bridge (controller.js)
1. Nhận tín hiệu ESP8266 (xe vào/ra)
2. Gọi AI Service → Lấy plate + user_id
3. Gọi Backend API → Xác thực + tạo/kết session
4. Nhận phản hồi → Điều khiển barrier
5. Broadcast realtime qua WebSocket
```

### Tính năng an toàn

- **Debounce**: Tránh xử lý trùng lặp (configurable ms)
- **Processing lock**: Ngăn xử lý song song cùng cổng
- **Timeout handling**: Xử lý khi AI/Backend không phản hồi
- **Error broadcasting**: Thông báo lỗi realtime cho operator

---

## 2.8. Cơ sở dữ liệu giao dịch

### Bảng chính

| Bảng | Mục đích |
|------|----------|
| `parking_sessions` | Phiên gửi xe member |
| `guest_sessions` | Phiên gửi xe khách |
| `users` | Thông tin người dùng đăng ký |
| `face_embeddings` | Vector khuôn mặt 512D |
| `admin_sessions` | Phiên đăng nhập admin |
| `event_logs` | Log toàn bộ sự kiện hệ thống |

### Trường quan trọng trong parking_sessions

```sql
session_id, user_id, license_plate,
entry_time, exit_time, status,
fee, session_type,
entry_composite_image_path,
exit_composite_image_path,
force_ended_by, force_end_reason
```

---

## 2.9. Công cụ phần mềm – SV2

| Công cụ | Mục đích |
|---------|----------|
| Node.js 20 LTS | Runtime cho Bridge + Backend |
| Express.js | RESTful API framework |
| JWT (jsonwebtoken) | Token-based authentication |
| bcryptjs | Mã hóa mật khẩu |
| PostgreSQL | Cơ sở dữ liệu giao dịch |
| WebSocket (ws) | Realtime communication |
| VS Code | IDE phát triển |

---
---

# PHẦN 3: SINH VIÊN 3
## Xây dựng hệ thống quản trị web & Cloud Server

---

## 3.1. Tổng quan hệ thống web

### Ba ứng dụng React

| Ứng dụng | Đối tượng | Chức năng |
|-----------|-----------|-----------|
| **WebApp** | Người dùng cuối | Đăng ký, xem lịch sử, nạp tiền |
| **AdminWeb** | Quản trị viên | Quản lý toàn bộ hệ thống |
| **OperatorWeb** | Nhân viên vận hành | Giám sát realtime, xử lý sự cố |

---

## 3.2. AdminWeb – Chức năng quản trị

### Các module quản lý

```
AdminWeb
├── Dashboard (Tổng quan doanh thu, số xe, thống kê)
├── Sessions (Quản lý phiên gửi xe)
├── Users (Quản lý người dùng, vehicles, face)
├── Barriers (Điều khiển barrier từ xa)
├── Devices (Quản lý thiết bị IoT)
├── Reports (Báo cáo doanh thu, thống kê)
├── Event Logs (Nhật ký sự kiện)
├── Alerts (Cảnh báo hệ thống)
└── Config (Cấu hình hệ thống)
```

---

## 3.3. Backend API – Cấu trúc routes

| Route | Chức năng |
|-------|-----------|
| `/api/auth` | Đăng nhập, đăng xuất admin |
| `/api/dashboard` | Dữ liệu tổng quan |
| `/api/sessions` | CRUD phiên gửi xe |
| `/api/users` | Quản lý người dùng |
| `/api/barriers` | Điều khiển barrier |
| `/api/devices` | Quản lý thiết bị |
| `/api/reports` | Báo cáo, thống kê |
| `/api/event-logs` | Nhật ký hệ thống |
| `/api/alerts` | Cảnh báo |
| `/api/hardware` | Trạng thái phần cứng |
| `/api/config` | Cấu hình hệ thống |

---

## 3.4. OperatorWeb – Giao diện vận hành

### Tính năng realtime

```
┌────────────────────────────────────────────┐
│            OPERATOR WEB                     │
├────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐               │
│  │ Camera   │  │ Camera   │  ← Live view  │
│  │ Entry    │  │ Exit     │               │
│  └──────────┘  └──────────┘               │
│                                            │
│  [Trạng thái cổng vào]  [Trạng thái cổng ra]  │
│  [Biển số: 30A-12345]   [Biển số: ...]    │
│  [User: Nguyễn Văn A]   [User: ...]       │
│                                            │
│  [🔓 Mở barrier]  [🚫 Force close]        │
│  [📋 Event log realtime]                   │
└────────────────────────────────────────────┘
```

- WebSocket broadcast từ Bridge Service
- Cập nhật trạng thái cổng theo thời gian thực
- Cho phép operator can thiệp thủ công

---

## 3.5. Kiến trúc Cloud Server (VPS)

```
┌─────────────────── VPS (Cloud) ───────────────────┐
│                                                     │
│  ┌──────────────┐   ┌──────────────┐              │
│  │   Nginx      │   │  PostgreSQL  │              │
│  │ (Reverse     │   │  Database    │              │
│  │  Proxy +     │   └──────────────┘              │
│  │  Static)     │                                  │
│  └──────┬───────┘   ┌──────────────┐              │
│         │            │   Backend    │              │
│         ├───────────▶│  (Express)   │              │
│         │            │  Port: 3000  │              │
│         │            └──────────────┘              │
│         │                                          │
│         ├───── Serve static files ────┐            │
│         │                             │            │
│  ┌──────┴───┐  ┌──────────┐  ┌──────┴────┐      │
│  │ AdminWeb │  │ WebApp   │  │OperatorWeb│      │
│  │ (build)  │  │ (build)  │  │ (build)   │      │
│  └──────────┘  └──────────┘  └───────────┘      │
└─────────────────────────────────────────────────────┘

┌─────────────── Local (Bãi xe) ────────────────────┐
│  ┌──────────────┐   ┌──────────────┐              │
│  │   Bridge     │   │  AI Service  │              │
│  │  Service     │──▶│  (FastAPI)   │              │
│  │  (Node.js)   │   │  Port: 5001  │              │
│  └──────────────┘   └──────────────┘              │
└─────────────────────────────────────────────────────┘
```

---

## 3.6. Công nghệ Frontend

### Stack công nghệ

| Công nghệ | Vai trò |
|-----------|---------|
| React | Component-based UI library |
| Vite | Build tool (dev: ES Modules, prod: Rollup) |
| Tailwind CSS | Utility-first CSS framework |
| React Router | Client-side routing |
| Axios/Fetch | HTTP client |
| WebSocket API | Realtime communication |

### Lợi ích của Vite

- ⚡ Dev server khởi động < 1s (ES Modules native)
- 🔥 Hot Module Replacement cực nhanh
- 📦 Production build tối ưu với Rollup
- 🗜️ Code splitting + tree shaking

---

## 3.7. Quản lý người dùng

### Chức năng

- Đăng ký tài khoản (phone, email, full_name)
- Đăng ký khuôn mặt (upload → InsightFace → embedding → DB)
- Đăng ký biển số xe (vehicles table)
- Xem lịch sử gửi xe
- Quản lý thông tin cá nhân

### Luồng đăng ký khuôn mặt

```
User upload ảnh → Backend nhận file
→ Gọi AI Service /recognize/face
→ Trích xuất embedding 512D
→ Lưu vào face_embeddings table
→ Phản hồi thành công
```

---

## 3.8. Quản lý doanh thu & Báo cáo

### Dashboard thống kê

- Tổng doanh thu (ngày/tuần/tháng)
- Số phiên gửi xe (member vs guest)
- Số chỗ trống hiện tại
- Biểu đồ xu hướng

### Báo cáo chi tiết

- Xuất báo cáo theo khoảng thời gian
- Phân tích giờ cao điểm
- Thống kê theo loại xe
- Doanh thu theo ngày/tháng

---

## 3.9. Triển khai & DevOps

### Deployment workflow

```
Developer ──▶ Git Push ──▶ VPS
                              │
                    ┌─────────┴─────────┐
                    │                    │
              Build Frontend       Restart Backend
              (npm run build)      (pm2 restart)
                    │                    │
              Copy to Nginx        Express reload
              static folder
```

### Cấu hình production

- **Nginx**: Reverse proxy + serve static + SSL
- **PM2**: Process manager cho Node.js
- **PostgreSQL**: Database chạy trên VPS
- **.env**: Quản lý biến môi trường riêng biệt

---

## 3.10. Công cụ phần mềm – SV3

| Công cụ | Mục đích |
|---------|----------|
| React | Xây dựng giao diện 3 ứng dụng web |
| Vite | Build tool hiện đại |
| Tailwind CSS | Styling utility-first |
| Node.js + Express | Backend API server |
| PostgreSQL | Cơ sở dữ liệu |
| Nginx | Web server + reverse proxy |
| PM2 | Process manager |
| Git | Quản lý mã nguồn |
| VS Code | IDE phát triển |

---
---

# 3.1. CÔNG CỤ PHỤC VỤ XÂY DỰNG PHẦN MỀM
## (Tổng hợp toàn hệ thống)

---

## 3.1.1. Python

- Ngôn ngữ chính cho **AI Service**
- Hệ sinh thái ML/AI phong phú
- YOLOv8, InsightFace, PaddleOCR đều tối ưu cho Python
- Chạy trong virtual environment riêng biệt
- Cú pháp ngắn gọn, phát triển nhanh

---

## 3.1.2. OpenCV

- Thư viện xử lý ảnh mã nguồn mở #1 thế giới
- **Vai trò**: Đọc luồng RTSP từ 4 camera IP
- Độ phân giải: 1280×720 @ 15 FPS
- Tiền xử lý: resize, crop vùng quan tâm
- Chế độ lazy capture tiết kiệm CPU

---

## 3.1.3. NumPy

- Thư viện tính toán khoa học cốt lõi
- **Vai trò**: Biểu diễn ảnh dạng mảng N chiều
- Tính cosine similarity giữa face embeddings
- Nền tảng cho hầu hết thư viện AI/ML Python

---

## 3.1.4. YOLOv8

- Thuật toán phát hiện đối tượng realtime
- One-pass detection: nhanh và chính xác
- **2 nhiệm vụ**: Detect biển số (conf ≥ 0.5) + Detect mặt (conf ≥ 0.6)
- Phiên bản mới nhất của Ultralytics

---

## 3.1.5. InsightFace

- Thư viện nhận diện khuôn mặt hiệu năng cao
- Model: **buffalo_sc** (nhẹ, chạy tốt trên CPU)
- Tạo embedding 512 chiều cho mỗi khuôn mặt
- Không cần train lại khi thêm user mới
- Cosine similarity để matching

---

## 3.1.6. PaddleOCR

- OCR mã nguồn mở của Baidu
- Hỗ trợ đa ngôn ngữ (bao gồm tiếng Việt)
- Hiệu quả với biển số xe
- Validate regex: `[0-9]{2}[A-Z]{1,2}[0-9]{4,5}`

---

## 3.1.7. FastAPI

- Framework API hiện đại, hỗ trợ async/await
- Tự động sinh OpenAPI documentation
- **Endpoints**: `/process/entry`, `/process/exit`
- Server: Uvicorn (ASGI) production mode
- Xử lý đồng thời nhiều request nhận diện

---

## 3.1.8. Node.js & Express.js

- **Node.js 20 LTS**: Runtime JavaScript server-side
- I/O bất đồng bộ, non-blocking
- **Express.js**: RESTful API framework
- **2 thành phần**:
  - Backend (VPS): API + JWT + RBAC
  - Bridge (Local): Điều phối phần cứng ↔ AI ↔ Backend

---

## 3.1.9. React & Vite

- **React**: UI library (Meta), Component-based
- **Vite**: Build tool thế hệ mới
  - Dev: ES Modules native → khởi động cực nhanh
  - Prod: Rollup bundle → tối ưu static files
- **3 ứng dụng**: WebApp, AdminWeb, OperatorWeb
- Phục vụ bởi Nginx ở production

---

## 3.1.10. Tailwind CSS

- Framework CSS utility-first
- Kết hợp class trực tiếp trong JSX
- Đồng nhất cho cả 3 ứng dụng React
- Giảm thiểu CSS tùy chỉnh

---

## 3.1.11. Visual Studio Code

- IDE mã nguồn mở phổ biến nhất
- Hỗ trợ đa ngôn ngữ: Python, JavaScript, C++
- Tích hợp: IntelliSense, Git, Terminal
- Extensions phong phú cho toàn bộ stack

---
---

# 3.2. PHẦN CỨNG VÀ THIẾT BỊ THỰC HIỆN

---

## Mô hình nguyên mẫu

- Lắp ráp thủ công từ module rời
- Kết nối: dây jumper + hàn thiếc
- **2 cổng độc lập** (vào + ra), mỗi cổng gồm:
  - Cảm biến phát hiện xe (IR)
  - Servo barrier
  - 2 Camera (biển số + khuôn mặt)

---

## Camera

- **Số lượng**: 4 camera IP
- **Kết nối**: RTSP qua mạng LAN
- **Bố trí**: 2 camera/cổng
  - Camera 1: Góc thấp → chụp biển số
  - Camera 2: Góc cao → chụp khuôn mặt
- **Thông số**: 1280×720px, 15 FPS
- Đảm bảo chất lượng cho AI nhận diện

---
---

# KẾT LUẬN

## Kết quả đạt được

✅ Hệ thống IoT hoàn chỉnh với 2 cổng vào/ra tự động

✅ AI nhận diện biển số + khuôn mặt chính xác

✅ Quản lý giao dịch thanh toán tự động

✅ Hệ thống web quản trị đầy đủ chức năng

✅ Triển khai cloud server hoàn chỉnh

✅ Realtime monitoring cho operator

---

## Hướng phát triển

- Tích hợp thanh toán trực tuyến (VNPay, MoMo)
- Mở rộng nhận diện loại xe (ô tô, xe máy, xe điện)
- App mobile cho người dùng
- Hệ thống dẫn đường tìm chỗ trống
- Scale nhiều bãi xe trong cùng hệ thống

---

# CẢM ƠN HỘI ĐỒNG ĐÃ LẮNG NGHE!

## Q&A
