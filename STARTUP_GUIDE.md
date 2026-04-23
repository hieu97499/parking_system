# Hướng Dẫn Khởi Động Dự Án Parking System (Không Dùng Batch File)

## Tổng Quan
Dự án Parking System bao gồm nhiều thành phần chạy trên các máy khác nhau. Hướng dẫn này mô tả cách khởi động từng phần thủ công mà không sử dụng file batch/script tự động.

## Yêu Cầu Hệ Thống
- Node.js (phiên bản 16+)
- Python 3.8+ với virtualenv
- MySQL
- Arduino IDE (cho phần cứng)
- Các thư viện cần thiết (sẽ cài đặt trong hướng dẫn)

## Chuẩn Bị Chung
1. Clone repository: `git clone https://github.com/hieunguyen2512/parking_system.git`
2. Cài đặt dependencies cho từng phần (xem bên dưới).

## 1. Database (MySQL)
- Cài đặt MySQL và tạo database.
- Import schema: `mysql -u root -p < database/parking_system_latest.sql`
- Đảm bảo database chạy trên port mặc định (3306).

## 2. Backend API (Máy 1)
- Di chuyển đến thư mục: `cd BuildWeb/backend`
- Cài đặt dependencies: `npm install`
- Khởi động server: `npm start` hoặc `node src/index.js`
- Server sẽ chạy trên port 3000 (kiểm tra file config).

## 3. Admin Web (Máy 1 hoặc Máy 2)
- Di chuyển đến thư mục: `cd BuildWeb/admin-web`
- Cài đặt dependencies: `npm install`
- Khởi động dev server: `npm run dev`
- Truy cập tại http://localhost:5173 (hoặc port theo config Vite).

## 4. Mobile App (WebApp) (Máy 2)
- Di chuyển đến thư mục: `cd WebApp`
- Cài đặt dependencies: `npm install`
- Khởi động dev server: `npm run dev`
- Truy cập tại http://localhost:5173 (hoặc port khác nếu conflict).

## 5. Hardware Bridge (Máy 3)
- Di chuyển đến thư mục: `cd hardware/bridge`
- Cài đặt dependencies: `npm install`
- Khởi động bridge: `node index.js`
- Bridge sẽ kết nối với Arduino/ESP8266 qua Serial.

## 6. AI Service (Máy 3)
- Di chuyển đến thư mục: `cd hardware/ai_service`
- Tạo virtualenv: `python -m venv venv` (nếu chưa có)
- Kích hoạt venv: `venv\Scripts\activate` (Windows)
- Cài đặt dependencies: `pip install -r requirements.txt`
- Khởi động service: `python main.py`
- Service sẽ chạy và chờ nhận diện biển số/khuôn mặt.

## 7. Phần Cứng (Arduino & ESP8266)
- Sử dụng Arduino IDE để upload code:
  - Entry Gate: Mở `hardware/arduino/entry_gate/entry_gate.ino`, upload lên Arduino.
  - Exit Gate: Mở `hardware/arduino/exit_gate/exit_gate.ino`, upload lên Arduino.
  - ESP8266 Gate Bridge: Mở `hardware/esp8266/esp8266_gate_bridge/esp8266_gate_bridge.ino`, upload lên ESP8266.
- Đảm bảo kết nối Serial đúng (COM port).

## Thứ Tự Khởi Động
1. Database
2. Backend API
3. Hardware Bridge & AI Service
4. Admin Web & Mobile App
5. Upload code phần cứng

## Kiểm Tra
- Backend: Truy cập http://localhost:3000/api/health
- Admin Web: Đăng nhập và kiểm tra dashboard
- Mobile App: Test đăng ký/đăng nhập
- Hardware: Kiểm tra cổng mở/đóng qua Serial monitor

## Gỡ Lỗi Thường Gặp
- Port conflict: Thay đổi port trong file config.
- Serial connection: Kiểm tra COM port trong Device Manager.
- Dependencies: Chạy lại `npm install` hoặc `pip install`.
- Database connection: Kiểm tra credentials trong file config.

## Lưu Ý
- Đảm bảo tất cả máy trong cùng mạng LAN.
- Sử dụng IP tĩnh nếu cần.
- Theo dõi logs trong terminal để debug.

Nếu gặp vấn đề, kiểm tra file config trong từng thư mục.