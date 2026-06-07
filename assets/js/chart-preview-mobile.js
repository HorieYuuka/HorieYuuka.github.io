/* Slim chart-preview host for the mobile page (watch-only).
   Reuses chart-renderer.js + chart-search.js + bundle grant flow. */
(function () {
  "use strict";

  const DOUBLE_TAP_MS    = 280;
  const TAP_MAX_MOVE_PX  = 10;
  const TAP_MAX_TIME_MS  = 300;
  const HISPEED_MIN      = 0.5;
  const HISPEED_MAX      = 5.0;
  const HISPEED_TOAST_MS = 700;

  function apiBaseFromPage() {
    const meta = document.querySelector('meta[name="cp-api-base"]');
    if (!meta) return "";
    const v = (meta.getAttribute("content") || "").trim();
    return v.replace(/\/+$/, "");
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" + r : r);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else { fn(); }
  }

  ready(function () {
    const shell        = $("[data-cpm-shell]");
    const host         = $("[data-cpm-host]");
    const titleEl      = $("[data-cpm-title]");
    const modeEl       = $("[data-cpm-mode]");
    const tierEl       = $("[data-cpm-tier]");
    const emptyEl      = $("[data-cpm-empty]");
    const bottomEl     = $("[data-cpm-bottom]");
    const playBtn      = $("[data-cpm-play]");
    const playIcon     = $(".cpm-play__icon--play", playBtn);
    const pauseIcon    = $(".cpm-play__icon--pause", playBtn);
    const resetBtn     = $("[data-cpm-reset]");
    const progressEl   = $("[data-cpm-progress]");
    const timeEl       = $("[data-cpm-time]");
    const timeCurEl    = timeEl && timeEl.querySelector(".cur");
    const hispeedToast = $("[data-cpm-hispeed-toast]");
    const toastEl      = $("[data-cpm-toast]");
    const helpBtn      = $("[data-cpm-help]");
    const helpModal    = $("[data-cpm-help-modal]");
    const helpClose    = $("[data-cpm-help-close]");
    const fsBtn        = $("[data-cpm-fullscreen]");
    const fsIconExpand   = fsBtn && fsBtn.querySelector(".cpm-fs__icon--expand");
    const fsIconContract = fsBtn && fsBtn.querySelector(".cpm-fs__icon--contract");
    const rotateBtn    = $("[data-cpm-rotate]");
    const sudplusEl    = $("[data-cpm-sudplus]");
    const sudplusRange = $("[data-cpm-sudplus-range]");
    const sudplusValEl = $("[data-cpm-sudplus-val]");
    const pickBtns     = $$("[data-cpm-pick]");
    const searchModal  = $("[data-na-search-modal]");
    const searchInput  = $("[data-na-search-input]");
    const searchClose  = $("[data-na-search-close]");
    const searchResults= $("[data-na-search-results]");

    if (!shell || !host) return;

    let view = null;
    let currentRow = null;
    let clockTimer = null;
    let dragging = false;
    let wasPlayingBeforeDrag = false;
    let searchController = null;
    let corpusPromise = null;
    let totalSec = 0;

    /* Canvas-tap + pinch state */
    let activePointers = new Map();
    let pinchInitialDist = 0;
    let pinchInitialHiSpeed = 1;
    let pinchActive = false;
    let lastTapAt = 0;
    let pendingSingleTapTimer = null;
    let hispeedToastTimer = null;
    let touchUnbind = null;
    let toastTimer = null;
    let sudplusValue = 0;
    let sudplusHideTimer = null;
    const SUDPLUS_AUTO_HIDE_MS = 3500;

    function showEmpty(on) {
      if (emptyEl) emptyEl.hidden = !on;
      if (bottomEl) bottomEl.hidden = on;
    }
    showEmpty(true);

    function teardownView() {
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
      if (touchUnbind) { touchUnbind(); touchUnbind = null; }
      if (view && view.destroy) {
        try { view.destroy(); } catch (e) {}
      }
      view = null;
    }

    function clearHostChildren() {
      // Renderer-built DOM lives directly under host. Overlays placed before
      // any chart loads are preserved across reloads.
      const keep = [hispeedToast, toastEl, sudplusEl];
      Array.from(host.children).forEach(function (child) {
        if (keep.indexOf(child) === -1) host.removeChild(child);
      });
    }

    function showToast(msg, durationMs) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add("is-visible");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.classList.remove("is-visible");
        toastTimer = null;
      }, durationMs || 3000);
    }

    async function _tryFetchBundle(bundleUrl) {
      const resp = await fetch(bundleUrl, { credentials: "include" });
      if (!resp.ok) return null;
      const buf = await resp.arrayBuffer();
      const zip = await window.JSZip.loadAsync(buf);
      const jsonFile = zip.file("timeline.json");
      if (!jsonFile) return null;
      const timeline = JSON.parse(await jsonFile.async("text"));
      let audioUrl = null;
      const mp3File = zip.file("audio.mp3");
      if (mp3File) {
        const blob = await mp3File.async("blob");
        audioUrl = URL.createObjectURL(blob);
      }
      return { timeline: timeline, audioUrl: audioUrl };
    }

    function setBadges(t) {
      if (modeEl) {
        modeEl.textContent = t.mode || "SP";
        modeEl.hidden = !t.mode;
      }
      if (tierEl) {
        const tier = (currentRow && (currentRow.family || currentRow.tag)) || "";
        if (tier) { tierEl.textContent = tier; tierEl.hidden = false; }
        else { tierEl.textContent = ""; tierEl.hidden = true; }
      }
      if (shell && t.mode) shell.dataset.cpmMode = t.mode;
    }

    function updateClock() {
      if (!view || !view.getState) return;
      const st = view.getState();
      const cur = st.currentSec || 0;
      if (!dragging && progressEl) progressEl.value = String(cur);
      if (timeCurEl) timeCurEl.textContent = fmtTime(cur);
      else if (timeEl) timeEl.textContent = fmtTime(cur) + " / " + fmtTime(totalSec);
    }

    /* ── Canvas interactions (tap / double-tap / pinch) ───────────────── */

    function showHispeedToast(hs) {
      if (!hispeedToast) return;
      hispeedToast.textContent = "HS " + hs.toFixed(2) + "×";
      hispeedToast.classList.add("is-visible");
      if (hispeedToastTimer) clearTimeout(hispeedToastTimer);
      hispeedToastTimer = setTimeout(function () {
        hispeedToast.classList.remove("is-visible");
        hispeedToastTimer = null;
      }, HISPEED_TOAST_MS);
    }

    function handleSingleTap() {
      if (!view) return;
      try { view.toggle(); } catch (e) { console.warn("[cpm] toggle failed", e); }
    }

    function handleDoubleTap() {
      if (sudplusEl && sudplusEl.classList.contains("is-visible")) hideSudplus();
      else showSudplus();
    }

    function applySudplus(v) {
      sudplusValue = Math.max(0, Math.min(500, v | 0));
      const cpField = host.querySelector(".cp-field");
      if (cpField) cpField.style.setProperty("--cp-sudplus-h", sudplusValue + "px");
      if (sudplusValEl) sudplusValEl.textContent = sudplusValue + " px";
      if (sudplusRange && parseInt(sudplusRange.value, 10) !== sudplusValue) {
        sudplusRange.value = String(sudplusValue);
      }
    }
    function resetSudplusHideTimer() {
      if (sudplusHideTimer) clearTimeout(sudplusHideTimer);
      sudplusHideTimer = setTimeout(hideSudplus, SUDPLUS_AUTO_HIDE_MS);
    }
    function showSudplus() {
      if (!sudplusEl) return;
      sudplusEl.hidden = false;
      void sudplusEl.offsetWidth;
      sudplusEl.classList.add("is-visible");
      resetSudplusHideTimer();
    }
    function hideSudplus() {
      if (!sudplusEl) return;
      sudplusEl.classList.remove("is-visible");
      if (sudplusHideTimer) { clearTimeout(sudplusHideTimer); sudplusHideTimer = null; }
      setTimeout(function () {
        if (!sudplusEl.classList.contains("is-visible")) sudplusEl.hidden = true;
      }, 220);
    }
    if (sudplusRange) {
      sudplusRange.addEventListener("input", function () {
        applySudplus(parseInt(sudplusRange.value, 10));
        resetSudplusHideTimer();
      });
      sudplusRange.addEventListener("pointerdown", resetSudplusHideTimer);
    }

    function bindCanvasInteractions() {
      const cpField = host.querySelector(".cp-field");
      const cpCanvas = host.querySelector(".cp-field__canvas");
      if (!cpField || !cpCanvas) return null;

      // Suppress the renderer's "click-canvas-to-seek-to-measure" binding —
      // the mobile interaction model owns canvas taps.
      const clickBlocker = function (e) { e.stopImmediatePropagation(); };
      cpCanvas.addEventListener("click", clickBlocker, true);

      const onPointerDown = function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        activePointers.set(e.pointerId, {
          origX: e.clientX, origY: e.clientY,
          curX:  e.clientX, curY:  e.clientY,
          downAt: performance.now(),
        });
        try { cpField.setPointerCapture(e.pointerId); } catch (err) {}
        if (activePointers.size === 2) {
          const pts = Array.from(activePointers.values());
          pinchInitialDist = Math.hypot(pts[1].curX - pts[0].curX, pts[1].curY - pts[0].curY);
          pinchInitialHiSpeed = (view && view.getSettings && view.getSettings().hiSpeed) || 1;
          pinchActive = true;
          if (pendingSingleTapTimer) {
            clearTimeout(pendingSingleTapTimer);
            pendingSingleTapTimer = null;
          }
          lastTapAt = 0;
        }
      };

      const onPointerMove = function (e) {
        const p = activePointers.get(e.pointerId);
        if (!p) return;
        p.curX = e.clientX;
        p.curY = e.clientY;
        if (pinchActive && activePointers.size === 2 && pinchInitialDist > 0 && view) {
          const pts = Array.from(activePointers.values());
          const curDist = Math.hypot(pts[1].curX - pts[0].curX, pts[1].curY - pts[0].curY);
          if (curDist > 0) {
            const ratio = curDist / pinchInitialDist;
            const newHs = clamp(pinchInitialHiSpeed * ratio, HISPEED_MIN, HISPEED_MAX);
            if (view.setSettings) view.setSettings({ hiSpeed: newHs });
            showHispeedToast(newHs);
          }
        }
      };

      const onPointerEnd = function (e) {
        const p = activePointers.get(e.pointerId);
        activePointers.delete(e.pointerId);
        try { cpField.releasePointerCapture(e.pointerId); } catch (err) {}
        if (activePointers.size < 2) {
          pinchInitialDist = 0;
          pinchActive = false;
        }
        if (e.type !== "pointerup" || !p) return;
        if (activePointers.size > 0) return;     // multi-touch sequence; not a tap
        if (pinchActive) return;
        const dt = performance.now() - p.downAt;
        const dx = Math.abs(e.clientX - p.origX);
        const dy = Math.abs(e.clientY - p.origY);
        if (dt > TAP_MAX_TIME_MS) return;
        if (dx > TAP_MAX_MOVE_PX || dy > TAP_MAX_MOVE_PX) return;
        const now = performance.now();
        if (now - lastTapAt < DOUBLE_TAP_MS) {
          if (pendingSingleTapTimer) {
            clearTimeout(pendingSingleTapTimer);
            pendingSingleTapTimer = null;
          }
          lastTapAt = 0;
          handleDoubleTap();
        } else {
          lastTapAt = now;
          pendingSingleTapTimer = setTimeout(function () {
            handleSingleTap();
            pendingSingleTapTimer = null;
          }, DOUBLE_TAP_MS);
        }
      };

      cpField.addEventListener("pointerdown",   onPointerDown);
      cpField.addEventListener("pointermove",   onPointerMove);
      cpField.addEventListener("pointerup",     onPointerEnd);
      cpField.addEventListener("pointercancel", onPointerEnd);

      return function unbind() {
        cpCanvas.removeEventListener("click", clickBlocker, true);
        cpField.removeEventListener("pointerdown",   onPointerDown);
        cpField.removeEventListener("pointermove",   onPointerMove);
        cpField.removeEventListener("pointerup",     onPointerEnd);
        cpField.removeEventListener("pointercancel", onPointerEnd);
        activePointers.clear();
        pinchInitialDist = 0;
        pinchActive = false;
      };
    }

    function _finalizeView() {
      const t = view.timeline;
      totalSec = t.total_sec || 0;
      setBadges(t);
      if (titleEl) {
        titleEl.textContent = (currentRow && (currentRow.title || currentRow.file))
          || t.title || "Chart preview";
      }
      view.setSettings({ hideJudgment: true });
      view.setOnPlayStateChange(function (playing) {
        if (playBtn) playBtn.classList.toggle("is-playing", playing);
        if (playIcon) { playIcon.hidden = playing; playIcon.style.display = playing ? "none" : "block"; }
        if (pauseIcon) { pauseIcon.hidden = !playing; pauseIcon.style.display = playing ? "block" : "none"; }
      });
      if (progressEl) {
        progressEl.max = String(totalSec);
        progressEl.value = "0";
        progressEl.disabled = false;
      }
      if (timeEl) {
        // Reset trailing text to "/ TOTAL".
        while (timeEl.lastChild && timeEl.lastChild !== timeCurEl) {
          timeEl.removeChild(timeEl.lastChild);
        }
        timeEl.appendChild(document.createTextNode(" / " + fmtTime(totalSec)));
      }
      updateClock();
      clockTimer = setInterval(updateClock, 200);
      touchUnbind = bindCanvasInteractions();
      // Re-apply SUD+ — the renderer rebuilt cp-field, so the inline
      // --cp-sudplus-h is gone with the old element.
      applySudplus(sudplusValue);
      showEmpty(false);
      // Defer one more draw to the frame after layout settles. Without this,
      // the very first paint on DP can happen while cp-field.clientWidth is
      // still 0, leaving lanes drawn at the renderer's mainW fallback and
      // clipped on the right.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (view && view.draw) { try { view.draw(); } catch (e) {} }
        });
      });
      if (t.mode === "DP" && typeof window.matchMedia === "function" &&
          window.matchMedia("(orientation: portrait)").matches) {
        showToast("Rotate to landscape for a wider DP view", 3000);
      }
    }

    function rendererOpts() {
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      // On narrow viewports the renderer's fixed lane-fit width (553 px for DP
      // at the default lane unit of 30) overflows portrait phones. Trim it so
      // the construction-time mainW stays under viewport — the dynamic
      // per-frame lane unit then fills whatever the canvas actually got.
      const dpLaneUnit = vw > 0 && vw < 480 ? 18 : 30;
      return {
        apiBase: apiBaseFromPage() || undefined,
        keyZoneH: 0,
        mainLaneUnit: { SP: 30, DP: dpLaneUnit },
      };
    }

    async function loadByBundle(bundle, label) {
      teardownView();
      clearHostChildren();
      if (titleEl) titleEl.textContent = label || "loading…";
      try {
        const opts = rendererOpts();
        if (bundle.audioUrl) opts.audioUrl = bundle.audioUrl;
        view = await window.ChartRenderer.renderTimeline(host, bundle.timeline, opts);
        _finalizeView();
      } catch (e) {
        console.error("[cpm] bundle render failed", e);
        showEmpty(true);
        if (titleEl) titleEl.textContent = "Error: " + e.message;
      }
    }

    async function loadByUrl(url, label) {
      teardownView();
      clearHostChildren();
      if (titleEl) titleEl.textContent = label || "loading…";
      try {
        view = await window.ChartRenderer.loadAndRender(host, url, rendererOpts());
        _finalizeView();
      } catch (e) {
        console.error("[cpm] load failed", e);
        showEmpty(true);
        if (titleEl) titleEl.textContent = "Error: " + e.message;
      }
    }

    async function loadByRow(row) {
      if (!row || !row.md5) return;
      currentRow = row;
      const family = row.family ? " " + row.family : "";
      const label = (row.title || row.file || row.md5) +
                    " (" + (row.mode || "?") + family + ")";
      const apiBase = apiBaseFromPage();
      const hasJSZip = typeof window.JSZip !== "undefined";
      const hasBundleAPI = window.ChartRenderer && window.ChartRenderer.resolveBundleUrl;
      if (apiBase && hasJSZip && hasBundleAPI) {
        try {
          const bundleUrl = await window.ChartRenderer.resolveBundleUrl(
            apiBase, "bms-bundle/" + row.md5 + ".zip");
          if (bundleUrl) {
            const bundle = await _tryFetchBundle(bundleUrl);
            if (bundle) return loadByBundle(bundle, label);
          }
        } catch (e) {
          console.warn("[cpm] bundle failed, falling back", e);
        }
      }
      const url = "/Resource/NoteAttributes/timeline/" + row.md5 + ".json";
      return loadByUrl(url, label);
    }

    /* ── Search / picker ──────────────────────────────────────────── */

    function ensureCorpus() {
      if (!corpusPromise) {
        corpusPromise = Promise.all([
          fetch("/Resource/NoteAttributes/summary.json").then(function (r) {
            if (!r.ok) throw new Error("summary.json HTTP " + r.status);
            return r.json();
          }),
          fetch("/Resource/NoteAttributes/timeline-index.json").then(function (r) {
            if (!r.ok) throw new Error("timeline-index.json HTTP " + r.status);
            return r.json();
          }),
        ]).then(function (pair) {
          const rows = pair[0];
          const playable = new Set((pair[1] || []).map(function (s) {
            return String(s).toLowerCase();
          }));
          return rows.filter(function (r) {
            return r.md5 && playable.has(String(r.md5).toLowerCase());
          });
        });
      }
      return corpusPromise;
    }

    async function openPicker() {
      if (!searchModal || !window.ChartSearch) return;
      try {
        const rows = await ensureCorpus();
        if (!searchController) {
          searchController = window.ChartSearch.create({
            modal: searchModal,
            input: searchInput,
            results: searchResults,
            close: searchClose,
            rows: rows,
            kbShortcuts: false,
            titleOnly: true,
            onSelect: function (row) {
              requestAnimationFrame(function () { loadByRow(row); });
              return true;
            },
          });
        }
        searchController.open();
      } catch (e) {
        console.error("[cpm] corpus load failed", e);
      }
    }

    pickBtns.forEach(function (btn) {
      btn.addEventListener("click", openPicker);
    });

    /* ── Playback controls ─────────────────────────────────────────── */

    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (!view) return;
        try { view.toggle(); } catch (e) { console.warn("[cpm] toggle failed", e); }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!view) return;
        try {
          if (view.pause) view.pause();
          if (view.seekToSec) view.seekToSec(0);
        } catch (e) { console.warn("[cpm] reset failed", e); }
      });
    }

    /* ── Fullscreen ───────────────────────────────────────────────── */

    function fsElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function updateFsButton() {
      const on = !!fsElement();
      if (fsBtn) fsBtn.classList.toggle("is-active", on);
      if (fsIconExpand)   { fsIconExpand.hidden = on;  fsIconExpand.style.display   = on ? "none"  : "block"; }
      if (fsIconContract) { fsIconContract.hidden = !on; fsIconContract.style.display = on ? "block" : "none"; }
    }
    async function enterFullscreen() {
      const el = document.documentElement;
      try {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else throw new Error("not supported");
      } catch (e) {
        showToast("Fullscreen unavailable — try Add to Home Screen", 3500);
      }
    }
    function exitFullscreen() {
      try {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch (e) {}
    }
    if (fsBtn) {
      fsBtn.addEventListener("click", function () {
        if (fsElement()) exitFullscreen(); else enterFullscreen();
      });
    }
    document.addEventListener("fullscreenchange", updateFsButton);
    document.addEventListener("webkitfullscreenchange", updateFsButton);
    updateFsButton();

    /* ── Landscape lock (DP) ───────────────────────────────────────── */

    async function lockLandscape() {
      try {
        const el = document.documentElement;
        if (!fsElement()) {
          if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        }
        if (screen && screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape");
          return;
        }
        throw new Error("orientation lock unsupported");
      } catch (e) {
        showToast("Rotate your device to landscape", 3000);
      }
    }
    if (rotateBtn) {
      rotateBtn.addEventListener("click", lockLandscape);
    }

    /* ── Help dialog ──────────────────────────────────────────────── */

    if (helpBtn && helpModal) {
      helpBtn.addEventListener("click", function () {
        try { helpModal.showModal(); } catch (e) { helpModal.setAttribute("open", ""); }
      });
    }
    if (helpClose && helpModal) {
      helpClose.addEventListener("click", function () {
        try { helpModal.close(); } catch (e) { helpModal.removeAttribute("open"); }
      });
    }
    if (helpModal) {
      helpModal.addEventListener("click", function (e) {
        // Tap on backdrop closes — <dialog> backdrop sits behind the dialog
        // box, so a click on the dialog element itself (not its children)
        // means the backdrop was hit.
        if (e.target === helpModal) {
          try { helpModal.close(); } catch (err) { helpModal.removeAttribute("open"); }
        }
      });
    }

    if (progressEl) {
      progressEl.addEventListener("pointerdown", function () {
        if (!view) return;
        dragging = true;
        const st = view.getState();
        wasPlayingBeforeDrag = !!st.playing;
        if (wasPlayingBeforeDrag) view.pause();
      });
      progressEl.addEventListener("input", function () {
        if (!view || !dragging) return;
        const sec = parseFloat(progressEl.value);
        if (isFinite(sec) && view.seekToSec) view.seekToSec(sec);
        updateClock();
      });
      progressEl.addEventListener("pointerup", function () {
        if (!view || !dragging) return;
        dragging = false;
        if (wasPlayingBeforeDrag) view.play();
      });
      progressEl.addEventListener("change", function () {
        if (!view) return;
        const sec = parseFloat(progressEl.value);
        if (isFinite(sec) && view.seekToSec) view.seekToSec(sec);
      });
    }

    /* ── Boot: auto-load via ?md5= or show empty ──────────────────── */

    const params = new URLSearchParams(location.search);
    const md5Param = params.get("md5");
    if (md5Param) {
      ensureCorpus().then(function (rows) {
        const row = rows.find(function (r) {
          return String(r.md5).toLowerCase() === md5Param.toLowerCase();
        });
        if (row) loadByRow(row);
        else {
          if (titleEl) titleEl.textContent = "Chart not found: " + md5Param;
          showEmpty(true);
        }
      }).catch(function (e) {
        console.error("[cpm] corpus load failed", e);
      });
    }
  });
})();
