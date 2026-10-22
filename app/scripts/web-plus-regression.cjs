// Behaviour checks for the Luna Web "plus" pass: search engines and "!" shortcuts, local history and
// suggestions, reading view, play-in-Luna detection, tab drag placement, and the native-side guards.
// Run: npm run test:web-plus
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const cache = new Map();
/** Loads a production TypeScript module with its relative imports (CommonJS, no bundler). */
function load(file) {
  const key = path.normalize(file);
  if (cache.has(key)) return cache.get(key).exports;
  const mod = { exports: {} }; cache.set(key, mod);
  const code = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const dir = path.dirname(file);
  new Function('exports', 'module', 'require', code)(mod.exports, mod, spec => {
    if (!spec.startsWith('.')) throw new Error('unexpected import ' + spec);
    return load(path.join(dir, spec.replace(/\.(ts|tsx)$/, '') + '.ts'));
  });
  return mod.exports;
}
const search = load('src/browserSearchModel.ts'), hist = load('src/browserHistoryModel.ts'), rd = load('src/browserReaderModel.ts'), work = load('src/browserWorkspaceModel.ts'), model = load('src/browserModel.ts');
const tests = [], test = (name, run) => tests.push({ name, run });
const google = search.SEARCH_ENGINES[0], ddg = search.searchEngine('duckduckgo');
const DAY = 86_400_000, T0 = Date.UTC(2026, 9, 22, 12, 0, 0);

// ---- search ------------------------------------------------------------------------------------------------
test('Plain words use the chosen engine; addresses stay addresses', () => {
  assert.equal(search.resolveWebInput('dune part two', ddg, false), 'https://duckduckgo.com/?q=dune%20part%20two');
  assert.equal(search.resolveWebInput('dune part two', google, false), 'https://www.google.com/search?q=dune%20part%20two');
  assert.equal(search.resolveWebInput('example.com/film', ddg, false), 'https://example.com/film');
  assert.equal(search.resolveWebInput('https://example.com/a?q=1', ddg, true), 'https://example.com/a?q=1');
  assert.equal(search.resolveWebInput('localhost:8000/a', ddg, true), 'http://localhost:8000/a');
});
test('browserAddress keeps its old default (Google) and rejects the same unsafe input', () => {
  assert.equal(model.browserAddress('hello world'), 'https://www.google.com/search?q=hello%20world');
  for (const bad of ['', 'file:///C:/x', 'javascript:alert(1)', 'https://user:pw@example.com', 'http://127.0.0.1:1420']) assert.throws(() => search.resolveWebInput(bad, ddg, false), bad);
});
test('Bang shortcuts open the site search or the site, in either position', () => {
  assert.equal(search.resolveWebInput('!yt dune trailer', google, false), 'https://www.youtube.com/results?search_query=dune%20trailer');
  assert.equal(search.resolveWebInput('dune trailer !yt', google, false), 'https://www.youtube.com/results?search_query=dune%20trailer');
  assert.equal(search.resolveWebInput('!w Ay', google, true), 'https://tr.wikipedia.org/w/index.php?search=Ay');
  assert.equal(search.resolveWebInput('!w Moon', google, false), 'https://en.wikipedia.org/w/index.php?search=Moon');
  assert.equal(search.resolveWebInput('!lb', google, false), 'https://letterboxd.com/');
  assert.equal(search.resolveWebInput('!YT Dune', google, false), 'https://www.youtube.com/results?search_query=Dune');
  assert.equal(search.resolveWebInput('!1000k suç ve ceza', google, true), 'https://1000kitap.com/ara?q=su%C3%A7%20ve%20ceza');
});
test('Unknown bangs and exclamation marks inside text are plain words', () => {
  assert.equal(search.parseBang('!nonsense x'), null);
  assert.equal(search.parseBang('wow!yt'), null);
  assert.equal(search.parseBang('hello world!'), null);
  assert.equal(search.resolveWebInput('!nonsense x', google, false), 'https://www.google.com/search?q=!nonsense%20x');
});
test('Every bang has a unique key and produces a safe https address', () => {
  const keys = search.BANGS.map(b => b.key); assert.equal(new Set(keys).size, keys.length);
  for (const b of search.BANGS) for (const tr of [true, false]) { for (const u of [b.home(tr), b.search('a b&c=d#e', tr)]) { assert.equal(model.browserAddress(u), u); assert(u.startsWith('https://'), u); } }
  for (const e of search.SEARCH_ENGINES) assert.equal(model.browserAddress(e.search('x&y=1')), e.search('x&y=1'));
});
test('Search words are read back from results pages of every engine and bang site', () => {
  for (const e of search.SEARCH_ENGINES) assert.equal(search.searchedWords(e.search('dune part two')), 'dune part two', e.id);
  assert.equal(search.searchedWords('https://www.youtube.com/results?search_query=lofi%20beats'), 'lofi beats');
  assert.equal(search.searchedWords('https://www.themoviedb.org/search?query=heat'), 'heat');
  assert.equal(search.searchedWords('https://tr.wikipedia.org/w/index.php?search=Ay'), 'Ay');
  assert.equal(search.searchedWords('https://example.com/?q=x'), null);
  assert.equal(search.searchedWords('https://www.google.com/maps'), null);
  assert.equal(search.searchedWords('not a url'), null);
});
test('An unknown stored engine falls back to Google', () => { assert.equal(search.searchEngine('nope').id, 'google'); assert.equal(search.searchEngine(null).id, 'google'); });

