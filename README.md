# Locly Pixel Tea Café / Tiệm game trà sữa

Ứng dụng Express dùng Firebase Admin và Firestore. Trang chính `/` chuyển tới **Pixel Tea Café** ở `/tra-da`. Khi `PAYMENT_PAGE_ONLY=true` (mặc định), quán cùng `/xin-tien`, `/ai` và `/party` vẫn hoạt động; phần blog cũ còn trong mã nguồn nhưng tạm trả về 404. `/an-xin` và `/tra-tien` chuyển hướng sang `/xin-tien`.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Mở `http://localhost:3000/tra-da`. Không commit `.env`, thư mục `data/`, `uploads/` hoặc thông tin Firebase thật.

## Pixel Tea Café — `/tra-da`

Quán là sân trà 2D có tranh pixel gốc: sân gạch, cây và hoa, quầy trà mái ngói, bàn gỗ và đủ ghế có lưng tựa. Mặc định tiếng Anh, có nút Tiếng Việt. Khách dùng chung mã ví hiện tại để lưu biệt danh, tóc, quần áo và giày; vào quán miễn phí. Máy tính dùng WASD/phím mũi tên hoặc bấm điểm muốn đến; đường đi tự vòng vật cản. Điện thoại có camera theo nhân vật và cụm phím ảo. Khách tự đi tới ghế trống rồi bấm **Sit/Ngồi**. Tám bàn có sức chứa 2, 4 hoặc 8 người, tổng 34 ghế cho tối đa 32 khách. Bàn đều công cộng; bàn có người cho chọn hỏi trước, bỏ đi hoặc ngồi luôn. Hỏi trước không giữ ghế; server vẫn quyết định ai giành ghế trước bằng transaction. Chủ bàn chuyển cho người ngồi lâu nhất khi chủ rời đi.

Người cùng bàn có thể thách **đánh nhau pixel**. Hai bên đồng ý mới bắt đầu trận 12 giây; server giữ 12 máu mỗi người, giới hạn một cú mỗi 260ms và chống xử lý trùng. Hết giờ so máu; người đứng dậy hoặc mất kết nối quá 45 giây bỏ trận. Kèo chờ nhận có thể hủy, tự hết hạn sau 20 giây; trò vui không dùng tiền hoặc xu.

Người đang ngồi có thể gọi **trà đá 5.000đ** hoặc **đĩa bánh 10.000đ**. Mỗi đơn tạo một QR VietQR riêng với mã `DH`; webhook SePay hiện tại phân biệt đơn quán và lượt nạp xu. Thanh toán thiếu giữ đơn chờ, đủ tiền tạo đúng một món, còn tiền dư hoặc tiền gửi sau khi hủy được cộng vào ví theo quy tắc 1.000đ = 1 xu và giữ phần lẻ. Nhân viên pixel mang món tới bàn hiện tại; nếu khách đứng dậy thì món chờ đến khi khách ngồi lại. Mỗi món có ba lần bấm Uống/Ăn và chỉ chủ món sử dụng được.

Người cùng bàn có thể chơi **Color Cards / Bài đổi màu** miễn phí cho 2–4 người, thêm tối đa hai bot. Server giữ bài kín, kiểm tra lượt và luật đánh cùng màu/số/loại, lá bỏ lượt, `+2`, đổi màu, tự rút khi hết 30 giây và xáo lại chồng bài khi cần. Không có cược hoặc phần thưởng quy đổi tiền.

Lá hợp lệ có viền sáng; chạm lá đổi màu rồi chọn một trong bốn màu. Hàng bài và lựa chọn giữ nguyên khi cập nhật trạng thái. Đánh/rút khóa trong lúc gửi; lỗi kết nối có nút thử lại dùng đúng ID yêu cầu. Thao tác gửi `gameId`, `expectedVersion` và `requestId`; server chống tác động vào ván/lượt cũ và lưu ID gửi trùng riêng từng ví, không lưu tay bài trong document thao tác. Chủ bàn chia bài cho mọi người; bot mặc định tắt khi có từ hai người thật.

Chọn **Đánh bài** mặc định mở **Tiến lên miền Nam**; có nút chuyển sang Bài đổi màu. Tiến lên chơi miễn phí cho 2–4 người, chủ bàn có thể thêm tối đa ba bot. Mỗi người nhận 13 lá từ bộ 52 lá, chọn một hoặc nhiều lá rồi bấm **Đánh**, **Bỏ lượt**, **Bỏ chọn** hoặc **Gợi ý**. Bài người khác được giữ kín; server quyết định tính hợp lệ và kết quả. Không trừ xu hoặc cộng thưởng cho ván này.

