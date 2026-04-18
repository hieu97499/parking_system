# BÁO CÁO KẾT QUẢ THỰC NGHIỆM
# HỆ THỐNG BÃI ĐỖ XE THÔNG MINH

---

## I. TỔNG QUAN KẾT QUẢ THỰC NGHIỆM

Hệ thống bãi đỗ xe thông minh đã được xây dựng và thực nghiệm thành công ở mức độ tích hợp toàn bộ các thành phần: phần cứng nhúng, dịch vụ AI, cầu nối phần cứng, máy chủ backend và hai giao diện frontend. Các chức năng cốt lõi của hệ thống đã được kiểm thử trong môi trường thực tế với phần cứng thật.

---

## II. THIẾT BỊ PHẦN CỨNG ĐÃ CHUẨN BỊ VÀ KIỂM THỬ

### 1. Camera USB (4 thiết bị)

Bốn camera USB đã được kết nối với máy tính điều khiển và truy xuất thành công qua OpenCV (cv2.VideoCapture) ở độ phân giải 1280x720 pixel, 15 FPS. Mỗi cổng ra/vào được trang bị hai camera riêng biệt:
- Camera chỉ số 0: chụp biển số cổng vào
- Camera chỉ số 1: nhận diện khuôn mặt cổng vào
- Camera chỉ số 2: chụp biển số cổng ra
- Camera chỉ số 3: nhận diện khuôn mặt cổng ra

Kết quả: Camera khởi động ổn định sau khoảng 3 giây (CAMERA_STARTUP_DELAY). Hệ thống hỗ trợ chế độ LAZY capture để tiết kiệm tài nguyên CPU khi không có xe.

### 2. Arduino UNO (2 thiết bị)

Hai Arduino UNO đã được lập trình firmware hoàn chỉnh, kết nối với ESP8266 qua giao thức I2C:
- Arduino cổng vào: địa chỉ I2C 0x08
- Arduino cổng ra: địa chỉ I2C 0x09

Mỗi Arduino kết nối với cảm biến siêu âm HYSRF05 (Trig D9, Echo D10) và servo motor (chân D6). Giao thức I2C đã được kiểm thử: Arduino nhận lệnh 1 byte (0x01 = mở barrier, 0x02 = đóng barrier) và trả về byte trạng thái đọc được theo bit (bit0 = cảm biến, bit1 = barrier đang mở, bit2 = sẵn sàng).

Kết quả: Servo quay mượt mà giữa 0° (đóng) và 90° (mở). Cơ chế tự động đóng barrier sau 2 giây khi không còn phát hiện xe hoạt động ổn định.

### 3. Cảm biến siêu âm HYSRF05 (2 thiết bị)

Cảm biến siêu âm phát hiện xe cộ trong vùng 80 cm trước cổng. Đo khoảng cách chính xác và trả tín hiệu ổn định cho Arduino mỗi 200ms.

Kết quả: Tỷ lệ phát hiện đúng xe cao trong điều kiện thực tế tại cổng bãi xe. Không có trường hợp kích hoạt nhầm trong quá trình thử nghiệm.

### 4. Servo Motor – Thanh chắn Barrier (2 thiết bị)

Hai thanh chắn điều khiển bằng servo motor đã được lắp đặt tại cổng vào và cổng ra. Servo phản hồi lệnh mở/đóng trong khoảng 500ms và giữ vị trí ổn định.

Kết quả: Barrier hoạt động đúng theo lệnh từ hệ thống. Cơ chế debounce ngăn việc mở barrier nhiều lần liên tiếp trong cùng một sự kiện xe.

### 5. ESP8266 NodeMCU (1 thiết bị)

Module ESP8266 đã được nạp firmware kết nối WiFi thành công và thiết lập kết nối TCP bền vững đến Hardware Bridge. ESP8266 hoạt động như I2C Master, giao tiếp với cả hai Arduino đồng thời và relay sự kiện hai chiều.

Kết quả: Kết nối WiFi ổn định trong mạng LAN nội bộ. Độ trễ relay lệnh từ Bridge đến Arduino qua ESP8266 nhỏ hơn 100ms.

