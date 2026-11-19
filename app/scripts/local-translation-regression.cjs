const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const base=path.join(__dirname,'..');const source=fs.readFileSync(path.join(base,'src/localWebTranslation.ts'),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const exportsLocal={};new Function('require','exports',compiled)(name=>{assert.equal(name,'./nativeCore');return{isTauri:()=>false,invoke:()=>{throw Error('Unexpected native request')}}},exportsLocal);
(async()=>{
 const languages=exportsLocal.LOCAL_TRANSLATION_LANGUAGES,registry=JSON.parse(fs.readFileSync(path.join(base,'public/translation/registry.json'),'utf8'));
 assert.equal(languages.Türkçe,'tr');assert.equal(exportsLocal.localLanguageCode('tr-TR'),'tr');assert.throws(()=>exportsLocal.localLanguageCode('unsupported'));
 for(const code of Object.values(languages)){if(code==='en')continue;for(const pair of ['en'+code,code+'en']){assert(registry[pair],pair);for(const kind of ['model','lex','vocab']){const f=registry[pair][kind];assert(f&&f.size>0&&f.size<=80000000);assert.match(f.expectedSha256Hash,/^[a-f0-9]{64}$/);const u=new URL(f.name);assert.equal(u.protocol,'https:');assert(['bergamot.s3.amazonaws.com','firefox-settings-attachments.cdn.mozilla.net'].includes(u.hostname));}}}
 const c=new AbortController();c.abort();await assert.rejects(exportsLocal.localTranslateRows([{id:0,text:'Text'}],'Türkçe','English',undefined,c.signal));
 await assert.rejects(exportsLocal.localTranslateRows(Array.from({length:181},(_,id)=>({id,text:'Text'})),'Türkçe','English'),/sınır/);
 assert.deepEqual(await exportsLocal.localTranslateRows([{id:3,text:'Aynı dil'}],'Türkçe','Türkçe'),[{id:3,text:'Aynı dil'}]);
 console.log('PASS supported languages, directional models, pinned HTTPS files, cancellation, size limits and same-language handling');
})().catch(e=>{console.error(e);process.exitCode=1});
