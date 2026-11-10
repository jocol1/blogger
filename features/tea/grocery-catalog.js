'use strict';
// What the price board compares. `must` / `not` run on the lower-cased product name; `unit` is what prices are
// compared per (kg, l, qua = egg, cai = one branded pack); `size` is the pack range (in that unit) that counts as a
// normal household pack. `keyword` may be a list and the results are merged. Fresh produce must start with its own
// name (one brand word allowed) so that "cháo cà rốt" or "tương cà chua" are not mistaken for carrots or tomatoes.
// Branded items (cola, water, detergent) compare the very same product, which is the fairest test.
const lead = '^(?:[a-zà-ỹ0-9]+\\s)?';
const fresh = word => new RegExp(lead + word);
const PROCESSED = /sấy|chiên|rán|bột|ngâm|muối|nước|ép|sốt|xốt|tương|mứt|bánh|sữa|trà|kẹo|dầu|giấm|lên men|hộp|đông lạnh|snack|khô|mì|súp|cháo|nấu|đóng|chip|lát|gọt|cắt|hỗn hợp|rau củ quả|combo|set\b|\+/;

const GROUPS = [
  { id: 'meat', name: 'Thịt, trứng, cá' },
  { id: 'produce', name: 'Rau củ, trái cây' },
  { id: 'dry', name: 'Gạo, mì, đồ khô' },
  { id: 'spice', name: 'Gia vị, dầu ăn' },
  { id: 'drink', name: 'Sữa, đồ uống' },
  { id: 'home', name: 'Đồ dùng gia đình' },
];

