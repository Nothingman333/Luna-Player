// Import errors happen before main.tsx/ErrorBoundary can run. Keep this entry dependency-free.
import("./main").catch(error=>{
  (window as Window & {LunaBoot?:{fail:(error:unknown)=>void}}).LunaBoot?.fail(error);
});
