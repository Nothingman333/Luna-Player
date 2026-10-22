// End-to-end check of the Luna Web interface in a real Chromium, with the Tauri layer replaced by a small mock
// (tabs, navigation events, find, mute are simulated; no real web page is shown). Local tool, not part of CI:
//   npm run preview:web            (in one terminal)   or let this script start vite itself
//   node scripts/web-ui-e2e.cjs [--shots docs/screenshots]
// Needs Playwright with Chromium (npx playwright install chromium).
const { spawn } = require('node:child_process'), path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict'), http = require('node:http');
const root = path.resolve(__dirname, '..');
let playwright; if(process.env.PLAYWRIGHT_MODULE) playwright = require(process.env.PLAYWRIGHT_MODULE); else try { playwright = require('playwright'); } catch { playwright = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright')); }
const shotsDir = process.argv.includes('--shots') ? path.resolve(root, '..', process.argv[process.argv.indexOf('--shots') + 1]) : null;
const PORT = Number(process.env.LUNA_TEST_PORT || 1439), URL_ = `http://127.0.0.1:${PORT}/browser-preview.html`;

const ready = () => new Promise(res => { http.get(URL_, r => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)); });
async function startVite() {
  if (await ready()) return null;
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', env: { ...process.env, BROWSER: 'none' } });
  for (let i = 0; i < 120; i++) { if (await ready()) return child; await new Promise(r => setTimeout(r, 500)); }
  child.kill(); throw new Error('vite did not start');
}

/** Replaces window.__TAURI_INTERNALS__ before any script runs. */
const MOCK = () => {
  const callbacks = new Map(); let next = 1, listenId = 1;
  const S = window.__MOCK__ = { calls: [], tabs: {}, listeners: [], findCount: 0, readText: '' };
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  const emit = (id, kind, value) => S.listeners.forEach(l => l.cb({ event: 'luna-browser-event', id: l.id, payload: { id, kind, value } }));
  window.__emit = emit;
  const visit = (id, url, title, ms = 20) => {
    emit(id, 'navigate', url); emit(id, 'loading', url); S.tabs[id].url = url;
    setTimeout(() => { emit(id, 'title', title); emit(id, 'loaded', url); emit(id, 'nav-done', JSON.stringify({ url, ok: true, status: 0, http: 200 })); emit(id, 'history', '10'); }, ms);
  };
  window.__visit = visit;
  const titleOf = url => { try { const u = new URL(url); return (u.searchParams.get('q') || u.searchParams.get('search_query') || u.hostname.replace(/^www\./, '')) + ' – ' + u.hostname; } catch { return url; } };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    transformCallback(cb) { const id = next++; callbacks.set(id, cb); window['_' + id] = cb; return id; },
    unregisterCallback(id) { callbacks.delete(id); },
    convertFileSrc: p => p,
    async invoke(cmd, args) {
      S.calls.push([cmd, JSON.parse(JSON.stringify(args ?? {}))]);
      switch (cmd) {
        case 'plugin:event|listen': { const id = listenId++; S.listeners.push({ id, cb: callbacks.get(args.handler) }); return id; }
        case 'plugin:event|unlisten': return null;
        case 'browser_create': S.tabs[args.id] = { url: args.url, muted: false }; visit(args.id, args.url, titleOf(args.url)); return null;
        case 'browser_action': {
          const t = S.tabs[args.id]; if (!t) throw 'Tab closed';
          if (args.action === 'navigate') visit(args.id, args.url, titleOf(args.url));
          if (args.action === 'mute') t.muted = true; if (args.action === 'unmute') t.muted = false;
          if (args.action === 'close') delete S.tabs[args.id];
          if (args.action === 'reload') visit(args.id, t.url, titleOf(t.url));
          if(args.action==='exit-fullscreen')emit(args.id,'fullscreen','0');
          return null;
        }
        case 'browser_position': return args.action === 'url' ? { url: S.tabs[args.id].url } : { url: S.tabs[args.id].url, progress: 0.25 };
        case 'browser_read': return { title: 'A long read', url: S.tabs[args.id].url, lang: 'en', truncated: false, text: S.readText || '# A long read\nThe opening paragraph of the article, long enough to read like a real one.\n## First part\n- point one\n- point two\nName | Role | Year\nA closing paragraph that wraps up the article.' };
        case 'browser_find': {
          if (args.action === 'clear') return { count: 0, index: 0, capped: false };
          const q = String(args.query || ''); const count = q === 'none' ? 0 : q.length + S.findCount;
          S.findIndex = args.action === 'next' ? (S.findIndex % count) + 1 : args.action === 'prev' ? ((S.findIndex || 1) - 2 + count) % count + 1 : 1;
          return { count, index: count ? S.findIndex : 0, capped: false };
        }
        case 'browser_extensions': return { dir: '', items: [] };
        case 'yt_transcript': return '';
        default: return null;
      }
    },
  };
};

