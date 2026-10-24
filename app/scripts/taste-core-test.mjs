// Checks the pure taste engine (src/tasteCore.ts) in Node: Letterboxd export and RSS reading,
// merging into the diary, the model and its accuracy, matching, reviews, friends, MMR.
// Run from app/:  node scripts/taste-core-test.mjs
import ts from "typescript";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/tasteCore.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const out = join(mkdtempSync(join(tmpdir(), "taste-")), "tasteCore.mjs");
writeFileSync(out, js);
const T = await import(pathToFileURL(out).href);

let failed = 0, passed = 0;
const ok = (cond, msg, extra) => { if (cond) { passed++; console.log("  ok  " + msg); } else { failed++; console.log("  FAIL " + msg + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); } };

console.log("Letterboxd export");
const files = [
  ["letterboxd-user-2026/watched.csv", "Date,Name,Year,Letterboxd URI\n2020-01-02,Arrival,2016,https://boxd.it/a1\n2021-03-04,Sicario,2015,https://boxd.it/a2\n2022-05-06,Cats,2019,https://boxd.it/a3\n2022-05-07,Paprika,2006,https://boxd.it/a4\n"],
  ["letterboxd-user-2026/ratings.csv", "Date,Name,Year,Letterboxd URI,Rating\n2020-01-02,Arrival,2016,https://boxd.it/a1,4.5\n2022-05-06,Cats,2019,https://boxd.it/a3,0.5\n2021-03-04,Sicario,2015,https://boxd.it/a2,4\n"],
  ["letterboxd-user-2026/diary.csv", "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2020-01-02,Arrival,2016,https://boxd.it/d1,4,,\"sinema, ağlattı\",2020-01-01\n2024-02-02,Arrival,2016,https://boxd.it/d2,4.5,Yes,,2024-02-01\n2021-03-04,Sicario,2015,https://boxd.it/d3,4,No,,2021-03-03\n"],
  ["letterboxd-user-2026/reviews.csv", "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2024-02-02,Arrival,2016,https://boxd.it/d2,4.5,Yes,\"Müzikleri muhteşem, sonu beni ağlattı.\nOyunculuk da çok iyi, \"\"Amy Adams\"\" harika.\",,2024-02-01\n2022-05-06,Cats,2019,https://boxd.it/r9,0.5,,\"The pacing is boring and the visuals are awful. Not good at all.\",,2022-05-06\n"],
  ["letterboxd-user-2026/likes/films.csv", "Date,Name,Year,Letterboxd URI\n2020-01-02,Arrival,2016,https://boxd.it/a1\n2022-05-07,Paprika,2006,https://boxd.it/a4\n"],
  ["letterboxd-user-2026/watchlist.csv", "Date,Name,Year,Letterboxd URI\n2023-01-01,Stalker,1979,https://boxd.it/w1\n2023-01-02,Perfect Days,2023,https://boxd.it/w2\n"],
  ["letterboxd-user-2026/deleted/diary.csv", "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2019-01-01,Ghost Film,2000,https://boxd.it/x,5,,,2019-01-01\n"],
  ["letterboxd-user-2026/profile.csv", "Date Joined,Username,Given Name\n2019-01-01,me,Me\n"],
  ["letterboxd-user-2026/lists/sevdiklerim.csv", "Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2023-01-01,Sevdiklerim,,https://boxd.it/l,\n\nPosition,Name,Year,URL,Description\n1,Arrival,2016,https://boxd.it/a1,\n"],
];
const ex = T.readLbExport(files);
const arrival = ex.films.find((f) => f.title === "Arrival");
ok(ex.films.length === 4, "4 films (deleted/ and lists/ left out)", ex.films.map((f) => f.title));
ok(!ex.films.some((f) => f.title === "Ghost Film"), "deleted entries skipped");
ok(arrival.stars === 4.5 && arrival.liked && arrival.logs === 2 && arrival.rewatches === 1, "Arrival: 4.5★ from ratings.csv, liked, 2 logs, 1 rewatch", arrival);
ok(arrival.watched === T.isoDay("2024-02-01"), "Arrival: latest watched date");
ok(arrival.review.includes('"Amy Adams"') && arrival.review.includes("\n"), "review keeps quotes and line breaks");
ok(arrival.tags.includes("ağlattı"), "tags read", arrival.tags);
ok(ex.watchlist.length === 2 && ex.watchlist[0].title === "Stalker", "watchlist read");
ok(ex.films.find((f) => f.title === "Cats").stars === 0.5, "half star kept");

