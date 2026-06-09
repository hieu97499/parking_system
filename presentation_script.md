# NỘI DUNG THUYẾT TRÌNH – HỆ THỐNG BÃI XE THÔNG MINH

---

## MỞ ĐẦU (Người dẫn chung)

Kính thưa Hội đồng, kính thưa quý Thầy Cô,

Nhóm chúng em xin phép trình bày đồ án tốt nghiệp với đề tài: **"Hệ thống quản lý bãi xe thông minh sử dụng trí tuệ nhân tạo và IoT"**.

Trong bối cảnh đô thị hóa nhanh chóng, vấn đề quản lý bãi xe truyền thống đang bộc lộ nhiều hạn chế: thời gian chờ đợi lâu tại cổng, dễ xảy ra gian lận biển số, thiếu công cụ theo dõi doanh thu chính xác, và không thể nhận diện danh tính người gửi xe một cách tự động.

Nhóm chúng em đã xây dựng một hệ thống hoàn chỉnh tích hợp **phần cứng IoT**, **trí tuệ nhân tạo nhận diện biển số và khuôn mặt**, **hệ thống thanh toán tự động**, và **giao diện web quản trị** — tất cả hoạt động đồng bộ theo thời gian thực.

---

## TỔNG QUAN HỆ THỐNG

### Kiến trúc tổng thể

Hệ thống được thiết kế theo kiến trúc **phân tán**, gồm các thành phần chính:

1. **Phần cứng IoT** (tại bãi xe): Camera IP, cảm biến hồng ngoại, ESP8266, servo barrier
2. **Bridge Service** (máy tính local): Cầu nối điều phối giữa phần cứng, AI và Backend
3. **AI Service** (máy tính local): Xử lý nhận diện biển số và khuôn mặt bằng AI
4. **Backend** (VPS cloud): Xử lý logic nghiệp vụ, thanh toán, bảo mật
5. **Frontend** (3 ứng dụng React): WebApp người dùng, AdminWeb quản trị, OperatorWeb vận hành

Các thành phần giao tiếp với nhau qua các giao thức: **RTSP** (camera), **TCP Socket** (ESP8266), **HTTP REST** (API), và **WebSocket** (realtime).

### Phân công công việc

Đồ án được phân công cho 3 thành viên:
- **Sinh viên 1**: Thiết kế hệ thống thiết bị IoT và xây dựng AI Service
- **Sinh viên 2**: Xây dựng phân hệ xử lý logic thanh toán, tính phí, bảo mật giao dịch
- **Sinh viên 3**: Xây dựng hệ thống quản trị web và triển khai cloud server

Sau đây, từng thành viên sẽ lần lượt trình bày phần phụ trách của mình.

---
---

## PHẦN 1: SINH VIÊN 1 – HỆ THỐNG IoT & AI SERVICE

---

### Slide 1.1: Giới thiệu phần phụ trách

Kính thưa Hội đồng, em xin trình bày phần thứ nhất: **Thiết kế hệ thống thiết bị IoT và xây dựng AI Service**.

Phần này bao gồm:
- Thiết kế phần cứng cho cổng vào/ra tự động
- Lựa chọn và tích hợp cảm biến, camera, thiết bị điều khiển
- Xây dựng giao thức truyền thông giữa các thiết bị
- Phát triển AI Service nhận diện biển số xe và khuôn mặt người dùng

---

### Slide 1.2: Sơ đồ cổng vào/ra

Mỗi cổng trong hệ thống bao gồm **ba thành phần chính**:

1. **Cảm biến hồng ngoại (IR)**: Phát hiện xe đến vị trí cổng, kích hoạt quá trình nhận diện
2. **Camera IP** (2 camera/cổng):
   - Camera 1 đặt ở **góc thấp**, hướng vào biển số xe
   - Camera 2 đặt ở **góc cao**, hướng vào khuôn mặt người lái
3. **Servo barrier**: Thanh chắn tự động mở/đóng sau khi xác thực thành công

Toàn bộ được điều khiển bởi **ESP8266** kết nối WiFi TCP đến Bridge Service. Hệ thống có **2 cổng độc lập** (vào và ra), hoạt động song song không phụ thuộc lẫn nhau.

