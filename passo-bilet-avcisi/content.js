(() => {
  const UNAVAILABLE_MARKERS = [
    "currently no tickets available",
    "no tickets available",
    "şu anda bu kategoride bilet bulunmamaktadır",
    "bilet bulunmamaktadır",
    "sold out",
    "tükendi"
  ];

  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inject.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (e) { console.error("[passo-avci] inject fail", e); }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__passo !== true) return;
    if (d.type === "ENDPOINT_FOUND" && d.req && d.req.url) {
      chrome.runtime.sendMessage({ type: "ENDPOINT_FOUND", req: d.req }).catch(() => {});
    }
  });

  function normalize(str) {
    return (str || "").toLowerCase()
      .replaceAll("i̇", "i")
      .replaceAll("ı", "i")
      .replaceAll("ş", "s")
      .replaceAll("ğ", "g")
      .replaceAll("ü", "u")
      .replaceAll("ö", "o")
      .replaceAll("ç", "c");
  }

  function hasUnavailableMarker(text) {
    const n = normalize(text);
    return UNAVAILABLE_MARKERS.some(m => n.includes(normalize(m)));
  }

  function findCategoryRowDom(category, price) {
    const catN = normalize(category);
    const priceN = normalize(price).replace(/[.,]/g, "");
    const candidates = Array.from(document.querySelectorAll("body *"))
      .filter(el => el.children.length < 20 && el.innerText && el.innerText.length < 400);
    for (const el of candidates) {
      const n = normalize(el.innerText).replace(/[.,]/g, "");
      if (n.includes(catN) && n.includes(priceN)) {
        let parent = el;
        for (let i = 0; i < 4 && parent.parentElement; i++) {
          const pn = normalize(parent.innerText);
          if (pn.length > 20 && pn.length < 500) break;
          parent = parent.parentElement;
        }
        return parent;
      }
    }
    return null;
  }

  async function checkViaApi(endpoint, category, price) {
    try {
      const r = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      if (!r.ok) return { ok: false, error: "api " + r.status };
      const text = await r.text();
      const n = normalize(text);
      if (!n.includes(normalize(category))) {
        return { ok: false, error: "api: kategori bulunamadı" };
      }
      const priceN = normalize(price).replace(/[.,]/g, "");
      const catN = normalize(category);
      const idx = n.indexOf(catN);
      const window = n.slice(Math.max(0, idx - 300), idx + 500);
      if (!window.includes(priceN)) {
        return { ok: false, error: "api: fiyat eşleşmedi" };
      }
      const mZero = window.match(/"(availableseatcount|available|stock|remaining|count)"\s*:\s*0\b/);
      const mPos = window.match(/"(availableseatcount|available|stock|remaining|count)"\s*:\s*([1-9]\d*)/);
      if (mPos) return { ok: true, available: true, mode: "api" };
      if (mZero) return { ok: true, available: false, mode: "api" };
      if (hasUnavailableMarker(window)) {
        return { ok: true, available: false, mode: "api" };
      }
      return { ok: true, available: true, mode: "api" };
    } catch (e) {
      return { ok: false, error: "api exception: " + e.message };
    }
  }

  function checkViaDom(category, price) {
    const row = findCategoryRowDom(category, price);
    if (!row) {
      return { ok: false, error: "dom: kategori satırı bulunamadı (sayfa doğru mu?)" };
    }
    const txt = row.innerText || "";
    if (hasUnavailableMarker(txt)) {
      return { ok: true, available: false, mode: "dom" };
    }
    const clickable = row.closest('[role="button"],button,a') || row;
    const disabled = clickable.getAttribute?.("aria-disabled") === "true" ||
                     clickable.classList?.contains?.("disabled") ||
                     getComputedStyle(clickable).pointerEvents === "none";
    if (disabled) {
      return { ok: true, available: false, mode: "dom" };
    }
    return { ok: true, available: true, mode: "dom" };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "CHECK_AVAILABILITY") return false;
    (async () => {
      try {
        const stored = await chrome.storage.local.get(["seatEndpoint"]);
        let result = null;
        if (stored.seatEndpoint) {
          result = await checkViaApi(stored.seatEndpoint, msg.category, msg.price);
        }
        if (!result || !result.ok) {
          result = checkViaDom(msg.category, msg.price);
        }
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  });

  console.log("[passo-avci] content script yüklendi");
})();
