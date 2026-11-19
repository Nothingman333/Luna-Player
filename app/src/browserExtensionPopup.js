// Runs inside an extension's toolbar popup. Chrome answers "the active tab" with the page the popup belongs to;
// in Luna the popup is its own webview, so point that question at the page Luna had selected (a real tab from
// chrome.tabs, never a made-up one). Any other query goes to the extension API unchanged.
(()=>{
 const PAGE=__LUNA_PAGE__;
 const api=globalThis.chrome;
 if(!PAGE||!api||!api.tabs||typeof api.tabs.query!=="function")return;
 const original=api.tabs.query.bind(api.tabs);
 const asksActive=info=>!!info&&info.active===true&&!info.url&&info.windowId===undefined;
 const call=info=>new Promise(resolve=>{try{const r=original(info,tabs=>resolve(Array.isArray(tabs)?tabs:[]));if(r&&typeof r.then==="function")r.then(t=>resolve(Array.isArray(t)?t:[]),()=>resolve([]));}catch{resolve([]);}});
 const query=function(info,callback){
  if(!asksActive(info))return original(info,callback);
  const result=call({}).then(tabs=>{const hit=tabs.find(t=>t&&t.url===PAGE);return hit?[Object.assign({},hit,{active:true})]:call(info);});
  if(typeof callback==="function"){result.then(callback);return;}
  return result;
 };
 try{api.tabs.query=query;}catch{try{Object.defineProperty(api.tabs,"query",{value:query,configurable:true});}catch{}}
})();
