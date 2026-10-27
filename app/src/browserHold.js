/* Native-owned hold, also injected into cross-origin frames. No IPC is exposed. */
(()=>{if(typeof window.__lunaHoldMedia==='function')return;const pause=HTMLMediaElement.prototype.pause;let held=false;
const roots=()=>{const all=[document];for(let i=0;i<all.length&&all.length<128;i++)for(const e of all[i].querySelectorAll('*'))if(e.shadowRoot)all.push(e.shadowRoot);return all;};
const stop=()=>{for(const root of roots())for(const m of root.querySelectorAll('video,audio'))try{pause.call(m);}catch{}try{window.jwplayer?.()?.pause?.(true);}catch{}};
const relay=()=>{for(const root of roots())for(const f of root.querySelectorAll('iframe'))try{f.contentWindow.postMessage(held?'luna:pause-media':'luna:resume-media','*');}catch{}};
window.__lunaHoldMedia=value=>{held=value===true;if(held)stop();relay();};
window.addEventListener('message',e=>{if((e.source===window||e.source===window.parent)&&['luna:pause-media','luna:resume-media'].includes(e.data))window.__lunaHoldMedia(e.data==='luna:pause-media');});
document.addEventListener('play',()=>{if(held)stop();},true);document.addEventListener('load',e=>{if(held&&e.target?.tagName==='IFRAME')relay();},true);
setInterval(()=>{if(held){stop();relay();}},750);
})();
