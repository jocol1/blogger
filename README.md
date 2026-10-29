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

Menu quán mặc định đóng trên máy tính và điện thoại, kể cả khi tải lại. Đi tới ghế và bấm **Ngồi**, sau đó bấm **Mở bàn / E** để gọi món, chat hoặc chọn trò chơi. Nút Ngồi/Đứng dùng chung vị trí ở góc phải vùng quán. Đến gần mặt trước quầy có **Xem thực đơn / E**; chỉ xem giá, muốn đặt món vẫn cần ngồi. Đóng bảng bằng × hoặc Escape; rời quầy/đứng dậy cũng đóng bảng. Menu mở cạnh vùng quán, không phủ lên nhân vật; ô chat và nút gửi giữ trong khung, thách đấu nằm trong mục gấp mở. **Về quán** từ trò chơi đóng bảng và trả lại bản đồ; có thể mở bàn để xem lại ván đang chạy, đồng hồ server vẫn tiếp tục.

PWA cache v38 cập nhật thao tác làm vườn trực tiếp; người đang mở bản cũ dùng nút cập nhật khi chơi xong, không cần cài APK mới. Chạy `tests/browser/tea-cafe-context.js` trên một phiên `node tests/preview.js` mới để kiểm tra menu, gần quầy, ghế, chat, QR giả, trò chơi và sao lưu. `tea-cards-mobile.js`, `tea-brawl-controls.js` và `tea-pwa-landscape.js` kiểm tra hồi quy bố cục/điều khiển. Các kích thước điện thoại là mô phỏng trình duyệt, chưa xác nhận trên thiết bị thật.

### Di chuyển chung cho quán và nông trại

- Điện thoại dùng joystick bên trái hoặc chạm điểm đến để tìm đường. Máy tính dùng WASD/phím mũi tên và bấm điểm đến. Joystick có vùng chết, tám hướng và pointer capture; thả ngón điều khiển dừng ngay. Điều khiển trực tiếp hủy đường tự đi. Chạm bàn/luống/chuồng chỉ đi tới; mở bảng bằng nút tương tác.
- Mặc định chạy 225 đơn vị/giây; nút **Đi bộ / Walk** giảm còn 145, Shift tạm đi bộ. Đi chéo chuẩn hóa tốc độ. Hai map dùng chung bước va chạm nhỏ, trượt dọc tường và sprite đi bộ bốn hướng. Ghế, ăn/uống và đánh nhau giữ tư thế riêng.
- Camera bám nhân vật, chặn biên, căn giữa map nhỏ; 75% / 100% / 125% (mặc định 100%), lưu chung thiết bị ở `locly-world-zoom`. Mở bảng hủy bước đi hiện tại; phím mới vẫn cho rời trạm chăm sóc. Hộp thoại, trò chơi, chuyển ứng dụng và xoay dọc xóa phím giữ. Giảm chuyển động tắt nhún người và độ trễ camera.
- Quán dùng dự đoán tại client và phản hồi server qua `tea:move` v2: `{v:2, seq, samples:[{dx,dy,mode,ms,distance?}]}`, tối đa 20 gói/giây. Server xác nhận `ack, serverNow, x, y, facing, walking, vx, vy`, giới hạn theo thời gian thực và kiểm tra socket đang điều khiển. Mẫu tối đa 50 ms, tổng mỗi gói tối đa 150 ms, ngân sách server tích lũy tối đa 150 ms. Client phát lại phần chưa xác nhận, sửa nhẹ sai lệch nhỏ, dịch về server khi lệch lớn; không ghi Firestore từng bước.
- Người khác nội suy trễ 75 ms, ngoại suy tối đa 150 ms rồi dừng. Mất kết nối xóa input; kết nối lại lấy vị trí server. Tab v1 vẫn dùng nhánh cũ; một kết nối đã dùng v2 không được trộn v1 để tăng tốc. Ví, QR, SePay và API chăm sóc giữ nguyên.
- Kiểm tra: `npm test`, `tests/browser/tea-shared-movement.js`, `tea-movement-network.js`, `tea-cafe-context.js`, `tea-farm-context.js` trên preview cục bộ. Đã mô phỏng 30/60/120 FPS, hai trình duyệt với RTT 100–300 ms, đa chạm, ngắt/kết nối lại, tab thay thế và kích thước 568×320 / 844×390 / tablet / desktop. Đây là mô phỏng Chromium, chưa thử Android/iPhone thật. APK dùng nội dung web nên không cần đóng gói lại; cập nhật PWA khi chơi xong.

### Map 2 — nông trại riêng `/tra-da/farm`

Thanh dụng cụ nhớ lựa chọn dụng cụ và giống trên thiết bị; tới gần cây/con vật sẽ hiện trạng thái và thời gian lớn ngay trên thanh, không tự mở menu. Thu hoạch hiện tên và số lượng vừa thêm vào giỏ theo phản hồi server. Khi mở bảng chăm sóc, nhân vật dừng và không nhận phím/joystick cho tới khi đóng.

