// Behaviour checks for the Browser / Film pass: Letterboxd change summary, episode order, resume bookkeeping,
// the page-reading request. Run: npm run test:film-browser
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, env = {}) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'module', 'require', ...Object.keys(env), js)(m.exports, m, () => ({}), ...Object.values(env));
  return m.exports;
}
const extras = load('src/extrasModel.ts'), play = load('src/playbackModel.ts'), web = load('src/browserModel.ts');
const tools = load('src/libraryTools.ts');
const mem = {}; const lib = load('src/library.ts', { localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } }, window: { addEventListener() {}, dispatchEvent() {} }, CustomEvent: class {}, Event: class {} });
const tests = []; const test = (name, run) => tests.push({ name, run });
const tr = (t) => t.trim().toLocaleLowerCase('tr');

// ---- Letterboxd change summary ----
test('A work that only gained or lost its year is not reported as added and missing', () => {
  assert.deepEqual(extras.listDelta([{ title: 'Heat', year: '1995' }], [{ title: 'Heat' }]), { added: [], removed: [] });
  assert.deepEqual(extras.listDelta([{ title: 'Heat' }], [{ title: 'Heat', year: '1995' }]), { added: [], removed: [] });
});
test('Different years stay different works, in both directions', () => {
  const d = extras.listDelta([{ title: 'Dune', year: '1984' }, { title: 'Dune', year: '2021' }], [{ title: 'Dune', year: '2021' }]);
  assert.deepEqual(d.removed.map((x) => x.year), ['1984']); assert.equal(d.added.length, 0);
  const e = extras.listDelta([{ title: 'Dune', year: '1984' }], [{ title: 'Dune', year: '1984' }, { title: 'Dune', year: '2021' }]);
  assert.deepEqual(e.added.map((x) => x.year), ['2021']); assert.equal(e.removed.length, 0);
});
test('The caller title key is used (Turkish dotted and dotless i)', () => {
  const a = [{ title: 'IŞIK', year: '2000' }], b = [{ title: 'ışık', year: '2000' }];
  // The host can itself use Turkish; compare explicit keys rather than assuming an English host.
  assert.equal(extras.listDelta(a, b, t => t.trim().toLocaleLowerCase('en')).added.length, 1);
  assert.deepEqual(extras.listDelta([{title:'A-B'}], [{title:'AB'}], t=>t.replace(/-/g,'')), {added:[],removed:[]});
  assert.deepEqual(extras.listDelta(a, b, tr), { added: [], removed: [] });
});
test('A rewatched film listed twice in a read counts once', () => {
  const d = extras.listDelta([], [{ title: 'Heat', year: '1995' }, { title: 'Heat', year: '1995' }, { title: 'Ran', year: '1985' }]);
  assert.deepEqual(d.added.map((x) => x.title), ['Heat', 'Ran']);
});
test('Removed and added entries are listed once each; an unchanged read is empty', () => {
  const before = [{ title: 'A', year: '2000' }, { title: 'B', year: '2001' }];
  const d = extras.listDelta(before, [{ title: 'A', year: '2000' }, { title: 'C', year: '2002' }]);
  assert.deepEqual([d.added.map((x) => x.title), d.removed.map((x) => x.title)], [['C'], ['B']]);
  assert.deepEqual(extras.listDelta(before, [...before].reverse()), { added: [], removed: [] });
});
test('A previous read without years does not pretend a film vanished', () => {
  const d = extras.listDelta([{ title: 'Dune' }], [{ title: 'Dune', year: '1984' }, { title: 'Dune', year: '2021' }]);
  assert.equal(d.removed.length, 0);
});

