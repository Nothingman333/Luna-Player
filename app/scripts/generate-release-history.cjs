const fs=require('fs'),path=require('path');
const log=fs.readFileSync(path.join(__dirname,'../../CHANGELOG.md'),'utf8'),entries=[];
for(const match of log.matchAll(/^## (\d+\.\d+\.\d+)(?:[A-Z]+)?[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm))entries.push({version:match[1],text:match[2].trim()});
const target=path.join(__dirname,'../src/releaseHistory.ts'),source='// Generated from the versioned CHANGELOG; keep older records for skipped upgrades.\nexport const RELEASE_HISTORY='+JSON.stringify(entries,null,2)+';\n';if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==source)fs.writeFileSync(target,source);
console.log('Release history: '+entries.length+' version records.');
