const ALARM_NAME = "passo-poll";
const POLL_MINUTES = 0.5;
const DEFAULT_SETTINGS = {
  watching: false,
  eventUrl: "https://www.passo.com.tr/en/event/genclerbirligi-galatasarayas-mac-bilet-passo/11410319/seats",
  category: "MISAFIR",
  price: "5.200",
  autoBuy: false,
  seatStrategy: "first",
  lastCheck: null,
  lastStatus: "idle",
  lastError: null,
  capturedRequest: null,
  pollCount: 0,
  watchStartedAt: null,
  autoBuy: false,
  autoBuyQuantity: 2,
  autoBuyState: "IDLE",
  autoBuyLog: ""
};

function normalize(str) {
  return (str || "").toString().toLowerCase()
    .replaceAll("i̇", "i").replaceAll("ı", "i")
    .replaceAll("ş", "s").replaceAll("ğ", "g")
    .replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c");
}

async function checkViaBackgroundApi(req, category, price) {
  if (!req || !req.url) return { ok: false, error: "no captured request" };
  try {
    let url = req.url;
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = "https://www.passo.com.tr" + url;
    const headers = { ...(req.headers || {}) };
    delete headers["content-length"];
    delete headers["Content-Length"];
    const r = await fetch(url, {
      method: req.method || "GET",
      headers,
      body: (req.method && req.method !== "GET" && req.method !== "HEAD") ? req.body : undefined,
      credentials: "include",
      cache: "no-store"
    });
    if (!r.ok) return { ok: false, error: "api http " + r.status };
    const text = await r.text();
    const n = normalize(text);
    const catN = normalize(category);
    if (!n.includes(catN)) return { ok: false, error: "api: kategori yok" };
    const priceN = normalize(price).replace(/[.,]/g, "");
    const idx = n.indexOf(catN);
    const win = n.slice(Math.max(0, idx - 400), idx + 600);
    if (!win.includes(priceN)) return { ok: false, error: "api: fiyat eşleşmedi" };
    const mPos = win.match(/"(availableseatcount|available|stock|remaining|count|seatcount)"\s*:\s*([1-9]\d*)/);
    if (mPos) return { ok: true, available: true, seatCount: parseInt(mPos[2], 10), mode: "api" };
    const mZero = win.match(/"(availableseatcount|available|stock|remaining|count|seatcount)"\s*:\s*0\b/);
    if (mZero) return { ok: true, available: false, seatCount: 0, mode: "api" };
    const markers = ["no tickets available", "bilet bulunmamaktadir", "sold out", "tukendi"];
    for (const m of markers) if (win.includes(m)) return { ok: true, available: false, seatCount: 0, mode: "api" };
    return { ok: true, available: true, seatCount: 99, mode: "api-guess" };
  } catch (e) {
    return { ok: false, error: "api ex: " + (e.message || e) };
  }
}

async function getSettings() {
  const s = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s };
}

async function setSettings(patch) {
  await chrome.storage.local.set(patch);
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...cur };
  await chrome.storage.local.set(merged);
});

async function startWatching() {
  await setSettings({
    watching: true,
    lastStatus: "starting",
    lastError: null,
    pollCount: 0,
    watchStartedAt: Date.now()
  });
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
  pollNow();
}

async function stopWatching() {
  await setSettings({ watching: false, lastStatus: "stopped" });
  await chrome.alarms.clear(ALARM_NAME);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    const jitter = Math.floor(Math.random() * 5000);
    setTimeout(pollNow, jitter);
  }
});

async function findPassoTab(eventUrl) {
  const tabs = await chrome.tabs.query({ url: "*://*.passo.com.tr/*" });
  if (!tabs.length) return null;
  const eventId = extractEventId(eventUrl);
  if (eventId) {
    const match = tabs.find(t => t.url && t.url.includes(eventId));
    if (match) return match;
  }
  return tabs[0];
}

function extractEventId(url) {
  const m = (url || "").match(/\/(\d{6,})\b/);
  return m ? m[1] : null;
}