const tests = [], test = (name, run) => tests.push({ name, run });
let browser, page, vite; const errors = [];
const shot = async name => { if (shotsDir) { await page.waitForTimeout(700); fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, name + '.jpg'), type: 'jpeg', quality: 86 }); } };
const calls = async cmd => (await page.evaluate(() => window.__MOCK__.calls)).filter(c => c[0] === cmd);
const store = async key => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
async function fresh(seed = {}, viewport = { width: 1280, height: 800 }, lang = 'en') {
  await page.setViewportSize(viewport);
  await page.goto(`http://127.0.0.1:${PORT}/vite.svg`); // same origin: seed the storage before the app boots
  await page.evaluate(({ seed, lang }) => { localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('lang', lang); }, { seed, lang });
  await page.goto(URL_); await page.waitForSelector('.browser-shell:not([hidden])'); await page.waitForTimeout(250);
}
async function openTab(text) { await page.fill('.browser-start-search input', text); await page.keyboard.press('Enter'); await page.waitForSelector('.browser-tab.on'); await page.waitForTimeout(150); }

const NOW = Date.now();
const SEED = {
  lunaWebHistory: [
    { url: 'https://github.com/', title: 'GitHub', at: NOW - 3600e3, first: NOW - 9e8, count: 14 },
    { url: 'https://letterboxd.com/film/dune-part-two/', title: 'Dune: Part Two • Letterboxd', at: NOW - 7200e3, first: NOW - 8e8, count: 6 },
    { url: 'https://en.wikipedia.org/wiki/Dune_(novel)', title: 'Dune (novel) - Wikipedia', at: NOW - 86400e3, first: NOW - 7e8, count: 3 },
    { url: 'https://www.youtube.com/watch?v=abc123xyz', title: 'Dune trailer - YouTube', at: NOW - 90000e3, first: NOW - 6e8, count: 2 },
    { url: 'https://www.google.com/search?q=dune+part+two+review', title: 'dune part two review - Google Search', at: NOW - 100000e3, first: NOW - 5e8, count: 1 },
  ],
  lunaWebBookmarks: [{ title: 'My blog', url: 'https://blog.example.com/' }, { title: 'Dune wiki', url: 'https://dune.fandom.com/' }],
  lunaWebReading: [{ url: 'https://long.example.com/essay', title: 'A very long essay about moons', progress: 0.42, done: false, at: NOW }],
  lunaWebLastSession: [{ title: 'Inbox', url: 'https://mail.example.com/' }, { title: 'Docs', url: 'https://docs.example.com/' }],
};

