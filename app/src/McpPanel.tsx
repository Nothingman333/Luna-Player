import {useState} from "react";
import {open} from "@tauri-apps/plugin-dialog";
import {invoke} from "./nativeCore";
import {ExtraModal,extraText as tr} from "./Extras";
import {store,flushSecrets} from "./library";
import {flushDatabaseStorage} from "./databaseStorage";
type Profile={id:number;name:string;exe:string;args:string;cwd:string};
type Tool={name:string;description?:string;inputSchema:unknown};
type Connected={id:number;tools:Tool[]};
const fresh=(id:number):Profile=>({id,name:"MCP "+id,exe:"",args:"[]",cwd:""});
export function McpPanel({close}:{close:()=>void}){
  const [profiles,setProfiles]=useState<Profile[]>(()=>{const raw=store.json<unknown>("mcpProfiles",[]);return Array.isArray(raw)?raw.filter((p):p is Profile=>p&&typeof p==="object"&&Number.isInteger(p.id)&&p.id>=1&&p.id<=8&&[p.name,p.exe,p.args,p.cwd].every(s=>typeof s==="string")).slice(0,8):[]});
  const [profile,setProfile]=useState<Profile>(profiles[0]??fresh(1)),[environment,setEnvironment]=useState(()=>store.get("mcpEnv"+(profiles[0]?.id??1))??"{}");
  const [connected,setConnected]=useState<Connected|null>(null),[tool,setTool]=useState(""),[argumentsText,setArguments]=useState("{}"),[result,setResult]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const change=(p:Profile)=>{setProfile(p);setEnvironment(store.get("mcpEnv"+p.id)??"{}");setError("");};
  const save=async()=>{
    const args:unknown=JSON.parse(profile.args),env:unknown=JSON.parse(environment);
    if(!Array.isArray(args)||args.some(s=>typeof s!=="string")||!env||typeof env!=="object"||Array.isArray(env)||Object.values(env).some(v=>typeof v!=="string"))throw Error(tr("Argümanlar metin listesi, ortam değerleri metin olmalı.","Arguments must be a string array; environment values must be strings."));
    const next=[...profiles.filter(p=>p.id!==profile.id),profile].sort((a,b)=>a.id-b.id);
    store.set("mcpEnv"+profile.id,environment);await flushSecrets();store.set("mcpProfiles",JSON.stringify(next));await flushDatabaseStorage();setProfiles(next);
    return{...profile,args,env,cwd:profile.cwd||null};
  };
  const connect=async()=>{setBusy(true);setError("");setResult("");try{const config=await save();if(connected)await invoke("mcp_disconnect",{id:connected.id});setConnected(null);const server=await invoke<Connected>("mcp_connect",{config});setConnected(server);setTool(server.tools[0]?.name??"");}catch(e){setError(String(e));}finally{setBusy(false);}};
  const call=async()=>{
    if(!connected||!tool)return;setBusy(true);setError("");setResult("");
    try{const args:unknown=JSON.parse(argumentsText);if(!args||typeof args!=="object"||Array.isArray(args))throw Error(tr("Araç girdisi JSON nesnesi olmalı.","Tool input must be a JSON object."));const value=await invoke("mcp_call",{id:connected.id,name:tool,arguments:args});setResult(JSON.stringify(value,null,2));}catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const selected=connected?.tools.find(t=>t.name===tool);
  return <ExtraModal title={tr("MCP sunucuları","MCP servers")} close={close}><div className="luna-extra everyday-form">
    <p className="muted">{tr("Eklediğiniz yerel MCP sunucularını bağlayıp araçlarını çalıştırın. Sunucu programı seçtiğinizde başlatılır; kendiliğinden indirme veya başlangıçta çalıştırma yapılmaz.","Connect local MCP servers and run their tools. The selected program starts when you connect; nothing is downloaded or launched automatically at startup.")}</p>
    <select aria-label={tr("Sunucu profili","Server profile")} disabled={busy} value={profile.id} onChange={e=>change(profiles.find(p=>p.id===+e.target.value)??fresh(+e.target.value))}>{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{profiles.find(p=>p.id===i+1)?.name??"MCP "+(i+1)}</option>)}</select>
    <label>{tr("Ad","Name")}<input value={profile.name} maxLength={80} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
    <label>{tr("Program (.exe)","Program (.exe)")}<input value={profile.exe} onChange={e=>setProfile({...profile,exe:e.target.value})}/><button className="chip" disabled={busy} onClick={async()=>{const file=await open({multiple:false,filters:[{name:"Executable",extensions:["exe"]}]}).catch(()=>null);if(typeof file==="string")setProfile({...profile,exe:file});}}>{tr("Program seç","Choose program")}</button></label>
    <label>{tr("Argümanlar (JSON listesi)","Arguments (JSON array)")}<textarea value={profile.args} rows={3} onChange={e=>setProfile({...profile,args:e.target.value})}/></label>
    <label>{tr("Çalışma klasörü (isteğe bağlı)","Working folder (optional)")}<input value={profile.cwd} onChange={e=>setProfile({...profile,cwd:e.target.value})}/></label>
    <label>{tr("Ortam değişkenleri (JSON; Windows'ta şifreli saklanır)","Environment variables (JSON; encrypted by Windows)")}<textarea value={environment} rows={3} spellCheck={false} onChange={e=>setEnvironment(e.target.value)}/></label>
    <div className="extra-row"><button className="primary" disabled={busy||!profile.exe} onClick={()=>void connect()}>{tr("Kaydet ve bağlan","Save and connect")}</button>{connected&&<button className="chip" disabled={busy} onClick={async()=>{try{await invoke("mcp_disconnect",{id:connected.id});setConnected(null);}catch(e){setError(String(e));}}}>{tr("Bağlantıyı kes","Disconnect")}</button>}</div>
    {connected&&<><select aria-label={tr("Araç","Tool")} value={tool} onChange={e=>{setTool(e.target.value);}}>{connected.tools.map(t=><option key={t.name}>{t.name}</option>)}</select><p className="muted">{selected?.description}</p><details><summary>{tr("Araç girdi şeması","Tool input schema")}</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(selected?.inputSchema,null,2)}</pre></details><textarea aria-label={tr("Araç girdisi","Tool input")} rows={6} value={argumentsText} onChange={e=>{setArguments(e.target.value);}}/>
      <button className="primary" disabled={busy||!tool} onClick={()=>void call()}>{tr("Çalıştır","Run")}</button></>}
    {busy&&<p role="status">{tr("İşlem sürüyor…","Working…")}</p>}{error&&<p className="lp-msg warn" role="alert">{error}</p>}{result&&<pre style={{maxHeight:400,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{result}</pre>}
  </div></ExtraModal>;
}
