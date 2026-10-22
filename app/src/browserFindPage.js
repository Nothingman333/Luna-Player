/* Find in page (Ctrl+F in Luna Web). Runs only on request, in the tab's own page. It never changes the
   page's elements: matches are painted with the CSS Custom Highlight API, and only a count and the
   current position go back to Luna. Form fields, scripts and hidden text are not searched. */
export function browserFindPage(action, query, matchCase) {
  const KEY = '__lunaFind', LIMIT = 1000;
  const state = window[KEY] || (window[KEY] = { ranges: [], index: -1, query: '', matchCase: false, at: '' });
  const paint = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
  const clear = () => {
    if (paint) { CSS.highlights.delete('luna-find'); CSS.highlights.delete('luna-find-current'); }
    state.ranges = []; state.index = -1; state.query = ''; state.at = ''; state.re = null;
  };
  if (action === 'clear') {
    clear();
    const style = document.getElementById('luna-find-style'); if (style) style.remove();
    try { const s = getSelection(); if (s && s.lunaFind) { s.removeAllRanges(); s.lunaFind = false; } } catch {}
    return { count: 0, index: 0, capped: false };
  }
  query = String(query || '').slice(0, 200);
  // A node removed from the page does not disconnect its ranges: they collapse onto the parent. So a stored match
  // counts as still valid only when its text still fits the query.
  const fits = r => {
    if (r.collapsed || !state.re) return false;
    const text = r.toString(); state.re.lastIndex = 0;
    const m = state.re.exec(text); return !!m && m.index === 0 && m[0].length === text.length;
  };
  const stale = action !== 'find' && (state.query !== query || state.matchCase !== !!matchCase || state.at !== location.href || state.ranges.some(r => !fits(r)));
  if (action === 'find' || stale) {
    clear();
    state.query = query; state.matchCase = !!matchCase; state.at = location.href;
    if (!query.trim() || !document.body) return { count: 0, index: 0, capped: false };
    // Regex case folding keeps string offsets intact (lower-casing can change a string's length).
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
    state.re = pattern;
    const skip = 'script,style,noscript,template,textarea,input,select,option,[contenteditable],[aria-hidden="true"]';
    const seen = new WeakMap();
    const visible = el => {
      let v = seen.get(el);
      if (v === undefined) { v = !el.closest(skip) && (el.checkVisibility ? el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) : el.getClientRects().length > 0); seen.set(el, v); }
      return v;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, visited = 0;
    while ((node = walker.nextNode()) && state.ranges.length < LIMIT && ++visited < 80000) {
      const parent = node.parentElement;
      if (!parent || !node.data || !visible(parent)) continue;
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(node.data)) && state.ranges.length < LIMIT) {
        if (!m[0]) { pattern.lastIndex++; continue; }
        const range = document.createRange();
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        state.ranges.push(range);
      }
    }
    // Start at the first match on or below the visible top of the page, like other browsers.
    const top = state.ranges.findIndex(r => r.getBoundingClientRect().bottom >= 0);
    state.index = state.ranges.length ? (top >= 0 ? top : 0) : -1;
  } else if (state.ranges.length) {
    const step = action === 'prev' ? -1 : 1;
    state.index = (state.index + step + state.ranges.length) % state.ranges.length;
  }
  const count = state.ranges.length;
  if (!count) return { count: 0, index: 0, capped: false };
  const current = state.ranges[state.index];
  if (paint) {
    if (!document.getElementById('luna-find-style')) {
      const style = document.createElement('style'); style.id = 'luna-find-style';
      style.textContent = '::highlight(luna-find){background-color:rgba(255,190,60,.42);color:inherit}::highlight(luna-find-current){background-color:#ff8a1f;color:#14100c}';
      (document.head || document.documentElement).appendChild(style);
    }
    CSS.highlights.set('luna-find', new Highlight(...state.ranges));
    const mark = new Highlight(current); mark.priority = 1;
    CSS.highlights.set('luna-find-current', mark);
  } else {
    try { const s = getSelection(); s.removeAllRanges(); s.addRange(current); s.lunaFind = true; } catch {}
  }
  const box = current.getBoundingClientRect();
  if (box.top < 60 || box.bottom > innerHeight - 40 || box.left < 0 || box.right > innerWidth) {
    const host = current.startContainer.parentElement;
    if (host) host.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  return { count, index: state.index + 1, capped: count >= LIMIT };
}
