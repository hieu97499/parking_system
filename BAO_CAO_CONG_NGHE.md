# BÁO CÁO CÔNG NGHỆ VÀ THIẾT BỊ HỆ THỐNG BÃI ĐỖ XE THÔNG MINH

---

## BÁO CÁO MÔ TẢ CHI TIẾT (DẠNG VĂN BẢN)

### I. PHẦN CỨNG VÀ THIẾT BỊ NHÚNG

**1. Camera USB**

Camera là thiết bị đầu vào trực tiếp của hệ thống bãi đỗ xe. Hệ thống sử dụng bốn camera được kết nối qua cổng USB với máy tính điều khiển, được truy xuất thông qua chỉ số V4L2 (index 0 đến 3). Mỗi cổng vào/ra được trang bị hai camera riêng biệt: một camera chuyên chụp biển số xe và một camera chuyên nhận diện khuôn mặt người điều khiển. Camera hoạt động ở độ phân giải 1280×720 pixel với tốc độ 15 khung hình/giây, đảm bảo đủ chất lượng ảnh cho các thuật toán nhận diện hoạt động chính xác trong điều kiện thực tế.

**2. Arduino UNO**

Arduino UNO là vi điều khiển nguồn mở dựa trên chip ATmega328P, được sử dụng rộng rãi trong các dự án IoT và tự động hóa. Trong hệ thống này, mỗi cổng ra/vào được trang bị một Arduino UNO đóng vai trò bộ điều khiển cổng chuyên dụng. Arduino kết nối trực tiếp với cảm biến siêu âm HYSRF05 (chân Trig D9, Echo D10) để phát hiện xe trong phạm vi 80 cm, và điều khiển servo motor (chân D6) để mở/đóng thanh chắn. Arduino hoạt động theo giao thức I2C ở chế độ Slave với địa chỉ 0x08 (cổng vào) và 0x09 (cổng ra), nhận lệnh điều khiển và phản hồi trạng thái cho ESP8266. Firmware được lập trình bằng Arduino IDE và sử dụng hai thư viện chuẩn là Wire.h cho giao tiếp I2C và Servo.h cho điều khiển servo.

**3. Cảm biến siêu âm HYSRF05**

HYSRF05 là cảm biến siêu âm đo khoảng cách hoạt động theo nguyên lý phát và thu sóng âm tần số cao. Cảm biến này được gắn vào mỗi cổng bãi xe để phát hiện sự hiện diện của xe trước thanh chắn. Khi xe tiến vào trong vòng 80 cm, cảm biến gửi tín hiệu phát hiện tới Arduino, kích hoạt quy trình xác thực. Cảm biến giao tiếp với Arduino qua hai chân kỹ thuật số: chân Trigger phát xung siêu âm và chân Echo nhận tín hiệu phản hồi để tính khoảng cách.

**4. Servo Motor (Thanh chắn barrier)**

Servo motor được sử dụng để cơ học hóa việc đóng/mở thanh chắn tại mỗi cổng. Động cơ quay đến góc 90° khi nhận lệnh mở và trở về 0° khi đóng. Toàn bộ cơ cấu được Arduino UNO điều khiển thông qua thư viện Servo.h. Hệ thống có tính năng tự động đóng sau 2 giây kể từ khi xe đã đi qua và cảm biến không còn phát hiện vật thể.

**5. ESP8266 NodeMCU / D1 Mini**

ESP8266 là module WiFi giá thành thấp tích hợp vi điều khiển 32-bit Tensilica Xtensa LX106, rất phổ biến trong các ứng dụng IoT. Trong hệ thống này, ESP8266 đóng vai trò I2C Master — đọc trạng thái và gửi lệnh tới hai Arduino UNO đồng thời qua các chân GPIO4 (SDA) và GPIO5 (SCL). Đồng thời, ESP8266 kết nối vào mạng WiFi nội bộ và thiết lập kết nối TCP đến máy chủ Hardware Bridge trên cổng 4003, hoạt động như một cầu nối hai chiều: chuyển tiếp sự kiện cảm biến từ Arduino lên Bridge và chuyển tiếp lệnh điều khiển từ Bridge xuống Arduino. Firmware được nạp từ Arduino IDE với board package của ESP8266.

---

### II. PHẦN MỀM AI (AI SERVICE)

**6. Python 3**

Python là ngôn ngữ lập trình bậc cao, đa năng, được lựa chọn làm ngôn ngữ chính cho toàn bộ dịch vụ AI trong hệ thống. Python có hệ sinh thái thư viện học máy và xử lý ảnh cực kỳ phong phú (NumPy, OpenCV, PyTorch…), cú pháp ngắn gọn và dễ đọc, phù hợp cho phát triển nhanh các ứng dụng AI. Toàn bộ code AI Service chạy trong môi trường ảo (venv) riêng biệt tại thư mục `.venv` để quản lý phụ thuộc độc lập với hệ thống.

**7. FastAPI (phiên bản 0.111.0)**

FastAPI là framework web Python hiện đại, hiệu năng cao, được xây dựng trên nền tảng Starlette và Pydantic. FastAPI cho phép xây dựng REST API nhanh chóng với cú pháp khai báo kiểu dữ liệu Python (type hints), tự động sinh tài liệu API (Swagger UI/OpenAPI), và hỗ trợ xử lý bất đồng bộ (async/await) tự nhiên. Trong hệ thống, FastAPI đóng vai trò lớp giao tiếp của AI Service, tiếp nhận yêu cầu nhận diện từ Hardware Bridge và Backend, xử lý bằng các module AI rồi trả kết quả về. AI Service lắng nghe trên cổng 5001.

