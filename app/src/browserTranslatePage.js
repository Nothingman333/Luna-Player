/* Native-evaluated, bounded text-node translation. Never replaces HTML or event handlers. */
export function browserTranslatePage(action, payload = {}) {
  const key = '__luna_text_translation_v1';
  const state = window[key];
  if (action === 'restore') {
    if (!state || state.document !== document) return { restored: 0 };
    let restored = 0;
    for (const row of state.rows) {
      if (row.node.isConnected && row.translated !== undefined && row.node.textContent === row.translated) {
        row.node.textContent = row.original; restored++;
      }
    }
    delete window[key];
    return { restored };
  }
  if (action === 'snapshot') {
    // Restore only our own unchanged translations before taking a new language snapshot.
    if (state) browserTranslatePage('restore');
    const rows = [], root = document.body;
    if (!root) throw new Error('Sayfa henüz hazır değil.');
    const blocked = 'input,textarea,select,option,script,style,noscript,template,code,pre,svg,math,iframe,[contenteditable],form,[hidden],[aria-hidden="true"],[translate="no"],.notranslate';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node, length = 0, visited = 0, truncated = false;
    while ((node = walker.nextNode())) {
      if (++visited > 30000) { truncated = true; break; }
      const parent = node.parentElement;
      if (!parent || parent.closest(blocked) || !parent.getClientRects().length) continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== 'visible' || style.display === 'none') continue;
      const original = node.textContent;
      const text = original.trim();
      if (!text || !/\p{L}/u.test(text)) continue;
      if (text.length > 1800) { truncated = true; continue; }
      if (rows.length >= 180 || length + text.length > 24000) { truncated = true; break; }
      rows.push({ id: rows.length, node, original, text }); length += text.length;
    }
    const token = crypto.randomUUID();
    window[key] = { document, token, rows, href: location.href };
    return { token, truncated, rows: rows.map(({ id, text }) => ({ id, text })) };
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
      row.node.textContent = row.translated; applied++;
    }
    return { applied, skipped };
  }
  throw new Error('Unknown translation operation');
}