// ---- history -----------------------------------------------------------------------------------------------
test('A visit is added first, repeated loads raise the count only after 30 seconds', () => {
  let rows = hist.recordVisit([], 'https://a.example/x', 'Page A', T0);
  assert.deepEqual(rows.map(r => [r.url, r.title, r.count]), [['https://a.example/x', 'Page A', 1]]);
  rows = hist.recordVisit(rows, 'https://a.example/x', 'Page A', T0 + 5_000); assert.equal(rows[0].count, 1);
  rows = hist.recordVisit(rows, 'https://b.example/', '', T0 + 6_000); assert.equal(rows[0].title, 'b.example');
  rows = hist.recordVisit(rows, 'https://a.example/x', 'Page A', T0 + 90_000);
  assert.deepEqual(rows.map(r => r.url), ['https://a.example/x', 'https://b.example/']); assert.equal(rows[0].count, 2); assert.equal(rows[0].first, T0);
});
test('History is capped and refuses non-web or credentialed addresses', () => {
  let rows = []; for (let i = 0; i < 12; i++) rows = hist.recordVisit(rows, 'https://s.example/' + i, 't' + i, T0 + i * 1000, 10);
  assert.equal(rows.length, 10); assert.equal(rows[0].url, 'https://s.example/11');
  for (const bad of ['file:///C:/x', 'javascript:1', 'https://u:p@h.example/', 'about:blank', 'tauri://localhost']) assert.deepEqual(hist.recordVisit([], bad, 'x', T0), []);
});
test('A late title renames the newest visit; a failed load takes the visit back out', () => {
  let rows = hist.recordVisit([], 'https://a.example/', '', T0);
  rows = hist.retitleVisit(rows, 'https://a.example/', '  Real   title '); assert.equal(rows[0].title, 'Real title');
  assert.equal(hist.retitleVisit(rows, 'https://a.example/', 'Real title'), rows);
  assert.deepEqual(hist.forgetFailedVisit(rows, 'https://a.example/', T0 + 10_000), []);
  assert.equal(hist.forgetFailedVisit(rows, 'https://a.example/', T0 + 120_000), rows);
  const twice = hist.recordVisit(rows, 'https://a.example/', 'Real title', T0 + 100_000);
  assert.equal(hist.forgetFailedVisit(twice, 'https://a.example/', T0 + 101_000)[0].count, 1);
});
test('A damaged history keeps its good rows and never throws', () => {
  const good = { url: 'https://a.example/', title: 'A', at: 2, first: 1, count: 1 };
  assert.deepEqual(hist.readVisits(JSON.stringify([good, { url: 5 }, null, { ...good, url: 'file:///x' }, { ...good, count: 0 }, { ...good, first: 9 }])), [good]);
  for (const raw of [null, '', '{', '{}', '"x"', 'null']) assert.deepEqual(hist.readVisits(raw), []);
});
test('Removing by address, by host and by time keeps the rest', () => {
  let rows = ['https://a.example/1', 'https://a.example/2', 'https://b.example/'].reduce((r, u, i) => hist.recordVisit(r, u, u, T0 + i * 100_000), []);
  assert.equal(hist.removeVisit(rows, 'https://a.example/1').length, 2);
  assert.deepEqual(hist.removeSite(rows, 'a.example').map(r => r.url), ['https://b.example/']);
  assert.deepEqual(hist.clearVisitsSince(rows, T0 + 150_000).map(r => r.url), ['https://a.example/2', 'https://a.example/1'].filter(u => rows.find(r => r.url === u).at < T0 + 150_000));
  assert.deepEqual(hist.clearVisitsSince(rows, 0), []);
});
test('Frecency: often and recent beats once and old; results pages are not top sites; hidden hosts stay hidden', () => {
  let rows = [];
  for (let d = 0; d < 6; d++) rows = hist.recordVisit(rows, 'https://often.example/', 'Often', T0 - d * 3_600_000 * 2);
  rows = hist.recordVisit(rows, 'https://old.example/', 'Old', T0 - 120 * DAY);
  rows = hist.recordVisit(rows, 'https://www.google.com/search?q=dune', 'dune', T0);
  rows = hist.recordVisit(rows, 'https://hide.example/', 'Hide me', T0 - 1000);
  const top = hist.topSites(rows, T0, 8, ['hide.example']);
  assert.deepEqual(top.map(t => t.host), ['often.example', 'old.example']);
  assert(hist.frecency(rows.find(r => r.url === 'https://often.example/'), T0) > hist.frecency(rows.find(r => r.url === 'https://old.example/'), T0));
});
test('History search ignores accents and Turkish dotless i', () => {
  let rows = hist.recordVisit([], 'https://ornek.example/', 'Işık ve Şiir', T0);
  rows = hist.recordVisit(rows, 'https://other.example/', 'Other', T0 + 1);
  assert.equal(hist.searchVisits(rows, 'isik siir').length, 1);
  assert.equal(hist.searchVisits(rows, 'IŞIK').length, 1);
  assert.equal(hist.searchVisits(rows, ' ').length, 2);
  assert.equal(hist.searchVisits(rows, 'nothing here').length, 0);
});
test('History groups by local day: Today, Yesterday, then dated groups, newest first', () => {
  const now = new Date(2026, 9, 22, 15, 0).getTime(), at = (d, h) => new Date(2026, 9, d, h).getTime();
  let rows = []; for (const [d, h] of [[22, 9], [22, 14], [21, 20], [10, 8]]) rows = hist.recordVisit(rows, `https://d${d}h${h}.example/`, 't', at(d, h));
  const groups = hist.groupVisitsByDay(rows, now, false);
  assert.deepEqual(groups.map(g => [g.label, g.rows.length]).slice(0, 2), [['Today', 2], ['Yesterday', 1]]); assert.equal(groups.length, 3);
  assert(groups[0].rows[0].at > groups[0].rows[1].at);
  assert.equal(hist.groupVisitsByDay(rows, now, true)[0].label, 'Bugün');
});
test('Suggestions: open tabs first, then favourites, history, and the search itself; no address twice', () => {
  let rows = hist.recordVisit([], 'https://dune.example/', 'Dune fan page', T0); rows = hist.recordVisit(rows, 'https://other.example/dune', 'Something', T0 + 1);
  rows = hist.recordVisit(rows, 'https://www.google.com/search?q=dune%20part%20two', 'dune part two - Google', T0 + 2);
  const out = hist.webSuggestions('dune', { tabs: [{ id: 7, title: 'Dune wiki', url: 'https://wiki.example/dune' }], bookmarks: [{ title: 'Dune book', url: 'https://dune.example/' }], history: rows }, google, T0, false);
  assert.equal(out[0].kind, 'tab'); assert.equal(out[1].kind, 'bookmark');
  assert(out.some(r => r.kind === 'history' && r.url === 'https://other.example/dune'));
  assert(!out.some(r => r.kind === 'history' && r.url === 'https://dune.example/'), 'a favourite is not repeated as history');
  assert(!out.some(r => r.kind === 'history' && r.url.includes('google.com/search')), 'results pages are not offered as pages');
  const searchRows = out.filter(r => r.kind === 'search'); assert.equal(searchRows[0].query, 'dune'); assert(searchRows.some(r => r.query === 'dune part two'));
  const urls = out.filter(r => r.url).map(r => r.url); assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(hist.webSuggestions('  ', { tabs: [], bookmarks: [], history: rows }, google, T0, false), []);
});
test('Suggestions: a start-of-host match outranks a mere substring; bang hints list matching keys', () => {
  let rows = hist.recordVisit([], 'https://notgit.example/', 'x', T0); rows = hist.recordVisit(rows, 'https://github.com/', 'GitHub', T0 + 1);
  const out = hist.webSuggestions('git', { tabs: [], bookmarks: [], history: rows }, google, T0, false);
  assert.equal(out[0].url, 'https://github.com/');
  const bangs = hist.webSuggestions('!y', { tabs: [], bookmarks: [], history: [] }, google, T0, false); assert.deepEqual(bangs.map(b => b.key), ['yt']);
  const typed = hist.webSuggestions('!w ay', { tabs: [], bookmarks: [], history: [] }, google, T0, true); assert.equal(typed[0].kind, 'bang'); assert.equal(typed[0].query, 'ay');
});
test('Session and greeting helpers', () => {
  assert.deepEqual(hist.readSession(JSON.stringify([{ title: 'A', url: 'https://a.example/' }, { title: 'bad', url: 'file:///x' }])), [{ title: 'A', url: 'https://a.example/' }]);
  assert.deepEqual(hist.readSession('{'), []); assert.deepEqual(hist.readSession(null), []);
  assert.equal(hist.greeting(7, false), 'Good morning'); assert.equal(hist.greeting(14, true), 'İyi günler'); assert.equal(hist.greeting(20, false), 'Good evening'); assert.equal(hist.greeting(2, true), 'İyi geceler');
  assert.equal(hist.siteHue('a.example'), hist.siteHue('a.example')); assert(hist.siteHue('zz.example') < 360);
});

