import{useEffect,useState}from"react";
import{aiProfiles,activateAiProfile}from"./ai";
import{store}from"./library";
import{extraText}from"./Extras";
export function AiProfilePicker({disabled=false}:{disabled?:boolean}){
 const[,bump]=useState(0),[error,setError]=useState("");
 useEffect(()=>{const f=()=>bump(n=>n+1);window.addEventListener("luna-ai-profile",f);return()=>window.removeEventListener("luna-ai-profile",f);},[]);
 const profiles=aiProfiles();if(!profiles.length)return null;
 return <label className="ai-profile-picker" title={error||extraText("Kaydedilmiş sağlayıcı; sonraki mesajda kullanılır","Saved provider; applies to the next message")}><select disabled={disabled} aria-label={extraText("Asistan sağlayıcısı","Assistant provider")} value={store.get("aiProfile")||""} onChange={e=>{try{activateAiProfile(e.target.value);setError("");}catch(error){setError(String(error));bump(n=>n+1);}}}><option value="">{extraText("Varsayılan sağlayıcı","Default provider")}</option>{profiles.map(p=><option key={p.slot} value={p.slot}>{p.name}</option>)}</select>{error&&<small role="alert">{error}</small>}</label>;
}
