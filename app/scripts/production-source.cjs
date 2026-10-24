// AST/source guards inspect the current runtime and UI source, never a frozen pre-refactor fixture.
const fs=require('node:fs'),path=require('node:path');
exports.read=file=>{let text=fs.readFileSync(file,'utf8');if(/^(Music|Books|Taste|Mine)\.tsx$/.test(path.basename(file))){const ui=file.replace(/\.tsx$/,'UI.tsx');if(fs.existsSync(ui))text+='\n'+fs.readFileSync(ui,'utf8');}return text;};
