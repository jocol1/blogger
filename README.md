# Blogger Vault / Tiệm game trà sữa

Ứng dụng Express dùng Firebase Admin và Firestore. Khi `PAYMENT_PAGE_ONLY=true` (mặc định), ba trang công khai là `/xin-tien`, `/ai` và `/party`; phần blog cũ vẫn còn trong mã nguồn nhưng tạm trả về 404. `/an-xin` và `/tra-tien` chuyển hướng sang `/xin-tien`.

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

## Locly AI — `/ai`

Trang AI dùng chung ví xu. Khách bấm bắt đầu để trả 10 xu và mở một phiên 60 phút chạy liên tục. Locly AI do người quản trị trực tiếp vận hành và soạn câu trả lời, không gọi API AI. Hệ thống nhận tối đa ba phiên còn hạn cùng lúc; khách thứ tư không bị trừ xu. Nếu hết giờ mà quản trị chưa gửi phản hồi nào, 10 xu được hoàn nguyên tử đúng một lần.

Khách và quản trị gửi được văn bản cùng tối đa ba ảnh JPEG, PNG hoặc WebP, mỗi ảnh tải lên tối đa 5 MB. Server giải mã, xoay, thu nhỏ và nén mỗi ảnh thành WebP dưới 700 KB trước khi lưu trong document Firestore riêng tư. Ảnh chỉ đọc qua API đã xác thực, không có URL công khai. Tin nhắn và ảnh hết quyền truy cập, sau đó được xóa sau 7 ngày kể từ lúc phiên kết thúc.

Trang quản trị AI ở `/ai/admin`, dùng chung `ADMIN_PASSWORD` và phiên đăng nhập hiện có. Âm báo tin mới mặc định tắt. Ảnh trong cuộc trò chuyện có thể bấm để xem lớn ở cả trang khách và trang quản trị.

## Locly Party — `/party`

Locly Party là phòng chơi chung cho 3–10 người. Chủ phòng tạo mã sáu ký tự hoặc sao chép link mời; khách chỉ cần nhập biệt danh, không cần tài khoản và không tốn xu. Bốn trò có sẵn là **Tòa án bạn thân**, **Ai viết câu này?**, **Kẻ nằm vùng** và **Vẽ chuyền tay**. Câu hỏi, vai trò bí mật, phân công, thời hạn và kết quả đều do server quản lý; trình duyệt chỉ gửi lựa chọn, câu trả lời hoặc bài vẽ.

Chủ phòng có thể thêm bot khi thiếu người. Bot luôn sẵn sàng, chiếm một chỗ trong giới hạn 10 người và chơi bằng bộ máy phía server ở cả bốn trò; bot không có token, không thể nhận quyền chủ phòng và có thể bị xóa ở phòng chờ. Một người thật thêm hai bot là đủ bắt đầu trận, không phát sinh phí ngoài lượt chơi hoặc gói Party hiện có.

Trong **Vẽ chuyền tay**, mỗi người mở một chuỗi bằng câu tối đa 120 ký tự. Cả phòng lần lượt vẽ và đoán trên các chuỗi khác nhau; mỗi người chỉ thấy bài ngay trước mình. Canvas dùng hệ tọa độ 800 × 600, hỗ trợ chuột và cảm ứng, tám màu, ba cỡ bút, tẩy, hoàn tác và lưu bản nháp trên thiết bị. Khi trận kết thúc, thành viên được mở toàn bộ chuỗi, xem lớn từng hình và tải chuỗi thành PNG. Ảnh PNG/WebP tải lên tối đa 1 MB, được server giải mã và mã hóa lại thành WebP tối đa 128 KB; bài và ảnh tự hết quyền truy cập sau 7 ngày.

