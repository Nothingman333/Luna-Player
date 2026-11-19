import { useEffect, useRef, useState } from "react";
import { tt } from "./i18n";
import { tasteFillState } from "./tasteFill";
import type { DetailTarget } from "./Taste";

/** Analyses keep running while the user moves around Luna: they are listed here and shown at the top right. */
export type AnalysisTask = { key: string; title: string; status: string; state: "running" | "done" | "error"; pct: number; at: number; target: DetailTarget | null; cancel: () => void };
let tasks: AnalysisTask[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export const taskOf = (key: string) => tasks.find((t) => t.key === key);
export function beginTask(key: string, title: string, target: DetailTarget | null, cancel: () => void): AnalysisTask {
  const task: AnalysisTask = { key, title, status: "", state: "running", pct: 3, at: Date.now(), target, cancel };
  tasks = [...tasks.filter((t) => t.key !== key), task];
  changed();
  return task;
}
export function updateTask(task: AnalysisTask, patch: Partial<Pick<AnalysisTask, "status" | "state" | "pct">>) {
  if (!tasks.includes(task)) return;
  Object.assign(task, patch);
  changed();
}
export function dropTask(task: AnalysisTask) {
  if (!tasks.includes(task)) return;
  tasks = tasks.filter((t) => t !== task);
  changed();
}

export function useAnalysisTask(key: string) {
  const [, redraw] = useState(0);
  useEffect(() => { const f = () => redraw((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return taskOf(key);
}

const elapsed = (at: number) => { const n = Math.max(0, Math.floor((Date.now() - at) / 1000)); return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0"); };
const Progress = ({ pct }: { pct: number }) => <div className="an-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: pct + "%" }} /></div>;

/** Not mounted during playback or on Luna Web; hidden by CSS while a book is open. */
export function AnalysisHost() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const f = () => redraw((n) => n + 1);
    listeners.add(f);
    window.addEventListener("luna-taste-measuring", f);
    return () => { listeners.delete(f); window.removeEventListener("luna-taste-measuring", f); };
  }, []);
  const scan = tasteFillState();
  // the scan only says how many are left: its size and start are taken when it appears
  const scanRun = useRef<{ total: number; at: number } | null>(null);
  if (scan?.kind !== "film") scanRun.current = null;
  else if (!scanRun.current) scanRun.current = { total: scan.count, at: Date.now() };
  const ticking = scan?.kind === "film" || tasks.some((t) => t.state === "running");
  useEffect(() => { if (!ticking) return; const id = setInterval(() => redraw((n) => n + 1), 1000); return () => clearInterval(id); }, [ticking]);
  if (!tasks.length && scan?.kind !== "film") return null;
  const open = (task: AnalysisTask) => { dropTask(task); if (task.target) window.dispatchEvent(new CustomEvent("luna-open-title", { detail: task.target })); };
  return <div className="an-tasks" role="status">
    {scan?.kind === "film" && <div className="an-task"><span className="spinner" aria-hidden="true" /><span className="an-copy"><b>{tt("Temalar taranıyor")}</b><small>{tt("{0} film kaldı", scan.count)}</small><Progress pct={((scanRun.current!.total - scan.count) / Math.max(1, scanRun.current!.total)) * 100} /></span><time className="an-time">{elapsed(scanRun.current!.at)}</time></div>}
    {tasks.map((task) => task.state === "running"
      ? <div className="an-task" key={task.key}><span className="spinner" aria-hidden="true" /><span className="an-copy"><b className="ellipsis">{task.title}</b><small className="ellipsis">{task.status || tt("Analiz sürüyor…")}</small><Progress pct={task.pct} /></span><time className="an-time">{elapsed(task.at)}</time></div>
      : <div className={"an-task -end" + (task.state === "error" ? " -bad" : "")} key={task.key}>
          <button className="an-copy" disabled={!task.target} onClick={() => open(task)}><b className="ellipsis">{task.title}</b><small className="ellipsis">{task.state === "error" ? tt("Analiz yapılamadı") : task.target ? tt("Analiz bitti. Açmak için tıkla") : tt("Analiz bitti")}</small></button>
          <button className="an-x" aria-label={tt("Kapat")} onClick={() => dropTask(task)}>×</button>
        </div>)}
  </div>;
}
