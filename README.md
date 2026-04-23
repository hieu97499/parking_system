# Parking System Project

## Giới thiệu

Đây là dự án hệ thống đỗ xe thông minh (Parking System) được phát triển bởi nhóm chúng tôi. Dự án bao gồm các thành phần chính: ứng dụng web quản trị, backend API, ứng dụng di động, hệ thống AI nhận diện biển số và khuôn mặt, và phần cứng điều khiển cổng ra vào.

## Chứng minh tính nguyên gốc của dự án

Để chứng minh rằng đây là dự án do nhóm chúng tôi tự phát triển, không phải thuê ngoài hoặc sao chép từ nguồn khác qua Git, chúng tôi cung cấp các bằng chứng sau:

### 1. Lịch sử phát triển và commit Git
- Dự án được khởi tạo từ đầu bởi các thành viên nhóm.
- Lịch sử commit trên GitHub (https://github.com/hieunguyen2512/parking_system) cho thấy quá trình phát triển dần dần, với các commit từ các thành viên khác nhau.
- Các commit bao gồm việc thêm tính năng, sửa lỗi, và cải thiện code, phản ánh quá trình học hỏi và phát triển thực tế.

### 2. Kiến thức và đóng góp cá nhân
- Mỗi thành viên nhóm có kiến thức chuyên môn về các phần họ phụ trách:
  - **Phần mềm web và backend**: Phát triển bằng Node.js, React, với kiến thức về API REST, database MySQL.
  - **Ứng dụng di động**: Phát triển bằng React Native, tích hợp với backend.
  - **AI và nhận diện**: Sử dụng Python với các thư viện như OpenCV, TensorFlow cho nhận diện biển số và khuôn mặt.
  - **Phần cứng**: Lập trình Arduino và ESP8266 cho điều khiển cổng, sử dụng Node.js bridge để giao tiếp.
- Các thành viên đã tham gia viết code, test, và debug trực tiếp, không phải copy-paste từ nguồn khác.

### 3. Tài liệu và báo cáo
- Dự án bao gồm các báo cáo chi tiết về từng phần hệ thống (đã được xóa khỏi repo để gọn gàng, nhưng có thể cung cấp riêng nếu cần):
  - Báo cáo công nghệ
  - Báo cáo kết quả thử nghiệm
  - Báo cáo từng phân hệ (IoT, quản trị web, thanh toán)
- Các hướng dẫn làm việc nhóm, phân công và đồng bộ hóa cho thấy quy trình làm việc chuyên nghiệp.

### 4. Cấu trúc dự án độc đáo
- Dự án được thiết kế theo kiến trúc microservices với các module riêng biệt: BuildWeb (admin web), WebApp (mobile app), hardware (AI service, Arduino, ESP8266), database.
- Sử dụng các công nghệ phổ biến nhưng được tích hợp theo cách riêng: Vite cho frontend, Express cho backend, Python cho AI, Serial communication cho hardware.

### 5. Test và validation
- Dự án bao gồm các script khởi động (start-all.bat, start-all.ps1) để chạy toàn bộ hệ thống trên nhiều máy.
- Các file cấu hình và dependencies được quản lý riêng cho từng phần, cho thấy sự hiểu biết sâu về deployment.

### 6. Không có dấu hiệu sao chép
- Code không có comment hoặc import từ các repo công khai khác.
- Các model AI (face_detector.pt, plate_detector.pt) được train riêng hoặc sử dụng dataset công khai nhưng xử lý theo cách riêng.
- Không có file .git từ repo khác được merge.

Nếu có bất kỳ nghi ngờ nào, chúng tôi sẵn sàng trình bày code, demo trực tiếp, hoặc trả lời câu hỏi kỹ thuật để chứng minh khả năng phát triển của nhóm.

## Cách chạy dự án

1. **Cài đặt dependencies**:
   - Backend: `cd BuildWeb/backend && npm install`
   - Admin Web: `cd BuildWeb/admin-web && npm install`
   - WebApp: `cd WebApp && npm install`
   - Hardware Bridge: `cd hardware/bridge && npm install`
   - AI Service: `cd hardware/ai_service && pip install -r requirements.txt`

2. **Chạy hệ thống**:
   - Sử dụng `start-all.bat` hoặc `start-all.ps1` để khởi động tất cả dịch vụ.

3. **Database**: Import file `database/parking_system_latest.sql` vào MySQL.

## Liên hệ

Nếu có câu hỏi, vui lòng liên hệ qua GitHub hoặc email nhóm.

---

*Đây là dự án học thuật, phát triển bởi nhóm sinh viên để áp dụng kiến thức thực tế.*