console.log("RSS");
const rss = T.parseLbRss(readFileSync(join(here, "fixtures/letterboxd-rss-sample.xml"), "utf8"));
ok(rss.length >= 40, "real RSS: diary items parsed", rss.length);
ok(rss.every((e) => e.title && e.watched), "every RSS item has title and watched date");
ok(rss.filter((e) => e.tmdbId).length >= rss.length - 2, "RSS items carry TMDB ids", rss.filter((e) => !e.tmdbId).map((e) => e.title));
ok(rss.some((e) => e.stars) && rss.some((e) => e.liked), "ratings and likes read");
const review = T.reviewText('<p><img src="x.jpg"/></p> <p>Watched on Friday October 16, 2026.</p> <p>This review may contain spoilers.</p> <p>Loved the &amp; score.<br/>Second line.</p>');
ok(review.text === "Loved the & score.\nSecond line." && review.spoiler, "RSS description → review text and spoiler flag", review);

console.log("Merge into diary");
const now = Date.UTC(2026, 9, 23);
const diary0 = { "arrival|2016": { title: "Arrival", year: "2016", rating: 8, at: 1, note: "kendi notum" }, "paprika|": { title: "Paprika", at: 1, vote: "dislike" } };
const m1 = T.mergeIntoDiary(diary0, ex.films, now);
ok(m1.added === 2 && m1.diary["sicario|2015"].rating === 8 && m1.diary["cats|2019"].rating === 1, "new films added with stars×2", m1);
ok(m1.diary["arrival|2016"].rating === 8 && m1.diary["arrival|2016"].note === "kendi notum", "a rating set in Luna is kept, note untouched");
ok(m1.diary["arrival|2016"].review && m1.diary["arrival|2016"].rewatch === 1, "review and rewatch added to existing entry");
ok(m1.diary["paprika|"].vote === "dislike" && m1.diary["paprika|"].year === "2006", "yearless entry matched, its vote kept, year filled");
const m2 = T.mergeIntoDiary(m1.diary, ex.films, now);
ok(m2.added === 0 && m2.updated === 0, "re-import changes nothing", m2);
const changed = ex.films.map((f) => (f.title === "Sicario" ? { ...f, stars: 2.5 } : f));
const m3 = T.mergeIntoDiary(m2.diary, changed, now);
ok(m3.diary["sicario|2015"].rating === 5, "a Letterboxd rating change is followed when Luna's rating is still the imported one");
const user = { ...m3.diary, "sicario|2015": { ...m3.diary["sicario|2015"], rating: 9 } };
const m4 = T.mergeIntoDiary(user, ex.films, now);
ok(m4.diary["sicario|2015"].rating === 9, "…but not when the user changed it in Luna");

console.log("Model");
// a made-up user: loves director 1 and theme 10, dislikes genre 27 (horror), slightly likes the 1970s
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (n, from) => Array.from({ length: n }, () => from[Math.floor(rnd() * from.length)]);
const film = (i) => ({ t: "F" + i, y: 1950 + Math.floor(rnd() * 75), g: [...new Set(pick(2, [18, 27, 35, 878, 53, 80, 10749]))], k: [...new Set(pick(4, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]))],
  d: [Math.floor(rnd() * 12) + 1], w: [], a: [...new Set(pick(3, [100, 101, 102, 103, 104, 105, 106, 107]))], l: rnd() < 0.7 ? "en" : "ko", c: ["US"], rt: 80 + Math.floor(rnd() * 90), va: 6 + rnd() * 2, vc: 1000 });
const truth = (f) => 6 + (f.d[0] === 1 ? 2.2 : 0) + (f.k.includes(10) ? 1.4 : 0) - (f.g.includes(27) ? 2.4 : 0) + (f.y >= 1970 && f.y < 1980 ? 0.6 : 0) + (rnd() - 0.5) * 1.6;
const films = Array.from({ length: 260 }, (_, i) => film(i));
const ratings = films.map((f) => Math.max(1, Math.min(10, Math.round(truth(f)))));
const stats = T.ratingStats(ratings);
const samples = films.map((f, i) => ({ key: "f" + i, sig: T.signalOf({ title: f.t, rating: ratings[i], at: now, watched: now }, stats), w: 1, rating: ratings[i], feat: f }));
const model = T.buildModel(samples, stats, now);
ok(model.acc.rho > 0.45, "cross-validated Spearman ρ > 0.45", model.acc);
ok(model.acc.auc > 0.75, "cross-validated AUC > 0.75", model.acc);
ok(model.f["d:1"][0] > 0.3 && model.f["g:27"][0] < -0.2 && model.f["k:10"][0] > 0.1, "learned: director 1 +, horror −, theme 10 +", { d1: model.f["d:1"], g27: model.f["g:27"], k10: model.f["k:10"] });
const good = T.matchFilm(model, { t: "Good", y: 1975, g: [18], k: [10, 11], d: [1], w: [], a: [100], l: "en", c: ["US"], rt: 120 });
const bad = T.matchFilm(model, { t: "Bad", y: 2015, g: [27], k: [13], d: [7], w: [], a: [105], l: "en", c: ["US"], rt: 95 });
ok(good.pct > 85 && bad.pct < 25, "match: liked recipe high, disliked recipe low", { good: good.pct, bad: bad.pct });
ok(good.stars > bad.stars && good.stars >= 3.5, "expected stars follow the match", { good: good.stars, bad: bad.stars });
ok(good.plus[0].key === "d:1" && bad.minus.some((r) => r.key === "g:27"), "reasons name the director and the genre", { plus: good.plus, minus: bad.minus });
const tops = T.topFeatures(model, "d", 3);
ok(tops.plus[0][0] === "d:1", "top director is director 1", tops.plus);
ok(T.percentile([0, 1, 2], 1.5) === 0.75 && T.percentile([0, 1, 2], -1) === 0, "percentile interpolation");
const dg = T.digest(model, (k) => k);
ok(dg.includes("Yönetmenler: d:1") && dg.includes("ortalama"), "assistant digest", dg.split("\n")[0]);

