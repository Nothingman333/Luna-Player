import {invoke} from "./nativeCore";
import {appStorage} from "./appStorage";
export type SystemProfile = {mpv:boolean;vulkan:boolean;gpus:string[];lossless:boolean;webview:string|null;memoryGb?:number|null};
export function gpuCapabilities(gpus:string[]|null) {
 const known=!!gpus?.length, names=(gpus??[]).join(" ");
 return {known,nvidia:/nvidia/i.test(names),intel:/intel/i.test(names),amd:/amd|radeon/i.test(names)};
}
let cached:Promise<SystemProfile>|undefined;
export function systemProfile(refresh=false):Promise<SystemProfile> {
 if(refresh)cached=undefined;
 return cached??(cached=invoke<SystemProfile>("system_check").then(profile=>{rememberHardware(profile);return profile;}).catch(error=>{cached=undefined;throw error;}));
}
/** Conservative defaults: no optional GPU filters are enabled by a vendor-name guess. */
export function rememberHardware(profile:SystemProfile) {
 const caps=gpuCapabilities(profile.gpus);
 appStorage.setItem("lunaHardwareProfile",JSON.stringify({at:Date.now(),...caps,lossless:profile.lossless,memoryGb:profile.memoryGb}));
 if(!appStorage.getItem("studioModel"))appStorage.setItem("studioModelHint",profile.memoryGb&&profile.memoryGb>=16?"small":"base");
 if(!appStorage.getItem("studioEngine"))appStorage.setItem("studioEngineHint",caps.nvidia?"cuda":"cpu");
}