**Làm vườn trực tiếp:** thanh năm dụng cụ ở dưới gồm hạt giống (1), bình tưới (2), thức ăn (3), giỏ (4) và bàn tay (5). Chạm mục tiêu để đi tới, rồi bấm nút hành động hoặc **E** để dùng dụng cụ ngay trên map. Gieo thành công tự cầm bình tưới; chọn lại túi hạt để đổi giống. Bình tưới, thức ăn và giỏ dùng cho đúng trạng thái của cây/con vật; nút gợi ý dụng cụ cần dùng khi chọn sai. **Chi tiết / Shift E** mới mở bảng cũ để xem, mua giống hoặc nâng cấp. Mua vật nuôi vẫn cần bấm xác nhận lựa chọn, không tự trừ vàng khi đi tới chuồng.

Cây hiện năm giai đoạn: hạt, mầm, lá, nụ và trưởng thành; đất tưới đổi màu, bình tưới nằm trên tay nhân vật, thu hoạch hiện sản phẩm. Gà/heo đi lại và nghỉ trong phần chuồng riêng, có kích thước nhỏ/lớn và trứng hiện cạnh gà khi sẵn sàng. Dùng bàn tay để vuốt ve; trái tim là phản hồi hình ảnh, không trừ vàng hoặc tự tạo phần thưởng. Thời gian lớn, giá bán, cây/con vật đang có và quy tắc thu hoạch được giữ nguyên. Thử vòng chơi trực tiếp bằng `tests/browser/tea-farm-hands.js`; `tea-farm-context.js` kiểm tra các bảng chi tiết, chăm sóc cũ và gửi lại thao tác an toàn.

Nút **Map 2 · My farm / Nông trại** ở quán mở nông trại của chính mã ví hiện tại. Map 1 vẫn là quán chung để gặp nhau, chat và chơi cùng bàn. Sang nông trại sẽ trả ghế và rời ván đang tham gia; món đã mua và ví xu vẫn giữ nguyên. Nút **Về quán** luôn ở đầu màn hình nông trại. Cần tạo nhân vật ở quán trước lần đầu vào map 2.

- Khởi đầu có 120 vàng nông trại, 6 hạt củ cải, 2 cá bảy màu, 6 luống, 2 ô cá, 2 chỗ nuôi gà và 2 chỗ nuôi heo. **Vàng chỉ dùng trong nông trại**, không mua bằng tiền, không quy đổi thành xu hoặc tiền thật.
- Củ cải / cà rốt / cà chua / bắp lớn trong 1 / 3 / 10 / 30 phút. Cá bảy màu / cá chép / cá koi lớn trong 2 / 10 / 30 phút. Gieo hoặc thả giống rồi **tưới / cho ăn một lần** để bắt đầu tính giờ; nước và thức ăn miễn phí. Server giữ mốc lớn, nên đóng trang hoặc khởi động lại server vẫn tiếp tục. Cây/cá không tự héo hoặc chết.
- Thu hoạch vào giỏ, bán lấy vàng, mua giống mới. Mở rộng tối đa 24 luống và 12 ô cá; chi phí hiện trước khi mua. Bồn hoa, đèn vườn, ghế gỗ mua một lần rồi đặt/chuyển giữa 4 góc. Sáu nhiệm vụ có thưởng một lần.
- Map 2000×1400, diện tích gấp 4 bản đầu: vườn nhà, ruộng phía đông, hai ao câu cá, vườn cây nghỉ chân và chợ. Đến gần quầy, thùng hàng, bảng tin hoặc nhà rồi bấm **Tương tác** (phím **E**) để mở cửa hàng, giỏ, nhiệm vụ hoặc trang trí. **Bản đồ** hiện vị trí/camera và 7 điểm đi nhanh miễn phí, gồm khu chuồng gà/heo; mặc định chạy 225 đơn vị/giây, nút **Đi bộ** hoặc giữ Shift giảm xuống 145. Giữ tỉ lệ nhân vật khi khám phá, không thu nhỏ toàn bộ map. Các ô mới mở bằng nâng cấp vàng nông trại; không thay thế cây/cá cũ, không cần migration.
- Mở **Tiện ích khác** trong bảng chăm sóc để nâng cấp; khi có từ hai ô phù hợp, có thể tưới/cho ăn/thu hoạch/bắt cá hàng loạt. Mỗi thao tác gửi danh sách ô và `cycleId` hiện tại, server xác minh và ghi nguyên tử cùng biên nhận; một ô thay đổi thì từ chối cả lượt để tải lại. **Bán cả giỏ** xác nhận tổng giá trước, chỉ bán đúng danh sách số lượng đã gửi với giá từ server. Các tiện ích giữ cơ chế Thử lại bằng cùng mã yêu cầu, không tự gửi khi offline.
- Dùng chung nút sao lưu/khôi phục mã ví. Mỗi ví chỉ đọc/ghi nông trại của mình. Các tab tự đồng bộ mỗi 10 giây; thao tác mất phản hồi giữ mã yêu cầu qua tải lại, chỉ gửi lại khi người chơi bấm **Thử lại**. Không tự tạo ví khác khi lỗi mạng.
- Giao diện Việt/Anh; chạm đất/luống/ao/chuồng hoặc dùng WASD/phím mũi tên để đi. Menu mặc định đóng, không còn thanh mục luôn hiện ở dưới. Đến gần mục tiêu rồi bấm **E** để dùng dụng cụ; **Chi tiết / Shift E** mở bảng cho đúng ô đó, đi ra xa hoặc bấm × để đóng. Chạm mục tiêu chỉ đi tới, không tự bật menu khi đến nơi. Điện thoại chơi ngang; bảng thao tác nằm cạnh bản đồ. Chế độ dọc vẫn mở được mã ví. Nông trại cần mạng để thao tác; cây/cá vẫn lớn khi offline.
- Gieo hạt, tưới nước, thả cá, cho ăn và thu hoạch có hiệu ứng pixel tại ô vừa thao tác, chỉ phát sau khi server xác nhận. Camera luôn theo nhân vật, giữ đúng tỉ lệ khi mở/đóng bảng. Tùy chọn giảm chuyển động dùng hình phản hồi tĩnh.
- Nhân vật có bốn hướng nhìn, bước chân theo quãng đường, đường chạm được làm gọn và không dừng ở từng điểm trung gian. Camera chuyển nhẹ; đất đã tưới sẫm màu, cây lớn dần, cá bơi đổi hướng và mặt ao có gợn nước. Bảng chăm sóc giữ nút ổn định trong lúc gửi yêu cầu; bảng câu cá giữ nguyên thanh canh/nút qua các bước và vừa màn hình ngang 568×320 mà không cần cuộn. Đồ họa pixel tự vẽ, không dùng sprite từ trò chơi khác.
- Mỗi yêu cầu chưa xác nhận được giữ thành một bản ghi riêng trong trình duyệt, tránh tab này ghi đè thao tác của tab kia. Tab còn mở hiện **Thử lại** và xử lý tiếp được khi tab gửi ban đầu đã đóng. Định dạng cũ được đọc lại với đúng ID yêu cầu; xác nhận một thao tác không xóa thao tác khác.

