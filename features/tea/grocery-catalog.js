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
  { id: 'thit-ga', group: 'meat', name: 'Thịt gà (ức)', keyword: ['ức gà', 'thịt ức gà'], unit: 'kg', must: [/ức gà/], not: [/vịt|sụn|xông|chiên|rán|đông lạnh|viên|xúc xích|ướp|tẩm|nấu|hầm|hun khói|bột|súp|cháo|nem|chả|snack|khô/] },
  { id: 'thit-bo', group: 'meat', name: 'Thịt bò (bắp)', keyword: 'bắp bò', unit: 'kg', must: [/bắp bò|bắp hoa/], not: [/xông|chiên|rán|đông lạnh|viên|xúc xích|ướp|tẩm|nấu|hầm|bột|súp|cháo|nem|chả|snack|khô|hộp|pate|sốt|xốt|gia vị|mì|phở|bún/] },
  { id: 'ca-basa', group: 'meat', name: 'Cá basa (phi lê)', keyword: 'phi lê cá basa', unit: 'kg', must: [/basa/], not: [/bao tử|viên|chả|khô|chiên|rán|hộp|sốt|xốt|ướp|tẩm|bột|nấu|mì|phở|bún|snack|dầu|mỡ/] },

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

  // Gạo, mì, đồ khô
  { id: 'gao', group: 'dry', name: 'Gạo', keyword: 'gạo', unit: 'kg', size: [1, 25], must: [/gạo/], not: [PROCESSED, /nếp|lứt|rang|cơm|mầm|chè|phở|bún|miến|giấy|ngũ cốc|kem|sạch nấu|bột/] },
  { id: 'bot-mi', group: 'dry', name: 'Bột mì', keyword: 'bột mì', unit: 'kg', size: [0.3, 5], must: [/bột mì|bột lúa mì/], not: [/chiên|bánh|giòn|pha sẵn|tẩm|sốt|xốt|mì ăn liền|mì gói|trộn|chế biến/] },

  // Gia vị, dầu ăn
  { id: 'duong', group: 'spice', name: 'Đường', keyword: ['đường', 'đường tinh luyện'], unit: 'kg', must: [/đường (tinh luyện|kính trắng|trắng|cát|sạch|mía|vàng|re)(?![a-zà-ỹ])/], not: [/lỏng|phèn|ăn kiêng|bánh|kẹo|nước|sữa|dầu|trà|cà phê|sốt|xốt|dâu|kem|mật|tương|viên|hộp|hủ|lọ|bột|organic/] },
  { id: 'muoi', group: 'spice', name: 'Muối', keyword: 'muối tinh', unit: 'kg', must: [/muối/], not: [/nêm|canh|tinh bột/, /tôm|ớt|tiêu|mè|vừng|sả|tắm|chấm|ăn kiêng|sữa|sốt|xốt|dưa|cá|nước|bột|xì|rửa|kem|đánh răng|súc|lạc|đậu|hồng|snack|bánh|mì|rang|chanh|gia vị|biển|himalaya/] },
  { id: 'nuoc-mam', group: 'spice', name: 'Nước mắm', keyword: 'nước mắm', unit: 'l', size: [0.4, 1.1], must: [/nước mắm/], not: [/sốt|xốt|chấm|pha sẵn|gia vị|mì|bột|gói|sachet|combo|lốc|set|\+/] },
  { id: 'nuoc-tuong', group: 'spice', name: 'Nước tương (xì dầu)', keyword: 'nước tương', unit: 'l', size: [0.2, 1.1], must: [/nước tương|xì dầu/], not: [/chấm|pha sẵn|gia vị|mì|bột|gói|sachet|combo|lốc|set|\+|ớt|tỏi|hải sản|sushi|phở|hộp|lọ nhỏ/] },
  { id: 'dau-an', group: 'spice', name: 'Dầu ăn', keyword: ['dầu ăn', 'dầu thực vật'], unit: 'l', size: [0.9, 2.1], must: [/dầu (ăn|thực vật)/], not: [/rửa|massage|gội|xả|trẻ em|xịt|bơ|ô liu|olive|mè|hạnh nhân|dừa|gấc|oliu|hạt chia|combo|set|\+/] },
  { id: 'hat-nem', group: 'spice', name: 'Hạt nêm', keyword: 'hạt nêm', unit: 'kg', size: [0.2, 2], must: [/hạt nêm/], not: [/combo|set\b|\+|gói nhỏ|\d ?x\b|\bx ?\d|vị heo|chay|nấm|gà|hải sản/] },
  { id: 'bot-ngot', group: 'spice', name: 'Bột ngọt (mì chính)', keyword: 'bột ngọt', unit: 'kg', size: [0.2, 2], must: [/bột ngọt|mì chính/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|hạt nêm|canh/] },
  { id: 'tuong-ot', group: 'spice', name: 'Tương ớt', keyword: 'tương ớt', unit: 'kg', size: [0.2, 1.2], must: [/tương ớt/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|mì|snack|bánh|gói nhỏ|sachet|cay xé|hàn|gochujang|xúc|gà/] },

  // Sữa, đồ uống
  { id: 'sua-tuoi', group: 'drink', name: 'Sữa tươi (hộp 1 lít)', keyword: 'sữa tươi 1l', unit: 'l', size: [0.9, 1.1], must: [/sữa tươi/], not: [/chua|bột|đậu|hạt|dừa|trà|cà phê|socola|sô cô la|dâu|kem|thạch|yến|lúa mạch|ca cao|bánh|chuối|cacao|ngũ cốc/] },
  { id: 'sua-dac', group: 'drink', name: 'Sữa đặc có đường', keyword: 'sữa đặc có đường', unit: 'kg', size: [0.3, 0.6], must: [/sữa đặc/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|thùng|lốc|trà|cà phê|socola|bánh|kem|sữa bột|không đường|ít đường/] },
  { id: 'nuoc-suoi', group: 'drink', name: 'Nước suối Aquafina (chai 500ml)', keyword: 'nước aquafina 500ml', unit: 'cai', unitLabel: 'chai', must: [/aquafina/, /500 ?ml/], not: [/thùng|lốc|combo|\bx ?\d|\d ?x\b|\+|\d chai|vị|soda|lít|1[.,]5/] },

  // Đồ dùng gia đình
  { id: 'bot-giat', group: 'home', name: 'Bột giặt OMO', keyword: 'bột giặt omo', unit: 'kg', size: [1.5, 6], must: [/omo/, /bột giặt/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|nước giặt|túi nhỏ|gói nhỏ|nước xả/] },
  { id: 'nuoc-rua-chen', group: 'home', name: 'Nước rửa chén Sunlight', keyword: 'nước rửa chén sunlight', unit: 'kg', size: [0.5, 4], must: [/sunlight/, /rửa chén|rửa bát/], not: [/combo|set\b|\+|\d ?x\b|\bx ?\d|túi nhỏ|gói nhỏ|rửa tay|lau sàn|bột|nước giặt|tẩy/] },
];

const DEFAULT_SIZE = { kg: [0.2, 5], l: [0.4, 5], qua: [6, 30], cai: [1, 1] };

module.exports = { CATALOG, GROUPS, DEFAULT_SIZE };