**8. Uvicorn (phiên bản 0.29.0)**

Uvicorn là ASGI server triển khai bằng Python, dựa trên uvloop (vòng lặp sự kiện tốc độ cao) và httptools. Uvicorn được dùng làm server chạy ứng dụng FastAPI trong môi trường production, cung cấp hiệu năng xử lý yêu cầu HTTP vượt trội so với các WSGI server truyền thống như Gunicorn. Uvicorn hỗ trợ tải lại tự động (--reload) trong môi trường phát triển và cấu hình workers cho môi trường production.

**9. OpenCV — opencv-python (phiên bản 4.9.0.80)**

OpenCV (Open Source Computer Vision Library) là thư viện xử lý ảnh và thị giác máy tính mã nguồn mở được sử dụng rộng rãi nhất thế giới. Trong hệ thống, OpenCV được dùng để mở và đọc luồng video từ camera (cv2.VideoCapture), thu thập khung hình (frame), thực hiện tiền xử lý ảnh như resize và crop vùng quan tâm trước khi đưa vào model AI. OpenCV hoạt động ở độ phân giải 1280×720 với 15 FPS, cũng hỗ trợ chế độ chụp ảnh lazy (LAZY) để tiết kiệm tài nguyên CPU.

**10. NumPy (phiên bản 1.26.4)**

NumPy là thư viện tính toán khoa học cốt lõi của Python, cung cấp cấu trúc dữ liệu mảng N chiều (ndarray) hiệu năng cao và các hàm toán học trên mảng. NumPy là nền tảng của hầu hết các thư viện AI/ML trong hệ sinh thái Python. Trong hệ thống, NumPy được dùng để biểu diễn ảnh dưới dạng mảng số (ma trận pixel), thực hiện các phép tính vector như tính cosine similarity giữa các embedding khuôn mặt, và xử lý dữ liệu đầu ra từ model YOLO và InsightFace.

**11. YOLOv8 — Ultralytics (phiên bản ≥ 8.2.0)**

YOLO (You Only Look Once) là họ thuật toán phát hiện đối tượng thời gian thực nổi tiếng, hoạt động bằng cách phân chia ảnh thành lưới ô và dự đoán bounding box cùng nhãn lớp trong một lần forward pass duy nhất. YOLOv8 là phiên bản mới nhất của Ultralytics, cải tiến đáng kể về kiến trúc backbone và head so các phiên bản trước, đạt độ chính xác và tốc độ tốt hơn. Trong hệ thống, YOLOv8 được sử dụng cho hai nhiệm vụ: phát hiện vùng biển số xe trong ảnh (model `plate_detector.pt`) và phát hiện khuôn mặt người (model `face_detector.pt`). Cả hai model này đều được huấn luyện riêng trên tập dữ liệu phù hợp với điều kiện Việt Nam. Ngưỡng confidence mặc định là 0.5 cho biển số và 0.6 cho khuôn mặt.

**12. EasyOCR (phiên bản ≥ 1.7.1)**

EasyOCR là thư viện nhận dạng ký tự quang học (OCR) mã nguồn mở, hỗ trợ hơn 80 ngôn ngữ, xây dựng trên nền tảng deep learning (CRNN + CTC). EasyOCR trả về danh sách các đoạn văn bản cùng vị trí và độ tin cậy tương ứng trong ảnh. Trong hệ thống, sau khi YOLOv8 phát hiện và crop vùng biển số, EasyOCR được dùng để đọc chuỗi ký tự trên biển số đó, trả về kết quả dạng chuỗi văn bản (ví dụ: "51A-12345") để lưu vào cơ sở dữ liệu và so khớp với xe đã đăng ký.

**13. InsightFace – ArcFace buffalo_sc (phiên bản ≥ 0.7.3)**

InsightFace là thư viện nhận diện khuôn mặt mã nguồn mở nổi tiếng, phát triển bởi nhóm nghiên cứu DeepInsight. Thuật toán cốt lõi là ArcFace (Additive Angular Margin Loss) — một phương pháp học metric space tạo ra các vector đặc trưng (embedding) có biên phân tách lớn giữa các cá nhân khác nhau, đạt độ chính xác hàng đầu trên các benchmark nhận diện khuôn mặt. Model buffalo_sc là phiên bản nhẹ (small/compact) trong bộ buffalo, phù hợp cho triển khai trên máy tính thông thường không có GPU cao cấp. Model tạo ra vector embedding 512 chiều cho mỗi khuôn mặt. Khi nhận diện, hệ thống tính cosine similarity giữa embedding khuôn mặt vừa chụp và các embedding đã lưu trong cơ sở dữ liệu để xác định danh tính.

**14. ONNX Runtime (phiên bản ≥ 1.18.0)**

ONNX (Open Neural Network Exchange) là định dạng mở để biểu diễn mô hình học máy, cho phép chạy model được huấn luyện từ nhiều framework khác nhau (PyTorch, TensorFlow…) trên một runtime chung. ONNX Runtime là engine thực thi hiệu năng cao cho các model định dạng ONNX, hỗ trợ tối ưu hóa suy luận trên CPU và GPU. InsightFace sử dụng ONNX Runtime để chạy model ArcFace buffalo_sc, giúp inference nhanh hơn so với PyTorch thuần túy trong môi trường production.

