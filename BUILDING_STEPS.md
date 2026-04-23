# Hướng Dẫn Xây Dựng Hệ Thống Parking System Từng Bước

## Tổng Quan Dự Án
Parking System là một hệ thống quản lý đỗ xe thông minh bao gồm:
- Backend API với Node.js/Express
- Admin Web với React + Vite
- Mobile Web App với React + Vite
- Hệ thống AI nhận diện biển số và khuôn mặt (Python)
- Phần cứng điều khiển cổng (Arduino, ESP8266, Node.js Bridge)
- Database MySQL

---

## Giai Đoạn 1: Lập Kế Hoạch & Thiết Kế Kiến Trúc

### 1.1 Định Nghĩa Yêu Cầu
- Quản lý bãi đỗ xe (cấp độ, vị trí)
- Nhận diện biển số xe tự động
- Nhận diện khuôn mặt lái xe
- Quản lý thẻ đỗ xe (ngày, tháng, vĩnh viễn)
- Thanh toán qua các kênh khác nhau
- Thông báo và lịch sử giao dịch
- Dashboard quản trị

### 1.2 Thiết Kế Kiến Trúc Hệ Thống
```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                           │
│    Admin Web (React)      │      Mobile App (React)        │
└──────────────┬────────────┴───────────────┬──────────────────┘
               │                           │
               └─────────┬─────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │      Backend API               │
         │   (Node.js/Express)            │
         │   Port: 3000                   │
         └───────────────┬────────────────┘
                         │
         ┌───────────────┴────────────────┐
         │                                │
    ┌────▼─────┐                  ┌──────▼──────┐
    │  MySQL   │                  │  AI Service │
    │Database  │                  │  (Python)   │
    └──────────┘                  └──────┬──────┘
                                         │
                        ┌────────────────┼────────────┐
                        │                │            │
                   ┌────▼───┐     ┌──────▼────┐  ┌───▼────┐
                   │Arduino │     │ ESP8266   │  │ Bridge │
                   │Entry   │     │  Bridge   │  │Server  │
                   └────────┘     └───────────┘  └────────┘
```

### 1.3 Chọn Công Nghệ
- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Node.js, Express, JWT Authentication
- **Database**: MySQL
- **AI**: Python, OpenCV, TensorFlow/PyTorch
- **Hardware**: Arduino, ESP8266, Serial Communication
- **Version Control**: Git/GitHub

---

## Giai Đoạn 2: Chuẩn Bị Môi Trường Phát Triển

### 2.1 Cài Đặt Công Cụ & Công Nghệ
```bash
# Node.js & npm
https://nodejs.org/

# Python
https://www.python.org/

# MySQL
https://www.mysql.com/

# Arduino IDE
https://www.arduino.cc/en/software

# Git
https://git-scm.com/
```

### 2.2 Khởi Tạo Repository Git
```bash
git init
git config user.name "Your Name"
git config user.email "your.email@example.com"
git remote add origin https://github.com/yourusername/parking_system.git
git branch -M main
```

---

## Giai Đoạn 3: Thiết Kế & Tạo Database

### 3.1 Thiết Kế Schema Database
```sql
-- Tạo cơ sở dữ liệu
CREATE DATABASE parking_system;

-- Bảng người dùng
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    full_name VARCHAR(100),
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng xe
CREATE TABLE vehicles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    license_plate VARCHAR(20) UNIQUE,
    vehicle_type VARCHAR(50),
    color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bảng khoá đỗ xe
CREATE TABLE parking_passes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    vehicle_id INT,
    pass_type ENUM('daily', 'monthly', 'yearly'),
    start_date DATE,
    end_date DATE,
    status ENUM('active', 'expired', 'cancelled'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

-- Bảng ghi nhận lần vào/ra
CREATE TABLE parking_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    vehicle_id INT,
    entry_time TIMESTAMP,
    exit_time TIMESTAMP,
    entry_gate VARCHAR(50),
    exit_gate VARCHAR(50),
    amount_paid DECIMAL(10, 2),
    status ENUM('ongoing', 'completed'),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

-- Bảng thanh toán
CREATE TABLE payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    session_id INT,
    amount DECIMAL(10, 2),
    payment_method VARCHAR(50),
    status ENUM('pending', 'completed', 'failed'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES parking_sessions(id)
);
```

### 3.2 Tạo Database
```bash
mysql -u root -p < database/parking_system_latest.sql
```

---

## Giai Đoạn 4: Phát Triển Backend API

### 4.1 Khởi Tạo Project Node.js
```bash
mkdir BuildWeb/backend
cd BuildWeb/backend
npm init -y
npm install express mysql2 dotenv cors jsonwebtoken bcryptjs body-parser
```