API dùng `X-Wallet-Token`: `GET /api/tea/farm`, `POST /api/tea/farm/enter`, `POST /api/tea/farm/actions`. Action có `requestId` duy nhất (UUID), `type` và trường tương ứng: `item`, `slot`, `cycleId`, `quantity`, `quest`. Server bỏ qua số dư/thời gian/owner do client gửi. Các loại gồm `buy`, `plant`, `stock`, `water`, `feed`, `harvest`, `catch`, `sell`, `upgradePlots`, `upgradePond`, `decorate`, `claim`. Tưới/cho ăn/thu hoạch phải gửi `cycleId` của lứa hiện tại để không tác động nhầm lứa mới.

Tiện ích: `waterAll`, `feedAll`, `harvestAll`, `catchAll` nhận `targets: [{slot, cycleId}]` (1–24 ô không trùng); `sellAll` nhận `sale: [{item, quantity}]` (không trùng mặt hàng, tối đa số lượng trong giỏ). Câu cá dùng `castLine`, `hookFish`, `reelFish`, `stopFishing` và `roundId` của lượt hiện tại trừ khi thả cần mới.

Gà/heo: đứng gần chuồng và chọn **Mua & nuôi** (20 vàng/gà, 35 vàng/heo), hoặc dùng giống đã mua ở chợ. Cho ăn miễn phí một lần: gà cho 1 trứng sau 3 phút, bán 8 vàng; giữ gà và cho ăn tiếp để lấy trứng mới. Heo lớn sau 10 phút, đưa vào giỏ rồi bán 65 vàng; chỗ nuôi trở lại trống. Không có bệnh hoặc mất vật nuôi khi offline. API `raiseAnimal`, `feedAnimal`, `collectAnimal` nhận `kind: chicken|pig`, `slot: 0|1`; chăm/thu nhận thêm `cycleId`, mua trực tiếp nhận `purchase: true`. Giá và thời hạn do server quyết định, không dùng ví xu trả phí. Save cũ tự có chuồng trống, giữ cây/cá/vàng đang có. `tests/tea-farm-livestock.test.js` kiểm tra vòng đời, gửi trùng, lỗi ghi, dữ liệu cũ và phạm vi tương tác.

