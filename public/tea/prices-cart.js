// Price board cart: compare the total of the chosen items at each supermarket, because people shop at one store.
// Shared by the browser (window.TeaPriceCart) and the tests (module.exports).
(function (root) {
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
  const api = { compareCart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeaPriceCart = api;
})(this);