test('Start page: greeting, engine picker, shortcut hints, top sites, session banner, reading queue', async () => {
  await fresh(SEED, { width: 1280, height: 1000 }); await shot('web-start');
  assert(await page.locator('.browser-start-greeting').isVisible());
  assert.equal(await page.locator('.browser-engine-pick select option').count(), 7);
  assert((await page.locator('.browser-top-site').count()) >= 3, 'top sites from history');
  assert(!(await page.locator('.browser-top-site strong', { hasText: 'google.com' }).count()), 'a results page is not a top site');
  assert(await page.locator('.browser-restore').isVisible()); assert(await page.locator('.browser-continue button').count() === 1);
  assert(await page.locator('.browser-bang-hints button').count() >= 4);
  assert((await page.locator('.browser-saved-item').count()) === 2);
});
test('Suggestions: typing shows favourites, history and the search; arrows + Enter pick; Esc closes', async () => {
  await fresh(SEED); await page.click('.browser-start-search input'); await page.keyboard.type('dune', { delay: 15 });
  await page.waitForSelector('.browser-suggest'); await shot('web-suggest');
  const rows = await page.locator('.browser-suggest-row').allInnerTexts(); assert(rows.length >= 4, rows.join('|'));
  assert(rows.some(r => /Dune wiki/.test(r)) && rows.some(r => /Letterboxd/i.test(r)) && rows.some(r => /Search Google for dune/.test(r)));
  assert(!rows.some(r => /google\.com\/search/.test(r)), 'results pages are not offered as pages');
  assert((await page.locator('.browser-suggest-row.on').count()) === 0);
  await page.keyboard.press('ArrowDown'); assert((await page.locator('.browser-suggest-row.on').count()) === 1);
  await page.keyboard.press('Escape'); assert((await page.locator('.browser-suggest').count()) === 0);
  assert.equal(await page.inputValue('.browser-start-search input'), 'dune', 'Esc closes the list but keeps the words');
});
test('Typing "!" lists shortcuts; "!yt dune" opens a YouTube search tab and the visit is recorded', async () => {
  await fresh(SEED); await page.click('.browser-start-search input'); await page.keyboard.type('!y', { delay: 15 });
  await page.waitForSelector('.browser-suggest-row.is-bang'); assert(/YouTube/.test(await page.locator('.browser-suggest-row.is-bang').first().innerText()));
  await page.fill('.browser-start-search input', '!yt dune trailer'); await page.keyboard.press('Enter'); await page.waitForSelector('.browser-tab.on');
  const create = await calls('browser_create'); assert.equal(create.at(-1)[1].url, 'https://www.youtube.com/results?search_query=dune%20trailer');
  await page.waitForTimeout(300);
  const hist = await store('lunaWebHistory'); assert(hist.some(v => v.url === 'https://www.youtube.com/results?search_query=dune%20trailer'), 'visit stored');
  assert.equal((await page.inputValue('.browser-address input')), 'https://www.youtube.com/results?search_query=dune%20trailer');
  assert(/dune trailer/.test(await page.locator('.browser-address-view').innerText()), 'results address shows the words');
});
test('A chosen engine is remembered and used for plain words', async () => {
  await fresh(SEED); await page.selectOption('.browser-engine-pick select', 'duckduckgo');
  assert.equal(await page.evaluate(() => localStorage.getItem('lunaWebSearchEngine')), 'duckduckgo');
  await openTab('moon phases'); assert.equal((await calls('browser_create')).at(-1)[1].url, 'https://duckduckgo.com/?q=moon%20phases');
});
test('Pausing history stops recording; failed loads and error pages are not remembered', async () => {
  await fresh({ lunaWebHistoryPaused: '1' }); await openTab('example.com/a'); await page.waitForTimeout(250);
  assert.deepEqual(await store('lunaWebHistory'), null);
  assert.equal(await store('lunaWebLastSession'), null, 'no session kept while paused');
  await fresh({}); await page.fill('.browser-start-search input', 'example.com/ok'); await page.keyboard.press('Enter'); await page.waitForSelector('.browser-tab.on');
  const id = await page.evaluate(() => +Object.keys(window.__MOCK__.tabs)[0]);
  await page.evaluate(id => { window.__emit(id, 'navigate', 'https://bad.example/'); window.__emit(id, 'loading', 'https://bad.example/'); window.__emit(id, 'nav-done', JSON.stringify({ url: 'https://bad.example/', ok: false, status: 7, http: 0 })); window.__emit(id, 'loaded', 'https://bad.example/'); }, id);
  await page.waitForTimeout(250); const hist = await store('lunaWebHistory'); assert(hist.some(v => v.url === 'https://example.com/ok')); assert(!hist.some(v => v.url === 'https://bad.example/'), 'failed load is not kept');
});
test('Find in page: Ctrl+F opens the bar, counts, steps, Esc clears', async () => {
  await fresh(SEED); await openTab('example.com/doc'); await page.keyboard.press('Control+f'); await page.waitForSelector('.web-find input');
  await page.keyboard.type('moon', { delay: 20 }); await page.waitForFunction(() => /1\/4/.test(document.querySelector('.web-find output')?.textContent || ''));
  await shot('web-find'); await page.keyboard.press('Enter'); await page.waitForFunction(() => /2\/4/.test(document.querySelector('.web-find output').textContent));
  await page.keyboard.press('Shift+Enter'); await page.waitForFunction(() => /1\/4/.test(document.querySelector('.web-find output').textContent));
  await page.fill('.web-find input', 'none'); await page.waitForFunction(() => /No matches/.test(document.querySelector('.web-find output').textContent)); assert(await page.locator('.web-find.is-none').count());
  await page.keyboard.press('Escape'); await page.waitForSelector('.web-find', { state: 'detached' });
  const last = (await calls('browser_find')).at(-1)[1]; assert.equal(last.action, 'clear');
});
test('Reading view opens from the address bar button, themes switch, Esc returns, Ask Luna sends the page', async () => {
  await fresh(SEED); await openTab('example.com/essay'); await page.click('.browser-address button[aria-label="Reading view"]'); await page.waitForSelector('.browser-reader');
  assert(/A long read/.test(await page.locator('.reader-article h1, .reader-article h2').innerText())); assert((await page.locator('.reader-article h2').count()) === 1, 'title heading not repeated');
  assert((await page.locator('.reader-article li').count()) === 2); assert(await page.locator('.reader-table tr').count() === 1); await shot('web-reader');
  await page.click('.reader-swatch.sw-sepia'); assert(await page.locator('.browser-reader.reader-sepia').count());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.lunaWebReaderPrefs).theme), 'sepia');
  const oldSize=await page.evaluate(() => JSON.parse(localStorage.lunaWebReaderPrefs).size); await page.click('button[aria-label="Larger text"]'); assert((await page.evaluate(() => JSON.parse(localStorage.lunaWebReaderPrefs).size)) > oldSize);
  await shot('web-reader-sepia'); await page.click('text=Read later');
  assert((await store('lunaWebReading')).some(r => r.url === 'https://example.com/essay'));
  await page.click('.reader-ask'); await page.waitForSelector('.browser-reader', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.__page.title), 'A long read');
  await page.click('.browser-address button[aria-label="Reading view"]'); await page.waitForSelector('.browser-reader'); await page.keyboard.press('Escape'); await page.waitForSelector('.browser-reader', { state: 'detached' });
});
test('Tab menu: right-click shows it, mute toggles natively and shows the badge, keyboard works, Esc closes', async () => {
  await fresh(SEED); await openTab('example.com/one'); await page.keyboard.press('Control+t'); await openTab('example.com/two');
  assert.equal(await page.locator('.browser-tab').count(), 2);
  await page.click('.browser-tab >> nth=0', { button: 'right' }); await page.waitForSelector('.browser-tab-menu'); await shot('web-tab-menu');
  assert((await page.locator('.browser-tab-menu button').count()) >= 10);
  await page.click('.browser-tab-menu button:has-text("Mute tab")'); await page.waitForSelector('.browser-tab-mute.on');
  const mute = (await calls('browser_action')).filter(c => c[1].action === 'mute'); assert.equal(mute.length, 1);
  await page.click('.browser-tab >> nth=0', { button: 'right' }); await page.waitForSelector('.browser-tab-menu'); assert((await page.locator('.browser-tab-menu button:has-text("Unmute tab")').count()) === 1);
  await page.keyboard.press('Escape'); await page.waitForSelector('.browser-tab-menu', { state: 'detached' });
  await page.click('.browser-tab-mute.on'); await page.waitForSelector('.browser-tab-mute', { state: 'detached' });
  await page.click('.browser-tab >> nth=1', { button: 'right' }); await page.click('.browser-tab-menu button:has-text("Close other tabs")'); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 1);
});
test('Tabs can be reordered by dragging and reopened with Ctrl+Shift+T', async () => {
  await fresh(SEED); for (const u of ['example.com/a', 'example.com/b', 'example.com/c']) { await page.keyboard.press('Control+t'); await openTab(u); }
  const names = async () => (await page.locator('.browser-tab > button:first-child > span').allInnerTexts()).map(t => t.replace(/ –.*/, ''));
  assert.deepEqual((await names()).length, 3);
  const a = await page.locator('.browser-tab >> nth=0').boundingBox(), c = await page.locator('.browser-tab >> nth=2').boundingBox();
  const before = await page.locator('.browser-tab').evaluateAll(els => els.map(e => e.dataset.tabId));
  await page.mouse.move(a.x + 40, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + 80, a.y + a.height / 2, { steps: 4 }); await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 8 }); await page.mouse.up();
  const after = await page.locator('.browser-tab').evaluateAll(els => els.map(e => e.dataset.tabId));
  assert.deepEqual(after, [before[1], before[2], before[0]]); assert.equal(await page.locator('.browser-tab.on').count(), 1);
  await page.keyboard.press('Control+w'); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 2);
  await page.keyboard.press('Control+Shift+t'); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 3);
});
test('Page-focused shortcuts arrive as native "key" events and run (Ctrl+T, Ctrl+H, Ctrl+F)', async () => {
  await fresh(SEED); await openTab('example.com/p'); const id = await page.evaluate(() => +Object.keys(window.__MOCK__.tabs)[0]);
  await page.evaluate(id => window.__emit(id, 'key', 'ctrl+h'), id); await page.waitForSelector('.web-history'); await page.keyboard.press('Escape'); await page.waitForSelector('.web-history', { state: 'detached' });
  await page.evaluate(id => window.__emit(id, 'key', 'ctrl+f'), id); await page.waitForSelector('.web-find input');
  await page.evaluate(id => window.__emit(id, 'key', 'ctrl+t'), id); await page.waitForSelector('.browser-start-page'); assert((await page.locator('.web-find').count()) === 0, 'find closes when the tab changes');
});
test('History panel: grouped by day, searchable, removal and pause switch work', async () => {
  await fresh(SEED); await page.keyboard.press('Control+h'); await page.waitForSelector('.web-history'); await shot('web-history');
  assert((await page.locator('.web-history-row').count()) === 5); assert((await page.locator('.web-history-list h4').count()) >= 2);
  await page.fill('.web-history-search input', 'dune'); assert((await page.locator('.web-history-row').count()) === 4);
  await page.hover('.web-history-row >> nth=0'); await page.click('.web-history-row >> nth=0 >> .web-history-remove'); assert((await page.locator('.web-history-row').count()) === 3);
  assert((await store('lunaWebHistory')).length === 4);
  await page.click('.web-switch'); assert.equal(await page.evaluate(() => localStorage.lunaWebHistoryPaused), '1');
  await page.fill('.web-history-search input', ''); page.once('dialog', d => d.accept()); await page.click('button:has-text("Remove all")'); await page.waitForSelector('.web-empty');
  assert.deepEqual(await store('lunaWebHistory'), []);
});
test('Clear browsing data: history range, session and closed tabs; site data needs an open tab', async () => {
  await fresh(SEED); await page.keyboard.press('Control+Shift+Delete'); await page.waitForSelector('.web-clear'); await shot('web-clear');
  assert(await page.locator('.web-clear-row input[type=checkbox]').first().isDisabled(), 'cookies disabled without a tab');
  await page.selectOption('.web-clear select', 'all'); await page.click('.web-danger'); await page.waitForSelector('.extra-status');
  assert.deepEqual(await store('lunaWebHistory'), []); assert.equal(await store('lunaWebLastSession'), null);
  await page.keyboard.press('Escape'); await openTab('example.com/z'); await page.keyboard.press('Control+Shift+Delete'); await page.waitForSelector('.web-clear');
  await page.locator('.web-clear-row input[type=checkbox]').first().check(); await page.click('.web-danger'); await page.waitForSelector('.extra-status');
  assert.equal((await calls('browser_action')).filter(c => c[1].action === 'clear-data').length, 1);
});
test('Play in Luna shows only for video pages, calls onPlay and mutes the page', async () => {
  await fresh(SEED); await openTab('https://www.youtube.com/watch?v=abc123xyz'); await page.waitForSelector('.browser-play-luna');
  await page.click('.browser-play-luna'); assert.equal(await page.evaluate(() => window.__played), 'https://www.youtube.com/watch?v=abc123xyz');
  await page.waitForSelector('.browser-tab-mute.on'); assert.equal((await calls('browser_action')).filter(c => c[1].action === 'mute').length, 1);
  await page.keyboard.press('Control+t'); await openTab('example.com/plain'); assert.equal(await page.locator('.browser-play-luna').count(), 0);
});
test('Session: the banner restores the previous tabs once and goes away', async () => {
  await fresh(SEED); await page.click('.browser-restore-go'); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 2);
  assert.deepEqual((await calls('browser_create')).map(c => c[1].url), ['https://mail.example.com/', 'https://docs.example.com/']);
  await page.keyboard.press('Alt+Home'); await page.waitForSelector('.browser-start-page'); assert.equal(await page.locator('.browser-restore').count(), 0);
});
test('Shortcut list (Ctrl+/), zoom chip, and favourites bar with new-tab clicks', async () => {
  await fresh(SEED); await openTab('example.com/q');
  await page.keyboard.press('Control+/'); await page.waitForSelector('.web-keys'); assert((await page.locator('.web-keys-row').count()) >= 20); assert(/!yt/.test(await page.locator('.web-keys-bangs').innerText()));
  await shot('web-keys'); await page.keyboard.press('Escape'); await page.waitForSelector('.web-keys', { state: 'detached' });
  const id = await page.evaluate(() => +Object.keys(window.__MOCK__.tabs)[0]);
  assert.equal(await page.locator('.browser-zoom-chip').count(), 0);
  await page.evaluate(id => window.__emit(id, 'zoom', '1.250'), id); await page.waitForSelector('.browser-zoom-chip'); assert.equal((await page.locator('.browser-zoom-chip').innerText()).trim(), '125%');
  await page.click('.browser-zoom-chip'); await page.waitForSelector('.browser-zoom-chip', { state: 'detached' });
  assert.equal((await calls('browser_action')).filter(c => c[1].action === 'zoom').at(-1)[1].zoom, 1);
  assert.equal(await page.locator('.browser-bookmarks button').count(), 2);
  await page.click('.browser-bookmarks button >> nth=0', { modifiers: ['Control'] }); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 2);
  await page.click('.browser-bookmarks button >> nth=1', { button: 'middle' }); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 3);
  assert.deepEqual((await calls('browser_create')).map(c => c[1].url).slice(-2), ['https://blog.example.com/', 'https://dune.fandom.com/']);
  await page.click('.browser-bookmarks button >> nth=0'); await page.waitForTimeout(150); assert.equal(await page.locator('.browser-tab').count(), 3, 'a plain click navigates the current tab');
  await page.fill('.browser-address input', 'example.com/alt'); await page.press('.browser-address input', 'Alt+Enter'); await page.waitForFunction(() => document.querySelectorAll('.browser-tab').length === 4);
  assert.equal((await calls('browser_create')).at(-1)[1].url, 'https://example.com/alt');
});
test('Narrow window: start page and toolbar stay usable (no horizontal overflow)', async () => {
  await fresh(SEED, { width: 520, height: 760 }); await shot('web-start-narrow');
  const overflow = await page.evaluate(() => { const el = document.querySelector('.browser-start-page'); return el.scrollWidth - el.clientWidth; }); assert(overflow <= 1, 'overflow ' + overflow);
  const bar = await page.evaluate(() => { const t = document.querySelector('.browser-toolbar'); return t.scrollWidth - t.clientWidth; }); assert(bar <= 1, 'toolbar overflow ' + bar);
});
test('Turkish interface: start page and panels speak Turkish', async () => {
  await fresh(SEED, { width: 1280, height: 800 }, 'tr'); const text = await page.locator('.browser-start-page').innerText();
  assert(/Sık uğradıkların/.test(text) && /Kaldığın yerden devam et/.test(text) && /Okumaya devam et/.test(text), text.slice(0, 300));
  await page.keyboard.press('Control+h'); await page.waitForSelector('.web-history'); assert(/Gezdiğin sayfalar/.test(await page.locator('.web-history').innerText()));
});