---

### Slide 1.3: Phần cứng sử dụng

Danh sách thiết bị:
- **4 Camera IP** hỗ trợ RTSP, độ phân giải 1280×720 pixel, 15 FPS
- **2 ESP8266**: Vi điều khiển WiFi, giao tiếp TCP Socket với Bridge
- **2 Arduino**: Xử lý tín hiệu cảm biến IR và điều khiển servo
- **2 Cảm biến hồng ngoại**: Phát hiện có xe tại vị trí cổng
- **2 Servo motor**: Điều khiển thanh barrier mở/đóng
- **1 Máy tính điều khiển**: Chạy Bridge Service và AI Service

Do giới hạn thời gian và chi phí, phần cứng được lắp ráp dạng nguyên mẫu từ module rời, kết nối qua dây jumper và hàn thiếc. Tuy nhiên, hệ thống hoạt động đầy đủ tính năng.

---

### Slide 1.4: Giao thức truyền thông

Hệ thống sử dụng **4 giao thức** chính:

| Kết nối | Giao thức | Mục đích |
|---------|-----------|----------|
| Camera → AI Service | RTSP (1280×720, 15fps) | Truyền video stream |
| ESP8266 → Bridge | WiFi TCP Socket | Tín hiệu cảm biến, điều khiển barrier |
| Bridge → AI Service | HTTP REST (localhost:5001) | Gọi pipeline nhận diện |
| Bridge → Backend | HTTP REST (VPS) | Xác thực, tạo phiên gửi xe |
| Bridge → OperatorWeb | WebSocket | Cập nhật realtime cho operator |

Điểm đặc biệt: **Bridge Service đóng vai trò trung tâm**, là điểm kết nối duy nhất giữa thế giới phần cứng và thế giới phần mềm.

---

### Slide 1.5: Luồng xử lý tại cổng vào

Khi một xe đến cổng vào, quá trình xử lý diễn ra như sau:

**Bước 1**: Cảm biến hồng ngoại phát hiện xe → ESP8266 gửi tín hiệu TCP đến Bridge Service

**Bước 2**: Bridge nhận tín hiệu, gọi AI Service qua endpoint `POST /process/entry`

**Bước 3**: AI Service thực hiện **song song** hai pipeline:
- Pipeline 1: Camera biển số → YOLOv8 detect vùng biển số → PaddleOCR đọc ký tự → Validate regex
- Pipeline 2: Camera khuôn mặt → YOLOv8 detect mặt → InsightFace trích embedding → Cosine similarity với database

**Bước 4**: AI trả kết quả JSON gồm `plate`, `user_id`, `confidence`

**Bước 5**: Bridge gửi Backend xác thực → Backend kiểm tra quyền, tạo parking session

**Bước 6**: Nếu được phép → Mở barrier servo → Cập nhật slot count → Broadcast WebSocket

Toàn bộ quá trình diễn ra trong vài giây, đảm bảo trải nghiệm liền mạch cho người dùng.

---

### Slide 1.6: Kiến trúc AI Service

AI Service được xây dựng bằng **FastAPI** (Python), chạy trên Uvicorn ASGI server ở chế độ production.

Các thành phần cốt lõi:
- **OpenCV**: Đọc luồng RTSP từ 4 camera, tiền xử lý ảnh (resize, crop vùng quan tâm). Hỗ trợ chế độ "lazy capture" — chỉ chụp khi có yêu cầu, tiết kiệm CPU.
- **YOLOv8** (Ultralytics): Phát hiện đối tượng realtime, dùng cho 2 nhiệm vụ — detect biển số (confidence ≥ 0.5) và detect khuôn mặt (confidence ≥ 0.6).
- **PaddleOCR** (Baidu): Đọc ký tự biển số xe, hỗ trợ tiếng Việt. Kết quả được validate bằng regex biển số Việt Nam.
- **InsightFace** (model buffalo_sc): Trích xuất embedding 512 chiều cho khuôn mặt, so sánh cosine similarity với database để xác định danh tính.
- **NumPy**: Tính toán vector, cosine similarity giữa các embedding.

AI Service expose các endpoint chính: `/process/entry` và `/process/exit`, sử dụng **Semaphore** để đảm bảo mỗi cổng chỉ xử lý 1 request tại một thời điểm.

