import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Browser } from "../src/Browser";
import "../src/App.css";
import "../src/Refinements.css";
function Preview() {
  const [active, setActive] = useState(true);
  return <main className="root" style={{ "--acc-rgb": "232,112,26" } as React.CSSProperties}>
    <header className="app-header" style={{ height: 76, padding: "0 24px" }}><b style={{ fontSize: 24, letterSpacing: -1 }}>luna<span style={{ color: "var(--accent)" }}>.</span></b><nav className="mode-switch"><button className="mode-btn">Film</button><button className="mode-btn">Müzik</button><button className="mode-btn">Kitap</button><button className="mode-btn on" onClick={() => setActive(true)}>◎ Web</button></nav><span className="grow"/><small className="muted">Luna Web · Tasarım önizlemesi</small></header>
    <Browser active={active} onClose={() => setActive(false)} onPage={page => { (window as unknown as { __page?: unknown }).__page = page; }} onInvalidate={() => {}} onPlay={url => { (window as unknown as { __played?: string }).__played = url; }}/>
    {!active && <div className="page"><h2>Luna Web</h2><p>Önizlemeye dönmek için üstteki Web düğmesine tıkla.</p></div>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview/></React.StrictMode>);
