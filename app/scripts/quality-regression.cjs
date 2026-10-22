// Behaviour checks for text matching, M3U lists, the render-error screen and native argument hardening.
// Run: npm run test:quality
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const tsOpts = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } };
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function load(file, mods = {}) {
  const m = { exports: {} };
  const js = ts.transpileModule(read(file), tsOpts).outputText;
  const req = (n) => (n in mods ? mods[n] : {});
  new Function('exports', 'module', 'require', js)(m.exports, m, req);
  return m.exports;
}
const { matchKey } = load('src/textMatch.ts');
// the real assistant matchers, cut out of Taste.tsx (not copied here)
function constDecls(file, names) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map((n) => { const st = sf.statements.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.name.getText() === n)); if (!st) throw new Error('missing ' + n); return st.getText(); }).join('\n');
}
const code = ts.transpileModule(`function f(matchKey){ ${constDecls('src/Taste.tsx', ['fold', 'norm', 'hit', 'hitWords'])}\n return { fold, norm, hit, hitWords }; }`, tsOpts).outputText;
const { hit, hitWords, norm, fold } = new Function(code + '; return f;')()(matchKey);
const m3u = load('src/M3u.tsx', { './textMatch': { matchKey } });
const slash = load('src/Slash.ts', { './i18n': { tt: (s) => s }, './textMatch': { matchKey } });
const boundary = load('src/ErrorBoundary.tsx', { react: require('react'), './i18n': { tt: (s) => s } });
const tests = []; const test = (name, run) => tests.push({ name, run });

// ---- one key for typed and stored text ----
test('matchKey: Turkish I/ı/İ/i, accents and case are one key; other scripts stay', () => {
  for (const [a, b] of [['interstellar', 'Interstellar'], ['BEIN', 'bein'], ['Işık', 'isik'], ['İstanbul', 'istanbul'], ['ISTANBUL', 'İstanbul'], ['Amélie', 'amelie'], ['Ørsted', 'orsted'], ['Straße', 'strasse']]) assert.equal(matchKey(a), matchKey(b), a + ' / ' + b);
  assert.equal(matchKey('東京'), '東京'); assert.equal(matchKey('Москва'), 'москва');
  assert.notEqual(matchKey('が'), matchKey('か'), 'a dakuten is a different letter');
  assert.equal(matchKey(''), '');
});
test('assistant matchers: "interstellar" finds "Interstellar" (was false: ı vs i)', () => {
  assert.equal(hit('interstellar', 'Interstellar'), true);
  assert.equal(hit('inception', 'Inception'), true);
  assert.equal(hit('iron man', 'Iron Man'), true);
  assert.equal(hit('bein', 'BEIN Sports'), true);
  assert.equal(hit('Interstellar', 'interstellar'), true);
  assert.equal(hit('ıron man', 'Iron Man'), true, 'dotless i typed still works');
  assert.equal(hit('dune', 'Interstellar', 'Inception'), false);
});
test('assistant matchers: empty asks match all, punctuation-only matches nothing, words may be anywhere', () => {
  assert.equal(hit('', 'x'), true); assert.equal(hit('   ', undefined), true); assert.equal(hit('!!!', 'x'), false);
  assert.equal(hitWords('duke solitude', 'Solitude', 'Duke Ellington'), true);
  assert.equal(hitWords('ıstanbul gece', 'İstanbul', 'Gece Yolu'), true);
  assert.equal(norm('東京タワー'), '東京タワー'); assert.equal(fold('Amélie — Poulain'), 'amelie poulain');
});

// ---- M3U lists ----
const ch = (text, ...rest) => m3u.parseM3u(text, ...rest);
test('M3U: a title with commas is kept whole; commas inside quotes do not end the attributes', () => {
  const [c] = ch('#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="Movies, HD",Dune, Part Two\nhttp://x/a.ts');
  assert.equal(c.name, 'Dune, Part Two'); assert.equal(c.group, 'Movies, HD');
  assert.equal(m3u.extinfTitle('#EXTINF:-1,A,B'), 'A,B'); assert.equal(m3u.extinfTitle('#EXTINF:-1 tvg-name="x, y"'), null);
});
test('M3U: a line without a title part uses tvg-name, then the address, never the whole #EXTINF line', () => {
  assert.equal(ch('#EXTINF:-1 tvg-name="Foo" group-title="News"\nhttp://x/b.ts')[0].name, 'Foo');
  assert.equal(ch('#EXTINF:-1 group-title="News"\nhttp://x/b.ts')[0].name, 'b.ts');
});
test('M3U: an empty group-title falls back to #EXTGRP; a BOM and CRLF are fine; HLS stays a stream', () => {
  assert.equal(ch('#EXTGRP:Sports\n#EXTINF:-1 group-title="",A\nhttp://x/1')[0].group, 'Sports');
  const r = ch('\uFEFF#EXTM3U\r\n#EXTINF:-1,A\r\nhttp://x/1\r\n'); assert.equal(r.length, 1); assert.equal(r[0].name, 'A');
  assert.equal(ch('#EXTM3U\n#EXT-X-TARGETDURATION:6\nseg1.ts'), 'stream');
});
test('M3U: entries relative to a web list resolve against it', () => {
  assert.equal(ch('#EXTINF:-1,A\n../a.ts', 'http://h/x/list.m3u')[0].url, 'http://h/a.ts');
});
test('M3U: entries relative to a list on disk resolve against its folder; absolute ones stay', () => {
  const urls = ch('a.mkv\n..\\Movies\\b.mkv\nC:\\abs\\c.mkv\n\\\\srv\\sh\\d.mkv\nhttp://h/e.ts\nsub/f.mkv', undefined, 'D:\\Lists\\Sub').map((c) => c.url);
  assert.deepEqual(urls, ['D:\\Lists\\Sub\\a.mkv', 'D:\\Lists\\Movies\\b.mkv', 'C:\\abs\\c.mkv', '\\\\srv\\sh\\d.mkv', 'http://h/e.ts', 'D:\\Lists\\Sub\\sub\\f.mkv']);
  assert.equal(m3u.joinLocal('D:\\Lists', '..\\..\\..\\x.mkv'), 'D:\\x.mkv', 'the drive is never popped');
  assert.equal(ch('a.mkv')[0].url, 'a.mkv', 'without a folder nothing is guessed');
});
test('M3U: channel search ignores case, accents and Turkish I', () => {
  const list = [{ name: 'BEIN Sports 1', group: 'Spor', url: '1' }, { name: 'TRT 1', group: 'Ulusal', url: '2' }, { name: 'Işık TV', group: 'Ulusal', url: '3' }];
  const f = (g, q) => m3u.filterChannels(list, g, q).map((c) => c.url);
  assert.deepEqual(f('', 'bein'), ['1']); assert.deepEqual(f('', 'isik'), ['3']); assert.deepEqual(f('', 'TRT'), ['2']);
  assert.deepEqual(f('Ulusal', ''), ['2', '3']); assert.deepEqual(f('', '  '), ['1', '2', '3']); assert.deepEqual(f('Spor', 'trt'), []);
});