Luật Tiến lên ở quán: 3 < 4 < … < A < 2; bích < chuồn < rô < cơ. Hỗ trợ rác, đôi, bộ ba, tứ quý, sảnh từ ba lá không có 2, ba và bốn đôi thông. Ba đôi thông chặt một heo; tứ quý chặt một/đôi heo hoặc ba đôi thông; bốn đôi thông chặt một/đôi heo, ba đôi thông, tứ quý và bốn đôi thông nhỏ hơn, kể cả ngoài lượt. Bộ cùng loại và cùng độ dài phải lớn hơn bộ trước. Bỏ lượt là bỏ cả vòng; khi mọi người còn lại bỏ, người đánh cuối mở vòng mới. Ván đầu mở bằng lá nhỏ nhất đã chia (3 bích nếu có); ván sau người thắng trước mở. Mỗi lượt 30 giây, hết giờ tự bỏ lượt hoặc đánh lá nhỏ nhất nếu đang mở vòng. Đây là ván nhanh: ai hết bài trước thắng, không áp dụng tới trắng, phạt thối hay cược. Luật tổ hợp/chặt tham khảo [hướng dẫn ZingPlay](https://play.zing.vn/detail-games/chi-tiet.tien-len-mien-nam.2.html); các khác biệt của quán được ghi ngay trong mục Luật chơi.

Lựa chọn lá Tiến lên giữ nguyên khi poll; thao tác gửi ID ván, phiên bản và ID yêu cầu. Lỗi mạng dùng lại đúng ID, không đánh hai lần. Bài đổi màu và Tiến lên không chạy đồng thời tại cùng bàn. Người rời bàn hoặc server khởi động lại hủy ván đang chơi, không ảnh hưởng món hay ví.

Mục **Trò chơi** có ba trò miễn phí, hỗ trợ tối đa 8 người tính cả tối đa 3 bot:

- **Đua xúc xắc:** server tung 1–6, ai đạt 20 trước thắng; mỗi lượt 15 giây.
- **Oẳn tù tì:** 5 vòng chọn bí mật, loại thắng trong vòng hai loại được 1 điểm; cùng loại hoặc đủ ba loại thì hòa. Không chọn kịp được tính bỏ lượt.
- **Lật cặp trí nhớ:** 12 ô, 6 cặp; đúng cặp được 1 điểm và thêm lượt, sai cặp hiện 1,8 giây rồi ẩn và qua lượt. Bot nhớ những ô đã được lật công khai.

Người ngồi đầu tiên bắt đầu ván; người vào sau xem ván hiện tại. Các thao tác có ID chống trùng, bài/ô/lựa chọn bí mật do server giữ. Người rời bàn khiến ván trò mới kết thúc; khởi động lại server hủy ván cũ. Món đã mua được lưu riêng.

Quán dùng Socket.IO để đồng bộ chuyển động, ghế, tin nhắn và trạng thái món. Phiên bản này chạy một tiến trình Node; không tăng số replica nếu chưa bổ sung Socket.IO adapter và kho trạng thái dùng chung. Trang quản trị `/tra-da/admin` dùng phiên đăng nhập hiện có để xem đơn, sửa giá cho đơn mới và gửi lại nhân viên khi cần.

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

Firebase chỉ cần kết nối được tới Firestore, không cần bật Firebase Storage hay nâng cấp gói để dùng ảnh chat. Có thể dùng ba biến `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, hoặc `FIREBASE_SERVICE_ACCOUNT_BASE64` như mô tả trong `.env.example`. Thiếu Firestore thì không tạo được ví hoặc hồ sơ. Thiếu cấu hình nhận tiền vẫn vào quán và trò chuyện được nhưng nút gọi món và tạo QR bị khóa. Giao dịch tiền không dùng cơ chế JSON dự phòng của blog.

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
- `tea_profiles`, `tea_rooms`, `tea_messages`, `tea_orders`, `tea_order_attempts`
- `tea_items`, `tea_consume_attempts`, `tea_settings`, `tea_card_games`, `tea_card_attempts`
- `tea_card_start_attempts` (chống chia bài trùng qua các lần chơi lại)
- `tea_tienlen_games`, `tea_tienlen_actions`, `tea_tienlen_starts` (Tiến lên miền Nam và ID thao tác chống trùng)
- `tea_social_games`, `tea_social_actions` (ba trò bàn mới)

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
- `/api/tea/profile`, `/api/tea/state`, `/api/tea/seats/*`, `/api/tea/chat`
- `/api/tea/orders`, `/api/tea/order`, `/api/tea/items/consume`
- `/api/tea/cards`, `/api/tea/cards/current`, `/api/tea/cards/action`
- `POST /api/tea/tienlen`, `GET /api/tea/tienlen/current`, `POST /api/tea/tienlen/action`
- `POST /api/tea/seats/:seatId/ask`, `GET /api/tea/seat-requests`, `POST /api/tea/seat-requests/:id/respond`
- `/api/tea/fights`, `/api/tea/fights/current`, `/api/tea/fights/:id/respond`, `/api/tea/fights/:id/hit`
- `POST /api/tea/games`, `GET /api/tea/games/:key`, `POST /api/tea/games/:key/action` (`dice`, `rps`, `memory`)

Lịch sử ví chỉ trả về khi có đúng token ví. API trạng thái đổi quà không trả thông tin liên hệ; thông tin này chỉ hiện trong phiên quản trị.

## Kiểm thử

```powershell
npm test
node tests/preview.js
```

`npm test` dùng Firestore test double. Ngoài hồi quy game và SePay, bộ kiểm thử kiểm tra giới hạn ba phiên chat, chống trừ xu trùng, quyền đọc tin/ảnh, nén WebP, khóa gửi khi hết giờ, hoàn 10 xu đúng một lần, xóa dữ liệu sau 7 ngày, quyền phòng Party, phân công Vẽ chuyền tay, chống gửi trùng và quyền xem ảnh theo lượt.

Preview ở `http://127.0.0.1:3101/tra-da`, `/xin-tien`, `/ai` và `/party` dùng RAM với tài khoản `0000000000`; tuyệt đối không chuyển tiền thật vào QR preview. Mật khẩu quản trị local là `local-admin`. Sau khi tạo QR trên preview, có thể gửi webhook giả:

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