test('Suggestions stay fast with a full history (1000 pages)', () => {
  let rows = []; for (let i = 0; i < 1000; i++) rows = hist.recordVisit(rows, `https://site${i % 97}.example/page/${i}?q=${i}`, 'Title number ' + i + ' İşte ışık', T0 + i * 1000);
  const t = Date.now(); let out; for (let i = 0; i < 20; i++) out = hist.webSuggestions('site 5 number', { tabs: [], bookmarks: [], history: rows }, google, T0 + 2e6, false);
  const per = (Date.now() - t) / 20; assert(per < 60, 'one lookup took ' + per.toFixed(1) + ' ms'); assert(out.length > 0 && out.length <= 8);
  const t2 = Date.now(); hist.topSites(rows, T0 + 2e6, 8, []); hist.searchVisits(rows, 'ışık number'); assert(Date.now() - t2 < 250);
});

// ---- reading view ------------------------------------------------------------------------------------------
test('Reader blocks follow the page reader format; the title heading is not repeated', () => {
  const text = '# Big title\nIntro paragraph.\n## Part\n- first\n- second\nName | Role | Year\nPlain closing line.';
  const blocks = rd.readerBlocks(text, 'Big title');
  assert.deepEqual(blocks.map(b => b.kind), ['para', 'heading', 'item', 'item', 'row', 'para']);
  assert.deepEqual(blocks[3 - 1].text, 'first'); assert.deepEqual(blocks[4].cells, ['Name', 'Role', 'Year']);
  assert.equal(rd.readerBlocks(text, 'Something else')[0].kind, 'heading');
  assert.deepEqual(rd.readerBlocks('', 'x'), []); assert.deepEqual(rd.readerBlocks('a | ', ''), [{ kind: 'para', text: 'a |' }]);
});
test('Reading time counts words in any script and is at least one minute', () => {
  assert.equal(rd.readingStats('one two three').minutes, 1);
  assert.equal(rd.readingStats('word '.repeat(660)).minutes, 3); assert.equal(rd.readingStats('word '.repeat(660)).words, 660);
  assert.equal(rd.readingStats('Işık şiir çalışma über naïve').words, 5); assert.equal(rd.readingStats('').words, 0);
});
test('Reader preferences are clamped and fall back safely', () => {
  assert.deepEqual(rd.readReaderPrefs(null), rd.defaultReaderPrefs); assert.deepEqual(rd.readReaderPrefs('{'), rd.defaultReaderPrefs);
  const p = rd.readReaderPrefs(JSON.stringify({ size: 99, width: 'wide', theme: 'neon', font: 'sans' })); assert.equal(p.size, 28); assert.equal(p.width, 'wide'); assert.equal(p.theme, 'luna'); assert.equal(p.font, 'sans');
  assert.equal(rd.readReaderPrefs(JSON.stringify({ size: 3 })).size, 14); assert.equal(rd.readReaderPrefs(JSON.stringify({ size: 'x' })).size, 18);
});
test('Plain reader text keeps list marks and joins table cells', () => {
  assert.equal(rd.readerPlainText(rd.readerBlocks('Hello\n- item\nA | B', '')), 'Hello\n\n• item\n\nA · B');
});