### 4.2 Cấu Trúc Thư Mục
```
backend/
├── src/
│   ├── index.js           (Entry point)
│   ├── db.js              (Database connection)
│   ├── middleware/
│   │   └── auth.js        (JWT authentication)
│   ├── routes/
│   │   ├── auth.js        (Login, Register)
│   │   ├── vehicles.js    (Vehicle management)
│   │   ├── passes.js      (Parking passes)
│   │   ├── sessions.js    (Parking sessions)
│   │   └── payments.js    (Payment handling)
│   └── controllers/       (Business logic)
├── uploads/               (Uploaded files)
├── package.json
└── .env                   (Environment variables)
```

### 4.3 Phát Triển Endpoints
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `GET /api/vehicles` - Lấy danh sách xe
- `POST /api/vehicles` - Thêm xe mới
- `GET /api/passes` - Lấy khoá đỗ xe
- `POST /api/passes` - Tạo khoá mới
- `GET /api/sessions` - Lịch sử đỗ xe
- `POST /api/payments` - Xử lý thanh toán

### 4.4 Commit Backend
```bash
git add BuildWeb/backend
git commit -m "Initialize backend API with Express"
git push
```

---

## Giai Đoạn 5: Phát Triển Frontend - Admin Web

### 5.1 Khởi Tạo Project React + Vite
```bash
cd BuildWeb/admin-web
npm create vite@latest . -- --template react
npm install
npm install axios react-router-dom zustand tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 5.2 Cấu Trúc Thư Mục
```
admin-web/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── api/
│   │   └── client.js      (API client)
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── Sidebar.jsx
│   │   └── Layout.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Vehicles.jsx
│   │   ├── Sessions.jsx
│   │   ├── Revenue.jsx
│   │   └── Settings.jsx
│   ├── store/
│   │   └── authStore.js   (Zustand store)
│   └── index.css
├── vite.config.js
├── tailwind.config.js
└── package.json
```

### 5.3 Phát Triển Components
- Dashboard: Tổng quan số liệu (xe trong bãi, doanh thu hôm nay)
- Vehicles: Quản lý danh sách xe trong bãi
- Sessions: Xem lịch sử vào/ra
- Revenue: Báo cáo doanh thu
- Settings: Cấu hình hệ thống

### 5.4 Commit Admin Web
```bash
git add BuildWeb/admin-web
git commit -m "Build admin web dashboard with React and Vite"
git push
```

---

## Giai Đoạn 6: Phát Triển Frontend - Mobile Web App

### 6.1 Khởi Tạo Project React + Vite
```bash
cd WebApp
npm create vite@latest . -- --template react
npm install
npm install axios react-router-dom zustand
```

### 6.2 Cấu Trúc Thư Mục
```
WebApp/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── api/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── BottomNav.jsx
│   │   └── Layout.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Profile.jsx
│   │   ├── Vehicles.jsx
│   │   ├── Sessions.jsx
│   │   ├── Notifications.jsx
│   │   ├── MonthlyPasses.jsx
│   │   └── Authorizations.jsx
│   ├── store/
│   └── index.css
└── vite.config.js
```

### 6.3 Phát Triển Pages
- Login/Register: Xác thực người dùng
- Dashboard: Trang chủ với thông tin tài khoản
- Vehicles: Quản lý xe của mình
- Sessions: Xem lịch sử đỗ xe
- Notifications: Thông báo hệ thống
- Monthly Passes: Mua khoá đỗ xe hàng tháng
- Authorizations: Ủy quyền cho người khác sử dụng xe

### 6.4 Commit Mobile App
```bash
git add WebApp
git commit -m "Build mobile web app with React"
git push
```

---

## Giai Đoạn 7: Phát Triển Hệ Thống AI (Python)

### 7.1 Thiết Lập Python Environment
```bash
cd hardware/ai_service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 7.2 Cấu Trúc Dự Án AI
```
ai_service/
├── main.py                (Entry point)
├── config.py              (Configuration)
├── requirements.txt
├── models/
│   ├── face_detector.pt   (Model nhận diện khuôn mặt)
│   ├── plate_detector.pt  (Model nhận diện biển số)
│   └── models/            (Thêm model khác)
├── modules/
│   ├── __init__.py
│   ├── camera_manager.py  (Quản lý camera)
│   ├── face_recognizer.py (Nhận diện khuôn mặt)
│   ├── plate_recognizer.py(Nhận diện biển số)
│   └── paddle_worker.py   (Xử lý OCR cho biển số)
└── logs/
```

### 7.3 Phát Triển Modules
- **CameraManager**: Kết nối camera USB, lấy frame
- **FaceRecognizer**: Nhận diện khuôn mặt bằng YOLO/Detectron2
- **PlateRecognizer**: Phát hiện biển số bằng YOLO + OCR (PaddleOCR)
- **WebSocket/HTTP Server**: Gửi kết quả nhận diện đến Backend

### 7.4 Commit AI Service
```bash
git add hardware/ai_service
git commit -m "Implement AI service with face and plate recognition"
git push
```

---

## Giai Đoạn 8: Phát Triển Phần Cứng

