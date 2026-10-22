// One release input updates every version-bearing file; --check does not modify files.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function versionPlan(version){
 version=version.replace(/^v/,'');
 if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version))throw Error('Expected a numeric SemVer, optionally with a prerelease suffix');
 const prerelease=version.split('-').slice(1).join('-');if(prerelease&&prerelease.split('.').some(x=>/^\d+$/.test(x)&&x.length>1&&x.startsWith('0')))throw Error('Numeric prerelease identifiers must not have leading zeroes');
 const plan=[];
 for(const file of ['app/package.json','app/package-lock.json','app/src-tauri/tauri.conf.json']){
  const full=path.join(root,file),value=JSON.parse(fs.readFileSync(full,'utf8'));
  value.version=version;if(value.packages?.[''])value.packages[''].version=version;
  plan.push([full,JSON.stringify(value,null,2)+'\n']);
 }
 for(const [file,pattern]of [['app/src-tauri/Cargo.toml',/(\[package\][\s\S]*?\nversion = ")[^"]+("\r?\n)/],['app/src-tauri/Cargo.lock',/(\[\[package\]\]\r?\nname = "app"\r?\nversion = ")[^"]+("\r?\n)/],['app/src/version.ts',/(export const APP_VERSION = ")[^"]+(";)/]]){
  const full=path.join(root,file),value=fs.readFileSync(full,'utf8');if(!pattern.test(value))throw Error('Version field not found: '+file);plan.push([full,value.replace(pattern,(_,a,b)=>a+version+b)]);
 }
 return {version,plan};
}
if(require.main===module){try{const check=process.argv.includes('--check'),arg=process.argv.slice(2).find(x=>x!=='--check')||JSON.parse(fs.readFileSync(path.join(root,'app/src-tauri/tauri.conf.json'))).version;const{version,plan}=versionPlan(arg);if(check){for(const[file,next]of plan){const before=fs.readFileSync(file,'utf8');if(file.endsWith('.json')){if(JSON.stringify(JSON.parse(before))!==JSON.stringify(JSON.parse(next)))throw Error('Version mismatch: '+path.relative(root,file));}else if(before!==next)throw Error('Version mismatch: '+path.relative(root,file));}}else for(const[file,text]of plan)fs.writeFileSync(file,text);console.log('Release versions agree: '+version);}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={versionPlan};