Firestore thêm `tea_farms/{walletId}` và `tea_farm_actions/{sha256(walletId:requestId)}`. Một transaction cập nhật nông trại và biên nhận chống lặp; cùng mã khác nội dung trả `409`. Biên nhận chỉ lưu fingerprint và thời gian, được giữ để chống gửi lại lâu ngày. Không đổi collection ví, thanh toán, không cần bucket hay biến môi trường mới, không cần migration; nông trại khởi tạo khi chủ ví vào lần đầu. Chỉ Firebase Admin ở server truy cập; không mở Firestore Rules trực tiếp cho client. PWA cache v33 chỉ thêm HTML/CSS/JS công khai của map; API vẫn `no-store`. APK hiện tại mở nội dung web nên nhận map mới sau khi cập nhật nội dung, không cần bản APK riêng.

Câu cá: đến gần cầu gỗ, bấm **Tương tác**, thả cần và chờ 2,5–5 giây. Giật trong 4,5 giây khi cá cắn, rồi kéo trúng vùng xanh 2 nhịp (phổ biến/ít gặp), 3 nhịp (hiếm) hoặc 4 nhịp (cực hiếm). Hụt tăng độ căng dây; hụt 3 lần hoặc quá 12 giây của nhịp hiện tại thì cá thoát. Mỗi nhịp có 650ms nghỉ trước lần kéo tiếp. Cần và mồi miễn phí, không trừ xu; cá câu tách biệt với cá đang nuôi.

Có 12 loài: cá rô, rô phi, lóc, mè vinh, trê, rô đồng, sặc, lươn đồng, thát lát, bỗng, he vàng và cá rồng. Tỉ lệ và giá bán vàng nông trại nằm trong `features/tea/fish-catalog.js`; cá hiếm có vùng xanh nhỏ hơn. **Sổ cá** chỉ mở khi bấm, hiển thị hình pixel, độ hiếm, giá bán và số đã câu. `farm.fishBook` ghi các lượt bắt kể từ bản cập nhật này, giữ sau khi bán cá; không suy đoán lịch sử đã bán trước đó.

Client mới gửi `fishingVersion: 2` khi `castLine`, và `reelStep` server trả về khi `reelFish`. Transaction chỉ nhận đúng bước, cùng request ID không kéo hoặc thưởng hai lần; đổi bước bằng cùng ID trả lỗi. Server tự chọn loài, tính thời điểm và tiến độ, chỉ thêm cá/sổ cá khi kéo đủ nhịp. Lượt cũ và tab cũ không gửi phiên bản vẫn dùng luật một nhịp trước đây. Thời hạn vẫn chạy khi mất mạng, tải lại tiếp tục lượt hiện tại. Không cần cấu hình hoặc collection mới; giá cá cũ và nhiệm vụ câu 3 con giữ nguyên. Cache PWA v38 thêm các tài nguyên giao diện công khai của trò câu cá.

Kiểm thử: `node --test tests/tea-farm.test.js tests/tea-fishing.test.js tests/tea-fishing-v2.test.js`; `tests/browser/tea-farm-context.js` và `tests/browser/tea-fishing.js` chạy bằng Playwright trên `node tests/preview.js`, kiểm tra luồng chăm sóc/câu cá, mất phản hồi sau ghi, các viewport 568×320 / 740×360 / 844×390 / 1024×768 và về quán. Preview có `POST /__test/tea/advance` với `{ "ms": 121000 }` để tăng giờ giả (tối đa một ngày mỗi lần); endpoint này **không có trong server production**. Kiểm tra viewport là mô phỏng trình duyệt, chưa thay thế thử trên thiết bị Android/iOS thật.

`tests/tea-farm-outbox.test.js` kiểm tra lưu riêng yêu cầu và chuyển đổi định dạng cũ; `tests/browser/tea-farm-context.js` tái hiện mất phản hồi rồi tải lại và thử lại, kiểm tra chăm sóc cây/cá/gà/heo, bảng mặc định đóng, đi xa đóng bảng và nút E. `tests/browser/tea-farm-pwa.js` kiểm tra khôi phục ví, cache công khai và mở lại khi offline.

`tests/tea-farm-motion.test.js` kiểm tra đường đi tới mọi luống, bờ ao và cầu câu cá, không đi xuyên vật cản hoặc dừng giữa các điểm. `tests/browser/tea-farm-context.js` quan sát vị trí nhân vật thực sự được vẽ, phạm vi mở/đóng bảng và bố cục trên các kích thước màn hình; `tea-fishing.js` kiểm tra nút/thanh kéo không bị thay node hoặc nhảy vị trí sau phản hồi.

`tests/tea-farm-expansion.test.js` kiểm tra kết nối bản đồ lớn, giới hạn nâng cấp, giao dịch hàng loạt nguyên tử, gửi trùng/đồng thời, ô cũ và lỗi lưu. `tests/browser/tea-farm-context.js` chạy trên preview để kiểm tra bán giỏ, đi nhanh giữa các khu và chăm sóc trên màn hình ngang nhỏ. Các script menu trực tiếp trước v33 (`tea-farm.js`, `tea-farm-care.js`, `tea-farm-motion.js`, `tea-farm-expansion.js`) là kịch bản của giao diện cũ; dùng context suite cho giao diện hiện tại.