const CATALOG = [
  // Thịt, trứng, cá
  { id: 'trung-ga', group: 'meat', name: 'Trứng gà', keyword: 'trứng gà', unit: 'qua', must: [/trứng gà/], not: [/tràng|non|cút|vịt|gà ác|luộc|muối|bột|bánh|sốt|xốt|mì|bổ sung|omega|tiệt trùng/] },
  { id: 'thit-heo', group: 'meat', name: 'Thịt heo (ba rọi)', keyword: 'ba rọi heo', unit: 'kg', must: [/ba rọi|ba chỉ/], not: [/xông khói|rút sườn|nướng|ướp|tẩm|bacon|chiên|rán|đông lạnh|hộp|muối|nấu|viên|bò|gà|chay|xay/] },
  { id: 'thit-heo-xay', group: 'meat', name: 'Thịt heo xay', keyword: 'thịt heo xay', unit: 'kg', must: [/(heo|lợn|thịt) xay/], not: [/bò|gà|cá|viên|chả|nem|hộp|đông lạnh|ướp|tẩm|gia vị|bột|pate|sốt|xốt/] },
  { id: 'thit-ga', group: 'meat', name: 'Thịt gà (ức)', keyword: ['ức gà', 'thịt ức gà'], unit: 'kg', must: [/ức gà/], not: [/xương ức|vịt|sụn|xông|chiên|rán|đông lạnh|viên|xúc xích|ướp|tẩm|nấu|hầm|hun khói|bột|súp|cháo|nem|chả|snack|khô/] },
  { id: 'thit-bo', group: 'meat', name: 'Thịt bò (bắp)', keyword: 'bắp bò', unit: 'kg', must: [/bắp bò|bắp hoa/], not: [/xông|chiên|rán|đông lạnh|viên|xúc xích|ướp|tẩm|nấu|hầm|bột|súp|cháo|nem|chả|snack|khô|hộp|pate|sốt|xốt|gia vị|mì|phở|bún/] },
  { id: 'ca-basa', group: 'meat', name: 'Cá basa (phi lê)', keyword: 'phi lê cá basa', unit: 'kg', must: [/basa/, /phi lê|fillet/], not: [/bao tử|viên|chả|khô|chiên|rán|hộp|sốt|xốt|ướp|tẩm|bột|nấu|mì|phở|bún|snack|dầu|mỡ/] },
  { id: 'suon-non', group: 'meat', name: 'Sườn non heo', keyword: 'sườn non heo', unit: 'kg', must: [/sườn non/], not: [/cháo|bbq|ướp|tẩm|nướng|chiên|rán|hấp|sốt|xốt|kho|nấu|hầm|chua ngọt|bò|gà|cừu|đông lạnh|hộp|canh|chả|nem|viên|gia vị|bột/] },
  { id: 'thit-bo-xay', group: 'meat', name: 'Thịt bò xay', keyword: 'thịt bò xay', unit: 'kg', must: [/bò xay/], not: [/viên|chả|nem|ướp|tẩm|sốt|xốt|hộp|đông lạnh|heo|gà|gia vị|burger/] },
  { id: 'canh-ga', group: 'meat', name: 'Cánh gà', keyword: 'cánh gà', unit: 'kg', must: [/cánh gà/], not: [/chiên|rán|nướng|ướp|tẩm|sốt|xốt|đông lạnh|snack|vị|hộp|cay|giòn|mắm/] },
  { id: 'dui-ga', group: 'meat', name: 'Đùi gà', keyword: 'đùi gà', unit: 'kg', must: [/đùi gà|đùi tỏi|má đùi/], not: [/xương|nấm|chiên|rán|nướng|ướp|tẩm|sốt|xốt|đông lạnh|snack|hộp|cay|giòn|rút xương|cá/] },
  { id: 'tom-the', group: 'meat', name: 'Tôm thẻ', keyword: 'tôm thẻ', unit: 'kg', must: [/tôm thẻ/], not: [/bóc|nõn|khô|chiên|rán|sốt|xốt|viên|chả|bánh|snack|hộp|mì|cháo|ướp|tẩm|nem|há cảo|xúc xích|hấp/] },
  { id: 'trung-vit', group: 'meat', name: 'Trứng vịt', keyword: 'trứng vịt', unit: 'qua', must: [/trứng vịt/], not: [/muối|lộn|bắc thảo|luộc|bánh|sốt|xốt|đông lạnh/] },
  { id: 'trung-cut', group: 'meat', name: 'Trứng cút', keyword: 'trứng cút', unit: 'qua', must: [/trứng cút/], not: [/phá lấu|luộc|lột|bóc|hộp|sốt|xốt|chiên|nướng|lon/] },
  { id: 'dau-hu', group: 'meat', name: 'Đậu hũ', keyword: 'đậu hũ', unit: 'kg', must: [/đậu (hũ|phụ)/], not: [/chiên|rán|sốt|xốt|nhồi|khô|ky|kho|tàu hũ|chay|vị|nước đường|tráng miệng|bột/] },
  { id: 'cha-lua', group: 'meat', name: 'Chả lụa (giò lụa)', keyword: 'chả lụa', unit: 'kg', must: [/chả lụa|giò lụa/], not: [/chiên|bánh|sốt|xốt|chay|cuốn|xôi|combo/] },
  { id: 'xuc-xich', group: 'meat', name: 'Xúc xích', keyword: 'xúc xích', unit: 'kg', must: [/xúc xích/], not: [/chay|bánh|snack|pizza|mì|cơm|sốt|xốt|combo|đồ chơi|mèo|chó|thú cưng/] },

  // Rau củ, trái cây
  { id: 'ca-rot', group: 'produce', name: 'Cà rốt', keyword: 'cà rốt', unit: 'kg', must: [fresh('cà rốt')], not: [PROCESSED, /baby|ngũ sắc/] },
  { id: 'khoai-tay', group: 'produce', name: 'Khoai tây', keyword: 'khoai tây', unit: 'kg', must: [fresh('khoai tây')], not: [PROCESSED, /gạo|lứt|sanwhich|sandwich|momiji|que|ăn liền|nghiền|poca|lays|oishi/] },
  { id: 'ca-chua', group: 'produce', name: 'Cà chua', keyword: 'cà chua', unit: 'kg', must: [fresh('cà chua')], not: [PROCESSED, /ketchup|cherry|bi\b|pizza|sữa chua|mặt nạ|cá|pháo|xay|nghiền/] },
  { id: 'hanh-tay', group: 'produce', name: 'Hành tây', keyword: 'hành tây', unit: 'kg', must: [fresh('hành tây')], not: [PROCESSED, /phi|chiên|tím|baby/] },
  { id: 'toi', group: 'produce', name: 'Tỏi', keyword: 'tỏi', unit: 'kg', must: [fresh('tỏi')], not: [PROCESSED, /ớt|xay|phi|băm|đen|cô đơn|lát|viên|tinh|dầu|bột|sả|đùi|gà|heo|bò/] },
  { id: 'bap-cai', group: 'produce', name: 'Bắp cải', keyword: 'bắp cải', unit: 'kg', must: [fresh('bắp cải')], not: [PROCESSED, /kim chi|kimchi|muối|tím|thảo/] },
  { id: 'dua-leo', group: 'produce', name: 'Dưa leo', keyword: 'dưa leo', unit: 'kg', must: [fresh('dưa (leo|chuột)')], not: [PROCESSED, /baby|muối|chua|cải/] },
  { id: 'chuoi', group: 'produce', name: 'Chuối', keyword: 'chuối', unit: 'kg', must: [fresh('chuối')], not: [PROCESSED, /nướng|cau|hột|ngự|tiêu|que/] },
  { id: 'cam', group: 'produce', name: 'Cam', keyword: 'cam sành', unit: 'kg', must: [fresh('cam ')], not: [PROCESSED, /vắt|cà phê|socola|tây|xoài/] },
  { id: 'tao', group: 'produce', name: 'Táo', keyword: 'táo', unit: 'kg', must: [fresh('táo')], not: [PROCESSED, /mèo|chua|tàu|đỏ khô|tây ta|sấy|ngâm|nho/] },
  { id: 'bi-do', group: 'produce', name: 'Bí đỏ', keyword: 'bí đỏ', unit: 'kg', must: [fresh('bí đỏ')], not: [PROCESSED, /hồ lô|baby/] },
  { id: 'rau-muong', group: 'produce', name: 'Rau muống', keyword: 'rau muống', unit: 'kg', must: [fresh('rau muống')], not: [PROCESSED] },
  { id: 'xa-lach', group: 'produce', name: 'Xà lách', keyword: 'xà lách', unit: 'kg', must: [fresh('xà lách')], not: [PROCESSED, /trộn|salad mix/] },
  { id: 'bong-cai', group: 'produce', name: 'Bông cải xanh', keyword: 'bông cải xanh', unit: 'kg', must: [fresh('(bông cải xanh|súp lơ xanh)')], not: [PROCESSED, /baby/] },
  { id: 'ot', group: 'produce', name: 'Ớt', keyword: 'ớt hiểm', unit: 'kg', must: [fresh('ớt')], not: [PROCESSED, /chuông|sa tế|xay|chưng/] },
  { id: 'nam-kim-cham', group: 'produce', name: 'Nấm kim châm', keyword: 'nấm kim châm', unit: 'kg', must: [fresh('nấm kim châm')], not: [PROCESSED] },
  { id: 'khoai-lang', group: 'produce', name: 'Khoai lang', keyword: 'khoai lang', unit: 'kg', must: [fresh('khoai lang')], not: [PROCESSED, /nướng|que|mật/] },
  { id: 'dua-hau', group: 'produce', name: 'Dưa hấu', keyword: 'dưa hấu', unit: 'kg', must: [fresh('dưa hấu')], not: [PROCESSED, /hạt|vị/] },
  { id: 'xoai', group: 'produce', name: 'Xoài', keyword: 'xoài cát', unit: 'kg', must: [fresh('xoài')], not: [PROCESSED, /keo|dẻo|lắc|chua|non|vị|kem/] },
  { id: 'thanh-long', group: 'produce', name: 'Thanh long', keyword: 'thanh long', unit: 'kg', must: [fresh('thanh long')], not: [PROCESSED] },
  { id: 'nho', group: 'produce', name: 'Nho', keyword: 'nho xanh', unit: 'kg', must: [fresh('nho')], not: [PROCESSED, /vị|thạch|rượu/] },

  // Gạo, mì, đồ khô
  { id: 'gao', group: 'dry', name: 'Gạo', keyword: 'gạo', unit: 'kg', size: [1, 25], must: [/gạo/], not: [PROCESSED, /nếp|lứt|rang|cơm|mầm|chè|phở|bún|miến|giấy|ngũ cốc|kem|sạch nấu|bột/] },
  { id: 'bot-mi', group: 'dry', name: 'Bột mì', keyword: 'bột mì', unit: 'kg', size: [0.3, 5], must: [/bột mì|bột lúa mì/], not: [/chiên|bánh|giòn|pha sẵn|tẩm|sốt|xốt|mì ăn liền|mì gói|trộn|chế biến/] },
  { id: 'gao-nep', group: 'dry', name: 'Gạo nếp', keyword: 'gạo nếp', unit: 'kg', size: [0.5, 10], must: [/nếp/], not: [PROCESSED, /cẩm|than|xôi|rượu|chè|cơm/] },
  { id: 'bun-kho', group: 'dry', name: 'Bún khô', keyword: 'bún khô', unit: 'kg', size: [0.2, 2], must: [/bún/], not: [/tươi|bò|ăn liền|riêu|mọc|chả|thịt|cá|ly|tô|hộp|cua|chay|phở|gia vị|vị/] },
  { id: 'dau-xanh', group: 'dry', name: 'Đậu xanh', keyword: 'đậu xanh', unit: 'kg', size: [0.2, 2], must: [/đậu xanh/], not: [/cháo|nui|bánh|chè|sữa|nước|bột|cà phê|kem|nhân|rang|vị|thạch|mứt|ngâm|nấu|giá/] },
  { id: 'dau-phong', group: 'dry', name: 'Đậu phộng', keyword: 'đậu phộng', unit: 'kg', size: [0.2, 2], must: [/đậu phộng|lạc/], not: [/bơ|kẹo|bánh|rang|muối|tỏi|da cá|sữa|dầu|nước|chiên|sấy|vị|snack|mè xửng|nhân/] },
  { id: 'yen-mach', group: 'dry', name: 'Yến mạch', keyword: 'yến mạch', unit: 'kg', size: [0.2, 2], must: [/yến mạch/], not: [/bánh|sữa|thanh|cháo|ngũ cốc|granola|nước|mix|vị|socola|trái cây|hộp quà/] },
  { id: 'mi-goi', group: 'dry', name: 'Mì Hảo Hảo (gói)', keyword: 'mì hảo hảo', unit: 'cai', unitLabel: 'gói', must: [/hảo hảo/], not: [/thùng|lốc|combo|\bx ?\d|\d ?x\b|ly|tô|cốc|chén|\d+ gói|\+|xào/] },

  // Gia vị, dầu ăn
  { id: 'duong', group: 'spice', name: 'Đường', keyword: ['đường', 'đường tinh luyện'], unit: 'kg', must: [/đường (tinh luyện|kính trắng|trắng|cát|sạch|mía|vàng|re)(?![a-zà-ỹ])/], not: [/lỏng|phèn|ăn kiêng|bánh|kẹo|nước|sữa|dầu|trà|cà phê|sốt|xốt|dâu|kem|mật|tương|viên|hộp|hủ|lọ|bột|organic/] },
  { id: 'muoi', group: 'spice', name: 'Muối', keyword: 'muối tinh', unit: 'kg', must: [/muối/], not: [/nêm|canh|tinh bột/, /tôm|ớt|tiêu|mè|vừng|sả|tắm|chấm|ăn kiêng|sữa|sốt|xốt|dưa|cá|nước|bột|xì|rửa|kem|đánh răng|súc|lạc|đậu|hồng|snack|bánh|mì|rang|chanh|gia vị|biển|himalaya/] },
  { id: 'nuoc-mam', group: 'spice', name: 'Nước mắm', keyword: 'nước mắm', unit: 'l', size: [0.4, 1.1], must: [/nước mắm/], not: [/sốt|xốt|chấm|pha sẵn|gia vị|mì|bột|gói|sachet|combo|lốc|set|\+/] },
  { id: 'nuoc-tuong', group: 'spice', name: 'Nước tương (xì dầu)', keyword: 'nước tương', unit: 'l', size: [0.2, 1.1], must: [/nước tương|xì dầu/], not: [/chấm|pha sẵn|gia vị|mì|bột|gói|sachet|combo|lốc|set|\+|ớt|tỏi|hải sản|sushi|phở|hộp|lọ nhỏ/] },
  { id: 'dau-an', group: 'spice', name: 'Dầu ăn', keyword: ['dầu ăn', 'dầu thực vật'], unit: 'l', size: [0.9, 2.1], must: [/dầu (ăn|thực vật)/], not: [/rửa|massage|gội|xả|trẻ em|xịt|bơ|ô liu|olive|mè|hạnh nhân|dừa|gấc|oliu|hạt chia|combo|set|\+/] },
  { id: 'hat-nem', group: 'spice', name: 'Hạt nêm', keyword: 'hạt nêm', unit: 'kg', size: [0.2, 2], must: [/hạt nêm/], not: [/combo|set\b|\+|gói nhỏ|\d ?x\b|\bx ?\d|vị heo|chay|nấm|gà|hải sản/] },
  { id: 'bot-ngot', group: 'spice', name: 'Bột ngọt (mì chính)', keyword: 'bột ngọt', unit: 'kg', size: [0.2, 2], must: [/bột ngọt|mì chính/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|hạt nêm|canh/] },
  { id: 'tuong-ot', group: 'spice', name: 'Tương ớt', keyword: 'tương ớt', unit: 'kg', size: [0.2, 1.2], must: [/tương ớt/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|mì|snack|bánh|gói nhỏ|sachet|cay xé|hàn|gochujang|xúc|gà/] },
  { id: 'tieu', group: 'spice', name: 'Tiêu đen', keyword: 'tiêu đen', unit: 'kg', size: [0.03, 1], must: [/tiêu (đen|trắng|sọ|hạt|xay)/], not: [/chuối|muối|sốt|xốt|sa tế|nước|bò|gà|vị|snack|bánh|mì|combo|lá|xanh|ớt/] },
  { id: 'dau-hao', group: 'spice', name: 'Dầu hào', keyword: 'dầu hào', unit: 'kg', size: [0.1, 1.2], must: [/dầu hào/], not: [/combo|\+|gói|sachet|chay|nấm/] },
  { id: 'giam', group: 'spice', name: 'Giấm', keyword: 'giấm gạo', unit: 'l', size: [0.2, 1.1], must: [/giấm/], not: [/táo|balsamic|nho|tỏi|ớt|đường|sốt|xốt|dưa|ngâm|bánh|kẹo|combo|\+|tắm|gội/] },
  { id: 'tuong-ca', group: 'spice', name: 'Tương cà', keyword: 'tương cà', unit: 'kg', size: [0.2, 1.2], must: [/tương cà|sốt cà chua|ketchup/], not: [/combo|\+|gói nhỏ|sachet|mì|snack|bánh|cá|đậu|cay xé|ớt/] },
  { id: 'mayonnaise', group: 'spice', name: 'Sốt mayonnaise', keyword: 'mayonnaise', unit: 'kg', size: [0.1, 1.2], must: [/mayonnaise|mayo/], not: [/combo|\+|gói nhỏ|sachet|bánh|snack|mì|vị/] },
  { id: 'nuoc-cot-dua', group: 'spice', name: 'Nước cốt dừa', keyword: 'nước cốt dừa', unit: 'l', size: [0.1, 1.1], must: [/cốt dừa/], not: [/bột|bánh|kẹo|thạch|combo|\+|vị|kem/] },

  // Sữa, đồ uống
  { id: 'sua-tuoi', group: 'drink', name: 'Sữa tươi (hộp 1 lít)', keyword: 'sữa tươi 1l', unit: 'l', size: [0.9, 1.1], must: [/sữa tươi/], not: [/chua|bột|đậu|hạt|dừa|trà|cà phê|socola|sô cô la|dâu|kem|thạch|yến|lúa mạch|ca cao|bánh|chuối|cacao|ngũ cốc/] },
  { id: 'sua-dac', group: 'drink', name: 'Sữa đặc có đường', keyword: 'sữa đặc có đường', unit: 'kg', size: [0.3, 0.6], must: [/sữa đặc/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|thùng|lốc|trà|cà phê|socola|bánh|kem|sữa bột|không đường|ít đường/] },
  { id: 'nuoc-suoi', group: 'drink', name: 'Nước suối Aquafina (chai 500ml)', keyword: 'nước aquafina 500ml', unit: 'cai', unitLabel: 'chai', must: [/aquafina/, /500 ?ml/], not: [/thùng|lốc|combo|\bx ?\d|\d ?x\b|\+|\d chai|vị|soda|lít|1[.,]5/] },
  { id: 'sua-dau-nanh', group: 'drink', name: 'Sữa đậu nành', keyword: 'sữa đậu nành', unit: 'l', size: [0.18, 2], must: [/sữa đậu nành/], not: [/bột|bánh|kẹo|thùng|combo|\+|óc chó|hạnh nhân|mè đen|ngũ cốc/] },
  { id: 'coca', group: 'drink', name: 'Coca-Cola (chai 1,5 lít)', keyword: 'coca cola 1.5l', unit: 'l', size: [1.4, 1.6], must: [/coca/], not: [/zero|light|diet|thùng|lốc|combo|\+|vanilla|cherry|lon/] },

  // Đồ dùng gia đình
  { id: 'bot-giat', group: 'home', name: 'Bột giặt OMO', keyword: 'bột giặt omo', unit: 'kg', size: [1.5, 6], must: [/omo/, /bột giặt/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|nước giặt|túi nhỏ|gói nhỏ|nước xả/] },
  { id: 'nuoc-rua-chen', group: 'home', name: 'Nước rửa chén Sunlight', keyword: 'nước rửa chén sunlight', unit: 'kg', size: [0.5, 4], must: [/sunlight/, /rửa chén|rửa bát/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|túi nhỏ|gói nhỏ|rửa tay|lau sàn|bột|nước giặt|tẩy/] },
  { id: 'nuoc-giat', group: 'home', name: 'Nước giặt OMO', keyword: 'nước giặt omo', unit: 'kg', size: [1, 5], must: [/omo/, /nước giặt/], not: [/combo|\+|\d ?x\b|\bx ?\d|túi nhỏ|gói nhỏ|xả|bột/] },
  { id: 'nuoc-xa', group: 'home', name: 'Nước xả vải Comfort', keyword: 'nước xả comfort', unit: 'l', size: [1, 5], must: [/comfort/, /xả/], not: [/combo|\+|\d ?x\b|\bx ?\d|túi nhỏ|gói nhỏ|giặt/] },
  { id: 'giay-vs', group: 'home', name: 'Giấy vệ sinh', keyword: 'giấy vệ sinh', unit: 'cuon', must: [/giấy vệ sinh/], not: [/ướt|khăn|hộp rút|combo|\+|thùng|đồ chơi/] },
  { id: 'kem-danh-rang', group: 'home', name: 'Kem đánh răng P/S', keyword: 'kem đánh răng p/s', unit: 'kg', size: [0.1, 0.5], must: [/p\/s/, /kem đánh răng/], not: [/combo|\+|\d ?x\b|\bx ?\d|trẻ em|bé|bàn chải|tặng|bộ/] },
  { id: 'nuoc-lau-san', group: 'home', name: 'Nước lau sàn Sunlight', keyword: 'nước lau sàn sunlight', unit: 'kg', size: [0.5, 4], must: [/sunlight/, /lau sàn/], not: [/combo|\+|\d ?x\b|\bx ?\d|túi nhỏ/] },
];

const DEFAULT_SIZE = { kg: [0.2, 5], l: [0.4, 5], qua: [6, 30], cuon: [4, 30], cai: [1, 1] };

module.exports = { CATALOG, GROUPS, DEFAULT_SIZE };