test('Merged palette, pinned tabs, new shortcuts and zoom memory stay connected', async () => {
  await fresh(SEED); await openTab('example.com/one');
  await page.keyboard.press('Control+k'); const palette=page.getByRole('dialog',{name:'Web commands'}); await palette.waitFor();
  await palette.getByRole('combobox').fill('Pin tab'); await palette.getByRole('option').first().click();
  await page.waitForSelector('.browser-tab.is-pinned');
  await page.keyboard.press('Control+t'); await openTab('example.org/two');
  await page.keyboard.press('Control+PageUp'); assert.equal(await page.locator('.browser-tab.is-pinned [role="tab"]').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Control+PageDown');
  await page.keyboard.press('Control+Equal');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lunaWebSiteZoom')||'{}')['example.org'] > 1);
  await page.keyboard.press('Control+k'); await palette.waitFor(); await page.keyboard.press('Escape'); await palette.waitFor({state:'detached'});
  await page.keyboard.press('F9'); await page.waitForSelector('.browser-reader'); await page.keyboard.press('Escape'); await page.waitForSelector('.browser-reader',{state:'detached'});
});

test('Site preferences persist by origin and blocked popups never create a new tab',async()=>{
 await fresh(SEED);await openTab('example.com/one');await page.getByRole('button',{name:'Page tools',exact:true}).click();await page.getByRole('button',{name:'Site preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Site preferences'});await dialog.getByRole('checkbox',{name:'Mute this site by default'}).check();await dialog.getByRole('combobox',{name:'Pop-ups'}).selectOption('block');await dialog.getByRole('button',{name:'Save',exact:true}).click();
 assert.equal((await store('lunaWebSitePreferences'))['https://example.com'].muted,true);
 await page.evaluate(()=>{const id=Number(document.querySelector('.browser-tab.on').dataset.tabId);window.__emit(id,'popup','https://popup.example/');});
 assert.equal(await page.locator('.browser-tab').count(),1);assert.equal(await page.getByText('New page request:',{exact:false}).count(),0);
 await page.keyboard.press('Control+t');await openTab('other.example/two');assert.equal((await store('lunaWebSitePreferences'))['https://other.example'],undefined);
});
test('Native context menu routes links and selected text to queue, notes and page-share callback',async()=>{
 await fresh(SEED);await openTab('example.com/essay');const context=async(url,text)=>page.evaluate(({url,text})=>{const id=Number(document.querySelector('.browser-tab.on').dataset.tabId);window.__emit(id,'context',JSON.stringify({page:window.__MOCK__.tabs[id].url,url,text,x:60,y:80}));},{url,text});
 await context('https://article.example/read','');await page.getByRole('menuitem',{name:'Read link later',exact:true}).click();assert((await store('lunaWebReading')).some(r=>r.url==='https://article.example/read'));
 await context('','A chosen paragraph.');await page.getByRole('menuitem',{name:'Add selected text to notes',exact:true}).click();assert((await store('lunaWebNotes')).some(r=>r.text==='A chosen paragraph.'&&r.url==='https://example.com/essay'));
 await context('','Only this text.');await page.getByRole('menuitem',{name:'Explain selected text',exact:true}).click();assert.equal(await page.evaluate(()=>window.__page.text),'Only this text.');assert.equal(await page.evaluate(()=>window.__page.selection),'Only this text.');
});
test('Video fullscreen hides assistant bubbles and watch view has an explicit exit',async()=>{
 await fresh(SEED);await openTab('example.com/watch');await page.evaluate(()=>{const bubble=document.createElement('button');bubble.className='ai-bubble';bubble.textContent='Fixture bubble';document.body.append(bubble);const id=Number(document.querySelector('.browser-tab.on').dataset.tabId);window.__emit(id,'fullscreen','1');});
 await page.waitForSelector('.browser-shell.is-cinema');assert.equal(await page.locator('.browser-chrome').isVisible(),false);assert.equal(await page.locator('.ai-bubble').isVisible(),false);await page.getByRole('button',{name:'Exit watch view'}).click();await page.waitForSelector('.browser-shell:not(.is-cinema)');assert.equal(await page.locator('.ai-bubble').isVisible(),true);
});
test('Crash recovery restores only checked tabs and retains a pin',async()=>{
 await fresh({...SEED,lunaWebRecovery:{dirty:true,tabs:[{title:'Keep',url:'https://keep.example/',pinned:true},{title:'Skip',url:'https://skip.example/',pinned:false}]}});
 const dialog=page.getByRole('dialog',{name:'Recover previous session'});await dialog.waitFor();await dialog.getByRole('checkbox').nth(1).uncheck();await dialog.getByRole('button',{name:'Open selected',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(await page.locator('.browser-tab').count(),1);assert.equal(await page.locator('.browser-tab.is-pinned').count(),1);assert.equal((await store('lunaWebRecovery')).tabs[0].url,'https://keep.example/');
});

test('Manual tab mute survives a reload without changing another site default',async()=>{
 await fresh(SEED);await openTab('example.com/one');await page.locator('.browser-tab').click({button:'right'});await page.getByRole('menuitem',{name:/^Mute tab/}).click();await page.waitForSelector('.browser-tab-mute.on');await page.keyboard.press('F5');await page.waitForFunction(()=>window.__MOCK__.calls.some(c=>c[0]==='browser_action'&&c[1].action==='reload'));await page.waitForTimeout(180);assert.equal(await page.locator('.browser-tab-mute.on').count(),1);
 await page.keyboard.press('Control+t');await openTab('other.example/two');assert.equal(await page.locator('.browser-tab.on .browser-tab-mute.on').count(),0);
});

(async () => {
  vite = await startVite(); browser = await playwright.chromium.launch(process.env.LUNA_TEST_CHANNEL ? {channel:process.env.LUNA_TEST_CHANNEL} : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(MOCK); page = await ctx.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  if(process.env.LUNA_TEST_FILTER){const selected=tests.filter(t=>new RegExp(process.env.LUNA_TEST_FILTER).test(t.name));tests.splice(0,tests.length,...selected);}
  let failed = 0;
  for (const { name, run } of tests) { try { await run(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e && e.message || e).split('\n').join('\n     ')); } }
  if (errors.length) { failed++; console.log('FAIL browser errors\n     ' + [...new Set(errors)].join('\n     ')); }
  console.log(`\n${tests.length - (failed - (errors.length ? 1 : 0))}/${tests.length} passed${errors.length ? ', ' + errors.length + ' browser error(s)' : ''}`);
  await browser.close(); if (vite) vite.kill(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); try { vite?.kill(); } catch {} process.exit(2); });
