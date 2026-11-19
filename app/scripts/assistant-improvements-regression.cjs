// Behaviour tests for the assistant improvements of the 1.6.8 review: provider request translation (generation
// settings, JSON mode, attachments), JSON answers, precise "open/play" intent, profile budgets and markdown blocks.
// They run the real production modules (transpiled); no network, no Tauri, no real keys.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const src = (f) => path.resolve(__dirname, '../src', f);
const load = (f) => { const m = { exports: {} }; new Function('exports', 'module', 'require', ts.transpileModule(fs.readFileSync(src(f), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(m.exports, m, require); return m.exports; };
const Q = load('assistantRequestModel.ts'), P = load('assistantProviderModel.ts'), N = load('assistantIntentModel.ts');
const tests = [], test = (n, f) => tests.push([n, f]);
const optional = (f) => { try { return load(f); } catch { return null; } };
const H = optional('assistantHistory.ts'), V = optional('assistantPresentation.ts');

// ---------- request translation ----------
const tool = { functionDeclarations: [{ name: 'mark_watched', description: 'izledim', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, year: { type: 'STRING', nullable: true } }, required: ['title'] } }, { name: 'show_film', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' } } } }] };
const sys = (t) => ({ systemInstruction: { parts: [{ text: t }] } });
test('Generation settings reach OpenAI: temperature and max_tokens (they used to be dropped)', () => {
  const r = Q.toOpenAiRequest({ ...sys('kısa'), contents: [{ role: 'user', parts: [{ text: 'merhaba' }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1500 } }, 'gpt-4.1-mini', 'openai');
  assert.equal(r.temperature, 0.5); assert.equal(r.max_tokens, 1500); assert.equal(r.max_completion_tokens, undefined);
  assert.deepEqual(r.messages[0], { role: 'system', content: 'kısa' });
});
test('OpenAI reasoning models (o-series, gpt-5) get max_completion_tokens and no custom temperature', () => {
  for (const model of ['o3', 'o4-mini', 'gpt-5', 'GPT-5-mini']) {
    const r = Q.toOpenAiRequest({ contents: [{ role: 'user', parts: [{ text: 'x' }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }, model, 'openai');
    assert.equal(r.temperature, undefined, model); assert.equal(r.max_tokens, undefined, model); assert.equal(r.max_completion_tokens, 900, model);
  }
  // an OpenAI-compatible server keeps the widely supported fields whatever the model is called
  const gemmaBody = { contents: [{ role: 'user', parts: [{ text: 'x' }] }] };
  assert.equal(Q.toOpenAiRequest(gemmaBody, 'google/gemma-4-e2b', 'custom').reasoning_effort, 'none');
  assert.equal(Q.toOpenAiRequest(gemmaBody, 'Gemma 4 e2b', 'custom').reasoning_effort, 'none');
  assert.equal(Q.toOpenAiRequest({ ...gemmaBody, lunaThink: true }, 'Gemma 4 e2b', 'custom').reasoning_effort, undefined);
  assert.equal(Q.toOpenAiRequest(gemmaBody, 'llama3', 'custom').reasoning_effort, undefined);
  const c = Q.toOpenAiRequest({ contents: [{ role: 'user', parts: [{ text: 'x' }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }, 'gpt-5', 'custom');
  assert.equal(c.temperature, 0.2); assert.equal(c.max_tokens, 900);
});
test('JSON mode: official OpenAI gets response_format, compatible servers only the instruction', () => {
  const body = { ...sys('Çevir'), contents: [{ role: 'user', parts: [{ text: 'hello' }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } };
  const o = Q.toOpenAiRequest(body, 'gpt-4.1-mini', 'openai'), c = Q.toOpenAiRequest(body, 'llama3', 'custom');
  assert.deepEqual(o.response_format, { type: 'json_object' }); assert.equal(c.response_format, undefined);
  assert.match(o.messages[0].content, /JSON only/); assert.match(c.messages[0].content, /JSON only/);
});
test('Anthropic: max_tokens follows maxOutputTokens (default 8192), temperature is clamped to 0–1', () => {
  const a = Q.toAnthropicRequest({ contents: [{ role: 'user', parts: [{ text: 'x' }] }], generationConfig: { temperature: 1.6, maxOutputTokens: 1500 } }, 'claude-haiku-5-5');
  assert.equal(a.max_tokens, 1500); assert.equal(a.temperature, 1);
  const d = Q.toAnthropicRequest({ contents: [{ role: 'user', parts: [{ text: 'x' }] }] }, 'claude-haiku-5-5');
  assert.equal(d.max_tokens, 8192); assert.equal(d.temperature, undefined);
  assert.equal(Q.generationSettings({ generationConfig: { temperature: 'hot', maxOutputTokens: -3 } }).temperature, undefined);
});
test('Tool calls and results keep their ids on both APIs; forced single tool is named', () => {
  const body = { tools: [tool], toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['show_film'] } },
    contents: [{ role: 'user', parts: [{ text: 'Dune' }] }, { role: 'model', parts: [{ functionCall: { name: 'show_film', args: { title: 'Dune' } } }] }, { role: 'user', parts: [{ functionResponse: { name: 'show_film', response: { result: 'ok' } } }, { text: 'devam' }] }] };
  const o = Q.toOpenAiRequest(body, 'gpt-4.1-mini');
  assert.equal(o.tools.length, 1); assert.equal(o.tools[0].function.name, 'show_film'); assert.deepEqual(o.tool_choice, { type: 'function', function: { name: 'show_film' } });
  const call = o.messages.find((m) => m.tool_calls), result = o.messages.find((m) => m.role === 'tool');
  assert.equal(result.tool_call_id, call.tool_calls[0].id); assert.equal(o.messages[o.messages.length - 1].content, 'devam');
  const a = Q.toAnthropicRequest(body, 'claude-haiku-5-5');
  const use = a.messages[1].content[0], res = a.messages[2].content[0];
  assert.equal(use.type, 'tool_use'); assert.equal(res.type, 'tool_result'); assert.equal(res.tool_use_id, use.id); assert.deepEqual(a.tool_choice, { type: 'tool', name: 'show_film' });
  assert.equal(Q.toJsonSchema(tool.functionDeclarations[0].parameters).properties.year.nullable, undefined);
});
test('Only pictures are sent as image parts; another attachment kind is not turned into a broken image', () => {
  const body = { contents: [{ role: 'user', parts: [{ text: 'bak' }, { inlineData: { mimeType: 'image/png', data: 'AAA' } }, { inlineData: { mimeType: 'application/pdf', data: 'BBB' } }] }] };
  const o = Q.toOpenAiRequest(body, 'gpt-4.1-mini');
  assert.equal(o.messages[0].content.filter((x) => x.type === 'image_url').length, 1);
  const a = Q.toAnthropicRequest(body, 'claude-haiku-5-5');
  assert.equal(a.messages[0].content.filter((x) => x.type === 'image').length, 1);
});

// ---------- JSON answers ----------
test('JSON answers: fenced, bare and wrapped objects are read; text without JSON fails with a clear message', () => {
  assert.deepEqual(P.extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(P.extractJsonObject('Here: {"a":{"b":2}} done'), { a: { b: 2 } });
  assert.deepEqual(P.extractJsonObject('\uFEFF{"ok":true}'), { ok: true });
  assert.deepEqual(P.extractJsonObject('```json\n{"a":[{"b":1},{"c":"}]"}\n}\n```'), { a: [{ b: 1 }, { c: "}]" }] });
  assert.deepEqual(P.extractJsonObject('{"a":[1,2,],}'), { a: [1, 2] });
  assert.throws(() => P.extractJsonObject('{"a":"cut} off'), /could not be read/);
  assert.throws(() => P.extractJsonObject('Sorry, I cannot.'), /had no JSON/);
  assert.throws(() => P.extractJsonObject('{broken'), /no JSON|could not be read/);
  assert.throws(() => P.extractJsonObject('{"a":1'), /could not be read|no JSON/);
});

// ---------- open / play intent ----------
const wants = (t, link = false) => N.wantsOpenTool(N.toolIntentText(t), link);
test('Requests to open, play or read are still forced (Turkish and English)', () => {
  for (const t of ["Dune'u aç", 'Interstellar oynat', 'Radiohead çal', 'Kaldığım kitabı oku', 'Bunu açar mısın', 'Play Interstellar', 'please open Dune',
    'Can you play some jazz?', 'Could you start Breaking Bad from episode 2', 'Read Dune', 'I want to read Dune', 'Listen to Radiohead', 'Resume the last film', "Let’s play Arrival"])
    assert.equal(wants(t), true, t);
});
test('Questions and opinions with the same English words are no longer forced into an "open" call', () => {
  for (const t of ['I read the book, is the movie faithful?', 'Have you read Dune?', 'Where should I start with Kubrick?', "I'm open to anything tonight",
    'Start with something light', 'Who would play Paul in a remake?', 'Read me the plot of Dune', 'Kitabı okudum, nasıldı?', 'Bunu açıklar mısın?', 'Çalışma müziği öner'])
    assert.equal(wants(t), false, t);
});
test('A message with a link is never forced into an "open" call', () => {
  assert.equal(wants('Şu linki oku https://letterboxd.com/ali/', true), false);
  assert.equal(wants('play https://example.com/list', true), false);
});

// ---------- profile budget (assistantHistory.capProfileList) ----------
if (H?.capProfileList) test('Profile sections are capped with a count of what was left out', () => {
  const l = Array.from({ length: 10 }, (_, i) => 'Film ' + i);
  assert.deepEqual(H.capProfileList(l, 20, (n) => `+${n}`), l);
  const c = H.capProfileList(l, 4, (n) => `+${n} daha`);
  assert.equal(c.length, 5); assert.deepEqual(c.slice(0, 4), l.slice(0, 4)); assert.equal(c[4], '+6 daha');
  assert.deepEqual(H.capProfileList([], 3, () => 'x'), []);
  assert.deepEqual(H.newestFirst([{ t: 'a', at: 1 }, { t: 'b', at: 5 }, { t: 'c' }], (x) => x.at).map((x) => x.t), ['b', 'a', 'c']);
});

// ---------- markdown blocks (assistantPresentation.mdBlocks) ----------
if (V?.mdBlocks) test('Markdown blocks: headings, numbered lists, inline code and code fences render; nothing becomes markup by accident', () => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const { html, restore } = V.mdBlocks(esc('### Neden?\n1. **Dune (2021)** ilk\n2. ikinci\nKod: `a*b*c` ve\n```js\nlet x = 1 < 2 && **y**;\n```\nson'));
  assert.match(html, /<h4[^>]*>Neden\?<\/h4>/); assert.match(html, /<ol>\s*<li>\*\*Dune \(2021\)\*\* ilk<\/li>\s*<li>ikinci<\/li>\s*<\/ol>/);
  const out = restore(html);
  assert.match(out, /<code>a\*b\*c<\/code>/); assert.match(out, /<pre class="msg-code"><code>let x = 1 &lt; 2 &amp;&amp; \*\*y\*\*;<\/code><\/pre>/);
  assert.doesNotMatch(html, /a\*b\*c|let x/);
  const plain = V.mdBlocks(esc('2024 yılında 3 film çıktı. 10/10 verdim.\n#hashtag değil başlık'));
  assert.doesNotMatch(plain.html, /<ol>|<h\d/);
  assert.equal(V.mdBlocks(esc('<script>alert(1)</script>')).html.includes('<script>'), false);
});

(async () => {
  let failed = 0;
  for (const [n, f] of tests) { try { await f(); console.log('PASS', n); } catch (e) { failed++; console.log('FAIL', n, '\n  ', e.message); } }
  console.log(JSON.stringify({ total: tests.length, passed: tests.length - failed, failed }));
  process.exit(failed ? 1 : 0);
})();