async function pollNow() {
  const s = await getSettings();
  if (!s.watching) return;
  const now = Date.now();
  await setSettings({ pollCount: (s.pollCount || 0) + 1 });
  console.log("[passo-avci] poll #" + ((s.pollCount || 0) + 1) + " at " + new Date(now).toLocaleTimeString());

  if (s.capturedRequest && s.capturedRequest.url) {
    const r = await checkViaBackgroundApi(s.capturedRequest, s.category, s.price);
    if (r.ok) {
      if (r.available) {
        const needed = s.autoBuy ? (s.autoBuyQuantity || 2) : 1;
        const got = r.seatCount || 0;
        const tab = await findPassoTab(s.eventUrl);
        if (s.autoBuy && got >= needed) {
          await setSettings({
            lastCheck: now,
            lastStatus: `AVAILABLE (${got} koltuk) — autoBuy başlıyor`,
            lastError: null,
            autoBuyState: "TRIGGERED"
          });
          await triggerAlert(s, tab || {});
          if (tab) {
            try { await chrome.tabs.sendMessage(tab.id, { type: "START_AUTOBUY" }); } catch (_) {}
          }
        } else if (s.autoBuy && got < needed) {
          await setSettings({
            lastCheck: now,
            lastStatus: `partial-stock (${got}/${needed}) — autoBuy BEKLİYOR`,
            lastError: "Yetersiz koltuk, autoBuy tetiklenmedi"
          });
          await triggerAlert(s, tab || {});
        } else {
          await setSettings({ lastCheck: now, lastStatus: `AVAILABLE (${got} koltuk)`, lastError: null });
          await triggerAlert(s, tab || {});
        }
        await stopWatching();
        return;
      } else {
        await setSettings({ lastCheck: now, lastStatus: "no-stock (api)", lastError: null });
        return;
      }
    }
    await setSettings({ lastCheck: now, lastStatus: "api-error", lastError: r.error });
  }

  const tab = await findPassoTab(s.eventUrl);
  if (!tab) {
    await setSettings({
      lastCheck: now,
      lastStatus: "no-tab",
      lastError: "Passo maç tabı açık değil + API henüz keşfedilmedi. Maç sayfasını bir kere açıp MISAFIR satırını görünce otomatik yakalanır."
    });
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: "CHECK_AVAILABILITY",
      category: s.category,
      price: s.price
    });
    const now = Date.now();
    if (resp && resp.ok) {
      if (resp.available) {
        await setSettings({ lastCheck: now, lastStatus: "AVAILABLE", lastError: null });
        await triggerAlert(s, tab);
        await stopWatching();
      } else {
        await setSettings({
          lastCheck: now,
          lastStatus: resp.mode === "api" ? "no-stock (api)" : "no-stock (dom)",
          lastError: null
        });
      }
    } else {
      await setSettings({
        lastCheck: now,
        lastStatus: "error",
        lastError: (resp && resp.error) || "bilinmeyen hata"
      });
    }
  } catch (e) {
    await setSettings({
      lastCheck: Date.now(),
      lastStatus: "error",
      lastError: e.message || String(e)
    });
  }
}

