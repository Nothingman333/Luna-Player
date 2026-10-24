import {appStorage as localStorage} from "./appStorage";
import { useEffect, useRef, useState } from "react";
import { extraText as t, exportExtra } from "./Extras";
import { cleanWebTabs, matchingWebTabs, missingWebTabs, type SavedWebTab } from "./browserWorkspaceModel";
import { readWebGroups, mergeWebGroups, upsertWebGroup, WEB_GROUPS_KEY, type WebTabGroup } from "./webTabGroupsModel";
import "./BrowserTabGroups.css";

function load(): WebTabGroup[] {
  const raw = localStorage.getItem(WEB_GROUPS_KEY);
  if (raw !== null) return readWebGroups(JSON.parse(raw));
  const legacy = localStorage.getItem("lunaWebSavedTabs");
  if (!legacy) return [];
  const rows = JSON.parse(legacy);
  if (Array.isArray(rows) && !rows.length) return [];
  // Legacy content is left untouched until an explicit successful save.
  return readWebGroups({ version: 1, groups: [{ id: "legacy", name: t("Kaydedilen sekmeler", "Saved tabs"), tabs: rows, updated: 0 }] });
}
export function BrowserTabGroups({ tabs, add, open, disabled, onBusy }: { tabs: SavedWebTab[]; add: (url: string) => Promise<boolean>; open: (url: string) => Promise<void>; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [initial] = useState(() => { try { return { groups: load(), error: "" }; } catch { return { groups: [], error: t("Sekme grupları okunamadı. Özgün kayıt korunuyor; Ayarlar’dan yedek al.", "Tab groups could not be read. The original is kept; save a backup in Settings.") }; } });
  const [groups, setGroups] = useState(initial.groups), [id, setId] = useState(initial.groups[0]?.id ?? ""), [name, setName] = useState("");
  const [query, setQuery] = useState(""), [status, setStatus] = useState(initial.error), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null), stop = useRef(false), alive = useRef(true), lock = useRef(false), tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current = true; }; }, []);
  const current = groups.find(g => g.id === id), blocked = disabled || busy || !!initial.error;
  const run = async (fn: () => Promise<void> | void) => {
    if (lock.current || disabled || initial.error) return;
    lock.current = true; stop.current = false; setBusy(true); onBusy(true); setStatus("");
    try { await fn(); } catch (e) { if (alive.current) {
      const message=String(e).replace(/^Error: /, "");
      const known:Record<string,string>={"A group with this name already exists.":t("Bu isimde bir grup zaten var; başka bir ad seç.","A group with this name already exists; choose another name."),"A merged group would exceed 8 tabs.":t("Birleştirme grubun 8 sekme sınırını aşıyor; kayıtların değiştirilmedi.","Merging would exceed 8 tabs in one group; your data was not changed."),"Maximum 12 tab groups.":t("En fazla 12 grup saklayabilirsin.","You can save up to 12 groups."),"Invalid group file (maximum 12 groups).":t("Grup dosyası geçersiz veya 12 grup sınırını aşıyor.","The group file is invalid or exceeds 12 groups."),"Invalid or repeated group name.":t("Grup adı geçersiz veya yineleniyor; en fazla 60 karakter kullan.","Group name is invalid or repeated; use up to 60 characters.")};
      setStatus(known[message]??message);
    } }
    finally { lock.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  };
  const save = (next: WebTabGroup[]) => {
    // Re-read before mutation. Concurrent windows must not overwrite each other's edits.
    if (JSON.stringify(load()) !== JSON.stringify(groups)) throw Error(t("Gruplar başka bir pencerede değişti. Bu pencereyi yeniden aç.", "Groups changed in another window. Reopen this window."));
    localStorage.setItem(WEB_GROUPS_KEY, JSON.stringify({ version: 1, groups: next }));
    setGroups(next); window.dispatchEvent(new Event("luna-extras"));
  };
  const restore = () => run(async () => {
    if (!current) return;
    const missing = missingWebTabs(current.tabs, tabsRef.current, 200);
    let opened = 0;
    for (const row of missing) {
      if (stop.current || !alive.current || tabsRef.current.length >= 8) break;
      if (!await add(row.url)) break;
      opened++;
    }
    if (alive.current) setStatus(t(`${opened} sekme açıldı; ${missing.length - opened} sekme açılmadı. Açık sekmeler korundu.`, `${opened} tabs opened; ${missing.length - opened} were not opened. Existing tabs were kept.`));
  });
  return <section className="web-groups" aria-label={t("Sekme grupları", "Tab groups")}>
    <div className="web-groups-heading"><div><h3>{t("Sekme grupların", "Your tab groups")}</h3><p>{t("Film gecesi, araştırma, sonra oku. Her grup en fazla 8 sekme; toplam 12 grup.", "Movie night, research, read later. Up to 8 tabs per group and 12 groups.")}</p></div><span>{groups.length}/12</span></div>
    {!initial.error && <>
      <form className="web-groups-create" onSubmit={e => { e.preventDefault(); void run(() => { const next = upsertWebGroup(groups, name, cleanWebTabs(tabsRef.current)); save(next); setId(next[next.length - 1].id); setName(""); setStatus(t("Yeni grup kaydedildi.", "New group saved.")); }); }}>
        <input maxLength={60} aria-label={t("Yeni sekme grubunun adı", "New tab group name")} placeholder={t("Ör. Film gecesi…", "For example, movie night…")} value={name} onChange={e => setName(e.target.value)} />
        <button className="chip" disabled={blocked || !name.trim() || !tabs.length || groups.length >= 12}>{t("Açık sekmelerden oluştur", "Create from open tabs")}</button>
      </form>
      <div className="web-groups-tabs" role="group" aria-label={t("Kaydedilen grubu seç", "Choose saved group")}>{groups.map(g => <button type="button" className={"chip" + (g.id === id ? " on" : "")} aria-pressed={g.id === id} key={g.id} onClick={() => setId(g.id)} disabled={busy} title={g.name}>{g.name}<small>{g.tabs.length}</small></button>)}</div>
      {current && <div className="web-groups-card">
        <div className="extra-row"><b>{current.name}</b><span className="grow" /><button type="button" className="chip" disabled={blocked || !missingWebTabs(current.tabs, tabs).length} onClick={restore}>{t("Eksik sekmeleri aç", "Open missing tabs")}</button>{busy && <button type="button" className="chip" onClick={() => { stop.current = true; }}>{t("Kalanları durdur", "Stop remaining")}</button>}</div>
        <small>{t(`${current.tabs.filter(r => tabs.some(o => o.url === r.url)).length}/${current.tabs.length} zaten açık · ${Math.max(0, 8 - tabs.length)} boş sekme yeri`, `${current.tabs.filter(r => tabs.some(o => o.url === r.url)).length}/${current.tabs.length} already open · ${Math.max(0, 8 - tabs.length)} free tab slots`)}</small>
        <input type="search" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} aria-label={t("Grupta ara", "Search group")} placeholder={t("Grubun sekmelerinde ara…", "Search this group's tabs…")} />
        <div className="extra-list">{matchingWebTabs(current.tabs, query).map(row => <button type="button" key={row.url} disabled={blocked} className="extra-item browser-workspace-link" onClick={() => void run(() => open(row.url))}><b>{row.title}</b><small>{row.url}</small></button>)}</div>
        {!matchingWebTabs(current.tabs, query).length && <p>{t("Bu aramada sekme yok.", "No tabs match this search.")}</p>}
        <div className="extra-row"><button className="chip" type="button" disabled={blocked || !tabs.length} onClick={() => { if (confirm(t("Bu grubun sekmeleri açık sekmelerle değiştirilsin mi?", "Replace this group's saved tabs with the open tabs?"))) void run(() => save(upsertWebGroup(groups, current.name, cleanWebTabs(tabs), current.id))); }}>{t("Açık sekmelerle güncelle", "Update from open tabs")}</button><button className="chip" type="button" disabled={blocked} onClick={() => { const nextName = prompt(t("Grubun yeni adı", "New group name"), current.name); if (nextName !== null) void run(() => save(upsertWebGroup(groups, nextName, current.tabs, current.id))); }}>{t("Adlandır", "Rename")}</button><button className="chip" type="button" disabled={blocked} onClick={() => { if (confirm(t("Kaydedilen grup silinsin mi? Açık sekmeler kapanmaz.", "Delete the saved group? Open tabs stay open."))) void run(() => { const next = groups.filter(g => g.id !== id); save(next); setId(next[0]?.id ?? ""); }); }}>{t("Grubu sil", "Delete group")}</button></div>
      </div>}
      {!groups.length && <p>{t("Sık birlikte açtığın sayfaları bir grupta sakla. Sen kaydetmeden grup oluşturulmaz.", "Keep pages you often open together in a group. Nothing is saved until you choose to save it.")}</p>}
      <div className="extra-row"><button type="button" className="chip" disabled={blocked || !groups.length} onClick={() => void run(async () => { if (await exportExtra("Luna-sekme-gruplari.json", JSON.stringify({ version: 1, groups }, null, 2))) setStatus(t("Gruplar dışa aktarıldı.", "Groups exported.")); })}>{t("Grupları dışa aktar", "Export groups")}</button><button type="button" className="chip" disabled={blocked} onClick={() => file.current?.click()}>{t("Grupları içe aktar", "Import groups")}</button><input type="file" accept=".json,application/json" hidden ref={file} onChange={e => { const selected = e.target.files?.[0]; e.target.value = ""; if (selected) void run(async () => { if (selected.size > 128 * 1024) throw Error(t("Dosya en fazla 128 KB olmalı.", "File must be at most 128 KB.")); const incoming = readWebGroups(JSON.parse(await selected.text())); if (!alive.current) return; const next = mergeWebGroups(groups, incoming); save(next); setId(next[0]?.id ?? ""); setStatus(t("Gruplar birleştirildi. Aynı adlı grupların mevcut sekmeleri korundu.", "Groups merged. Existing tabs in groups with the same name were kept.")); }); }} /></div>
    </>}
    {status && <p className="extra-status" role="status">{status}</p>}
  </section>;
}
