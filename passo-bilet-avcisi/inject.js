(() => {
  const KEYWORDS = ["misafir", "5200", "category", "categories", "seat", "ticket", "kategori"];
  const seen = new Set();

  function report(url) {
    if (seen.has(url)) return;
    seen.add(url);
    window.postMessage({ __passo: true, type: "ENDPOINT_FOUND", url }, "*");
  }

  function peek(text, url) {
    if (!text || typeof text !== "string") return;
    const lower = text.toLowerCase();
    let hits = 0;
    for (const k of KEYWORDS) if (lower.includes(k)) hits++;
    if (hits >= 2) report(url);
  }

  try {
    const _fetch = window.fetch;
    window.fetch = async function (...args) {
      const resp = await _fetch.apply(this, args);
      try {
        const url = (args[0] && args[0].url) || args[0];
        if (typeof url === "string" && url.includes("passo.com.tr")) {
          resp.clone().text().then(t => peek(t, url)).catch(() => {});
        }
      } catch (_) {}
      return resp;
    };
  } catch (e) { console.error("[passo-avci] fetch wrap fail", e); }

  try {
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__passoUrl = u;
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener("load", () => {
        try {
          const u = this.__passoUrl || "";
          if (typeof u === "string" && u.includes("passo.com.tr")) {
            peek(this.responseText, u);
          }
        } catch (_) {}
      });
      return _send.apply(this, arguments);
    };
  } catch (e) { console.error("[passo-avci] xhr wrap fail", e); }
})();
