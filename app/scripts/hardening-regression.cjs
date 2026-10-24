const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const src=path.join(__dirname,'../src');
function load(name){if(name==="@ctrl/video-filename-parser")return require(name);const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(src,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);return m.exports;}
const {filmLoadOptions}=load('filmLoadOptions'),{createSnapshotWriter}=load('snapshotWriter');
const defaults={fromStart:false,position:{time:42,duration:200},delay:'-0.25',audioDelay:'0.1',subSpeed:1,pref:{aid:2,sid:'no'}};
assert.equal(filmLoadOptions(defaults),'start=42,sub-delay=-0.25,audio-delay=0.1,sub-speed=1,secondary-sid=no,aid=2,sid=no');
assert(filmLoadOptions({...defaults,fromStart:true}).startsWith('start=0,'));
assert(filmLoadOptions({...defaults,fromStart:true,jump:19}).startsWith('start=19,'));
assert(filmLoadOptions({...defaults,position:{time:190,duration:200}}).startsWith('start=0,'));
assert(!/NaN|Infinity/.test(filmLoadOptions({...defaults,delay:'bad',audioDelay:Infinity,subSpeed:NaN,pref:{aid:NaN,sid:Infinity}})));
(async()=>{
 const writes=[];const save=createSnapshotWriter(async json=>{writes.push(json);});
 await save({b:'2',a:'1'});await save({a:'1',b:'2'});assert.equal(writes.length,1);
 const same=save({a:'1',b:'2'}),changed=save({a:'new',b:'2'});await Promise.all([same,changed]);assert.equal(JSON.parse(writes.at(-1)).a,'new');
 let unblock;const queued=[];const serial=createSnapshotWriter(json=>{queued.push(json);return queued.length===1?new Promise(resolve=>unblock=resolve):Promise.resolve();});
 const first=serial({v:'a'});const second=serial({v:'b'});serial({v:'c'});unblock();await Promise.all([first,second]);assert.deepEqual(queued.map(j=>JSON.parse(j).v),['a','c']);
 let attempts=0;const flaky=createSnapshotWriter(async()=>{if(++attempts===1)throw Error('disk full');});await assert.rejects(flaky({a:'1'}));await flaky({a:'1'});assert.equal(attempts,2);
 save.invalidate();await save({a:'new',b:'2'});assert.equal(writes.length,3);
 const app=fs.readFileSync(path.join(src,'App.tsx'),'utf8'),engine=fs.readFileSync(path.join(src,'../src-tauri/src/mpv.rs'),'utf8');
 const restore=app.slice(app.indexOf('if (name === "file-loaded")'),app.indexOf('// Torrent streams play'));
 assert(app.includes('filmLoadOptions({'));assert(!restore.includes('setTimeout('));
 assert(engine.indexOf('crate::forward_pgs(&app);',engine.indexOf('"time-pos" =>'))<engine.indexOf('Duration::from_millis(200)'));
 console.log('Hardening: resume/track options, ordered/deduplicated/retried snapshots, stale-finalizer regression and PGS ordering passed. Pure models + source contracts; no native-window test.');
})().catch(error=>{console.error(error);process.exitCode=1;});
