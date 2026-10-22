/* Behaviour tests for 1.11: the library-wide line search, AniSkip matching (against real AniList and AniSkip answers),
   "a year ago today", and the wiring of the new screens and native commands. Run: node scripts/library-regression.cjs */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(file, imports = () => ({})) { const m = { exports: {} }; new Function('require', 'module', 'exports', transpile(read(file)))(imports, m, m.exports); return m.exports; }
const tests = []; const test = (id, name, run) => tests.push({ id, name, run });
const L = load('src/lineSearchModel.ts'), A = load('src/aniskipModel.ts'), D = load('src/onThisDayModel.ts');

const film = (path, title, lines) => L.indexFilm(path, title, lines.map(([start, text]) => ({ start, text })));
test('L01', 'folding keeps positions; Turkish letters, tags and breaks do not matter', () => {
  assert.equal(L.foldKeep('İstanbul ŞÇĞÜÖ ıI'), 'istanbul scguo ii');
  for (const s of ['Köprüde buluşalım.', 'İĞNE', 'çağrı', 'ÇOCUK']) assert.equal(L.foldKeep(s).length, s.length, s);
  assert.equal(L.cleanLine('{\\i1}Merhaba<br>dünya{\\i0}\nnasılsın'), 'Merhaba dünya nasılsın');
  assert.equal(L.cleanLine('a\\Nb'), 'a b');
  assert.deepEqual(L.tokens('Köprüde, buluşalım!'), ['kopruede'.replace('ue', 'u'), 'bulusalim'].map((x) => x === 'kopruede' ? 'koprude' : x));
  assert.deepEqual(L.tokens('a b'), []);
});
test('L02', 'phrase beats words beats partial; a phrase split over two lines is found', () => {
  const a = film('a.mkv', 'Film A', [[10, 'Köprüde buluşalım.'], [20, 'Geç kalma, tamam mı?'], [30, 'Sana hiçbir şey olmayacak'], [34, 'dedi ve gülümsedi.'], [50, 'Köprü yıkıldı, ama buluşma yerimiz hâlâ orada.']]);
  const b = film('b.mkv', 'Film B', [[5, 'Buluşalım köprüde, saat beşte.'], [9, 'Tamam.']]);
  const r = L.searchIndex([a, b], 'köprüde buluşalım');
  assert.equal(r[0].path, 'a.mkv'); assert.equal(r[0].start, 10); assert(r[0].score >= 100);
  assert.equal(r[1].path, 'b.mkv', 'all words, other order, comes after the exact phrase');
  assert(r[1].score < r[0].score);
  const split = L.searchIndex([a], 'hiçbir şey olmayacak dedi');
  assert.equal(split[0].start, 30); assert.equal(split[0].score, 72);
  assert.equal(split[0].after, 'dedi ve gülümsedi.');
  assert.deepEqual(L.searchIndex([a], 'x'), []); assert.deepEqual(L.searchIndex([a], '  '), []);
  assert.deepEqual(L.searchIndex([a], 'zzzz yyyy'), []);
  const three = L.searchIndex([a], 'geç kalma yarın');
  assert(three.length === 1 && three[0].start === 20 && three[0].score < 50, 'two of three words is a weak hit');
});
test('L03', 'at most five hits per film; best first; highlight ranges are valid', () => {
  const lines = Array.from({ length: 20 }, (_, i) => [i * 5, `Bu bir deneme satırı numara ${i}`]);
  const many = film('m.mkv', 'Many', lines), one = film('o.mkv', 'One', [[3, 'deneme satırı']]);
  const r = L.searchIndex([many, one], 'deneme satırı');
  assert.equal(r.filter((h) => h.path === 'm.mkv').length, 5); assert.equal(r.length, 6);
  assert.equal(r[0].path, 'o.mkv', 'a whole-line match ranks first');
  assert.equal(L.searchIndex([many], 'deneme', 3).length, 3);
  const h = L.searchIndex([film('x', 'X', [[1, 'Şimdi gidiyorum, İstanbul’a.']])], 'istanbul')[0];
  assert.equal(h.text.slice(h.ranges[0][0], h.ranges[0][1]), 'İstanbul');
  assert.deepEqual(L.segments('abcdef', [[1, 3]]), [{ t: 'a', hit: false }, { t: 'bc', hit: true }, { t: 'def', hit: false }]);
  assert.deepEqual(L.segments('abc', [[2, 99]]), [{ t: 'abc', hit: false }]);
});
test('L04', 'a big library is searched quickly', () => {
  const entries = Array.from({ length: 300 }, (_, f) => film('f' + f, 'F' + f, Array.from({ length: 1500 }, (_, i) => [i * 3, `Satır ${i} filmde ${f} numaralı kişi bir şeyler söylüyor ve gidiyor.`])));
  entries[250].lines[700] = L.indexFilm('x', 'x', [{ start: 2100, text: 'Hangi sahnede kuş uçtu bilmiyorum.' }]).lines[0];
  const t0 = Date.now(); const r = L.searchIndex(entries, 'kuş uçtu'); const ms = Date.now() - t0;
  assert.equal(r[0].path, 'f250'); assert(ms < 1500, ms + ' ms');
});
const AT = [
  { idMal: 16498, title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' }, format: 'TV', episodes: 25, seasonYear: 2013 },
  { idMal: 40028, title: { romaji: 'Shingeki no Kyojin: The Final Season', english: 'Attack on Titan Final Season' }, format: 'TV', episodes: 16, seasonYear: 2021 },
  { idMal: 18397, title: { romaji: 'Shingeki no Kyojin OVA', english: 'Attack on Titan OVA' }, format: 'OVA', episodes: 3, seasonYear: 2013 },
  { idMal: 42091, title: { romaji: 'Shingeki no Kyojin: Chronicle', english: 'Attack on Titan ~Chronicle~' }, format: 'MOVIE', episodes: 1, seasonYear: 2020 },
  { idMal: 25777, title: { romaji: 'Shingeki no Kyojin Season 2', english: 'Attack on Titan Season 2' }, format: 'TV', episodes: 12, seasonYear: 2017 },
  { idMal: null, title: { romaji: 'Shingeki no Kyojin Gaiden' }, format: 'TV', episodes: 2 },
];
test('A01', 'AniSkip: file titles become clean queries', () => {
  assert.equal(A.animeQuery('[SubsPlease] Sousou no Frieren (1080p) [ABC123]'), 'Sousou no Frieren');
  assert.equal(A.animeQuery('One.Punch.Man.S02.1080p.WEB-DL.x265'), 'One Punch Man');
  assert.equal(A.animeQuery('Frieren 2nd Season'), 'Frieren');
  assert.equal(A.animeQuery(''), '');
});
test('A02', 'AniSkip: only TV entries, season 1 without a season word, later seasons only when named', () => {
  assert.deepEqual(A.pickMal(AT, { title: 'Shingeki no Kyojin', season: 1, episode: 5 }), [16498]);
  assert.deepEqual(A.pickMal(AT, { title: 'Shingeki no Kyojin', episode: 5 }), [16498]);
  assert.deepEqual(A.pickMal(AT, { title: 'Shingeki no Kyojin', season: 2, episode: 3 }), [25777]);
  assert.deepEqual(A.pickMal(AT, { title: 'Shingeki no Kyojin', season: 3, episode: 3 }), [], 'no entry names season 3: better no answer than a wrong one');
  assert.deepEqual(A.pickMal(AT, { title: 'Shingeki no Kyojin', season: 1, episode: 30 }), [], 'the episode must exist in the entry');
  assert.deepEqual(A.pickMal(AT, { title: 'Naruto', season: 1, episode: 1 }), [], 'a different show');
  assert(A.mentionsSeason('Attack on Titan Season 2', 2) && A.mentionsSeason('Frieren 2nd Season', 2) && !A.mentionsSeason('Show Part 2', 2) && !A.mentionsSeason('Season 20', 2));
});
const REAL = { found: true, results: [
  { interval: { startTime: 128.406, endTime: 218.406 }, skipType: 'op', skipId: 'a', episodeLength: 1441.9413 },
  { interval: { startTime: 1342.795, endTime: 1430.616 }, skipType: 'ed', skipId: 'b', episodeLength: 1446.9973 },
  { interval: { startTime: 75, endTime: 135 }, skipType: 'mixed-op', skipId: 'c', episodeLength: 1420 },
  { interval: { startTime: 1351.63, endTime: 1441.63 }, skipType: 'mixed-ed', skipId: 'd', episodeLength: 1446.999 }] };
test('A03', 'AniSkip: answers become segments; odd data is dropped', () => {
  assert.equal(A.skipUrl(16498, 1, 1440.4), 'https://api.aniskip.com/v2/skip-times/16498/1?types=op&types=ed&types=recap&types=mixed-op&types=mixed-ed&episodeLength=1440');
  const s = A.parseSkipTimes(REAL, 1435);
  assert.deepEqual(s.map((x) => [x.kind, Math.round(x.start), Math.round(x.end), x.source]), [['intro', 128, 218, 'aniskip'], ['credits', 1343, 1431, 'aniskip']], 'plain op/ed win over the mixed ones');
  const onlyMixed = A.parseSkipTimes({ results: REAL.results.filter((r) => r.skipType.startsWith('mixed')) }, 1435);
  assert.deepEqual(onlyMixed.map((x) => x.kind), ['intro', 'credits'], 'mixed ones are used when there is nothing else');
  const SM = load('src/segmentModel.ts');
  const own = [{ kind: 'intro', start: 5, end: 95, source: 'chapter' }];
  assert.deepEqual(SM.mergeSegments(own, A.preferOwn(own, s)).map((x) => x.kind + ':' + x.source), ['intro:chapter', 'credits:aniskip'], 'your own intro wins over the community one, the credits still come from AniSkip');
  assert.equal(A.parseSkipTimes(REAL, 1300).length, 0, 'a file of another length gets nothing');
  assert.equal(A.parseSkipTimes(REAL, 1445).length, 2, 'the mixed opening 25 s away from this file is not used: ' + JSON.stringify(A.parseSkipTimes(REAL, 1445).map((x) => x.kind)));
  assert.deepEqual(A.parseSkipTimes({ results: [{ interval: { startTime: 10, endTime: 12 }, skipType: 'op', episodeLength: 1440 }] }, 1440), [], 'too short to be an opening');
  assert.deepEqual(A.parseSkipTimes({ results: [{ interval: { startTime: 0, endTime: 1000 }, skipType: 'op' }] }, 1440), [], 'too long');
  assert.deepEqual(A.parseSkipTimes({ results: [{ interval: { startTime: 'x', endTime: 90 }, skipType: 'op' }, { interval: { startTime: 5, endTime: 95 }, skipType: 'bogus' }, null] }, 1440), []);
  assert.deepEqual(A.parseSkipTimes(null, 1440), []); assert.deepEqual(A.parseSkipTimes(REAL, 30), []);
});
test('D01', 'a year ago today: same day of an earlier year, grouped, nearest year first', () => {
  const now = new Date(2026, 9, 22, 18).getTime();
  const at = (y, m, d) => new Date(y, m - 1, d, 21).getTime();
  const m = D.onThisDay([
    { key: 'a', title: 'Dune', poster: '/d.jpg', at: at(2025, 10, 22), kind: 'movie' }, { key: 'b', title: 'Heat', at: at(2024, 10, 22), kind: 'movie' },
    { key: 's', title: 'Severance', at: at(2025, 10, 22), kind: 'tv' }, { key: 's', title: 'Severance', at: new Date(2025, 9, 22, 23).getTime(), kind: 'tv' },
    { key: 'c', title: 'Today', at: at(2026, 10, 22), kind: 'movie' }, { key: 'd', title: 'Other day', at: at(2025, 10, 21), kind: 'movie' }, { key: 'e', title: 'Other month', at: at(2025, 9, 22), kind: 'movie' }], now);
  assert.deepEqual(m.map((x) => [x.title, x.yearsAgo, x.count]), [['Severance', 1, 2], ['Dune', 1, 1], ['Heat', 2, 1]]);
  assert.equal(m[1].poster, '/d.jpg'); assert.deepEqual(D.onThisDay([], now), []);
});
test('W02', 'wiring: commands registered, screens mounted, AniSkip feeds the skip button, the search opens films at the line', () => {
  const lib = read('src-tauri/src/lib.rs');
  const handler = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf('];', lib.indexOf('generate_handler![')));
  assert(/(^|[\s:,])library_subtitles\s*,?\s*$/m.test(handler));
  assert(/invoke<(?:\(string \| null\)\[\]|[^>]*)>\("library_subtitles"/.test(read('src/LineSearch.tsx')) && /luna-open-note/.test(read('src/LineSearch.tsx')));
  const app = read('src/App.tsx');
  assert(/<LineSearch\b/.test(app) && /loadAniSkip\(/.test(app) && /preferOwn\(own, aniSegs\)/.test(app));
  assert(/<OnThisDay\b/.test(read('src/Screens.tsx')) && /a:lines/.test(read('src/paletteExtras.ts')));
  assert(/aniskip/.test(read('src/StudioExtras.tsx')) && /comic_info\(|comic_title/.test(read('src-tauri/src/books.rs')));
  assert(/metadata_version: if kind == "cbz" \{ 2 \}/.test(read('src-tauri/src/books.rs')), 'old comic entries are re-read once');
});

(async () => {
  let failed = 0;
  for (const t of tests) { try { await t.run(); console.log('ok   ' + t.id + ' ' + t.name); } catch (e) { failed++; console.log('FAIL ' + t.id + ' ' + t.name + '\n     ' + (e && e.message)); } }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
