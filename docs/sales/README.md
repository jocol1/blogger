# Locly: tìm khách trả tiền đầu tiên

Cập nhật 10/10/2026. Mục tiêu người dùng chốt: **10.000 USD tổng doanh thu trong một tháng**. Hiện chưa có kênh tìm khách. Ngân sách và số giờ có thể dành cho bán hàng chưa được xác nhận.

Đây là phương án thử bán, không phải dự báo doanh thu. Chưa xác minh được số tiền đang có trên production vì môi trường local không có thông tin kết nối Firebase. Không coi dữ liệu thiếu là doanh thu bằng 0.

## Chọn thứ bán được ngay

Bắt đầu bằng **buổi chơi Locly Party có người hướng dẫn, cho một nhóm 3–10 người**. Khách trả tiền cho kịch bản, việc chuẩn bị và người điều phối. Dùng bốn trò đang có, không cần xây thêm game để thử nhu cầu. Một người có thể demo cùng hai bot; phải nói rõ đó là bot.

Hai nhóm cần kiểm chứng trước: người tổ chức hoạt động cho nhóm nhỏ; đơn vị sự kiện muốn có một phần chơi bằng điện thoại cho khách. Chưa có bằng chứng họ muốn mua, vì vậy việc đầu tiên là mời xem demo, hỏi nhu cầu và đề nghị một buổi thử trả phí.

Trang [Jackbox dành cho sự kiện](https://www.jackboxgames.com/jackbox-for-events/) cho thấy party game có cách dùng trong sự kiện. Đây là tham khảo về cách dùng, không chứng minh mức giá Locly hoặc nhu cầu của các đầu mối bên dưới.

## Giá và số đơn

Mốc quy đổi để lập kế hoạch: 26.070đ/USD, giá bán USD của [Vietcombank](https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx), bản dữ liệu ngày 10/10/2026 lúc 13:10:57. **Mục tiêu quy đổi 260.700.000đ**; tỷ giá thực tế khi thanh toán có thể khác. Bảng dùng 30 ngày để so sánh; ngày bắt đầu chiến dịch chưa được chốt.

| Sản phẩm | Giá một đơn | Số đơn tối thiểu để đạt mốc | Tình trạng |
|---|---:|---:|---|
| Gói Party tự chơi 2 giờ | 19.000đ | 13.722 | Đang có |
| Chat 60 phút | 10.000đ | 26.070 | Đang có, người quản trị trả lời |
| Buổi Party có hướng dẫn | 1.900.000đ | 138 | Giá thử đề xuất |
| Bộ Party theo thương hiệu | 9.900.000đ | 27 | Cần làm theo đơn; chưa có sẵn |
| Bộ thương hiệu + 3 buổi hướng dẫn | 14.900.000đ | 18 | Cần làm theo đơn; chưa có sẵn |

Chat giới hạn ba phiên đồng thời: ngay cả chạy đủ 24 giờ/ngày, không hoàn xu, tối đa chỉ bán 72 phiên/ngày, tương đương 21.600.000đ trong 30 ngày. Thực tế sức người còn giới hạn hơn. Đây không phải nguồn đủ sức đạt mục tiêu hiện tại.

Các gói giá cao là giả thuyết cần thử, không phải giá thị trường đã xác minh. Không tính xu thắng, xu hoàn hoặc tiền đã nạp rồi dùng mua gói thành hai lần doanh thu. Theo dõi riêng **tiền thực thu**, **giá trị đơn ký**, **dịch vụ đã bàn giao** và **tiền hoàn**; tiền nạp ví còn chưa dùng không tự trở thành doanh thu dịch vụ đã hoàn thành. Loại khoản thử và chuyển tiền của chính mình khi đánh giá bán hàng.

## Kiểm tra sức làm trước khi nhận đơn

Ví dụ công suất để kiểm tra, chưa phải số giờ người dùng đã cam kết: 160 giờ/tháng, dành 60 giờ bán hàng và hỗ trợ, mỗi đơn thương hiệu mất 12 giờ. Còn 100 giờ, làm tối đa 8 đơn, giá trị 79.200.000đ. Vì vậy **27 đơn giá 9,9 triệu chưa phải kế hoạch khả thi cho một người** nếu chưa rút ngắn bàn giao hoặc có người cùng làm.

Chỉ nhận đơn sau khi chốt ngày giao và sức làm. Hiện mỗi phòng tối đa 10 người; chưa kiểm thử số phòng đồng thời ở tải sự kiện. Không báo giá như một game cho hàng trăm người cùng phòng, cũng không hứa hiệu quả bán hàng của khách.

## Việc làm trong 7 ngày đầu

1. Ngày 1: tự diễn tập demo 10 phút theo `sales-kit.md`; quay clip màn hình 45–60 giây, không dùng thông tin người chơi thật. Chốt số giờ có thể dành cho hỗ trợ và một kênh liên hệ để khách trả lời.
2. Ngày 2–3: người dùng chọn và tự liên hệ 10 đầu mối phù hợp qua kênh công khai; dùng mẫu tin đã cá nhân hóa. Danh sách ban đầu nằm ở `prospects.csv`. Đây là mục tiêu hoạt động, không phải việc đã làm.
3. Ngày 3–5: thực hiện demo khi khách đồng ý; hỏi số người, ngày tổ chức, ai quyết định ngân sách và hoạt động hiện tại. Ghi nguyên văn nhu cầu và lý do từ chối, không tự điền xác suất chốt đơn.
4. Ngày 5–7: gửi báo giá theo phạm vi thật; đề nghị buổi thử trả phí. Mục tiêu kiểm chứng đầu tiên là **một khách trả tiền và nhận buổi chơi đúng cam kết**, không phải số lượt xem.
5. Cuối tuần: nếu 10 cuộc trao đổi phù hợp không dẫn đến demo, sửa đối tượng hoặc cách mở lời. Nếu có demo nhưng không mua, hỏi lý do trước khi viết thêm tính năng. Nếu đã mua, ghi thời gian làm và chi phí thực tế để tính sức giao hàng.

Không có kết quả nào trong các bước trên được coi là đã xảy ra cho đến khi có phản hồi hoặc giao dịch thật. Chưa gửi tin cho các đơn vị, chưa mua quảng cáo, chưa công bố gói dịch vụ mới.

## Sổ theo dõi

`prospects.csv` là danh sách đầu mối nghiên cứu từ trang chính thức, chưa phải khách quan tâm. VietPower và LuxEvent công bố cùng hệ sinh thái/đầu mối liên hệ; gộp thành một cơ hội, không đếm hai khách độc lập. Không có số cá nhân hay danh sách khách đã mua.

`orders-template.csv` là mẫu trống, mỗi đơn một dòng. Điền mã đơn riêng, giá trị, tiền thực thu, tiền hoàn, trạng thái bàn giao và nguồn giới thiệu. Chưa có hệ thống thanh toán cho dịch vụ doanh nghiệp; không hướng khách nạp xu với lời hứa tự mở một gói thương hiệu.

Để xác minh nền ban đầu, người dùng có thể cung cấp tổng tiền thu theo khoảng ngày từ SePay, loại khoản thử và tiền hoàn. Không gửi khóa Firebase, mã ví hoặc nội dung trao đổi của khách vào tài liệu bán hàng.
