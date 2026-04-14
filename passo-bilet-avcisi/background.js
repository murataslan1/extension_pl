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
  seatEndpoint: null
};

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
  await setSettings({ watching: true, lastStatus: "starting", lastError: null });
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
  const tab = await findPassoTab(s.eventUrl);
  if (!tab) {
    await setSettings({
      lastCheck: Date.now(),
      lastStatus: "no-tab",
      lastError: "Passo maç tabı açık değil. Lütfen maç sayfasını açın."
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
    await chrome.notifications.create("passo-found-" + Date.now(), {
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Z0qXf8AAAAASUVORK5CYII=",
      title: "BİLET VAR! 🎟️",
      message: `${settings.category} ${settings.price} — hemen siteye gir!`,
      priority: 2,
      requireInteraction: true
    });
  } catch (e) { console.error("notif err", e); }

  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) { console.error("focus err", e); }

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
      await setSettings({ seatEndpoint: msg.url });
      sendResponse({ ok: true });
    }
    else if (msg.type === "POLL_NOW") {
      await pollNow();
      sendResponse({ ok: true });
    }
  })();
  return true;
});
