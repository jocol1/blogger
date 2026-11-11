// Price board logic that is not drawing: compare a cart across stores, ready-made carts, the best deals and the
// biggest drops, and the share-link format. Shared by the browser (window.TeaPriceCart), the server (page preview text)
// and the tests (module.exports).
(function (root) {
  const live = (data, store) => !store.referenceOnly && data.stores.includes(store);
  const okCell = (item, store) => { const c = item.perStore[store.id]; return c && c.status === 'ok' && !c.stale ? c : null; };

  /** One unit of each cart item (1 kg, 1 litre, 1 egg…) per store; stores missing items rank after complete ones. */
  function compareCart(data, cartIds, storeIds) {
    const items = data.items.filter(item => cartIds.includes(item.id));
    const priced = (item, store) => item.perStore[store.id]?.status === 'ok' && !item.perStore[store.id].stale;
    const rows = data.stores.filter(store => storeIds.includes(store.id)).map(store => {
      const have = items.filter(item => priced(item, store));
      return { store, total: have.reduce((sum, item) => sum + item.perStore[store.id].unitPrice, 0), have: have.length, missing: items.filter(item => !have.includes(item)).map(item => item.name), reference: Boolean(store.referenceOnly) };
    }).sort((a, b) => Number(a.reference) - Number(b.reference) || b.have - a.have || a.total - b.total);
    // Rows are sorted by coverage then total, so the first verified store with any item is the best answer; it may
    // still be missing items, which the UI says next to it.
    const best = rows.find(row => !row.reference && row.have > 0) || null;
    return { items, rows, best };
  }

  /** Like compareCart, but only over items every live store has a fresh price for, so totals are like for like. */
  function commonCart(data, cartIds, storeIds) {
    const stores = data.stores.filter(s => storeIds.includes(s.id) && !s.referenceOnly);
    const ids = cartIds.filter(id => { const item = data.items.find(i => i.id === id); return item && stores.length > 0 && stores.every(s => okCell(item, s)); });
    return { ...compareCart(data, ids, stores.map(s => s.id)), skipped: cartIds.length - ids.length };
  }

  // Ready-made carts: one tap fills the cart. Ids must exist in the catalog (a test checks), unknown ids are ignored.
  const PRESETS = [
    { id: 'basic', label: 'prPresetBasic', icon: '🛒', ids: ['trung-ga', 'gao', 'duong', 'muoi', 'nuoc-mam', 'dau-an', 'sua-tuoi', 'thit-heo', 'ca-chua', 'khoai-tay'] },
    { id: 'family', label: 'prPresetFamily', icon: '🍚', ids: ['thit-heo', 'trung-ga', 'ca-rot', 'ca-chua', 'bap-cai', 'hanh-tay', 'toi', 'gao', 'nuoc-mam', 'dau-an'] },
    { id: 'breakfast', label: 'prPresetBreakfast', icon: '🍳', ids: ['trung-ga', 'sua-tuoi', 'mi-goi', 'chuoi', 'bot-mi', 'sua-dac', 'yen-mach', 'xuc-xich'] },
    { id: 'hotpot', label: 'prPresetHotpot', icon: '🍲', ids: ['thit-bo', 'tom-the', 'nam-kim-cham', 'xa-lach', 'dau-hu', 'bun-kho', 'cha-lua', 'nuoc-tuong', 'ot', 'coca'] },
    { id: 'home', label: 'prPresetHome', icon: '🧺', ids: ['bot-giat', 'nuoc-giat', 'nuoc-xa', 'nuoc-rua-chen', 'nuoc-lau-san', 'giay-vs', 'kem-danh-rang'] },
  ];
  const presetIds = (data, preset) => preset.ids.filter(id => data.items.some(item => item.id === id));

  /** Items marked down the most (selling price vs the store's list price), one entry per item, photos first. */
  function topDeals(data, n = 6, minPercent = 8) {
    const deals = [];
    for (const item of data.items) {
      let best = null;
      for (const store of data.stores.filter(s => live(data, s))) {
        const c = okCell(item, store);
        if (!c || !(c.listPrice > c.price) || !(c.price > 0)) continue;
        const percent = Math.round((1 - c.price / c.listPrice) * 100);
        if (percent >= minPercent && (!best || percent > best.percent)) best = { item, store, cell: c, percent };
      }
      if (best) deals.push(best);
    }
    deals.sort((a, b) => Number(Boolean(b.cell.image)) - Number(Boolean(a.cell.image)) || b.percent - a.percent);
    return deals.slice(0, n);
  }

  /** Cells whose price per unit fell since the last day, biggest percentage first, one entry per item. */
  function priceDrops(data, n = 6, minPercent = 3) {
    const drops = [];
    for (const item of data.items) {
      let best = null;
      for (const store of data.stores.filter(s => live(data, s))) {
        const c = okCell(item, store);
        if (!c || !(c.change < 0)) continue;
        const before = c.unitPrice - c.change, percent = Math.round(-c.change / before * 100);
        if (percent >= minPercent && (!best || percent > best.percent)) best = { item, store, cell: c, percent, before };
      }
      if (best) drops.push(best);
    }
    return drops.sort((a, b) => b.percent - a.percent).slice(0, n);
  }

  /** Share link format: ?gio=id,id,id. Only ids that exist are accepted, at most 80, so a hand-made link cannot do harm. */
  const cartQuery = ids => 'gio=' + ids.map(encodeURIComponent).join(',');
  function cartFromQuery(search, validIds) {
    const raw = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('gio') || '';
    return [...new Set(raw.split(',').map(s => s.trim()).filter(id => /^[a-z0-9-]{1,40}$/.test(id) && validIds.includes(id)))].slice(0, 80);
  }

  const api = { compareCart, commonCart, PRESETS, presetIds, topDeals, priceDrops, cartQuery, cartFromQuery };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeaPriceCart = api;
})(this);