console.log("Signals");
const s = T.ratingStats([6, 8, 10]);
ok(T.signalOf({ title: "x", at: 1, vote: "like" }, s) === 0.9 && T.signalOf({ title: "x", at: 1, vote: "dislike" }, s) === -1.2, "votes without rating");
ok(T.signalOf({ title: "x", at: 1 }, s) === null && T.signalOf({ title: "x", at: 1, watched: 1 }, s) === 0.12, "watched only is a weak yes, nothing is nothing");
ok(T.recency(now, now) === 1 && Math.abs(T.recency(now - 4 * 365 * 86400000, now) - 0.5) < 1e-9 && T.recency(1, now) === 0.35, "recency half-life 4 years, floor 0.35");

console.log("Reviews");
const ins = T.analyseReviews([
  { text: "Müzikleri muhteşem. Sonu beni ağlattı.\nOyunculuk da çok iyi, Amy Adams harika.", rating: 9 },
  { text: "The pacing is boring and the visuals are awful. Not good at all.", rating: 1 },
  { text: "Senaryo zayıf, tempo çok yavaş. Görüntüler güzel değil.", rating: 4 },
  { text: "Beautiful cinematography, the score is stunning. Story didn't work for me though, not great.", rating: 7 },
]);
const asp = Object.fromEntries(ins.aspects.map((a) => [a.aspect, a]));
ok(ins.n === 4 && ins.turkish === 2, "4 reviews, 2 Turkish", { n: ins.n, tr: ins.turkish });
ok(asp.sound.pos >= 2 && asp.pace.neg >= 2, "music praised, pace criticised", { sound: asp.sound, pace: asp.pace });
ok(asp.visuals.neg >= 2 && asp.visuals.pos >= 1, "visuals: 'güzel değil' and 'awful' negative, 'beautiful' positive", asp.visuals);
ok(asp.story.neg >= 2, "story: 'zayıf' and \"didn't work… not great\" negative", asp.story);
ok(ins.toneVsRating > 0.5, "review tone follows the stars", ins.toneVsRating);
ok(T.polarity(T.tokens("not good")) === -1 && T.polarity(T.tokens("güzel değil")) === -1 && T.polarity(T.tokens("hiç sıkıcı değil")) >= 0, "negation both ways");

console.log("Friends, quality, diversity");
const mine = new Map([["a|1", 9], ["b|2", 8], ["c|3", 3], ["d|4", 10], ["e|5", 2], ["f|6", 6], ["g|7", 7], ["h|8", 4]]);
const twin = new Map([["a|1", 4.5], ["b|2", 4], ["c|3", 1.5], ["d|4", 5], ["e|5", 1], ["f|6", 3], ["g|7", 3.5], ["h|8", 2]]);
const opposite = new Map([...twin].map(([k, v]) => [k, 5.5 - v]));
const ct = T.compat(mine, twin), co = T.compat(mine, opposite);
ok(ct.pct > 70 && co.pct < 30 && ct.n === 8, "friend compatibility: twin high, opposite low", { twin: ct.pct, opposite: co.pct });
ok(ct.agree.includes("d") && co.split.length > 0, "agreements and splits named", { agree: ct.agree, split: co.split });
ok(T.compat(mine, new Map([["a|1", 4]])).pct === null, "one shared film: no verdict");
ok(T.bayes(9, 5) < T.bayes(8, 20000) && Math.abs(T.bayes(0, 0) - 6.6) < 1e-9, "Bayesian quality: few votes pulled to the prior");
const items = [{ id: 1, s: 1, f: ["g:1", "k:1"] }, { id: 2, s: 0.99, f: ["g:1", "k:1"] }, { id: 3, s: 0.8, f: ["g:2", "k:2"] }];
const div = T.mmr(items, (x) => x.s, (a, b) => T.jaccard(a.f, b.f), 2);
ok(div.map((x) => x.id).join() === "1,3", "MMR skips the near-duplicate", div.map((x) => x.id));
ok(T.diaryKey("Arrival (2016)") === "arrival|2016" && T.diaryKey("İnek Şaban", "1978") === "inek şaban|1978", "diary key matches Taste.tsx");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