**15. httpx (phiên bản 0.27.0)**

httpx là thư viện HTTP client hiện đại cho Python, hỗ trợ cả giao tiếp đồng bộ và bất đồng bộ (async/await), tương thích hoàn toàn với FastAPI và asyncio. Trong hệ thống, AI Service dùng httpx để gửi kết quả nhận diện (biển số, thông tin khuôn mặt, ảnh chụp) đến Backend API qua HTTP, bao gồm upload file ảnh và gửi dữ liệu JSON.

---

### III. HARDWARE BRIDGE

**16. Node.js**

Node.js là môi trường thực thi JavaScript phía server, xây dựng trên V8 engine của Google Chrome. Node.js sử dụng mô hình I/O bất đồng bộ, non-blocking, đặc biệt phù hợp cho các ứng dụng cần xử lý nhiều kết nối đồng thời như cổng trung gian (bridge). Hardware Bridge của hệ thống chạy trên Node.js, liên tục lắng nghe kết nối từ ESP8266, nhận sự kiện từ cảm biến và điều phối luồng lệnh giữa phần cứng và phần mềm backend.

**17. serialport (phiên bản 12.0.0)**

serialport là thư viện Node.js cho phép giao tiếp với các cổng serial (COM/USB) của hệ điều hành. Thư viện cung cấp API đọc/ghi dữ liệu từ các thiết bị kết nối qua cổng serial như Arduino, cảm biến, và các vi điều khiển khác. Trong hệ thống, serialport được dùng làm phương án giao tiếp trực tiếp với Arduino qua cáp USB (chế độ fallback), khi không sử dụng ESP8266 làm cầu nối WiFi — ví dụ trong môi trường phát triển và debug trực tiếp trên máy tính.

**18. ws (phiên bản 8.17.0)**

ws là thư viện WebSocket thuần (pure WebSocket) cho Node.js, được đánh giá là nhanh và nhẹ nhất trong số các thư viện WebSocket dành cho Node.js. Khác với Socket.IO (có overhead giao thức riêng), ws hiện thực trực tiếp chuẩn WebSocket RFC 6455. Hardware Bridge sử dụng ws để tạo WebSocket Server lắng nghe trên cổng 4003, nhận kết nối TCP từ module ESP8266 qua WiFi. Mỗi sự kiện từ cảm biến (xe vào/ra) được gửi dạng text message qua kênh này.

**19. axios (phiên bản 1.7.2 — trong Bridge)**

axios là thư viện HTTP client phổ biến cho cả Node.js và trình duyệt, hỗ trợ Promise và async/await, tự động chuyển đổi JSON, xử lý interceptors và timeout. Hardware Bridge dùng axios để gọi các REST API endpoint của Backend — ví dụ thông báo sự kiện xe vào/ra để Backend xử lý logic nghiệp vụ và lưu cơ sở dữ liệu.

---

### IV. BACKEND API SERVER

**20. Express.js (phiên bản 4.19.2)**

Express là framework web tối giản và linh hoạt cho Node.js, là một trong những framework phổ biến nhất trong hệ sinh thái JavaScript. Express cung cấp hệ thống routing mạnh mẽ, middleware pipeline, và API đơn giản để xây dựng REST API. Backend của hệ thống sử dụng Express làm nền tảng phục vụ toàn bộ API: xác thực người dùng, quản lý phiên đỗ xe, điều khiển thiết bị, thống kê doanh thu và cảnh báo hệ thống.

**21. Socket.IO (phiên bản 4.8.3)**

Socket.IO là thư viện giao tiếp thời gian thực hai chiều dựa trên WebSocket, có cơ chế fallback tự động sang long-polling khi WebSocket không khả dụng. Socket.IO bổ sung các tính năng cao cấp hơn WebSocket thuần như: rooms, namespaces, auto-reconnection, và broadcast. Trong hệ thống, Backend sử dụng Socket.IO để phát sóng real-time các sự kiện quan trọng đến giao diện quản trị — bao gồm: xe vào/ra cập nhật ngay lập tức, trạng thái cổng barrier, cảnh báo mới, số lượng chỗ còn trống — giúp màn hình dashboard luôn hiển thị dữ liệu mới nhất mà không cần reload trang.

**22. jsonwebtoken (phiên bản 9.0.2)**

jsonwebtoken là thư viện Node.js hiện thực chuẩn JWT (JSON Web Token — RFC 7519). JWT là phương pháp xác thực stateless: server tạo ra một token có chữ ký số (signature) chứa thông tin người dùng, client lưu token và gửi kèm mọi request. Server xác minh chữ ký mà không cần tra cứu session trong cơ sở dữ liệu. Trong hệ thống, JWT được dùng để xác thực người dùng admin web và user webapp sau khi đăng nhập, với token được ký bằng thuật toán HS256 và có thời hạn hết hạn.

**23. bcryptjs (phiên bản 2.4.3)**

bcryptjs là hiện thực thuần JavaScript của thuật toán băm mật khẩu bcrypt — một trong những thuật toán được khuyến nghị nhất hiện nay để lưu trữ mật khẩu an toàn. bcrypt sử dụng salt ngẫu nhiên (để chống rainbow table attack) và cost factor (để làm chậm brute force theo thời gian). Hệ thống dùng bcryptjs để băm mật khẩu người dùng trước khi lưu vào cơ sở dữ liệu, và để so sánh mật khẩu nhập vào với hash đã lưu trong quá trình đăng nhập — đảm bảo mật khẩu không bao giờ được lưu dưới dạng plaintext.

