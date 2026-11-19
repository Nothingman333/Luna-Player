import { useEffect, useRef, useState } from "react";
import { WebMenu, label } from "./BrowserPanels";
import { copyAssistantText } from "./AssistantTools";
export function BrowserInputMenu({navigate,error}:{navigate:(text:string)=>void;error:(e:unknown)=>void}) {
  const [menu,setMenu]=useState<{input:HTMLInputElement;x:number;y:number;start:number;end:number;search:boolean;undo:boolean}|null>(null);
  const [clipboard,setClipboard]=useState<string|null>(null),generation=useRef(0);
  useEffect(()=>{const open=(e:MouseEvent)=>{const input=e.target;if(!(input instanceof HTMLInputElement)||!input.matches(".browser-address input,.browser-start-search input"))return;
    e.preventDefault();const g=++generation.current;setClipboard(null);setMenu({input,x:e.clientX,y:e.clientY,start:input.selectionStart??0,end:input.selectionEnd??0,search:!!input.closest(".browser-start-search"),undo:document.queryCommandEnabled("undo")});
    void navigator.clipboard?.readText().then(text=>{if(generation.current===g)setClipboard(text);}).catch(()=>{});
  };document.addEventListener("contextmenu",open);return()=>{++generation.current;document.removeEventListener("contextmenu",open);};},[]);
  if(!menu)return null;
  const {input,start,end}=menu,selection=input.value.slice(start,end);
  const originalValue=input.value;
  const focus=()=>{if(!input.isConnected || input.value!==originalValue)return false;input.focus();input.setSelectionRange(start,end);return true;};
  const command=(name:string,value?:string)=>{if(focus())document.execCommand(name,false,value);};
  const paste=()=>{if(clipboard!==null)command("insertText",clipboard);};
  return <WebMenu x={menu.x} y={menu.y} close={()=>{++generation.current;setMenu(null);}} items={[
    {label:label("Geri al","Undo"),hint:"Ctrl+Z",disabled:!menu.undo,run:()=>command("undo")},"sep",
    {label:label("Kes","Cut"),hint:"Ctrl+X",disabled:!selection,run:()=>{void copyAssistantText(selection).then(()=>command("delete")).catch(error);}},
    {label:label("Kopyala","Copy"),icon:"copy",hint:"Ctrl+C",disabled:!selection,run:()=>{void copyAssistantText(selection).catch(error);}},
    {label:label("Yapıştır","Paste"),hint:"Ctrl+V",disabled:!clipboard,run:paste},
    {label:menu.search?label("Yapıştır ve ara","Paste and search"):label("Yapıştır ve git","Paste and go"),disabled:!clipboard?.trim(),run:()=>{if(clipboard?.trim())navigate(clipboard.trim());}},
    {label:label("Sil","Delete"),disabled:!selection,run:()=>command("delete")},"sep",
    {label:label("Tümünü seç","Select all"),hint:"Ctrl+A",disabled:!input.value,run:()=>{input.focus();input.select();}}
  ]}/>;
}
