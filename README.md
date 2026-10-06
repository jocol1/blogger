# Blogger Vault

Blog cá nhân để viết hướng dẫn Markdown, tải file và tạo note riêng có mật khẩu.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
```

Mở `.env`, đặt `ADMIN_PASSWORD` và `SESSION_SECRET`. Sau đó:

```powershell
npm start
```

Mở http://localhost:3000. Không commit `.env`, thư mục `data/` hoặc `uploads/` lên GitHub.

Note riêng được mã hóa bằng mật khẩu của note; hệ thống chỉ lưu hash mật khẩu và ciphertext. Nếu quên mật khẩu, không thể mở note. Khi có đủ biến Firebase, bài viết và note sẽ lưu trong Firestore; nếu chưa cấu hình, app dùng file JSON local làm dự phòng. Không commit thông tin Firebase thật vào GitHub.

## Góc xin lộc — `/an-xin`

Trang nhận ủng hộ tự nguyện, nhân vật SVG có hoạt ảnh cúi chào và xu rơi khi SePay xác nhận tiền vào. Tên tự nhập (tối đa 60 ký tự, mặc định ẩn danh) và số tiền thực nhận được hiển thị cho mọi người đang xem. Giọng đọc mặc định tắt; trình duyệt cần có giọng tiếng Việt để đọc lời chúc.

### Cấu hình nhận tiền

Giữ cấu hình Firebase Admin hiện có và thêm các biến sau vào môi trường server:

```dotenv
DONATION_BANK_CODE=MB
DONATION_BANK_ACCOUNT=6999912092003
DONATION_BANK_ACCOUNT_NAME="LY TAN LOC"
SEPAY_WEBHOOK_API_KEY=<khoa-ngau-nhien-rieng>
```

Sinh khóa bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, rồi lưu vào biến môi trường server và cấu hình webhook SePay. Không commit khóa hoặc gửi khóa tới client. Firebase phải là dự án có Firestore hoạt động; service account cần quyền đọc/ghi Firestore. Chỉ chọn **một** cách cấu hình Firebase trong `.env.example`; xóa các giá trị mẫu không sử dụng.

Thiếu Firestore hoặc bất kỳ biến nhận tiền nào, trang hiển thị chưa sẵn sàng và không tạo QR. Nếu Firestore gặp lỗi, API trả 503, không chuyển sang lưu JSON cục bộ. QR do VietQR cung cấp; nếu ảnh không tải được, trang vẫn hiện thông tin chuyển khoản để sao chép.

### Thiết lập SePay

1. Kết nối tài khoản MB nhận tiền trên SePay. Triển khai ứng dụng Node với HTTPS công khai.
2. Tạo webhook, chọn sự kiện **Có tiền vào**, đúng tài khoản nhận tiền và URL `https://<domain>/api/webhooks/sepay`.
3. Chọn xác thực **API Key**, dùng cùng giá trị `SEPAY_WEBHOOK_API_KEY`; header gửi tới server phải là `Authorization: Apikey <key>`.
4. Nếu đặt bộ lọc mã thanh toán, dùng tiền tố `DH` với 7 chữ số. Server cũng tìm mã trong `content` nếu `code` trống. Nội dung chuyển khoản chỉ cần giữ nguyên mã, ví dụ `DH0123456`.
5. Mở `/an-xin`, tạo QR và kiểm tra ngân hàng, tài khoản, số tiền, mã trước khi bật sử dụng thật.

Endpoint trả HTTP 200 và `{"success":true}` sau khi Firestore commit. Webhook trùng được trả thành công nhưng không cộng tiền lần nữa. Giao dịch tiền ra, sai tài khoản, sai số tiền hoặc mã không khớp chỉ được lưu audit, không phát cảm ơn; kết quả nằm trong trường `result`. Lỗi xác thực trả 401; JSON/ID không hợp lệ trả 400; lỗi lưu hoặc thiếu cấu hình trả 503 để SePay có thể thử lại. Không xóa audit để tránh mất khả năng chống trùng.