**24. helmet (phiên bản 7.1.0)**

helmet là middleware Express tự động thiết lập các HTTP response header bảo mật theo khuyến nghị của OWASP, bao gồm: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security và nhiều header khác. Helmet giúp bảo vệ ứng dụng khỏi một số lớp tấn công phổ biến như XSS, clickjacking và MIME sniffing mà không đòi hỏi cấu hình phức tạp.

**25. express-rate-limit (phiên bản 7.3.1)**

express-rate-limit là middleware giới hạn tần suất request (rate limiting) cho Express, cho phép cấu hình số lượng request tối đa trong một khoảng thời gian nhất định. Middleware này được sử dụng để bảo vệ các endpoint đăng nhập và API khỏi tấn công brute force và DDoS cơ bản. Khi client vượt quá giới hạn, server trả về mã lỗi 429 Too Many Requests.

**26. pg — node-postgres (phiên bản 8.12.0)**

pg là thư viện Node.js chính thức và phổ biến nhất để kết nối và tương tác với cơ sở dữ liệu PostgreSQL. Thư viện hỗ trợ connection pooling (Pool), parameterized queries (chống SQL injection), và xử lý bất đồng bộ qua Promise/async-await. Backend sử dụng pg để thực hiện toàn bộ các thao tác CRUD (Create, Read, Update, Delete) trên cơ sở dữ liệu PostgreSQL, từ lưu phiên đỗ xe, tra cứu xe, quản lý tài khoản đến thống kê doanh thu.

**27. cors (phiên bản 2.8.5)**

cors là middleware Express xử lý CORS (Cross-Origin Resource Sharing) — cơ chế bảo mật trình duyệt kiểm soát việc trang web từ một nguồn gốc (origin) có thể yêu cầu tài nguyên từ nguồn gốc khác hay không. Trong hệ thống, cors được cấu hình để cho phép frontend (Admin Web và User WebApp chạy trên các cổng khác nhau) giao tiếp với Backend API, đồng thời chặn các nguồn gốc không được phép.

---

### V. CƠ SỞ DỮ LIỆU

**28. PostgreSQL (phiên bản 17)**

PostgreSQL là hệ quản trị cơ sở dữ liệu quan hệ (RDBMS) mã nguồn mở mạnh mẽ và đầy đủ tính năng, được phát triển liên tục hơn 35 năm. PostgreSQL hỗ trợ các tính năng nâng cao như kiểu dữ liệu tùy chỉnh, JSON/JSONB, full-text search, window functions, và PostGIS (dữ liệu địa lý). Phiên bản 17 cải tiến hiệu năng truy vấn và quản lý kết nối. Hệ thống sử dụng PostgreSQL làm cơ sở dữ liệu trung tâm lưu trữ toàn bộ dữ liệu: tài khoản người dùng, phương tiện, phiên đỗ xe, vector khuôn mặt, thiết bị, cảnh báo và thống kê.

**29. Extension pgcrypto**

pgcrypto là extension chính thức của PostgreSQL cung cấp các hàm mã hóa mật mã học trực tiếp trong SQL, bao gồm: crypt() và gen_salt() để hash mật khẩu theo bcrypt ngay tại tầng cơ sở dữ liệu, các hàm mã hóa đối xứng/không đối xứng, và hàm tạo dữ liệu ngẫu nhiên mật mã học. Hệ thống sử dụng pgcrypto để bổ sung lớp bảo vệ mật khẩu ở tầng database, độc lập với lớp bcryptjs ở tầng ứng dụng.

**30. Extension uuid-ossp**

uuid-ossp là extension PostgreSQL cung cấp hàm uuid_generate_v4() tạo UUID (Universally Unique Identifier) phiên bản 4 dựa trên số ngẫu nhiên. UUID được sử dụng làm khóa chính (PRIMARY KEY) cho các bảng trong hệ thống, thay thế cho auto-increment integer. Ưu điểm của UUID là không thể đoán trước, không lộ thông tin về thứ tự chèn, và an toàn hơn khi phơi ra trong URL hoặc API response.

---

### VI. GIAO DIỆN QUẢN TRỊ (ADMIN WEB)

**31. React (phiên bản 18.3.1)**

React là thư viện JavaScript nguồn mở do Meta (Facebook) phát triển, dùng để xây dựng giao diện người dùng dựa trên mô hình component-based. React sử dụng Virtual DOM để tối ưu hóa việc cập nhật giao diện, và Hooks API (useState, useEffect…) để quản lý state và vòng đời component. React 18 giới thiệu Concurrent Mode và automatic batching nâng cao hiệu năng rendering. Admin Web được xây dựng hoàn toàn bằng React, tổ chức thành các component tái sử dụng: Dashboard, Sidebar, Header, bảng dữ liệu, biểu đồ thống kê.

**32. Vite (phiên bản 5.4.8)**

Vite là công cụ build frontend thế hệ mới, sử dụng ES Modules native của trình duyệt trong môi trường phát triển để đạt tốc độ khởi động và Hot Module Replacement (HMR) cực nhanh, không phụ thuộc bundling toàn bộ code như Webpack. Trong môi trường production, Vite sử dụng Rollup để bundle và tối ưu code. Cả Admin Web và User WebApp đều dùng Vite làm build tool, giúp trải nghiệm phát triển nhanh hơn đáng kể so với Create React App.

