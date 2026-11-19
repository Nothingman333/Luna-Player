/* Native-evaluated, bounded text-node translation. Never replaces HTML or event handlers.
   One translation session per page: the first snapshot starts it, later `next` snapshots hand out the
   text that is still untranslated (what is on screen first), and a MutationObserver marks the page dirty
   so text that appears later (scrolling feeds, opened menus) is picked up without starting over. */
export function browserTranslatePage(action, payload = {}) {
  const key = '__luna_text_translation_v1';
  const state = window[key];
  const CHUNK_ROWS = 60, CHUNK_CHARS = 4500, SESSION_ROWS = 6000;
  if (action === 'language') return { language: (document.documentElement?.lang || '').slice(0, 24) };
  if (action === 'restore') {
    if (!state || state.document !== document) return { restored: 0 };
    let restored = 0;
    for (const row of state.rows) {
      if (row.node.isConnected && row.translated !== undefined && row.node.textContent === row.translated) {
        row.node.textContent = row.original; restored++;
      }
    }
    state.observer?.disconnect();
    delete window[key];
    return { restored };
  }
  if (action === 'snapshot') {
    const language = (document.documentElement?.lang || '').slice(0, 24);
    let session = state;
    if (payload.next) {
      if (!session || session.document !== document || session.token !== payload.token || session.href !== location.href) throw new Error('Sayfa değişti; çeviri durdu.');
      if (payload.onlyIfDirty && !session.dirty) return { token: session.token, truncated: false, language, rows: [] };
      // A chunk that was handed out but never applied (stopped or failed) goes back in the queue.
      for (const row of session.rows) if (row.translated === undefined && session.done.get(row.node) === row.original) session.done.delete(row.node);
    } else {
      // Restore only our own unchanged translations before taking a new language snapshot.
      if (state) browserTranslatePage('restore');
      session = { document, token: crypto.randomUUID(), rows: [], href: location.href, done: new WeakMap(), dirty: false, observer: null };
      if (typeof MutationObserver === 'function' && document.body) {
        session.observer = new MutationObserver(() => { session.dirty = true; });
        session.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-expanded'] });
      }
      window[key] = session;
    }
    session.dirty = false;
    const root = document.body;
    if (!root) throw new Error('Sayfa henüz hazır değil.');
    const blocked = 'input,textarea,select,option,script,style,noscript,template,code,pre,svg,math,iframe,[contenteditable],form,[hidden],[aria-hidden="true"],[translate="no"],.notranslate';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const height = window.innerHeight || 0, candidates = [];
    let node, visited = 0, truncated = false;
    while ((node = walker.nextNode())) {
      if (++visited > 30000) { truncated = true; break; }
      const original = node.textContent;
      // Already ours (translated, or handed out and still unchanged): skip without layout work.
      if (session.done.get(node) === original) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(blocked) || !parent.getClientRects().length) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || style.display === 'none') continue;
      const text = original.trim();
      if (!text || !/\p{L}/u.test(text)) continue;
      if (text.length > 1800) { truncated = true; continue; }
      // On screen first (top to bottom), then below the fold, then what was scrolled past.
      const box = parent.getBoundingClientRect ? parent.getBoundingClientRect() : { top: 0, bottom: 0 };
      const order = box.bottom > 0 && box.top < height ? box.top : box.top >= height ? 1e7 + box.top : 2e7 - box.bottom;
      candidates.push({ node, original, text, order });
      if (candidates.length >= 3000) { truncated = true; break; }
    }
    candidates.sort((a, b) => a.order - b.order);
    const rows = [];
    let length = 0;
    for (const c of candidates) {
      if (session.rows.length >= SESSION_ROWS) { truncated = true; break; }
      if (rows.length >= CHUNK_ROWS || (rows.length && length + c.text.length > CHUNK_CHARS)) break;
      const row = { id: session.rows.length, node: c.node, original: c.original, text: c.text };
      session.rows.push(row); session.done.set(c.node, c.original); rows.push(row); length += c.text.length;
    }
    // Text that did not fit in this chunk is still waiting: keep the page dirty so it is asked for again.
    if (rows.length && candidates.length > rows.length) session.dirty = true;
    return { token: session.token, truncated, language, rows: rows.map(({ id, text }) => ({ id, text })) };
  }
  if (action === 'apply') {
    if (!state || state.document !== document || state.token !== payload.token || state.href !== location.href) throw new Error('Sayfa değişti; çeviri uygulanmadı.');
    if (!Array.isArray(payload.translations) || payload.translations.length > 180) throw new Error('Geçersiz çeviri yanıtı.');
    const ids = new Set();
    // Validate the whole result before editing the first node.
    for (const t of payload.translations) {
      if (!t || !Number.isInteger(t.id) || !state.rows[t.id] || ids.has(t.id) || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 6000) throw new Error('Geçersiz çeviri satırı.');
      ids.add(t.id);
    }
    let applied = 0, skipped = 0;
    for (const t of payload.translations) {
      const row = state.rows[t.id];
      if (!row.node.isConnected || row.node.textContent !== row.original) { skipped++; continue; }
      const leading = row.original.match(/^\s*/)[0], trailing = row.original.match(/\s*$/)[0];
      row.translated = leading + t.text.trim() + trailing;
      row.node.textContent = row.translated; state.done?.set(row.node, row.translated); applied++;
    }
    return { applied, skipped };
  }
  throw new Error('Unknown translation operation');
}