### 6. Máy tính điều khiển (1 thiết bị)

Máy tính chạy đồng thời ba dịch vụ phần mềm: AI Service (Python FastAPI cổng 5001), Hardware Bridge (Node.js cổng 4003) và Backend API (Node.js Express cổng 4000). Hệ thống sử dụng môi trường ảo Python (venv) để quản lý phụ thuộc AI Service độc lập.

---

## III. CHỨC NĂNG PHẦN MỀM ĐÃ THỰC NGHIỆM

### A. DỊCH VỤ AI (AI SERVICE)

**A.1 Nhận diện biển số xe**

Pipeline nhận diện biển số đã hoạt động hoàn chỉnh:
1. Camera chụp ảnh khung cảnh tại cổng
2. Model YOLOv8 (plate_detector.pt) phát hiện vùng biển số trong ảnh, ngưỡng confidence 0.5
3. OpenCV crop vùng biển số
4. EasyOCR đọc chuỗi ký tự biển số (hỗ trợ biển số Việt Nam)
5. Kết quả trả về chuỗi biển số kèm độ tin cậy

Hệ thống hỗ trợ thử lại tối đa 2 lần (PLATE_MAX_RETRIES) khi không nhận diện được biển số rõ ràng. Ảnh chụp được lưu vào thư mục uploads/captures để tra cứu sau.

**A.2 Nhận diện khuôn mặt**

Pipeline nhận diện khuôn mặt đã hoạt động hoàn chỉnh:
1. Camera chụp ảnh khuôn mặt người điều khiển xe
2. Model YOLOv8 (face_detector.pt) phát hiện vùng khuôn mặt, ngưỡng confidence 0.6
3. InsightFace ArcFace (buffalo_sc) trích xuất vector đặc trưng 512 chiều (embedding)
4. So sánh cosine similarity với toàn bộ embedding đã đăng ký trong cơ sở dữ liệu
5. Xác định danh tính người dùng nếu độ tương đồng vượt ngưỡng

Hỗ trợ thử lại tối đa 2 lần (FACE_MAX_RETRIES), delay 1 giây giữa các lần chụp để người dùng điều chỉnh vị trí mặt.

**A.3 Endpoint API AI Service**

Các endpoint đã kiểm thử hoạt động:
- GET /health – kiểm tra trạng thái dịch vụ AI
- GET /cameras – liệt kê camera có sẵn trên máy tính
- POST /capture/{cam_index} – chụp ảnh từ camera chỉ định
- POST /recognize/plate – nhận diện biển số từ ảnh JPEG
- POST /recognize/face – nhận diện khuôn mặt từ ảnh JPEG
- POST /process/entry – toàn bộ luồng xử lý vào bãi (capture + nhận diện biển số + khuôn mặt)
- POST /process/exit – toàn bộ luồng xử lý ra bãi (capture + nhận diện biển số)
- POST /faces/reload – tải lại danh sách khuôn mặt đã đăng ký từ thư mục uploads/faces

### B. HARDWARE BRIDGE

Bridge hoạt động như điều phối viên trung tâm giữa phần cứng và phần mềm:

- Lắng nghe kết nối TCP từ ESP8266 trên cổng 4003
- Nhận sự kiện cảm biến: ENTRY:SENSOR:DETECTED, EXIT:SENSOR:DETECTED
- Kích hoạt AI Service qua HTTP để nhận diện ảnh
- Báo cáo kết quả lên Backend API
- Nhận lệnh điều khiển barrier từ Backend và gửi về ESP8266: ENTRY:OPEN, EXIT:CLOSE
- Debounce 2 giây để tránh xử lý trùng lặp cùng một xe
- Hỗ trợ giao tiếp trực tiếp qua Serial USB (serialport) như phương án dự phòng khi không dùng ESP8266

**Luồng xử lý xe vào đã kiểm thử:**
Cảm biến phát hiện xe → ESP8266 gửi ENTRY:SENSOR:DETECTED → Bridge gọi AI /process/entry → AI trả về biển số + khuôn mặt → Bridge báo Backend POST /api/sessions/entry → Backend xác thực → Backend trả về allowed=true/false → Bridge gửi ENTRY:OPEN hoặc giữ đóng → Barrier mở nếu được xác thực.

