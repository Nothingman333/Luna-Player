/* Chrome Web Store: the store's own "Add to Chrome" button asks Luna to install the extension on this page,
 * like a normal browser. No Luna IPC is exposed: a real click navigates to a reserved store address, which the
 * native tab refuses and reports. Luna then verifies the CRX from Google and asks once, as Chrome does. */
(()=>{
 if(window!==window.top||location.hostname!=='chromewebstore.google.com')return;
 const id=()=>(location.pathname.match(/\/detail\/(?:[^/]+\/)?([a-p]{32})(?:\/|$)/)||[])[1];
 const words=/^(add to chrome|chrome['’]?a ekle|ekle|get|yükle|zu chrome hinzufügen|ajouter à chrome|añadir a chrome|agregar a chrome|aggiungi a chrome|adicionar ao chrome|toevoegen aan chrome|добавить в chrome)$/i;
 const isInstall=b=>b instanceof HTMLButtonElement&&words.test((b.textContent||'').replace(/\s+/g,' ').trim());
 // Outside Chrome the store may grey the button out; a disabled button would swallow the click.
 const wake=()=>{if(!id())return;for(const b of document.querySelectorAll('button[disabled],button[aria-disabled="true"]'))if(isInstall(b)){b.disabled=false;b.removeAttribute('aria-disabled');}};
 new MutationObserver(wake).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled']});
 document.addEventListener('click',event=>{
  if(!event.isTrusted||event.button!==0)return;
  const button=event.composedPath().find(isInstall),ext=id();
  if(!button||!ext)return;
  event.preventDefault();event.stopImmediatePropagation();
  location.assign('https://chromewebstore.google.com/luna-install/'+ext);
 },true);
})();