---

### Slide 1.7: Pipeline nhận diện biển số

Chi tiết pipeline nhận diện biển số:

1. **Thu thập**: OpenCV đọc frame từ camera RTSP (1280×720)
2. **Phát hiện**: YOLOv8 detect vùng biển số → trả bounding box với confidence ≥ 0.5
3. **Tiền xử lý**: Crop vùng biển số, resize cho phù hợp với đầu vào OCR
4. **Nhận dạng**: PaddleOCR đọc ký tự từ ảnh vùng biển số
5. **Validation**: Regex kiểm tra định dạng biển số Việt Nam `[0-9]{2}[A-Z]{1,2}[0-9]{4,5}`
6. **Kết quả**: Trả chuỗi biển số hợp lệ hoặc cờ báo không đọc được

Ưu điểm: PaddleOCR cho kết quả tốt với ký tự có cấu trúc như biển số xe, đặc biệt hiệu quả với font chữ tiếng Việt.

---

### Slide 1.8: Pipeline nhận diện khuôn mặt

Chi tiết pipeline nhận diện khuôn mặt:

1. **Thu thập**: OpenCV đọc frame từ camera khuôn mặt
2. **Phát hiện**: YOLOv8 detect khuôn mặt → bounding box với confidence ≥ 0.6
3. **Trích xuất**: InsightFace (buffalo_sc) tạo **vector embedding 512 chiều** đặc trưng cho khuôn mặt
4. **So sánh**: NumPy tính **cosine similarity** giữa embedding vừa trích xuất với toàn bộ embedding đã đăng ký trong bảng `face_embeddings`
5. **Kết quả**: Trả `user_id` có similarity cao nhất (nếu vượt ngưỡng)

**Điểm mạnh của phương pháp này**: Không cần train lại model khi thêm người dùng mới — chỉ cần lưu thêm embedding vào database. Hệ thống mở rộng dễ dàng, không bị giới hạn số lượng người dùng.

---

### Slide 1.9: Kết quả đạt được (Phần 1)

- ✅ Hệ thống phần cứng 2 cổng hoạt động ổn định
- ✅ Nhận diện biển số chính xác với PaddleOCR + regex validation
- ✅ Nhận diện khuôn mặt realtime với InsightFace
- ✅ Thời gian xử lý trung bình < 3 giây cho toàn bộ pipeline
- ✅ Giao tiếp đáng tin cậy giữa ESP8266, Bridge và AI Service
- ✅ Lazy capture tiết kiệm ~70% CPU khi không có xe

Em xin kết thúc phần trình bày thứ nhất. Xin mời sinh viên 2 trình bày phần tiếp theo.

---
---

## PHẦN 2: SINH VIÊN 2 – THANH TOÁN & BẢO MẬT

---

### Slide 2.1: Giới thiệu phần phụ trách

Kính thưa Hội đồng, em xin trình bày phần thứ hai: **Xây dựng phân hệ xử lý logic thanh toán, tính phí và bảo mật giao dịch**.

Phần này bao gồm:
- Thiết kế luồng xử lý thanh toán từ cổng vào đến cổng ra
- Xây dựng cơ chế tính phí tự động cho member và guest
- Cơ chế xác thực danh tính tại cổng
- Triển khai bảo mật với JWT, bcrypt và session tracking
- Xây dựng Bridge Service — cầu nối trung tâm điều phối giao dịch

---

### Slide 2.2: Luồng xử lý thanh toán tổng quan

Luồng thanh toán gồm **3 giai đoạn**:

**Giai đoạn 1 – Cổng vào (Entry)**:
- AI nhận diện biển số + khuôn mặt
- Bridge gửi thông tin lên Backend
- Backend tạo **parking session** với `entry_time`, `license_plate`, `user_id`
- Trạng thái session: `active`

**Giai đoạn 2 – Trong bãi**:
- Session ở trạng thái active
- Hệ thống theo dõi số chỗ trống (current_occupancy)

**Giai đoạn 3 – Cổng ra (Exit)**:
- AI nhận diện biển số
- Backend tra cứu session active tương ứng
- Tính phí dựa trên thời gian: `fee = f(exit_time - entry_time)`
- Cập nhật `exit_time`, `fee`, status = `completed`
- Mở barrier cho xe ra

