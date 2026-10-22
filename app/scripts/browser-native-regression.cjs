const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const transpile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', 'require', transpile(read('src/browserNativeModel.ts')))(mod.exports, mod, () => ({}));
const N = mod.exports;
const tests = []; const test = (name, run) => tests.push({ name, run });

test('History signal: two flags, anything else is ignored', () => {
  assert.deepEqual(N.parseHistory('10'), { canBack: true, canForward: false });
  assert.deepEqual(N.parseHistory('01'), { canBack: false, canForward: true });
  assert.deepEqual(N.parseHistory('11'), { canBack: true, canForward: true });
  for (const bad of ['', '1', '111', '2x', 'true']) assert.equal(N.parseHistory(bad), null, bad);
});
test('Audio signal is accepted only as the native 1 or 0', () => {
  assert.equal(N.parseAudio('1'), true); assert.equal(N.parseAudio('0'), false);
  assert.equal(N.parseAudio('yes'), null); assert.equal(N.parseAudio(''), null);
});
test('Zoom signal is limited to what the native view accepts', () => {
  assert.equal(N.parseZoom('1.100'), 1.1); assert.equal(N.parseZoom('0.25'), 0.25); assert.equal(N.parseZoom('5.000'), 5);
  for (const bad of ['0.1', '5.01', 'NaN', 'abc', '']) assert.equal(N.parseZoom(bad), null, bad);
});
test('Zoom steps move one step and stop at both ends', () => {
  assert.equal(N.nextZoom(1, 1), 1.1); assert.equal(N.nextZoom(1, -1), 0.9);
  assert.equal(N.nextZoom(1.1, 1), 1.25); assert.equal(N.nextZoom(1.0, -1), 0.9);
  assert.equal(N.nextZoom(5, 1), 5); assert.equal(N.nextZoom(0.5, -1), 0.5);
  assert.equal(N.nextZoom(Number.NaN, 1), 1.1);
});
test('Navigation result is parsed strictly', () => {
  assert.deepEqual(N.parseNavDone(JSON.stringify({ url: 'https://a.example/', ok: false, status: 14, http: 0 })), { url: 'https://a.example/', ok: false, status: 14, http: 0 });
  assert.equal(N.parseNavDone('{bad'), null);
  assert.equal(N.parseNavDone(JSON.stringify({ url: 'https://a.example/' })), null);
  assert.equal(N.parseNavDone(JSON.stringify({ url: 5, ok: true })), null);
  assert.equal(N.parseNavDone('null'), null);
});
test('A failed navigation of the page in use is reported; stopped or successful ones are not', () => {
  const failed = { url: 'https://a.example/', ok: false, status: 0, http: 0 };
  assert.match(N.navFailure(failed, true, false), /yüklenemedi/);
  assert.match(N.navFailure(failed, false, false), /could not be loaded/);
  assert.match(N.navFailure({ ...failed, http: 404 }, false, false), /HTTP 404/);
  assert.equal(N.navFailure(failed, true, true), null);
  assert.equal(N.navFailure({ ...failed, ok: true }, true, false), null);
});
test('Permission signal names what was refused in both languages and grants nothing', () => {
  assert.match(N.permissionNotice('microphone', true), /mikrofon izni istedi; izin verilmedi/);
  assert.match(N.permissionNotice('camera', false), /camera access; it was denied/);
  assert.match(N.permissionNotice('unknown-kind', true), /bir izin istedi/);
  assert.match(N.permissionNotice('constructor', false), /asked for a permission/);
});
test('Native state changes one tab only and a closed tab is forgotten', () => {
  const start = N.patchNative({}, 7, { canBack: true });
  assert.deepEqual(start[7], { canBack: true, canForward: false, audio: false, zoom: 1 });
  assert.equal(start[9], undefined);
  const two = N.patchNative(start, 9, { audio: true });
  assert.equal(two[7].canBack, true); assert.equal(two[9].audio, true);
  assert.equal(N.patchNative(two, 7, { zoom: 1.25 })[9].audio, true);
  assert.equal(N.dropNative(two, 7)[7], undefined); assert.equal(N.dropNative(two, 7)[9].audio, true);
  assert.equal(N.dropNative(two, 42), two);
});

let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS', t.name); } catch (e) { failed++; console.error('FAIL', t.name, e.message); } }
console.log(JSON.stringify({ total: tests.length, passed: tests.length - failed, failed })); process.exitCode = failed ? 1 : 0;
