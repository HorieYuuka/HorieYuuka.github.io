(function () {
  "use strict";

  const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const ACTION = "visitor_pass";
  const REFRESH_MARGIN_MS = 5 * 60 * 1000;

  function siteKey() {
    const meta = document.querySelector('meta[name="hy-turnstile-sitekey"]');
    return meta ? (meta.getAttribute("content") || "").trim() : "";
  }

  function storageKey(apiOrigin) {
    return "hy-visitor-pass:" + apiOrigin;
  }

  function readCached(apiOrigin) {
    try {
      const raw = window.sessionStorage.getItem(storageKey(apiOrigin));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || !cached.pass || Date.parse(cached.expiresAt) - Date.now() < REFRESH_MARGIN_MS) {
        return null;
      }
      return cached.pass;
    } catch (e) {
      return null;
    }
  }

  function writeCached(apiOrigin, value) {
    try {
      if (value) {
        window.sessionStorage.setItem(storageKey(apiOrigin), JSON.stringify(value));
      } else {
        window.sessionStorage.removeItem(storageKey(apiOrigin));
      }
    } catch (e) {
      // Storage unavailable; the pass is simply fetched again next time.
    }
  }

  let scriptPromise = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!scriptPromise) {
      scriptPromise = new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = TURNSTILE_SRC;
        script.async = true;
        script.onload = function () {
          if (window.turnstile) resolve(window.turnstile);
          else reject(new Error("Turnstile unavailable"));
        };
        script.onerror = function () {
          scriptPromise = null;
          reject(new Error("Turnstile failed to load"));
        };
        document.head.appendChild(script);
      });
    }
    return scriptPromise;
  }

  let container = null;
  let widgetId = null;
  let pendingToken = null;

  function getContainer() {
    if (!container) {
      container = document.createElement("div");
      container.style.position = "fixed";
      container.style.right = "16px";
      container.style.bottom = "16px";
      container.style.zIndex = "2147483647";
      document.body.appendChild(container);
    }
    return container;
  }

  function solveChallenge(key) {
    return loadTurnstile().then(function (turnstile) {
      return new Promise(function (resolve, reject) {
        pendingToken = { resolve: resolve, reject: reject };
        if (widgetId === null) {
          widgetId = turnstile.render(getContainer(), {
            sitekey: key,
            action: ACTION,
            appearance: "interaction-only",
            execution: "execute",
            callback: function (token) {
              if (pendingToken) pendingToken.resolve(token);
              pendingToken = null;
            },
            "error-callback": function () {
              if (pendingToken) pendingToken.reject(new Error("Browser check failed"));
              pendingToken = null;
            },
            "timeout-callback": function () {
              if (pendingToken) pendingToken.reject(new Error("Browser check timed out"));
              pendingToken = null;
            }
          });
        } else {
          turnstile.reset(widgetId);
        }
        turnstile.execute(widgetId);
      });
    });
  }

  const inflight = {};
  function obtainPass(apiOrigin, key) {
    if (inflight[apiOrigin]) return inflight[apiOrigin];
    inflight[apiOrigin] = solveChallenge(key)
      .then(function (token) {
        return fetch(apiOrigin + "/api/v1/visitor-pass", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ token: token })
        });
      })
      .then(function (response) {
        if (!response.ok) throw new Error("Visitor pass request failed: HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.pass) throw new Error("Visitor pass missing");
        writeCached(apiOrigin, data);
        return data.pass;
      })
      .finally(function () {
        delete inflight[apiOrigin];
      });
    return inflight[apiOrigin];
  }

  function withPassHeader(init, pass) {
    const next = Object.assign({}, init || {});
    const headers = new Headers((init && init.headers) || {});
    if (pass) headers.set("X-Visitor-Pass", pass);
    next.headers = headers;
    return next;
  }

  function isPassRefusal(response) {
    if (response.status !== 401) return Promise.resolve(false);
    return response.clone().json()
      .then(function (body) { return Boolean(body && body.code === "visitor_pass_required"); })
      .catch(function () { return false; });
  }

  // Drop-in replacement for fetch() on download-grant requests.
  function fetchGrant(url, init) {
    const key = siteKey();
    if (!key) return fetch(url, init);

    const apiOrigin = new URL(url, window.location.href).origin;
    const cached = readCached(apiOrigin);
    const passPromise = cached
      ? Promise.resolve(cached)
      : obtainPass(apiOrigin, key).catch(function (error) {
        console.warn("[visitor-pass]", error);
        return null;
      });

    return passPromise.then(function (pass) {
      return fetch(url, withPassHeader(init, pass)).then(function (response) {
        return isPassRefusal(response).then(function (refused) {
          if (!refused || !cached) return response;
          writeCached(apiOrigin, null);
          return obtainPass(apiOrigin, key)
            .then(function (fresh) { return fetch(url, withPassHeader(init, fresh)); })
            .catch(function () { return response; });
        });
      });
    });
  }

  window.HYVisitorPass = { fetchGrant: fetchGrant };
})();
