/* Luna Web reading view and per-site zoom. npm run test:browser-reader. Models load on their own (no imports). */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function moduleOf(file) { const m = { exports: {} }; new Function('exports', 'module', transpile(read(file)))(m.exports, m); return m.exports; }
const R = moduleOf('src/browserReaderContent.ts'), Z = moduleOf('src/browserZoomMemory.ts');
const tests = [], test = (name, run) => tests.push({ name, run });
const PAGE = ['# Dune: Part Two', 'Paul Atreides unites with Chani and the Fremen.', 'Paul Atreides unites with Chani and the Fremen.', '## Cast', '- Timothée Chalamet as Paul', '- Zendaya as Chani',
  'Role | Actor', 'Paul | Timothée Chalamet', '### İstanbul gösterimi', 'Gösterim İSTANBUL ve Ankara’da; ıssız bir çöl.', '#### Footnote level four', ''].join('\n');

test('Page text becomes headings, paragraphs, list items and table rows; intentional repeated lines are kept', () => {
  const b = R.readerBlocks(PAGE);
  assert.deepEqual(b.map(x => x.kind), ['h', 'p', 'p', 'h', 'li', 'li', 'row', 'row', 'h', 'p', 'h']);
  assert.equal(b[0].level, 1); assert.equal(b[3].level, 2); assert.equal(b[10].level, 4);
  assert.deepEqual(b[6].cells, ['Role', 'Actor']); assert.equal(b[4].text, 'Timothée Chalamet as Paul');
  assert.equal(new Set(b.filter(x => x.kind === 'h').map(x => x.id)).size, 4);
  for (const bad of [null, undefined, 5, {}]) assert.deepEqual(R.readerBlocks(bad), []);
  assert.equal(R.readerBlocks(Array.from({ length: 50 }, (_, i) => 'line ' + i).join('\n'), 10).length, 10);
  assert.equal(R.readerBlocks('#hashtag without space\n-dash').map(x => x.kind).join(), 'p,p');
});
test('Reading time counts real words only and is never zero', () => {
  assert.deepEqual(R.readingStats(R.readerBlocks('one two three | — | 4')), { words: 4, minutes: 1 });
  const long = R.readerBlocks(Array.from({ length: 1100 }, () => 'word').join(' '));
  assert.deepEqual(R.readingStats(long), { words: 1100, minutes: 5 }); assert.equal(R.readingStats([]).minutes, 1);
});
test('The contents list keeps levels 1–3 with stable ids', () => {
  const o = R.readerOutline(R.readerBlocks(PAGE));
  assert.deepEqual(o.map(x => [x.level, x.text]), [[1, 'Dune: Part Two'], [2, 'Cast'], [3, 'İstanbul gösterimi']]);
  assert(o.every(x => x.id.startsWith('reader-h-')));
});
test('Find ignores case, accents and the Turkish dotted/dotless i, and maps back to the original letters', () => {
  const b = R.readerBlocks(PAGE);
  const hits = R.findInBlocks(b, 'istanbul');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map(h => R.blockText(b[h.block]).slice(h.start, h.end)), ['İstanbul', 'İSTANBUL']);
  assert.deepEqual(R.findInBlocks(b, 'TIMOTHEE').map(h => R.blockText(b[h.block]).slice(h.start, h.end)), ['Timothée', 'Timothée']);
  assert.deepEqual(R.findInBlocks(b, 'issiz').map(h => R.blockText(b[h.block]).slice(h.start, h.end)), ['ıssız']);
  assert.deepEqual(R.findInBlocks(b, 'chani').map(h => h.block), [1, 2, 5]);
  assert.deepEqual(R.findInBlocks(b, '   '), []); assert.deepEqual(R.findInBlocks(b, null), []);
  assert.equal(R.findInBlocks(R.readerBlocks('a a a a a a'), 'a', 3).length, 3);
  const emoji = R.readerBlocks('x 😀 ﬁne y'); const e = R.findInBlocks(emoji, 'fine');
  assert.equal(R.blockText(emoji[0]).slice(e[0].start, e[0].end), 'ﬁne');
});
test('Highlights cut the text without losing a character and skip overlapping or stale hits', () => {
  const text = 'Paul and Paul';
  const parts = R.splitHighlights(text, [{ block: 0, start: 0, end: 4 }, { block: 0, start: 2, end: 6 }, { block: 0, start: 9, end: 13 }, { block: 0, start: 50, end: 60 }], 7);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.deepEqual(parts.filter(p => p.hit !== null).map(p => [p.text, p.hit]), [['Paul', 7], ['Paul', 9]]);
  assert.deepEqual(R.splitHighlights('abc', []), [{ text: 'abc', hit: null }]);
});
test('Reader preferences are cleaned and the size steps stay in range', () => {
  assert.deepEqual(R.cleanReaderPrefs(null), R.DEFAULT_READER_PREFS);
  assert.deepEqual(R.cleanReaderPrefs({ theme: 'sepia', size: 22, font: 'sans', width: 'wide' }), { theme: 'sepia', size: 22, font: 'sans', width: 'wide' });
  assert.deepEqual(R.cleanReaderPrefs({ theme: 'evil', size: 999, font: 1, width: [] }), R.DEFAULT_READER_PREFS);
  assert.equal(R.nextReaderSize(26, 1), 26); assert.equal(R.nextReaderSize(14, -1), 14); assert.equal(R.nextReaderSize(18, 1), 20); assert.equal(R.nextReaderSize(3, 1), 20);
});
test('Per-site zoom: hosts without www, 1 is never stored, oldest sites fall off, bad storage is ignored', () => {
  assert.equal(Z.siteKey('https://www.Example.com/a'), 'example.com'); assert.equal(Z.siteKey('file:///x'), null); assert.equal(Z.siteKey(5), null);
  let m = Z.rememberZoom({}, 'https://www.example.com/a', 1.25); assert.deepEqual({ ...m }, { 'example.com': 1.25 });
  assert.equal(Z.zoomFor(m, 'https://example.com/other'), 1.25); assert.equal(Z.zoomFor(m, 'https://other.org/'), 1);
  assert.equal(Z.rememberZoom(m, 'https://example.com/', 1.25), m);
  m = Z.rememberZoom(m, 'https://example.com/', 1); assert.deepEqual({ ...m }, {});
  assert.equal(Z.rememberZoom(m, 'javascript:x', 2), m); assert.equal(Z.rememberZoom(m, 'https://a.org', 9), m);
  let big = {}; for (let i = 0; i < Z.MAX_ZOOM_SITES + 15; i++) big = Z.rememberZoom(big, `https://s${i}.example/`, 1.5);
  assert.equal(Object.keys(big).length, Z.MAX_ZOOM_SITES); assert.equal(Z.zoomFor(big, 'https://s0.example/'), 1); assert.equal(Z.zoomFor(big, `https://s${Z.MAX_ZOOM_SITES + 14}.example/`), 1.5);
  assert.deepEqual({ ...Z.cleanZoomMap({ 'a.com': 1.5, 'b.com': 1, 'c.com': 99, 'bad host': 2, __proto__: 2 }) }, { 'a.com': 1.5 });
  for (const bad of [null, 'x', [1, 2], 5]) assert.deepEqual({ ...Z.cleanZoomMap(bad) }, {});
  assert.equal(Z.zoomFor(Z.cleanZoomMap({}), 'https://toString.com/'), 1); assert.equal(Z.zoomFor({}, 'https://constructor/'), 1);
});
test('Browser.tsx wires the reading view, F9, per-site zoom and continue-reading; the reader hides the page like a dialog', () => {
  const src = read('src/Browser.tsx'), reader = read('src/BrowserReader.tsx'), start = read('src/BrowserStart.tsx');
  for (const needle of ['./BrowserReader', './browserZoomMemory', 'lunaWebSiteZoom', 'rememberZoom', 'zoomFor', 'case "f9"', 'openReadingFrom']) assert(src.includes(needle), needle);
  assert(start.includes('openReading') && start.includes('props.reading'), 'continue reading remains connected');
  for (const needle of ['role="dialog"', 'aria-modal="true"', 'readerBlocks', 'findInBlocks', 'splitHighlights', 'lunaWebReaderPrefs', '<mark', 'onSave']) assert(reader.includes(needle), needle);
  assert(src.includes('[role="dialog"]:not(.browser-tools-pop)'), 'dialogs cover native content');
  const css = read('src/Browser.css'); for (const selector of ['.browser-reader', '.reader-sepia', '.reader-paper']) assert(css.includes(selector), selector);
});
let passed = 0, failed = 0;
for (const t of tests) { try { t.run(); passed++; console.log('PASS ' + t.name); } catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.message || e)); } }
console.log(JSON.stringify({ total: tests.length, passed, failed })); process.exit(failed ? 1 : 0);