**33. TailwindCSS (phiên bản 3.4.13)**

TailwindCSS là framework CSS theo hướng utility-first — thay vì viết CSS component, developer ghép trực tiếp các class tiện ích (như `flex`, `p-4`, `text-blue-500`, `rounded-lg`) vào HTML/JSX để tạo kiểu. Phương pháp này giúp không cần đặt tên class, loại bỏ CSS không dùng (PurgeCSS tích hợp), và đảm bảo thiết kế nhất quán trong toàn ứng dụng. Hệ thống dùng TailwindCSS 3.4 cho cả Admin Web và User WebApp, với PostCSS làm bộ xử lý CSS.

**34. Zustand (phiên bản 4.5.5)**

Zustand là thư viện quản lý state toàn cục (global state management) cho React, thiết kế theo hướng đơn giản và nhẹ nhàng — store được định nghĩa bằng một hàm duy nhất, không cần Provider wrapper, không cần boilerplate như Redux. Zustand sử dụng hooks API của React và hỗ trợ subscriptions chọn lọc (selector) để tránh re-render không cần thiết. Hệ thống dùng Zustand để quản lý state dùng chung như: danh sách phiên đỗ xe, thông tin xe, cảnh báo, trạng thái cổng, và thông tin người dùng đang đăng nhập.

**35. recharts (phiên bản 2.12.7)**

recharts là thư viện biểu đồ (chart) cho React, xây dựng trên nền SVG và được thiết kế theo hướng declarative — biểu đồ được khai báo bằng JSX component như `<LineChart>`, `<BarChart>`, `<PieChart>`. recharts có API linh hoạt, responsive tự động và dễ tùy chỉnh style. Admin Web sử dụng recharts để hiển thị các biểu đồ thống kê doanh thu theo ngày/tháng, lượt xe vào/ra, phân bổ loại xe trên trang Dashboard.

**36. socket.io-client (phiên bản 4.8.3)**

socket.io-client là thư viện phía client tương ứng với Socket.IO server. Thư viện tự động kết nối WebSocket đến backend, xử lý reconnect khi mất kết nối, và phân phối sự kiện đến các handler đã đăng ký. Admin Web sử dụng socket.io-client để nhận dữ liệu real-time từ Backend: khi có xe vào/ra, cổng barrier thay đổi trạng thái, hoặc xuất hiện cảnh báo mới — giao diện cập nhật ngay lập tức mà không cần làm mới trang.

**37. lucide-react**

lucide-react là thư viện icon SVG cho React, cung cấp hơn 1000 icon rõ nét được thiết kế theo bộ quy tắc nhất quán, với trọng lượng bundle nhỏ vì chỉ import icon được sử dụng (tree-shakeable). Hệ thống dùng lucide-react xuyên suốt giao diện Admin Web và User WebApp cho các icon điều hướng, trạng thái, hành động.

**38. date-fns**

date-fns là thư viện xử lý ngày giờ JavaScript theo hướng functional, cung cấp hàm parse, format, tính toán khoảng thời gian và so sánh ngày. Admin Web dùng date-fns để format timestamp từ cơ sở dữ liệu sang dạng hiển thị thân thiện (ví dụ: "13/04/2026 14:30"), tính thời gian đỗ xe (duration), và lọc dữ liệu theo khoảng ngày.

**39. clsx**

clsx là thư viện tiện ích nhỏ giúp ghép nhiều className có điều kiện trong React một cách gọn gàng. Thay vì viết template string phức tạp, clsx cho phép khai báo object hoặc array: `clsx('base-class', { 'active': isActive, 'error': hasError })`. Được dùng rộng rãi kết hợp với TailwindCSS để xử lý style động trong Admin Web.

---

### VII. GIAO DIỆN NGƯỜI DÙNG (USER WEBAPP)

**40. React 18, Vite, TailwindCSS, Zustand, lucide-react (tương tự Admin Web)**

User WebApp sử dụng cùng bộ công nghệ nền tảng với Admin Web (React 18.3.1, Vite 5.4.8, TailwindCSS 3.4, Zustand 4.5.5, lucide-react) nhưng không bao gồm recharts hay socket.io-client do không cần biểu đồ hay cập nhật real-time. User WebApp tập trung vào trải nghiệm của khách hàng: tra cứu lịch sử đỗ xe cá nhân, đăng ký thẻ tháng, và đăng ký khuôn mặt để sử dụng tính năng nhận diện tự động.

---

### VIII. CÔNG CỤ PHÁT TRIỂN

**41. Arduino IDE**

Arduino IDE là môi trường phát triển tích hợp (IDE) chính thức dành cho lập trình các board Arduino và các vi điều khiển tương thích. IDE cung cấp trình soạn thảo code C/C++, trình biên dịch avr-gcc (cho Arduino UNO) và esptool (cho ESP8266), công cụ nạp firmware qua cổng serial, và Serial Monitor để debug. Hệ thống dùng Arduino IDE để lập trình và nạp firmware cho cả Arduino UNO (hai cổng) và ESP8266 NodeMCU.

**42. PostCSS**

PostCSS là công cụ xử lý CSS bằng JavaScript, hoạt động như một bộ chuyển đổi (transformer) thông qua các plugin. Trong hệ thống, PostCSS được dùng kết hợp với TailwindCSS: PostCSS đọc file CSS nguồn, chạy plugin Tailwind để generate toàn bộ utility classes, rồi đưa vào Vite để bundle. Cấu hình PostCSS được định nghĩa trong file `postcss.config.js` tại mỗi frontend project.

