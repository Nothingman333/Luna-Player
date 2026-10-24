// Every non-UI regression script is included automatically. Browser/UI checks stay explicit.
const {spawnSync}=require('node:child_process');
const {scripts}=require('../package.json');
const selected=Object.entries(scripts).filter(([name,command])=>name.startsWith('test:') && (/^node scripts\/(?:[\w-]+-regression|unified-integration)\.cjs$/.test(command)||command==='node scripts/taste-core-test.mjs'));
for(const [name,command] of selected){
  console.log('\n'+name);
  const result=spawnSync(process.execPath,[command.slice('node '.length)],{cwd:require('node:path').join(__dirname,'..'),stdio:'inherit'});
  if(result.error){console.error(result.error);process.exit(1);}
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`\n${selected.length} regression commands passed.`);
