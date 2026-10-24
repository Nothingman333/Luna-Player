const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),pw=require('C:/Users/K/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=__dirname,results=[];
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{for(const width of [1280,640])for(const version of ['before','after'])for(const view of ['compare','assistant','notebook','history']){
 const tr=width===1280,page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#35404c"/><text x="20" y="180" fill="white">Sample cover</text></svg>'}));
 await page.addInitScript(({tr})=>{localStorage.setItem('lang',tr?'tr':'en');const notes=[{url:'https://reading.example/first',text:'First note',at:1},{url:'https://reading.example/standalone',text:'Standalone note',at:2}],reading=[{url:notes[0].url,title:'Not aldığım yazı',progress:.65,done:false,at:2},{url:'https://reading.example/no-note',title:'Henüz not almadığım yazı',progress:0,done:false,at:1}];localStorage.setItem('lunaWebReading',JSON.stringify(reading));localStorage.setItem('lunaWebNotes',JSON.stringify(notes));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});Object.defineProperty(window,'__TAURI_INTERNALS__',{value:Object.freeze({invoke:async()=>null,convertFileSrc:p=>p,transformCallback:()=>1,unregisterCallback(){}})});},{tr});
 await page.goto('http://127.0.0.1:1458/@fs/'+base.replaceAll('\\','/')+'/'+version+'.html?view='+view);await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready);
 const label=(a,b)=>tr?a:b;
 async function shot(suffix=''){await page.waitForTimeout(250);await page.screenshot({path:path.join(base,`${version}-${width}-${view}${suffix}.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');}
 if(view==='compare'){
  await page.getByRole('button',{name:new RegExp(label('Yan yana bak','Compare side by side'))}).click();await page.locator('.library-compare-card').first().waitFor();await shot();
  if(version==='after'){
   assert((await page.locator('.library-compare-summary').innerText()).includes('30'));assert((await page.locator('.library-compare-summary').innerText()).includes('Dram'));
   assert.equal(await page.locator('.library-compare-card img').first().getAttribute('src'),'https://covers.example/custom.jpg');
   await page.getByRole('button',{name:label('Karşılaştırmayı kopyala','Copy comparison'),exact:true}).click();assert(!(await page.evaluate(()=>window.__copied)).includes('SPOILER'));
   await page.getByRole('checkbox',{name:label('Konu özetlerini göster','Show plot summaries')}).check();await page.getByRole('button',{name:label('Karşılaştırmayı kopyala','Copy comparison'),exact:true}).click();assert((await page.evaluate(()=>window.__copied)).includes('SPOILER'));
   await page.locator('.library-compare-actions').last().getByRole('button',{name:/Henüz Süresi/}).click();assert.equal(await page.locator('.library-compare-card').count(),2);
   await page.locator('.library-compare-actions').last().getByRole('button',{name:/Geceyi/}).click();await page.getByText(label('Karşılaştırma için raftan en az iki eser seç.','Select at least two titles from the shelf to compare.')).waitFor();await shot('-one-left');
  }
 }
 if(view==='assistant'){
  await page.locator('.assistant-index summary').click();await page.locator('.assistant-index-tabs').getByRole('button',{name:new RegExp('^'+label('Kaynaklar','Sources'))}).click();assert.equal(await page.locator('.assistant-index-item').count(),3);await shot();
  if(version==='after'){
   await page.getByRole('combobox',{name:label('Kaynak sitesine göre filtrele','Filter by source site')}).selectOption('cinema.example');assert.equal(await page.locator('.assistant-index-item').count(),2);
   await page.getByRole('button',{name:label('Eşleşen kaynakları kopyala','Copy matching sources')}).click();const copied=await page.evaluate(()=>window.__copied);assert(copied.includes('cinema.example/language'));assert(!copied.includes('archive.example'));
   await page.locator('.assistant-index-item').first().getByRole('button').click();assert.equal(await page.evaluate(()=>window.__jump),1);
   await shot('-filtered');await page.getByRole('button',{name:label('Aramayı temizle','Clear search'),exact:true}).click();assert.equal(await page.locator('.assistant-index-item').count(),3);
  }
 }
 if(view==='notebook'){
  await page.locator('.web-notebook-card').first().waitFor();await shot();
  if(version==='after'){
   await page.getByRole('checkbox',{name:label('Yalnız notu olan sayfalar','Only pages with notes')}).check();assert.equal(await page.locator('.web-notebook-card').count(),1);await shot('-noted');
   await page.getByRole('button',{name:label('Filtreleri temizle','Clear filters'),exact:true}).click();assert.equal(await page.locator('.web-notebook-card').count(),2);
   await page.getByRole('button',{name:label('Bütün sayfa notları','All page notes'),exact:true}).click();await page.getByRole('button',{name:label('Okuma kuyruğuna ekle','Add to reading queue'),exact:true}).click();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lunaWebReading')).length===3);assert.equal(await page.getByRole('button',{name:label('Okuma kuyruğuna ekle','Add to reading queue'),exact:true}).count(),0);
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lunaWebReading')));assert.equal(saved.find(r=>r.url.endsWith('/first')).progress,.65);assert.equal(saved.find(r=>r.url.endsWith('/standalone')).progress,0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lunaWebNotes')).length),2);await shot('-queued');
  }
 }
 if(view==='history'){
  await page.locator('.browser-history-row').first().waitFor();await shot();
  if(version==='after'){
   const now=await page.evaluate(()=>Date.now());await page.getByRole('button',{name:label('Son 1 saati sil','Remove last hour'),exact:true}).click();assert.equal(await page.evaluate(()=>window.__since),undefined);
   assert((await page.locator('.browser-history-confirm').innerText()).includes('2'));await shot('-confirmation');await page.getByRole('button',{name:label('Vazgeç','Cancel'),exact:true}).click();assert.equal(await page.locator('.browser-history-row').count(),4);
   await page.getByRole('button',{name:label('Son 1 saati sil','Remove last hour'),exact:true}).click();await page.getByRole('button',{name:label('Evet, sil','Yes, delete'),exact:true}).click();assert.equal(await page.locator('.browser-history-row').count(),2);assert(Math.abs((await page.evaluate(()=>window.__since))-(now-3600000))<2000);
   await page.getByRole('textbox',{name:label('Geçmişte ara','Search history'),exact:true}).fill('unmatched');await page.getByRole('button',{name:label('Filtreleri temizle','Clear filters'),exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.browser-history-row').length===2);assert.equal(await page.locator('.browser-history-row').count(),2);
  }
 }
 assert.deepEqual(errors,[]);results.push({width,version,view,errors});console.log(width,version,view,'pass');fs.writeFileSync(path.join(base,'results.json'),JSON.stringify(results,null,2));await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
