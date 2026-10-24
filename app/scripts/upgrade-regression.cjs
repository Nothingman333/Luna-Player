// Real pure production modules with an isolated Storage/native adapter; no Luna window is driven.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.join(__dirname,'../src'),cache=new Map();
let map=new Map([['legacy','kept']]);global.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size},clear:()=>map.clear()};
const events=[];global.window={dispatchEvent:e=>events.push(e.type)};
let native=async()=>{};
function load(name){if(name==="@ctrl/video-filename-parser")return require(name);if(cache.has(name))return cache.get(name);const m={exports:{}};cache.set(name,m.exports);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(dep=>dep==='./nativeCore'?{invoke:(...args)=>native(...args)}:load(dep.replace('./','')),m,m.exports);return m.exports;}
const A=load('appStorage'),D=load('databaseStorage'),M=load('libraryAutomationModel');
const tests=[],test=(name,fn)=>tests.push([name,fn]),settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
test('Storage reads the supplied browser before bootstrap',()=>assert.equal(A.appStorage.getItem('legacy'),'kept'));
test('SQLite facade preserves Storage iteration and stores large values without browser quota writes',()=>{
 D.startDatabaseStorage({a:'1',b:'2'},['secret']);assert.equal(A.appStorage.length,2);assert.deepEqual(Object.keys(A.appStorage),['a','b']);
 A.appStorage.setItem('large','x'.repeat(6*1024*1024));assert.equal(A.appStorage.getItem('large').length,6*1024*1024);assert.equal(map.get('large'),undefined);
});
test('Native deltas exclude secrets, coalesce changes and finish an older write before its replacement',async()=>{
 const calls=[];let release;native=async(command,args)=>{calls.push(args.changes);if(calls.length===1)await new Promise(r=>release=r)};
 A.appStorage.setItem('secret','private');A.appStorage.setItem('a','old');const first=D.flushDatabaseStorage();await settle();A.appStorage.setItem('a','new');const second=D.flushDatabaseStorage();release();await Promise.all([first,second]);
 assert(!calls.some(c=>'secret'in c));assert.equal(calls[0].a,'old');assert.equal(calls.at(-1).a,'new');
});
test('Failed SQL writes retain older deltas and newer changes win on retry',async()=>{
 native=async()=>{throw Error('disk full')};A.appStorage.setItem('a','failed');await assert.rejects(D.flushDatabaseStorage());A.appStorage.setItem('a','latest');const writes=[];native=async(_,args)=>writes.push(args.changes);await D.flushDatabaseStorage();assert.equal(writes.at(-1).a,'latest');assert(events.includes('luna-storage-error'));
});
test('Storage clear emits deletions without clearing the retained browser migration copy',async()=>{
 A.appStorage.clear();assert.equal(A.appStorage.length,0);assert.deepEqual(Object.keys(A.appStorage),[]);assert.equal(map.get('legacy'),'kept');await D.flushDatabaseStorage();
});
const film=(title,year,rating=8)=>({key:title,parsed:{title,year,kind:'movie'},meta:{title,year:String(year),rating,genres:['Bilim Kurgu'],runtime:120},files:[{path:'C:\\Films\\'+title+'.mkv'}]});
test('Smart lists combine AND/OR, normalize Turkish text and reject nonnumeric thresholds',()=>{
 const item=film('İstanbul',2020);const list={mode:'all',rules:[{field:'title',op:'contains',value:'istanbul'},{field:'rating',op:'gte',value:'7'}]};assert(M.smartMatches(item,list,()=>false));assert(!M.smartMatches(item,{...list,rules:[...list.rules,{field:'year',op:'gte',value:'bad'}]},()=>false));assert(M.smartMatches(item,{...list,mode:'any',rules:[{field:'year',op:'equals',value:'1900'},list.rules[0]]},()=>false));
});
test('Malformed smart definitions do not enter rendering',()=>{assert.deepEqual(M.cleanSmartLists([{id:'x',name:'x',rules:[null,{field:'invalid',op:'equals',value:'a'}]}])[0].rules,[])});
test('Rename preview marks both collisions and refuses the active media case-insensitively',()=>{
 const one=film('Alien',1979),two={...film('Alien',1979),files:[{path:'C:\\Films\\Alien.1080p.mkv'}]};const rows=M.renamePreview([one,two],'{title} ({year})',null);assert(rows.every(r=>r.error==='Duplicate destination'));
 assert.equal(M.renamePreview([one],'{title} ({year})','c:/films/alien.mkv')[0].error,'Currently playing');
});
test('Rename preview keeps episodes distinct and sanitizes Windows punctuation',()=>{
 const show={...film('A:B',2020),parsed:{title:'A:B',kind:'tv'},files:[{path:'C:\\Show\\old1.mkv',season:2,episode:1},{path:'C:\\Show\\old2.mkv',season:2,episode:2}]};const rows=M.renamePreview([show],'{title}{episode}',null);assert(rows.every(r=>!r.error));assert(rows[0].name.includes('S02E01'));assert(!rows[0].name.includes(':'));assert.notEqual(rows[0].to,rows[1].to);
});
(async()=>{for(const[name,fn]of tests){await fn();console.log('PASS '+name);}console.log(`${tests.length} upgrade regressions passed (production models, isolated adapters).`);})().catch(e=>{console.error(e);process.exitCode=1});
