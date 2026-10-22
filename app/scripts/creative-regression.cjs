/* Behaviour tests for 1.10: Luna Özet (recap), "what to watch tonight", quote cards, poster tints,
   scene-grid captions and the wiring of the new screens. Run: node scripts/creative-regression.cjs */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(file, imports = () => ({})) { const m = { exports: {} }; new Function('require', 'module', 'exports', transpile(read(file)))(imports, m, m.exports); return m.exports; }
const tests = []; const test = (id, name, run) => tests.push({ id, name, run });
const R = load('src/recapModel.ts'), T = load('src/tonightModel.ts'), Q = load('src/quoteCardModel.ts');
const P = load('src/posterTint.ts', (n) => (n === 'react' ? { useEffect() {}, useState() { return [null, () => {}]; } } : n === './library' ? { store: { get: () => null, set() {} } } : {}));
const G = load('src/SceneGrid.tsx', () => ({}));
const at = (y, m, d, h = 20) => new Date(y, m - 1, d, h).getTime();

test('R01', 'periods, local days and the longest run of days', () => {
  const now = at(2026, 10, 22, 21);
  assert.equal(R.periodStart('year', now), new Date(2026, 0, 1).getTime());
  assert.equal(R.periodStart('month', now), now - 30 * 86400000);
  assert.equal(R.periodStart('all', now), 0);
  assert.equal(R.dayKey(at(2026, 3, 5, 23)), '2026-03-05');
  assert.equal(R.longestStreak(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-03', '2026-12-31', '2027-01-01']), 3);
  assert.equal(R.longestStreak([]), 0); assert.equal(R.longestStreak(['2026-05-05']), 1);
});
test('R02', 'recap counts only the period, one entry per title, and fills every section', () => {
  const now = at(2026, 10, 22);
  const films = [
    { key: 'movie:dune', title: 'Dune', poster: 'p1', genres: ['Bilim Kurgu', 'Macera'], runtime: 155, at: at(2026, 3, 1) },
    { key: 'movie:dune', title: 'Dune', poster: 'p1', genres: ['Bilim Kurgu', 'Macera'], runtime: 155, at: at(2026, 3, 2) },
    { key: 'movie:heat', title: 'Heat', poster: 'p2', genres: ['Suç', 'Dram'], runtime: 170, at: at(2026, 3, 2) },
    { key: 'movie:old', title: 'Old', poster: 'p3', genres: ['Dram'], runtime: 90, at: at(2025, 12, 31) },
    { key: 'D:/s/e1.mkv', title: 'Show', poster: 'p4', genres: ['Dram'], runtime: 0, at: at(2026, 3, 2) },
  ];
  const ratings = [{ title: 'Dune (2021)', at: at(2026, 3, 2), rating: 4.5, vote: 'like' }, { title: 'Heat (1995)', at: at(2026, 3, 3), rating: 3 }, { title: 'Old', at: at(2025, 1, 1), rating: 5 }];
  const listens = [...Array(6)].map((_, i) => ({ at: at(2026, 4, 1 + i, 23), title: 'Song A', artist: 'Artist X', duration: 240 })).concat([{ at: at(2026, 4, 10, 9), title: 'Song B', artist: 'Artist Y' }]);
  const reads = [{ title: 'Book 1', at: at(2026, 5, 1), pct: 1 }, { title: 'Book 2', at: at(2026, 5, 2), pct: 0.4 }, { title: 'Book 0', at: at(2025, 5, 2), pct: 1 }];
  const r = R.buildRecap({ now, films, ratings, listens, reads }, 'year');
  assert.equal(r.films.count, 3, 'Dune once, Heat, one episode; last year left out');
  assert.equal(r.films.minutes, 155 + 170);
  assert.deepEqual(r.films.genres[0], ['Dram', 2]);
  assert.deepEqual(r.films.posters, ['p1', 'p2', 'p4'].sort((a, b) => r.films.posters.indexOf(a) - r.films.posters.indexOf(b)));
  assert.equal(new Set(r.films.posters).size, r.films.posters.length);
  assert.deepEqual(r.films.longest, { title: 'Heat', runtime: 170 });
  assert.deepEqual(r.films.bingeDay, { date: '2026-03-02', count: 3 }, 'Dune (counted once, on its latest day), Heat and the episode');
  assert.equal(r.ratings.rated, 2); assert.equal(r.ratings.avg, 3.8); assert.equal(r.ratings.likes, 1);
  assert.deepEqual(r.ratings.loved, [{ title: 'Dune (2021)', rating: 4.5 }]);
  assert.equal(r.music.listens, 7); assert.deepEqual(r.music.artists[0], ['Artist X', 6]); assert.equal(r.music.peakHour, 23);
  assert.equal(r.music.minutes, Math.round((6 * 240 + 210) / 60));
  assert.deepEqual(r.music.songs[0], { title: 'Song A', artist: 'Artist X', n: 6 });
  assert.equal(r.books.finished, 1); assert.deepEqual(r.books.titles, ['Book 1']);
  assert.equal(r.streak, 6, 'six evenings of music in a row');
  assert.equal(r.totalMinutes, r.films.minutes + r.music.minutes);
  assert.equal(r.empty, false);
  const all = R.buildRecap({ now, films, ratings, listens, reads }, 'all');
  assert.equal(all.films.count, 4); assert.equal(all.books.finished, 2);
  assert.equal(R.buildRecap({ now, films: [], ratings: [], listens: [], reads: [] }, 'year').empty, true);
});
test('R03', 'the portrait follows the strongest habit', () => {
  const base = { films: { count: 0, genres: [], bingeDay: null }, books: { finished: 0 }, music: { listens: 0 }, ratings: { rated: 0 } };
  const night = [...Array(30)].map((_, i) => at(2026, 1, 1 + i, i % 2 ? 23 : 1));
  assert.equal(R.personaOf(base, night), 'night-owl');
  assert.equal(R.personaOf({ ...base, films: { count: 25, genres: [], bingeDay: null } }, []), 'marathoner');
  assert.equal(R.personaOf({ ...base, films: { count: 2, genres: [], bingeDay: { count: 3 } } }, []), 'marathoner');
  assert.equal(R.personaOf({ ...base, books: { finished: 6 } }, []), 'bookworm');
  assert.equal(R.personaOf({ ...base, music: { listens: 400 } }, []), 'melomane');
  assert.equal(R.personaOf({ ...base, ratings: { rated: 30 } }, []), 'critic');
  assert.equal(R.personaOf({ ...base, films: { count: 9, genres: [1, 2, 3, 4, 5, 6], bingeDay: null } }, []), 'explorer');
  assert.equal(R.personaOf(base, []), 'dreamer');
});
test('R04', 'heat map: whole weeks, Monday first, future days marked', () => {
  const to = at(2026, 10, 22, 12); // a Thursday
  const w = R.heatWeeks({ '2026-10-20': 3 }, to, 4);
  assert.equal(w.length, 4); assert(w.every((c) => c.length === 7));
  const last = w[3];
  assert.equal(last[0].date, '2026-10-19'); assert.equal(last[1].n, 3);
  assert.equal(last[3].future, false); assert.equal(last[4].future, true);
});
test('T01', 'tonight: time fit, moods in both languages, determinism and avoiding repeats', () => {
  assert.equal(T.timeFit(100, 100), 1); assert.equal(T.timeFit(180, 120), 0); assert(T.timeFit(60, 120) < T.timeFit(110, 120));
  assert.equal(T.timeFit(0, 120), 0.45); assert.equal(T.timeFit(100, 0), 0.6);
  assert(T.moodMatch(['Gerilim'], 'tense') && T.moodMatch(['Thriller'], 'tense') && T.moodMatch(['Bilim Kurgu'], 'epic') && !T.moodMatch(['Komedi'], 'tense'));
  const c = (key, runtime, genres, rating, order) => ({ key, title: key, kind: 'movie', runtime, genres, rating, poster: null, backdrop: null, path: key + '.mkv', order });
  const cands = [c('long', 200, ['Dram'], 9, 0), c('thriller', 115, ['Gerilim'], 7.4, 1), c('comedy', 95, ['Komedi'], 6.9, 2), c('drama', 118, ['Dram'], 8.1, 3)];
  const a = T.pickTonight(cands, { minutes: 120, mood: 'tense', seed: 1 });
  assert.equal(a.pick.key, 'thriller'); assert(a.reasons.some((r) => r.kind === 'time' && r.value === 115)); assert(a.reasons.some((r) => r.kind === 'mood'));
  assert.deepEqual(T.pickTonight(cands, { minutes: 120, mood: 'any', seed: 5 }), T.pickTonight(cands, { minutes: 120, mood: 'any', seed: 5 }));
  const first = T.pickTonight(cands, { minutes: 120, mood: 'any', seed: 3 }).pick.key;
  assert.notEqual(T.pickTonight(cands, { minutes: 120, mood: 'any', seed: 3, avoid: [first] }).pick.key, first);
  assert(!T.pickTonight(cands, { minutes: 120, mood: 'any', seed: 3 }).others.some((o) => o.key === 'long'), 'too long never offered');
  assert.equal(T.pickTonight(cands, { minutes: 60, mood: 'deep', seed: 1 }), null);
  assert.equal(T.pickTonight([], { minutes: 60, mood: 'any', seed: 1 }), null);
});
test('Q01', 'quote text: tags, sound notes, speakers and dashes go; long lines are cut on a word', () => {
  assert.equal(Q.cleanQuote('{\\i1}JOHN: Neredeydin?{\\i0}'), 'Neredeydin?');
  assert.equal(Q.cleanQuote('- Evet.\n- Hayır (şimdi değil).'), 'Evet.\nHayır (şimdi değil).');
  assert.equal(Q.cleanQuote('[KAPI ÇARPAR] <i>Köprüde</i> buluşalım.'), 'Köprüde buluşalım.');
  assert.equal(Q.cleanQuote('(GÜLER) Tamam.'), 'Tamam.');
  const long = Q.cleanQuote('kelime '.repeat(80));
  assert(long.length <= 280 && long.endsWith('…') && !long.includes('kelim…'));
  assert.equal(Q.cleanQuote(''), '');
});
test('Q02', 'wrapping and fitting: explicit breaks kept, size shrinks until it fits, ellipsis at the floor', () => {
  const measure = (s) => s.length * 10;
  assert.deepEqual(Q.wrapText('aaa bbb ccc', 75, measure), ['aaa bbb', 'ccc']);
  assert.deepEqual(Q.wrapText('one\ntwo three', 1000, measure), ['one', 'two three']);
  assert.deepEqual(Q.wrapText('supercalifragilistic x', 50, measure), ['supercalifragilistic', 'x']);
  const m2 = (s, size) => s.length * size * 0.5;
  const big = Q.fitQuote('Short line.', { w: 900, h: 400 }, m2, { max: 76, min: 34, lineHeight: 1.28 });
  assert.equal(big.size, 76); assert.equal(big.lines.length, 1);
  const mid = Q.fitQuote('word '.repeat(40).trim(), { w: 900, h: 400 }, m2, { max: 76, min: 34, lineHeight: 1.28 });
  assert(mid.size < 76 && mid.lines.length * mid.size * 1.28 <= 400);
  const cut = Q.fitQuote('word '.repeat(400).trim(), { w: 300, h: 100 }, m2, { max: 76, min: 34, lineHeight: 1.28 });
  assert.equal(cut.size, 34); assert.equal(cut.lines.length, Math.floor(100 / (34 * 1.28))); assert(cut.lines.at(-1).endsWith('…'));
  assert.deepEqual(Q.CARD_SIZE.story, [1080, 1350]);
});
test('P01', 'poster tint: vivid colours win over grey, the result stays readable behind white text', () => {
  const px = (rgb, n) => [].concat(...Array(n).fill([...rgb, 255]));
  const t = P.pickTint(px([200, 30, 30], 50).concat(px([128, 128, 128], 200)));
  assert(t[0] > t[1] + 40 && t[0] > t[2] + 40, 'red wins: ' + t);
  const l = (Math.max(...t) + Math.min(...t)) / 2 / 255; assert(l >= 0.31 && l <= 0.51, 'lightness clamped: ' + l);
  const grey = P.pickTint(px([120, 120, 120], 40));
  assert(Math.abs(grey[0] - grey[1]) < 3 && Math.abs(grey[1] - grey[2]) < 3);
  assert.equal(P.pickTint(px([255, 0, 0], 10).map((v, i) => (i % 4 === 3 ? 0 : v))), null, 'transparent pixels ignored');
  assert.equal(P.pickTint([]), null);
});
test('G01', 'scene grid captions: the line said at that moment, or one starting just after', () => {
  const cues = [{ start: 10, end: 12, text: '{\\i1}Merhaba<br>dünya{\\i0}' }, { start: 20, end: 22, text: 'Sonra' }];
  assert.equal(G.lineAt(cues, 11), 'Merhaba dünya');
  assert.equal(G.lineAt(cues, 17), 'Sonra'); assert.equal(G.lineAt(cues, 13), 'Sonra', 'the next line within 8 s comes first'); assert.equal(G.lineAt(cues, 24), 'Sonra', 'a line that just ended'); assert.equal(G.lineAt(cues, 40), ''); assert.equal(G.lineAt(undefined, 3), '');
  assert(!/[{}<>]/.test(G.lineAt(cues, 11)));
});
test('W01', 'wiring: native commands registered, screens mounted, styles loaded', () => {
  const lib = read('src-tauri/src/lib.rs');
  const handler = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf('];', lib.indexOf('generate_handler![')));
  for (const c of ['still_frame', 'save_image']) assert(new RegExp('(^|[\\s:,])' + c + '\\s*,?\\s*$', 'm').test(handler), c);
  assert(/invoke<string>\("still_frame"/.test(read('src/QuoteCard.tsx')) && /invoke<string>\("save_image"/.test(read('src/shareImage.ts')));
  assert(/data_url_bytes/.test(lib) && /image_target_ok/.test(lib), 'saving checks the picture and the file name');
  const app = read('src/App.tsx');
  assert(/<LunaRecap\b/.test(app) && /<QuoteCard\b/.test(app) && /import "\.\/LunaCreative\.css"/.test(app) && /<TranscriptPanel onQuote=/.test(app) && /cues=\{subCues\}/.test(app));
  const scr = read('src/Screens.tsx');
  assert(/<TonightPicker\b/.test(scr) && /useTint\(m\?\.poster/.test(scr));
  assert(/a:recap/.test(read('src/paletteExtras.ts')) && /a:quote/.test(read('src/paletteExtras.ts')));
  assert(/onQuote=\{onQuote\}/.test(read('src/SubtitleStudio.tsx')));
});

(async () => {
  let failed = 0;
  for (const t of tests) { try { await t.run(); console.log('ok   ' + t.id + ' ' + t.name); } catch (e) { failed++; console.log('FAIL ' + t.id + ' ' + t.name + '\n     ' + (e && e.message)); } }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
