import {useEffect,useState} from 'react';
import {ExtraModal,extraText as t} from './Extras';
import {copyAssistantText} from './AssistantTools';
import {LOCAL_TRANSLATION_LANGUAGES} from './localWebTranslation';
import {translateRows} from './browserTranslation';
import './BrowserLocalTranslation.css';
export function BrowserLocalTranslation({text,source,target,close}:{text:string;source:string;target:string;close:()=>void}){
  const[from,setFrom]=useState(source),[to,setTo]=useState(target),[result,setResult]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;const controller=new AbortController();setBusy(true);setResult('');setError('');
    translateRows([{id:0,text}],to,from,message=>{if(active)setStatus(message);}).then(rows=>{if(active)setResult(rows[0].text);}).catch(e=>{if(active)setError(String(e instanceof Error?e.message:e));}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();};
  },[text,from,to,attempt]);
  const languages=Object.keys(LOCAL_TRANSLATION_LANGUAGES);
  return <ExtraModal title={t('Çeviri','Translation')} className="browser-local-translation" close={close}>
    <div className="local-translation-languages"><label>{t('Kaynak dil','Source language')}<select disabled={busy} value={from} onChange={e=>setFrom(e.target.value)}>{languages.map(l=><option key={l}>{l}</option>)}</select></label><span aria-hidden="true">→</span><label>{t('Hedef dil','Target language')}<select disabled={busy} value={to} onChange={e=>setTo(e.target.value)}>{languages.map(l=><option key={l}>{l}</option>)}</select></label></div>
    <p className="muted small">{t('Chrome’daki gibi Google Çeviri ile çevrilir; internet yoksa cihazındaki yerel çeviri kullanılır.','Translated with Google Translate, like Chrome; without internet, on-device translation is used.')}</p>
    <div className="local-translation-text">{text}</div>
    {busy?<p role="status" className="local-translation-progress">{status||t('Çevriliyor…','Translating…')}</p>:error?<><p role="alert">{error}</p><button className="chip" onClick={()=>setAttempt(n=>n+1)}>{t('Yeniden dene','Retry')}</button></>:<><div className="local-translation-text local-translation-result">{result}</div><button className="chip" onClick={()=>void copyAssistantText(result).catch(e=>setError(String(e)))}>{t('Çeviriyi kopyala','Copy translation')}</button></>}
  </ExtraModal>;
}