// ---- Resume bookkeeping ----
test('Nothing is recorded for a file until its own resume point has been read', () => {
  assert.equal(play.recordableProgress('B.mkv', 'B', 3000, 3600, 'A.mkv', false), null, "A's numbers must never reach B");
  assert.equal(play.recordableProgress('B.mkv', 'B', 0, 5400, null, false), null);
  assert.deepEqual(play.recordableProgress('B.mkv', 'B', 12, 5400, 'B.mkv', false), { path: 'B.mkv', title: 'B', time: 12, duration: 5400 });
});
test('Music, a missing path, an unknown duration and a bad time are handled', () => {
  assert.equal(play.recordableProgress('B.mkv', 'B', 5, 100, 'B.mkv', true), null);
  assert.equal(play.recordableProgress(null, '', 5, 100, null, false), null);
  assert.equal(play.recordableProgress('B.mkv', 'B', 5, 0, 'B.mkv', false), null);
  assert.equal(play.recordableProgress('B.mkv', 'B', NaN, 100, 'B.mkv', false).time, 0);
});
test('Leaving a file writes its own last place, once, and never undoes a removal', () => {
  const last = { path: 'A.mkv', title: 'A', time: 3333, duration: 3600 };
  assert.equal(play.leftBehind('A.mkv', 'B.mkv', last, true), last);
  assert.equal(play.leftBehind('A.mkv', null, last, true), last);
  assert.equal(play.leftBehind('A.mkv', 'A.mkv', last, true), null, 'same file');
  assert.equal(play.leftBehind('A.mkv', 'B.mkv', { ...last, path: 'Z.mkv' }, true), null, 'last place belongs to another file');
  assert.equal(play.leftBehind('A.mkv', 'B.mkv', last, false), null, 'taken off Continue watching meanwhile');
  assert.equal(play.leftBehind(null, 'B.mkv', last, true), null);
});
test('A switch from A to B never produces a record for B with A numbers', () => {
  let ready = 'A.mkv', last = null; const log = [];
  const frame = (p, time, dur) => { const r = play.recordableProgress(p, p, time, dur, ready, false); if (r) last = r; log.push(r); };
  frame('A.mkv', 3500, 3600);
  ready = null; frame('B.mkv', 3500, 3600);            // path changed first, numbers are still A's
  assert.equal(log.at(-1), null);
  ready = 'B.mkv'; frame('B.mkv', 0, 5400);
  assert.deepEqual(log.at(-1), { path: 'B.mkv', title: 'B.mkv', time: 0, duration: 5400 });
  assert.equal(log.filter((r) => r && r.path === 'B.mkv' && r.duration === 3600).length, 0);
});

// ---- Episodes ----
const F = (s, e, p) => ({ path: p, season: s, episode: e });
test('Next and previous episode skip a second copy of the same episode', () => {
  const files = [F(1, 1, 'e1'), F(1, 2, 'e2-720'), F(1, 2, 'e2-1080'), F(1, 3, 'e3')];
  assert.equal(play.episodeNeighbor(files, 'e2-720', 1).path, 'e3');
  assert.equal(play.episodeNeighbor(files, 'e2-1080', -1).path, 'e1');
  assert.equal(play.episodeNeighbor(files, 'e1', -1), undefined);
  assert.equal(play.episodeNeighbor(files, 'e3', 1), undefined);
  assert.equal(play.episodeNeighbor(files, 'missing', 1), undefined);
});
test('Season boundaries and numberless files are single steps', () => {
  const seasons = [F(1, 2, 'a'), F(1, 3, 'b'), F(2, 1, 'c'), F(2, 2, 'd')];
  assert.equal(play.episodeNeighbor(seasons, 'b', 1).path, 'c');
  assert.equal(play.episodeNeighbor([F(1, 2, 'x'), F(2, 2, 'y')], 'x', 1).path, 'y', 'same number in another season is another episode');
  const plain = [{ path: 'p1' }, { path: 'p2' }, { path: 'p3' }];
  assert.equal(play.episodeNeighbor(plain, 'p1', 1).path, 'p2');
});
test('File names sort in natural order', () => {
  assert.deepEqual(['Show 10.mkv', 'Show 2.mkv', 'Show 1.mkv'].sort(play.naturalPath), ['Show 1.mkv', 'Show 2.mkv', 'Show 10.mkv']);
});

