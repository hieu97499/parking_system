# 🅿️ HỆ THỐNG BÃI ĐỖ XE THÔNG MINH (Smart Parking System)

## 📌 Mục Lục
1. [Tổng Quan Dự Án](#-tổng-quan-dự-án)
2. [Kiến Trúc Hệ Thống](#-kiến-trúc-hệ-thống)
3. [Công Nghệ & Ngôn Ngữ Sử Dụng](#-công-nghệ--ngôn-ngữ-sử-dụng)
4. [Cấu Trúc Thư Mục & Giải Thích Các File](#-cấu-trúc-thư-mục--giải-thích-các-file)
5. [Cài Đặt & Chạy Dự Án](#-cài-đặt--chạy-dự-án)
6. [Luồng Hoạt Động Chi Tiết](#-luồng-hoạt-động-chi-tiết)
7. [Cơ Sở Dữ Liệu](#-cơ-sở-dữ-liệu)
8. [Các Thành Phần Chính](#-các-thành-phần-chính)

---

## 🎯 Tổng Quan Dự Án

### Định Nghĩa
Một **hệ thống bãi đỗ xe tự động hoàn toàn** kết hợp:
- 🤖 **Trí tuệ nhân tạo (AI)** – Nhận diện biển số xe và khuôn mặt người
- 🔌 **IoT (Internet of Things)** – Arduino, ESP8266, cảm biến, servo motor
- 💻 **Web Application** – Giao diện cho quản lý viên và người dùng
- 📱 **Hệ thống cloud** – Backend API, database

### Mục Đích
- ✅ **Tự động hóa** quá trình vào/ra xe
- ✅ **Nhận diện** biển số + khuôn mặt người điều khiển
- ✅ **Quản lý** phiên đỗ, tính phí tự động
- ✅ **Báo cáo** doanh thu và thống kê
- ✅ **Giám sát** thiết bị bằng giao diện web

---

## 🏗️ Kiến Trúc Hệ Thống

### Sơ Đồ Tổng Quát

```
┌────────────────────────────────────────────────────────────────┐
│              PHẦN CỨNG (Hardware Layer)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Arduino  │  │ Arduino  │  │ Camera ×4│  │HYSRF05 ×2│       │
│  │  UNO ×2  │  │ESP8266 ×2│  │ 1280×720 │  │Cảm biến  │       │
│  │(Cổng I/O)│  │WiFi Bridge  │15 FPS    │  │Siêu âm  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                       ↓ I2C + WiFi                             │
├────────────────────────────────────────────────────────────────┤
│      Hardware Bridge (Node.js + WebSocket)                      │
│        Cầu nối: ESP8266 ↔ AI Service ↔ Backend               │
├────────────────────────────────────────────────────────────────┤
│          AI Service (Python FastAPI - Port 5001)               │
│      ┌─────────────────┬──────────────────┐                   │
│      │ Plate Detection │ Face Recognition │                   │
│      │ (YOLOv8 + OCR) │ (YOLOv8 + ArcFace)│                   │
│      └─────────────────┴──────────────────┘                   │
├────────────────────────────────────────────────────────────────┤
│     Backend API (Node.js Express + PostgreSQL)                 │
│  Quản lý: Users | Sessions | Devices | Reports | Alerts      │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┬────────────────────┐                │
│  │  Admin Web (Port 3000)│  User App (Port 5175)              │
│  │  React + Tailwind   │  React + Tailwind                   │
│  │  Dashboard, Devices │  Dashboard, Vehicles                │
│  └──────────────────────┴────────────────────┘                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Công Nghệ & Ngôn Ngữ Sử Dụng

### Phần Frontend (Giao Diện Người Dùng)

| Công Nghệ | Phiên Bản | Mục Đích |
|-----------|----------|---------|
| **React** | 18.3.1 | Framework UI |
| **React Router** | 6.26.2 | Điều hướng trang |
| **Tailwind CSS** | 3.4.13 | Styling responsive |
| **Zustand** | 4.5.5 | State management |
| **Socket.io-client** | 4.8.3 | Real-time updates |
| **Recharts** | 2.12.7 | Biểu đồ, thống kê |
| **Lucide React** | 0.441.0 | Icons |
| **Vite** | 5.4.8 | Build tool (nhanh hơn Webpack) |

### Phần Backend (Máy Chủ)

| Công Nghệ | Phiên Bản | Mục Đích |
|-----------|----------|---------|
| **Node.js** | LTS | JavaScript Runtime |
| **Express.js** | 4.19.2 | Web Framework |
| **PostgreSQL** | 12+ | Database |
| **Socket.io** | 4.8.3 | Real-time communication |
| **JWT** | 9.0.2 | Xác thực token |
| **bcryptjs** | 2.4.3 | Mã hóa mật khẩu |
| **dotenv** | 16.4.5 | Quản lý biến môi trường |
| **Helmet** | 7.1.0 | Security headers |
| **CORS** | 2.8.5 | Cross-Origin Resource |

### Phần AI Service (Nhận Diện)

| Công Nghệ | Phiên Bản | Mục Đích |
|-----------|----------|---------|
| **Python** | 3.8+ | Ngôn ngữ lập trình |
| **FastAPI** | 0.111.0 | REST API framework |
| **Uvicorn** | 0.29.0 | ASGI Server |
| **OpenCV** | 4.9.0.80 | Xử lý ảnh/video |
| **YOLOv8** | 8.2.0+ | Phát hiện đối tượng |
| **EasyOCR** | 1.7.1+ | Đọc biển số (OCR) |
| **InsightFace** | 0.7.3+ | Nhận diện khuôn mặt |
| **ONNX Runtime** | 1.18.0+ | Inference engine |
| **NumPy** | 1.26.4 | Tính toán ma trận |

### Phần Cứng (Embedded)

| Thiết Bị | Công Nghệ | Mục Đích |
|----------|-----------|---------|
| **Arduino Uno** | C++ | Điều khiển cảm biến + servo |
| **ESP8266** | C++ (Arduino IDE) | WiFi bridge, I2C Master |
| **HYSRF05** | Siêu âm | Phát hiện xe (80cm) |
| **Servo Motor** | PWM | Mở/đóng thanh chắn |
| **Camera USB** | Video | Chụp ảnh biển số + mặt |

---

## 📁 Cấu Trúc Thư Mục & Giải Thích Các File

```
parking_system-main/
│
├── 📄 README.md (File này)
├── 📄 BAO_CAO_CONG_NGHE.md (Báo cáo công nghệ)
├── 📄 BAO_CAO_KET_QUA_THUC_NGHIEM.md (Báo cáo kết quả)
├── 📄 start-all.bat / start-all.ps1 (Script khởi động tất cả)
│
├── 📁 BuildWeb/ (Phần Frontend + Backend chính)
│   │
│   ├── 📁 admin-web/ (Giao diện quản lý viên - Port 3000)
│   │   ├── 📁 src/
│   │   │   ├── 📁 pages/
│   │   │   │   ├── Dashboard.jsx (Trang chủ - KPI, biểu đồ)
│   │   │   │   ├── Sessions.jsx (Quản lý phiên đỗ xe)
│   │   │   │   ├── Users.jsx (Quản lý người dùng)
│   │   │   │   ├── Devices.jsx (Giám sát thiết bị)
│   │   │   │   ├── EventLogs.jsx (Nhật ký sự kiện)
│   │   │   │   ├── Reports.jsx (Báo cáo doanh thu)
│   │   │   │   ├── Alerts.jsx (Cảnh báo hệ thống)
│   │   │   │   ├── Config.jsx (Cấu hình hệ thống)
│   │   │   │   └── Login.jsx (Đăng nhập)
│   │   │   ├── 📁 components/
│   │   │   │   ├── Layout.jsx (Bố cục chính)
│   │   │   │   ├── Sidebar.jsx (Menu bên trái)
│   │   │   │   ├── Header.jsx (Thanh tiêu đề)
│   │   │   │   └── HardwareMonitor.jsx (Giám sát phần cứng)
│   │   │   ├── 📁 store/
│   │   │   │   └── useStore.js (Zustand - Quản lý state toàn cục)
│   │   │   ├── 📁 api/
│   │   │   │   ├── client.js (Axios instance với headers)
│   │   │   │   └── services.js (Các hàm gọi API)
│   │   │   ├── App.jsx (Component chính, định nghĩa routes)
│   │   │   └── main.jsx (Entry point)
│   │   ├── vite.config.js (Cấu hình Vite)
│   │   ├── tailwind.config.js (Cấu hình Tailwind CSS)
│   │   ├── postcss.config.js (PostCSS config)
│   │   └── package.json (Thư viện phụ thuộc)
│   │
│   ├── 📁 backend/ (API Backend chính - Express)
│   │   ├── 📁 src/
│   │   │   ├── index.js (Entry point - Khởi động server)
│   │   │   ├── db.js (Kết nối PostgreSQL pool)
│   │   │   ├── 📁 middleware/
│   │   │   │   ├── auth.js (Xác thực JWT)
│   │   │   │   └── errorHandler.js (Xử lý lỗi)
│   │   │   ├── 📁 routes/
│   │   │   │   ├── auth.js (Login, Register, Logout)
│   │   │   │   ├── sessions.js (Quản lý phiên đỗ)
│   │   │   │   ├── devices.js (Quản lý thiết bị)
│   │   │   │   ├── users.js (Quản lý người dùng)
│   │   │   │   ├── dashboard.js (Thống kê KPI)
│   │   │   │   ├── reports.js (Báo cáo doanh thu)
│   │   │   │   ├── eventLogs.js (Nhật ký sự kiện)
│   │   │   │   ├── alerts.js (Cảnh báo)
│   │   │   │   ├── hardware.js (API cho phần cứng gọi tới)
│   │   │   │   ├── barriers.js (Điều khiển cổng)
│   │   │   │   └── config.js (Cấu hình hệ thống)
│   │   │   └── 📁 uploads/
│   │   │       ├── captures/ (Ảnh khi xe vào/ra)
│   │   │       └── faces/ (Ảnh khuôn mặt người dùng)
│   │   ├── .env (Biến môi trường)
│   │   └── package.json
│   │
│   ├── 📁 database/
│   │   └── parking_system_latest.sql (SQL schema + dữ liệu ban đầu)
│   │
│   └── package.json (Root package cho admin-web + backend)
│
├── 📁 WebApp/ (Giao diện người dùng - Port 5175)
│   ├── 📁 src/
│   │   ├── 📁 pages/
│   │   │   ├── Login.jsx (Đăng nhập)
│   │   │   ├── Register.jsx (Đăng ký)
│   │   │   ├── Dashboard.jsx (Trang chủ người dùng)
│   │   │   ├── Vehicles.jsx (Danh sách xe đăng ký)
│   │   │   ├── Sessions.jsx (Lịch sử đỗ xe)
│   │   │   ├── Wallet.jsx (Ví tiền)
│   │   │   ├── Authorizations.jsx (Uỷ quyền truy cập)
│   │   │   ├── Profile.jsx (Thông tin cá nhân)
│   │   │   ├── MonthlyPasses.jsx (Gói hộp tháng)
│   │   │   └── Notifications.jsx (Thông báo)
│   │   ├── 📁 components/
│   │   │   ├── Layout.jsx (Bố cục)
│   │   │   ├── Header.jsx (Thanh tiêu đề)
│   │   │   ├── BottomNav.jsx (Navigation mobile)
│   │   │   └── ...
│   │   ├── 📁 store/
│   │   │   └── useStore.js (State management)
│   │   ├── 📁 api/
│   │   │   ├── client.js (Axios instance)
│   │   │   └── services.js (API calls)
│   │   ├── App.jsx (Component chính, routes)
│   │   └── main.jsx (Entry point)
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── 📁 hardware/ (Phần cứng + AI)
│   │
│   ├── 📁 ai_service/ (Dịch vụ AI - Python FastAPI - Port 5001)
│   │   ├── main.py (Entry point - FastAPI server)
│   │   ├── config.py (Cấu hình: camera indices, model paths, thresholds)
│   │   ├── 📁 modules/
│   │   │   ├── __init__.py
│   │   │   ├── camera_manager.py (Quản lý camera - OpenCV)
│   │   │   ├── plate_recognizer.py (Nhận diện biển số)
│   │   │   │   └── Luồng: Detect ROI → Preprocess → EasyOCR → PaddleOCR
│   │   │   ├── face_recognizer.py (Nhận diện khuôn mặt)
│   │   │   │   └── Luồng: YOLOv8 detect → InsightFace embedding → Compare
│   │   │   └── paddle_worker.py (Worker riêng cho PaddleOCR)
│   │   ├── 📁 models/
│   │   │   ├── plate_detector.pt (YOLOv8 model - detect biển số)
│   │   │   ├── face_detector.pt (YOLOv8 model - detect khuôn mặt)
│   │   │   └── (Download sau)
│   │   ├── requirements.txt (Thư viện Python phụ thuộc)
│   │   └── .env (Cấu hình môi trường)
│   │
│   ├── 📁 bridge/ (Hardware Bridge - Node.js - Port 4003)
│   │   ├── index.js (Entry point - Khởi động bridge)
│   │   ├── 📁 src/
│   │   │   ├── config.js (Cấu hình: endpoints, ports, keys)
│   │   │   ├── controller.js (Logic chính - xử lý sự kiện)
│   │   │   ├── wsServer.js (WebSocket server - lắng nghe ESP8266)
│   │   │   ├── aiClient.js (Client gọi AI Service)
│   │   │   ├── backendClient.js (Client gọi Backend API)
│   │   │   ├── esp8266Handler.js (Xử lý kết nối ESP8266)
│   │   │   ├── serialHandler.js (Xử lý serial port - fallback)
│   │   │   └── comAutoDetect.js (Tự động phát hiện COM port)
│   │   ├── package.json
│   │   └── .env (Cấu hình)
│   │
│   ├── 📁 arduino/
│   │   ├── 📁 entry_gate/
│   │   │   └── entry_gate.ino (Firmware Arduino cổng vào)
│   │   │       • I2C address: 0x08
│   │   │       • Đọc HYSRF05, điều khiển servo
│   │   └── 📁 exit_gate/
│   │       └── exit_gate.ino (Firmware Arduino cổng ra)
│   │           • I2C address: 0x09
│   │
│   ├── 📁 esp8266/
│   │   └── 📁 esp8266_gate_bridge/
│   │       └── esp8266_gate_bridge.ino (Firmware ESP8266)
│   │           • WiFi connect + I2C Master
│   │           • TCP client tới Bridge
│   │
│   └── (Thêm cấu hình + logs tại runtime)
│
└── 📁 wdac_backup/ (Backup Windows Defender - không liên quan)

```

---

## ⚙️ Cài Đặt & Chạy Dự Án

### Yêu Cầu Trước Tiên
```
✅ Node.js v16+
✅ Python 3.8+
✅ PostgreSQL 12+
✅ pip, venv (Python virtual environment)
✅ Git, VS Code
```

### Bước 1: Clone / Mở Dự Án
```bash
# Nếu từ git
git clone <repo_url>
cd parking_system-main

# Hoặc đã có sẵn, chỉ cần mở folder
```

### Bước 2: Cài Đặt Database
```bash
# 1. Tạo database PostgreSQL
createdb parking_system_latest

# 2. Import SQL schema
psql parking_system_latest < BuildWeb/database/parking_system_latest.sql

# 3. Kiểm tra kết nối
psql postgres://user:password@localhost:5432/parking_system_latest
```

### Bước 3: Cài Đặt Backend
```bash
cd BuildWeb/backend
npm install

# Tạo file .env
cat > .env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=parking_system_latest
DB_USER=postgres
DB_PASSWORD=<password>
JWT_SECRET=<secret_key>
CORS_ORIGIN=http://localhost:3000
CORS_USER_ORIGIN=http://localhost:5175
NODE_ENV=development
PORT=8000
EOF

# Chạy backend
npm start              # Production
npm run dev            # Development (nodemon)
```

### Bước 4: Cài Đặt Admin Web
```bash
cd BuildWeb/admin-web
npm install
npm run dev           # Port 3000
```

### Bước 5: Cài Đặt User App
```bash
cd WebApp
npm install
npm run dev           # Port 5175
```

### Bước 6: Cài Đặt AI Service
```bash
cd hardware/ai_service

# Tạo virtual environment Python
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
.\.venv\Scripts\activate         # Windows

# Cài đặt thư viện
pip install -r requirements.txt

# Tạo file .env
cat > .env << EOF
AI_HOST=0.0.0.0
AI_PORT=5001
ENTRY_PLATE_CAM=0
ENTRY_FACE_CAM=1
EXIT_PLATE_CAM=2
EXIT_FACE_CAM=3
CAMERA_WIDTH=1280
CAMERA_HEIGHT=720
CAMERA_FPS=15
UPLOADS_DIR=../../BuildWeb/backend/uploads
PLATE_CONF_THRESHOLD=0.5
FACE_CONF_THRESHOLD=0.6
EOF

# Chạy AI Service
python main.py
# Hoặc: uvicorn main:app --host 0.0.0.0 --port 5001 --reload
```

### Bước 7: Cài Đặt Hardware Bridge
```bash
cd hardware/bridge
npm install

# Tạo file .env
cat > .env << EOF
AI_SERVICE_URL=http://localhost:5001
BACKEND_URL=http://localhost:8000
WS_PORT=4003
ESP8266_TCP_PORT=4003
ENTRY_SERIAL_PORT=/dev/ttyUSB0
EXIT_SERIAL_PORT=/dev/ttyUSB1
HARDWARE_API_KEY=<api_key>
EOF

# Chạy bridge
node index.js
```

### Bước 8: Tải Model AI
```bash
# YOLOv8 models tải tự động lần đầu
# Nhưng bạn có thể tải trước:
cd hardware/ai_service/models

# Download YOLOv8 models
wget https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt

# Đổi tên
mv yolov8n.pt plate_detector.pt
cp yolov8n.pt face_detector.pt
```

### ⚡ Khởi Động Nhanh (Windows)
```batch
# start-all.bat
@echo off
start "AI Service" cmd /k "cd hardware\ai_service && python main.py"
start "Bridge" cmd /k "cd hardware\bridge && node index.js"
start "Backend" cmd /k "cd BuildWeb\backend && npm start"
start "Admin Web" cmd /k "cd BuildWeb\admin-web && npm run dev"
start "User App" cmd /k "cd WebApp && npm run dev"

echo.
echo ✅ All services started!
echo Admin: http://localhost:3000
echo User: http://localhost:5175
echo AI: http://localhost:5001
echo Bridge: ws://localhost:4003
pause
```

---

## 🔄 Luồng Hoạt Động Chi Tiết

### Kịch Bản: Xe Vào Bãi Đỗ

```
1️⃣ PHÁT HIỆN XE
   • Xe tiến vào cổng
   • HYSRF05 cảm biến siêu âm phát hiện (khoảng cách < 80cm)
   • Arduino UNO đọc cảm biến (pin D9-Trig, D10-Echo)
   
2️⃣ GỬI TIN HIỆU
   • Arduino cập nhật bit trạng thái
   • ESP8266 đọc trạng thái Arduino qua I2C (address 0x08)
   • ESP8266 gửi event "CAR_DETECTED_ENTRY" tới Bridge qua TCP port 4003
   
3️⃣ BRIDGE NHẬ NHI BỰU
   • Bridge nhận WebSocket message từ ESP8266
   • Kích hoạt timer + gọi AI Service
   
4️⃣ AI NHẬN DIỆN
   a) Biển Số Xe:
      • CameraManager lấy frame từ camera index 0 (1280×720, 15 FPS)
      • PlateRecognizer:
        - YOLOv8 detect vùng biển số
        - Preprocess (crop, upscale, CLAHE, bilateral filter)
        - EasyOCR đọc ký tự → "51A-12345"
        - Nếu EasyOCR thất bại → fallback PaddleOCR
      • Lưu ảnh vào /uploads/captures/
   
   b) Khuôn Mặt:
      • CameraManager lấy frame từ camera index 1
      • FaceRecognizer:
        - YOLOv8 detect + crop vùng mặt
        - InsightFace embedding (buffalo_sc) → vector 512D
        - So sánh cosine similarity với faces đã lưu
        - Trả về ID người hoặc "unknown"
      • Lưu ảnh vào /uploads/faces/
   
5️⃣ GỬI DỮ LIỆU LÊN BACKEND
   Bridge gọi POST /api/sessions
   {
     license_plate: "51A-12345",
     face_embedding: [...],
     entry_image_url: "/uploads/captures/...",
     entry_time: "2024-04-18T10:30:00Z"
   }

6️⃣ BACKEND XỬ LÝ LOGIC
   • Xác thực biển số → kiếm user trong database
   • Kiểm tra embedding khuôn mặt (nếu là member)
   • Tạo record SESSION:
     - session_id, user_id, license_plate
     - entry_time, status="active"
     - entry_composite_image_path
   • Ghi event_log: "CAR_ENTRY"
   • Trả về OK → Bridge
   
7️⃣ MỞ THANH CHẮN
   Backend gửi lệnh: { action: "OPEN_BARRIER", device: "entry" }
   Bridge nhận → gửi I2C write (0x01) tới Arduino
   Arduino điều khiển servo:
     • analogWrite(SERVO_PIN, 90) // Mở
     • Wait 2 seconds
     • analogWrite(SERVO_PIN, 0) // Tự đóng
   
8️⃣ XE ĐI QUA ✅
   • Cảm biến không còn phát hiện
   • Servo tự động đóng thanh chắn
```

### Kịch Bản: Xe Ra Bãi Đỗ

```
(Tương tự như vào, nhưng:)
   • Chỉ cần nhận diện biển số (không cần mặt)
   • Backend tra cứu session_id từ license_plate
   • Tính phí: fee = (exit_time - entry_time) × rate_per_hour
   • Cộng vào ví tiền user
   • Cập nhật session: status="completed", exit_time
   • Mở cổng ra → xe ra
```

---

## 🗄️ Cơ Sở Dữ Liệu

### Bảng Chính (PostgreSQL)

#### `users`
```sql
user_id (PK), email, password_hash, full_name, phone_number,
wallet_balance, created_at, updated_at
```
→ Lưu thông tin người dùng đã đăng ký

#### `vehicles`
```sql
vehicle_id (PK), user_id (FK), license_plate, vehicle_type,
vehicle_name, color, created_at
```
→ Danh sách xe của mỗi user

#### `parking_sessions` (Member)
```sql
session_id (PK), user_id (FK), license_plate, entry_time, exit_time,
status, fee, entry_composite_image_path, exit_composite_image_path
```
→ Ghi nhận phiên đỗ của member

#### `guest_sessions` (Khách lạ)
```sql
session_id (PK), license_plate, entry_time, exit_time,
status, fee, entry_composite_image_path, exit_composite_image_path
```
→ Ghi nhận phiên đỗ của khách lạ (không tài khoản)

#### `devices`
```sql
device_id (PK), device_name, device_type, serial_port,
status, last_heartbeat, created_at
```
→ Arduino, ESP8266, Camera...

#### `device_status_logs`
```sql
log_id (PK), device_id (FK), status, logged_at
```
→ Lịch sử trạng thái online/offline của thiết bị

#### `event_logs`
```sql
event_id (PK), event_type, device_id (FK), admin_id (FK),
description, created_at
```
→ Nhật ký sự kiện: "CAR_ENTRY", "DEVICE_ERROR", ...

#### `alerts`
```sql
alert_id (PK), alert_type, severity, message,
is_resolved, created_at
```
→ Cảnh báo: "DEVICE_OFFLINE", "PARKING_FULL", ...

#### `transactions`
```sql
transaction_id (PK), user_id (FK), amount, type,
description, created_at
```
→ Lịch sử nạp tiền / trừ tiền

---

## 🎯 Các Thành Phần Chính

### 1️⃣ Admin Web (`BuildWeb/admin-web/`)
**Mục đích**: Quản lý bãi đỗ xe

**Tính năng**:
- ✅ **Dashboard** – KPI (xe hiện tại, doanh thu hôm nay, ...)
- ✅ **Sessions** – Xem/quản lý phiên đỗ (lọc, search, export)
- ✅ **Users** – Quản lý người dùng, khóa tài khoản
- ✅ **Devices** – Giám sát Arduino, ESP8266, camera (online/offline)
- ✅ **EventLogs** – Nhật ký tất cả sự kiện
- ✅ **Reports** – Báo cáo doanh thu theo ngày/tuần/tháng
- ✅ **Alerts** – Cảnh báo hệ thống (thiết bị lỗi, ...)
- ✅ **Config** – Cấu hình rate, camera, thresholds

**Công nghệ**: React + Router + Zustand + Socket.io + Recharts

---

### 2️⃣ User App (`WebApp/`)
**Mục đích**: Ứng dụng di động cho người dùng

**Tính năng**:
- ✅ **Login/Register** – Tạo tài khoản
- ✅ **Dashboard** – Xem phiên đỗ hiện tại
- ✅ **Vehicles** – Quản lý danh sách xe
- ✅ **Sessions** – Lịch sử đỗ xe (lọc, chi tiết)
- ✅ **Wallet** – Ví tiền, nạp tiền
- ✅ **Authorizations** – Uỷ quyền truy cập (sharing)
- ✅ **Profile** – Thông tin cá nhân
- ✅ **MonthlyPasses** – Gói đỗ xe hộp tháng

**Công nghệ**: React + Router + Zustand + Tailwind

---

### 3️⃣ Backend API (`BuildWeb/backend/`)
**Mục đích**: Xử lý logic nghiệp vụ, lưu database

**Endpoints chính**:

```
🔐 Xác Thực:
POST   /api/auth/login          – Đăng nhập
POST   /api/auth/register       – Đăng ký
POST   /api/auth/refresh        – Làm mới token
POST   /api/auth/logout         – Đăng xuất

👥 Người Dùng:
GET    /api/users/:id           – Chi tiết user
PATCH  /api/users/:id           – Cập nhật profile
GET    /api/users/:id/vehicles  – Danh sách xe

🚗 Phiên Đỗ:
GET    /api/sessions            – Danh sách (phân trang, lọc)
GET    /api/sessions/:id        – Chi tiết
POST   /api/sessions            – Tạo mới (từ hardware)
PATCH  /api/sessions/:id        – Cập nhật (exit)
DELETE /api/sessions/:id        – Hủy sớm

🔧 Thiết Bị:
GET    /api/devices             – Danh sách
GET    /api/devices/:id         – Chi tiết + logs
PATCH  /api/devices/:id/status  – Cập nhật status

📊 Báo Cáo:
GET    /api/reports/revenue     – Doanh thu
GET    /api/reports/statistics  – Thống kê

📋 Nhật Ký:
GET    /api/event-logs          – Danh sách sự kiện

⚠️ Cảnh Báo:
GET    /api/alerts              – Danh sách cảnh báo
PATCH  /api/alerts/:id/resolve  – Đánh dấu đã xử lý
```

---

### 4️⃣ AI Service (`hardware/ai_service/`)
**Mục đích**: Nhận diện biển số + khuôn mặt

**Endpoints chính**:

```
🏥 Sức Khỏe:
GET    /health                  – Kiểm tra trạng thái

📹 Camera:
GET    /cameras                 – Liệt kê camera
POST   /capture/{index}         – Chụp ảnh

🔍 Nhận Diện:
POST   /recognize/plate         – Nhận diện biển số
POST   /recognize/face          – Nhận diện khuôn mặt

🔄 Xử Lý Toàn Bộ:
POST   /process/entry           – Capture + Plate + Face
POST   /process/exit            – Capture + Plate
POST   /faces/reload            – Reload known faces
```

**Công nghệ**: Python FastAPI + YOLOv8 + EasyOCR + InsightFace

---

### 5️⃣ Hardware Bridge (`hardware/bridge/`)
**Mục đích**: Cầu nối phần cứng ↔ AI ↔ Backend

**Luồng**:
1. WebSocket server lắng nghe ESP8266 (port 4003)
2. Khi xe phát hiện → gọi AI Service
3. Nhận kết quả AI → gửi Backend API
4. Backend trả lệnh → Bridge gửi Arduino qua ESP8266

**Công nghệ**: Node.js + ws + axios

---

### 6️⃣ Firmware Arduino (`hardware/arduino/`)
**Mục đích**: Điều khiển cảm biến + servo motor

**Cổng Vào** (`entry_gate.ino`):
- I2C Address: `0x08`
- HYSRF05: Pin D9 (Trigger), D10 (Echo)
- Servo: Pin D6
- Logic: Đọc cảm biến → gửi trạng thái

**Cổng Ra** (`exit_gate.ino`):
- I2C Address: `0x09`
- Tương tự như cổng vào

**Công nghệ**: C++ + Arduino IDE + Wire.h + Servo.h

---

### 7️⃣ Firmware ESP8266 (`hardware/esp8266/`)
**Mục đích**: WiFi Bridge + I2C Master

**Chức năng**:
- Kết nối WiFi
- Đọc/ghi Arduino qua I2C (Master mode)
- Gửi sự kiện tới Bridge qua TCP port 4003
- Nhận lệnh từ Bridge → gửi Arduino

**Công nghệ**: C++ + Arduino IDE + ESP8266 library

---

## 🎓 Câu Hỏi Bảo Vệ Có Thể Gặp & Cách Trả Lời

### Q1: Kiến trúc hệ thống của bạn như thế nào?
**A**: Hệ thống gồm 4 tầng chính:
1. **Phần cứng** – Arduino, ESP8266, camera, cảm biến
2. **Bridge** – Node.js cầu nối phần cứng ↔ AI ↔ Backend
3. **AI** – Python FastAPI nhận diện biển số + khuôn mặt
4. **Backend & Frontend** – Node.js Express + React Vite

### Q2: Xe vào bãi đỗ, quá trình nào diễn ra?
**A**: 
1. HYSRF05 phát hiện xe (80cm)
2. Arduino đọc → ESP8266 gửi sự kiện
3. Bridge gọi AI Service nhận diện biển số + mặt
4. Gửi Backend API → Backend tạo session
5. Mở thanh chắn (servo motor)
6. Xe đi qua → cảm biến không phát hiện → servo tự đóng

### Q3: Dùng AI gì để nhận diện?
**A**:
- **Biển số**: YOLOv8 detect + EasyOCR đọc
- **Khuôn mặt**: YOLOv8 detect + InsightFace ArcFace embedding

### Q4: Cơ sở dữ liệu có bảng nào?
**A**: users, vehicles, parking_sessions, guest_sessions, devices, device_status_logs, event_logs, alerts, transactions

### Q5: Admin có tính năng gì?
**A**: Dashboard, Sessions, Users, Devices, EventLogs, Reports, Alerts, Config

### Q6: User App có tính năng gì?
**A**: Login, Vehicles, Sessions, Wallet, Authorizations, Profile, MonthlyPasses

### Q7: Ngôn ngữ/công nghệ nào được dùng?
**A**: Frontend (React), Backend (Node.js/Express), AI (Python FastAPI), Hardware (C++ Arduino), Database (PostgreSQL)

### Q8: Port nào được dùng?
**A**: Admin (3000), User (5175), Backend (8000), AI (5001), Bridge (4003)

---

## 📞 Liên Hệ & Hỗ Trợ

Nếu gặp lỗi, kiểm tra:
1. ✅ Toàn bộ service đã chạy? (ps aux / tasklist)
2. ✅ Database đã kết nối? (psql test)
3. ✅ Biến môi trường (.env) đã đúng?
4. ✅ Port có bị chiếm không? (netstat -an)
5. ✅ Model AI có tải xong không?

---

**🎉 Chúc bạn bảo vệ thành công!**

