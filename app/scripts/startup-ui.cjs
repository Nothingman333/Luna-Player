// Full production index/main/App, synthetic native bridge. Never automates the real Luna window.
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});const passed=[];try{
for(const scenario of ['normal','readonly-bridge','state-stall','credential-stall','module-failure']){
 const page=await browser.newPage();page.setDefaultTimeout(7000);await page.clock.install();
 await page.addInitScript(({scenario})=>{localStorage.setItem('lang','en');let n=0;window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++n,unregisterCallback(){},invoke:async(cmd,args)=>{if(cmd==='state_load')return scenario==='state-stall'?new Promise(()=>{}):null;if(cmd==='secrets_load')return scenario==='credential-stall'?new Promise(()=>{}):{};if(cmd.includes('listen'))return ++n;if(cmd.includes('is_'))return false;if(['scan','music_scan','book_scan'].includes(cmd))return[];return null;}};if(scenario==='readonly-bridge')Object.freeze(window.__TAURI_INTERNALS__);},{scenario});
 if(scenario==='module-failure')await page.route(/\/assets\/main-[^/]+\.js$/,r=>r.abort());
 await page.goto(process.env.LUNA_TEST_URL||'http://127.0.0.1:1449/');
 if(scenario==='normal'||scenario==='readonly-bridge'){
  await page.locator('.root').waitFor();await page.locator('#luna-boot').waitFor({state:'detached'});assert((await page.locator('body').innerText()).includes('Film'));passed.push(scenario+': real production entry mounts App and removes startup overlay after React commit');
 }else if(scenario==='module-failure'){
  await page.getByRole('heading',{name:'Luna could not start'}).waitFor();assert(await page.getByRole('button',{name:'Retry'}).isVisible());passed.push('Failed module import produces an independent startup error instead of an empty window');
 }else{
  const phase=scenario==='state-stall'?'state_load':'secrets_load';await page.waitForFunction(value=>document.getElementById('luna-boot-phase')?.textContent.includes(value),phase);await page.clock.fastForward(16000);await page.getByRole('heading',{name:'Luna could not start'}).waitFor();assert((await page.locator('#luna-boot-detail').innerText()).includes(phase));assert.equal(await page.locator('.root').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('lang')),'en');passed.push(phase+' stall shows the stuck phase without mounting over unhydrated state or deleting data');
 }
 await page.close();
}
console.log(JSON.stringify({level:'full Vite production entry, real App/React, synthetic native IPC',passed},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
