/** Session-only LRU cache, bounded by entries, estimated payload size and age. No user data is persisted. */
export class MemoryCache<T> {
  private rows = new Map<string, { value: T; weight: number; at: number }>();
  private used = 0;
  constructor(private options: { entries: number; weight: number; age: number; weigh: (value: T) => number; now?: () => number }) {}
  private now() { return (this.options.now ?? Date.now)(); }
  get(key: string): T | undefined {
    const row = this.rows.get(key);
    if (!row) return undefined;
    if (this.now() - row.at >= this.options.age) { this.delete(key); return undefined; }
    this.rows.delete(key); this.rows.set(key, row);
    return row.value;
  }
  set(key: string, value: T) {
    this.delete(key);
    const weight = Math.max(1, this.options.weigh(value));
    if (!Number.isFinite(weight) || weight > this.options.weight) return;
    for (const [id, row] of this.rows) if (this.now() - row.at >= this.options.age) this.delete(id);
    this.rows.set(key, { value, weight, at: this.now() }); this.used += weight;
    while (this.rows.size > this.options.entries || this.used > this.options.weight) {
      const first = this.rows.keys().next().value; if (first === undefined) break; this.delete(first);
    }
  }
  delete(key: string) { const old = this.rows.get(key); if (old) { this.used -= old.weight; this.rows.delete(key); } }
  clear() { this.rows.clear(); this.used = 0; }
  get size() { return this.rows.size; }
  get weight() { return this.used; }
}

/** Share an in-flight read. Failures are never cached; invalidated/older reads cannot restore stale data. */
export class ResourceCache<T> {
  private pending = new Map<string, Promise<T>>();
  constructor(private values: MemoryCache<T>, private retain: (value: T) => boolean = () => true) {}
  get(key: string, load: () => Promise<T>): Promise<T> {
    const value = this.values.get(key);
    if (value !== undefined) return Promise.resolve(value);
    const old = this.pending.get(key); if (old) return old;
    const request = Promise.resolve().then(load).then(result => {
      if (this.pending.get(key) === request && this.retain(result)) this.values.set(key, result);
      return result;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    // Bound references to active keys as well; callers still own their original pending promise.
    if (this.pending.size > 40) this.pending.delete(this.pending.keys().next().value!);
    return request;
  }
  delete(key: string) { this.pending.delete(key); this.values.delete(key); }
  clear() { this.pending.clear(); this.values.clear(); }
}
