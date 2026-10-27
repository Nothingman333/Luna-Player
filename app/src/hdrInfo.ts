/** Describe decoded samples and the mpv swapchain separately; neither is a physical panel test. */
export function colorSignal(raw:unknown){
 const p=raw as Record<string,unknown>|null;if(!p)return "";
 const gamma=String(p.gamma||"").toLowerCase(),hdr=["pq","smpte2084","hlg","arib-std-b67"].includes(gamma);
 const format=String(p.pixelformat||""),depth=Number(p["component-depth"])||Number(format.match(/(?:p|le|be)(10|12|16)/)?.[1])||(format.includes("p010")?10:0);
 return [gamma?(hdr?"HDR / "+(["hlg","arib-std-b67"].includes(gamma)?"HLG":"PQ"):"SDR"):"",depth?depth+" bit":"",p.primaries?String(p.primaries).toUpperCase():""].filter(Boolean).join(" · ");
}