---

---

## 1. TỔNG QUAN HỆ THỐNG

Hệ thống bãi đỗ xe thông minh được xây dựng theo kiến trúc đa lớp gồm 5 thành phần chính:

```
[Camera + Cảm biến + Arduino]
           ↕ I2C
    [ESP8266 NodeMCU]
           ↕ TCP/WiFi
     [Hardware Bridge]
           ↕ HTTP / WebSocket
  [AI Service]   [Backend API]
                      ↕
                 [PostgreSQL]
                      ↕
           [Admin Web / User WebApp]
```

---

## 2. PHẦN CỨNG (HARDWARE)

### 2.1 Camera

| Camera | Vai trò | Cổng kết nối |
|--------|---------|--------------|
| Camera cổng vào – biển số | Chụp ảnh biển số xe vào bãi | USB/V4L2 index 0 |
| Camera cổng vào – khuôn mặt | Nhận diện khuôn mặt xe vào | USB/V4L2 index 1 |
| Camera cổng ra – biển số | Chụp ảnh biển số xe ra bãi | USB/V4L2 index 2 |
| Camera cổng ra – khuôn mặt | Nhận diện khuôn mặt xe ra | USB/V4L2 index 3 |

- **Độ phân giải thu thập:** 1280 × 720 px, 15 FPS
- **Thư viện điều khiển:** OpenCV 4.9 (`cv2.VideoCapture`)

### 2.2 Arduino UNO (I2C Slave)

Mỗi cổng (vào/ra) có một **Arduino UNO** đóng vai trò bộ điều khiển cổng:

| Thành phần | Chân kết nối | Chức năng |
|------------|-------------|-----------|
| Cảm biến siêu âm HYSRF05 | Trig: D9, Echo: D10 | Phát hiện xe trong vòng 80 cm |
| Servo motor | D6 | Điều khiển thanh chắn (0° = đóng, 90° = mở) |
| I2C SDA | A4 | Giao tiếp với ESP8266 |
| I2C SCL | A5 | Giao tiếp với ESP8266 |

- **I2C Address:** Cổng vào `0x08`, cổng ra `0x09`
- **Thư viện Arduino:** `Wire.h` (I2C), `Servo.h` (điều khiển servo)
- **Giao thức:** Arduino nhận lệnh 1 byte (`0x01` = mở, `0x02` = đóng, `0x00` = ping) và trả về 1 byte trạng thái (bit 0 = cảm biến, bit 1 = barrier, bit 2 = ready)

### 2.3 ESP8266 NodeMCU / D1 Mini (I2C Master + WiFi)

Module **ESP8266** đóng vai trò cầu nối giữa các Arduino và máy chủ Bridge:

| Chân | GPIO | Chức năng |
|------|------|-----------|
| D2 | GPIO4 | I2C SDA |
| D1 | GPIO5 | I2C SCL |

- **Vai trò:** I2C Master (giao tiếp 2 Arduino), WiFi TCP Client (kết nối Bridge port 4003)
- **Thư viện firmware:** `ESP8266WiFi.h`, `Wire.h`
- **Relay lệnh:** Arduino sensor → Bridge (`ENTRY:SENSOR:DETECTED`) và Bridge → Arduino (`ENTRY:OPEN`)
- **Nạp firmware bằng:** Arduino IDE với board package `http://arduino.esp8266.com/stable/package_esp8266com_index.json`

### 2.4 Thanh chắn (Barrier)

Điều khiển bằng **Servo motor** gắn vào Arduino. Góc mở/đóng có thể cấu hình.  
Tự động đóng sau 2 giây kể từ khi không còn phát hiện xe.

### 2.5 Các thiết bị hỗ trợ khác

| Loại thiết bị | Mô tả |
|---------------|-------|
| **Loa (speaker)** | Phát âm thanh thông báo kết quả (vào/ra thành công, lỗi) |
| **Màn hình LED** | Hiển thị thông tin biển số, trạng thái |
| **Máy tính điều khiển** | Chạy AI Service, Hardware Bridge, Backend API |

---

## 3. PHẦN MỀM AI (AI SERVICE)

**Vị trí:** `hardware/ai_service/`  
**Ngôn ngữ:** Python 3  
**Framework web:** FastAPI 0.111.0 + Uvicorn 0.29.0  

### 3.1 Nhận diện biển số xe

| Thành phần | Công nghệ | Phiên bản | Vai trò |
|------------|-----------|-----------|---------|
| Phát hiện vùng biển số | **YOLOv8** (Ultralytics) | ≥ 8.2.0 | Detect bounding box biển số trong ảnh |
| Đọc ký tự | **EasyOCR** | ≥ 1.7.1 | OCR nhận dạng chuỗi ký tự biển số |
| Model weights | `plate_detector.pt` | - | Model YOLO đã huấn luyện riêng cho biển số Việt Nam |

**Pipeline:** Camera → OpenCV frame → YOLO detect biển số → Crop vùng biển số → EasyOCR đọc ký tự → Chuỗi biển số

### 3.2 Nhận diện khuôn mặt

