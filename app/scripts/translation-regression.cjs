/* Pure command/model validation and an in-memory text-node fixture; no Windows UI automation. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const base = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(base, 'src/browserTranslation.ts'), 'utf8');
const ast = ts.createSourceFile('translation.ts', source, ts.ScriptTarget.Latest, true);
function pure(name) {
  const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  return new Function(ts.transpileModule(declaration.getText().replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText + ';return ' + name)();
}
const intent = pure('translationIntent'), batches = pure('translationBatches'), validate = pure('validateTranslationResult');
function dom(texts) {
  const window = {}, location = { href: 'https://example.org/film' };
  const rows = texts.map(text => ({ textContent: text, isConnected: true, parentElement: { closest: () => null, getClientRects: () => [1] } }));
  const document = { body: {}, createTreeWalker: () => { let i = 0; return { nextNode: () => rows[i++] || null }; } };
  const script = fs.readFileSync(path.join(base, 'src/browserTranslatePage.js'), 'utf8').replace('export function', 'function');
  const run = new Function('window', 'document', 'location', 'NodeFilter', 'getComputedStyle', 'crypto', script + ';return browserTranslatePage;')(window, document, location, { SHOW_TEXT: 4 }, () => ({ visibility: 'visible', display: 'block' }), require('node:crypto').webcrypto);
  return { run, rows, location };
}
const tests = [], test = (name, run) => tests.push({ name, run });
test('Assistant recognizes Turkish, English and explicit target languages', () => {
  assert.equal(intent('Bu sayfayı Türkçeye çevir'), 'Türkçe');
  assert.equal(intent('translate this page into English'), 'English');
  assert.equal(intent('sayfayı Almancaya çevir'), 'Deutsch');
  assert.equal(intent('sayfayı orijinal haline döndür'), 'restore');
  assert.equal(intent('bu film iyi mi?'), null);
});
test('Batches preserve all text ids while bounding request size', () => {
  const rows = Array.from({ length: 12 }, (_, id) => ({ id, text: 'x'.repeat(1500) }));
  const result = batches(rows); assert.equal(result.length, 4); assert.deepEqual(result.flat(), rows);
  assert(result.every(batch => batch.reduce((n, row) => n + row.text.length, 0) <= 4500));
});
test('Partial, duplicate and hallucinated model ids fail before page mutation', () => {
  const rows = [{ id: 1, text: 'First' }, { id: 2, text: 'Second' }];
  for (const translations of [[{ id: 1, text: 'Bir' }], [{ id: 1, text: 'Bir' }, { id: 1, text: 'İki' }], [{ id: 1, text: 'Bir' }, { id: 99, text: 'İki' }], [{ id: 1, text: '' }, { id: 2, text: 'İki' }]]) assert.throws(() => validate({ translations }, rows));
  assert.deepEqual(validate({ translations: [{ id: 2, text: 'İki' }, { id: 1, text: 'Bir' }] }, rows).map(r => r.id), [2, 1]);
});
test('Translations edit textContent, preserve spacing, and restore exact originals', () => {
  const d = dom(['  Hello world!  ', 'Film details']);
  const snap = d.run('snapshot'); assert.equal(snap.rows[0].text, 'Hello world!');
  const result = d.run('apply', { token: snap.token, translations: [{ id: 0, text: 'Merhaba dünya!' }, { id: 1, text: '<img src=x onerror=alert(1)>' }] });
  assert.equal(result.applied, 2); assert.equal(d.rows[0].textContent, '  Merhaba dünya!  ');
  assert.equal(d.rows[1].textContent, '<img src=x onerror=alert(1)>'); // literal text, no HTML parsing
  assert.equal(d.run('restore').restored, 2); assert.equal(d.rows[0].textContent, '  Hello world!  ');
});
test('Navigation and old snapshot tokens cannot apply a stale translation', () => {
  const d = dom(['Hello']); const first = d.run('snapshot'), next = d.run('snapshot');
  assert.throws(() => d.run('apply', { token: first.token, translations: [{ id: 0, text: 'Eski' }] }));
  d.location.href = 'https://example.org/other';
  assert.throws(() => d.run('apply', { token: next.token, translations: [{ id: 0, text: 'Yanlış' }] }));
  assert.equal(d.rows[0].textContent, 'Hello');
});
test('Changing page content is not overwritten by translation or restore', () => {
  const d = dom(['Hello', 'Title']); const snap = d.run('snapshot');
  d.rows[0].textContent = 'Live update';
  const result = d.run('apply', { token: snap.token, translations: [{ id: 0, text: 'Merhaba' }, { id: 1, text: 'Başlık' }] });
  assert.deepEqual(result, { applied: 1, skipped: 1 });
  d.rows[1].textContent = 'User/site update';
  assert.equal(d.run('restore').restored, 0); assert.equal(d.rows[1].textContent, 'User/site update');
});
test('Invalid later rows cannot leave the beginning half translated', () => {
  const d = dom(['Hello', 'World']), snap = d.run('snapshot');
  assert.throws(() => d.run('apply', { token: snap.token, translations: [{ id: 0, text: 'Merhaba' }, { id: 77, text: 'Bad id' }] }));
  assert.equal(d.rows[0].textContent, 'Hello');
});
test('Long documents report the truncation and remain bounded', () => {
  const d = dom(Array.from({ length: 300 }, () => 'Some text'));
  const snap = d.run('snapshot'); assert.equal(snap.rows.length, 180); assert.equal(snap.truncated, true);
});
test('Questions, refusals and mixed requests never change the page', () => {
  for (const q of ['Bu sayfadaki orijinal fiyat ne?', 'What is the original source of this page?', 'Bu sayfada çeviri hatası var mı?', 'Sayfadaki çeviri doğru mu?',
    'Does this website offer translation to English?', 'Bu sitenin Türkçe çevirisi var mı?', 'Bu sayfadaki makalenin orijinal yazarı kim?', 'Summarize the original article on this page',
    'Is this page a translation of a German article?', 'Please do not translate this page', 'Sayfayı çevirme', 'Bu sayfayı özetle ve Türkçeye çevir', "Hello'yu Türkçeye çevir", 'Bu site neden Almanca?'])
    assert.equal(intent(q), null, q);
});
test('Plain commands still work: polite forms, the language to leave and the interface default', () => {
  assert.equal(intent('Bu sayfayı çevirir misin?'), 'Türkçe');
  assert.equal(intent('Bu sayfayı çevirir misin?', 'English'), 'English');
  assert.equal(intent('translate this page to Turkish', 'English'), 'Türkçe');
  assert.equal(intent('Bu sayfayı İngilizceden Türkçeye çevir'), 'Türkçe');
  assert.equal(intent('translate this page from German into English'), 'English');
  assert.equal(intent('Can you translate this page into French?'), 'Français');
  assert.equal(intent('Bu makaleyi Almancaya tercüme et'), 'Deutsch');
});
test('Restoring the original needs a restore wording, not just the word "original"', () => {
  for (const q of ['show the original page', 'Çeviriyi geri al', 'orijinal dile dön', 'undo the translation', 'sayfayı orijinal haline döndür', 'show original'])
    assert.equal(intent(q), 'restore', q);
  assert.equal(intent('Bu sayfadaki orijinal fiyat ne?'), null);
});
let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS', t.name); } catch (e) { failed++; console.error('FAIL', t.name, e.message); } }
console.log(JSON.stringify({ total: tests.length, passed: tests.length - failed, failed })); process.exitCode = failed ? 1 : 0;