test('Series files: an explicit episode marker beats a number inside the episode title', () => {
  const ep = (p) => lib.parseInSeries('D:\\Diziler\\' + p, 'D:\\Diziler');
  assert.equal(ep('Show\\Season 2\\Bölüm 5 - Part 2.mkv').episode, 5);
  assert.equal(ep('Show\\Season 2\\Bölüm 5 - Part 2.mkv').season, 2);
  assert.equal(ep('Show\\Episode 12 - The 100 Days.mkv').episode, 12);
  assert.equal(ep('Show\\EP.07 720p.mkv').episode, 7);
  assert.equal(ep('Show\\BÖLÜM 9 Final 2.mkv').episode, 9);
});
test('Series files: a leading number wins, and plain names keep the old last-number rule', () => {
  const ep = (p) => lib.parseInSeries('D:\\Diziler\\' + p, 'D:\\Diziler');
  assert.equal(ep('Show\\05 - Chapter 12.mkv').episode, 5);
  assert.equal(ep('Show\\03 - Pilot.mkv').episode, 3);
  assert.equal(ep('Show\\Show 2 - 05.mkv').episode, 5);
  assert.equal(ep('Show\\Pilot 3.mkv').episode, 3);
  assert.equal(ep('Show\\Pilot.mkv').episode, undefined);
  assert.equal(ep('Show\\Step 5 of life.mkv').episode, 5, 'a word ending in "ep" is not a marker');
});
test('SxxExx names are untouched by the series-folder rule', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(lib.parseInSeries('D:\\Diziler\\Show\\Show.S02E05.1080p.mkv', 'D:\\Diziler'))), { kind: 'tv', title: 'Show', season: 2, episode: 5 });
});

// ---- Library search ----
const film = (key, title, extra = {}) => ({ key, parsed: { kind: 'movie', title, year: 2000 }, files: [{ path: key }], meta: null, ...extra });
const found = (items, q) => tools.selectLibrary(items, q, 'az', 'all', '', 'tr').map((i) => i.key);
test('Library search ignores accents and Turkish dotted/dotless i, and keeps the exact match', () => {
  const items = [film('a', 'Işık'), film('b', 'Amélie'), film('c', 'İstanbul'), film('d', 'Ørsted'), film('e', 'Heat')];
  assert.deepEqual(found(items, 'isik'), ['a']);
  assert.deepEqual(found(items, 'ISIK'), ['a']);
  assert.deepEqual(found(items, 'amelie'), ['b']);
  assert.deepEqual(found(items, 'ISTANBUL'), ['c']);
  assert.deepEqual(found(items, 'orsted'), ['d']);
  assert.deepEqual(found(items, 'Işık'), ['a'], 'exact typing still works');
  assert.deepEqual(found(items, 'zzz'), []);
  assert.equal(found(items, '  ').length, 5, 'blank query shows everything');
});
test('Library search also finds actors without accents, and does not change the catalog', () => {
  const meta = { id: 5, kind: 'movie', title: 'Volver', year: '2006', genres: ['Drama'], cast: [{ name: 'Penélope Cruz' }], rating: 7.5 };
  const items = [film('v', 'Volver', { meta }), film('h', 'Heat')];
  const before = JSON.stringify(items);
  assert.deepEqual(found(items, 'penelope'), ['v']);
  assert.equal(JSON.stringify(items), before);
});

// ---- Web page reading ----
test('A page question carries no tools, the page as untrusted data, and a no-video instruction', () => {
  const page = { title: 'T', url: 'https://e.org/a', text: 'hello', truncated: false, capturedAt: 1 };
  const body = { tools: [{ x: 1 }], toolConfig: {}, contents: [{ role: 'user', parts: [{ text: 'old q' }] }, { role: 'model', parts: [{ text: 'old a' }] }, { role: 'user', parts: [{ text: 'q' }] }] };
  const r = web.browserRequest(body, page, 'summarize', 'tr');
  assert.equal(r.tools, undefined); assert.equal(r.toolConfig, undefined);
  const sys = r.systemInstruction.parts[0].text;
  assert.match(sys, /video/); assert.match(sys, /başka bir sayfaya|başka bir sayfa/);
  const last = r.contents.at(-1).parts[0].text;
  assert.match(last, /summarize/); assert.match(last, /ALINTI SONU/); assert.match(last, /"text":"hello"/);
});
// Source guard (not a runtime test): reading the native address must not run page script or need a page URL
test('Source guard: browser_position "url" returns before any page script runs', () => {
  const rs = fs.readFileSync(path.join(root, 'src-tauri/src/browser.rs'), 'utf8');
  const at = rs.indexOf('action=="url"'), compare = rs.indexOf('before.as_str()!=expected_url');
  assert(at > 0 && compare > at, 'url action must come before the expected-URL comparison');
  const branch = rs.slice(at, rs.indexOf('\n', at));
  assert(!/eval/.test(branch), 'the url action must not evaluate script');
});

let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS', t.name); } catch (e) { failed++; console.error('FAIL', t.name, e.stack); } }
console.log(JSON.stringify({ total: tests.length, passed: tests.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