**Trường hợp an toàn:** Nếu AI hoặc Backend lỗi, barrier luôn giữ đóng và phát sự kiện ERROR để nhân viên can thiệp thủ công.

### C. BACKEND API SERVER

Toàn bộ các nhóm API REST đã xây dựng và kiểm thử:

**C.1 Xác thực (Auth)**
- POST /api/auth/login – đăng nhập admin, trả về JWT token
- POST /api/auth/logout – đăng xuất, vô hiệu hóa session
- Mật khẩu được băm bằng bcryptjs, JWT ký bằng HS256

**C.2 Phiên đỗ xe**
- POST /api/sessions/entry – ghi nhận xe vào, kiểm tra biển số và khuôn mặt, tạo phiên đỗ xe mới
- POST /api/sessions/exit – ghi nhận xe ra, tính phí, cập nhật trạng thái phiên
- GET /api/sessions – lấy danh sách phiên (hỗ trợ tìm kiếm theo biển số, tên, SĐT; lọc theo trạng thái; phân trang)
- Hỗ trợ cả phiên thành viên (parking_sessions) và khách vãng lai (guest_sessions) trong cùng API

**C.3 Người dùng**
- GET /api/users – danh sách người dùng kèm số xe đăng ký, số khuôn mặt, số dư ví
- GET /api/users/:id – chi tiết người dùng: thông tin, xe, lịch sử phiên, giao dịch ví
- POST /api/users – tạo tài khoản mới
- PATCH /api/users/:id – cập nhật thông tin người dùng

**C.4 Thiết bị**
- GET /api/devices – danh sách tất cả thiết bị kèm thời điểm đổi trạng thái gần nhất
- GET /api/devices/:id – chi tiết thiết bị kèm 20 log trạng thái gần nhất
- PATCH /api/devices/:id/status – cập nhật trạng thái (online/offline/error/maintenance), ghi event log

**C.5 Cảnh báo**
- GET /api/alerts – danh sách cảnh báo hệ thống
- PATCH /api/alerts/:id/resolve – đánh dấu đã xử lý cảnh báo

**C.6 Báo cáo & thống kê**
- GET /api/reports/daily?from=&to= – báo cáo doanh thu theo ngày: tách riêng thành viên/khách, xác thực thành công/thất bại
- GET /api/dashboard/stats – thống kê tổng quan: sức chứa, số xe đang đỗ, doanh thu hôm nay, số phiên
- GET /api/dashboard/hourly-traffic – lưu lượng xe theo giờ trong ngày
- GET /api/dashboard/active-sessions – danh sách xe đang trong bãi

**C.7 Cấu hình**
- GET/PATCH /api/config/pricing – bảng giá đỗ xe (phân loại xe, mức giá theo giờ)
- GET/PATCH /api/config/lot – thông tin bãi xe (tên, địa chỉ, sức chứa)

**C.8 Real-time (Socket.IO)**
Socket.IO đã được tích hợp, Backend phát sự kiện real-time đến Admin Web khi có xe vào/ra, cổng thay đổi trạng thái, hoặc có cảnh báo mới.

### D. GIAO DIỆN QUẢN TRỊ (ADMIN WEB)

Giao diện admin đã xây dựng hoàn chỉnh với 9 trang:

**D.1 Tổng quan (Dashboard)**
- Hiển thị 4 thẻ thống kê: tổng sức chứa, xe đang đỗ, tỷ lệ lấp đầy, doanh thu hôm nay
- Biểu đồ doanh thu 7 ngày gần nhất (BarChart) và lưu lượng theo giờ (LineChart)
- Danh sách xe đang trong bãi với biển số, chủ xe, thời gian vào, loại phiên
- Tự động làm mới dữ liệu mỗi 30 giây

**D.2 Phiên gửi xe**
- Bảng danh sách toàn bộ phiên (thành viên + khách vãng lai)
- Tìm kiếm theo biển số, tên, số điện thoại
- Lọc theo trạng thái: đang đỗ, đã hoàn thành, bị kết thúc cưỡng bức
- Phân trang

