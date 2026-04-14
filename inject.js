(() => {
  const KEYWORDS = ["misafir", "5200", "5.200", "category", "categories", "kategori"];
  const TOKEN_URL_PATTERNS = [/token/i, /refresh/i, /renew/i, /auth/i, /login/i, /signin/i];
  const USER_URL_PATTERNS = [/\/me\b/i, /\/user\b/i, /\/profile\b/i, /customer/i, /account/i];
  const seen = new Set();
  const seenToken = new Set();
  const seenUser = new Set();

  function scoreText(text) {
    if (!text || typeof text !== "string") return 0;
    const lower = text.toLowerCase();
    let hits = 0;
    for (const k of KEYWORDS) if (lower.includes(k)) hits++;
    return hits;
  }

  function classifyUrl(url) {
    if (TOKEN_URL_PATTERNS.some(r => r.test(url))) return "token";
    if (USER_URL_PATTERNS.some(r => r.test(url))) return "user";
    return null;
  }

  function absolutize(u) {
    try { return new URL(u, location.href).href; } catch (_) { return u; }
  }

  function report(req) {
    req.url = absolutize(req.url);
    const key = req.method + " " + req.url;
    if (seen.has(key)) return;
    seen.add(key);
    window.postMessage({ __passo: true, type: "ENDPOINT_FOUND", req }, "*");
  }

  function reportAux(req, kind) {
    req.url = absolutize(req.url);
    const key = req.method + " " + req.url;
    const set = kind === "token" ? seenToken : seenUser;
    if (set.has(key)) return;
    set.add(key);
    window.postMessage({ __passo: true, type: "AUX_ENDPOINT_FOUND", kind, req }, "*");
  }

  try {
    const _fetch = window.fetch;
    window.fetch = async function (...args) {
      const input = args[0];
      const init = args[1] || {};
      let url = typeof input === "string" ? input : (input && input.url) || "";
      let method = (init.method || (input && input.method) || "GET").toUpperCase();
      let body = init.body;
      let headers = {};
      try {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { headers[k] = v; });
        } else if (init.headers && typeof init.headers === "object") {
          headers = { ...init.headers };
        }
        if (input instanceof Request) {
          input.headers.forEach((v, k) => { headers[k] = v; });
          if (!body) { try { body = await input.clone().text(); } catch (_) {} }
        }
      } catch (_) {}
      const resp = await _fetch.apply(this, args);
      try {
        if (typeof url === "string" && url.includes("passo")) {
          const kind = classifyUrl(url);
          if (kind) {
            reportAux({ url, method, headers, body: typeof body === "string" ? body : null }, kind);
          }
          resp.clone().text().then(t => {
            if (scoreText(t) >= 2) {
              report({ url, method, headers, body: typeof body === "string" ? body : null });
            }
          }).catch(() => {});
        }
      } catch (_) {}
      return resp;
    };
  } catch (e) { console.error("[passo-avci] fetch wrap fail", e); }

  try {
    const _open = XMLHttpRequest.prototype.open;
    const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__passoUrl = u;
      this.__passoMethod = (m || "GET").toUpperCase();
      this.__passoHeaders = {};
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      try { this.__passoHeaders[k] = v; } catch (_) {}
      return _setHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      this.__passoBody = typeof body === "string" ? body : null;
      this.addEventListener("load", () => {
        try {
          const u = this.__passoUrl || "";
          if (typeof u === "string" && u.includes("passo")) {
            const reqObj = {
              url: u,
              method: this.__passoMethod || "GET",
              headers: this.__passoHeaders || {},
              body: this.__passoBody
            };
            const kind = classifyUrl(u);
            if (kind) reportAux(reqObj, kind);
            if (scoreText(this.responseText) >= 2) report(reqObj);
          }
        } catch (_) {}
      });
      return _send.apply(this, arguments);
    };
  } catch (e) { console.error("[passo-avci] xhr wrap fail", e); }
})();
