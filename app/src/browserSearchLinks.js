/* Yandex creates a blank popup before assigning some result URLs. The native browser
 * rejects blank popups. A real, plain click on an external result navigates this tab
 * directly; modifier clicks retain the normal new-tab path. No Luna IPC is exposed. */
(()=>{
 if(window!==window.top||!/(^|\.)yandex\.(ru|com|com\.tr|kz|by|uz|eu)$/i.test(location.hostname))return;
 document.addEventListener('click',event=>{
  if(!event.isTrusted||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const link=event.composedPath().find(node=>node instanceof HTMLAnchorElement);
  if(!link||link.hasAttribute('download'))return;
  let url;try{url=new URL(link.href,location.href);}catch{return;}
  if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.origin===location.origin)return;
  event.preventDefault();event.stopImmediatePropagation();location.assign(url.href);
 },true);
})();
