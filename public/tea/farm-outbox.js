/* One durable record per request: another tab may retry it, but cannot overwrite it. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeaFarmOutbox = factory();
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  function create(storage, token) {
    const legacy = 'locly-farm-pending-' + token, prefix = legacy + ':';
    const valid = value => value && typeof value.type === 'string' && typeof value.requestId === 'string' && /^[a-zA-Z0-9-]{12,80}$/.test(value.requestId);
    function save(input) {
      if (!valid(input)) throw new Error('Invalid pending farm request');
      const key = prefix + input.requestId;
      if (!storage.getItem(key)) storage.setItem(key, JSON.stringify({ input, createdAt: Date.now() }));
    }
    function first() {
      // Carry a pending v1 request into the new format with the SAME server id.
      const old = storage.getItem(legacy);
      if (old) {
        let input; try { input = JSON.parse(old); } catch {}
        if (valid(input)) save(input);
      }
      const rows = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i); if (!key?.startsWith(prefix)) continue;
        try {
          const row = JSON.parse(storage.getItem(key));
          if (valid(row?.input) && key === prefix + row.input.requestId) rows.push(row);
        } catch {}
      }
      rows.sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0) || a.input.requestId.localeCompare(b.input.requestId));
      return rows[0]?.input || null;
    }
    function remove(requestId) {
      let old; try { old = JSON.parse(storage.getItem(legacy)); } catch {}
      if (old?.requestId === requestId) storage.removeItem(legacy);
      storage.removeItem(prefix + requestId);
    }
    return { save, first, remove, matches: key => key === legacy || key?.startsWith(prefix) };
  }
  return { create };
});
