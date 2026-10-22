import {logDebug} from "./debugTelemetry";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { tt } from "./i18n";
import "./ErrorBoundary.css";

/** What is copied for a bug report: the error and the start of its stack (no stored data, no keys). */
export function errorDetail(error: unknown): string {
  const e = error instanceof Error ? error : new Error(String(error));
  return `${e.name}: ${e.message}\n${(e.stack ?? "").split("\n").slice(1, 12).join("\n")}`.slice(0, 2000);
}

type State = { error: Error | null; note: "" | "copied" | "failed" };

/** A render error must not leave an empty window: this shows a way back instead.
 *  Saved data is untouched by a render error; reloading starts the screen again. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, note: "" };
  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)), note: "" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logDebug("error","React render failure",{error,stack:info.componentStack},"error");
    console.error("Luna: a screen failed to render", error, info.componentStack);
  }
  copy = async () => {
    try { await navigator.clipboard.writeText(errorDetail(this.state.error)); this.setState({ note: "copied" }); }
    catch { this.setState({ note: "failed" }); }
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="luna-crash" role="alert">
        <div className="luna-crash-card">
          <b className="luna-crash-mark">luna<span>.</span></b>
          <h1>{tt("Bir şeyler ters gitti")}</h1>
          <p>{tt("Luna bu ekranı gösterirken beklenmeyen bir hata yakaladı. Kayıtlı verilerin bu hatadan etkilenmez; yeniden yüklemek çoğunlukla sorunu giderir.")}</p>
          <div className="luna-crash-actions">
            <button className="primary" onClick={() => location.reload()}>{tt("Yeniden yükle")}</button>
            <button className="chip" onClick={this.copy}>{tt("Hata ayrıntısını kopyala")}</button>
          </div>
          {this.state.note && <p className="luna-crash-note" role="status">{this.state.note === "copied" ? tt("Ayrıntı panoya kopyalandı.") : tt("Kopyalanamadı; ayrıntıyı aşağıdan elle seçebilirsin.")}</p>}
          <details><summary>{tt("Teknik ayrıntı")}</summary><pre>{errorDetail(this.state.error)}</pre></details>
        </div>
      </main>
    );
  }
}
