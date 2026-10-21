const crypto = require('node:crypto');

// All prices are play-only farm gold. This module never writes to paid wallets.
const CATALOG = {
  radish: { en: 'Radish', vi: 'Củ cải', type: 'crop', price: 5, sell: 9, seconds: 60, color: '#f5e9c5' },
  carrot: { en: 'Carrot', vi: 'Cà rốt', type: 'crop', price: 12, sell: 22, seconds: 180, color: '#ed9644' },
  tomato: { en: 'Tomato', vi: 'Cà chua', type: 'crop', price: 25, sell: 48, seconds: 600, color: '#df6257' },
  corn: { en: 'Corn', vi: 'Bắp', type: 'crop', price: 40, sell: 80, seconds: 1800, color: '#f1cf58' },
  guppy: { en: 'Guppy', vi: 'Cá bảy màu', type: 'fish', price: 10, sell: 18, seconds: 120, color: '#f2a66b' },
  carp: { en: 'Carp', vi: 'Cá chép', type: 'fish', price: 24, sell: 46, seconds: 600, color: '#e0c1a2' },
  koi: { en: 'Koi', vi: 'Cá koi', type: 'fish', price: 45, sell: 90, seconds: 1800, color: '#fff0d5' },
  flowers: { en: 'Flower bed', vi: 'Bồn hoa', type: 'decor', price: 35 },
  lantern: { en: 'Garden lantern', vi: 'Đèn vườn', type: 'decor', price: 65 },
  bench: { en: 'Wooden bench', vi: 'Ghế gỗ', type: 'decor', price: 90 },
};
const QUESTS = [
  { id: 'firstCrop', stat: 'crops', target: 1, reward: 20, en: 'Your first harvest', vi: 'Vụ rau đầu tiên' },
  { id: 'firstFish', stat: 'fish', target: 1, reward: 25, en: 'Your first fish', vi: 'Mẻ cá đầu tiên' },
  { id: 'gardener', stat: 'crops', target: 12, reward: 60, en: 'Harvest 12 vegetables', vi: 'Thu hoạch 12 cây rau' },
  { id: 'fishkeeper', stat: 'fish', target: 6, reward: 70, en: 'Raise 6 fish', vi: 'Nuôi lớn 6 con cá' },
  { id: 'market', stat: 'sold', target: 20, reward: 100, en: 'Sell 20 products', vi: 'Bán 20 nông sản' },
];
class FarmError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; this.farmError = true; }
}
const fail = (code, status = 409) => { throw new FarmError(status, code); };
function initialFarm(at) {
  return { version: 1, gold: 120, plots: Array(6).fill(null), ponds: Array(2).fill(null),
    seeds: { radish: 6, guppy: 2 }, products: {}, decorations: [], placed: [null, null, null, null],
    stats: { crops: 0, fish: 0, sold: 0 }, claimed: [], createdAt: at, updatedAt: at };
}
function createFarm({ db, now = () => Date.now() }) {
  const refFor = id => db.collection('tea_farms').doc(id);
  const view = farm => ({ farm, catalog: CATALOG, quests: QUESTS, serverNow: now() });
  async function read(id) {
    const farm = await db.runTransaction(async tx => {
      const ref = refFor(id), snap = await tx.get(ref);
      if (snap.exists) return snap.data();
      const row = initialFarm(now()); tx.create(ref, row); return row;
    });
    return view(farm);
  }
  async function action(id, input) {
    if (!input || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{12,80}$/.test(input.requestId)) fail('farm_bad_request', 400);
    const { type, item, slot, cycleId, quantity, quest } = input;
    if (item !== undefined && item !== null && typeof item !== 'string') fail('farm_bad_item', 400);
    const allowed = ['buy', 'plant', 'stock', 'water', 'feed', 'harvest', 'catch', 'sell', 'upgradePlots', 'upgradePond', 'decorate', 'claim'];
    if (!allowed.includes(type)) fail('farm_bad_action', 400);
    // Unknown fields (including client gold/timestamps/owner) cannot affect state.
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ type, item, slot, cycleId, quantity, quest })).digest('hex');
    const attempt = db.collection('tea_farm_actions').doc(crypto.createHash('sha256').update(id + ':' + input.requestId).digest('hex'));
    const result = await db.runTransaction(async tx => {
      const ref = refFor(id), [snap, prior] = await Promise.all([tx.get(ref), tx.get(attempt)]);
      const farm = snap.exists ? snap.data() : initialFarm(now());
      if (prior.exists) {
        if (prior.data().fingerprint !== fingerprint) fail('farm_request_conflict');
        return farm;
      }
      const def = Object.hasOwn(CATALOG, item || '') ? CATALOG[item] : null;
      const qty = quantity === undefined ? 1 : quantity;
      const spend = amount => { if (farm.gold < amount) fail('farm_not_enough_gold'); farm.gold -= amount; };
      if (['buy', 'sell'].includes(type)) {
        if (!Number.isInteger(qty) || qty < 1 || qty > 99 || !def) fail('farm_bad_item', 400);
        if (type === 'buy') {
          if (def.type === 'decor') {
            if (qty !== 1 || farm.decorations.includes(item)) fail('farm_already_owned');
            spend(def.price); farm.decorations.push(item);
          } else {
            if ((farm.seeds[item] || 0) + qty > 9999) fail('farm_inventory_full');
            spend(def.price * qty); farm.seeds[item] = (farm.seeds[item] || 0) + qty;
          }
        } else {
          if (def.type === 'decor' || (farm.products[item] || 0) < qty) fail('farm_no_product');
          farm.products[item] -= qty; farm.gold += def.sell * qty; farm.stats.sold += qty;
        }
      } else if (['plant', 'stock', 'water', 'feed', 'harvest', 'catch'].includes(type)) {
        const fish = ['stock', 'feed', 'catch'].includes(type), area = fish ? farm.ponds : farm.plots;
        if (!Number.isInteger(slot) || slot < 0 || slot >= area.length) fail('farm_bad_slot', 400);
        if (['plant', 'stock'].includes(type)) {
          if (!def || def.type !== (fish ? 'fish' : 'crop')) fail('farm_bad_item', 400);
          if (area[slot]) fail('farm_slot_busy');
          if (!(farm.seeds[item] > 0)) fail('farm_no_seed');
          farm.seeds[item]--; area[slot] = { item, cycleId: input.requestId, plantedAt: now(), readyAt: null };
        } else {
          const growing = area[slot];
          if (!growing || growing.cycleId !== cycleId) fail('farm_stale_slot');
          if (type === 'water' || type === 'feed') {
            if (growing.readyAt !== null) fail('farm_already_cared');
            growing.readyAt = now() + CATALOG[growing.item].seconds * 1000;
          } else {
            if (growing.readyAt === null || growing.readyAt > now()) fail('farm_not_ready');
            if ((farm.products[growing.item] || 0) >= 9999) fail('farm_inventory_full');
            farm.products[growing.item] = (farm.products[growing.item] || 0) + 1;
            farm.stats[fish ? 'fish' : 'crops']++; area[slot] = null;
          }
        }
      } else if (type === 'upgradePlots' || type === 'upgradePond') {
        const area = type === 'upgradePlots' ? farm.plots : farm.ponds, max = type === 'upgradePlots' ? 12 : 6;
        if (area.length >= max) fail('farm_max_level');
        spend(type === 'upgradePlots' ? 120 + (area.length - 6) * 30 : 100 + (area.length - 2) * 60);
        area.push(null, null);
      } else if (type === 'decorate') {
        if (!Number.isInteger(slot) || slot < 0 || slot >= farm.placed.length || (item !== null && !farm.decorations.includes(item))) fail('farm_bad_item', 400);
        // One purchased ornament can be moved, not duplicated.
        farm.placed = farm.placed.map(value => item !== null && value === item ? null : value); farm.placed[slot] = item;
      } else if (type === 'claim') {
        const task = QUESTS.find(q => q.id === quest);
        if (!task || farm.stats[task.stat] < task.target) fail('farm_quest_not_ready');
        if (farm.claimed.includes(quest)) fail('farm_already_claimed');
        farm.claimed.push(quest); farm.gold += task.reward;
      }
      farm.version++; farm.updatedAt = now();
      tx.set(ref, farm); tx.create(attempt, { fingerprint, createdAt: now() });
      return farm;
    });
    return view(result);
  }
  return { read, action };
}
module.exports = { createFarm, CATALOG, QUESTS, FarmError };