| Thành phần | Công nghệ | Phiên bản | Vai trò |
|------------|-----------|-----------|---------|
| Phát hiện khuôn mặt | **YOLOv8** (Ultralytics) | ≥ 8.2.0 | Detect bounding box khuôn mặt |
| Trích xuất đặc trưng | **InsightFace** (ArcFace – buffalo_sc) | ≥ 0.7.3 | Tạo vector nhúng (embedding) 512 chiều |
| Inference engine | **ONNX Runtime** | ≥ 1.18.0 | Chạy model ArcFace định dạng ONNX |
| Model weights | `face_detector.pt` | - | Model YOLO phát hiện khuôn mặt |

**Pipeline:** Camera → OpenCV frame → YOLO detect khuôn mặt → Crop khuôn mặt → InsightFace ArcFace tạo embedding 512D → So sánh cosine similarity với DB → Xác nhận danh tính

### 3.3 Thư viện xử lý ảnh

| Thư viện | Phiên bản | Vai trò |
|----------|-----------|---------|
| **OpenCV** (`opencv-python`) | 4.9.0.80 | Đọc camera, xử lý ảnh, resize, crop |
| **NumPy** | 1.26.4 | Xử lý mảng số, tính toán vector |
| **httpx** | 0.27.0 | Gọi API Backend từ AI Service (async HTTP) |
| **python-dotenv** | - | Đọc biến môi trường từ file `.env` |

### 3.4 Cấu hình AI Service

| Tham số | Giá trị mặc định | Mô tả |
|---------|-----------------|-------|
| AI_PORT | 5001 | Cổng FastAPI |
| PLATE_CONF_THRESHOLD | 0.5 | Ngưỡng confidence biển số |
| FACE_CONF_THRESHOLD | 0.6 | Ngưỡng confidence khuôn mặt |
| FACE_EMBED_DIM | 512 | Số chiều vector khuôn mặt |
| CAMERA_WIDTH/HEIGHT | 1280 × 720 | Độ phân giải camera |
| CAPTURE_MODE | LAZY | Chế độ chụp ảnh |

---

## 4. HARDWARE BRIDGE

**Vị trí:** `hardware/bridge/`  
**Ngôn ngữ:** Node.js  

| Thư viện | Phiên bản | Vai trò |
|----------|-----------|---------|
| **serialport** | ^12.0.0 | Giao tiếp serial USB với Arduino (fallback, không qua ESP8266) |
| **ws** (WebSocket) | ^8.17.0 | WebSocket Server nhận kết nối từ ESP8266 (port 4003) |
| **axios** | ^1.7.2 | Gọi HTTP API đến Backend |
| **dotenv** | ^16.4.5 | Đọc cấu hình từ `.env` |

**Chức năng Bridge:**
- Lắng nghe kết nối TCP từ ESP8266 trên port 4003
- Forward sự kiện cảm biến xe (`ENTRY/EXIT:SENSOR:DETECTED/CLEAR`) đến Backend
- Nhận lệnh điều khiển barrier từ Backend và gửi về ESP8266 (`ENTRY:OPEN`, `EXIT:CLOSE`)
- Giao tiếp với AI Service qua HTTP để trigger nhận diện ảnh

---

## 5. BACKEND API SERVER

**Vị trí:** `BuildWeb/backend/`  
**Ngôn ngữ:** Node.js  
**Framework:** Express 4.19.2  

### 5.1 Thư viện chính

| Thư viện | Phiên bản | Vai trò |
|----------|-----------|---------|
| **express** | ^4.19.2 | HTTP API server (REST) |
| **pg** (node-postgres) | ^8.12.0 | Kết nối và truy vấn PostgreSQL |
| **socket.io** | ^4.8.3 | Real-time event (cập nhật trạng thái cổng, slot, alert) |
| **jsonwebtoken** | ^9.0.2 | Xác thực JWT (tạo và verify token) |
| **bcryptjs** | ^2.4.3 | Băm và kiểm tra mật khẩu người dùng |
| **helmet** | ^7.1.0 | Bảo mật HTTP headers (OWASP hardening) |
| **express-rate-limit** | ^7.3.1 | Giới hạn tần suất request (chống brute force) |
| **cors** | ^2.8.5 | Cấu hình Cross-Origin Resource Sharing |
| **dotenv** | ^16.4.5 | Quản lý biến môi trường |

### 5.2 Chức năng API

- Quản lý phiên đỗ xe (`parking_sessions`, `guest_sessions`)
- Xác thực người dùng (JWT Bearer token)
- Quản lý phương tiện, thẻ tháng, tài khoản
- Quản lý thiết bị phần cứng (`devices`)
- Quản lý cảnh báo (`alerts`)
- Thống kê doanh thu, lượt vào/ra
- Phát sóng real-time qua Socket.IO

---

## 6. CƠ SỞ DỮ LIỆU

**Hệ quản trị:** PostgreSQL 17  
**File schema:** `BuildWeb/database/parking_system_latest.sql`

### 6.1 Extensions PostgreSQL

| Extension | Chức năng |
|-----------|-----------|
| **pgcrypto** | Hàm mã hóa (`crypt`, `gen_salt`) để hash mật khẩu phía DB |
| **uuid-ossp** | Tạo UUID (`uuid_generate_v4()`) làm khóa chính |

