const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/followModel.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m.exports,m);
const {updateFollow:u,addNotices,parseEp}=m.exports,now=new Date(2026,10,3,12);
const ep=(s,e,d)=>({season_number:s,episode_number:e,air_date:d,name:'X'});
const tv={id:1,kind:'tv',title:'Show',at:0};
// first look only sets the starting point
let r=u(tv,{last_episode_to_air:ep(2,4,'2026-10-30'),next_episode_to_air:ep(2,5,'2026-11-06')},now);
assert.equal(r.notice,null);assert.equal(r.follow.last.episode,4);assert.equal(r.follow.next.episode,5);
// same episode: nothing; a newer one: one notice
assert.equal(u(r.follow,{last_episode_to_air:ep(2,4,'2026-10-30')},now).notice,null);
const n=u(r.follow,{last_episode_to_air:ep(2,5,'2026-11-06')},now).notice;assert.ok(n);assert.match(n.text,/S2B5/);assert.equal(n.target.tmdbId,1);
assert.ok(u(r.follow,{last_episode_to_air:ep(3,1,'2026-11-06')},now).notice,'new season counts');
assert.equal(u(r.follow,{last_episode_to_air:ep(1,9,'2025-01-01')},now).notice,null,'older is not new');
// a failed/empty answer keeps what was known
assert.equal(u(r.follow,{},now).follow.last.episode,4);
// films: out after following → notice; already out at first look → none
const mv={id:2,kind:'movie',title:'Film',at:0};
const f1=u(mv,{release_date:'2026-12-01'},now);assert.equal(f1.notice,null);assert.equal(f1.follow.out,false);
assert.ok(u(f1.follow,{release_date:'2026-11-02'},now).notice);
assert.equal(u(mv,{release_date:'2020-01-01'},now).notice,null);
assert.equal(parseEp(ep(1,1,'2026-02-30')),null);
const list=addNotices([{id:'a',at:1}],[{id:'a',at:2},{id:'b',at:3}],2);assert.deepEqual(list.map(x=>x.id),['b','a']);
console.log('Follow: first look sets a baseline, newer episodes and releases notify once, bad dates ignored.');
