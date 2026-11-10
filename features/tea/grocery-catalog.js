'use strict';
// What the price board compares. `must` / `not` run on the lower-cased product name; `unit` is what prices are
// compared per; `size` is the pack range (in that unit) that counts as a normal household pack. `keyword` may be a
// list and the results are merged. Fresh produce must start with its own name (one brand word allowed) so that
// "cháo cà rốt" or "tương cà chua" are not mistaken for carrots or tomatoes.
const lead = '^(?:[a-zà-ỹ0-9]+\\s)?';

const CATALOG = [
  { id: 'trung-ga', name: 'Trứng gà', keyword: 'trứng gà', unit: 'qua', must: [/trứng gà/], not: [/tràng|non|cút|vịt|gà ác|luộc|muối|bột|bánh|sốt|xốt|mì|bổ sung|omega|tiệt trùng/] },
  { id: 'thit-heo', name: 'Thịt heo (ba rọi)', keyword: 'ba rọi heo', unit: 'kg', must: [/ba rọi|ba chỉ/], not: [/xông khói|rút sườn|nướng|ướp|tẩm|bacon|chiên|rán|đông lạnh|hộp|muối|nấu|viên|bò|gà|chay|xay/] },
  { id: 'thit-ga', name: 'Thịt gà (ức)', keyword: ['ức gà', 'thịt ức gà'], unit: 'kg', must: [/ức gà/], not: [/vịt|sụn|xông|chiên|rán|đông lạnh|viên|xúc xích|ướp|tẩm|nấu|hầm|hun khói|bột|súp|cháo|nem|chả|snack|khô/] },
  { id: 'ca-rot', name: 'Cà rốt', keyword: 'cà rốt', unit: 'kg', must: [new RegExp(lead + 'cà rốt')], not: [/nước|ép|bột|sấy|snack|mứt|bánh|sữa|hạt|đông lạnh|hỗn hợp|ngũ sắc|cắt|baby|cháo|sốt|xốt/] },
  { id: 'khoai-tay', name: 'Khoai tây', keyword: 'khoai tây', unit: 'kg', must: [new RegExp(lead + 'khoai tây')], not: [/chiên|snack|lát|bột|đông lạnh|ăn liền|nghiền|sấy|bánh|mì|khô|que|cắt|gọt|hỗn hợp|chip|poca|lays|oishi|gạo|lứt|sanwhich|sandwich|momiji/] },
  { id: 'ca-chua', name: 'Cà chua', keyword: 'cà chua', unit: 'kg', must: [new RegExp(lead + 'cà chua')], not: [/sốt|xốt|tương|nước|ép|bột|sấy|hộp|ketchup|mứt|bánh|mì|súp|xay|nghiền|đóng|hỗn hợp|đông lạnh|cắt|cherry|bi\b|pizza|sữa chua|mặt nạ|cá|pháo/] },
  { id: 'duong', name: 'Đường', keyword: ['đường', 'đường tinh luyện'], unit: 'kg', must: [/đường (tinh luyện|kính trắng|trắng|cát|sạch|mía|vàng|re)(?![a-zà-ỹ])/], not: [/lỏng|phèn|ăn kiêng|bánh|kẹo|nước|sữa|dầu|trà|cà phê|sốt|xốt|dâu|kem|mật|tương|viên|hộp|hủ|lọ|bột|organic/] },
  { id: 'muoi', name: 'Muối', keyword: 'muối tinh', unit: 'kg', must: [/muối/], not: [/nêm|canh|tinh bột/, /tôm|ớt|tiêu|mè|vừng|sả|tắm|chấm|ăn kiêng|sữa|sốt|xốt|dưa|cá|nước|bột|xì|rửa|kem|đánh răng|súc|lạc|đậu|hồng|snack|bánh|mì|rang|chanh|gia vị|biển|himalaya/] },
  { id: 'nuoc-mam', name: 'Nước mắm', keyword: 'nước mắm', unit: 'l', size: [0.4, 1.1], must: [/nước mắm/], not: [/sốt|xốt|chấm|pha sẵn|gia vị|mì|bột|gói|sachet|combo|lốc|set|\+/] },
  { id: 'sua-tuoi', name: 'Sữa tươi (hộp 1 lít)', keyword: 'sữa tươi 1l', unit: 'l', size: [0.9, 1.1], must: [/sữa tươi/], not: [/chua|bột|đậu|hạt|dừa|trà|cà phê|socola|sô cô la|dâu|kem|thạch|yến|lúa mạch|ca cao|bánh|chuối|cacao|ngũ cốc/] },
  { id: 'dau-an', name: 'Dầu ăn', keyword: ['dầu ăn', 'dầu thực vật'], unit: 'l', size: [0.9, 2.1], must: [/dầu (ăn|thực vật)/], not: [/rửa|massage|gội|xả|trẻ em|xịt|bơ|ô liu|olive|mè|hạnh nhân|dừa|gấc|oliu|hạt chia|combo|set|\+/] },
];

const DEFAULT_SIZE = { kg: [0.2, 5], l: [0.4, 5], qua: [6, 30] };

module.exports = { CATALOG, DEFAULT_SIZE };
