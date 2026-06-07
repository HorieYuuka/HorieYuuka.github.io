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
    const menuEl       = $("[data-cpm-menu]");
    const menuToggleBtn = $("[data-cpm-menu-toggle]");
    const configBtn    = $("[data-cpm-config]");
    const configModal  = $("[data-cpm-config-modal]");
    const configClose  = $("[data-cpm-config-close]");
    const configHideRail = $("[data-cpm-config-hide-rail]");
    const pickBtns     = $$("[data-cpm-pick]");
    const searchModal  = $("[data-na-search-modal]");
    const searchInput  = $("[data-na-search-input]");
    const searchClose  = $("[data-na-search-close]");
    const searchResults= $("[data-na-search-results]");

    if (!shell || !host) return;

    let view = null;
    let currentRow = null;
    let clockTimer = null;
    let searchController = null;
    let corpusPromise = null;
    let totalSec = 0;

    /* Canvas-tap state */
    let lastTapAt = 0;
    let pendingSingleTapTimer = null;
    let hispeedToastTimer = null;
    let touchUnbind = null;
    let toastTimer = null;
    let sudplusValue = 0;
    let sudplusTipEl = null;
    let sudplusTipTimer = null;
    let progressActive = false;
    let progressWasPlaying = false;
    const mobileSettings = { hideMeasureRail: false };
    const SUDPLUS_TIP_MS = 900;
    const SUDPLUS_MAX = 500;
    const DRAG_THRESHOLD_PX = 12;

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
      // Renderer-built DOM lives directly under host. Overlays + action bar
      // are siblings placed before any chart loads — preserve them.
      const keep = [hispeedToast, toastEl, menuEl];
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
      if (!progressActive && progressEl && document.activeElement !== progressEl) {
        progressEl.value = String(cur);
      }
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
      if (!view) return;
      try {
        if (view.pause) view.pause();
        if (view.seekToSec) view.seekToSec(0);
      } catch (e) { console.warn("[cpm] reset failed", e); }
    }

    function injectSudplusTip() {
      const cpField = host.querySelector(".cp-field");
      if (!cpField) { sudplusTipEl = null; return; }
      sudplusTipEl = document.createElement("div");
      sudplusTipEl.className = "cpm-sudplus-tip";
      sudplusTipEl.textContent = "SUD+ " + sudplusValue + " px";
      cpField.appendChild(sudplusTipEl);
    }
    function applySudplus(v) {
      sudplusValue = Math.max(0, Math.min(SUDPLUS_MAX, v | 0));
      const cpField = host.querySelector(".cp-field");
      if (cpField) cpField.style.setProperty("--cp-sudplus-h", sudplusValue + "px");
      if (sudplusTipEl) sudplusTipEl.textContent = "SUD+ " + sudplusValue + " px";
    }
    function showSudplusTip() {
      if (!sudplusTipEl) return;
      sudplusTipEl.classList.add("is-visible");
      if (sudplusTipTimer) clearTimeout(sudplusTipTimer);
      sudplusTipTimer = setTimeout(function () {
        if (sudplusTipEl) sudplusTipEl.classList.remove("is-visible");
        sudplusTipTimer = null;
      }, SUDPLUS_TIP_MS);
    }

    function bindCanvasInteractions() {
      const cpField = host.querySelector(".cp-field");
      const cpCanvas = host.querySelector(".cp-field__canvas");
      if (!cpField || !cpCanvas) return null;

      // Suppress the renderer's "click-canvas-to-seek-to-measure" binding —
      // the mobile interaction model owns canvas taps.
      const clickBlocker = function (e) { e.stopImmediatePropagation(); };
      cpCanvas.addEventListener("click", clickBlocker, true);

      const pts = new Map();
      let mode = "idle";                 // "idle" | "drag-sudplus" | "pinch"
      let multiTouchSeen = false;
      let pinchInitialDist = 0;
      let pinchInitialHs = 1;
      let dragInitialSudplus = 0;

      function resetSequence() {
        mode = "idle";
        multiTouchSeen = false;
        pinchInitialDist = 0;
      }

      const onPointerDown = function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pts.set(e.pointerId, {
          origX: e.clientX, origY: e.clientY,
          x: e.clientX, y: e.clientY,
          downAt: performance.now(),
        });
        try { cpField.setPointerCapture(e.pointerId); } catch (err) {}

        if (pts.size === 2) {
          const arr = Array.from(pts.values());
          pinchInitialDist = Math.hypot(arr[1].x - arr[0].x, arr[1].y - arr[0].y);
          pinchInitialHs = (view && view.getSettings && view.getSettings().hiSpeed) || 1;
          mode = "pinch";
          multiTouchSeen = true;
          if (pendingSingleTapTimer) {
            clearTimeout(pendingSingleTapTimer);
            pendingSingleTapTimer = null;
          }
          lastTapAt = 0;
        } else if (pts.size > 2) {
          multiTouchSeen = true;
        }
      };

      const onPointerMove = function (e) {
        const p = pts.get(e.pointerId);
        if (!p) return;
        p.x = e.clientX;
        p.y = e.clientY;

        if (mode === "pinch" && pts.size === 2 && pinchInitialDist > 0 && view) {
          const arr = Array.from(pts.values());
          const curDist = Math.hypot(arr[1].x - arr[0].x, arr[1].y - arr[0].y);
          if (curDist > 0) {
            const ratio = curDist / pinchInitialDist;
            const newHs = clamp(pinchInitialHs * ratio, HISPEED_MIN, HISPEED_MAX);
            if (view.setSettings) view.setSettings({ hiSpeed: newHs });
            showHispeedToast(newHs);
          }
          return;
        }

        if (mode === "idle" && pts.size === 1) {
          const dy = e.clientY - p.origY;
          const dx = e.clientX - p.origX;
          if (Math.abs(dy) > DRAG_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx)) {
            mode = "drag-sudplus";
            dragInitialSudplus = sudplusValue;
            if (pendingSingleTapTimer) {
              clearTimeout(pendingSingleTapTimer);
              pendingSingleTapTimer = null;
            }
            lastTapAt = 0;
          }
        }

        if (mode === "drag-sudplus" && pts.size === 1) {
          const dy = e.clientY - p.origY;
          applySudplus(dragInitialSudplus + dy);
          showSudplusTip();
        }
      };

      const onPointerEnd = function (e) {
        const p = pts.get(e.pointerId);
        pts.delete(e.pointerId);
        try { cpField.releasePointerCapture(e.pointerId); } catch (err) {}

        if (pts.size > 0) return;        // wait for the last finger to lift
        const endedMode = mode;
        const endedMulti = multiTouchSeen;
        resetSequence();

        if (e.type !== "pointerup" || !p) return;
        if (endedMode !== "idle" || endedMulti) return;

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
        pts.clear();
        resetSequence();
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
      view.setSettings({
        hideJudgment: true,
        hideMeasureRail: !!mobileSettings.hideMeasureRail,
      });
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
      // Inject SUD+ tip into the new cp-field and re-apply the persisted
      // cover value — the renderer rebuilt cp-field, so the inline variable
      // is gone with the old element.
      injectSudplusTip();
      applySudplus(sudplusValue);
      // SP-only config rows. Toggle visibility now that we know the mode.
      const hideRailRow = document.querySelector('[data-cpm-config-row="hide-rail"]');
      if (hideRailRow) hideRailRow.hidden = t.mode !== "SP";
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

    /* ── Orientation toggle (DP) ───────────────────────────────────── */

    function currentOrientation() {
      if (screen && screen.orientation && screen.orientation.type) {
        return screen.orientation.type;     // "landscape-primary", etc.
      }
      const w = window.innerWidth || 0;
      const h = window.innerHeight || 0;
      return w >= h ? "landscape" : "portrait";
    }
    function isLandscape() {
      return /landscape/.test(currentOrientation());
    }
    function updateRotateButton() {
      if (!rotateBtn) return;
      rotateBtn.classList.toggle("is-active", isLandscape());
    }
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
    async function releaseLandscape() {
      try {
        if (screen && screen.orientation && screen.orientation.unlock) {
          try { screen.orientation.unlock(); } catch (err) {}
        }
        if (fsElement() && document.exitFullscreen) {
          try { await document.exitFullscreen(); } catch (err) {}
        }
      } catch (e) {
        showToast("Rotate your device to portrait", 3000);
      }
    }
    if (rotateBtn) {
      rotateBtn.addEventListener("click", function () {
        if (isLandscape()) releaseLandscape();
        else lockLandscape();
      });
    }
    if (screen && screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener("change", updateRotateButton);
    } else {
      window.addEventListener("orientationchange", updateRotateButton);
    }
    window.addEventListener("resize", updateRotateButton);
    updateRotateButton();

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
      // 'input' fires continuously while the user drags the slider; 'change'
      // fires once on release. Pointer events on range inputs are flaky on
      // touch browsers (cancel mid-drag, lost capture, etc.), so we rely on
      // these higher-level events instead. progressActive gates the periodic
      // updateClock() rewrite so the user's in-flight drag isn't clobbered.
      progressEl.addEventListener("input", function () {
        if (!view) return;
        if (!progressActive) {
          progressActive = true;
          const st = view.getState();
          progressWasPlaying = !!st.playing;
          if (progressWasPlaying && view.pause) view.pause();
        }
        const sec = parseFloat(progressEl.value);
        if (isFinite(sec) && view.seekToSec) view.seekToSec(sec);
        if (timeCurEl) timeCurEl.textContent = fmtTime(sec);
      });
      progressEl.addEventListener("change", function () {
        if (!view) return;
        const sec = parseFloat(progressEl.value);
        if (isFinite(sec) && view.seekToSec) view.seekToSec(sec);
        progressActive = false;
        if (progressWasPlaying && view.play) view.play();
        progressWasPlaying = false;
      });
      // Cancel/blur safety nets — touch range inputs sometimes lose pointer
      // events mid-drag; without these, progressActive would stick true and
      // the periodic clock tick would stop updating the slider thumb.
      function _cancelDrag() {
        if (!progressActive) return;
        progressActive = false;
        if (progressWasPlaying && view && view.play) view.play();
        progressWasPlaying = false;
      }
      progressEl.addEventListener("pointercancel", _cancelDrag);
      progressEl.addEventListener("blur", _cancelDrag);
    }

    /* ── Action bar (topbar kebab toggle) ─────────────────────────── */

    function setMenuOpen(open) {
      if (!menuEl) return;
      menuEl.classList.toggle("is-open", !!open);
      if (menuToggleBtn) {
        menuToggleBtn.classList.toggle("is-open", !!open);
        menuToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      }
    }
    if (menuToggleBtn) {
      menuToggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        setMenuOpen(!menuEl.classList.contains("is-open"));
      });
    }
    if (menuEl) {
      menuEl.querySelectorAll(".cpm-action").forEach(function (btn) {
        btn.addEventListener("click", function () { setMenuOpen(false); });
      });
      document.addEventListener("pointerdown", function (e) {
        if (!menuEl.classList.contains("is-open")) return;
        if (menuEl.contains(e.target)) return;
        if (menuToggleBtn && menuToggleBtn.contains(e.target)) return;
        setMenuOpen(false);
      });
    }

    /* ── Settings dialog ──────────────────────────────────────────── */

    function applyMobileSettings() {
      if (view && view.setSettings) {
        view.setSettings({ hideMeasureRail: !!mobileSettings.hideMeasureRail });
      }
    }
    if (configBtn && configModal) {
      configBtn.addEventListener("click", function () {
        if (configHideRail) configHideRail.checked = !!mobileSettings.hideMeasureRail;
        try { configModal.showModal(); } catch (e) { configModal.setAttribute("open", ""); }
      });
    }
    if (configClose && configModal) {
      configClose.addEventListener("click", function () {
        try { configModal.close(); } catch (e) { configModal.removeAttribute("open"); }
      });
    }
    if (configModal) {
      configModal.addEventListener("click", function (e) {
        if (e.target === configModal) {
          try { configModal.close(); } catch (err) { configModal.removeAttribute("open"); }
        }
      });
    }
    if (configHideRail) {
      configHideRail.addEventListener("change", function () {
        mobileSettings.hideMeasureRail = !!configHideRail.checked;
        applyMobileSettings();
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