Mỗi ví có một trận miễn phí. Sau đó chủ ví trả **19 xu** để mở phòng trong hai giờ; đồng hồ chỉ bắt đầu khi trận trả phí đầu tiên chạy. Gói đã mua nhưng chưa bắt đầu sẽ tự hoàn 19 xu sau 24 giờ, đúng một lần. Chủ phòng có thể khóa phòng, mời người chơi ra, trao quyền điều khiển và đóng phòng. Âm báo chuyển lượt mặc định tắt; mỗi người tự bật trên thiết bị của mình.

Trang quản trị Party ở `/party/admin`, dùng chung phiên quản trị. Quản trị có thể xem phòng, đóng phòng có lý do và hoàn phí nguyên tử khi cần.

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

Firebase chỉ cần kết nối được tới Firestore, không cần bật Firebase Storage hay nâng cấp gói để dùng ảnh chat. Có thể dùng ba biến `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, hoặc `FIREBASE_SERVICE_ACCOUNT_BASE64` như mô tả trong `.env.example`. Server chỉ cho mua giờ chat khi Firestore hoạt động. Thiếu Firestore hoặc cấu hình nhận tiền, trang báo chưa sẵn sàng và không tạo ví/QR. Giao dịch tiền không dùng cơ chế JSON dự phòng của blog.

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
- `chat_sessions`, `chat_messages`, `chat_images`, `chat_meta`
- `party_rooms`, `party_tokens`, `party_actions`, `party_purchases`, `party_drawing_contributions`

Firebase Admin ở server là bên duy nhất đọc/ghi các collection. Firestore Security Rules không được cấp quyền trực tiếp cho trình duyệt. Token ví và token tra cứu QR chỉ được lưu dưới dạng SHA-256.

Các API chính:

- `POST /api/game/wallets`, `GET /api/game/wallet`
- `GET /api/game/current`
- `POST /api/game/sessions`, `POST /api/game/sessions/:id/action`
- `POST /api/game/redemptions`, `GET /api/game/redemption`
- `POST /api/donations`, `GET /api/donations/status`
- `POST /api/webhooks/sepay`
- `GET/POST /api/chat/sessions`, `GET/POST /api/chat/sessions/:id/messages`
- `GET /api/chat/sessions/:id/images/:messageId/:index`
- `/api/chat/admin/*` cho phiên quản trị
- `POST /api/party/rooms`, `POST /api/party/rooms/:code/join`
- `GET /api/party/rooms/:code`, `POST /api/party/rooms/:code/actions`
- `POST /api/party/rooms/:code/purchase`
- `POST /api/party/rooms/:code/drawings`, `GET /api/party/rooms/:code/drawings/:imageId`

Lịch sử ví chỉ trả về khi có đúng token ví. API trạng thái đổi quà không trả thông tin liên hệ; thông tin này chỉ hiện trong phiên quản trị.

## Kiểm thử

```powershell
npm test
node tests/preview.js
```

`npm test` dùng Firestore test double. Ngoài hồi quy game và SePay, bộ kiểm thử kiểm tra giới hạn ba phiên chat, chống trừ xu trùng, quyền đọc tin/ảnh, nén WebP, khóa gửi khi hết giờ, hoàn 10 xu đúng một lần, xóa dữ liệu sau 7 ngày, quyền phòng Party, phân công Vẽ chuyền tay, chống gửi trùng và quyền xem ảnh theo lượt.

Preview ở `http://127.0.0.1:3101/xin-tien`, `/ai` và `/party` dùng RAM, tài khoản `0000000000` và có nhãn **KHÔNG CHUYỂN TIỀN**. Mật khẩu quản trị local là `local-admin`. Sau khi tạo QR trên preview, có thể gửi webhook giả:

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

Trước khi dùng tiền thật, nên xác minh toàn bộ luồng trên một dự án Firebase thử và SePay Test Mode riêng: tạo ví → nhận webhook → mua giờ chat → gửi ảnh → quản trị trả lời → hết giờ/hoàn xu. Sau đó xác minh tiếp game và đổi quà trước khi dùng dữ liệu thật.
