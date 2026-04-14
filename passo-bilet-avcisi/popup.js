const $ = (id) => document.getElementById(id);

async function loadState() {
  const s = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  $("eventUrl").value = s.eventUrl || "";
  $("category").value = s.category || "";
  $("price").value = s.price || "";
  renderStatus(s);
}

function renderStatus(s) {
  const last = s.lastCheck ? new Date(s.lastCheck).toLocaleTimeString() : "henüz yok";
  const watching = s.watching ? "🟢 İZLENİYOR" : "⚪ durdu";
  const count = s.pollCount || 0;
  let elapsed = "";
  if (s.watchStartedAt) {
    const secs = Math.floor((Date.now() - s.watchStartedAt) / 1000);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    elapsed = ` · ⏱️ ${mm}:${ss.toString().padStart(2, "0")}`;
  }
  const counterLine = `<br>✓ ${count} kontrol yapıldı${elapsed}`;
  let statusLine = s.lastStatus || "—";
  let cls = "";
  if (statusLine === "AVAILABLE") { cls = "ok"; statusLine = "🎉 BİLET BULUNDU!"; }
  else if (statusLine.startsWith("no-stock")) { cls = "warn"; }
  else if (statusLine === "error" || statusLine === "no-tab") { cls = "err"; }
  const err = s.lastError ? `<br><span class="err">⚠ ${s.lastError}</span>` : "";
  const endpoint = (s.capturedRequest && s.capturedRequest.url)
    ? `<br><span class="ok">API yakalandı: ${s.capturedRequest.method} ${s.capturedRequest.url.slice(0, 45)}…</span>`
    : `<br><span class="warn">API henüz yakalanmadı — maç sayfasını bir kere ziyaret edin</span>`;
  $("status").innerHTML = `
    <b>${watching}</b>${counterLine}<br>
    Son kontrol: ${last}<br>
    Durum: <span class="${cls}">${statusLine}</span>
    ${err}
    ${endpoint}
  `;
}

async function saveFields() {
  await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    patch: {
      eventUrl: $("eventUrl").value.trim(),
      category: $("category").value.trim(),
      price: $("price").value.trim()
    }
  });
}

$("startBtn").addEventListener("click", async () => {
  await saveFields();
  await chrome.runtime.sendMessage({ type: "START" });
  setTimeout(loadState, 300);
});

$("stopBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP" });
  setTimeout(loadState, 200);
});

$("testAlarmBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TEST_ALARM" });
});

$("testNotifBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TEST_NOTIF" });
});

$("pollNowBtn").addEventListener("click", async () => {
  await saveFields();
  await chrome.runtime.sendMessage({ type: "POLL_NOW" });
  setTimeout(loadState, 500);
});

loadState();
setInterval(loadState, 2000);
