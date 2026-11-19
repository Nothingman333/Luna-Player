// Runs only on an explicit trusted-UI collection action; returns data, never invokes Luna.
(()=>{
 const at=(doc,x,y,depth=0)=>{
  if(depth>4)return null;
  let node=doc.elementFromPoint(x,y);if(!node)return null;
  while(node.shadowRoot){const inner=node.shadowRoot.elementFromPoint(x,y);if(!inner||inner===node)break;node=inner;}
  if(node.tagName==='IFRAME'){try{const rect=node.getBoundingClientRect();return at(node.contentDocument,x-rect.left,y-rect.top,depth+1);}catch{return null;}}
  const media=node.closest('img,video,audio')||node.querySelector('img,video,audio');
  if(!media)return null;
  const type=media.tagName.toLowerCase()==='img'?'image':media.tagName.toLowerCase();
  const raw=media.currentSrc||media.getAttribute('src')||media.getAttribute('data-src')||media.getAttribute('data-original');
  if(!raw)return null;let source;try{source=new URL(raw,media.ownerDocument.baseURI);if(!/^https?:$/.test(source.protocol)||source.username||source.password)return null;}catch{return null;}
  return {source:source.href,type,title:media.getAttribute('alt')||media.getAttribute('title')||''};
 };
 return JSON.stringify(at(document,__LUNA_X__,__LUNA_Y__));
})()
