/* Executed only on explicit request. Never reads inputs, cookies, storage or cross-origin frames. */
export function extractBrowserPage() {
  const LIMIT = 24000, ENOUGH = 400, started = Date.now();
  // Queries and fragments often contain private search terms, tokens or account identifiers.
  const address = new URL(location.href); address.search = ''; address.hash = '';
  const head = { title: document.title.slice(0, 500), url: address.href };
  const language = document.documentElement.lang || '';
  if (/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(language)) head.lang = language;
  if (!document.body) return { ...head, text: '', truncated: false };
  // Form controls, scripts and hidden content are never read. Whole <form> blocks and page chrome
  // (menus, footers, side bars) are skipped first and only read when nothing else is readable.
  const controls = 'input,textarea,select,option,script,style,noscript,template,[contenteditable],[hidden],[aria-hidden="true"]';
  const chrome = 'nav,aside,footer,[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],body>header';
  const shown = el => el.getClientRects().length > 0;
  const size = el => (el.textContent || '').length;
  const displays = new Map();
  const inline = el => { let d = displays.get(el); if (d === undefined) { d = getComputedStyle(el).display; displays.set(el, d); } return d.startsWith('inline') || d === 'contents'; };
  // The nearest block ancestor: text in the same block is one sentence, not one line per tag.
  const blockOf = el => { let n = el; while (n && n !== document.body && inline(n)) n = n.parentElement; return n || document.body; };
  const prefix = block => { const m = /^H([1-6])$/.exec(block.tagName); return m ? '#'.repeat(Number(m[1])) + ' ' : block.tagName === 'LI' ? '- ' : ''; };
  function collect(root, skipChrome, skipForms) {
    const skip = controls + (skipForms ? ',form' : '') + (skipChrome ? ',' + chrome : '');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const lines = [];
    let line = null, lastBlock = null, lastRow = null, length = 0, truncated = false, visited = 0, node;
    const flush = () => { if (line !== null) { const clean = line.replace(/\s+/g, ' ').trim(); if (clean) lines.push(clean); line = null; } };
    while ((node = walker.nextNode())) {
      if (++visited > 30000) { truncated = true; break; }
      const parent = node.parentElement;
      if (!parent) continue;
      const raw = node.textContent.replace(/\s+/g, ' ');
      if (raw === ' ' || raw === '') {
        // Space between two inline elements of the same block; indentation between blocks is dropped.
        if (line !== null && !parent.closest(skip) && blockOf(parent) === lastBlock) { line += ' '; length += 1; }
        continue;
      }
      if (parent.closest(skip)) continue;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || !shown(parent)) continue;
      const block = blockOf(parent), cell = block.closest('td,th'), row = cell && cell.closest('tr');
      if (line !== null && block === lastBlock) line += raw;
      else if (line !== null && cell === block && row && row === lastRow) line = line.trimEnd() + ' | ' + raw.trimStart();
      else { flush(); line = prefix(block) + raw.trimStart(); }
      lastBlock = block; lastRow = row; length += raw.length;
      if (length >= LIMIT) { truncated = true; break; }
    }
    flush();
    const text = lines.join('\n');
    return { text: text.slice(0, LIMIT), truncated: truncated || text.length > LIMIT };
  }
  // main: the largest one; a single <article> only when it is the whole page (a list of articles is not).
  const readable = list => list.filter(el => shown(el) && size(el) >= 200);
  const mains = readable([...document.querySelectorAll('main,[role="main"]')]).sort((a, b) => size(b) - size(a));
  const articles = [...document.querySelectorAll('article')].filter(shown);
  const root = mains[0] || (articles.length === 1 && size(articles[0]) >= 200 ? articles[0] : document.body);
  // Fall back step by step, only while too little was found: read forms' plain text, then the whole
  // body, and only as a last resort the menus and footers (which would otherwise fill the budget).
  let best = null;
  for (const [from, noChrome, noForms, lastResort] of [[root, true, true], [root, true, false], [document.body, true, false], [document.body, false, false, true]]) {
    if (best && Date.now() - started > 1500) break;
    const result = collect(from, noChrome, noForms);
    if (!best || (lastResort ? best.text.length < 40 : result.text.length > best.text.length)) best = result;
    if (best.text.length >= ENOUGH) break;
  }
  // What the user selected on the page (never from a field, and never text that sits in a field).
  let selection = '';
  try {
    const picked = getSelection();
    const active = document.activeElement;
    if (picked && !picked.isCollapsed && picked.rangeCount && !(active && active.matches && active.matches('input,textarea,select,[contenteditable]'))) {
      const owner = n => n && (n.nodeType === 1 ? n : n.parentElement);
      const inside = [picked.anchorNode, picked.focusNode].every(n => { const el = owner(n); return el && !el.closest(controls); });
      const text = inside ? picked.toString().replace(/\s+/g, ' ').trim().slice(0, 4000) : '';
      const typed = text.length >= 3 && [...document.querySelectorAll('textarea,input')].slice(0, 300).some(f => typeof f.value === 'string' && f.value.includes(text));
      if (text && !typed) selection = text;
    }
  } catch { selection = ''; }
  return { ...head, text: best.text, truncated: best.truncated, ...(selection ? { selection } : {}) };
}