### 8.1 Arduino - Entry Gate Control
```
hardware/arduino/entry_gate/
├── entry_gate.ino
└── wiring/
    ├── Motor relay (GPIO pin)
    ├── Sensor (GPIO pin)
    └── LED indicator
```

**Chức năng**:
- Nhận lệnh mở cổng từ Node.js Bridge
- Kiểm soát motor servo/relay
- Cảm biến phát hiện xe

### 8.2 Arduino - Exit Gate Control
```
hardware/arduino/exit_gate/
└── exit_gate.ino
```

**Chức năng**: Tương tự cổng vào

### 8.3 ESP8266 - Wireless Bridge
```
hardware/esp8266/esp8266_gate_bridge/
└── esp8266_gate_bridge.ino
```

**Chức năng**:
- Kết nối WiFi
- Nhận dữ liệu từ Node.js Bridge
- Gửi lệnh đến Arduino

### 8.4 Node.js Hardware Bridge
```bash
cd hardware/bridge
npm install serialport ws axios dotenv
npm install
```

**Cấu trúc**:
```
bridge/
├── index.js               (Main server)
├── src/
│   ├── serialHandler.js   (Serial communication)
│   ├── wsServer.js        (WebSocket server)
│   ├── backendClient.js   (Connect to backend)
│   ├── aiClient.js        (Connect to AI service)
│   ├── controller.js      (Main logic)
│   └── config.js
└── package.json
```

**Chức năng**:
- Kết nối Serial với Arduino
- WebSocket server cho ESP8266
- Giao tiếp với Backend API
- Giao tiếp với AI Service

### 8.5 Commit Hardware
```bash
git add hardware/
git commit -m "Add hardware control for gates and bridge server"
git push
```

---

## Giai Đoạn 9: Tích Hợp Hệ Thống

### 9.1 API Flow
```
1. Camera detect plate
2. AI Service → recognize plate
3. AI Service → send to Backend API
4. Backend → check parking pass
5. Backend → if valid, send to Bridge
6. Bridge → send to Arduino/ESP8266
7. Hardware → open gate
```

### 9.2 Kiểm Tra Tích Hợp
- Test nhận diện biển số
- Test mở/đóng cổng
- Test lưu lịch sử trong database
- Test thanh toán
- Test thông báo

### 9.3 Commit Tích Hợp
```bash
git commit -m "Complete system integration and testing"
git push
```

---

## Giai Đoạn 10: Testing & Debugging

### 10.1 Unit Tests
- Backend API endpoints
- Frontend components
- Python modules

### 10.2 Integration Tests
- End-to-end flow
- Hardware communication
- Database transactions

### 10.3 Performance Testing
- API response time
- AI recognition speed
- Database query optimization

---

## Giai Đoạn 11: Triển Khai (Deployment)

### 11.1 Chuẩn Bị Production
- Environment variables
- SSL certificates
- Database backup
- Logging setup

### 11.2 Deploy Backend
```bash
# Có thể sử dụng: Heroku, AWS, DigitalOcean, v.v.
npm install -g pm2
pm2 start src/index.js --name "parking-api"
pm2 save
```

### 11.3 Deploy Frontend
```bash
# Build React apps
npm run build

# Deploy to: Vercel, Netlify, AWS S3 + CloudFront, v.v.
```

### 11.4 Deploy AI Service
```bash
python main.py  # Chạy trên server GPU
```

---

## Giai Đoạn 12: Bảo Trì & Cải Tiến

### 12.1 Monitoring
- Log files
- API performance
- Database health
- Hardware status

### 12.2 Updates
- Security patches
- Feature additions
- Bug fixes
- Performance optimization

---

## Kiểm Danh Hoàn Thành

- [x] Lập kế hoạch & thiết kế
- [x] Chuẩn bị môi trường
- [x] Tạo database
- [x] Phát triển backend
- [x] Phát triển admin web
- [x] Phát triển mobile app
- [x] Phát triển AI service
- [x] Phát triển phần cứng
- [x] Tích hợp hệ thống
- [x] Testing
- [x] Triển khai
- [x] Bảo trì

---

## Lưu Ý Quan Trọng
1. Commit code thường xuyên
2. Viết documentation chi tiết
3. Test kỹ lưỡng trước khi merge
4. Sử dụng Git branches cho features mới
5. Backup database định kỳ
6. Monitor logs trong production

---

## Tài Liệu Tham Khảo
- Express.js: https://expressjs.com/
- React: https://react.dev/
- MySQL: https://dev.mysql.com/doc/
- Python OpenCV: https://docs.opencv.org/
- Arduino: https://www.arduino.cc/en/Guide
- Node.js serialport: https://serialport.io/

---

*Đây là quy trình xây dựng Parking System từ đầu đến cuối. Mỗi giai đoạn có thể mất vài tuần tùy vào quy mô và kinh nghiệm của nhóm.*