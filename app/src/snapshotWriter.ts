/** Serialize writes, skip only acknowledged snapshots, and retry failures on the next trigger. */
export function createSnapshotWriter(write: (json: string) => Promise<void>) {
  let last: string | null = null;
  let pending: string | null = null;
  let running: Promise<void> | null = null;
  let generation = 0;
  const drain = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (pending !== null) {
        const json = pending;
        pending = null;
        if (json === last) continue;
        const epoch = generation;
        try { await write(json); if (epoch === generation) last = json; }
        catch (error) { last = null; throw error; }
      }
    })().finally(() => {
      running = null;
      // A trigger can arrive between the async loop finishing and this finalizer.
      if (pending !== null) return drain();
    });
    return running;
  };
  const save = (data: Record<string, string>): Promise<void> => {
    // Stable key order: localStorage enumeration can change after removing/readding an entry.
    pending = JSON.stringify(Object.fromEntries(Object.keys(data).sort().map(key => [key, data[key]])));
    return drain();
  };
  save.invalidate = () => { last = null; generation++; };
  return save;
}