### 6.2 Sơ đồ bảng chính

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản người dùng (khách hàng, nhân viên, admin) |
| `vehicles` | Phương tiện đã đăng ký (biển số, loại xe) |
| `face_encodings` | Vector khuôn mặt 512 chiều (ArcFace embedding) |
| `monthly_passes` | Thẻ tháng / vé tháng |
| `parking_sessions` | Phiên đỗ xe của xe có thẻ tháng |
| `guest_sessions` | Phiên đỗ xe của khách vãng lai |
| `devices` | Danh sách thiết bị phần cứng (camera, barrier, sensor...) |
| `alerts` | Cảnh báo hệ thống (thiết bị lỗi, xe lạ...) |
| `parking_lots` | Thông tin điểm đỗ xe |
| `pricing_plans` | Bảng giá đỗ xe |

### 6.3 Loại thiết bị trong DB (`device_type`)

`camera_face` | `camera_plate` | `barrier` | `sensor` | `led` | `speaker` | `arduino` | `computer`

---

## 7. GIAO DIỆN QUẢN TRỊ (ADMIN WEB)

**Vị trí:** `BuildWeb/admin-web/`  
**Build tool:** Vite 5.4.8  

| Thư viện | Phiên bản | Vai trò |
|----------|-----------|---------|
| **React** | 18.3.1 | UI framework |
| **TailwindCSS** | 3.4.13 | Utility-first CSS (styling) |
| **Zustand** | 4.5.5 | Global state management |
| **react-router-dom** | 6.26.2 | Điều hướng SPA |
| **recharts** | 2.12.7 | Biểu đồ thống kê (doanh thu, lượt xe) |
| **socket.io-client** | 4.8.3 | Nhận cập nhật real-time từ Backend |
| **lucide-react** | - | Icon library |
| **clsx** | - | Utility ghép className điều kiện |
| **date-fns** | - | Xử lý và format ngày giờ |

**Chức năng chính:** Dashboard, quản lý xe & phiên, cấu hình giá, cảnh báo, thống kê, vận hành thiết bị.

---

## 8. GIAO DIỆN NGƯỜI DÙNG (USER WEBAPP)

**Vị trí:** `WebApp/`  
**Build tool:** Vite 5.4.8  

| Thư viện | Phiên bản | Vai trò |
|----------|-----------|---------|
| **React** | 18.3.1 | UI framework |
| **TailwindCSS** | 3.4 | Utility-first CSS (styling) |
| **Zustand** | 4.5.5 | Global state management |
| **react-router-dom** | 6.x | Điều hướng SPA |
| **lucide-react** | - | Icon library |

**Chức năng chính:** Tra cứu lịch sử đỗ xe, đăng ký thẻ tháng, đăng ký khuôn mặt.

---

## 9. GIAO THỨC GIAO TIẾP

| Giao thức | Giữa | Mục đích |
|-----------|------|---------|
| **I2C** | ESP8266 ↔ Arduino UNO | Điều khiển barrier, đọc cảm biến |
| **TCP Socket (WiFi)** | ESP8266 ↔ Bridge | Relay lệnh qua mạng LAN |
| **HTTP/REST** | Bridge/AI ↔ Backend | API calls, upload ảnh |
| **WebSocket (Socket.IO)** | Backend ↔ Admin/User Web | Cập nhật real-time |
| **Serial (USB)** | Máy tính ↔ Arduino | Fallback khi không dùng ESP8266 |
| **ONNX** | Python runtime | Chạy model InsightFace định dạng ONNX |

---

## 10. CÔNG CỤ PHÁT TRIỂN

| Công cụ | Vai trò |
|---------|---------|
| **Arduino IDE** | Lập trình firmware cho Arduino UNO và ESP8266 |
| **Node.js** | Runtime cho Backend, Bridge, Admin Web build |
| **Python 3 + venv** | Runtime cho AI Service |
| **PostgreSQL 17** | Database server |
| **Vite** | Bundler/dev server cho React apps |
| **PostCSS** | Xử lý CSS (dùng với TailwindCSS) |

---

## 11. TỔNG HỢP PHIÊN BẢN

| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| AI Service | Python | 3.x |
| AI Service | FastAPI | 0.111.0 |
| AI Service | Uvicorn | 0.29.0 |
| AI Service | OpenCV | 4.9.0.80 |
| AI Service | NumPy | 1.26.4 |
| AI Service | YOLOv8 (Ultralytics) | ≥ 8.2.0 |
| AI Service | EasyOCR | ≥ 1.7.1 |
| AI Service | InsightFace (ArcFace) | ≥ 0.7.3 |
| AI Service | ONNX Runtime | ≥ 1.18.0 |
| Backend | Node.js + Express | 4.19.2 |
| Backend | Socket.IO | 4.8.3 |
| Backend | jsonwebtoken | 9.0.2 |
| Backend | bcryptjs | 2.4.3 |
| Backend | pg (PostgreSQL driver) | 8.12.0 |
| Backend | helmet | 7.1.0 |
| Backend | express-rate-limit | 7.3.1 |
| Bridge | serialport | 12.0.0 |
| Bridge | ws | 8.17.0 |
| Admin Web | React | 18.3.1 |
| Admin Web | Vite | 5.4.8 |
| Admin Web | TailwindCSS | 3.4.13 |
| Admin Web | Zustand | 4.5.5 |
| Admin Web | recharts | 2.12.7 |
| Admin Web | socket.io-client | 4.8.3 |
| User WebApp | React | 18.3.1 |
| User WebApp | Vite | 5.4.8 |
| Database | PostgreSQL | 17 |
| Firmware | Arduino IDE / ESP8266 board | 1.0 |