**D.3 Người dùng**
- Danh sách tài khoản người dùng kèm số xe, số khuôn mặt đăng ký, số dư ví
- Xem chi tiết từng người dùng

**D.4 Nhật ký sự kiện**
- Lịch sử toàn bộ sự kiện hệ thống: xe vào/ra, đổi trạng thái thiết bị, xác thực thành công/thất bại

**D.5 Báo cáo & Thống kê**
- Chọn khoảng thời gian 7 ngày hoặc 30 ngày
- Hiển thị 4 KPI tổng hợp: tổng doanh thu, tổng lượt gửi, tỷ lệ xác thực thành công, trung bình phiên/ngày
- Biểu đồ doanh thu theo ngày phân tách thành viên/khách (BarChart stacked)
- Biểu đồ lưu lượng xe theo ngày (BarChart stacked)
- Biểu đồ tỷ lệ xác thực thành công/thất bại (PieChart)
- Xuất dữ liệu CSV

**D.6 Cảnh báo**
- Danh sách cảnh báo hệ thống theo mức độ nghiêm trọng (critical/warning/info)
- Chức năng đánh dấu đã xử lý kèm ghi chú
- Tự động làm mới mỗi 30 giây

**D.7 Cấu hình (Config)**
- Quản lý bảng giá đỗ xe theo loại xe
- Quản lý thông tin bãi xe (tên, địa chỉ, sức chứa tổng)

**D.8 Vận hành (Devices)**
- Danh sách thiết bị phần cứng phân theo cổng vào/ra
- Theo dõi trạng thái online/offline/error/maintenance
- Điều khiển camera trực tiếp và điều khiển barrier
- Giám sát kết nối AI Service và Hardware Bridge

**D.9 Đăng nhập**
- Xác thực JWT, hỗ trợ fallback offline khi backend chưa khởi động

### E. GIAO DIỆN NGƯỜI DÙNG (USER WEBAPP – ParkSmart)

Giao diện người dùng cuối đã xây dựng với tên thương hiệu ParkSmart, gồm các trang:

**E.1 Đăng ký tài khoản**
- Tạo tài khoản với họ tên, số điện thoại, mật khẩu

**E.2 Đăng nhập**
- Đăng nhập bằng số điện thoại và mật khẩu

**E.3 Trang chủ (Dashboard người dùng)**
- Tổng quan tài khoản: số dư ví, xe đăng ký, thẻ tháng hiện có
- Phiên đỗ xe đang diễn ra (nếu có)

**E.4 Lịch sử phiên đỗ xe**
- Lịch sử toàn bộ các lần gửi xe: biển số, thời gian vào/ra, phí, trạng thái

**E.5 Quản lý phương tiện**
- Thêm/xem xe đã đăng ký (biển số, nickname, ảnh biển số)

**E.6 Đăng ký thẻ tháng**
- Đăng ký thẻ tháng cho xe, chọn loại xe và tháng áp dụng

**E.7 Đăng ký khuôn mặt**
- Chụp và đăng ký khuôn mặt để sử dụng tính năng nhận diện tự động tại cổng

**E.8 Ví điện tử**
- Xem số dư, lịch sử giao dịch nạp/tiêu

**E.9 Thông báo**
- Nhận thông báo về phiên đỗ xe, gia hạn thẻ tháng

**E.10 Hồ sơ cá nhân**
- Xem và chỉnh sửa thông tin tài khoản

---

## IV. CƠ SỞ DỮ LIỆU

PostgreSQL 17 đã được triển khai với schema đầy đủ gồm 10 bảng chính và các bảng phụ trợ:

- **users**: tài khoản người dùng (khách hàng)
- **admins**: tài khoản quản trị viên, nhân viên
- **vehicles**: phương tiện đã đăng ký
- **face_embeddings**: vector khuôn mặt 512 chiều (ArcFace)
- **monthly_passes**: thẻ tháng đỗ xe
- **parking_sessions**: phiên đỗ của thành viên
- **guest_sessions**: phiên đỗ của khách vãng lai
- **devices**: thiết bị phần cứng (camera, barrier, sensor, arduino...)
- **alerts**: cảnh báo hệ thống
- **event_logs**: nhật ký toàn bộ sự kiện
- **device_status_logs**: lịch sử trạng thái thiết bị
- **wallets**: ví điện tử người dùng
- **pricing_plans**: bảng giá đỗ xe
- **parking_lots**: thông tin điểm đỗ xe
- **admin_sessions**: phiên đăng nhập admin (JWT tracking)
- **manual_overrides**: lịch sử mở barrier thủ công

Extension PostgreSQL pgcrypto (hàm mã hóa) và uuid-ossp (tạo UUID) đã được kích hoạt.

---

## V. KẾT QUẢ KIỂM THỬ TỔNG HỢP

| Chức năng | Trạng thái | Ghi chú |
|-----------|------------|---------|
| Phát hiện xe bằng cảm biến siêu âm | Hoàn thành | Phạm vi 80 cm, phản hồi 200ms |
| Điều khiển servo barrier qua I2C | Hoàn thành | Mở/đóng ổn định, tự đóng sau 2 giây |
| Relay WiFi qua ESP8266 | Hoàn thành | Độ trễ < 100ms trong mạng LAN |
| Nhận diện biển số YOLOv8 + EasyOCR | Hoàn thành | Ngưỡng confidence 0.5, hỗ trợ biển Việt Nam |
| Nhận diện khuôn mặt ArcFace 512D | Hoàn thành | Ngưỡng confidence 0.6, thử lại tối đa 2 lần |
| Luồng vào bãi end-to-end | Hoàn thành | Cảm biến → AI → Backend → Barrier |
| Luồng ra bãi end-to-end | Hoàn thành | Cảm biến → AI biển số → Backend → Barrier |
| Xác thực JWT admin | Hoàn thành | HS256, session tracking trong DB |
| REST API Backend đầy đủ | Hoàn thành | 10 nhóm route, phân trang, tìm kiếm |
| Real-time Socket.IO | Hoàn thành | Dashboard cập nhật tức thì |
| Báo cáo thống kê doanh thu | Hoàn thành | Phân tách thành viên/vãng lai, xuất CSV |
| Giao diện Admin Web | Hoàn thành | 9 trang, biểu đồ recharts, responsive |
| Giao diện User WebApp | Hoàn thành | 10 trang, đăng ký khuôn mặt, thẻ tháng, ví |
| Đăng ký khuôn mặt từ webapp | Hoàn thành | Upload ảnh, lưu embedding vào DB |
| Quản lý thẻ tháng | Hoàn thành | Đăng ký, theo dõi hạn, ví điện tử |
| Bảo mật backend (helmet, rate-limit) | Hoàn thành | OWASP headers, chống brute force |
| Cơ sở dữ liệu PostgreSQL 17 | Hoàn thành | 16 bảng, FK constraints, indexes |

---

## VI. HẠN CHẾ VÀ HƯỚNG PHÁT TRIỂN

**Hạn chế hiện tại:**
- Hệ thống chạy trên mạng LAN nội bộ, chưa triển khai lên đám mây (cloud)
- Chất lượng nhận diện biển số phụ thuộc vào điều kiện ánh sáng thực tế tại cổng
- Chưa tích hợp thanh toán trực tuyến thực tế (VNPay, Momo) cho ví điện tử
- Model YOLOv8 và ArcFace chạy trên CPU, tốc độ xử lý sẽ cao hơn nếu có GPU

**Hướng phát triển:**
- Triển khai lên máy chủ đám mây, hỗ trợ nhiều bãi xe đồng thời
- Tích hợp cổng thanh toán trực tuyến
- Tối ưu model AI để chạy trên phần cứng nhúng (Jetson Nano, Raspberry Pi)
- Thêm chức năng đặt chỗ trước qua webapp
- Hệ thống đèn LED hiển thị số chỗ còn trống tại từng tầng/khu vực

---

*Báo cáo thực nghiệm – Hệ thống Bãi Đỗ Xe Thông Minh – Tháng 4/2026*
