/* Targeted regressions for the book and music work (no real file, network request, key or user storage is touched).
 *   npm run test:book-music
 * LUNA_BASELINE=1 reads src/Music.tsx and src/Books.tsx from git HEAD and runs only the tests that exercise those
 * files' own functions, to show that the old code fails them (the new pure modules do not exist at HEAD).
 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), cp = require('node:child_process'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), baseline = process.env.LUNA_BASELINE === '1';
const readSrc = (name) => baseline && /^(Music|Books)\.tsx$/.test(name)
  ? cp.execFileSync('git', ['show', 'HEAD:app/src/' + name], { cwd: root, encoding: 'utf8', maxBuffer: 64e6 })
  : fs.readFileSync(path.join(root, 'src', name), 'utf8');
const tsOpts = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } };

// ---- storage, like the app's (a Map behind localStorage) ----
let map = new Map();
const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
const store = { get: storage.getItem, set: (k, v) => { storage.setItem(k, v); return true; }, remove: storage.removeItem, json: (k, f) => { try { return JSON.parse(map.get(k)) ?? f; } catch { return f; } } };
global.localStorage = storage; global.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };

const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8'), tsOpts).outputText;
  new Function('require', 'exports', 'module', code)((dep) => dep === './library' ? { store } : dep === '@tauri-apps/api/core' ? { invoke: async () => ({}) } : load(dep.replace('./', '')), m.exports, m);
  return (cache[name] = m.exports);
}

// ---- a function taken out of a source file by name (so the real code runs, not a copy) ----
function extract(file, name) {
  const text = readSrc(file);
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  ast.forEachChild(function walk(n) { if (!found && ts.isFunctionDeclaration(n) && n.name && n.name.text === name) found = n; else if (!found && ts.isVariableDeclaration(n) && n.name.getText() === name && n.initializer) found = 'const ' + name + ' = ' + n.initializer.getText() + ';'; if (!found) n.forEachChild(walk); });
  assert(found, 'function not found: ' + name);
  return typeof found === 'string' ? found : found.getText().replace(/^export\s+/, '');
}
function instantiate(file, name, env, extraLets = '', exposeLets = []) {
  const code = ts.transpileModule(extract(file, name), tsOpts).outputText;
  const keys = Object.keys(env);
  const get = exposeLets.map((l) => `get ${l}(){return ${l}},set ${l}(v){${l}=v}`).join(',');
  return new Function(...keys, `${extraLets}\n${code}\nreturn { fn: ${name}${get ? ', state: {' + get + '}' : ''} };`)(...keys.map((k) => env[k]));
}

// ---- a tiny hook runtime: useState / useEffect / useMemo / useRef, enough to run a data hook ----
function hookRuntime(callHook) {
  const hooks = []; let idx = 0, queued = [], dirty = false, out;
  const api = {
    useState(init) {
      const i = idx++; if (!hooks[i]) hooks[i] = { v: typeof init === 'function' ? init() : init };
      const h = hooks[i];
      return [h.v, (n) => { const nv = typeof n === 'function' ? n(h.v) : n; if (!Object.is(nv, h.v)) { h.v = nv; dirty = true; } }];
    },
    useEffect(fn, deps) {
      const i = idx++, h = hooks[i];
      const changed = !h || !deps || deps.some((d, k) => !Object.is(d, h.deps?.[k]));
      if (!h) hooks[i] = { deps };
      if (changed) queued.push(() => { const hh = hooks[i]; if (typeof hh.cleanup === 'function') hh.cleanup(); hh.deps = deps; hh.cleanup = fn(); });
    },
    useMemo(fn, deps) { const i = idx++, h = hooks[i]; if (!h || deps.some((d, k) => !Object.is(d, h.deps[k]))) hooks[i] = { v: fn(), deps }; return hooks[i].v; },
    useRef(init) { const i = idx++; if (!hooks[i]) hooks[i] = { v: { current: init } }; return hooks[i].v; },
  };
  const render = () => { for (let n = 0; n < 30; n++) { idx = 0; dirty = false; out = callHook(api); const q = queued; queued = []; q.forEach((f) => f()); if (!dirty && !queued.length) break; } return out; };
  return { render, unmount: () => hooks.forEach((h) => typeof h?.cleanup === 'function' && h.cleanup()) };
}
const settle = async (rt) => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); rt.render(); } return rt.render(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

const tests = []; const test = (name, run, opts = {}) => tests.push({ name, run, hookOnly: !!opts.hookOnly });
const tracks = (n) => Array.from({ length: n }, (_, i) => ({ path: '/m/' + i + '.mp3', title: 'T' + i, artist: 'A', album: 'B', albumArtist: 'A', duration: 1 }));

// ---------------- music: the library hook ----------------
function musicHook() {
  let current; const calls = [];
  const env = {
    useState: (...a) => current.useState(...a), useEffect: (...a) => current.useEffect(...a), useMemo: (...a) => current.useMemo(...a),
    loadMusicFolders: () => store.json('musicFolders', []), store,
    invoke: async (cmd, args) => { calls.push(args); return env.scan(args); }, scan: async () => [],
    albumKey: (t) => t.albumArtist + '|' + t.album, tt: (s) => s, window: { addEventListener() {}, removeEventListener() {} },
  };
  const inst = instantiate('Music.tsx', 'useMusicLibrary', env, 'let libCache=null;const libSubs=new Set();', ['libCache']);
  const rt = hookRuntime((api) => { current = api; return inst.fn(); });
  return { env, rt, calls, inst, state: inst.state };
}
test('music hook: "scanning" does not stay on when the folders are removed during a scan', async () => {
  map = new Map([['musicFolders', '["A"]']]);
  const h = musicHook(); const d = deferred(); h.env.scan = () => d.promise;
  let r = h.rt.render(); assert.equal(r.scanning, true);
  r.setFolders([]); r = await settle(h.rt);
  assert.equal(r.scanning, false, 'the add-folder button would stay disabled');
  d.resolve(tracks(2)); r = await settle(h.rt);
  assert.equal(r.scanning, false); assert.deepEqual(r.tracks, []);
}, { hookOnly: true });
test('music hook: "scanning" does not stay on when a cached folder set is shown while a scan is pending', async () => {
  map = new Map([['musicFolders', '["A"]']]);
  const h = musicHook(); h.env.scan = async () => tracks(1);
  let r = h.rt.render(); r = await settle(h.rt); assert.equal(r.scanning, false); assert.equal(r.tracks.length, 1);
  const d = deferred(); h.env.scan = () => d.promise;
  r.setFolders(['B']); r = await settle(h.rt); assert.equal(r.scanning, true);
  r.setFolders(['A']); r = await settle(h.rt);
  assert.equal(r.scanning, false); assert.equal(r.tracks.length, 1);
}, { hookOnly: true });
test('music hook: a failed scan is reported (not an empty library without a word) and a retry recovers', async () => {
  map = new Map([['musicFolders', '["A"]']]);
  const h = musicHook(); h.env.scan = async () => { throw Error('drive gone'); };
  let r = h.rt.render(); r = await settle(h.rt);
  assert.equal(r.scanError, true); assert.equal(r.scanning, false); assert.deepEqual(r.tracks, []);
  h.env.scan = async () => tracks(3); r.rescan(); r = await settle(h.rt);
  assert.equal(r.scanError, false); assert.equal(r.tracks.length, 3);
}, { hookOnly: true });
test('music hook: a scan answered after the folders changed is dropped', async () => {
  map = new Map([['musicFolders', '["A"]']]);
  const h = musicHook(); const d = deferred(); h.env.scan = () => d.promise;
  let r = h.rt.render();
  store.set('musicFolders', '["B"]'); r.setFolders(['B']); h.env.scan = async () => tracks(1); r = await settle(h.rt);
  d.resolve(tracks(9)); r = await settle(h.rt);
  assert.equal(r.tracks.length, 1);
}, { hookOnly: true });

// ---------------- books: the library hook ----------------
function bookHook() {
  let current;
  const env = {
    useState: (...a) => current.useState(...a), useEffect: (...a) => current.useEffect(...a), useMemo: (...a) => current.useMemo(...a),
    loadBookFolders: () => store.json('bookFolders', []), store, withBookInfo: (b) => b, window: { addEventListener() {}, removeEventListener() {} },
    invoke: async (cmd, args) => env.scan(args), scan: async () => [],
  };
  const inst = instantiate('Books.tsx', 'useBookLibrary', env, 'let libCache=null;const libSubs=new Set();const libChanged=()=>{libCache=null;libSubs.forEach((f)=>f());};', ['libCache']);
  const rt = hookRuntime((api) => { current = api; return inst.fn(); });
  return { env, rt };
}
const books = (n) => Array.from({ length: n }, (_, i) => ({ path: '/b/' + i + '.epub', kind: 'epub', title: 'B' + i, author: 'X' }));
test('book hook: "scanning" does not stay on when a cached folder set is shown while a scan is pending', async () => {
  map = new Map([['bookFolders', '["A"]']]);
  const h = bookHook(); h.env.scan = async () => books(1);
  let r = h.rt.render(); r = await settle(h.rt); assert.equal(r.books.length, 1);
  const d = deferred(); h.env.scan = () => d.promise;
  r.setFolders(['B']); r = await settle(h.rt); assert.equal(r.scanning, true);
  r.setFolders(['A']); r = await settle(h.rt);
  assert.equal(r.scanning, false);
}, { hookOnly: true });
test('book hook: a failed scan is reported and a retry recovers', async () => {
  map = new Map([['bookFolders', '["A"]']]);
  const h = bookHook(); h.env.scan = async () => { throw Error('gone'); };
  let r = h.rt.render(); r = await settle(h.rt);
  assert.equal(r.scanError, true); assert.equal(r.scanning, false);
  h.env.scan = async () => books(2); r.rescan(); r = await settle(h.rt);
  assert.equal(r.scanError, false); assert.equal(r.books.length, 2);
}, { hookOnly: true });

// ---------------- music: shuffle off with a song in the queue twice ----------------
test('shuffle off restores the very item that is playing, also when the same song is queued twice', () => {
  const m = load('musicModel');
  const A1 = { src: 'a', title: 'first' }, B = { src: 'b', title: 'B' }, A2 = { src: 'a', title: 'second' }, C = { src: 'c', title: 'C' };
  const P = { queue: [A2, C, A1, B], original: [A1, B, A2, C], index: 0, shuffle: true };
  const inst = instantiate('Music.tsx', 'setShuffle', { P, changed: () => {}, restoreIndex: m.restoreIndex });
  inst.fn(false);
  assert.equal(P.shuffle, false); assert.deepEqual(P.queue, [A1, B, A2, C]);
  assert.equal(P.index, 2, 'the second "a" is playing: the next song is C, not B');
  assert.equal(P.queue[P.index + 1], C);
}, { hookOnly: true });
test('shuffle on keeps the playing song first and off brings the original order back at the same song', () => {
  const m = load('musicModel');
  const q = ['a', 'b', 'c', 'd', 'e'].map((s) => ({ src: s, title: s }));
  const P = { queue: [...q], original: [], index: 2, shuffle: false };
  const inst = instantiate('Music.tsx', 'setShuffle', { P, changed: () => {}, restoreIndex: m.restoreIndex });
  inst.fn(true);
  assert.equal(P.queue[0], q[2]); assert.equal(P.index, 0); assert.equal(P.queue.length, 5);
  inst.fn(false);
  assert.deepEqual(P.queue, q); assert.equal(P.index, 2);
}, { hookOnly: true });

// ---------------- music: pure helpers ----------------
test('music search ignores accents, Turkish dots and case, and every word may be in another field', () => {
  const m = load('musicModel');
  assert.equal(m.searchFold('Şarkı İÇİN Işık Ğ'), 'sarki icin isik g');
  assert(m.matchesSearch(m.searchFold('sarki'), 'Şarkı Sözleri'));
  assert(m.matchesSearch(m.searchFold('TARKAN simarik'), 'Şımarık', 'Tarkan'));
  assert(m.matchesSearch('', 'anything')); assert(m.matchesSearch(m.searchFold('   '), undefined));
  assert(!m.matchesSearch(m.searchFold('tarkan yok'), 'Şımarık', 'Tarkan'));
});
test('playlist row playing: only the list the queue came from, and only the exact row', () => {
  const m = load('musicModel');
  const items = [{ src: 'a' }, { src: 'b' }, { src: 'a' }];
  assert.equal(m.playingRowIndex(items, { src: 'a' }, 2, false, false), -1, 'another list sharing the song is not playing');
  assert.equal(m.playingRowIndex(items, undefined, 0, true, false), -1);
  assert.equal(m.playingRowIndex(items, { src: 'a' }, 2, true, false), 2, 'the second row, not the first one with the same address');
  assert.equal(m.playingRowIndex(items, { src: 'a' }, 0, true, false), 0);
  assert.equal(m.playingRowIndex(items, { src: 'a' }, 3, true, true), 0, 'shuffled queue: positions no longer match, first row with that song');
  assert.equal(m.playingRowIndex(items, { src: 'z' }, 0, true, false), -1);
});
test('seek keys: arrows 5 s (Shift 15 s), Page keys 30 s, others none', () => {
  const m = load('musicModel');
  assert.equal(m.seekKeyDelta('ArrowRight'), 5); assert.equal(m.seekKeyDelta('ArrowLeft'), -5);
  assert.equal(m.seekKeyDelta('ArrowRight', true), 15); assert.equal(m.seekKeyDelta('PageDown'), -30);
  assert.equal(m.seekKeyDelta('a'), null);
});

// ---------------- books: reader helpers ----------------
test('a saved place that no longer exists falls back to the next place, last to the book start', async () => {
  const r = load('bookReaderModel'); const shown = [];
  const display = async (t) => { shown.push(t); if (t === 'epubcfi(/6/99!/4)' || t === 'epubcfi(/6/98!/4)') throw Error('No Section Found'); };
  const out = await r.displayFirstWorking(display, ['epubcfi(/6/99!/4)', 'epubcfi(/6/98!/4)']);
  assert.deepEqual(shown, ['epubcfi(/6/99!/4)', 'epubcfi(/6/98!/4)', undefined]); assert.equal(out.skipped, 2); assert.equal(out.target, undefined);
  shown.length = 0;
  const out2 = await r.displayFirstWorking(display, ['epubcfi(/6/99!/4)', 'epubcfi(/6/2!/4)']);
  assert.deepEqual(shown, ['epubcfi(/6/99!/4)', 'epubcfi(/6/2!/4)']); assert.equal(out2.target, 'epubcfi(/6/2!/4)');
  shown.length = 0;
  await r.displayFirstWorking(display, [undefined, undefined]); assert.deepEqual(shown, [undefined]);
  await assert.rejects(() => r.displayFirstWorking(async () => { throw Error('broken book'); }, ['x']), /broken book/);
});
test('reading progress before the page positions exist comes from the chapter and the page in it', () => {
  const r = load('bookReaderModel');
  assert.equal(r.spineProgress(undefined, 10), undefined); assert.equal(r.spineProgress(2, 0), undefined);
  assert.equal(r.spineProgress(0, 10, 1, 4), 0); assert.equal(r.spineProgress(2, 10, 1, 4), 0.2);
  assert.equal(r.spineProgress(2, 10, 3, 4), 0.25); assert.equal(r.spineProgress(9, 10, 4, 4, true), 1);
  assert.equal(r.spineProgress(99, 10, 1, 1), undefined);
});

// ---------------- books: lists and shelves ----------------
test('library lists follow the current reading state: a finished book leaves "Okuyorum", the reading plan stays apart', () => {
  const m = load('bookLibraryModel');
  const all = [{ path: 'a', title: 'Psikoloji', author: 'Ali' }, { path: 'b', title: 'Felsefe', author: 'Veli' }, { path: 'c', title: 'Elif', author: 'Ayşe' }];
  const pos = { a: 0.5, b: 0, c: 0.995 }; const votes = {};
  const env = { inLibrary: new Set(['a', 'b']), later: ['b', 'c'], shelves: { a: ['Psikoloji', 'Felsefe'], b: ['Felsefe'] }, progress: (b) => pos[b.path] ?? 0, finished: (b) => (pos[b.path] ?? 0) >= 0.99, vote: (b) => votes[b.path] };
  const list = (o) => m.visibleBooks(all, { shelf: 'all', topic: '', query: '', sort: 'title', recent: [], env, ...o }).map((b) => b.path);
  assert.deepEqual(list({ shelf: 'all' }), ['b', 'a']); assert.deepEqual(list({ shelf: 'reading' }), ['a']); assert.deepEqual(list({ shelf: 'done' }), ['c']);
  pos.a = 1; assert.deepEqual(list({ shelf: 'reading' }), [], 'the same call, new state: no stale list'); assert.deepEqual(list({ shelf: 'done' }), ['c', 'a']);
  assert.deepEqual(list({ shelf: 'later' }), ['c', 'b'], 'Elif, Felsefe: the plan is its own list, whatever the reading state');
  votes.b = 'like'; assert.deepEqual(list({ shelf: 'liked' }), ['b']); delete votes.b; assert.deepEqual(list({ shelf: 'liked' }), []);
  assert.deepEqual(list({ topic: 'Felsefe' }), ['b', 'a']); assert.deepEqual(list({ topic: 'Psikoloji' }), ['a']);
  assert.deepEqual(list({ query: 'psikoloji' }), ['a']); assert.deepEqual(list({ query: 'AYSE', shelf: 'later' }), ['c'], 'accents do not matter');
  assert.deepEqual(list({ sort: 'recent', recent: ['b', 'a'] }), ['b', 'a']);
  assert.equal(m.activeTopic('Silinmiş', ['Felsefe']), ''); assert.equal(m.activeTopic('Felsefe', ['Felsefe']), 'Felsefe');
  assert.deepEqual(m.topicCounts(['a', 'b', 'a'], env.shelves, ['Boş', 'Felsefe', 'Psikoloji']), { Boş: 0, Felsefe: 2, Psikoloji: 1 });
});
function bookShelves() {
  map = new Map([['bookShelves', JSON.stringify({ a: ['Psikoloji', 'Felsefe'], b: ['Psikoloji'], c: ['Felsefe'] })], ['bookShelfNames', '["Psikoloji","Felsefe","Boş"]'], ['bookWantToRead', '["a","c"]'], ['bookPos:a', '{"pct":0.4,"at":1}'], ['bookDiary', '{"x":{"vote":"like"}}']]);
  return load('BookData');
}
test('deleting a shelf removes only its label: reading state, reading plan, positions and notes stay', () => {
  const d = bookShelves(); const keep = ['bookWantToRead', 'bookPos:a', 'bookDiary'].map((k) => [k, map.get(k)]);
  d.deleteShelf('Psikoloji');
  assert.deepEqual(JSON.parse(map.get('bookShelves')), { a: ['Felsefe'], c: ['Felsefe'] }, 'a book left with no shelf has no entry');
  assert.deepEqual(JSON.parse(map.get('bookShelfNames')), ['Boş', 'Felsefe']);
  assert.deepEqual(keep.map(([k]) => map.get(k)), keep.map(([, v]) => v));
  d.deleteShelf('Boş'); assert(!JSON.parse(map.get('bookShelfNames')).includes('Boş'));
  assert.throws(() => d.deleteShelf('Yok'), /bulunamadı/);
});
test('deleting or renaming a shelf with damaged shelf data stops without writing', () => {
  const d = bookShelves(); map.set('bookShelves', '{"a":42}'); const before = [...map];
  assert.throws(() => d.deleteShelf('Felsefe'), /hasarlı/); assert.throws(() => d.renameShelf('Felsefe', 'Yeni'), /hasarlı/);
  assert.deepEqual([...map], before);
});
test('renaming a shelf renames it for every book and refuses an existing name', () => {
  const d = bookShelves();
  d.renameShelf('Felsefe', 'Düşünce');
  assert.deepEqual(JSON.parse(map.get('bookShelves')), { a: ['Psikoloji', 'Düşünce'], b: ['Psikoloji'], c: ['Düşünce'] });
  assert(JSON.parse(map.get('bookShelfNames')).includes('Düşünce') && !JSON.parse(map.get('bookShelfNames')).includes('Felsefe'));
  const before = [...map];
  assert.throws(() => d.renameShelf('Düşünce', 'Psikoloji'), /zaten/); assert.throws(() => d.renameShelf('Yok', 'X'), /bulunamadı/); assert.throws(() => d.renameShelf('Düşünce', ' '), /gerekli/);
  assert.deepEqual([...map], before);
  assert.equal(map.get('bookWantToRead'), '["a","c"]');
});

test('book right-click menu: "Okunacaklara ekle/çıkar" changes only the reading plan and reports a damaged record', () => {
  const calls = []; let later = []; let alerted = null; let boom = false;
  const env = {
    askEntries: () => [], tt: (s) => s, extraText: (tr) => tr, manageBook: () => {}, collectEntry: () => 'collect', deleteEntries: () => [],
    laterBooks: () => later, organizeBooks: (e) => { if (boom) throw Error('Kitap kaydı hasarlı'); calls.push(e); }, alert: (m) => { alerted = m; },
  };
  const { fn } = instantiate('Books.tsx', 'bookMenu', env);
  const find = (label) => fn({ path: 'a.epub', title: 'A', author: 'X' }, () => {}, () => {}).find((e) => e && e.label === label);
  find('Okunacaklara ekle').act();
  assert.deepEqual(calls, [[{ path: 'a.epub', shelves: [], readLater: true }]], 'no shelf and no reading-state field is written');
  later = ['a.epub']; calls.length = 0;
  find('Okunacaklardan çıkar').act();
  assert.deepEqual(calls, [[{ path: 'a.epub', shelves: [], readLater: false }]]);
  boom = true; later = []; find('Okunacaklara ekle').act();
  assert(/hasarlı/.test(alerted), 'a damaged record is told, not swallowed');
});
test('film start releases the read-aloud audio right after the music is suspended (source-structure check of App.tsx, not a runtime test)', () => {
  const text = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let ok = false;
  (function walk(n) {
    if (ts.isBlock(n)) { const st = n.statements; for (let i = 0; i + 1 < st.length; i++) if (/^suspendMusic\(\);?$/.test(st[i].getText().trim()) && /^if \(ttsActive\(\)\) ttsStop\(\);?$/.test(st[i + 1].getText().trim())) ok = true; }
    n.forEachChild(walk);
  })(ast);
  assert(ok, 'ttsStop() must follow suspendMusic() on the film load path');
  assert(/import \{ ttsActive, ttsStop \} from "\.\/ReadAloud";/.test(text));
});

(async () => {
  let failed = 0, run = 0;
  for (const t of tests) {
    if (baseline && !t.hookOnly) continue;
    run++;
    try { await t.run(); console.log('PASS', t.name); } catch (e) { failed++; console.error('FAIL', t.name, '\n   ', String(e.message || e).split('\n').slice(0, 3).join(' | ')); }
  }
  console.log(JSON.stringify({ baseline, total: run, passed: run - failed, failed }));
  process.exit(failed ? 1 : 0);
})();
