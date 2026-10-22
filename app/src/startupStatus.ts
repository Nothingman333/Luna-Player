type Boot={phase:(value:string)=>void;fail:(error:unknown)=>void;ready:()=>void};
const boot=()=> (window as Window & {LunaBoot?:Boot}).LunaBoot;
export const startupPhase=(value:string)=>boot()?.phase(value);
export const startupFailure=(error:unknown)=>boot()?.fail(error);
export const startupReady=()=>boot()?.ready();
