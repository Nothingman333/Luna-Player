const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
const memory=new Map(),events=new EventTarget();
const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))};
function load(file,mods={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports','window',code)(n=>mods[n]??{},m,m.exports,events);return m.exports;}
const c=load('watchCountry.ts',{'./appStorage':{appStorage:storage}});
assert.equal(c.hasWatchCountry(),false);assert.equal(c.watchCountry(),'US');storage.setItem('lang','tr');assert.equal(c.watchCountry(),'TR');
let changes=0;const off=c.subscribeWatchCountry(()=>changes++);
c.setWatchCountry(' fr ');assert.equal(c.watchCountry(),'FR');assert.equal(c.hasWatchCountry(),true);assert.equal(changes,1);
storage.setItem('lang','en');assert.equal(c.watchCountry(),'FR');c.setWatchCountry('FR');assert.equal(changes,1);
assert.throws(()=>c.setWatchCountry('XX'));assert.equal(c.watchCountry(),'FR');assert.equal(changes,1);
off();c.setWatchCountry('DE');assert.equal(changes,1);assert.equal(c.cleanWatchCountry(null),null);assert.equal(new Set(c.WATCH_COUNTRIES).size,c.WATCH_COUNTRIES.length);
const p=load('titleExtrasModel.ts');const response={results:{FR:{link:'https://www.themoviedb.org/movie/42/watch?locale=FR',flatrate:[{provider_id:1,provider_name:'French fixture'}]},US:{flatrate:[{provider_id:2,provider_name:'US fixture'}]}}};
assert.equal(p.parseProviders(response,['FR']).region,'FR');assert.equal(p.parseProviders(response,['FR']).providers.flatrate[0].name,'French fixture');assert.equal(p.parseProviders(response,['DE']),null);
console.log('Country: explicit region survives language changes; validation/events/unsubscribe and exact-region provider selection passed.');
