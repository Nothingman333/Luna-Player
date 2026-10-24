import {tt} from "./i18n";
export function FullscreenHint({inVideo,onDismiss}:{inVideo:boolean;onDismiss:()=>void}){
  return <div className={"full-tip"+(inVideo?" in-video":"")} role="status"><kbd>F11</kbd><span>{tt("Tam ekrandan çık")}</span><button aria-label={tt("Bildirimi kapat")} onClick={onDismiss}>×</button></div>;
}
