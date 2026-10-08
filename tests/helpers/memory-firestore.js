// Test double only. Production routes always receive Firebase Admin Firestore.
// Optimistic version checks rerun callbacks on contention, like Firestore transactions.
class MemoryFirestore {
  constructor() { this.rows = new Map(); this.version = 0; this.failWrites = false; }
  collection(name) {
    const db = this;
    return {
      doc(id) { return { path: `${name}/${id}`, async get() { return db.snapshot(this.path); }, async set(data, options) { const current = db.rows.get(this.path); db.rows.set(this.path, structuredClone(options?.merge && current ? { ...current, ...data } : data)); db.version++; }, async delete() { db.rows.delete(this.path); db.version++; } }; },
      where(field, operator, value) {
        if (operator !== '>') throw new Error('Unsupported query');
        return { orderBy(order) { return { limit(count) { return { async get() {
          const matches = [...db.rows.entries()].filter(([key, row]) => key.startsWith(`${name}/`) && row[field] > value).sort((a, b) => a[1][order] - b[1][order]).slice(0, count);
          return { docs: matches.map(([key]) => db.snapshot(key)) };
        } }; } }; } };
      },
    };
  }
  snapshot(path) {
    const value = structuredClone(this.rows.get(path));
    return { exists: value !== undefined, data: () => structuredClone(value) };
  }
  async runTransaction(fn) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const version = this.version;
      const writes = [];
      const tx = {
        get: async ref => { if (writes.length) throw new Error('Read after write'); return this.snapshot(ref.path); },
        create: (ref, data) => writes.push({ type: 'create', path: ref.path, data }),
        set: (ref, data) => writes.push({ type: 'set', path: ref.path, data }),
        update: (ref, data) => writes.push({ type: 'update', path: ref.path, data }),
        delete: ref => writes.push({ type: 'delete', path: ref.path }),
      };
      const result = await fn(tx);
      if (this.version !== version) continue;
      if (this.failWrites && writes.length) throw new Error('Simulated storage failure');
      for (const write of writes) {
        if (write.type === 'create' && this.rows.has(write.path)) throw new Error('Already exists');
        if (write.type === 'update' && !this.rows.has(write.path)) throw new Error('Missing document');
      }
      for (const write of writes) {
        if (write.type === 'delete') this.rows.delete(write.path);
        else this.rows.set(write.path, structuredClone(write.type === 'update' ? { ...this.rows.get(write.path), ...write.data } : write.data));
      }
      if (writes.length) this.version++;
      return result;
    }
    throw new Error('Transaction contention');
  }
}
module.exports = { MemoryFirestore };
