let unlocked=false;
export const developerSessionActive=()=>unlocked;
export function setDeveloperSession(active:boolean){if(active===unlocked)return;unlocked=active;window.dispatchEvent(new Event("luna-dev-session"));}