Quán là sân trà 2D có tranh pixel gốc: sân gạch, cây và hoa, quầy trà mái ngói, bàn gỗ và đủ ghế có lưng tựa. Mặc định tiếng Anh, có nút Tiếng Việt. Khách dùng chung mã ví hiện tại để lưu biệt danh, tóc, quần áo và giày; vào quán miễn phí. Máy tính dùng WASD/phím mũi tên hoặc bấm điểm muốn đến; đường đi tự vòng vật cản. Điện thoại có camera theo nhân vật và cụm phím ảo. Khách tự đi tới ghế trống rồi bấm **Sit/Ngồi**. Tám bàn có sức chứa 2, 4 hoặc 8 người, tổng 34 ghế cho tối đa 32 khách. Bàn đều công cộng; bàn có người cho chọn hỏi trước, bỏ đi hoặc ngồi luôn. Hỏi trước không giữ ghế; server vẫn quyết định ai giành ghế trước bằng transaction. Chủ bàn chuyển cho người ngồi lâu nhất khi chủ rời đi.

Nút di chuyển, cần và nút đánh dùng pointer capture, dừng khi thả ngoài vùng bấm, hủy chạm hoặc rời tab. Chỉ vùng điều khiển/canvas chặn chọn chữ, kéo và menu nhấn giữ của Chrome; chat, mã ví và nội dung chuyển khoản vẫn sao chép được. Kiểm thử giữ/thả: `tests/browser/tea-touch-controls.js`.

Người cùng bàn có thể thách **Đấu trường trà đá**. Hai bên nhận kèo rồi vào sân pixel riêng: chuẩn bị 3 giây, đấu 45 giây, mỗi người 20 máu. Máy tính dùng WASD/phím mũi tên để đi, J/Space đấm, K đá, Shift lướt né; điện thoại có cần di chuyển và ba nút riêng, dùng đồng thời được. Đấm mất 2 máu trong tầm 68px và chờ 450ms; đá mất 3 máu trong tầm 92px và chờ 850ms. Phải áp sát và hướng về đối thủ, đánh xa hoặc quay lưng bị hụt. Lướt kéo dài 180ms, né đòn trong 120ms đầu và hồi sau 1,8 giây. Thanh máu, đồng hồ và nút điều khiển nằm ngoài sân, không che nhân vật.

Server giữ vị trí, va chạm, hướng đánh, máu và kết quả trong bộ nhớ, cập nhật 20 lần/giây qua Socket.IO; không ghi Firestore mỗi bước hoặc nhận vị trí/máu tự khai. Một tab điều khiển nhân vật, số thứ tự input chống thao tác cũ; input tự hết hiệu lực sau 250ms và ngắt kết nối dừng di chuyển ngay. Tải lại khôi phục trận còn hạn và số thứ tự điều khiển. Hết giờ so máu, hết máu thua ngay; rời trận nhận thua nhưng giữ ghế và món. Người đứng dậy hoặc mất kết nối quá 45 giây bỏ trận. Kèo chờ tự hết hạn sau 20 giây. Server khởi động lại hủy trận đang chơi; trận hoàn tất giữ để xem lại trong 60 giây. Trò vui không dùng tiền hoặc xu. Luồng thử hai trình duyệt dùng dữ liệu giả: `node tests/preview.js`, rồi chạy `tests/browser/tea-brawl-controls.js` bằng Playwright.

Người đang ngồi có thể gọi **trà đá 5.000đ** hoặc **đĩa bánh 10.000đ**. Mỗi đơn tạo một QR VietQR riêng với mã `DH`; webhook SePay hiện tại phân biệt đơn quán và lượt nạp xu. Thanh toán thiếu giữ đơn chờ, đủ tiền tạo đúng một món, còn tiền dư hoặc tiền gửi sau khi hủy được cộng vào ví theo quy tắc 1.000đ = 1 xu và giữ phần lẻ. Nhân viên pixel mang món tới bàn hiện tại; nếu khách đứng dậy thì món chờ đến khi khách ngồi lại. Mỗi món có ba lần bấm Uống/Ăn và chỉ chủ món sử dụng được.

Người cùng bàn có thể chơi **Color Cards / Bài đổi màu** miễn phí cho 2–4 người, thêm tối đa hai bot. Server giữ bài kín, kiểm tra lượt và luật đánh cùng màu/số/loại, lá bỏ lượt, `+2`, đổi màu, tự rút khi hết 30 giây và xáo lại chồng bài khi cần. Không có cược hoặc phần thưởng quy đổi tiền.

