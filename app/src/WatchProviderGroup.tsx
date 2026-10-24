import {useEffect,useRef,useState} from "react";
import type {CSSProperties} from "react";
import {IMG} from "./library";
import {extraText} from "./Extras";
import type {Provider} from "./titleExtrasModel";

export function WatchProviderGroup({label,providers,onOpen}:{label:string;providers:Provider[];onOpen:()=>void}){
  const [open,setOpen]=useState(false),[width,setWidth]=useState(400);
  const box=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect();},[providers.length]);
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!box.current?.contains(event.target as Node))setOpen(false);};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[open]);
  if(!providers.length)return null;
  const logo=(provider:Provider)=>provider.logo?<img src={IMG+"w92"+provider.logo} alt="" loading="lazy"/>:<span className="ww-initial" aria-hidden="true">{provider.name.slice(0,2)}</span>;
  const step=Math.min(44,Math.max(0,(width-36)/Math.max(1,providers.length-1)));
  return <div className="ww-group"><span className="ww-label">{label}</span>{providers.length<=3?providers.map(provider=><button key={provider.id} className="ww-chip" onClick={onOpen} title={provider.name}>{logo(provider)}<span>{provider.name}</span></button>):<div className={"ww-fan"+(open?" is-open":"")} ref={box} onPointerEnter={event=>{if(event.pointerType==="mouse")setOpen(true);}} onPointerLeave={()=>{if(!box.current?.contains(document.activeElement))setOpen(false);}} onFocusCapture={event=>{if(event.target.matches(":focus-visible"))setOpen(true);}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();trigger.current?.focus();setOpen(false);}}}>
    {providers.map((provider,index)=><button key={provider.id} className="ww-fan-logo" style={{"--fan-x":(open?index*step:Math.min(index,3)*19)+"px",zIndex:providers.length-index,opacity:open||index<4?1:0,pointerEvents:open||index<4?"auto":"none"} as CSSProperties} tabIndex={open||index<4?0:-1} aria-label={provider.name} title={provider.name} onClick={()=>{if(open)onOpen();else setOpen(true);}}>{logo(provider)}</button>)}
    <button ref={trigger} className="ww-fan-count" style={{left:open?Math.min(width-90,(providers.length-1)*step+44):98,opacity:open?0:1,pointerEvents:open?"none":"auto"}} aria-label={extraText(label+": "+providers.length+" seçeneği göster",label+": show "+providers.length+" options")} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{providers.length} {extraText("seçenek","options")}</button>
  </div>}</div>;
}
