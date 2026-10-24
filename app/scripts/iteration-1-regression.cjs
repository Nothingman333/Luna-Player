// Pure frontend models, no live app: subtitle text, SRT without blank lines, chapter names, TMDB dates.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const m={exports:{}};cache.set(name,m.exports);let file=path.join(__dirname,'../src',name+'.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
new Function('module','exports','require',code)(m,m.exports,s=>load(s.replace('./','')));cache.set(name,m.exports);return m.exports;}
const S=load('subtitleModel'),G=load('segmentModel'),C=load('calendarModel');
const tests=[],test=(title,run)=>tests.push({title,run});
test('"&amp;lt;" in a subtitle is the text "&lt;", not decoded twice',()=>assert.equal(S.plainText('a &amp;lt; b'),'a &lt; b'));
test('Quote and apostrophe entities are decoded',()=>assert.equal(S.plainText('say &quot;hi&quot; &#39;x&#39;'),'say "hi" \'x\''));
test('An SRT without blank lines between cues gives separate cues',()=>{
  const c=S.parseSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello\n2\n00:00:03,000 --> 00:00:04,000\nBye\n');
  assert.deepEqual(c.map(x=>[x.start,x.end,x.text]),[[1,2,'Hello'],[3,4,'Bye']]);
});
test('Dialogue text containing an arrow stays text',()=>{
  const c=S.parseSubtitle('1\n00:00:01,000 --> 00:00:02,000\nuse a --> b\n');
  assert.equal(c.length,1);assert.equal(c[0].text,'use a --> b');
});
test('A multi-line cue before a normal blank-line cue is unchanged',()=>{
  const c=S.parseSubtitle('1\n00:00:01,000 --> 00:00:02,000\nA\nB\n\n2\n00:00:03,000 --> 00:00:04,000\nC');
  assert.deepEqual(c.map(x=>x.text),['A\nB','C']);
});
test('A person named Ed is not the end credits, a chapter named ED is',()=>{
  assert.equal(G.chapterKind('Ed Sheeran'),null);assert.equal(G.chapterKind('Ed, Edd n Eddy'),null);
  assert.equal(G.chapterKind('ED 2'),'credits');assert.equal(G.chapterKind('OP'),'intro');assert.equal(G.chapterKind('Opening'),'intro');assert.equal(G.chapterKind('End Credits'),'credits');
});
test('A date that only looks like one is not an air date',()=>{
  const ep=d=>({next_episode_to_air:{air_date:d,season_number:1,episode_number:2,name:'x'}});
  assert.equal(C.parseNext(ep('2026-13-45')),null);assert.equal(C.parseNext(ep('2026-02-30')),null);
  assert.equal(C.parseNext(ep('2028-02-29')).date,'2028-02-29');
});
let failed=0;for(const t of tests){try{t.run();console.log('ok   '+t.title);}catch(e){failed++;console.log('FAIL '+t.title+'\n     '+String(e.message).split('\n')[0]);}}
console.log(`${tests.length-failed}/${tests.length} passed`);process.exit(failed?1:0);