// ---- slash commands ----
test('Slash commands ignore case, accents and Turkish I ("/HISTORY" and "/AI" were not found)', () => {
  const id = (t) => slash.findSlash(t)?.id ?? null;
  assert.equal(id('/HISTORY'), 'history'); assert.equal(id('/AI'), 'model'); assert.equal(id('/SETTINGS'), 'settings'); assert.equal(id('/CLEAR now'), 'new');
  assert.equal(id('/Geçmiş'), 'history'); assert.equal(id('/GEÇMİŞ'), 'history'); assert.equal(id('/yardim'), 'help'); assert.equal(id('/YARDIM'), 'help'); assert.equal(id('/KÜÇÜLT'), 'small');
  assert.equal(id('hello'), null); assert.equal(id('/nothing'), null);
  assert.deepEqual(slash.slashMatches('/HIS').map((c) => c.id), ['history']); assert.ok(slash.slashMatches('/', true).length === slash.SLASH.length); assert(slash.slashMatches('/').every(c => !c.web)); assert.equal(slash.slashMatches('/').length, slash.SLASH.filter(c => !c.web).length);
});

// ---- the same key where names and titles are compared (source structure) ----
test('Source guard: friends, folders, watched titles and slash commands compare through matchKey', () => {
  const taste = read('src/Taste.tsx'), disc = read('src/Discover.tsx');
  assert.doesNotMatch(taste, /toLocaleLowerCase\("tr"\) (===|!==) who/, 'no Turkish-lowercase compare against `who` remains');
  assert.doesNotMatch(taste, /toLocaleLowerCase\("tr"\);\s*\n?\s*const l = loadRecs/);
  assert.match(disc, /watched\.has\(same\(h\.title\)\)/); assert.match(disc, /disliked\.has\(same\(h\.title\)\)/);
  assert.match(disc, /`tid:\$\{norm\(title\)\}/, 'the stored cache key keeps its old form');
  assert.doesNotMatch(read('src/tasteFill.ts'), /toLocaleLowerCase\("tr"\)/);
});

// ---- render-error screen ----
test('ErrorBoundary: any thrown value becomes an Error; the copied detail is short and has no data', () => {
  assert.equal(boundary.ErrorBoundary.getDerivedStateFromError('boom').error.message, 'boom');
  const e = new Error('bad'); assert.equal(boundary.ErrorBoundary.getDerivedStateFromError(e).error, e);
  const long = new Error('x'.repeat(5000)); assert.ok(boundary.errorDetail(long).length <= 2000);
  assert.match(boundary.errorDetail(e), /^Error: bad/);
});

// ---- native argument hardening (source structure; Rust is compile-checked, not run, on Linux) ----
test('Source guard: yt-dlp gets the link only after "--"', () => {
  const rs = read('src-tauri/src/yt.rs');
  assert.match(rs, /fn with_url/); assert.equal((rs.match(/run\(ytdlp, &with_url\(/g) || []).length, 2, 'stream and info both use it');
  assert.doesNotMatch(rs, /run\(ytdlp, &\[[^\]]*\burl\]\)/, 'no direct positional url remains');
});
test('Source guard: removing an indexer plugin accepts a bare file name only', () => {
  const rs = read('src-tauri/src/indexers.rs'), body = rs.slice(rs.indexOf('pub fn remove'), rs.indexOf('// ---------- Go-template'));
  assert.match(body, /':'/); assert.match(body, /parent\(\) != Some\(dir\)/); assert.match(body, /"\.\."/);
});

let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS', t.name); } catch (e) { failed++; console.error('FAIL', t.name, e.message.split('\n')[0]); } }
console.log(JSON.stringify({ total: tests.length, passed: tests.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
