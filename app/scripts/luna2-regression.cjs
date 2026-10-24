// Behavioral checks for PDF feedback. Synthetic responses only; no credentials or network.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
const src=path.join(__dirname,'../src');
const memory=new Map();const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
function load(name,mods={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(src,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports','window',code)(n=>mods[n]??{},m,m.exports,{dispatchEvent:()=>{}});return m.exports;}
const usage=load('aiUsage.ts',{'./appStorage':{appStorage:storage}});
assert.deepEqual(usage.usageFromResponse({usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:40}}}),{input:100,output:20,total:120,cached:40});
assert.deepEqual(usage.usageFromResponse({usageMetadata:{promptTokenCount:12,candidatesTokenCount:8,thoughtsTokenCount:3,totalTokenCount:23}}),{input:12,output:8,total:23,cached:0});
assert.deepEqual(usage.usageFromResponse({usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:100,cache_creation_input_tokens:20}}),{input:130,output:5,total:135,cached:100});
assert.equal(usage.usageFromResponse({text:'no reported usage'}),null);
assert.equal(usage.usageFromResponse({usage:{prompt_tokens:'123'}}),null);
usage.recordTokenUsage({usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120},content:"private synthetic response",key:"synthetic-key-not-real"});usage.recordTokenUsage({text:'no usage'});
assert.equal(usage.readTokenUsage().total,120);assert.equal(usage.readTokenUsage().requests,2);assert.equal(usage.readTokenUsage().unreported,1);
assert(!JSON.stringify([...memory]).includes('no usage'));assert(!JSON.stringify([...memory]).includes('private synthetic'));assert(!JSON.stringify([...memory]).includes('synthetic-key-not-real')); usage.resetTokenUsage();assert.equal(usage.readTokenUsage().requests,0);
let calls=0;const bridge=load('nativeCore.ts',{'./debugTelemetry':{invoke:async c=>c==='gemini'?{usage:{total_tokens:5}}:null},'./aiUsage':{recordTokenUsage:()=>calls++}});
const tv=load('tvEpisodeSummary.ts');assert.equal(tv.airedEpisodeCount({seasons:[{season_number:0,episode_count:5},{season_number:1,episode_count:10},{season_number:2,episode_count:8},{season_number:3,episode_count:9}],last_episode_to_air:{season_number:2,episode_number:3}}),13);
assert.equal(tv.airedEpisodeCount({seasons:[],last_episode_to_air:null}),undefined);assert.equal(tv.airedEpisodeCount({first_air_date:'9999-01-01',last_episode_to_air:null}),0);
assert.equal(tv.airedEpisodeCount({seasons:[],last_episode_to_air:{season_number:2,episode_number:3}}),undefined);
const hw=load('hardwareProfile.ts',{'./nativeCore':{invoke:async()=>({gpus:['Intel Arc'],lossless:false})},'./appStorage':{appStorage:storage}});
assert.deepEqual(hw.gpuCapabilities(['Intel Arc A770']),{known:true,intel:true,nvidia:false,amd:false});assert.equal(hw.gpuCapabilities(['NVIDIA RTX 4070','Intel UHD']).nvidia,true);assert.equal(hw.gpuCapabilities([]).known,false);
hw.rememberHardware({gpus:['Intel Arc'],lossless:false});assert.equal(storage.getItem('studioEngineHint'),'cpu');assert.equal(storage.getItem('studioModelHint'),'base');hw.rememberHardware({gpus:['Intel Arc'],lossless:false,memoryGb:32});assert.equal(storage.getItem('studioModelHint'),'small');storage.setItem('studioEngine','custom.exe');hw.rememberHardware({gpus:['NVIDIA RTX'],lossless:true});assert.equal(storage.getItem('studioEngine'),'custom.exe');
(async()=>{await bridge.invoke('gemini');await bridge.invoke('mpv_command');assert.equal(calls,1);console.log('Luna 2: provider usage, no double counting, bridge scope, reset, aired episodes and hardware defaults passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