async function triggerAlert(settings, tab) {
  try {
    await chrome.action.setBadgeText({ text: "VAR!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#c1121f" });
  } catch (_) {}

  for (let i = 0; i < 5; i++) {
    try {
      await chrome.notifications.create("passo-found-" + Date.now() + "-" + i, {
        type: "basic",
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Z0qXf8AAAAASUVORK5CYII=",
        title: "🎟️ BİLET VAR! HEMEN GİR!",
        message: `${settings.category} ${settings.price} — koltuk açıldı, ödemeyi yap!`,
        priority: 2,
        requireInteraction: true
      });
    } catch (e) { console.error("notif err", e); }
    await new Promise(r => setTimeout(r, 3000));
  }

  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
    }
  } catch (e) { console.error("focus err", e); }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const origTitle = document.title;
        let on = true;
        const iv = setInterval(() => {
          document.title = on ? "🚨 BİLET VAR 🚨" : "🎟️ HEMEN GİR 🎟️";
          on = !on;
        }, 500);
        setTimeout(() => { clearInterval(iv); document.title = origTitle; }, 60000);
      }
    });
  } catch (e) { console.error("title flash err", e); }

  await ensureOffscreen();
  try {
    await chrome.runtime.sendMessage({ type: "PLAY_ALARM" });
  } catch (e) { console.error("alarm play err", e); }
}

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Bilet bulunduğunda sesli uyarı çalmak için."
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "START") { await startWatching(); sendResponse({ ok: true }); }
    else if (msg.type === "STOP") { await stopWatching(); sendResponse({ ok: true }); }
    else if (msg.type === "GET_STATE") { sendResponse(await getSettings()); }
    else if (msg.type === "UPDATE_SETTINGS") {
      await setSettings(msg.patch || {});
      sendResponse({ ok: true });
    }
    else if (msg.type === "TEST_ALARM") {
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ type: "PLAY_ALARM" }).catch(() => {});
      sendResponse({ ok: true });
    }
    else if (msg.type === "TEST_NOTIF") {
      await chrome.notifications.create("passo-test-" + Date.now(), {
        type: "basic",
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Z0qXf8AAAAASUVORK5CYII=",
        title: "Test bildirimi",
        message: "Passo Bilet Avcısı çalışıyor.",
        priority: 2
      });
      sendResponse({ ok: true });
    }
    else if (msg.type === "ENDPOINT_FOUND") {
      if (msg.req && msg.req.url) {
        await setSettings({ capturedRequest: msg.req });
      }
      sendResponse({ ok: true });
    }
    else if (msg.type === "POLL_NOW") {
      await pollNow();
      sendResponse({ ok: true });
    }
    else if (msg.type === "SIMULATE_TRIGGER") {
      const s = await getSettings();
      await setSettings({
        autoBuyState: "TRIGGERED",
        lastStatus: "SIMULATE — autoBuy tetiklendi",
        autoBuyLog: "SIMULATE başlatıldı"
      });
      const tab = await findPassoTab(s.eventUrl);
      if (tab) {
        try { await chrome.tabs.sendMessage(tab.id, { type: "START_AUTOBUY" }); } catch (_) {}
        await chrome.tabs.update(tab.id, { active: true });
      }
      sendResponse({ ok: true });
    }
    else if (msg.type === "AUTOBUY_LOG") {
      const s = await getSettings();
      const line = `[${new Date().toLocaleTimeString()}] ${msg.message}`;
      const log = (s.autoBuyLog || "").split("\n").slice(-8).join("\n") + "\n" + line;
      await setSettings({ autoBuyLog: log.trim(), autoBuyState: msg.state || s.autoBuyState });
      console.log("[passo-avci autobuy]", line);
      sendResponse({ ok: true });
    }
    else if (msg.type === "AT_PAYMENT_SCREEN") {
      const s = await getSettings();
      await setSettings({ autoBuyState: "AT_PAYMENT", lastStatus: "💳 ÖDEME EKRANI — kartı onayla!" });
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ type: "PLAY_ALARM" }).catch(() => {});
      for (let i = 0; i < 3; i++) {
        try {
          await chrome.notifications.create("passo-pay-" + Date.now() + "-" + i, {
            type: "basic",
            iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Z0qXf8AAAAASUVORK5CYII=",
            title: "💳 ÖDEME EKRANI HAZIR!",
            message: "Kartı seç, CVV gir, SMS kodunu onayla!",
            priority: 2,
            requireInteraction: true
          });
        } catch (_) {}
        await new Promise(r => setTimeout(r, 2000));
      }
      sendResponse({ ok: true });
    }
    else if (msg.type === "AUTOBUY_ERROR") {
      await setSettings({
        autoBuyState: "ERROR",
        lastError: "autoBuy: " + msg.error,
        lastStatus: "autoBuy ERROR"
      });
      sendResponse({ ok: true });
    }
    else if (msg.type === "RESET_AUTOBUY") {
      await setSettings({ autoBuyState: "IDLE", autoBuyLog: "" });
      sendResponse({ ok: true });
    }
  })();
  return true;
});