---

### Slide 2.3: Cơ chế tính phí

Hệ thống phân biệt **hai loại phiên**:

**Member (thành viên đã đăng ký)**:
- Có `user_id` từ nhận diện khuôn mặt
- Biển số đã đăng ký trong hệ thống
- Có thể sử dụng vé tháng hoặc tính phí theo giờ
- Phí có thể trừ từ ví điện tử trong hệ thống

**Guest (khách vãng lai)**:
- Chỉ có thông tin biển số (không có user_id)
- Lưu vào bảng `guest_sessions` riêng biệt
- Tính phí theo giờ thực tế gửi xe
- Thanh toán khi ra cổng

Công thức tính phí:
```
duration_minutes = (exit_time - entry_time) / 60
fee = ceil(duration_minutes / pricing_unit) × unit_price
```

---

### Slide 2.4: Xác thực tại cổng

**Tại cổng vào**, Backend thực hiện kiểm tra đa lớp:

1. Kiểm tra confidence AI có đạt ngưỡng không
2. Biển số có trong database không → phân loại member/guest
3. Nếu member: khuôn mặt có khớp chủ xe không
4. Ví có đủ tiền không / vé tháng còn hạn không
5. Bãi còn chỗ trống không

Chỉ khi **tất cả điều kiện** đều thỏa mãn, Backend mới trả `allowed: true` → Bridge mở barrier.

**Tại cổng ra**:
1. Nhận diện biển số từ AI
2. Tra cứu session active tương ứng
3. Đối chiếu biển số phiên vào với biển số phiên ra
4. Tính phí → Kết thúc session → Mở barrier

---

### Slide 2.5: Bảo mật – Xác thực JWT

Hệ thống sử dụng **JSON Web Token (JWT)** cho xác thực API:

- Khi admin đăng nhập thành công → Backend tạo JWT token chứa `{id, username, role}`
- Token được ký bằng `JWT_SECRET` với thời hạn cấu hình
- Mỗi request API phải gửi token trong header `Authorization: ******

**Middleware auth** kiểm tra:
1. Token có tồn tại trong header không
2. Token có hợp lệ (verify signature) không
3. Token có trong bảng `admin_sessions` không (tránh token bị thu hồi vẫn dùng được)
4. Gắn thông tin admin vào `req.admin` cho route handler sử dụng

---

### Slide 2.6: Bảo mật – Mã hóa & Session tracking

**Mã hóa mật khẩu**:
- Sử dụng **bcryptjs** với salt rounds
- Mật khẩu không bao giờ lưu dạng plaintext
- So sánh bằng `bcrypt.compare()` — an toàn trước timing attack

**Session tracking**:
- Mỗi lần đăng nhập, ghi record vào bảng `admin_sessions`:
  - `token_hash`: SHA-256 của JWT token (không lưu token thô)
  - `ip_address`: Địa chỉ IP đăng nhập
  - `user_agent`: Thiết bị đăng nhập
- Cho phép thu hồi token, theo dõi phiên bất thường

**Phân quyền RBAC**:
- `super_admin`: Toàn quyền
- `admin`: Quản lý bãi xe, người dùng
- `operator`: Vận hành, xử lý sự cố

---

### Slide 2.7: Bridge Service – Cầu nối giao dịch

Bridge Service (Node.js) là **trung tâm điều phối** toàn bộ luồng giao dịch:

**Vai trò**:
- Nhận tín hiệu phần cứng (ESP8266 qua TCP)
- Gọi AI Service để nhận diện
- Gửi Backend để xác thực và tạo session
- Điều khiển barrier (mở/đóng)
- Broadcast realtime cho OperatorWeb

**Cơ chế an toàn**:
- **Debounce**: Ngăn trigger liên tục cùng cổng (configurable ms)
- **Processing lock**: Không xử lý song song cùng 1 cổng
- **Error handling**: Nếu AI hoặc Backend lỗi → giữ barrier đóng, yêu cầu operator can thiệp thủ công
- **Timeout**: Xử lý khi service không phản hồi

---

### Slide 2.8: Cơ sở dữ liệu giao dịch

Các bảng chính phục vụ giao dịch:

| Bảng | Vai trò |
|------|---------|
| `parking_sessions` | Phiên gửi xe member (entry_time, exit_time, fee, status) |
| `guest_sessions` | Phiên gửi xe khách vãng lai |
| `users` | Thông tin người dùng đăng ký |
| `face_embeddings` | Vector khuôn mặt 512D cho nhận diện |
| `admin_sessions` | Tracking phiên đăng nhập admin |
| `event_logs` | Ghi log toàn bộ sự kiện (audit trail) |
| `parking_lots` | Thông tin bãi xe, sức chứa, occupancy |

Hệ thống ghi **event log** cho mọi hành động quan trọng: tạo session, kết thúc session, force-end, thay đổi cấu hình — đảm bảo khả năng kiểm toán.

---

### Slide 2.9: Xử lý tình huống đặc biệt

**Force-end session** (kết thúc cưỡng bức):
- Khi xe "mất" trong bãi (không ra cổng)
- Operator/Admin có quyền force-end với lý do bắt buộc
- Ghi log: ai kết thúc, lý do gì, thời điểm nào
- Giải phóng slot trong bãi

**Xe khách vãng lai**:
- AI không nhận diện được khuôn mặt → tạo guest session
- Chỉ cần biển số để tracking
- Tính phí đầy đủ khi ra

**AI/Backend lỗi**:
- Barrier giữ đóng (fail-safe)
- Broadcast lỗi cho operator
- Operator can thiệp thủ công qua OperatorWeb

---

### Slide 2.10: Kết quả đạt được (Phần 2)

- ✅ Luồng thanh toán tự động end-to-end (entry → exit)
- ✅ Phân biệt member/guest, tính phí chính xác theo thời gian
- ✅ Bảo mật đa lớp: JWT + bcrypt + session tracking + RBAC
- ✅ Xử lý đầy đủ edge cases (force-end, lỗi AI, xe khách)
- ✅ Event logging cho kiểm toán
- ✅ Bridge Service ổn định với debounce và error handling

Em xin kết thúc phần trình bày thứ hai. Xin mời sinh viên 3 trình bày phần tiếp theo.

---
---

## PHẦN 3: SINH VIÊN 3 – HỆ THỐNG WEB & CLOUD SERVER

---

### Slide 3.1: Giới thiệu phần phụ trách

Kính thưa Hội đồng, em xin trình bày phần thứ ba: **Xây dựng hệ thống quản trị trên nền web và triển khai dịch vụ cloud server**.

Phần này bao gồm:
- Xây dựng 3 ứng dụng web React (WebApp, AdminWeb, OperatorWeb)
- Phát triển Backend RESTful API với Express.js
- Thiết kế kiến trúc cloud server
- Triển khai hệ thống trên VPS với Nginx, PM2, PostgreSQL

---

### Slide 3.2: Ba ứng dụng React

Hệ thống cung cấp **3 giao diện** cho 3 đối tượng khác nhau:

**1. WebApp** (Người dùng cuối):
- Đăng ký tài khoản, đăng ký khuôn mặt và biển số
- Xem lịch sử gửi xe, quản lý thông tin cá nhân
- Nạp tiền, xem số dư ví

**2. AdminWeb** (Quản trị viên):
- Dashboard tổng quan: doanh thu, số xe, thiết bị, cảnh báo
- Quản lý sessions, users, devices, barriers
- Báo cáo doanh thu, xuất thống kê
- Cấu hình hệ thống, quản lý quyền

**3. OperatorWeb** (Nhân viên vận hành):
- Giám sát realtime cổng vào/ra
- Xem kết quả AI nhận diện trực tiếp
- Can thiệp thủ công: mở/đóng barrier, force-end session
- Nhận thông báo lỗi tức thì qua WebSocket

---

### Slide 3.3: Công nghệ Frontend

Cả 3 ứng dụng đều sử dụng **cùng stack công nghệ**:

- **React**: Thư viện UI component-based, Virtual DOM tối ưu render
- **Vite**: Build tool thế hệ mới
  - Development: ES Modules native → khởi động < 1 giây, Hot Module Replacement cực nhanh
  - Production: Rollup bundle → code splitting, tree shaking, tối ưu kích thước
- **Tailwind CSS**: Framework utility-first, đảm bảo ngôn ngữ thiết kế đồng nhất cho cả 3 app
- **React Router**: Client-side routing
- **Axios/Fetch**: HTTP client gọi Backend API

Việc sử dụng cùng stack giúp nhóm phát triển nhanh, chia sẻ component, và maintain dễ dàng.

---

### Slide 3.4: AdminWeb – Dashboard & Quản lý

**Dashboard** hiển thị real-time:
- Tên và địa chỉ bãi xe
- Sức chứa tổng / Đang sử dụng / Còn trống
- Doanh thu hôm nay, số phiên hôm nay
- Số thiết bị online/offline
- Cảnh báo chưa xử lý

**Các module quản lý**:
- Sessions: Xem, lọc, tìm kiếm phiên gửi xe (member + guest), force-end
- Users: Quản lý tài khoản, vehicles, face registration
- Devices: Theo dõi trạng thái thiết bị IoT
- Reports: Báo cáo doanh thu theo ngày/tuần/tháng, phân tích giờ cao điểm
- Event Logs: Nhật ký mọi sự kiện hệ thống (audit trail)
- Alerts: Cảnh báo hệ thống, thiết bị offline, bất thường

---

### Slide 3.5: Backend API – Cấu trúc

Backend được xây dựng bằng **Express.js** (Node.js 20 LTS), cấu trúc modular:

**Routes chính**:
| Route | Chức năng |
|-------|-----------|
| `/api/auth` | Đăng nhập/đăng xuất admin |
| `/api/dashboard` | Dữ liệu tổng quan real-time |
| `/api/sessions` | CRUD phiên gửi xe + force-end |
| `/api/users` | Quản lý người dùng + vehicles |
| `/api/barriers` | Điều khiển barrier từ xa |
| `/api/devices` | Quản lý thiết bị IoT |
| `/api/reports` | Báo cáo, thống kê doanh thu |
| `/api/event-logs` | Nhật ký hệ thống |
| `/api/alerts` | Quản lý cảnh báo |
| `/api/hardware` | Trạng thái phần cứng |
| `/api/config` | Cấu hình hệ thống |

**Middleware**: Authentication (JWT), Error handling, File upload, Request logging

---

### Slide 3.6: OperatorWeb – Giám sát realtime

OperatorWeb kết nối **WebSocket** đến Bridge Service, nhận events real-time:

- `ENTRY_DETECTED` / `EXIT_DETECTED`: Xe được phát hiện tại cổng
- `AI_RESULT`: Kết quả nhận diện từ AI (biển số, khuôn mặt)
- `SESSION_CREATED`: Phiên mới được tạo thành công
- `BARRIER_OPENED`: Barrier đã mở
- `ERROR`: Lỗi xảy ra cần can thiệp
- `NO_OBJECT`: Không phát hiện đối tượng

Operator có thể:
- Theo dõi live cả 2 cổng trên 1 màn hình
- Xem ảnh biển số và khuôn mặt AI chụp được
- Mở barrier thủ công khi cần
- Force-end session bất thường

---

### Slide 3.7: Kiến trúc Cloud Server

Hệ thống được triển khai trên **VPS (Virtual Private Server)**:

**Trên VPS (cloud)**:
- **Nginx**: Reverse proxy + serve static files + SSL termination
- **Express Backend**: API server chạy trên port 3000
- **PostgreSQL**: Cơ sở dữ liệu quan hệ
- **3 React builds**: Được Nginx phục vụ dưới dạng static files

**Tại bãi xe (local)**:
- **Bridge Service**: Kết nối phần cứng, gọi AI, gọi Backend qua internet
- **AI Service**: FastAPI chạy trên port 5001

Kiến trúc này cho phép **quản lý từ xa** — admin có thể truy cập AdminWeb từ bất cứ đâu có internet, trong khi phần xử lý AI nặng vẫn chạy local tại bãi xe.

---

### Slide 3.8: Triển khai Production

**Quy trình deploy**:
1. Developer push code lên Git
2. SSH vào VPS, pull code mới
3. Frontend: `npm run build` → copy static files vào thư mục Nginx
4. Backend: `pm2 restart` → Express reload không downtime

**Cấu hình**:
- **Nginx**: Reverse proxy `/api/*` → Express:3000, serve React builds
- **PM2**: Process manager — auto restart, log management, monitoring
- **PostgreSQL**: Database server, backup định kỳ
- **.env files**: Quản lý biến môi trường riêng biệt (development/production)
- **SSL**: HTTPS encryption cho toàn bộ traffic

---

### Slide 3.9: Quản lý người dùng & Đăng ký khuôn mặt

**Luồng đăng ký người dùng mới**:
1. User đăng ký tài khoản trên WebApp (phone, email, full_name)
2. Đăng ký biển số xe (lưu vào bảng vehicles)
3. Upload ảnh khuôn mặt:
   - Backend nhận file → chuyển đến AI Service
   - InsightFace trích xuất embedding 512 chiều
   - Lưu embedding vào bảng `face_embeddings`
4. Từ lần sau, hệ thống tự nhận diện khuôn mặt tại cổng

**Quản lý doanh thu**:
- Dashboard hiển thị doanh thu real-time (hôm nay, tuần, tháng)
- Reports module cho phép lọc theo khoảng thời gian
- Phân tích: giờ cao điểm, tỷ lệ member/guest, occupancy trung bình

---

### Slide 3.10: Kết quả đạt được (Phần 3)

- ✅ 3 ứng dụng web React hoàn chỉnh, responsive, UI đồng nhất
- ✅ Backend RESTful API đầy đủ 11 route modules
- ✅ Triển khai cloud server ổn định trên VPS
- ✅ OperatorWeb realtime với WebSocket
- ✅ Dashboard quản trị trực quan, dữ liệu real-time
- ✅ Hệ thống báo cáo doanh thu chi tiết

Em xin kết thúc phần trình bày thứ ba.

---
---

## KẾT LUẬN (Người dẫn chung)

---

### Kết quả tổng thể

Kính thưa Hội đồng, nhóm chúng em đã hoàn thành xây dựng **Hệ thống bãi xe thông minh** với đầy đủ các thành phần:

✅ **Phần cứng IoT**: 2 cổng vào/ra tự động với cảm biến, camera, barrier

✅ **AI Service**: Nhận diện biển số (PaddleOCR) và khuôn mặt (InsightFace) chính xác, xử lý < 3 giây

✅ **Hệ thống thanh toán**: Tự động tính phí, phân biệt member/guest, bảo mật đa lớp

✅ **Web quản trị**: 3 ứng dụng React phục vụ đầy đủ 3 đối tượng (user, admin, operator)

✅ **Cloud deployment**: Triển khai hoàn chỉnh trên VPS, quản lý từ xa

---

### Điểm nổi bật

1. **Tích hợp end-to-end**: Từ phần cứng → AI → Backend → Frontend, tất cả hoạt động đồng bộ
2. **Nhận diện kép**: Biển số + khuôn mặt tăng cường bảo mật, chống gian lận
3. **Realtime monitoring**: Operator theo dõi và can thiệp tức thì
4. **Mở rộng dễ dàng**: Thêm user không cần train lại AI, thêm cổng chỉ cần thêm phần cứng
5. **Fail-safe design**: Lỗi AI/Backend → barrier đóng → can thiệp thủ công

---

### Hướng phát triển

- Tích hợp thanh toán trực tuyến (VNPay, MoMo)
- Ứng dụng mobile cho người dùng
- Mở rộng nhận diện loại xe (ô tô, xe máy, xe điện)
- Hệ thống dẫn đường tìm chỗ trống trong bãi
- Scale nhiều bãi xe trong cùng hệ thống quản lý
- Gia công PCB chuyên dụng thay thế mạch nguyên mẫu

---

### Kết thúc

Trên đây là toàn bộ nội dung trình bày của nhóm chúng em về đề tài "Hệ thống quản lý bãi xe thông minh sử dụng trí tuệ nhân tạo và IoT".

Nhóm em xin chân thành cảm ơn Hội đồng đã lắng nghe. Chúng em sẵn sàng trả lời các câu hỏi từ quý Thầy Cô.

**Xin cảm ơn!**
