import {useEffect,useRef,useState} from 'react';
import {invoke} from './nativeCore';
import {BrowserIcon} from './BrowserIcons';
import {extraText as t} from './Extras';
import './BrowserStoreInstall.css';
type Preview={token:string;name:string;version:string;permissions:string[];hosts:string[];signatureVerified:boolean};
export type StoreInstallRequest={url:string;key:number};
/** Chrome-style "Add extension?" card for the store's own install button: Luna fetches the CRX from Google,
 *  verifies its signature and store id, shows what it may access, and installs on one click. */
export function BrowserStoreInstall({request,close}:{request:StoreInstallRequest;close:()=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[phase,setPhase]=useState<'loading'|'ready'|'installing'|'done'|'error'>('loading'),[error,setError]=useState('');
 const token=useRef<string|null>(null),add=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let live=true;setPhase('loading');setPreview(null);setError('');
  void invoke<Preview>('browser_extension_prepare',{source:request.url,kind:'store'}).then(p=>{if(!live){void invoke('browser_extension_manage',{action:'discard',id:p.token}).catch(()=>{});return;}token.current=p.token;setPreview(p);setPhase('ready');},e=>{if(live){setError(String(e));setPhase('error');}});
  return()=>{live=false;if(token.current){void invoke('browser_extension_manage',{action:'discard',id:token.current}).catch(()=>{});token.current=null;}};
 },[request.key,request.url]);
 useEffect(()=>{if(phase==='ready')add.current?.focus();if(phase!=='done')return;const id=setTimeout(close,4500);return()=>clearTimeout(id);},[phase,close]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&phase!=='installing')close();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[phase,close]);
 async function install(){if(!preview||phase!=='ready')return;setPhase('installing');try{await invoke('browser_extension_manage',{action:'install',id:preview.token});token.current=null;window.dispatchEvent(new Event('luna-extensions-changed'));setPhase('done');}catch(e){setError(String(e));setPhase('error');}}
 const access=[...(preview?.hosts||[]),...(preview?.permissions||[])];
 return <div className="browser-store-install" role="alertdialog" aria-label={t('Eklenti ekle','Add extension')}>
  {phase==='loading'&&<p className="bsi-line"><span className="bsi-spin" aria-hidden="true"/>{t('Eklenti Google’dan alınıp doğrulanıyor…','Fetching and verifying the extension from Google…')}</p>}
  {(phase==='ready'||phase==='installing')&&preview&&<><b className="bsi-title">{t(`“${preview.name}” eklensin mi?`,`Add “${preview.name}”?`)}</b>
   <p className="bsi-sub">{access.length?t('Şunlara erişebilir:','It can access:'):t('Ek izin istemiyor.','It asks for no extra permissions.')}</p>
   {access.length>0&&<ul className="bsi-access">{access.slice(0,6).map((x,i)=><li key={i}>{x}</li>)}{access.length>6&&<li>{t(`ve ${access.length-6} izin daha`,`and ${access.length-6} more`)}</li>}</ul>}
   <div className="bsi-actions"><button type="button" className="chip" disabled={phase==='installing'} onClick={close}>{t('İptal','Cancel')}</button><button type="button" ref={add} className="chip on" disabled={phase==='installing'} onClick={()=>void install()}>{phase==='installing'?t('Ekleniyor…','Adding…'):t('Eklentiyi ekle','Add extension')}</button></div></>}
  {phase==='done'&&<p className="bsi-line"><BrowserIcon name="extension" size={16}/>{t(`${preview?.name||'Eklenti'} eklendi. Eklentiler menüsünden sabitleyebilirsin.`,`${preview?.name||'Extension'} added. Pin it from the Extensions menu.`)}</p>}
  {phase==='error'&&<><p className="bsi-line" role="alert">{error}</p><div className="bsi-actions"><button type="button" className="chip" onClick={close}>{t('Kapat','Close')}</button></div></>}
 </div>;
}
