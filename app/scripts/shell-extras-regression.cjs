/* Behaviour tests for 1.9.0: Web search engines and bangs, AutoEq headphone correction (the filter
   strings are also run through ffmpeg when it is installed), library health, the episode calendar,
   TMDB watch providers and title logos, the native commands the UI calls, and the wiring of the new
   Windows features. Run: node scripts/shell-extras-regression.cjs */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(file, imports = () => ({})) { const m = { exports: {} }; new Function('require', 'module', 'exports', transpile(read(file)))(imports, m, m.exports); return m.exports; }
const tests = []; const test = (id, name, run) => tests.push({ id, name, run });
const WA = load('src/webArchive.ts'), W = load('src/webSearch.ts'), A = load('src/autoEq.ts'), H = load('src/healthModel.ts'), C = load('src/calendarModel.ts'), T = load('src/titleExtrasModel.ts');

test('X01', 'search: default engine, chosen engine, custom address, bangs and their language', () => {
  assert.equal(W.searchAddress('dune part two', W.templateFor(null)), 'https://www.google.com/search?q=dune%20part%20two');
  assert.equal(W.searchAddress('a&b c', W.templateFor('ddg')), 'https://duckduckgo.com/?q=a%26b%20c');
  assert.equal(W.templateFor('custom:https://searx.example/search?q=%s'), 'https://searx.example/search?q=%s');
  for (const bad of ['custom:javascript:alert(%s)', 'custom:https://x.test/', 'custom:https://x.test/?a=%s&b=%s', 'custom:ftp://x.test/%s', 'custom:http://evil.test/?q=%s']) assert.equal(W.templateFor(bad), W.ENGINES[0].url, bad);
  assert.equal(W.templateFor('custom:http://localhost:8080/?q=%s'), 'http://localhost:8080/?q=%s');
  assert.equal(W.searchAddress('!yt dune trailer', W.templateFor('bing')), 'https://www.youtube.com/results?search_query=dune%20trailer');
  assert.match(W.searchAddress('!w Dune', W.templateFor('bing'), 'tr'), /language=tr&search=Dune$/);
  assert.match(W.searchAddress('!w Dune', W.templateFor('bing'), 'de'), /language=en&/);
  assert.equal(W.searchAddress('!nosuch x', W.templateFor('bing')), 'https://www.bing.com/search?q=!nosuch%20x');
  assert.equal(W.parseBang('!imdb'), null); assert.equal(W.parseBang('hello !w'), null);
  // browserAddress keeps its behaviour: addresses stay addresses, phrases follow the chosen engine
  const B = load('src/browserModel.ts');
  assert.equal(B.browserAddress('example.com/a'), 'https://example.com/a');
  assert.equal(B.browserAddress('hello world'), 'https://www.google.com/search?q=hello%20world');
  B.setSearchResolver(W.makeResolver('ddg', 'en')); assert.equal(B.browserAddress('hello world'), 'https://duckduckgo.com/?q=hello%20world');
  assert.equal(B.browserAddress('!lb arrival'), 'https://letterboxd.com/search/arrival/');
  B.setSearchResolver(W.makeResolver('custom:https://x.test/?q=%s')); assert.equal(B.browserAddress('a b'), 'https://x.test/?q=a%20b');
  B.setSearchResolver(null); assert.equal(B.browserAddress('a b'), 'https://www.google.com/search?q=a%20b');
  assert.throws(() => B.browserAddress('   '));
});
test('X02', 'AutoEq: parses the real file shape, skips what it cannot use and clamps the numbers', () => {
  const txt = 'Preamp: -6.1 dB\nFilter 1: ON LSC Fc 105 Hz Gain 6.4 dB Q 0.70\nFilter 2: ON PK Fc 8800 Hz Gain 5.1 dB Q 1.42\nFilter 3: OFF PK Fc 100 Hz Gain 1 dB Q 1\nFilter 4: ON LP Fc 18000 Hz Gain 0 dB Q 0.7\nFilter 5: ON HSC Fc 10000 Hz Gain -99 dB Q 0.01\n';
  const eq = A.parseAutoEq('\uFEFF' + txt.replace(/\n/g, '\r\n'));
  assert.equal(eq.preamp, -6.1); assert.equal(eq.skipped, 2);
  assert.deepEqual(eq.filters.map((f) => [f.type, f.fc, f.gain, f.q]), [['LSC', 105, 6.4, 0.7], ['PK', 8800, 5.1, 1.42], ['HSC', 10000, -24, 0.05]]);
  assert.equal(A.autoEqFilter(eq), 'lavfi=[volume=-6.1dB,lowshelf=f=105:t=q:w=0.7:g=6.4,equalizer=f=8800:t=q:w=1.42:g=5.1,highshelf=f=10000:t=q:w=0.05:g=-24]');
  assert.equal(A.parseAutoEq('not an equalizer file'), null); assert.equal(A.parseAutoEq(null), null);
  assert.equal(A.parseAutoEq('Filter 1: ON PK Fc 100 Hz Gain 1 dB Q 1').preamp, 0);
  assert(!A.autoEqFilter(A.parseAutoEq('Filter 1: ON PK Fc 100 Hz Gain 1 dB Q 1')).includes('volume'));
  assert.equal(A.parseAutoEq(Array.from({ length: 60 }, (_, i) => `Filter ${i + 1}: ON PK Fc ${100 + i} Hz Gain 1 dB Q 1`).join('\n')).filters.length, 30);
});
test('X03', 'AutoEq filter strings are valid ffmpeg filter graphs (checked with the installed ffmpeg)', () => {
  const ff = spawnSync('ffmpeg', ['-version']);
  if (ff.error || ff.status !== 0) { console.log('     (ffmpeg not installed: skipped)'); return; }
  const eq = A.parseAutoEq('Preamp: -6.1 dB\nFilter 1: ON LSC Fc 105 Hz Gain 6.4 dB Q 0.70\nFilter 2: ON PK Fc 8800 Hz Gain 5.1 dB Q 1.42\nFilter 3: ON HSC Fc 10000 Hz Gain -3 dB Q 0.70');
  const graph = A.autoEqFilter(eq).replace(/^lavfi=\[/, '').replace(/\]$/, '');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=0.3', '-af', graph, '-f', 'null', '-']);
  assert.equal(r.status, 0, String(r.stderr));
  const bad = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.1', '-af', 'equalizer=f=oops', '-f', 'null', '-']);
  assert.notEqual(bad.status, 0, 'the check itself can fail');
});
test('X04', 'library health: duplicates need the same size and hash; samples are small and named so', () => {
  const g = H.duplicateGroups([
    { path: 'D:/a/Dune.mkv', size: 5e9, hash: 'aa' }, { path: 'E:/b/Dune (copy).mkv', size: 5e9, hash: 'aa' }, { path: 'E:/b/Other.mkv', size: 5e9, hash: 'bb' },
    { path: 'D:/c/x.mkv', size: 7e8, hash: 'cc' }, { path: 'D:/c/y.mkv', size: 7e8, hash: 'cc' }, { path: 'D:/c/z.mkv', size: 7e8, hash: 'cc' }, { path: 'D:/n/n.mkv', size: 100, hash: null }, { path: 'D:/n/m.mkv', size: 100, hash: null }]);
  assert.deepEqual(g.map((x) => x.length), [2, 3]); assert.equal(g[0][0].path, 'D:/a/Dune.mkv');
  assert.equal(H.wastedBytes(g), 5e9 + 2 * 7e8);
  assert(H.looksLikeSample('D:\\Films\\Dune\\sample.mkv', 30e6)); assert(H.looksLikeSample('D:/Films/Sample/clip.mkv', 30e6)); assert(H.looksLikeSample('x/Dune-sample.mkv', 1e6));
  assert(!H.looksLikeSample('D:/Films/Samples Collection/x.mkv', 30e6)); assert(!H.looksLikeSample('D:/Films/Sampler.2019.mkv', 30e6)); assert(!H.looksLikeSample('x/sample.mkv', 4e9));
  assert.equal(H.humanSize(5.2e9), '5.2 GB'); assert.equal(H.humanSize(12.4e6), '12 MB'); assert.equal(H.humanSize(10), '1 KB');
});
test('X05', 'calendar: next episode from TMDB, days from the local date, groups in order', () => {
  assert.deepEqual(C.parseNext({ next_episode_to_air: { air_date: '2026-10-29', season_number: 2, episode_number: 5, name: 'Ep' } }), { season: 2, episode: 5, name: 'Ep', date: '2026-10-29' });
  for (const bad of [null, {}, { next_episode_to_air: null }, { next_episode_to_air: { air_date: '', season_number: 1, episode_number: 1 } }, { next_episode_to_air: { air_date: '2026-10-29', season_number: 1, episode_number: 0 } }, { next_episode_to_air: { air_date: '29/10/2026', season_number: 1, episode_number: 1 } }]) assert.equal(C.parseNext(bad), null);
  const now = new Date(2026, 9, 22, 23, 59);
  assert.equal(C.daysUntil('2026-10-22', now), 0); assert.equal(C.daysUntil('2026-10-23', now), 1); assert.equal(C.daysUntil('2026-11-05', now), 14); assert.equal(C.daysUntil('2026-10-20', now), -2);
  const u = (title, days) => ({ key: title, title, poster: null, season: 1, episode: 1, name: '', date: '', days });
  const groups = C.groupUpcoming([u('late', 30), u('B', 3), u('today', 0), u('gone', -1), u('A', 3), u('tom', 1), u('week', 7), u('edge', 8)]);
  assert.deepEqual(groups.map((g) => g.group), ['today', 'tomorrow', 'week', 'later']);
  assert.deepEqual(groups[2].rows.map((r) => r.title), ['A', 'B', 'week']); assert.deepEqual(groups[3].rows.map((r) => r.title), ['edge', 'late']);
});
test('X06', 'TMDB providers: first region with offers, https links only; logos by language; svg at original size', () => {
  const json = { results: { TR: { link: 'https://www.themoviedb.org/movie/1/watch?locale=TR', flatrate: [] }, US: { link: 'javascript:alert(1)', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' }, { provider_id: 'x', provider_name: 'bad' }], rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: null }] } } };
  const p = T.parseProviders(json, ['TR', 'US']);
  assert.equal(p.region, 'US'); assert.equal(p.providers.link, null); assert.deepEqual(p.providers.flatrate.map((x) => x.name), ['Netflix']); assert.equal(p.providers.rent[0].logo, null);
  assert.equal(T.parseProviders(json, ['TR']), null); assert.equal(T.parseProviders({}, ['US']), null); assert.equal(T.parseProviders(null, ['US']), null);
  assert.equal(T.parseProviders({ results: { TR: { link: 'https://x.test/a', buy: [{ provider_id: 1, provider_name: 'A' }] } } }, ['TR']).providers.link, 'https://x.test/a');
  const logos = { logos: [{ file_path: '/en.png', iso_639_1: 'en', width: 500, vote_average: 5 }, { file_path: '/tr.png', iso_639_1: 'tr', width: 300, vote_average: 1 }, { file_path: '/de.png', iso_639_1: 'de', width: 900 }, { file_path: '/none.svg', iso_639_1: null, width: 100 }, { file_path: '/../evil.png', iso_639_1: 'tr' }] };
  assert.equal(T.pickLogo(logos, 'tr'), '/tr.png'); assert.equal(T.pickLogo(logos, 'fr'), '/en.png'); assert.equal(T.pickLogo({ logos: [logos.logos[2]] }, 'tr'), null); assert.equal(T.pickLogo({}, 'tr'), null);
  assert.equal(T.pickLogo({ logos: [logos.logos[3]] }, 'tr'), '/none.svg');
  assert.equal(T.logoUrl('/a.png', 'https://i/'), 'https://i/w500/a.png'); assert.equal(T.logoUrl('/a.SVG', 'https://i/'), 'https://i/original/a.SVG');
});
test('X07', 'every native command the new UI calls is registered, capabilities cover the new plugins', () => {
  const lib = read('src-tauri/src/lib.rs');
  const handler = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf('];', lib.indexOf('generate_handler![')));
  const used = new Set();
  for (const f of ['src/shellBridge.ts', 'src/studioBridge.ts', 'src/LibraryHealth.tsx', 'src/ClipMaker.tsx', 'src/SceneGrid.tsx', 'src/ShellRuntime.tsx']) for (const m of read(f).matchAll(/invoke(?:<[^>]*>)?\(\s*"([a-z_]+)"/g)) used.add(m[1]);
  for (const c of ['set_tray_mode', 'watch_folders', 'library_fingerprints', 'make_clip', 'whisper_get_vad', 'seek_preview']) assert(used.has(c), 'UI does not call ' + c);
  for (const c of used) assert(new RegExp('(^|[\\s:,])' + c + '\\s*,?\\s*$', 'm').test(handler), 'not registered: ' + c);
  const caps = JSON.parse(read('src-tauri/capabilities/default.json')).permissions;
  for (const p of ['notification:default', 'global-shortcut:allow-register', 'autostart:allow-enable', 'core:window:allow-set-progress-bar', 'core:window:allow-hide']) assert(caps.includes(p), 'capability missing: ' + p);
  assert(JSON.parse(read('src-tauri/capabilities/default.json')).webviews.every((w) => !w.startsWith('luna-web')), 'remote pages get no capability');
  const cargo = read('src-tauri/Cargo.toml'); for (const d of ['tauri-plugin-notification', 'tauri-plugin-global-shortcut', 'tauri-plugin-autostart', 'notify = ', '"tray-icon"']) assert(cargo.includes(d), d);
});
test('X08', 'wiring: close-to-tray is opt-in, library rescans are triggered by the watcher, Settings has the new cards', () => {
  const sh = read('src-tauri/src/shell.rs');
  assert(/TRAY_MODE: AtomicBool = AtomicBool::new\(false\)/.test(sh)); assert(/api\.prevent_close\(\)/.test(sh) && /if window\.label\(\) == "main" && tray_mode\(\)/.test(sh));
  assert(/Create\(_\) \| EventKind::Remove\(_\)/.test(sh));
  for (const f of ['src/library.ts', 'src/Music.tsx', 'src/Books.tsx']) assert(/luna-rescan/.test(read(f)), f + ' ignores luna-rescan');
  const scr = read('src/Screens.tsx'); assert(/<ShellSettings\s*\/>/.test(scr) && /<SoundWebSettings\s*\/>/.test(scr));
  const app = read('src/App.tsx'); assert(/<ShellRuntime\b/.test(app) && /<LibraryHealth\b/.test(app) && /<ClipMaker\b/.test(app) && /<SceneGrid\b/.test(app));
});

test('X09', 'archive copies: only archive.org answers are opened, local and archive addresses are not looked up', () => {
  const ok = { archived_snapshots: { closest: { available: true, status: '200', url: 'http://web.archive.org/web/20261022040511/https://example.com/' } } };
  assert.equal(WA.waybackSnapshot(ok), 'https://web.archive.org/web/20261022040511/https://example.com/');
  assert.equal(WA.waybackSnapshot({ archived_snapshots: {} }), null); assert.equal(WA.waybackSnapshot(null), null);
  assert.equal(WA.waybackSnapshot({ archived_snapshots: { closest: { available: false, url: 'https://web.archive.org/x' } } }), null);
  for (const evil of ['https://evil.test/web/1/x', 'https://web.archive.org.evil.test/x', 'javascript:alert(1)', 'https://archive.org@evil.test/']) assert.equal(WA.waybackSnapshot({ archived_snapshots: { closest: { available: true, url: evil } } }), null, evil);
  assert.equal(WA.waybackApi('https://a.test/x?y=1&z=2'), 'https://archive.org/wayback/available?url=https%3A%2F%2Fa.test%2Fx%3Fy%3D1%26z%3D2');
  assert(WA.archivable('https://example.com/a')); assert(!WA.archivable('http://localhost:8080/')); assert(!WA.archivable('https://web.archive.org/web/1/x')); assert(!WA.archivable('file:///C:/x')); assert(!WA.archivable('about:blank'));
});

(async () => {
  let failed = 0;
  for (const t of tests) { try { await t.run(); console.log('ok   ' + t.id + ' ' + t.name); } catch (e) { failed++; console.log('FAIL ' + t.id + ' ' + t.name + '\n     ' + (e && e.message)); } }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
