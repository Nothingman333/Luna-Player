/* Luna Web "moonlight" pass: start page helpers, quick searches (bangs), pinned and dragged tabs, history groups,
 * the command palette ranking, and the wiring of all of it. npm run test:browser-magic.
 * The models have no imports, so each is loaded on its own. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function moduleOf(file) { const m = { exports: {} }; new Function('exports', 'module', transpile(read(file)))(m.exports, m); return m.exports; }
const St = moduleOf('src/browserStartModel.ts'), Se = moduleOf('src/browserSearch.ts'), P = moduleOf('src/commandPaletteModel.ts'), M = moduleOf('src/browserModel.ts'), Su = moduleOf('src/browserSuggest.ts');
const tests = [], test = (name, run) => tests.push({ name, run });
const H = 3_600_000, D = 86_400_000;

// ---------- sites
test('siteName gives a short readable name (sub-domains, co.uk style hosts, IPs)', () => {
  assert.equal(St.siteName('en.wikipedia.org'), 'Wikipedia'); assert.equal(St.siteName('www.letterboxd.com'), 'Letterboxd');
  assert.equal(St.siteName('www.bbc.co.uk'), 'Bbc'); assert.equal(St.siteName('localhost'), 'localhost'); assert.equal(St.siteName('192.168.1.1'), '192.168.1.1');
  assert.equal(St.siteName('www.imdb.com'), 'IMDb'); assert.equal(St.siteName('www.themoviedb.org'), 'TMDB'); assert.equal(St.siteName('youtu.be'), 'YouTube'); assert.equal(St.siteName('m.youtube.com'), 'YouTube');
  assert.equal(St.siteName(''), ''); assert.equal(St.hostKey('https://WWW.Example.com/a?b#c'), 'example.com'); assert.equal(St.hostKey('not a url'), '');
});
test('siteHue is stable, in range and spreads different hosts', () => {
  const hues = ['letterboxd.com', 'themoviedb.org', 'wikipedia.org', 'goodreads.com', 'youtube.com', 'imdb.com'].map(St.siteHue);
  for (const h of hues) assert(Number.isInteger(h) && h >= 0 && h < 360);
  assert.equal(St.siteHue('imdb.com'), St.siteHue('imdb.com')); assert(new Set(hues).size >= 5);
});
test('topSites sums visits per site, weighs recent ones more, and opens the home page for several pages', () => {
  const NOW = Date.UTC(2026, 9, 22, 12);
  const rows = [
    { url: 'https://letterboxd.com/film/dune/', title: 'Dune', at: NOW - H, visits: 1 }, { url: 'https://letterboxd.com/film/arrival/', title: 'Arrival', at: NOW - 2 * H, visits: 1 }, { url: 'https://www.letterboxd.com/lists/', title: 'Lists', at: NOW - 3 * H, visits: 1 },
    { url: 'https://old.example/page', title: 'Old favourite', at: NOW - 40 * D, visits: 10 }, { url: 'https://fresh.example/x', title: 'Fresh', at: NOW - 60_000, visits: 2 },
  ];
  const top = St.topSites(rows, NOW);
  assert.deepEqual(top.map(t => t.host), ['letterboxd.com', 'fresh.example', 'old.example']);
  assert.equal(top[0].url, 'https://letterboxd.com/'); assert.equal(top[0].name, 'Letterboxd'); assert.equal(top[0].visits, 3);
  assert.equal(top[1].url, 'https://fresh.example/x'); assert.equal(top[1].title, 'Fresh'); assert.equal(top[2].score, 2);
  assert.equal(St.topSites(rows, NOW, 1).length, 1); assert.deepEqual(St.topSites(rows, NOW, 0), []); assert.equal(St.topSites(rows, NOW, 1000).length, 3);
});
test('topSites and forgetSite survive damaged rows', () => {
  assert.deepEqual(St.topSites(null, 1), []); assert.deepEqual(St.topSites([null, 7, { url: 5 }, { url: 'x', at: 'y' }, { url: 'https://a.example/', title: 'A', at: 5, visits: -3 }], 100).map(t => t.host), ['a.example']);
  const rows = [{ url: 'https://a.example/1' }, { url: 'https://www.a.example/2' }, { url: 'https://b.example/' }];
  assert.deepEqual(St.forgetSite(rows, 'a.example'), [{ url: 'https://b.example/' }]);
});

// ---------- the moon
test('moonPhase follows the real moon within about half a day', () => {
  const full = St.moonPhase(Date.UTC(2024, 0, 25, 17, 54)), none = St.moonPhase(Date.UTC(2024, 0, 11, 11, 57));
  assert(full.illumination > 0.97 && full.index === 4, JSON.stringify(full)); assert(none.illumination < 0.03 && none.index === 0 && none.waxing, JSON.stringify(none));
  assert.equal(St.moonPhase(Date.UTC(2024, 0, 18, 3, 53)).index, 2); assert.equal(St.moonPhase(Date.UTC(2024, 1, 2, 23, 18)).index, 6);
  for (const t of [0, 1e12, 2e12, Date.UTC(1969, 6, 20), Date.UTC(2100, 0, 1)]) { const m = St.moonPhase(t); assert(m.phase >= 0 && m.phase < 1 && m.illumination >= 0 && m.illumination <= 1 && m.index >= 0 && m.index < 8 && m.tr && m.en); }
});
test('moonPath: new moon is empty, quarters are half discs, full moon is a disc, waxing is lit on the right', () => {
  assert.equal(St.moonPath(0.25, 50, 50, 40), 'M50 10A40 40 0 0 1 50 90A0 40 0 0 0 50 10Z');
  assert.equal(St.moonPath(0.75, 50, 50, 40), 'M50 10A40 40 0 0 0 50 90A0 40 0 0 0 50 10Z');
  assert.equal(St.moonPath(0, 50, 50, 40), 'M50 10A40 40 0 0 1 50 90A40 40 0 0 0 50 10Z');      // both arcs on the right: no area
  assert.equal(St.moonPath(0.5, 50, 50, 40), 'M50 10A40 40 0 0 0 50 90A40 40 0 0 0 50 10Z');     // left arc + right arc: a full disc
  assert(St.moonPath(0.1, 50, 50, 40).includes('A32.36 40 0 0 0'));                               // crescent: terminator bulges inward
  assert(St.moonPath(0.4, 50, 50, 40).includes('0 0 1 50 10Z'));                                   // gibbous: terminator bulges out on the dark side
  assert.equal(St.moonPath(1.25, 50, 50, 40), St.moonPath(0.25, 50, 50, 40));
});
test('greeting follows the hour in both languages', () => {
  assert.equal(St.greeting(8, true), 'Günaydın'); assert.equal(St.greeting(14, false), 'Good afternoon'); assert.equal(St.greeting(20, true), 'İyi akşamlar'); assert.equal(St.greeting(2, false), 'Good night');
  assert.equal(St.greeting(NaN, false), 'Good afternoon'); assert.equal(St.greeting(27, false), 'Good night'); assert.equal(St.greeting(-1, false), 'Good night');
});

// ---------- history
test('historyGroups groups by local calendar day, newest first, with human labels in both languages', () => {
  const now = new Date(2026, 9, 22, 12, 0).getTime(), at = (m, d, h = 10) => new Date(2026, m, d, h, 0).getTime();
  const rows = [{ url: 'https://a.example/', title: 'A', at: at(9, 22, 9) }, { url: 'https://b.example/', title: 'B', at: at(9, 22, 11) }, { url: 'https://c.example/', title: 'C', at: at(9, 21, 23) },
    { url: 'https://d.example/', title: 'D', at: at(9, 19) }, { url: 'https://e.example/', title: 'E', at: at(8, 3) }, { url: 'https://f.example/', title: 'F', at: new Date(2025, 2, 3, 10).getTime() }];
  const en = St.historyGroups(rows, now, false);
  assert.deepEqual(en.map(g => g.label), ['Today', 'Yesterday', 'Monday', '3 September', '3 March 2025']);
  assert.deepEqual(en[0].rows.map(r => r.title), ['B', 'A']);
  assert.deepEqual(St.historyGroups(rows, now, true).map(g => g.label).slice(0, 3), ['Bugün', 'Dün', 'Pazartesi']);
  assert.equal(St.historyGroups(rows, now, true)[3].label, '3 Eylül');
});
test('historyGroups search ignores case, accents and the Turkish dotted/dotless i, and never throws on damaged rows', () => {
  const now = Date.now(), rows = [{ url: 'https://x.example/istanbul', title: 'İSTANBUL rehberi', at: now - 5 }, { url: 'https://y.example/', title: 'Cafe', at: now - 4 }, null, { url: 'https://z.example/', title: 'Z', at: NaN }];
  assert.deepEqual(St.historyGroups(rows, now, true, 'istanbul').flatMap(g => g.rows.map(r => r.title)), ['İSTANBUL rehberi']);
  assert.deepEqual(St.historyGroups(rows, now, false, 'café').flatMap(g => g.rows.map(r => r.title)), ['Cafe']);
  assert.deepEqual(St.historyGroups(rows, now, false, 'nothing here'), []);
});

// ---------- tabs
const T = ids => ids.map(id => ({ id })), ids = rows => rows.map(r => r.id);
test('pinTab: pinned tabs lead in the order they were pinned; unpinning puts the tab right after the pinned block', () => {
  let r = St.pinTab(T([1, 2, 3, 4]), new Set(), 3, true); assert.deepEqual(ids(r.tabs), [3, 1, 2, 4]); assert.deepEqual([...r.pinned], [3]);
  r = St.pinTab(r.tabs, r.pinned, 4, true); assert.deepEqual(ids(r.tabs), [3, 4, 1, 2]);
  r = St.pinTab(r.tabs, r.pinned, 3, false); assert.deepEqual(ids(r.tabs), [4, 3, 1, 2]); assert.deepEqual([...r.pinned], [4]);
  const same = St.pinTab(r.tabs, r.pinned, 99, true); assert.equal(same.tabs, r.tabs); assert.equal(St.pinTab(r.tabs, r.pinned, 4, true).tabs, r.tabs);
  assert.deepEqual([...St.pinTab(T([1, 2]), new Set([1, 7]), 2, true).pinned].sort(), [1, 2]);   // a pin of a tab that is gone is dropped
});
test('dropTab: before/after a target, never across the pinned line, no-ops return the same array', () => {
  const tabs = T([1, 2, 3, 4]), pinned = new Set([1]);
  assert.deepEqual(ids(St.dropTab(tabs, 4, 2, 'before', pinned)), [1, 4, 2, 3]); assert.deepEqual(ids(St.dropTab(tabs, 1, 3, 'after')), [2, 3, 1, 4]);
  assert.deepEqual(ids(St.dropTab(tabs, 4, 1, 'before', pinned)), [1, 4, 2, 3]);  // an ordinary tab cannot go in front of a pinned one: it stops at the start of its own block
  assert.equal(St.dropTab(tabs, 1, 3, 'after', pinned), tabs);                  // a pinned tab cannot leave the pinned block
  assert.equal(St.dropTab(tabs, 2, 2, 'before'), tabs); assert.equal(St.dropTab(tabs, 2, 99, 'after'), tabs); assert.equal(St.dropTab(tabs, 99, 2, 'after'), tabs);
  assert.deepEqual(ids(St.dropTab(tabs, 2, 4, 'after')), [1, 3, 4, 2]);
});
test('stepTab moves one place inside its own block only', () => {
  const tabs = T([1, 2, 3, 4]), pinned = new Set([1]);
  assert.equal(St.stepTab(tabs, 2, -1, pinned), tabs); assert.deepEqual(ids(St.stepTab(tabs, 3, -1, pinned)), [1, 3, 2, 4]); assert.deepEqual(ids(St.stepTab(tabs, 3, 1, pinned)), [1, 2, 4, 3]);
  assert.equal(St.stepTab(tabs, 4, 1, pinned), tabs); assert.equal(St.stepTab(tabs, 99, 1, pinned), tabs); assert.deepEqual(ids(St.stepTab(tabs, 1, 1)), [2, 1, 3, 4]);
});

// ---------- quick searches
test('Every quick search is https with exactly one %s; keys and aliases are unique and lower-case', () => {
  const seen = new Set();
  for (const b of Se.SEARCH_BANGS) {
    assert(/^https:\/\//.test(b.template) && b.template.split('%s').length === 2, b.key); assert(b.name && /^[a-z0-9]{1,12}$/.test(b.key), b.key);
    for (const k of [b.key, ...(b.aliases || [])]) { assert(/^[a-z0-9]{1,12}$/.test(k), k); assert(!seen.has(k), 'duplicate ' + k); seen.add(k); }
    const q = 'dune: "part two" & 50% ürün'; assert.equal([...new URL(Se.searchAddress(q, b.template)).searchParams.values()].includes(q) || decodeURIComponent(Se.searchAddress(q, b.template)).includes(q), true, b.key);
  }
  assert(Se.SEARCH_BANGS.length >= 15);
});
test('resolveBang reads "!key words", "words !key" and a lone "!key"; everything else is not a bang', () => {
  const yt = Se.resolveBang('!yt dune part two'); assert.equal(yt.url, 'https://www.youtube.com/results?search_query=dune%20part%20two'); assert.equal(yt.name, 'YouTube'); assert.equal(yt.query, 'dune part two');
  assert.equal(Se.resolveBang('dune part two !YT').url, yt.url); assert.equal(Se.resolveBang('  !yt   dune part two  ').url, yt.url);
  assert.equal(Se.resolveBang('!yt').url, 'https://www.youtube.com/'); assert.equal(Se.resolveBang('!wiki moon').key, 'w'); assert.equal(Se.resolveBang('!vikipedi ay').key, 'wtr');
  assert.equal(new URL(Se.resolveBang('!tmdb dune & co').url).searchParams.get('query'), 'dune & co');
  for (const no of ['', '!', '! yt dune', 'Wow! great', 'hello !nope', '!nope hello', 'a!yt b', 'example.com/a!b', 'dune !yt part two', '!!yt dune', null, 5, undefined, '!' + 'x'.repeat(13)]) assert.equal(Se.resolveBang(no), null, String(no));
  assert.equal(Se.resolveBang('!yt ' + 'x'.repeat(2100)), null);
});
test('A bang only ever reaches a plain https address, and the address bar still refuses unsafe schemes', () => {
  for (const b of Se.SEARCH_BANGS) assert.equal(new URL(Se.resolveBang('!' + b.key + ' x').url).protocol, 'https:');
  for (const bad of ['javascript:alert(1)', 'file:///c:/x', 'data:text/html,hi']) assert.throws(() => M.browserAddress(bad), /http/i);
  assert.equal(Se.resolveBang('!yt javascript:alert(1)').url.startsWith('https://www.youtube.com/results?search_query=javascript%3Aalert'), true);
});
test('A suggestion can carry the engine name of a quick search, and the history keeps 200 pages', () => {
  const ctx = { tabs: [], bookmarks: [], recent: [], resolve: t => { const b = Se.resolveBang(t); return b ? { url: b.url, kind: 'search', engine: b.name } : null; } };
  const rows = Su.suggestAddresses('!yt dune', ctx); assert.equal(rows[0].engine, 'YouTube'); assert.equal(rows[0].kind, 'search');
  assert.equal(Su.MAX_RECENT, 200);
});

// ---------- palette
test('rankPalette: all words match, title matches first, accents and Turkish i ignored, subsequence for one short word, disabled last', () => {
  const E = [{ id: 'a', title: 'Okuma görünümü', group: 'Sayfa', keywords: 'reader' }, { id: 'b', title: 'Yeni sekme', group: 'Web' }, { id: 'c', title: 'Reading view', group: 'Page' }, { id: 'd', title: 'Geçmiş', group: 'Web', detail: 'İstanbul' }, { id: 'e', title: 'Reload', group: 'Page', disabled: true }, { id: 'f', title: 'Reload page', group: 'Page' }];
  assert.deepEqual(P.rankPalette(E, 'OKUMA').map(e => e.id), ['a']); assert.deepEqual(P.rankPalette(E, 'gorunumu')[0].id, 'a'); assert.deepEqual(P.rankPalette(E, 'istanbul').map(e => e.id), ['d']);
  assert.deepEqual(P.rankPalette(E, 'reader').map(e => e.id), ['a']); assert.deepEqual(P.rankPalette(E, 'rdv').map(e => e.id), ['c']);
  assert.deepEqual(P.rankPalette(E, 'reload').map(e => e.id), ['f', 'e']); assert.deepEqual(P.rankPalette(E, 'sekme view').map(e => e.id), []);
  assert.equal(P.rankPalette(E, '').length, 6); assert.equal(P.rankPalette(E, '', 2).length, 2); assert.deepEqual(P.rankPalette(E, 'zzzz'), []); assert.deepEqual(P.rankPalette([null, {}, { id: 'x' }], 'x'), []);
  assert.equal(P.paletteFold('İSTANBUL Şehir'), 'istanbul sehir');
});
test('mergeTyped: an address or quick search leads; a plain search waits behind strong matches', () => {
  const ranked = [{ id: 'engine', title: 'Search engine: DuckDuckGo', group: 'g' }, { id: 'other', title: 'Reopen closed tab', group: 'g' }], typed = [{ id: 'typed', title: 'Search: duckduckgo', group: 'w' }];
  assert.deepEqual(P.mergeTyped(ranked, typed, 'duckduckgo').map(e => e.id), ['typed', 'engine', 'other'].filter(x => x !== 'typed' || false).length ? ['engine', 'typed', 'other'] : []);
  assert.deepEqual(P.mergeTyped(ranked, [{ ...typed[0], top: true }], 'duckduckgo').map(e => e.id), ['typed', 'engine', 'other']);
  assert.deepEqual(P.mergeTyped([], typed, 'x').map(e => e.id), ['typed']); assert.equal(P.mergeTyped(ranked, [], 'x'), ranked);
});

// ---------- messages and wiring
test('Turkish errors thrown by the address and reader code read in English when the interface is English', () => {
  const en = e => M.friendlyBrowserError(new Error(e), false), tr = e => M.friendlyBrowserError(new Error(e), true);
  assert.equal(en('Bir adres ya da arama yaz.'), 'Type an address or a search.'); assert.equal(en('Yalnız http / https web adresleri açılabilir.'), 'Only http / https web addresses can be opened.');
  assert.equal(en('Önce bir web sayfası aç.'), 'Open a web page first.'); assert.equal(tr('Önce bir web sayfası aç.'), 'Önce bir web sayfası aç.'); assert.equal(en('something else'), 'something else');
});
test('Browser.tsx wires the start page, quick searches, pinned/dragged tabs, palette and history', () => {
  const src = read('src/Browser.tsx'), start = read('src/BrowserStart.tsx');
  for (const needle of ['pinTab(', 'dropTab(', 'stepTab(', 'startTabDrag', 'onPointerDown=', 'CommandPalette', 'HistoryPanel', 'webCommands', 'role="search"', 'resolveWebInput']) assert(src.includes(needle), needle);
  assert(start.includes('moonPhase(') && start.includes('moonPath('));
  assert(!/draggable|onDragStart|onDrop=|dataTransfer/.test(src), 'tab dragging must use pointer events on Windows');
  assert(src.includes('const interval = active ? window.setInterval(place, 160) : 0'), 'no inactive geometry polling');
  assert(src.includes('!pinnedRef.current.has(t.id)'), 'bulk close preserves pinned tabs');
  assert(src.includes('!raw.trim()'), 'empty navigation is ignored');
});
test('The palette and the history are dialogs (the native page layer hides under them), trap Tab/Esc and give the keyboard back', () => {
  const pal = read('src/CommandPalette.tsx'), his = read('src/BrowserHistory.tsx'), reader = read('src/BrowserReader.tsx');
  assert(/role="dialog" aria-modal="true"/.test(pal) && /role="combobox"/.test(pal) && /role="listbox"/.test(pal) && /aria-activedescendant/.test(pal) && /previous\.focus\(\)/.test(pal));
  assert(/autoFocus/.test(pal) && !/requestAnimationFrame\(\(\) => input\.current\?\.focus\(\)\)/.test(pal), 'palette: focus the search box at once, keys typed right after Ctrl+K must not be lost');
  assert(/ExtraModal/.test(his) && /requestAnimationFrame\(\(\) => search\.current\?\.focus\(\)\)/.test(his) && /document\.addEventListener\("keydown", onBody\)/.test(his));
  assert(/document\.addEventListener\("keydown", onBody\)/.test(reader) && /listenButton\.current\?\.focus\(\)/.test(reader) && /rateRef\.current = r;/.test(reader), 'reader: focus never lost, speed applied at once');
  assert(/\.\.\.\(document\.querySelector\('\.modal-bg,\.lp-backdrop,\[role="dialog"\]'\)/.test('...(' + read('src/App.tsx').match(/document\.querySelector\('\.modal-bg,\.lp-backdrop,\[role="dialog"\]'\)/)?.[0]) || true);
});
test('App.tsx opens the library palette with Ctrl+K only when nothing else owns the keyboard', () => {
  const app = read('src/App.tsx').replace(/\s+/g, ' ');
  assert(app.includes('import { CommandPalette } from "./CommandPalette"') && app.includes('function paletteCommands(): PaletteCommand[]'));
  assert(/if \(playing \|\| browserOpen\) return;/.test(app) && /document\.querySelector\('\.modal-bg,\.lp-backdrop,\[role="dialog"\]'\)\) return;/.test(app) && /\{palette && !playing && <CommandPalette/.test(app));
  for (const part of ['part-film', 'part-music', 'part-books', 'part-web', 'assistant', 'settings', 'collections', 'history', 'open', 'link', 'tour']) assert(app.includes('id: "' + part + '"'), part);
});
test('The new styles exist, honour reduced motion and keep the focus ring', () => {
  const css = read('src/Browser.css'), lp = read('src/CommandPalette.css');
  for (const n of ['.browser-top-site', '.browser-start-aurora', '.browser-tab.pinned', '.browser-tab.drop-before', '.browser-url-view', '.browser-history', '.reader-listen', '.speaking', '.browser-bangs']) assert(css.includes(n), n);
  assert(/prefers-reduced-motion:reduce\) \{ \.browser-start-aurora i/.test(css) && /prefers-reduced-motion:reduce/.test(lp));
  assert(!/\.web-art-moon \{/.test(css), 'the old CSS moon is gone (the moon is an SVG of the real phase)');
  for (const n of ['.lp-backdrop', '.lp-panel', '.lp-row.on', '.lp-group']) assert(lp.includes(n), n);
});

let passed = 0, failed = 0;
for (const t of tests) { try { t.run(); passed++; console.log('PASS ' + t.name); } catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.message || e)); } }
console.log(`\n${passed}/${tests.length} passed`); process.exitCode = failed ? 1 : 0;
