// Execute the production expressions/functions without mounting the whole application or calling native tools.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'../src'),cache={};
function load(name){if(cache[name])return cache[name];const m={exports:{}};cache[name]=m.exports;new Function('module','exports','require',ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,id=>load(id.replace('./','')));return cache[name]=m.exports;}
const compile=(code,args,values)=>new Function(...args,ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(...values);
const taste=require('./production-source.cjs').read(path.join(root,'Taste.tsx')),books=require('./production-source.cjs').read(path.join(root,'Books.tsx')),{matchKey}=load('textMatch');
const renameSource=taste.slice(taste.indexOf('function renameMatches('),taste.indexOf('const renameTarget ='));
const rename=(items,args,matched=null)=>compile(renameSource+'\nreturn renameMatches(input);',['toolCtx','libMatch','matchKey','input'],[{items},()=>matched,matchKey,args]);
const tests=[],test=(name,run)=>tests.push({name,run});
test('Book artwork captions decode nested entities only once',()=>{
 const expression=books.match(/^const clean = (.+);$/m)?.[1];assert(expression);
 const clean=compile('return ('+expression+');',['decodeTextEntities'],[load('textEntities').decodeTextEntities]);
 assert.equal(clean('<b>Tom &amp;quot;Jerry&amp;quot;</b>'),'Tom &quot;Jerry&quot;');assert.equal(clean('A &quot;B&quot; &amp; C'),'A "B" & C');
});
test('Assistant rename fallback matches Turkish letters without losing the actual path',()=>{
 const p='C:\\Films\\IŞIK - Çığlık.mkv';assert.deepEqual(rename([{files:[{path:p}]}],{title:'isik'}),[p]);
});
test('Explicit file disambiguation uses the same Turkish comparison key',()=>{
 const matched={files:[{path:'C:\\Films\\Çığlık - Türkçe.mkv'},{path:'C:\\Films\\Çığlık - English.mkv'}]};
 assert.deepEqual(rename([matched],{title:'Çığlık',file:'turkce'},matched),[matched.files[0].path]);
});
test('Broader name matches keep ambiguity and never target network streams for rename',()=>{
 const items=[{files:[{path:'C:\\Films\\Işık 1.mkv'},{path:'C:\\Films\\Işık 2.mkv'},{path:'https://media.example/isik.mkv'}]}];
 assert.equal(rename(items,{title:'isik'}).length,2);assert.equal(rename(items,{title:''}).length,0);
});
test('Playlist artist filter accepts the dotted Turkish I in a real production expression',()=>{
 const block=taste.slice(taste.indexOf('if (titles.length && whoQ && items.length < count)'));
 const key=block.match(/const key = ([^;]+);/)?.[1],reject=block.match(/if \((key && .+)\) continue;/)?.[1];assert(key&&reject);
 const accepts=(whoQ,h)=>compile('const key='+key+';return !('+reject+');',['whoQ','h','matchKey'],[whoQ,h,matchKey]);
 assert(accepts('İbrahim Tatlıses',{title:'Ibrahim - Bir şarkı',channel:'Artist'}));assert(!accepts('İbrahim Tatlıses',{title:'Another performer',channel:'Artist'}));
});
let passed=0;for(const {name,run}of tests){try{run();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name,e.stack);}}console.log(JSON.stringify({passed,total:tests.length}));process.exitCode=passed===tests.length?0:1;
