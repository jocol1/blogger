// A small least-recently-used cache with an entry cap, an optional byte cap and an expiry.
// The app runs as one process, so writes made here can drop stale entries straight away.
function createLru({ maxEntries = 500, maxBytes = Infinity, ttlMs = 60_000, sizeOf = () => 0, now = Date.now } = {}) {
  const map = new Map();
  let bytes = 0;
  const drop = key => {
    const entry = map.get(key);
    if (!entry) return;
    bytes -= entry.size;
    map.delete(key);
  };
  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) { drop(key); return undefined; }
      map.delete(key); map.set(key, entry); // most recently used goes last
      return entry.value;
    },
    set(key, value) {
      drop(key);
      const size = sizeOf(value);
      if (size > maxBytes) return;
      map.set(key, { value, size, expires: now() + ttlMs });
      bytes += size;
      while (map.size > maxEntries || bytes > maxBytes) drop(map.keys().next().value);
    },
    delete: drop,
    clear() { map.clear(); bytes = 0; },
    get size() { return map.size; },
    get bytes() { return bytes; },
  };
}

module.exports = { createLru };
