const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const page = document.getElementById("page");
page.textContent = tab?.title || tab?.url || "";
const usable = /^https?:/i.test(tab?.url || "");
const send = async (action) => {
  if (!usable) { page.textContent = "Bu sayfa Luna'ya gönderilemez."; return; }
  await chrome.runtime.sendMessage({ type: "luna", tabId: tab.id, action, url: tab.url, title: tab.title, tab: { id: tab.id, url: tab.url, title: tab.title } });
  window.close();
};
document.getElementById("play").onclick = () => send("play");
document.getElementById("open").onclick = () => send("open");
document.getElementById("import").onclick = () => send("import");
// the first time only: Chrome asks before opening Luna
try { if (!localStorage.getItem("seen")) { document.getElementById("note").textContent += " İlk seferde Chrome izin ister; \"her zaman izin ver\" seçilebilir."; localStorage.setItem("seen", "1"); } } catch {}
