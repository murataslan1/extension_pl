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
    if (d.type === "AUX_ENDPOINT_FOUND" && d.req && d.req.url && d.kind) {
      chrome.runtime.sendMessage({ type: "AUX_ENDPOINT_FOUND", kind: d.kind, req: d.req }).catch(() => {});
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

  // ============ AutoBuy state machine ============

  async function logAutoBuy(message, state) {
    try {
      await chrome.runtime.sendMessage({ type: "AUTOBUY_LOG", message, state });
    } catch (_) {}
    console.log("[passo-avci autobuy]", state || "", message);
  }

  function findButtonByText(texts) {
    const sel = "button, [role='button'], a.btn, a[href], input[type='submit'], input[type='button'], .btn";
    const all = document.querySelectorAll(sel);
    const lowered = texts.map(t => normalize(t));
    for (const el of all) {
      const t = normalize((el.innerText || el.value || el.textContent || "").trim());
      if (!t) continue;
      for (const target of lowered) {
        if (t.includes(target)) {
          if (el.disabled) continue;
          const cs = getComputedStyle(el);
          if (cs.pointerEvents === "none" || cs.display === "none" || cs.visibility === "hidden") continue;
          return el;
        }
      }
    }
    return null;
  }

  async function waitFor(finder, timeoutMs = 20000, label = "element") {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const el = finder();
        if (el) return el;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`timeout: ${label} (${timeoutMs}ms)`);
  }

  function dispatchEvents(el, types) {
    for (const t of types) {
      try { el.dispatchEvent(new Event(t, { bubbles: true })); } catch (_) {}
    }
  }

  async function setQuantity(n) {
    const inputs = Array.from(document.querySelectorAll('input[type="number"], input[inputmode="numeric"]'));
    for (const inp of inputs) {
      const near = (inp.closest("form,div,section") || document).innerText.toLowerCase();
      if (!near.includes("quantity") && !near.includes("adet") && !near.includes("ticket limit")) continue;
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(inp, String(n)); else inp.value = String(n);
        dispatchEvents(inp, ["input", "change", "blur"]);
        return true;
      } catch (_) {}
    }
    const plusBtn = Array.from(document.querySelectorAll("button, [role='button']"))
      .find(b => (b.innerText || b.textContent || "").trim() === "+");
    if (plusBtn) {
      for (let i = 1; i < n; i++) { plusBtn.click(); await new Promise(r => setTimeout(r, 200)); }
      return true;
    }
    const selects = Array.from(document.querySelectorAll("select"));
    for (const sel of selects) {
      const near = (sel.closest("form,div,section") || document).innerText.toLowerCase();
      if (!near.includes("quantity") && !near.includes("adet")) continue;
      const opt = Array.from(sel.options).find(o => parseInt(o.value, 10) === n || parseInt(o.text, 10) === n);
      if (opt) {
        sel.value = opt.value;
        dispatchEvents(sel, ["input", "change"]);
        return true;
      }
    }
    return false;
  }

  function findCategoryRow(category, price) {
    return findCategoryRowDom(category, price);
  }

  async function runAutoBuyStep() {
    let settings;
    try {
      settings = await chrome.storage.local.get(["autoBuyState", "autoBuyQuantity", "category", "price"]);
    } catch (_) { return; }
    const state = settings.autoBuyState;
    if (!state || state === "IDLE" || state === "AT_PAYMENT" || state === "ERROR") return;

    const qty = settings.autoBuyQuantity || 2;
    const cat = settings.category || "MISAFIR";
    const price = settings.price || "5.200";

    try {
      switch (state) {
        case "TRIGGERED": {
          await logAutoBuy("MISAFIR satırı aranıyor", "TRIGGERED");
          const row = await waitFor(() => findCategoryRow(cat, price), 15000, "kategori satırı");
          const clickable = row.closest("[role='button'],button,a") || row;
          clickable.click();
          await logAutoBuy("MISAFIR satırına tıklandı", "CATEGORY_CLICKED");
          await chrome.storage.local.set({ autoBuyState: "CATEGORY_CLICKED" });
          setTimeout(runAutoBuyStep, 1500);
          break;
        }
        case "CATEGORY_CLICKED":
        case "DETAIL_LOADED": {
          await logAutoBuy("detail sayfası bekleniyor (Find best seat)", "DETAIL_LOADED");
          await chrome.storage.local.set({ autoBuyState: "DETAIL_LOADED" });
          const findBtn = await waitFor(
            () => findButtonByText(["find best seat", "en iyi yeri bul", "en iyi koltu"]),
            20000,
            "Find best seat butonu"
          );
          const qtySet = await setQuantity(qty);
          await logAutoBuy(`adet ${qty} → ${qtySet ? "OK" : "SKIP (input bulunamadı)"}`, "DETAIL_LOADED");
          await new Promise(r => setTimeout(r, 600));
          findBtn.click();
          await logAutoBuy("Find best seat tıklandı", "SEAT_PICKED");
          await chrome.storage.local.set({ autoBuyState: "SEAT_PICKED" });
          setTimeout(runAutoBuyStep, 1500);
          break;
        }
        case "SEAT_PICKED": {
          await logAutoBuy("Continue to basket aranıyor", "SEAT_PICKED");
          const contBtn = await waitFor(
            () => findButtonByText(["continue to basket", "sepete devam", "sepete ekle", "sepete git", "basket"]),
            18000,
            "Continue to basket butonu"
          );
          contBtn.click();
          await logAutoBuy("Continue to basket tıklandı", "BASKET_CLICKED");
          await chrome.storage.local.set({ autoBuyState: "BASKET_CLICKED" });
          setTimeout(runAutoBuyStep, 2000);
          break;
        }
        case "BASKET_CLICKED":
        case "BASKET_LOADED": {
          await logAutoBuy("Proceed to payment aranıyor", "BASKET_LOADED");
          await chrome.storage.local.set({ autoBuyState: "BASKET_LOADED" });
          const payBtn = await waitFor(
            () => findButtonByText([
              "proceed to payment", "ödemeye geç", "odemeye gec", "ödemeyi tamamla",
              "satın almaya devam", "devam et", "continue", "checkout"
            ]),
            18000,
            "Proceed to payment butonu"
          );
          payBtn.click();
          await logAutoBuy("Proceed to payment tıklandı", "PAYMENT_CLICKED");
          await chrome.storage.local.set({ autoBuyState: "PAYMENT_CLICKED" });
          setTimeout(runAutoBuyStep, 2500);
          break;
        }
        case "PAYMENT_CLICKED": {
          await logAutoBuy("ÖDEME EKRANINDA — DURUYOR, kullanıcıya devredildi", "AT_PAYMENT");
          await chrome.runtime.sendMessage({ type: "AT_PAYMENT_SCREEN" }).catch(() => {});
          await chrome.storage.local.set({ autoBuyState: "AT_PAYMENT" });
          try {
            const banner = document.createElement("div");
            banner.textContent = "💳 ÖDEME EKRANI HAZIR — KARTI ONAYLA, CVV GİR, SMS KODU GİR!";
            banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999999;background:#c1121f;color:#fff;padding:18px;font:bold 18px system-ui,sans-serif;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.3)";
            document.body.appendChild(banner);
          } catch (_) {}
          break;
        }
      }
    } catch (e) {
      await logAutoBuy("HATA: " + (e.message || e), "ERROR");
      await chrome.runtime.sendMessage({ type: "AUTOBUY_ERROR", error: e.message || String(e) }).catch(() => {});
      await chrome.storage.local.set({ autoBuyState: "ERROR" });
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "START_AUTOBUY") {
      runAutoBuyStep();
      sendResponse({ ok: true });
      return true;
    }
  });

  setTimeout(runAutoBuyStep, 1200);

  console.log("[passo-avci] content script yüklendi");
})();