// ---- play in Luna and address display ----------------------------------------------------------------------
test('Only real video, audio and stream pages offer "Play in Luna"', () => {
  const kind = rd.playableInLuna;
  assert.equal(kind('https://www.youtube.com/watch?v=abc123xyz'), 'video'); assert.equal(kind('https://youtu.be/abc123xyz'), 'video'); assert.equal(kind('https://www.youtube.com/shorts/abc123xyz'), 'video');
  assert.equal(kind('https://www.youtube.com/'), null); assert.equal(kind('https://www.youtube.com/results?search_query=x'), null); assert.equal(kind('https://www.youtube.com/watch'), null);
  assert.equal(kind('https://vimeo.com/123456789'), 'video'); assert.equal(kind('https://vimeo.com/'), null);
  assert.equal(kind('https://www.twitch.tv/somechannel'), 'stream'); assert.equal(kind('https://www.twitch.tv/directory'), null); assert.equal(kind('https://www.twitch.tv/videos/123456'), 'video');
  assert.equal(kind('https://soundcloud.com/artist/track'), 'audio'); assert.equal(kind('https://soundcloud.com/discover'), null);
  assert.equal(kind('https://artist.bandcamp.com/track/song'), 'audio'); assert.equal(kind('https://artist.bandcamp.com/'), null);
  assert.equal(kind('https://cdn.example/film.MKV'), 'video'); assert.equal(kind('https://cdn.example/a.flac'), 'audio'); assert.equal(kind('https://cdn.example/live/index.m3u8'), 'stream');
  for (const none of ['https://example.com/', 'https://example.com/page.html', 'ftp://x/y.mp4', 'file:///a.mp4', 'nonsense', '']) assert.equal(kind(none), null, none);
});
test('Pretty address splits host and path and refuses non-web addresses', () => {
  assert.deepEqual(rd.prettyAddress('https://www.example.com/a/b?x=1#top'), { secure: true, host: 'example.com', rest: '/a/b?x=1#top' });
  assert.deepEqual(rd.prettyAddress('http://localhost:8000/'), { secure: false, host: 'localhost:8000', rest: '' });
  assert.equal(rd.prettyAddress('file:///x'), null); assert.equal(rd.prettyAddress('bad'), null);
  assert(rd.prettyAddress('https://a.example/' + 'x'.repeat(500)).rest.length <= 160);
});

