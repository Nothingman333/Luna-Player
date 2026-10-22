/* Luna Web: search engines, address kinds, address-bar suggestions and the recent-visits list.
 * npm run test:browser-suggest. The models are loaded on their own (they have no imports). */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function moduleOf(file) { const m = { exports: {} }; new Function('exports', 'module', transpile(read(file)))(m.exports, m); return m.exports; }
const { browserAddress, addressKind } = moduleOf('src/browserModel.ts');
const { SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, cleanEngineId, searchTemplate, searchAddress } = moduleOf('src/browserSearch.ts');
const S = moduleOf('src/browserSuggest.ts');
const tests = [], test = (name, run) => tests.push({ name, run });
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const resolve = text => { try { return { url: browserAddress(text), kind: addressKind(text) === 'address' ? 'go' : 'search' }; } catch { return null; } };

test('Every search engine template is https, has exactly one %s and builds the same address in both modules', () => {
  assert(SEARCH_ENGINES.length >= 6); assert.equal(new Set(SEARCH_ENGINES.map(e => e.id)).size, SEARCH_ENGINES.length);
  for (const e of SEARCH_ENGINES) {
    assert(/^https:\/\//.test(e.template), e.id); assert.equal(e.template.split('%s').length, 2, e.id);
    const q = 'dune: part two & "x" $& 50% ürün';
    const a = browserAddress(q, e.template), b = searchAddress(q, e.template);
    assert.equal(a, new URL(b).href, e.id); assert(new URL(a).search.includes(encodeURIComponent(q).replace(/%20/g, '%20')) || new URL(a).search.length > 3);
    const back = [...new URL(a).searchParams.values()][0]; assert.equal(back, q, e.id + ' round trip');
  }
});
test('Unknown, damaged or hostile engine ids and templates fall back to Google', () => {
  for (const bad of [undefined, null, 42, '', 'GOOGLE', '__proto__', {}, 'yahoo']) assert.equal(cleanEngineId(bad), DEFAULT_SEARCH_ENGINE);
  assert.equal(cleanEngineId('duckduckgo'), 'duckduckgo');
  assert(searchTemplate('nope').startsWith('https://www.google.com/'));
  for (const bad of ['http://evil.example/?q=%s', 'https://a.example/', 'https://a.example/%s/%s', 'javascript:%s', '', null, 7]) {
    assert(new URL(browserAddress('hello world', bad)).hostname === 'www.google.com', String(bad));
    assert(searchAddress('hello world', bad).startsWith('https://www.google.com/'), String(bad));
  }
});
test('The search engine only changes searches, never typed addresses', () => {
  const ddg = searchTemplate('duckduckgo');
  assert.equal(browserAddress('example.com/film', ddg), 'https://example.com/film');
  assert.equal(new URL(browserAddress('best films 2026', ddg)).hostname, 'duckduckgo.com');
  assert.equal(browserAddress('localhost:8000/a', ddg), 'http://localhost:8000/a');
});
test('Typed text is read as an address only when it really looks like a host', () => {
  const address = ['example.com', 'example.com/a?b=1#c', 'sub.example.co.uk:8443/x', 'localhost', 'localhost:3000/a', '[::1]:8000', '192.168.1.1', '10.0.0.2:8080/admin', 'münchen.de', 'örnek.com.tr/yol', 'https://example.com', 'http://x.y', 'xn--80ak6aa92e.com'];
  const search = ['Dune: part two', 'Re: konu', 'Batman: Year One', 'note: buy milk', '3.14', 'v1.2.3', 'e.g.', 'a.b', 'user@example.com', '999.1.1.1', 'hello world', 'dune part two', 'what is 3.5mm jack', '.com', 'example..com', '-a.com', 'İstanbul film önerileri', 'node'];
  for (const t of address) assert.equal(addressKind(t), 'address', t);
  for (const t of search) assert.equal(addressKind(t), 'search', t);
  assert.equal(addressKind('   '), 'empty');
});
test('IPv4 addresses open over http, host names over https', () => {
  assert.equal(browserAddress('192.168.1.1'), 'http://192.168.1.1/');
  assert.equal(browserAddress('192.168.1.1:8080/admin'), 'http://192.168.1.1:8080/admin');
  assert.equal(browserAddress('example.org'), 'https://example.org/');
});
test('The privileged-scheme and Luna-origin guards still hold with every kind of input', () => {
  for (const v of ['file:///C:/x', 'javascript:alert(1)', 'javascript: alert(1)', 'JAVASCRIPT:alert(1)', 'data: text/html,x', 'vbscript:x', 'view-source:https://example.com', 'data:text/html,x', 'tauri://localhost', 'https://user:pass@example.com', 'https://tauri.localhost', 'http://127.0.0.1:1420', 'http://localhost:1420/x', '127.0.0.1:1420', 'localhost:1420'])
    assert.throws(() => browserAddress(v), /http/i, v);
  assert.throws(() => browserAddress('   '), /adres/i);
});

test('visitAddress keeps plain web pages only and drops fragments', () => {
  assert.equal(S.visitAddress('https://example.com/a#frag'), 'https://example.com/a');
  for (const bad of [null, 5, '', 'file:///x', 'javascript:1', 'https://u:p@example.com', 'https://tauri.localhost/', 'http://localhost:1420/', 'https://' + 'a'.repeat(2100) + '.com']) assert.equal(S.visitAddress(bad), null, String(bad).slice(0, 40));
});
test('Search result pages never enter the visit list; ordinary pages on the same hosts do', () => {
  for (const u of ['https://www.google.com/search?q=dune', 'https://duckduckgo.com/?q=dune', 'https://www.bing.com/search?q=x', 'https://yandex.com/search/?text=x', 'https://www.startpage.com/do/search?q=x', 'https://search.brave.com/search?q=x'])
    assert.equal(S.isSearchResultUrl(u), true, u);
  for (const u of ['https://www.google.com/', 'https://duckduckgo.com/', 'https://example.com/search?q=1', 'https://www.bing.com/maps', 'https://letterboxd.com/film/dune/'])
    assert.equal(S.isSearchResultUrl(u), false, u);
  assert.deepEqual(S.recordVisit([], { url: 'https://www.google.com/search?q=dune', title: 'dune - Google' }, NOW), []);
});
test('recordVisit adds, merges, counts and orders visits; quick reloads count once', () => {
  let rows = S.recordVisit([], { url: 'https://letterboxd.com/film/dune/#cast', title: 'Dune' }, NOW);
  assert.deepEqual(rows, [{ url: 'https://letterboxd.com/film/dune/', title: 'Dune', at: NOW, visits: 1 }]);
  rows = S.recordVisit(rows, { url: 'https://example.com/', title: '' }, NOW + 1000);
  assert.equal(rows[0].title, 'example.com'); assert.equal(rows.length, 2);
  rows = S.recordVisit(rows, { url: 'https://letterboxd.com/film/dune/', title: 'Dune' }, NOW + 5000);          // 5 s later: reload
  assert.equal(rows[0].url, 'https://letterboxd.com/film/dune/'); assert.equal(rows[0].visits, 1);
  rows = S.recordVisit(rows, { url: 'https://letterboxd.com/film/dune/', title: 'letterboxd.com' }, NOW + 60000);    // a placeholder (host) title must not replace a real one
  assert.equal(rows[0].visits, 2); assert.equal(rows[0].title, 'Dune');
  const same = S.recordVisit(rows, { url: 'mailto:x@y.z' }, NOW); assert.equal(same, rows);
});
test('The visit list is capped and the real page title improves a visit without counting it', () => {
  let rows = []; for (let i = 0; i < S.MAX_RECENT + 30; i++) rows = S.recordVisit(rows, { url: `https://site${i}.example/`, title: 'S' + i }, NOW + i * 60000);
  assert.equal(rows.length, S.MAX_RECENT); assert.equal(rows[0].url, 'https://site' + (S.MAX_RECENT + 29) + '.example/');
  const before = rows[0], after = S.updateVisitTitle(rows, 'https://site' + (S.MAX_RECENT + 29) + '.example/', '  A  better   title ');
  assert.equal(after[0].title, 'A better title'); assert.equal(after[0].visits, before.visits); assert.equal(after[0].at, before.at);
  assert.equal(S.updateVisitTitle(rows, 'https://site' + (S.MAX_RECENT + 29) + '.example/', 'site' + (S.MAX_RECENT + 29) + '.example'), rows);
  assert.equal(S.updateVisitTitle(rows, 'https://unknown.example/', 'x'), rows);
  assert.equal(S.forgetVisit(rows, 'https://site' + (S.MAX_RECENT + 29) + '.example/').length, S.MAX_RECENT - 1);
});
test('cleanRecent survives damaged storage: bad rows dropped, duplicates merged, newest first, capped', () => {
  for (const raw of [null, undefined, 'x', 5, {}, [null, 3, 'a', {}, { url: 5 }, { url: 'https://a.example/', at: 'x' }, { url: 'file:///x', at: 1 }]]) assert.deepEqual(S.cleanRecent(raw), []);
  const rows = S.cleanRecent([
    { url: 'https://a.example/', title: ' A ', at: 5, visits: 3 }, { url: 'https://a.example/#x', title: 'dup', at: 9, visits: 1 },
    { url: 'https://b.example/', title: '', at: 7, visits: -2 }, { url: 'https://www.google.com/search?q=x', title: 's', at: 8, visits: 1 },
    { url: 'https://c.example/', title: 'C', at: 1, visits: 'many' },
  ]);
  assert.deepEqual(rows.map(r => r.url), ['https://a.example/', 'https://b.example/', 'https://c.example/']);
  assert.equal(rows[0].title, 'dup'); assert.equal(rows[1].title, 'b.example'); assert.equal(rows[1].visits, 1); assert.equal(rows[2].visits, 1);
  assert.equal(S.cleanRecent(Array.from({ length: 300 }, (_, i) => ({ url: `https://s${i}.example/`, at: i, visits: 1 })), 20).length, 20);
  assert.deepEqual(S.cleanRecent([{ url: 'https://a.example/', at: 1 }], 0), []);
});
test('relativeTime speaks both languages and never goes negative', () => {
  assert.equal(S.relativeTime(NOW, NOW + 20_000, true), 'az önce'); assert.equal(S.relativeTime(NOW + 5000, NOW, false), 'just now');
  assert.equal(S.relativeTime(NOW, NOW + 5 * 60_000, true), '5 dk önce'); assert.equal(S.relativeTime(NOW, NOW + 3 * 3_600_000, false), '3 h ago');
  assert.equal(S.relativeTime(NOW, NOW + 2 * 86_400_000, true), '2 gün önce'); assert.equal(S.relativeTime(NOW, NOW + 40 * 86_400_000, false), '2026-10-22');
});

const ctx = (extra = {}) => ({
  tabs: [{ id: 1, title: 'Dune (2021) - Letterboxd', url: 'https://letterboxd.com/film/dune-2021/' }, { id: 2, title: 'Wikipedia', url: 'https://www.wikipedia.org/' }],
  bookmarks: [{ title: 'TMDB', url: 'https://www.themoviedb.org/' }, { title: 'Dune on Wikipedia', url: 'https://en.wikipedia.org/wiki/Dune_(2021_film)' }],
  recent: [
    { url: 'https://www.imdb.com/title/tt1160419/', title: 'Dune (2021) - IMDb', at: NOW - 60_000, visits: 4 },
    { url: 'https://example.com/', title: 'Example Domain', at: NOW - 86_400_000 * 20, visits: 1 },
    { url: 'https://letterboxd.com/film/dune-2021/', title: 'Dune (2021)', at: NOW - 1000, visits: 9 },
  ],
  resolve, now: NOW, ...extra,
});
test('An empty box offers recent visits only; the typed text comes first otherwise', () => {
  const empty = S.suggestAddresses('   ', ctx()); assert(empty.length && empty.every(s => s.kind === 'recent')); assert(empty.length <= 6);
  const rows = S.suggestAddresses('dune', ctx());
  assert.deepEqual([rows[0].kind, rows[0].title], ['search', 'dune']);
  assert.equal(S.suggestAddresses('example.com/film', ctx())[0].kind, 'go');
  assert.equal(S.suggestAddresses('example.com/film', ctx())[0].url, 'https://example.com/film');
});
test('Open tabs rank above favourites above visits, and one address is listed once', () => {
  const rows = S.suggestAddresses('dune', ctx()).slice(1);
  const kinds = rows.map(s => s.kind); assert(kinds.indexOf('tab') < kinds.indexOf('bookmark')); assert(kinds.indexOf('bookmark') < kinds.indexOf('recent'));
  const urls = rows.map(s => s.url); assert.equal(new Set(urls).size, urls.length);
  assert.equal(rows.find(s => s.url === 'https://letterboxd.com/film/dune-2021/').kind, 'tab');   // the visit of an open tab is not repeated
  assert.equal(rows.find(s => s.kind === 'tab').id, 1);
});
test('Matching is accent-, case- and dotted-i-insensitive and needs every typed word', () => {
  const c = ctx({ recent: [{ url: 'https://tr.example/', title: 'İstanbul Film Önerileri', at: NOW, visits: 1 }], tabs: [], bookmarks: [] });
  for (const q of ['istanbul', 'ISTANBUL film', 'onerileri', 'film istanbul']) assert(S.suggestAddresses(q, c).some(s => s.kind === 'recent'), q);
  assert(!S.suggestAddresses('istanbul pizza', c).some(s => s.kind === 'recent'));
});
test('A host that starts with the typed word outranks a title match; frequent and fresh visits outrank old ones', () => {
  const c = ctx({ tabs: [], bookmarks: [], recent: [
    { url: 'https://news.example/', title: 'Everything about wiki', at: NOW, visits: 1 },
    { url: 'https://wiki.example/', title: 'Home', at: NOW - 86_400_000 * 30, visits: 1 },
  ] });
  assert.equal(S.suggestAddresses('wiki', c)[1].url, 'https://wiki.example/');
  const d = ctx({ tabs: [], bookmarks: [], recent: [
    { url: 'https://a.example/x', title: 'film old', at: NOW - 86_400_000 * 30, visits: 1 }, { url: 'https://b.example/x', title: 'film new', at: NOW - 1000, visits: 8 }] });
  assert.deepEqual(S.suggestAddresses('film', d).slice(1).map(s => s.url), ['https://b.example/x', 'https://a.example/x']);
});
test('The result list is capped, tolerates damaged rows and a resolver that throws', () => {
  const many = ctx({ recent: Array.from({ length: 50 }, (_, i) => ({ url: `https://s${i}.example/`, title: 'film ' + i, at: NOW - i, visits: 1 })) });
  assert.equal(S.suggestAddresses('film', many).length, 8); assert.equal(S.suggestAddresses('film', many, 3).length, 3);
  assert.equal(S.suggestAddresses('film', many, 999).length <= 20, true);
  const damaged = ctx({ tabs: [{ id: 1, title: null, url: 'https://a.example/film' }, { id: 2, title: 'x', url: null }], bookmarks: [{ title: 5, url: 'https://b.example/film' }] });
  const rows = S.suggestAddresses('film', damaged); assert(rows.some(s => s.url === 'https://a.example/film')); assert(rows.every(s => typeof s.url === 'string' && typeof s.title === 'string'));
  const none = S.suggestAddresses('film', ctx({ resolve: () => { throw new Error('x'); } })); assert(none.length && none[0].kind !== 'search');
});

test('Browser.tsx wires the new models, the overlay cut-out and accessible roles', () => {
  const src = read('src/Browser.tsx'), panels = read('src/BrowserPanels.tsx');
  for (const needle of ['./browserSearchModel', 'webSuggestions', 'recordVisit', 'role="combobox"', 'aria-activedescendant']) assert(src.includes(needle), needle);
  for (const role of ['role="listbox"', 'role="option"', 'role="menu"']) assert(panels.includes(role), role);
  assert(src.includes('.browser-suggest') && src.includes('.browser-tab-menu'), 'native cutouts cover active dropdown classes');
});
test('The new styles exist and respect reduced motion; the tools menu can scroll on short windows', () => {
  const css = read('src/Browser.css');
  for (const needle of ['.browser-suggest-pop', '.browser-ctx-pop', '.browser-recent']) assert(css.includes(needle), needle);
  assert(/\.browser-tools-pop\.extra-browser-tools\s*\{[^}]*max-height:\s*min\(620px,\s*calc\(100vh - 190px\)\)/.test(css), 'tools menu must fit short windows');
  assert(/\.browser-tools-pop\.extra-browser-tools\s*\{[^}]*overflow:auto/.test(read('src/Extras.css')), 'Extras.css keeps the menu scrollable');
  assert(/prefers-reduced-motion/.test(css));
});

const { WEB_SHORTCUTS, shortcutLabel } = moduleOf('src/browserShortcuts.ts');
test('The shortcut table is well formed: unique ids and keys, both languages, no empty cells', () => {
  assert(WEB_SHORTCUTS.length >= 4); assert.equal(new Set(WEB_SHORTCUTS.map(g => g.id)).size, WEB_SHORTCUTS.length);
  const seen = new Set();
  for (const g of WEB_SHORTCUTS) {
    assert(g.tr && g.en && g.items.length, g.id);
    for (const i of g.items) { assert(i.tr.trim() && i.en.trim() && i.keys.length && i.keys.every(k => k.trim()), shortcutLabel(i)); assert(!seen.has(shortcutLabel(i)), 'duplicate ' + shortcutLabel(i)); seen.add(shortcutLabel(i)); }
  }
  assert.equal(shortcutLabel({ keys: ['Ctrl', 'Shift', 'T'] }), 'Ctrl + Shift + T');
});
test('Every documented shortcut is really handled in Browser.tsx (the help panel cannot drift from the code)', () => {
  const src = read('src/Browser.tsx'), panels = read('src/BrowserPanels.tsx');
  for (const key of ['ctrl+t','ctrl+w','ctrl+shift+t','ctrl+tab','ctrl+shift+a','ctrl+d','ctrl+l','ctrl+k','ctrl+h','ctrl+pageup','ctrl+shift+pageup','f9','f1']) assert(src.includes('case "'+key+'"'), key);
  for (const key of ['f5','arrowleft','arrowright','ArrowDown','ArrowUp','Escape','Enter']) assert(src.includes('"'+key+'"'), key);
  assert(src.includes('shiftKey') && src.includes('F10') && src.includes('setMenu('));
  assert(panels.includes('ShortcutsPanel') && panels.includes('Ctrl+F'), 'active shortcut help remains available');
});

let passed = 0, failed = 0;
for (const t of tests) { try { t.run(); passed++; console.log('PASS ' + t.name); } catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.message || e)); } }
console.log(JSON.stringify({ total: tests.length, passed, failed })); process.exit(failed ? 1 : 0);
