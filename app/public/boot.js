/* Independent of React and the module graph: a failed import/IPC must not leave an empty window. */
(function () {
  var box = document.getElementById('luna-boot');
  if (!box) return;
  if(new URLSearchParams(location.search).has("subs")){box.remove();return;}
  var phase = document.getElementById('luna-boot-phase');
  var detail = document.getElementById('luna-boot-detail');
  var actions = document.getElementById('luna-boot-actions');
  var report = '', done = false, timer;
  var tr = false;
  try { tr = localStorage.getItem('lang') === 'tr'; } catch (_) {}
  var text = function (a, b) { return tr ? a : b; };
  document.getElementById('luna-boot-title').textContent = text('Luna başlatılıyor', 'Starting Luna');
  var scrub = function (raw) {
    return String(raw || '').replace(/(?:Bearer|sk-)[A-Za-z0-9._-]+/gi, '[secret]')
      .replace(/([?&](?:key|token|api_key|access_token)=)[^&#\s]+/gi, '$1[secret]')
      .replace(/[A-Z]:[\\/][^\n)]+/gi, '[local path]').slice(0, 4000);
  };
  function log(value) {
    try {
      var bridge = window.__TAURI_INTERNALS__;
      if (bridge && bridge.invoke) Promise.resolve(bridge.invoke('debug_log', {lines:['startup '+scrub(value)]})).catch(function () {});
    } catch (_) {}
  }
  function fail(error) {
    if (done) return;
    clearTimeout(timer);
    box.hidden = false;
    document.getElementById('luna-boot-title').textContent = text('Luna açılamadı', 'Luna could not start');
    report = 'Luna startup\n' + phase.textContent + '\n' + scrub(error && (error.stack || error.message) || error);
    detail.textContent = report;
    log(report);
    detail.hidden = false;
    actions.hidden = false;
  }
  window.LunaBoot = {
    phase: function (value) {
      if (done) return;
      phase.textContent = value;
      log(value);
      clearTimeout(timer);
      timer = setTimeout(function () { fail(text('Bu açılış adımı 15 saniyedir yanıt vermiyor. Verilerin değiştirilmedi.', 'This startup step has not responded for 15 seconds. Your data was not changed.')); }, 15000);
    },
    fail: fail,
    ready: function () { done = true; clearTimeout(timer); box.remove(); }
  };
  window.addEventListener('error', function (e) {
    if (done) return;
    if (e.error || e.message) fail(e.error || e.message);
    else if (e.target && e.target.tagName === 'SCRIPT') fail(text('Açılış dosyası yüklenemedi.', 'A startup script could not be loaded.'));
  }, true);
  window.addEventListener('unhandledrejection', function (e) { if (!done) fail(e.reason); });
  document.getElementById('luna-boot-reload').textContent = text('Yeniden dene', 'Retry');
  document.getElementById('luna-boot-reload').onclick = function () { location.reload(); };
  document.getElementById('luna-boot-copy').textContent = text('Ayrıntıyı kopyala', 'Copy details');
  document.getElementById('luna-boot-copy').onclick = function () {
    if (navigator.clipboard) navigator.clipboard.writeText(report).catch(function () { detail.focus(); });
    else detail.focus();
  };
  window.LunaBoot.phase(text('Arayüz dosyaları yükleniyor…', 'Loading interface files…'));
})();