Lá hợp lệ có dấu chấm vàng; chạm lá đổi màu rồi chọn một trong bốn màu. Hàng bài và lựa chọn giữ nguyên khi cập nhật trạng thái. Đánh/rút khóa trong lúc gửi; lỗi kết nối có nút thử lại dùng đúng ID yêu cầu. Thao tác gửi `gameId`, `expectedVersion` và `requestId`; server chống tác động vào ván/lượt cũ và lưu ID gửi trùng riêng từng ví, không lưu tay bài trong document thao tác. Chủ bàn chia bài cho mọi người; bot mặc định tắt khi có từ hai người thật.

Chọn **Đánh bài** mặc định mở **Tiến lên miền Nam**; có nút chuyển sang Bài đổi màu. Tiến lên chơi miễn phí cho 2–4 người, chủ bàn có thể thêm tối đa ba bot. Mỗi người nhận 13 lá từ bộ 52 lá, chọn một hoặc nhiều lá rồi bấm **Đánh**, **Bỏ lượt**, **Bỏ chọn** hoặc **Gợi ý**. Bài người khác được giữ kín; server quyết định tính hợp lệ và kết quả. Không trừ xu hoặc cộng thưởng cho ván này.

Luật Tiến lên ở quán: 3 < 4 < … < A < 2; bích < chuồn < rô < cơ. Hỗ trợ rác, đôi, bộ ba, tứ quý, sảnh từ ba lá không có 2, ba và bốn đôi thông. Ba đôi thông chặt một heo; tứ quý chặt một/đôi heo hoặc ba đôi thông; bốn đôi thông chặt một/đôi heo, ba đôi thông, tứ quý và bốn đôi thông nhỏ hơn, kể cả ngoài lượt. Bộ cùng loại và cùng độ dài phải lớn hơn bộ trước. Bỏ lượt là bỏ cả vòng; khi mọi người còn lại bỏ, người đánh cuối mở vòng mới. Ván đầu mở bằng lá nhỏ nhất đã chia (3 bích nếu có); ván sau người thắng trước mở. Mỗi lượt 30 giây, hết giờ tự bỏ lượt hoặc đánh lá nhỏ nhất nếu đang mở vòng. Đây là ván nhanh: ai hết bài trước thắng, không áp dụng tới trắng, phạt thối hay cược. Luật tổ hợp/chặt tham khảo [hướng dẫn ZingPlay](https://play.zing.vn/detail-games/chi-tiet.tien-len-mien-nam.2.html); các khác biệt của quán được ghi ngay trong mục Luật chơi.

Lựa chọn lá Tiến lên giữ nguyên khi poll; thao tác gửi ID ván, phiên bản và ID yêu cầu. Lỗi mạng dùng lại đúng ID, không đánh hai lần. Mỗi bàn chỉ chạy một trò bài tại một thời điểm, được kiểm tra trong cùng transaction. Người rời bàn hủy ván Tiến lên, Bài đổi màu hoặc Bài cào; trong Poker họ bỏ bài và những người còn lại tiếp tục. Người cuối rời bàn khiến ván bot được xử lý ngay cùng transaction trả ghế, tránh chặn khách mới. Server khởi động lại hủy các ván đang chơi, không ảnh hưởng món hay ví.

Mục **Đánh bài** có thêm **Bài cào 3 lá** và **Poker Texas Hold’em** cho 2–8 người, gồm tối đa ba bot. Bài cào dùng bộ 52 lá: A tính 1, 2–9 tính theo số, 10/J/Q/K tính 0; tổng lấy hàng đơn vị. Ba lá J/Q/K là ba tây và thắng mọi bài tính nút; bằng nút hoặc cùng ba tây thì cùng thắng, không so chất hay áp dụng sáp/liêng. Mỗi người thấy ba lá của mình, bấm sẵn sàng; cả bàn lật khi đủ người hoặc sau 30 giây. Không dùng chip, tiền hoặc xu.

Poker dùng hai lá riêng, năm lá chung và các vòng preflop/flop/turn/river. Mỗi ván mới cấp lại 1.000 chip chơi, blind 10/20, nút chia bài luân chuyển. Có nhường/check, theo/call, úp/fold, tố đến tổng chip trong vòng và all-in. Server chọn bộ năm lá tốt nhất, xử lý sảnh A–5, hòa, pot phụ, chip lẻ và hoàn phần chưa ai theo. All-in thiếu một mức tố đầy đủ không tự mở lại quyền tố. Bài của người đã úp hoặc thắng vì mọi đối thủ úp không bị công khai. Hết 30 giây tự nhường nếu không cần theo, còn lại tự úp; mốc thời gian giữ nguyên qua các lần poll. Chip chỉ tồn tại trong ván, không trừ/cộng ví, không mua hoặc đổi tiền. Quy tắc bộ bài tham khảo [PokerStars](https://www.pokerstars.com/poker/games/texas-holdem/) và mức tố tham khảo [Poker TDA](https://www.pokertda.com/view-poker-tda-rules/).

Poker giữ nhịp 1,1 giây giữa từng nước, bot đi theo mốc riêng và mỗi lượt người có đủ 30 giây sau khoảng chờ. Server lưu tối đa 48 nước công khai (bài chung, chip, hành động), giữ kín hai lá riêng. Giao diện giữ cố định năm ô bài chung, lật flop/turn/river sau xác nhận, hiện nước gần nhất của từng người và chip đi vào pot; nút hành động và ô nhập tố giữ vị trí trong lúc gửi/đợi. Cập nhật nền không dựng lại lá hay phần kết quả. Trình duyệt chỉ yêu cầu trạng thái trò đang xem. Khi người thật cuối rời bàn, hủy ván bot còn lại và hoàn các chip chơi vui trong ván để không khóa bàn.

Kiểm tra độ mượt với dữ liệu giả: `tests/browser/tea-poker-smooth.js`. Cùng luồng hai người, quan sát 3,6 giây: thuộc tính nút cập nhật thừa từ 36 về 0; phần kết quả từ 8 nút bị dựng lại về 0; năm ô bài giữ nguyên danh tính DOM khi ra flop. Với một người và ba bot, một POST trước đây gộp 6 nước; bản mới nhận đúng một nước của người gửi. Đây là phép đo cục bộ, không phải cam kết độ trễ mạng của môi trường thật.

Các trò bài xếp người chơi quanh bốn cạnh theo góc nhìn từng khách: mình ở dưới, đối thủ ở trái/trên/phải; bàn ba người đặt hai đối thủ ở trái và phải, bàn đông hơn chia nhóm theo cạnh. Tiến lên có **Gom đôi và bộ / Xếp theo số**, Bài đổi màu có **Xếp theo màu / Thứ tự chia**. Sắp lại bài vẫn giữ lựa chọn và ID lá. Khi đã chia, giao diện tập trung vào bàn, có nút **Chọn trò khác** và **Về quán**; thanh thao tác đứng riêng để không che lá. Poker giữ ô nhập chip qua các lần cập nhật; thao tác chưa được xác nhận có nút gửi lại cùng mã. Sau ván Bài cào/Poker có thể chọn lại số bot để chơi tiếp.

Trên màn hình ngang rộng tối đa 1.100px, bàn bài dùng toàn màn hình: đối thủ ở bốn cạnh, bài đánh ở giữa, tay bài và nút thao tác có hàng riêng. Bàn và tay bài vừa vùng hiển thị, không cần kéo; không co toàn bộ bàn làm chữ bị nhỏ. Chiều cao cập nhật theo vùng màn hình còn nhìn thấy, có chừa khoảng an toàn ở đáy. Khi cầm dọc sẽ hiện nhắc xoay máy. Kiểm thử trình duyệt `tests/browser/tea-cards-mobile.js` dùng dữ liệu giả, kiểm tra bốn trò tại 480×270, 568×320, 740×360, 844×390 và 1024×600, chọn lá, lật Bài cào và xoay màn hình. Đây là kiểm tra mô phỏng, chưa thay thế kiểm tra trên thiết bị Android thật.

Mặt bài Tiến lên/Bài cào/Poker dùng nền trắng, số và chất lớn với một viền mảnh. Tiến lên và Bài đổi màu có hoạt ảnh lá đã được server xác nhận đi từ tay xuống bàn, nằm lại để đọc trước khi lần đánh tiếp theo phủ lên; bỏ/rút không xóa chồng bài. Server giữ nhịp 2 giây giữa thao tác, bot đánh theo mốc này và mỗi lượt người chơi vẫn đủ 30 giây sau khoảng chờ. API trả tối đa 48 thao tác công khai theo phiên bản để bắt kịp các lần poll thiếu, không lộ bài kín. Giảm chuyển động bỏ hiệu ứng bay nhưng giữ thời gian xem bài. Sau tải lại hoặc gián đoạn dài, hiện chồng bài mới nhất, không phát lại lịch sử cũ. Kiểm thử hoạt ảnh với dữ liệu giả: chạy `node tests/preview.js`, rồi chạy tệp `tests/browser/tea-card-playback.js` bằng Playwright.

Mục **Trò chơi** có năm trò miễn phí, hỗ trợ tối đa 8 người tính cả tối đa 3 bot:

- **Oẳn tù tì:** 5 vòng chọn bí mật, loại thắng trong vòng hai loại được 1 điểm; cùng loại hoặc đủ ba loại thì hòa. Không chọn kịp được tính bỏ lượt.
- **Ngửa hay sấp:** chọn một phía, server tung đồng xu công bằng trong 5 vòng.
- **Cao hay thấp:** đoán số server nằm trong 1–50 hay 51–100 trong 5 vòng.
- **Đố vui nhanh:** 100 câu hỏi kiến thức và tính nhanh, mỗi ván chọn 5 câu.
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

## Cài Locly Tea trên điện thoại

Trang `/tra-da` là PWA tên **Locly Tea**, mở thẳng vào quán và ưu tiên chơi ngang. Trên Android, bấm **Cài quán → Tải APK Android**. Nếu muốn cài trực tiếp bằng trình duyệt, Chrome có mục **Cài đặt ứng dụng**; khi Chrome bị kẹt, Firefox Android có mục **⋮ → Cài đặt → Thêm vào màn hình chính**. Trên iPhone, mở bằng Safari rồi chọn **Chia sẻ → Thêm vào Màn hình chính → Mở dưới dạng ứng dụng**. Hãy sao lưu mã ví trước khi chuyển cách mở vì dữ liệu có thể không dùng chung giữa các trình duyệt và APK.

Android còn có [APK Locly Tea](https://github.com/jocol1/blogger/releases/latest/download/locly-tea.apk) ký riêng (Android 7.0 trở lên). Trong quán, bấm **Cài quán → Tải APK Android**, mở file vừa tải và xác nhận cài; nếu máy hỏi, cho phép trình duyệt cài ứng dụng này. APK không cần Chrome tạo WebAPK. Sao lưu mã ví trước khi chuyển sang APK. Mã SHA-256 của bản 1.0.0: `ECA255610567BCB602118BD881B5CE88D241C9ABF0453DC0BD1B1D7022E60CA0`. Dự án và hướng dẫn build nằm trong `android/`; khóa ký được giữ ngoài repository.

Manifest yêu cầu `standalone` và `landscape`. Điện thoại đang cầm dọc sẽ tạm khóa thao tác chơi, nhắc xoay ngang nhưng vẫn cho mở sao lưu/khôi phục ví và hướng dẫn cài. Service worker chỉ cache tài nguyên giao diện công khai; API, ví, chat, QR, quản trị và yêu cầu ghi dữ liệu luôn đi qua mạng. Bản cài vẫn cần Internet. Khi có phiên bản mới, người chơi chủ động bấm **Cập nhật khi chơi xong**; ứng dụng không tự tải lại giữa ván hoặc trong lúc còn đơn thanh toán.

Ô ăn quan và Đổ xúc xắc đã được gỡ. API cũ của hai trò trả `410 game_removed`; khi server khởi động, ván cũ còn hoạt động được đóng an toàn mà không xóa lịch sử.

Khu quán không còn danh sách bàn trống; người chơi tự nhìn ghế trong Canvas, chạm hoặc đi tới ghế rồi dùng nút Ngồi. Đồng hồ trên quán dùng giờ Việt Nam và cập nhật mỗi giây. Ánh sáng đổi mượt lúc bình minh/hoàng hôn, ban đêm phủ tối quán và bật đèn vàng. Xe máy hoặc ô tô pixel xuất hiện theo nhịp có khoảng nghỉ, chạy hai chiều trên phần đường; chế độ giảm chuyển động ẩn xe đang chạy nhưng vẫn giữ đồng hồ và ánh sáng.

## Dữ liệu và API

Menu quán pixel gồm trà đá 5.000đ, đĩa bánh 10.000đ, trà chanh 10.000đ, cà phê sữa đá 15.000đ và hạt hướng dương 10.000đ. Mỗi món có ba lần dùng. Danh mục dùng chung ở `public/tea/menu.js`; giá đã lưu của món cũ được giữ nguyên khi thêm món. Quản trị có thể sửa giá từng món tại `/tra-da/admin`; đơn đã tạo giữ giá lúc đặt.

Ăn/uống chỉ phát hiệu ứng sau khi server trừ phần thành công. Sự kiện có `eventId` để trình duyệt bỏ qua bản gửi trùng qua HTTP và Socket.IO. Nhân vật nâng cốc/đưa tay ăn, có cảnh phóng to cạnh nút để xem trên điện thoại; chế độ giảm chuyển động tắt phần chuyển động và hạt trang trí. Thanh toán và món vẫn là trải nghiệm pixel, không giao đồ ăn thật.

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
- `tea_classic_card_games`, `tea_classic_card_starts`, `tea_classic_card_actions` (Bài cào/Poker và ID thao tác chống trùng, không lưu tay bài trong document thao tác)
- `tea_social_games`, `tea_social_actions` (Oẳn tù tì và Lật cặp)

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
- `POST /api/tea/card-games/:key`, `GET /api/tea/card-games/:key/current`, `POST /api/tea/card-games/:key/action` (`baicao`, `poker`)
- `POST /api/tea/seats/:seatId/ask`, `GET /api/tea/seat-requests`, `POST /api/tea/seat-requests/:id/respond`
- `/api/tea/fights`, `/api/tea/fights/current`, `/api/tea/fights/:id/respond`, `/api/tea/fights/:id/hit`
- `POST /api/tea/games`, `GET /api/tea/games/:key`, `POST /api/tea/games/:key/action` (`rps`, `memory`; `dice` và `oanquan` trả `410 game_removed`)

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
