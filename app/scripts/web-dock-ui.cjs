// Isolated CSS/layout check in headless Edge. Does not automate the native Luna window.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),pw=require('playwright');
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const css=['App.css','Browser.css'].map(n=>fs.readFileSync(path.join(root,'src',n),'utf8')).join('\n');
 await page.setContent(`<style>${css}</style><div class="root has-dock"><div class="shell"><header style="height:76px">Luna Web</header><div class="shell-body" style="height:1800px;background:red">Underlying library</div></div><section class="browser-shell"><div class="browser-chrome" style="height:100px">Browser</div><div class="browser-surface"></div></section><div class="mu-dock">Music</div></div>`);
 const passed=[];
 for(const [width,height] of [[1366,900],[480,820]]){
  await page.setViewportSize({width,height});
  const result=await page.evaluate(()=>{const shell=document.querySelector('.browser-shell'),surface=document.querySelector('.browser-surface').getBoundingClientRect(),dock=document.querySelector('.mu-dock').getBoundingClientRect();return{coversBottom:document.elementFromPoint(2,innerHeight-2)===shell,coversSide:document.elementFromPoint(2,dock.top+10)===shell,surfaceBottom:surface.bottom,dockTop:dock.top,bodyHidden:getComputedStyle(document.querySelector('.shell-body')).display==='none',scrollable:document.querySelector('.shell').scrollHeight>innerHeight+1};});
  assert(result.coversBottom&&result.coversSide,JSON.stringify(result));assert(result.surfaceBottom<=result.dockTop,JSON.stringify(result));assert(result.bodyHidden);assert(!result.scrollable);
  passed.push(`${width}px: opaque dock margins, page above dock, underlying library hidden, no stale library scrollbar`);
 }
 await page.evaluate(()=>document.querySelector('.root').classList.remove('has-dock'));
 assert.equal(await page.locator('.browser-surface').evaluate(el=>Math.round(el.getBoundingClientRect().bottom)),820);
 passed.push('Stopping music restores the full browser content height');
 await page.evaluate(()=>document.querySelector('.browser-shell').hidden=true);
 assert.equal(await page.locator('.shell-body').evaluate(el=>getComputedStyle(el).display),'block');
 assert.equal(await page.locator('.shell').evaluate(el=>getComputedStyle(el).overflowY),'auto');
 passed.push('Leaving Web restores the library visibility and scrolling');
 console.log(JSON.stringify({level:'headless Edge, production CSS, synthetic page/native slot',passed},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
