// Daily requests use Vietnam's calendar and only reward free farm gold.
const DAY = 86_400_000, OFFSET = 7 * 3_600_000;
const dayAt = at => Math.floor((at + OFFSET) / DAY);
const customers = [
  { en: 'Auntie Mai', vi: 'Cô Mai', note: { en: 'Fresh vegetables for the café kitchen. Leave the washing to me!', vi: 'Cô cần rau nấu cơm cho quán. Đất còn dính cũng được, cô rửa cho!' } },
  { en: 'Uncle Ba', vi: 'Chú Ba', note: { en: 'My grandkids are visiting. Help me fill their plates!', vi: 'Mấy đứa cháu về chơi, giúp chú làm một bữa ra trò nhé!' } },
  { en: 'Little An', vi: 'Bé An', note: { en: 'A little surprise for Mum. Please keep it a secret!', vi: 'Con muốn tặng mẹ một bất ngờ. Đừng mách mẹ trước nha!' } },
];
const menus = [
  [['radish', 2], ['radish', 3], ['radish', 4]],
  [['carrot', 2], ['tomato', 1], ['corn', 1]],
  [['guppy', 2], ['egg', 3], ['carp', 1]],
];
function board(farm, at, catalog) {
  const day = dayAt(at), completed = farm.dailyOrders?.day === day ? farm.dailyOrders.completed : [];
  return { day, expiresAt: (day + 1) * DAY - OFFSET, rows: menus.map((menu, i) => {
    const [item, quantity] = menu[((day + i) % menu.length + menu.length) % menu.length];
    return { id: `${day}-${i}`, customer: customers[i], item, quantity,
      reward: Math.ceil(catalog[item].sell * quantity * 1.5), completed: completed.includes(i) };
  }) };
}
function deliver(farm, input, at, catalog, fail) {
  const current = board(farm, at, catalog);
  const order = current.rows.find(row => row.id === input.orderId);
  if (!order) fail('farm_order_expired');
  if (order.completed) fail('farm_order_delivered');
  if ((farm.products[order.item] || 0) < order.quantity) fail('farm_order_missing');
  if (farm.dailyOrders?.day !== current.day) farm.dailyOrders = { day: current.day, completed: [] };
  farm.products[order.item] -= order.quantity;
  farm.gold += order.reward;
  farm.dailyOrders.completed.push(current.rows.indexOf(order));
  farm.stats.deliveries = (farm.stats.deliveries || 0) + 1;
}
module.exports = { board, deliver, dayAt };