// ---- tabs --------------------------------------------------------------------------------------------------
test('Dragging a tab onto another moves it to that place; nothing else changes', () => {
  const tabs = [1, 2, 3, 4].map(id => ({ id }));
  assert.deepEqual(work.placeWebTab(tabs, 1, 3).map(t => t.id), [2, 3, 1, 4]);
  assert.deepEqual(work.placeWebTab(tabs, 4, 1).map(t => t.id), [4, 1, 2, 3]);
  assert.equal(work.placeWebTab(tabs, 2, 2), tabs); assert.equal(work.placeWebTab(tabs, 9, 1), tabs); assert.equal(work.placeWebTab(tabs, 1, 9), tabs);
  assert.deepEqual(tabs.map(t => t.id), [1, 2, 3, 4]);
});

// ---- native side and interface source guards ---------------------------------------------------------------
const rs = read('src-tauri/src/browser.rs'), libRs = read('src-tauri/src/lib.rs'), tsx = read('src/Browser.tsx'), find = read('src/browserFindPage.js');
test('browser_find is a trusted-caller command, registered, and takes the query only as a JSON literal', () => {
  const body = rs.slice(rs.indexOf('pub async fn browser_find'), rs.indexOf('#[cfg(test)]'));
  assert(body.includes('trusted(&caller)?')); assert(body.includes('find_action(&action)')); assert(body.includes('checked_url('));
  assert(body.includes('serde_json::to_string(&query)')); assert(!/format!\([^)]*\{query\}/.test(body));
  assert(libRs.includes('browser::browser_find,'));
  assert(body.includes('.min(1000)'), 'counts are clamped');
});
test('Native key hook takes only the listed Luna combinations and never AltGr', () => {
  const fn = rs.slice(rs.indexOf('fn page_shortcut'), rs.indexOf('fn page_shortcut') + 1800);
  assert(fn.includes('(true, false, false)') && fn.includes('(true, true, false)')); assert(fn.includes('_ => None'));
  assert(!/0x43\s*=>/.test(fn) && !/0x56\s*=>/.test(fn) && !/0x58\s*=>/.test(fn), 'Ctrl+C / V / X stay with the page');
  const emitted = new Set([...rs.matchAll(/Some\("([a-z0-9+]+)"\)/g)].map(m => m[1]));
  const handled = new Set([...tsx.matchAll(/case "([a-z0-9+]+)"/g)].map(m => m[1]));
  for (const name of emitted) assert(handled.has(name) || /^ctrl\+[1-9]$/.test(name), 'unhandled native shortcut: ' + name);
});
test('Mute is kept natively per tab and a hidden tab is always muted', () => {
  assert(rs.includes('"mute" | "unmute"')); assert(rs.includes('mute(&view, user_muted(id))'));
  const hide = rs.slice(rs.indexOf('"hide" =>'), rs.indexOf('"hide" =>') + 200); assert(hide.includes('mute(&view, true)'));
  assert(rs.includes('set_user_muted(id, false);'), 'closing a tab forgets its mute');
});
test('The find script never writes into the page and never touches fields or scripts', () => {
  assert(!/innerHTML|outerHTML|insertAdjacent|\.value\s*=|document\.write|eval\(|new Function/.test(find));
  assert(find.includes('textarea,input,select')); assert(find.includes('script,style'));
  assert(find.includes('CSS.highlights'));
});
test('Interface code reads no page data for history and keeps it local', () => {
  const histCode = read('src/browserHistoryModel.ts');
  assert(!/fetch\(|XMLHttpRequest|invoke\(|sendBeacon/.test(histCode + read('src/browserSearchModel.ts') + read('src/browserReaderModel.ts')));
  assert(tsx.includes('pausedRef.current'), 'history respects the pause switch');
  assert(!/\bonPage\([^)]*history/i.test(tsx), 'history never reaches the assistant');
});

let failed = 0;
for (const { name, run } of tests) { try { run(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message || e).split('\n').join('\n     ')); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
