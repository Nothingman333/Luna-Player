const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
const src=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/Addons.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
const m={exports:{}},stub=new Proxy({},{get:()=>()=>({})});new Function('exports','module','require',src)(m.exports,m,()=>stub);
const {bestStream:best,streamHeight:h,seeders}=m.exports;
const s=(name,seed,extra={})=>({addon:{base:'a'},s:{name:'Torrentio\n'+name,title:`file\n👤 ${seed} 💾 1 GB`,infoHash:'ab'+seed,...extra}});
assert.equal(h(s('4k DV',1).s),2160);assert.equal(h(s('1080p',1).s),1080);assert.equal(h({title:'x'}),undefined);
assert.equal(seeders(s('720p',42).s),42);
// 1080p wins over a more shared 720p or 4K; the most shared 1080p is taken
assert.equal(best([s('720p',900),s('1080p',50),s('4k',800),s('1080p',300)]).s.infoHash,'ab300');
// no 1080p: the nearest (720p) before 4K
assert.equal(best([s('4k',800),s('720p',20),s('480p',999)]).s.infoHash,'ab20');
// dead torrents are skipped while a shared one exists; browser-only links never play by themselves
assert.equal(best([s('1080p',0),s('720p',5)]).s.infoHash,'ab5');
assert.equal(best([{addon:{base:'a'},s:{name:'yt',ytId:'x'}}]),null);
assert.equal(best([]),null);
console.log('Addon best source: 1080p first, nearest quality next, most shared, dead and browser-only links skipped.');
