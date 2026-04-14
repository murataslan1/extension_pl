const $ = (id) => document.getElementById(id);

async function loadState() {
  const s = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  $("eventUrl").value = s.eventUrl || "";
  $("category").value = s.category || "";
  $("price").value = s.price || "";
  if (document.activeElement !== $("autoBuy")) $("autoBuy").checked = !!s.autoBuy;
  if (document.activeElement !== $("autoBuyQuantity")) $("autoBuyQuantity").value = s.autoBuyQuantity || 2;
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
  let autoBuyBlock = "";
  if (s.autoBuyState && s.autoBuyState !== "IDLE") {
    const stColor = s.autoBuyState === "ERROR" ? "err" : (s.autoBuyState === "AT_PAYMENT" ? "ok" : "warn");
    autoBuyBlock = `<br><b>🤖 autoBuy:</b> <span class="${stColor}">${s.autoBuyState}</span>`;
    if (s.autoBuyLog) {
      autoBuyBlock += `<br><pre style="font-size:10px;white-space:pre-wrap;margin:4px 0;max-height:120px;overflow:auto;background:#fff;padding:4px;border:1px solid #ddd">${s.autoBuyLog.replace(/</g, "&lt;")}</pre>`;
    }
  }

  $("status").innerHTML = `
    <b>${watching}</b>${counterLine}<br>
    Son kontrol: ${last}<br>
    Durum: <span class="${cls}">${statusLine}</span>
    ${err}
    ${endpoint}
    ${autoBuyBlock}
  `;
}

async function saveFields() {
  await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    patch: {
      eventUrl: $("eventUrl").value.trim(),
      category: $("category").value.trim(),
      price: $("price").value.trim(),
      autoBuy: $("autoBuy").checked,
      autoBuyQuantity: parseInt($("autoBuyQuantity").value, 10) || 2
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

$("autoBuy").addEventListener("change", saveFields);
$("autoBuyQuantity").addEventListener("change", saveFields);

$("simulateBtn").addEventListener("click", async () => {
  await saveFields();
  if (!confirm("SIMULATE: autoBuy akışını başlatacak (Passo maç sayfasında). Ödeme ekranına kadar gidecek, orada duracak. Gerçekten başlatmak istiyor musun?")) return;
  await chrome.runtime.sendMessage({ type: "SIMULATE_TRIGGER" });
  setTimeout(loadState, 500);
});

$("resetAutoBuyBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "RESET_AUTOBUY" });
  setTimeout(loadState, 200);
});

loadState();
setInterval(loadState, 2000);
