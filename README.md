# Blogger Vault / Tiệm game trà sữa

Ứng dụng Express dùng Firebase Admin và Firestore. Khi `PAYMENT_PAGE_ONLY=true` (mặc định), trang công khai là `/xin-tien`; phần blog cũ vẫn còn trong mã nguồn nhưng tạm trả về 404. `/an-xin` và `/tra-tien` chuyển hướng sang `/xin-tien`.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Mở `http://localhost:3000/xin-tien`. Không commit `.env`, thư mục `data/`, `uploads/` hoặc thông tin Firebase thật.

## Luật chơi

- Mỗi 1.000đ thực nhận cộng 1 xu. Phần lẻ dưới 1.000đ được giữ trong ví và cộng dồn với lần nạp sau.
- Mỗi ván trừ 1 xu. Thắng nhận tổng 2, 3 hoặc 5 xu theo mức Thường, Khó và Siêu khó.
- Có năm trò: Bắn xu vào bát, Dừng kim, Bắt tim, Nhớ chuỗi và Chạm đúng thứ tự.
- Kết quả và số dư do server xử lý. Trình duyệt chỉ gửi thao tác chơi.
- Đủ 100 xu có thể gửi yêu cầu đổi một ly trà sữa. Người quản trị duyệt, đánh dấu đã tặng hoặc từ chối kèm lý do; từ chối hoàn đúng 100 xu.

Trình duyệt giữ một mã ví ngẫu nhiên trong `localStorage`. Các tab cùng trình duyệt dùng chung ví. Người chơi nên bấm **Sao lưu mã ví** vì xóa dữ liệu trình duyệt khi chưa sao lưu sẽ làm mất quyền truy cập. Mã ví được gửi bằng header `X-Wallet-Token`, không nằm trong URL.

Chỉ các QR được tạo từ phiên bản ví mới mới cộng xu. Các mã cũ không có `walletId` được lưu audit khi webhook đến nhưng không cộng vào ví.

## Cấu hình

Giữ cấu hình Firebase Admin hiện có và đặt các biến sau trên server:

```dotenv
ADMIN_PASSWORD=<mat-khau-quan-tri>
SESSION_SECRET=<chuoi-ngau-nhien-dai>
DONATION_BANK_CODE=MB
DONATION_BANK_ACCOUNT=6999912092003
DONATION_BANK_ACCOUNT_NAME="LY TAN LOC"
SEPAY_WEBHOOK_API_KEY=<khoa-webhook-rieng>
PAYMENT_PAGE_ONLY=true
```

Sinh khóa ngẫu nhiên bằng:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Firebase phải kết nối được tới Firestore. Có thể dùng ba biến `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, hoặc `FIREBASE_SERVICE_ACCOUNT_BASE64` như mô tả trong `.env.example`. Thiếu Firestore hoặc cấu hình nhận tiền, trang báo chưa sẵn sàng và không tạo ví/QR. Giao dịch tiền không dùng cơ chế JSON dự phòng của blog.

Trang quản trị ở `/xin-tien/admin`, dùng `ADMIN_PASSWORD`. Phiên đăng nhập nằm ở server, cookie `httpOnly`, thao tác thay đổi trạng thái có CSRF token và đăng nhập bị giới hạn số lần thử. Trang này hiển thị thông tin liên hệ cùng lịch sử xu gần đây của ví.

## Thiết lập webhook SePay

1. Kết nối tài khoản MB nhận tiền trên SePay và triển khai ứng dụng bằng HTTPS.
2. Tạo webhook tới `https://<domain>/api/webhooks/sepay`.
3. Chọn giao dịch **Tiền vào** và định dạng **JSON**.
4. Chọn xác thực **API Key**, nhập đúng `SEPAY_WEBHOOK_API_KEY`. SePay sẽ gửi `Authorization: Apikey <key>`.
5. Nếu dùng bộ lọc nội dung, cho phép mã `DH` theo sau bởi 7 chữ số, ví dụ `DH0123456`.
6. Bật tự động gửi lại khi server trả lỗi để SePay thử lại nếu Firestore tạm gián đoạn.

Server kiểm tra khóa bằng phép so sánh an toàn, đúng tài khoản nhận, giao dịch tiền vào, số tiền hợp lệ và mã trong `code` hoặc `content`. Số xu dùng số tiền thực nhận. Cùng một mã có thể nhận nhiều giao dịch có ID khác nhau; cùng ID SePay chỉ được ghi nhận một lần. Webhook chỉ trả `{"success":true}` sau khi transaction Firestore hoàn tất.

Tham khảo [Webhook SePay](https://docs.sepay.vn/tich-hop-webhooks.html) và [SePay Test Mode](https://docs.sepay.vn/test-mode.html).

## Dữ liệu và API

Các collection riêng của tính năng này:

- `game_wallets`, `game_wallet_tokens`
- `game_sessions`
- `game_redemptions`, `game_meta`
- `donation_requests`, `donation_tokens`, `donation_idempotency`, `donation_sepay_events`

Firebase Admin ở server là bên duy nhất đọc/ghi các collection. Firestore Security Rules không được cấp quyền trực tiếp cho trình duyệt. Token ví và token tra cứu QR chỉ được lưu dưới dạng SHA-256.

Các API chính:

- `POST /api/game/wallets`, `GET /api/game/wallet`
- `GET /api/game/current`
- `POST /api/game/sessions`, `POST /api/game/sessions/:id/action`
- `POST /api/game/redemptions`, `GET /api/game/redemption`
- `POST /api/donations`, `GET /api/donations/status`
- `POST /api/webhooks/sepay`

Lịch sử ví chỉ trả về khi có đúng token ví. API trạng thái đổi quà không trả thông tin liên hệ; thông tin này chỉ hiện trong phiên quản trị.

## Kiểm thử

```powershell
npm test
node tests/preview.js
```

`npm test` dùng Firestore test double và kiểm tra 15 tổ hợp trò chơi–độ khó ở cả kết quả thắng và thua, chống webhook trùng/đồng thời, tiền lẻ, quyền ví, kết quả giả từ client, đổi quà, hoàn xu và rollback lỗi lưu dữ liệu.

Preview ở `http://127.0.0.1:3101/xin-tien` dùng RAM, tài khoản giả `0000000000` và có nhãn **KHÔNG CHUYỂN TIỀN**. Sau khi tạo QR trên preview, có thể gửi webhook giả:

```powershell
$testPayload = @{
  id = 10001
  accountNumber = '0000000000'
  code = '<ma-DH-tren-preview>'
  content = '<ma-DH-tren-preview>'
  transferType = 'in'
  transferAmount = 100000
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:3101/api/webhooks/sepay' `
  -Headers @{ Authorization = 'Apikey local-preview-only' } `
  -ContentType 'application/json' `
  -Body $testPayload
```

Trước khi dùng tiền thật, nên xác minh toàn bộ luồng trên một dự án Firestore thử và SePay Test Mode riêng: tạo ví → tạo QR → nhận webhook → chơi → đổi quà → duyệt/từ chối ở trang quản trị.
