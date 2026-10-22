const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),cache={};let map=new Map(),flushFail=false,requests=[],reply=async()=>({});
const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
const store={get:storage.getItem,set:(k,v)=>{storage.setItem(k,v);return true},remove:storage.removeItem,json:(k,f)=>{try{return JSON.parse(map.get(k))??f}catch{return f}}};
global.localStorage=storage;global.window={dispatchEvent:()=>true};
function load(name){if(cache[name])return cache[name];const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','exports','module',code)(dep=>dep==='./library'?{store,flushSecrets:async()=>{if(flushFail){flushFail=false;throw Error('vault unavailable')}}}:(dep==='@tauri-apps/api/core'||dep==='./nativeCore')?{invoke:async(cmd,args)=>{requests.push(args.url);return reply(args.url)}}:load(dep.replace('./','')),m.exports,m);return cache[name]=m.exports;}
const b=load('filmCatalogModel'),d=load('BookData'),tests=[];const test=(n,f)=>tests.push([n,f]);


const item=(key,title,id=1)=>({key,parsed:{title,kind:"movie",year:2020},meta:{id,title:"Aynı Film",kind:"movie",year:"2020",rating:8,runtime:110,genres:["Drama"]},files:[{path:key,name:key}]});
const A=item("a.mkv","Birinci Kopya"),B=item("b.mkv","İkinci Kopya"),C=item("c.mkv","Başka",2);
const params={query:"",sort:"az",filter:"all",genre:"",decade:"",minRating:0,runtime:"",watch:"all",locale:"tr"};
const select=(p={},ctx={})=>b.selectCatalog([A,B,C],{...params,...p},{recent:[],finished:()=>false,...ctx});
test('Two movie copies form one catalog group without losing file counts',()=>{const x=select();assert.equal(x.titles,2);assert.equal(x.files,3);assert.equal(x.copies.get(A.key),2);});
test('A filename search keeps both matching movie copies together',()=>{const x=select({query:'b.mkv'});assert.equal(x.titles,1);assert.equal(x.list.length,2);});
test('Finishing one copy applies the watched filter at film level',()=>{const x=select({watch:'watched'},{finished:path=>path==='b.mkv'});assert.equal(x.titles,1);assert.equal(x.list.length,2);});
test('Latest partially watched copy becomes the first copy and resume target',()=>{const x=select({}, {recent:[{path:'b.mkv',time:50,duration:100}]});const g=x.groups.find(x=>x.members.some(i=>i.key==='a.mkv'));assert.equal(g.members[0].key,'b.mkv');assert.equal(g.resume.path,'b.mkv');assert.equal(g.resume.remaining,50);});
test('Surprise choice excludes watched films when unwatched local films remain',()=>{const x=select({}, {finished:path=>path==='b.mkv'}),pool=b.surprisePool(x.groups,()=>false);assert.equal(pool.pool.length,1);assert.equal(pool.skippedWatched,1);});
const info={title:'Title',author:'Author',isbn:'',cover:'',description:'',subjects:[]};
test('Choosing own cover removes legacy web cover while keeping the embedded cover',()=>{map=new Map([['bookDetailsByPath',JSON.stringify({a:info})],['olInfo:Title|Author',JSON.stringify({cover:'https://example.org/legacy.jpg'})]]);const x=d.withBookInfo({path:'a',title:'Title',author:'Author',cover:'C:/embedded.jpg',kind:'epub'});assert.equal(x.cover,'C:/embedded.jpg');assert.equal(d.withBookInfo(x).cover,'C:/embedded.jpg');});
test('An explicit own-cover choice does not resurrect a previously applied web cover',()=>{map=new Map([['bookDetailsByPath',JSON.stringify({a:{...info,cover:'https://example.org/new.jpg'}})]]);const x=d.withBookInfo({path:'a',title:'Title',author:'Author',kind:'pdf'});assert(x.cover);map.set('bookDetailsByPath',JSON.stringify({a:info}));assert.equal(d.withBookInfo(x).cover,null);});
let failed=0;for(const[n,f]of tests){try{f();console.log('PASS',n)}catch(e){failed++;console.error('FAIL',n,e.stack)}}console.log(JSON.stringify({total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;