Tham khảo: [Webhook SePay](https://docs.sepay.vn/tich-hop-webhooks.html), [SePay Test Mode](https://docs.sepay.vn/test-mode.html).

### Lưu trữ và quyền truy cập

Các collection riêng: `donation_requests`, `donation_tokens`, `donation_sepay_events`, `donation_public_events`, `donation_meta`. Chúng không được đưa vào cơ chế đồng bộ bài viết/notes của blog. Mã QR không hết hạn tự động; mỗi giao dịch SePay khác ID là một lượt ủng hộ, kể cả dùng lại cùng mã. Số tiền được tính theo số thực nhận, không theo số tiền đề xuất trên QR.

Firebase Admin ở server là bên duy nhất được đọc/ghi các collection này. Firestore Security Rules phải **không cấp quyền trực tiếp** cho client, kể cả collection sự kiện công khai; client đọc qua API lọc trường. Kiểm tra dự án không có quy tắc rộng như `allow read, write: if true` hoặc cấp mọi collection cho mọi tài khoản đăng nhập. Thêm rule `false` riêng không ghi đè một rule rộng đang cho phép.

Token tra cứu là chuỗi ngẫu nhiên 256 bit, server chỉ lưu SHA-256. Trình duyệt giữ token của lượt hiện tại trong sessionStorage để phục hồi sau tải lại. Feed công khai chỉ có ID sự kiện, tên hiển thị, số tiền, thời gian và lời chúc; không có payload ngân hàng hoặc token.

Client poll mỗi 3 giây; người mới mở trang nhận mốc hiện tại, mất mạng thì tiếp tục từ mốc cuối. Sự kiện có số thứ tự tăng trong cùng transaction với ghi nhận tiền nên không mất lượt khi các webhook đến đồng thời. Mỗi hiệu ứng chạy 7 giây, không phát lại khi poll trùng.

Giới hạn tạo QR: 10 lượt/IP/10 phút trên mỗi tiến trình. Bản hiện tại phù hợp một instance Node sau một reverse proxy đáng tin cậy (app đang dùng `trust proxy = 1`). Khi chạy nhiều instance, cần giới hạn chung tại reverse proxy/API gateway; tránh để client kết nối trực tiếp và giả mạo `X-Forwarded-For`. Các transaction Firestore vẫn chống ghi trùng giữa nhiều instance.

### Kiểm thử

```powershell
npm test
node tests/preview.js
```

`npm test` kiểm tra service và API HTTP, dùng Firestore test double có kiểm tra xung đột và rollback; không gọi Firestore thật. Preview ở `http://127.0.0.1:3101/an-xin` chỉ dùng dữ liệu trong RAM, tài khoản giả `0000000000` và có nhãn **KHÔNG CHUYỂN TIỀN**. Không triển khai preview lên hosting. Ví dụ gửi webhook giả vào preview sau khi tạo QR:

```powershell
$testPayload = @{
  id = 10001
  accountNumber = '0000000000'
  code = '<ma-DH-vua-tao-tren-preview>'
  content = '<ma-DH-vua-tao-tren-preview>'
  transferType = 'in'
  transferAmount = 20000
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3101/api/webhooks/sepay' -Headers @{ Authorization = 'Apikey local-preview-only' } -ContentType 'application/json' -Body $testPayload
```

Mở hai cửa sổ trước khi gửi webhook: cả hai phải hiện lời cảm ơn, còn cửa sổ tạo QR đổi sang đã nhận tiền. Gửi lại cùng ID phải không phát lại; gửi ID mới phải tạo lượt mới. Có thể mô phỏng đứt kết nối bằng POST `/__test/offline` với JSON `{"offline":true}`, gửi webhook trong lúc đứt, rồi POST `{"offline":false}` để kiểm tra bắt kịp sự kiện. Route thử nghiệm này chỉ có trong preview.

Trước khi dùng thật, triển khai **môi trường thử riêng với dự án Firestore và khóa webhook riêng**, bật SePay Test Mode, đặt tài khoản thử vào biến môi trường và cho SePay gửi giao dịch giả tới HTTPS đó. Không trộn Test Mode với database nhận tiền thật vì cùng webhook payload không cung cấp cơ chế phân biệt test/live cho ứng dụng. Xác minh commit Firestore, webhook retry, hai người xem và giọng đọc trên thiết bị đích. Sau đó cấu hình môi trường thật theo tài khoản đã chốt; các bài test cục bộ không thay thế bước xác minh SePay/Firestore này.
