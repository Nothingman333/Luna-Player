const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
function load(name){const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);return m.exports;}
const h=load('releaseHistoryModel.ts'),data=load('releaseHistory.ts').RELEASE_HISTORY;
assert.equal(h.versionNumber('1.6.11C'),h.versionNumber('1.7.1'));
const rows=h.unseenReleases(data,'1.7.1','1.7.4');assert.deepEqual(rows.map(r=>r.version),['1.7.4','1.7.3','1.7.2']);
assert.equal(h.unseenReleases(data,'1.7.4','1.7.4').length,0);assert.equal(h.unseenReleases(data,null,'1.7.4').length,1);
assert(h.unseenReleases(data,'1.3.9CC','1.7.4').length>rows.length);assert(rows.every(r=>r.text.length));console.log('Release history: skipped upgrades, current exclusion, fresh install, agent suffix and decimal carry passed.');
