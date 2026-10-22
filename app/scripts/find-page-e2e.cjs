// Runs browserFindPage.js (the script Luna injects for Ctrl+F in Luna Web) in a real Chromium and checks what it
// finds, what it skips, that it never changes the page's own elements, and its limits.
//   node scripts/find-page-e2e.cjs        (needs Playwright with Chromium; local tool, not part of CI)
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
let playwright; try { playwright = require('playwright'); } catch { playwright = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
// Exactly what browser.rs does: the file with "export function" turned into "function".
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'browserFindPage.js'), 'utf8').replace('export function', 'function');
const call = (page, action, query, matchCase = false) => page.evaluate(`(()=>{ ${source}; return browserFindPage(${JSON.stringify(action)}, ${JSON.stringify(query)}, ${matchCase}); })()`);
const PAGE = `<!doctype html><html lang="en"><head><title>t</title><style>.moon{color:red} body{font:16px sans-serif}</style></head><body>
<p id="a">Moon moon MOON. The moon is bright.</p>
<p style="display:none">moon hidden by display</p><p hidden>moon hidden attribute</p>
<textarea>moon in a text area</textarea><input value="moon in an input">
<script>var moon = "in a script";</script><template><p>moon in a template</p></template>
<div aria-hidden="true">moon aria-hidden</div><div style="visibility:hidden">moon invisible</div>
<button>Moon button</button><p>İstanbul ıspanak Straße</p><div contenteditable>moon editable</div>
<div style="height:3000px"></div><p id="end">The last moon is far below.</p></body></html>`;
const tests = [], test = (name, run) => tests.push({ name, run });
let page;
const state = () => page.evaluate(() => ({
  body: document.body.innerHTML, head: [...document.head.children].map(e => e.tagName + (e.id ? '#' + e.id : '')),
  all: CSS.highlights.has('luna-find') ? CSS.highlights.get('luna-find').size : 0, cur: CSS.highlights.has('luna-find-current') ? CSS.highlights.get('luna-find-current').size : 0, scrollY: Math.round(scrollY),
}));
const fresh = async html => { await page.setContent(html || PAGE); await page.evaluate(() => scrollTo(0, 0)); };

test('Finds only visible text (not hidden, fields, scripts, templates, aria-hidden or editable areas)', async () => {
  await fresh(); const r = await call(page, 'find', 'moon');
  assert.deepEqual(r, { count: 6, index: 1, capped: false }); // Moon moon MOON (3) + moon (1) + Moon button (1) + last moon (1)
  const s = await state(); assert.equal(s.all, 6); assert.equal(s.cur, 1);
});
test('Match case counts only exact case; Turkish and German letters match as typed', async () => {
  await fresh(); assert.equal((await call(page, 'find', 'moon', true)).count, 3); // moon / The moon is bright / The last moon
  assert.equal((await call(page, 'find', 'MOON', true)).count, 1);
  assert.equal((await call(page, 'find', 'ıspanak')).count, 1); assert.equal((await call(page, 'find', 'İstanbul')).count, 1); assert.equal((await call(page, 'find', 'straße')).count, 1);
});
test('Next and previous wrap around and the page scrolls to the match', async () => {
  await fresh(); const first = await call(page, 'find', 'moon'); assert.equal(first.index, 1);
  const seen = [first.index]; for (let i = 0; i < 6; i++) seen.push((await call(page, 'next', 'moon')).index);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 1]);
  assert.equal((await call(page, 'prev', 'moon')).index, 6); await page.waitForTimeout(50);
  const s = await state(); assert(s.scrollY > 1000, 'scrolled down to the last match: ' + s.scrollY);
  assert.equal((await call(page, 'next', 'moon')).index, 1); await page.waitForTimeout(50); assert((await state()).scrollY < 1000, 'scrolled back up');
});
test('The page itself is never changed: same body HTML, only one style element added, all of it removed by clear', async () => {
  await fresh(); const before = await state(); await call(page, 'find', 'moon'); await call(page, 'next', 'moon');
  const during = await state(); assert.equal(during.body, before.body); assert.deepEqual(during.head.filter(h => !before.head.includes(h)), ['STYLE#luna-find-style']);
  const r = await call(page, 'clear', ''); assert.deepEqual(r, { count: 0, index: 0, capped: false });
  const after = await state(); assert.equal(after.body, before.body); assert.deepEqual(after.head, before.head); assert.equal(after.all, 0); assert.equal(after.cur, 0);
});
test('Typing more narrows the same search; a changed query or case starts over; empty and unknown queries are empty', async () => {
  await fresh(); assert.equal((await call(page, 'find', 'mo')).count, 6); assert.equal((await call(page, 'find', 'moon')).count, 6);
  await call(page, 'next', 'moon'); await call(page, 'next', 'moon'); assert.equal((await call(page, 'find', 'moon')).index, 1, 'a new find starts at the top');
  assert.equal((await call(page, 'next', 'bright')).count, 1, 'next with a new query searches again');
  for (const q of ['', '   ', 'zzzzqx']) assert.deepEqual(await call(page, 'find', q), { count: 0, index: 0, capped: false });
  assert.equal((await state()).all, 0);
});
test('Regular-expression characters are searched as plain text and never throw', async () => {
  await fresh('<body><p>a.b (c) [d] {e} ^f$ g|h \\ + * ?</p></body>');
  for (const q of ['a.b', '(c)', '[d]', '{e}', '^f$', 'g|h', '\\', '+ *', '?']) assert.equal((await call(page, 'find', q)).count, 1, q);
  assert.equal((await call(page, 'find', 'a.c')).count, 0);
});
test('A page that changes under the search is searched again instead of failing', async () => {
  await fresh(); await call(page, 'find', 'moon'); await page.evaluate(() => document.getElementById('a').remove());
  const r = await call(page, 'next', 'moon'); assert.equal(r.count, 2); assert(r.index >= 1 && r.index <= 2);
  await page.evaluate(() => history.pushState({}, '', '#other')); assert.equal((await call(page, 'next', 'moon')).count, 2);
});
test('At most 1000 matches are painted and the result says so; a very long query is cut to 200 characters', async () => {
  await fresh('<body>' + '<span>x</span> '.repeat(1500) + '<p>' + 'y'.repeat(300) + '</p></body>');
  const r = await call(page, 'find', 'x'); assert.deepEqual(r, { count: 1000, index: 1, capped: true }); assert.equal((await state()).all, 1000);
  assert.equal((await call(page, 'find', 'y'.repeat(250))).count, 1, 'a 250-character query is cut to its first 200 characters');
  assert.equal((await call(page, 'find', 'y'.repeat(200))).count, 1);
});
test('A large page is searched quickly', async () => {
  await fresh('<body>' + '<div><p>some words here <b>moon</b> and more</p></div>'.repeat(8000) + '</body>');
  const t = Date.now(); const r = await call(page, 'find', 'moon'); const ms = Date.now() - t;
  assert.equal(r.count, 1000); assert(ms < 3000, 'took ' + ms + ' ms');
});
test('Text inside open shadow-free iframes and other documents is left alone (same-document only)', async () => {
  await fresh('<body><p>moon here</p><iframe srcdoc="<p>moon inside the frame</p>"></iframe></body>'); await page.waitForTimeout(100);
  assert.equal((await call(page, 'find', 'moon')).count, 1);
});

(async () => {
  const browser = await playwright.chromium.launch(); page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let failed = 0;
  for (const { name, run } of tests) { try { await run(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); } }
  if (errors.length) { failed++; console.log('FAIL page errors: ' + errors.join(' | ')); }
  console.log(`\n${tests.length - failed}/${tests.length} passed`); await browser.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
