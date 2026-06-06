/* chart-preview.js — modal wiring for the chart preview page.
 *
 * Entry flow:
 *   ▶ Open preview → cp-dialog shows
 *                  → search modal auto-opens (stacked on top)
 *                  → user picks a chart → timeline loads + audio plays
 *   🔎 Pick chart… re-opens the search at any time.
 */
(function () {
  "use strict";

  // file-api base URL. Override on the page with
  //   <meta name="cp-api-base" content="https://your-nas.example.com">
  // When unset, audio playback is skipped and the chart falls back to
  // dt-based silent playback.
  function apiBaseFromPage() {
    const meta = document.querySelector('meta[name="cp-api-base"]');
    if (meta && meta.content) return meta.content.trim();
    return "";
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  // ── R8-26 Debug trace logger ──────────────────────────────────────────
  // Always-on ring buffer for bug reports. Capped at DEBUG_LOG_MAX entries
  // (~200 KB worst case). 🪲 button in the topbar triggers downloadLog()
  // which dumps the buffer + UA + timestamp header as a plain .txt for
  // the user to attach to an issue board.
  const DEBUG_LOG_MAX = 2000;
  const debugLog = [];
  function dlog(level, category, msg, data) {
    const d = new Date();
    const ts = d.getHours().toString().padStart(2, "0") + ":" +
               d.getMinutes().toString().padStart(2, "0") + ":" +
               d.getSeconds().toString().padStart(2, "0") + "." +
               d.getMilliseconds().toString().padStart(3, "0");
    debugLog.push({ ts, level, category, msg, data });
    if (debugLog.length > DEBUG_LOG_MAX) debugLog.shift();
  }
  function formatLog() {
    const lines = [];
    for (let i = 0; i < debugLog.length; i++) {
      const e = debugLog[i];
      const lvl = (e.level || "INFO").padEnd(4);
      let line = "[" + e.ts + "] [" + lvl + "] " + (e.category || "") + ": " + (e.msg || "");
      if (e.data !== undefined && e.data !== null) {
        try { line += " " + JSON.stringify(e.data); } catch (_) {}
      }
      lines.push(line);
    }
    return lines.join("\n");
  }
  function clearDebugLog() {
    debugLog.length = 0;
    dlog("INFO", "debug", "log cleared by user");
  }
  function downloadLog() {
    // Snapshot the live state — settings + bindings + HID + current chart —
    // so issue reports include "what the user had configured" without
    // needing to log every slider drag.
    let settingsSnap = "(unavailable)";
    try { settingsSnap = JSON.stringify(typeof fxSettings !== "undefined" ? fxSettings : null, null, 2); } catch (_) {}
    let bindingsSnap = "(unavailable)";
    try { bindingsSnap = JSON.stringify(typeof keybindings !== "undefined" ? keybindings : null, null, 2); } catch (_) {}
    let hidSnap = "(unavailable)";
    try {
      const arr = [];
      if (typeof deviceSlot !== "undefined") {
        for (const [d, slot] of deviceSlot) {
          arr.push({ name: d.productName, vid: d.vendorId, pid: d.productId, slot: slot });
        }
      }
      hidSnap = JSON.stringify(arr, null, 2);
    } catch (_) {}
    let viewSnap = "(no chart loaded)";
    try {
      if (window.__cpView && window.__cpView.timeline) {
        const t = window.__cpView.timeline;
        const st = window.__cpView.getState ? window.__cpView.getState() : {};
        viewSnap = JSON.stringify({
          mode: t.mode, lanes: t.lanes, notes: t.notes.length,
          totalSec: t.total_sec, baseBpm: t.base_bpm,
          currentSec: st.currentSec, activeIdx: st.activeIdx,
          hasAudio: window.__cpView.hasAudio,
        }, null, 2);
      }
    } catch (_) {}
    const header =
      "Chart-preview debug log\n" +
      "Generated: " + new Date().toISOString() + "\n" +
      "UA: " + navigator.userAgent + "\n" +
      "DPR: " + (window.devicePixelRatio || 1) + "\n" +
      "Viewport: " + window.innerWidth + "×" + window.innerHeight + "\n" +
      "Entries: " + debugLog.length + "\n" +
      "─────────── current chart ───────────\n" + viewSnap + "\n" +
      "─────────── fxSettings ───────────\n" + settingsSnap + "\n" +
      "─────────── keybindings ───────────\n" + bindingsSnap + "\n" +
      "─────────── HID devices ───────────\n" + hidSnap + "\n" +
      "─────────── log (oldest → newest) ───────────\n\n";
    const text = header + formatLog() + "\n";
    let blob, url;
    try { blob = new Blob([text], { type: "text/plain;charset=utf-8" }); }
    catch (e) { console.error("[cp-debug] Blob failed", e); return; }
    try { url = URL.createObjectURL(blob); }
    catch (e) { console.error("[cp-debug] objectURL failed", e); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = "chart-preview-debug-" + Date.now() + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  // Debug handle for console inspection.
  window.__cpDebug = {
    log:      debugLog,
    format:   formatLog,
    download: downloadLog,
    clear:    clearDebugLog,
    push:     function (level, cat, msg, data) { dlog(level, cat, msg, data); },
  };
  dlog("INFO", "debug", "chart-preview boot", {
    ua: navigator.userAgent,
    locale: navigator.language,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    dpr: window.devicePixelRatio || 1,
  });

  const dialog  = $("[data-cp-dialog]");
  const openBtn = $("[data-cp-open]");   // optional — only present on pages with an inline launcher
  if (!dialog) return;

  const titleEl   = $("[data-cp-title]",   dialog);
  const host      = $("[data-cp-host]",    dialog);
  const metaEl    = $("[data-cp-meta]",    dialog);
  const clockEl   = $("[data-cp-clock]",   dialog);
  const playBtn   = $("[data-cp-play]",    dialog);
  const resetBtn  = $("[data-cp-reset]",   dialog);
  const profileEl = $("[data-cp-profile]", dialog);
  const closeBtn  = $("[data-cp-close]",   dialog);
  const pickBtn   = $("[data-cp-pick]",    dialog);
  const comboEl   = $("[data-cp-combo]",   dialog);
  const countsEl  = $("[data-cp-counts]",  dialog);
  const keyhintEl = $("[data-cp-keyhint]", dialog);
  const judgmentEl= $("[data-cp-judgment]",dialog);
  const loopCountdownEl    = $("[data-cp-loop-countdown]", dialog);
  const loopCountdownNumEl = $("[data-cp-loop-countdown-num]", dialog);
  const loopCountdownFgEl  = loopCountdownEl && loopCountdownEl.querySelector(".cp-loop-countdown__fg");

  // R8-15 — lane-mod gear config modal. Sits at document scope (sibling
  // to cp-dialog) so it stacks above on .showModal().
  const lanemodConfigModal = $("[data-cp-lanemod-config]");
  const lanemodConfigTitle = lanemodConfigModal && lanemodConfigModal.querySelector("[data-cp-lanemod-config-title]");
  const lanemodConfigBody  = lanemodConfigModal && lanemodConfigModal.querySelector("[data-cp-lanemod-config-body]");
  const lanemodConfigClose = lanemodConfigModal && lanemodConfigModal.querySelector("[data-cp-lanemod-config-close]");
  let lanemodConfigCtx = null;   // { side: "1p"|"2p", modType: "random"|"r-random" }
  const progressEl    = $("[data-cp-progress]",     dialog);
  const progressTimeEl= $("[data-cp-progress-time]",dialog);
  const densityNotesEl   = $("[data-cp-density-notes]",   dialog);
  const densityScratchEl = $("[data-cp-density-scratch]", dialog);
  const progressLoopEl       = $("[data-cp-progress-loop]",       dialog);
  const progressLoopStartEl  = $("[data-cp-progress-loop-start]", dialog);
  const progressLoopEndEl    = $("[data-cp-progress-loop-end]",   dialog);
  // Phase G — split identity into badge slots.
  const modeBadgeEl   = $("[data-cp-badge-mode]",  dialog);
  const tierBadgeEl   = $("[data-cp-badge-tier]",  dialog);
  const metaBadgesEl  = $("[data-cp-meta-badges]", dialog);
  const playIconEl    = playBtn && playBtn.querySelector(".cp-icon-play");
  const pauseIconEl   = playBtn && playBtn.querySelector(".cp-icon-pause");
  // Seed inline display so theme CSS that overrides [hidden] doesn't make
  // the pause icon visible alongside the play icon at startup.
  if (playIconEl)  playIconEl.style.display  = "block";
  if (pauseIconEl) pauseIconEl.style.display = "none";
  // PORT_FIXUPS #4 — empty state overlay.
  const emptyEl       = $("[data-cp-empty]",      dialog);
  const emptyQuickEl  = $("[data-cp-empty-quick]",dialog);
  function showEmpty(show) {
    if (emptyEl) emptyEl.hidden = !show;
  }

  // Settings popup elements (separate <dialog> stacked above cp-dialog).
  // v2 schema: only beam length is user-tunable (radio: default/short/very_short).
  // Everything else is locked to the renderer's defaults.
  const settingsModal = $("[data-cp-settings-modal]");
  const settingsOpen  = $("[data-cp-settings-open]", dialog);
  const debugDownloadBtn = $("[data-cp-debug-download]", dialog);
  if (debugDownloadBtn) {
    debugDownloadBtn.addEventListener("click", function () {
      dlog("INFO", "debug", "download requested by user");
      downloadLog();
    });
  }

  // ── R8-26 SUD+ play-canvas gestures ──────────────────────────────────
  // - Double-click anywhere on cp-field → toggle SUD+ on/off
  // - Mouse wheel while cursor is INSIDE the SUD+ panel area → adjust height
  //   (cursor outside the panel → normal HI-SPEED wheel behaviour on canvas)
  //
  // Both listeners attach to cp-dialog with capture phase so they intercept
  // before the renderer's canvas-bound HI-SPEED wheel handler. cp-field is
  // queried lazily because it's built dynamically when a chart loads.
  const SUDPLUS_MIN  = 15;     // px — minimum when ENABLED (0 = off)
  const SUDPLUS_MAX  = 500;
  const SUDPLUS_STEP = 10;
  const SUDPLUS_DEFAULT_ON = 120;   // px used when double-click enables from off
  let lastEnabledSudPlus = 0;
  let sudplusTipTimer = null;
  function cpFieldEl() {
    return dialog.querySelector(".cp-field");
  }
  function showSudplusTip(v) {
    if (v <= 0) return;     // no panel visible — no tip
    const field = cpFieldEl();
    if (!field) return;
    let tip = field.querySelector(".cp-sudplus-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "cp-sudplus-tip";
      field.appendChild(tip);
    }
    tip.textContent = v + "px";
    void tip.offsetWidth;        // force reflow so the class change actually transitions
    tip.classList.add("is-on");
    if (sudplusTipTimer) clearTimeout(sudplusTipTimer);
    sudplusTipTimer = setTimeout(function () {
      if (tip) tip.classList.remove("is-on");
    }, 1000);
  }
  function setSudPlus(v) {
    v = Math.max(0, Math.min(SUDPLUS_MAX, v | 0));
    if (v > 0 && v < SUDPLUS_MIN) v = 0;   // snap below-min to off
    fxSettings.sudPlus = v;
    if (fxSudplusSlider) fxSudplusSlider.value = String(v);
    if (fxSudplusVal) fxSudplusVal.textContent = v + " px";
    applyFxToView();
    saveFxSettings();
    showSudplusTip(v);   // 1-sec floating value at the panel's bottom edge
  }
  dialog.addEventListener("dblclick", function (e) {
    const field = cpFieldEl();
    if (!field || !field.contains(e.target)) return;
    const cur = fxSettings.sudPlus || 0;
    if (cur > 0) {
      lastEnabledSudPlus = cur;
      setSudPlus(0);
      dlog("INFO", "sudplus", "toggle off via dblclick", { wasPx: cur });
    } else {
      const v = Math.max(SUDPLUS_MIN, lastEnabledSudPlus || SUDPLUS_DEFAULT_ON);
      setSudPlus(v);
      dlog("INFO", "sudplus", "toggle on via dblclick", { px: v });
    }
  }, { capture: true });
  dialog.addEventListener("wheel", function (e) {
    const field = cpFieldEl();
    if (!field || !field.contains(e.target)) return;
    if (e.ctrlKey || e.metaKey) return;            // browser zoom shortcut, leave alone
    const cur = fxSettings.sudPlus || 0;
    if (cur <= 0) return;                          // SUD+ off — no area to scroll
    const rect = field.getBoundingClientRect();
    const cursorY = e.clientY - rect.top;
    if (cursorY < 0 || cursorY > cur) return;      // outside SUD+ panel — let canvas hi-speed wheel fire
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? SUDPLUS_STEP : -SUDPLUS_STEP;
    setSudPlus(cur + delta);
  }, { capture: true, passive: false });

  // R8-24 — Key Mapping modal (placeholder UI; actual binding flow lands
  // after the HID probe results come back).
  const keymapModal = $("[data-cp-keymap]");
  const keymapOpen  = $("[data-cp-keymap-open]", dialog);
  const keymapClose = keymapModal && keymapModal.querySelector("[data-cp-keymap-close]");
  const settingsClose = settingsModal && settingsModal.querySelector("[data-cp-settings-close]");
  const settingsReset = settingsModal && settingsModal.querySelector("[data-cp-settings-reset]");
  const fxBeamLenRadios = settingsModal
    ? Array.from(settingsModal.querySelectorAll('input[name="cp-beam-len"]'))
    : [];
  const fxLineSlider  = settingsModal && settingsModal.querySelector("[data-cp-settings-line]");
  const fxLineVal     = settingsModal && settingsModal.querySelector("[data-cp-settings-line-val]");
  const fxPopupSlider = settingsModal && settingsModal.querySelector("[data-cp-settings-popup]");
  const fxPopupVal    = settingsModal && settingsModal.querySelector("[data-cp-settings-popup-val]");
  const fxSudplusSlider = settingsModal && settingsModal.querySelector("[data-cp-settings-sudplus]");
  const fxSudplusVal    = settingsModal && settingsModal.querySelector("[data-cp-settings-sudplus-val]");
  const fxOffsetSlider= settingsModal && settingsModal.querySelector("[data-cp-settings-offset]");
  const fxOffsetVal   = settingsModal && settingsModal.querySelector("[data-cp-settings-offset-val]");
  const fxAutoToggle  = settingsModal && settingsModal.querySelector("[data-cp-settings-auto]");
  const fxMarkersToggle = settingsModal && settingsModal.querySelector("[data-cp-settings-markers]");
  const fxHideRailToggle     = settingsModal && settingsModal.querySelector("[data-cp-settings-hide-rail]");
  const fxHideJudgmentToggle = settingsModal && settingsModal.querySelector("[data-cp-settings-hide-judgment]");
  const fxGhostToggle        = settingsModal && settingsModal.querySelector("[data-cp-settings-ghost]");
  const fxStandbyRadios = settingsModal
    ? Array.from(settingsModal.querySelectorAll('input[name="cp-loop-standby"]'))
    : [];

  // r11 Phase 3 — settings bridge. Owns DEFAULTS, persistence (load/save),
  // validation (clamps + enum guards), and the host→renderer translation
  // (apply-to-view + sudplus CSS var). Lives as a factory so the contract
  // is self-contained; chart-preview.js aliases bridge.settings as
  // `fxSettings` to keep ~60 downstream read sites untouched. Codex
  // layering audit's anti-pattern #1 ("split-brain settings ownership")
  // collapses to one source: defaults declared once, persistence routed
  // through one method, translation written down in one place.
  // v3 schema = judgment-line raise + judge offset + auto-adjust.
  // v4 schema additions handled with the same key (load tolerates missing
  // fields gracefully).
  function createSettingsBridge() {
    const STORAGE_KEY = "cp-fx-settings-v3";
    const BEAM_LENGTH_RATIOS = {
      default:    0.55,
      short:      0.30,
      very_short: 0.15,
    };
    // R8-10 — loop standby. Every preset includes the 250 ms decoder-grace
    // floor (the renderer's "Instant"); the labelled duration is the EXTRA
    // countdown shown on top. So 1 s standby = 250 ms silent grace + 1 s of
    // visible countdown ring, totalling 1.25 s of stage-1 hold.
    const LOOP_STANDBY_INSTANT_MS = 250;
    const LOOP_STANDBY_MS = {
      instant: LOOP_STANDBY_INSTANT_MS,
      "1s":    LOOP_STANDBY_INSTANT_MS + 1000,
      "2s":    LOOP_STANDBY_INSTANT_MS + 2000,
      "3s":    LOOP_STANDBY_INSTANT_MS + 3000,
    };
    const DEFAULTS = {
      beamLength: "default",
      lineOffset: 1,           // 1..20 px — raises judgment line above baseline
      judgmentPopupOffset: 0,  // R8-26 — ADDITIONAL px on top of the built-in
                               // POPUP_BASE_GAP (30 px). popup bottom
                               // = kz + lineOffset + POPUP_BASE_GAP + judgmentPopupOffset.
                               // Slider can only add (range 0..200) — popup stays
                               // at least 30 px above the judgment line.
      judgeOffsetMs: 0,        // -100..+100 ms
      autoAdjust: false,
      showMeasureMarkers: true,// <mxx> + BPM change + STOP in rail/pillar
      hideMeasureRail: false,  // R8-21 SP only — collapse left rail entirely
      hideJudgment: false,     // R8-21 watch mode (no hit-test / beam / popup / counts)
      ghostEnabled: true,      // R8-26 — queue ghost overlay
      sudPlus: 0,              // R8-26 — opaque cover at top of play area (0..500 px)
      loopStandby: "instant",
      // R8-13/14: lanemod chip row state. RANDOM/R-RANDOM regenerate the
      // permutation on each chart load — the SETTING sticks, not the seed.
      // DP gets independent 1P/2P controls; SP ignores the *2P fields.
      laneMod:      "off",   // off | random | r-random | mirror   (SP + DP 1P)
      laneFilter:   "off",   // off | scr-only | key-only          (SP + DP 1P)
      laneMod2P:    "off",   // DP only
      laneFilter2P: "off",   // DP only
    };
    const settings = Object.assign({}, DEFAULTS);

    function load() {
      try {
        const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed) return;
        if (BEAM_LENGTH_RATIOS[parsed.beamLength]) settings.beamLength = parsed.beamLength;
        if (typeof parsed.lineOffset === "number") {
          settings.lineOffset = Math.max(1, Math.min(20, parsed.lineOffset | 0));
        }
        if (typeof parsed.judgmentPopupOffset === "number") {
          settings.judgmentPopupOffset = Math.max(0, Math.min(200, parsed.judgmentPopupOffset | 0));
        }
        if (typeof parsed.judgeOffsetMs === "number") {
          settings.judgeOffsetMs = Math.max(-150, Math.min(150, parsed.judgeOffsetMs | 0));
        }
        if (typeof parsed.autoAdjust === "boolean") settings.autoAdjust = parsed.autoAdjust;
        if (typeof parsed.showMeasureMarkers === "boolean") settings.showMeasureMarkers = parsed.showMeasureMarkers;
        if (typeof parsed.hideMeasureRail === "boolean") settings.hideMeasureRail = parsed.hideMeasureRail;
        if (typeof parsed.hideJudgment === "boolean") settings.hideJudgment = parsed.hideJudgment;
        if (typeof parsed.ghostEnabled === "boolean") settings.ghostEnabled = parsed.ghostEnabled;
        if (typeof parsed.sudPlus === "number") {
          let _v = Math.max(0, Math.min(500, parsed.sudPlus | 0));
          if (_v > 0 && _v < 15) _v = 0;   // migrate old < 15 values to off
          settings.sudPlus = _v;
        }
        if (LOOP_STANDBY_MS[parsed.loopStandby]) settings.loopStandby = parsed.loopStandby;
        // R8-17: laneMod / laneFilter (and *2P) intentionally NOT restored
        // from localStorage — they're per-session gameplay modifiers, the
        // user doesn't expect "RANDOM" to come back after a hard refresh.
      } catch (e) { /* fall through with defaults */ }
    }

    function save() {
      try {
        // R8-17: persist Effects-style settings only; lanemod chip state
        // (laneMod/laneFilter/*2P) is per-session and must NOT survive a refresh.
        const persistable = {
          beamLength:           settings.beamLength,
          lineOffset:           settings.lineOffset,
          judgmentPopupOffset:  settings.judgmentPopupOffset,
          judgeOffsetMs:        settings.judgeOffsetMs,
          autoAdjust:           settings.autoAdjust,
          showMeasureMarkers:   settings.showMeasureMarkers,
          hideMeasureRail:      settings.hideMeasureRail,
          hideJudgment:         settings.hideJudgment,
          ghostEnabled:         settings.ghostEnabled,
          sudPlus:              settings.sudPlus,
          loopStandby:          settings.loopStandby,
        };
        window.localStorage && window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
      } catch (e) { /* ignore quota errors */ }
    }

    function applyToView(view, dialog) {
      if (view && view.setSettings) {
        view.setSettings({
          beamLengthRatio:    BEAM_LENGTH_RATIOS[settings.beamLength] || BEAM_LENGTH_RATIOS.default,
          judgmentLineOffset: settings.lineOffset,
          judgeOffsetMs:      settings.judgeOffsetMs,
          autoAdjust:         settings.autoAdjust,
          showMeasureMarkers: settings.showMeasureMarkers,
          hideMeasureRail:    settings.hideMeasureRail,
          hideJudgment:       settings.hideJudgment,
          ghostEnabled:       settings.ghostEnabled,
          loopWrapHoldMs:     LOOP_STANDBY_MS[settings.loopStandby] || LOOP_STANDBY_MS.instant,
          laneMod:            settings.laneMod,
          laneFilter:         settings.laneFilter,
          laneMod2P:          settings.laneMod2P,
          laneFilter2P:       settings.laneFilter2P,
        });
      }
      // R8-26 — SUD+ cover height onto the cp-field as a CSS variable.
      // The ::before overlay reads it; 0 leaves the panel invisible.
      const fieldEl = dialog && dialog.querySelector(".cp-field");
      if (fieldEl) fieldEl.style.setProperty("--cp-sudplus-h", (settings.sudPlus || 0) + "px");
    }

    function reset() {
      Object.assign(settings, DEFAULTS);
    }

    return {
      settings, DEFAULTS,
      BEAM_LENGTH_RATIOS, LOOP_STANDBY_INSTANT_MS, LOOP_STANDBY_MS,
      load, save, applyToView, reset,
    };
  }

  const settingsBridge = createSettingsBridge();
  const fxSettings = settingsBridge.settings;
  const BEAM_LENGTH_RATIOS = settingsBridge.BEAM_LENGTH_RATIOS;
  const LOOP_STANDBY_INSTANT_MS = settingsBridge.LOOP_STANDBY_INSTANT_MS;
  const LOOP_STANDBY_MS = settingsBridge.LOOP_STANDBY_MS;
  const LANE_MOD_VALUES    = ["off", "random", "r-random", "mirror"];
  const LANE_FILTER_VALUES = ["off", "scr-only", "key-only"];
  settingsBridge.load();

  function saveFxSettings() { settingsBridge.save(); }
  function applyFxToView() {
    settingsBridge.applyToView(view, dialog);
    // R8-26 — popup tracks lineOffset; re-position on every settings push.
    // Kept outside the bridge because positionJudgment lives in the host
    // closure (needs judgmentEl + bodyEl rect math).
    positionJudgment();
  }

  // r12 — Input latency calibration sub-dialog factory. Drives a canvas
  // metronome of falling notes via rAF, captures keydown timestamps,
  // computes median delta after warmup + outlier rejection, and surfaces
  // the value through applyOffsetMs for the host to write into
  // fxSettings.judgeOffsetMs. Stops keydown propagation at document
  // capture phase so taps don't accidentally drive play.
  function createCalibrationDialog(dialogEl, applyOffsetMs, getBaselineMs) {
    if (!dialogEl) return { open: function () {}, close: function () {} };
    const canvas    = dialogEl.querySelector("[data-cp-calib-canvas]");
    const stateEl   = dialogEl.querySelector("[data-cp-calib-state]");
    const countEl   = dialogEl.querySelector("[data-cp-calib-count]");
    const medianEl  = dialogEl.querySelector("[data-cp-calib-median]");
    const suggestEl = dialogEl.querySelector("[data-cp-calib-suggest]");
    const histEl    = dialogEl.querySelector("[data-cp-calib-hist]");
    const startBtn  = dialogEl.querySelector("[data-cp-calib-start]");
    const applyBtn  = dialogEl.querySelector("[data-cp-calib-apply]");
    const cancelBtn = dialogEl.querySelector("[data-cp-calib-cancel]");
    const closeBtn  = dialogEl.querySelector("[data-cp-calib-close]");
    const ctx = canvas ? canvas.getContext("2d") : null;

    const BPM = 120;
    const INTERVAL_MS = 60000 / BPM;          // 500 ms per note
    const DROP_MS = 1000;                     // spawn → hit line
    const WARMUP = 4;
    const TARGET_SAMPLES = 16;
    const OUTLIER_THRESHOLD_MS = 50;
    const NEAREST_WINDOW_MS = INTERVAL_MS / 2; // tap clamp
    // r12 — only used as the safety stop when the user
    // walks away mid-calibration. With running outlier reject removed,
    // we no longer "burn" notes on rejected samples, so the cap can be
    // generous without harming the success path.
    const SAFETY_NOTE_CAP = WARMUP + TARGET_SAMPLES * 8;
    // r12.1 — HID rising-edge tap debounce. Phoenixwan / DJDAO controllers
    // are clean single-report presses, but the guard absorbs multi-byte
    // press clusters (turntable+key near-simultaneous) into one tap.
    const HID_DEBOUNCE_MS = 25;

    let state = "idle";          // idle | running | done
    let startTime = 0;            // performance.now() origin
    let notesSpawned = 0;
    let samples = [];             // accepted deltas (game sign: positive = early)
    let suggestedOffset = 0;
    let rafHandle = 0;
    let lastHidTapAt = 0;         // r12.1 — HID debounce baseline
    const activeNotes = [];

    function signed(v) { const n = Math.round(v); return (n >= 0 ? "+" : "") + n + " ms"; }
    function medianOf(arr) {
      if (!arr.length) return 0;
      const s = arr.slice().sort(function (a, b) { return a - b; });
      const m = s.length >> 1;
      return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    function reset() {
      state = "idle";
      startTime = 0;
      notesSpawned = 0;
      samples = [];
      suggestedOffset = 0;
      lastHidTapAt = 0;
      activeNotes.length = 0;
      if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
      drawCanvas(0);
      drawHist();
      syncUI();
    }

    function syncUI() {
      if (stateEl) {
        stateEl.textContent =
          state === "idle"    ? "Idle"
        : state === "done"    ? "Done"
        : (notesSpawned <= WARMUP ? "Warming up…" : "Collecting…");
      }
      if (countEl)   countEl.textContent  = Math.min(samples.length, TARGET_SAMPLES) + " / " + TARGET_SAMPLES;
      // r12.6 — Median is shown in baseline-corrected space (the value the
      // user would see on the judge-offset slider after Apply). Samples are
      // still stored raw so outlier maths against the raw median remains
      // sign-stable.
      const baseline = getBaselineMs ? (getBaselineMs() | 0) : 0;
      if (medianEl)  medianEl.textContent = samples.length ? signed(medianOf(samples) - baseline) : "—";
      if (suggestEl) {
        if (state !== "done") {
          suggestEl.textContent = "—";
        } else {
          // r12.6 — show the actual stored value (clamped residual) only.
          // No breakdown formula; the median row above already shows the
          // corrected delta.
          const residual = suggestedOffset - baseline;
          const clamped  = Math.max(-150, Math.min(150, residual | 0));
          suggestEl.textContent = signed(clamped);
        }
      }
      if (startBtn)  startBtn.disabled = (state === "running");
      if (applyBtn)  applyBtn.disabled = (state !== "done");
    }

    function start() {
      if (state === "running") return;
      reset();
      state = "running";
      startTime = performance.now();
      syncUI();
      rafHandle = requestAnimationFrame(loop);
      dlog("INFO", "calibration", "start");
    }

    function loop(now) {
      if (state !== "running") return;
      while (true) {
        const spawnAt = startTime + notesSpawned * INTERVAL_MS;
        if (spawnAt > now) break;
        activeNotes.push({ idx: notesSpawned, spawnAt: spawnAt, hitAt: spawnAt + DROP_MS });
        notesSpawned++;
      }
      // Cull notes whose hit moment is too far in the past to accept.
      while (activeNotes.length && activeNotes[0].hitAt + NEAREST_WINDOW_MS < now) {
        activeNotes.shift();
      }
      drawCanvas(now);
      if (samples.length >= TARGET_SAMPLES || notesSpawned > SAFETY_NOTE_CAP) {
        finish();
        return;
      }
      rafHandle = requestAnimationFrame(loop);
    }

    function finish() {
      state = "done";
      if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
      // r12 — outlier reject runs ONCE against the FINAL
      // median over all measured taps, not running during collection. The
      // running-median version could lock onto a spiky early median and
      // refuse correct later taps, poisoning the result. Final-pass reject
      // can't suffer that failure mode: spikes get dropped by the median,
      // then the cleaned set drives suggestedOffset.
      const rawMed = samples.length ? medianOf(samples) : 0;
      let cleaned = samples.length >= 8
        ? samples.filter(function (v) { return Math.abs(v - rawMed) <= OUTLIER_THRESHOLD_MS; })
        : samples;
      if (cleaned.length === 0) cleaned = samples;
      suggestedOffset = cleaned.length ? Math.round(medianOf(cleaned)) : 0;
      drawCanvas(performance.now());
      drawHist(rawMed);
      syncUI();
      dlog("INFO", "calibration", "done", {
        samples: samples.length,
        kept: cleaned.length,
        rejected: samples.length - cleaned.length,
        suggestOffsetMs: suggestedOffset,
        truncated: samples.length < TARGET_SAMPLES,
      });
    }

    function drawCanvas(now) {
      if (!ctx || !canvas) return;
      const w = canvas.width, h = canvas.height;
      const lineY = h - 40;
      ctx.clearRect(0, 0, w, h);
      // Judgment line
      ctx.fillStyle = "#ff4444";
      ctx.fillRect(0, lineY, w, 2);
      // Lane guide
      ctx.fillStyle = "rgba(52,224,255,0.10)";
      ctx.fillRect(w / 2 - 14, 0, 28, h);
      // Notes
      for (const n of activeNotes) {
        const t = (now - n.spawnAt) / (n.hitAt - n.spawnAt);
        if (t < 0) continue;
        const y = Math.max(0, Math.min(h, lineY * t + (t > 1 ? (t - 1) * 60 : 0)));
        ctx.fillStyle = (t >= 1) ? "rgba(255,200,80,0.55)" : "#34e0ff";
        ctx.fillRect(w / 2 - 12, y - 6, 24, 12);
      }
      // Phase label top-left
      if (state === "running") {
        ctx.fillStyle = "#7f8da3";
        ctx.font = "11px 'JetBrains Mono', monospace";
        ctx.fillText(notesSpawned <= WARMUP
          ? ("warmup " + notesSpawned + "/" + WARMUP)
          : ("measuring " + samples.length + "/" + TARGET_SAMPLES), 8, 16);
      }
    }

    function drawHist(rejectMedian) {
      if (!histEl) return;
      histEl.innerHTML = "";
      const RANGE_MS = OUTLIER_THRESHOLD_MS + 10;
      const w = histEl.clientWidth || 200;
      const h = histEl.clientHeight || 64;
      const useReject = (typeof rejectMedian === "number") && samples.length >= 8;
      // r12.6 — plot in baseline-corrected space so the 0-line is "perfect
      // residual" instead of "perfect raw delta". Outlier detection uses
      // raw samples vs raw rejectMedian (sign-stable), so shifting display
      // only never changes which dots get marked reject.
      const baseline = getBaselineMs ? (getBaselineMs() | 0) : 0;
      for (let i = 0; i < samples.length; i++) {
        const dot = document.createElement("div");
        dot.className = "cp-calib__hist-dot";
        if (useReject && Math.abs(samples[i] - rejectMedian) > OUTLIER_THRESHOLD_MS) {
          dot.className += " cp-calib__hist-dot--reject";
        }
        const x = ((samples[i] - baseline) / RANGE_MS) * (w / 2) + (w / 2);
        const y = ((i + 0.5) / TARGET_SAMPLES) * h;
        dot.style.left = Math.max(2, Math.min(w - 2, x)) + "px";
        dot.style.top  = y + "px";
        histEl.appendChild(dot);
      }
    }

    // r12.1 — shared tap recorder for keyboard AND HID. `now` is in
    // performance.now() space (both KeyboardEvent.timeStamp and
    // HIDInputReportEvent.timeStamp align with it on modern browsers).
    function recordTap(now, source) {
      if (state !== "running") return;
      let nearest = null;
      let bestDist = Infinity;
      for (const n of activeNotes) {
        const d = Math.abs(now - n.hitAt);
        if (d < bestDist) { bestDist = d; nearest = n; }
      }
      if (!nearest || bestDist > NEAREST_WINDOW_MS) return;
      // Game-equivalent delta: positive = hit early (matches judgeOffsetMs
      // sign so the median can be applied directly).
      const delta = nearest.hitAt - now;
      if (nearest.idx < WARMUP) {
        dlog("DBG", "calibration", "warmup tap", { idx: nearest.idx, delta: Math.round(delta), src: source });
        const idx = activeNotes.indexOf(nearest);
        if (idx >= 0) activeNotes.splice(idx, 1);
        return;
      }
      // r12 — accept every measurement-phase tap
      // unconditionally. Outlier rejection runs once at finish() against
      // the final median over the full sample set; robust to early spikes.
      samples.push(delta);
      const idx = activeNotes.indexOf(nearest);
      if (idx >= 0) activeNotes.splice(idx, 1);
      syncUI();
      drawHist();
    }

    function onKeyDown(e) {
      // Stop propagation regardless of state — while the dialog is open
      // a tap is for calibration, not for play. Esc/Enter are allowed to
      // bubble so the native dialog cancel path still works.
      if (e.key === "Escape" || e.key === "Enter") return;
      if (!dialogEl.open) return;
      e.stopPropagation();
      recordTap(e.timeStamp, "kbd");
    }

    // r12.1 — HID rising-edge detector. Any bit going 0→1 in `cur`
    // relative to `prev` counts as a press. Scratch axis (continuous
    // value) is intentionally NOT detected — calibration is button-tap
    // only. Returns true when the calibration consumed the event so
    // onHidReport can suppress play-side dispatch.
    function isRisingEdge(prev, cur) {
      // r12.1 — treat missing prev bytes as 0 (matches
      // bindingPressedFor's semantics on the play path). Without this, a
      // controller's first nonzero report after attach is invisible to
      // calibration because attachHidDevice initialises ctx.prev to
      // Uint8Array(0). Scan against cur.length to catch the new bytes.
      if (!cur) return false;
      for (let i = 0; i < cur.length; i++) {
        const p = (prev && i < prev.length) ? prev[i] : 0;
        if ((cur[i] & ~p) !== 0) return true;
      }
      return false;
    }
    function handleHidEvent(timeStamp, prev, cur) {
      if (!dialogEl.open) return false;
      // r12.1 — claim every HID event while the dialog
      // is open (idle / running / done), matching the keyboard side
      // which is swallowed for the whole dialog lifetime. Stray taps
      // can't leak through to play or capture while the user is
      // mid-calibration or reviewing the result.
      if (state === "running"
          && isRisingEdge(prev, cur)
          && (timeStamp - lastHidTapAt) >= HID_DEBOUNCE_MS) {
        lastHidTapAt = timeStamp;
        recordTap(timeStamp, "hid");
      }
      return true;
    }

    function open() {
      if (dialogEl.open) return;
      reset();
      // r12.4 — clear any pre-existing held lane / pad
      // highlight before locking out play dispatch. Without this, an input
      // that was already down at open and is released DURING the dialog
      // never reaches bindingRelease (handleHidEvent / onKeyDown swallow
      // the release), so the lane and the keymap pad stay latched.
      try { forceReleaseAllLanes(); } catch (e) {}
      try { clearAllPressing(); } catch (e) {}
      document.addEventListener("keydown", onKeyDown, true);
      dialogEl.showModal();
      dlog("INFO", "calibration", "open");
    }

    function close() {
      if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
      document.removeEventListener("keydown", onKeyDown, true);
      // r12.4 — symmetric cleanup: clear any input that
      // got "held" through the swallowed dispatch path so play resumes
      // from a clean baseline. Idempotent if nothing is held.
      try { forceReleaseAllLanes(); } catch (e) {}
      try { clearAllPressing(); } catch (e) {}
      if (dialogEl.open) dialogEl.close();
    }

    if (startBtn)  startBtn.addEventListener("click", start);
    if (applyBtn)  applyBtn.addEventListener("click", function () {
      if (state !== "done") return;
      if (applyOffsetMs) applyOffsetMs(suggestedOffset);
      dlog("INFO", "calibration", "apply", { offsetMs: suggestedOffset });
      close();
    });
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (closeBtn)  closeBtn.addEventListener("click", close);
    dialogEl.addEventListener("close", function () {
      if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
      document.removeEventListener("keydown", onKeyDown, true);
      // r12.4 — same latch cleanup if the dialog closes
      // through a path that didn't go through close() (Esc / backdrop /
      // showModal cancel).
      try { forceReleaseAllLanes(); } catch (e) {}
      try { clearAllPressing(); } catch (e) {}
      state = "idle";
    });
    dialogEl.addEventListener("click", function (e) {
      if (e.target === dialogEl) close();
    });

    return { open: open, close: close, handleHidEvent: handleHidEvent };
  }

  // r12.1 — read baseline from the ChartRenderer module, not from the
  // view instance. Calibration can run before any chart is loaded (the
  // keymap modal doesn't require a view), so view-bound getter returns
  // undefined → baseline 0 → no residual subtraction → judgeOffsetMs
  // stores the full measured value and over-corrects once a chart loads.
  function isBaselineAvailable() {
    return !!(window.ChartRenderer
      && typeof window.ChartRenderer.INPUT_BASELINE_MS === "number");
  }
  function getInputBaselineMs() {
    return isBaselineAvailable() ? window.ChartRenderer.INPUT_BASELINE_MS : 0;
  }

  const calibrationDialog = createCalibrationDialog(
    $("[data-cp-calib]"),
    function (offsetMs) {
      // r12.1 — fail closed when the baseline source is
      // missing. Without this, calibration would store the full measured
      // latency into judgeOffsetMs; once the renderer module loads with
      // a non-zero baseline, play would over-correct by that amount.
      if (!isBaselineAvailable()) {
        dlog("WARN", "calibration", "apply blocked — baseline source unavailable", {
          chartRendererPresent: !!window.ChartRenderer,
        });
        return;
      }
      // Renderer adds INPUT_BASELINE_MS at judge time, so we store the
      // residual (measured - baseline) into fxSettings.judgeOffsetMs.
      // Example: measured -120 ms with baseline -100 → user value -20.
      const baseline = getInputBaselineMs();
      const residual = offsetMs - baseline;
      const clamped = Math.max(-150, Math.min(150, residual | 0));
      fxSettings.judgeOffsetMs = clamped;
      fxSettings.autoAdjust = false;   // calibration overrides auto-adjust
      syncFxControls();
      applyFxToView();
      saveFxSettings();
    },
    getInputBaselineMs
  );
  function fmtSignedMs(v) {
    const n = v | 0;
    return (n > 0 ? "+" : "") + n + " ms";
  }
  function syncFxControls() {
    for (const r of fxBeamLenRadios) {
      r.checked = (r.value === fxSettings.beamLength);
    }
    if (fxLineSlider) fxLineSlider.value = String(fxSettings.lineOffset);
    if (fxLineVal) fxLineVal.textContent = fxSettings.lineOffset + " px";
    if (fxPopupSlider) fxPopupSlider.value = String(fxSettings.judgmentPopupOffset);
    if (fxPopupVal) fxPopupVal.textContent = fxSettings.judgmentPopupOffset + " px";
    if (fxSudplusSlider) fxSudplusSlider.value = String(fxSettings.sudPlus);
    if (fxSudplusVal) fxSudplusVal.textContent = fxSettings.sudPlus + " px";
    if (fxOffsetSlider) {
      fxOffsetSlider.value = String(fxSettings.judgeOffsetMs);
      fxOffsetSlider.disabled = !!fxSettings.autoAdjust;
    }
    if (fxOffsetVal) fxOffsetVal.textContent = fmtSignedMs(fxSettings.judgeOffsetMs);
    if (fxAutoToggle) fxAutoToggle.checked = !!fxSettings.autoAdjust;
    if (fxMarkersToggle) fxMarkersToggle.checked = !!fxSettings.showMeasureMarkers;
    if (fxHideRailToggle)     fxHideRailToggle.checked     = !!fxSettings.hideMeasureRail;
    if (fxHideJudgmentToggle) fxHideJudgmentToggle.checked = !!fxSettings.hideJudgment;
    if (fxGhostToggle)        fxGhostToggle.checked        = !!fxSettings.ghostEnabled;
    for (const r of fxStandbyRadios) {
      r.checked = (r.value === fxSettings.loopStandby);
    }
  }

  // Play-mode state — judgment counts + running combo.
  const JUDGMENT_TYPES = ["PG", "G", "Good", "Bad", "Miss"];
  let counts = { PG: 0, G: 0, Good: 0, Bad: 0, Miss: 0 };
  let combo = 0;
  let maxCombo = 0;
  let judgmentFadeTimer = null;
  let currentKeyMap = null;

  // ── R8-25 Key binding system ────────────────────────────────────────
  // Bindings are pad-id → binding object. A binding is one of:
  //   { kind:"key", code:"KeyZ" }                                // keyboard
  //   { kind:"hid-bit",  vid, pid, byte, mask }                  // HID button bit
  //   { kind:"hid-axis", vid, pid, byte, dir:"+"|"-", threshold } // signed int8 axis
  // SC is split into two pads per side (CW/CCW) but both share one lane.
  const PAD_LANE = {
    sc1p_cw: 0, sc1p_ccw: 0,
    key1p1: 1, key1p2: 2, key1p3: 3, key1p4: 4,
    key1p5: 5, key1p6: 6, key1p7: 7,
    key2p1: 8, key2p2: 9, key2p3: 10, key2p4: 11,
    key2p5: 12, key2p6: 13, key2p7: 14,
    sc2p_cw: 15, sc2p_ccw: 15,
  };
  const PAD_IDS = Object.keys(PAD_LANE);
  const PAD_LABELS = {
    sc1p_cw: "1P SC ↻", sc1p_ccw: "1P SC ↺",
    key1p1: "1P Key 1", key1p2: "1P Key 2", key1p3: "1P Key 3", key1p4: "1P Key 4",
    key1p5: "1P Key 5", key1p6: "1P Key 6", key1p7: "1P Key 7",
    key2p1: "2P Key 1", key2p2: "2P Key 2", key2p3: "2P Key 3", key2p4: "2P Key 4",
    key2p5: "2P Key 5", key2p6: "2P Key 6", key2p7: "2P Key 7",
    sc2p_cw: "2P SC ↻", sc2p_ccw: "2P SC ↺",
  };
  // Seeded from the previous KEY_MAP_SP/DP defaults so a first-time user
  // gets the LR2-style layout without having to bind anything. CCW is
  // unmapped by default (users typically bind only one direction).
  const DEFAULT_BINDINGS = {
    sc1p_cw:  { kind: "key", code: "ShiftLeft" },
    sc1p_ccw: null,
    key1p1: { kind: "key", code: "KeyZ" },
    key1p2: { kind: "key", code: "KeyS" },
    key1p3: { kind: "key", code: "KeyX" },
    key1p4: { kind: "key", code: "KeyD" },
    key1p5: { kind: "key", code: "KeyC" },
    key1p6: { kind: "key", code: "KeyF" },
    key1p7: { kind: "key", code: "KeyV" },
    key2p1: { kind: "key", code: "KeyM" },
    key2p2: { kind: "key", code: "KeyK" },
    key2p3: { kind: "key", code: "Comma" },
    key2p4: { kind: "key", code: "KeyL" },
    key2p5: { kind: "key", code: "Period" },
    key2p6: { kind: "key", code: "Semicolon" },
    key2p7: { kind: "key", code: "Slash" },
    sc2p_cw:  { kind: "key", code: "ShiftRight" },
    sc2p_ccw: null,
  };
  const KEYBINDINGS_LS = "cp.keybindings.v1";

  function cloneBindings(src) {
    const out = {};
    for (const id of PAD_IDS) out[id] = src[id] ? Object.assign({}, src[id]) : null;
    return out;
  }
  function loadKeybindings() {
    try {
      const raw = localStorage.getItem(KEYBINDINGS_LS);
      if (!raw) return cloneBindings(DEFAULT_BINDINGS);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return cloneBindings(DEFAULT_BINDINGS);
      const out = cloneBindings(DEFAULT_BINDINGS);
      for (const id of PAD_IDS) {
        if (Object.prototype.hasOwnProperty.call(parsed, id)) {
          out[id] = migrateBinding(parsed[id]) || null;
        }
      }
      return out;
    } catch (e) {
      return cloneBindings(DEFAULT_BINDINGS);
    }
  }
  function saveKeybindings() {
    try { localStorage.setItem(KEYBINDINGS_LS, JSON.stringify(keybindings)); } catch (e) {}
  }
  function bindingLabel(b) {
    if (!b) return "— unmapped —";
    if (b.kind === "key") return "⌨ " + (b.code || "?");
    const tag = "🎮[" + slotChar(b.slot || 0) + "] ";
    if (b.kind === "hid-bit") {
      return tag + "b" + b.byte + " 0x" + (b.mask || 0).toString(16).padStart(2, "0");
    }
    if (b.kind === "hid-axis") return tag + "b" + b.byte + " axis " + (b.dir === "+" ? "+" : "−");
    return "?";
  }
  // Old bindings (R8-25 pre-slot) carry vid/pid directly. Promote them to
  // model:slot=0 so single-device users keep working without re-binding.
  function migrateBinding(b) {
    if (!b || typeof b !== "object") return null;
    if (b.kind === "key") return b;
    if (b.kind === "hid-bit" || b.kind === "hid-axis") {
      if (b.model && typeof b.slot === "number") return b;
      if (b.vid != null && b.pid != null) {
        const vid = b.vid.toString(16).padStart(4, "0");
        const pid = b.pid.toString(16).padStart(4, "0");
        return Object.assign({}, b, { model: vid + ":" + pid, slot: 0 });
      }
      return null;
    }
    return b;
  }
  let keybindings = loadKeybindings();

  // ── HID device manager ──────────────────────────────────────────────
  // Holds all opened HID devices. Each entry tracks the previous report
  // bytes so we can compute press/release edges on the next frame.
  const hidDevices = new Map(); // device → { prev: Uint8Array }
  // ── Slot tracking — bindings reference (model, slot) instead of raw
  // (vid, pid) so that two physically identical controllers (same vid/pid)
  // can be distinguished. Slot is allocated per-model in attachment order
  // and survives a single session; cross-session order is dependent on OS
  // enumeration. The Swap button toggles a per-model swap flag to recover
  // when the OS order disagrees with the user's 1P/2P intent.
  // R8-26 — GLOBAL slot allocation. First HID device to attach gets [A],
  // second [B], etc. — regardless of vendor/model. Bindings store the slot
  // alongside the model so routing still verifies the device matches both,
  // but the slot label space is no longer per-model (which falsely produced
  // duplicate "[A]" when two different controllers were attached).
  const deviceSlot = new Map();   // device → global slot index (0-based)
  let hidStatusEl  = null;
  let hidSwapBtn   = null;
  function modelOf(d) {
    const vid = (d.vendorId || 0).toString(16).padStart(4, "0");
    const pid = (d.productId || 0).toString(16).padStart(4, "0");
    return vid + ":" + pid;
  }
  function logicalSlot(d) {
    return deviceSlot.has(d) ? deviceSlot.get(d) : -1;
  }
  function allocateSlot(d) {
    if (deviceSlot.has(d)) return;
    const used = new Set(deviceSlot.values());
    let slot = 0;
    while (used.has(slot)) slot++;
    deviceSlot.set(d, slot);
  }
  function freeSlot(d) {
    deviceSlot.delete(d);
  }
  function resolveBindingDevice(b) {
    if (!b || !b.model) return null;
    for (const [d, slot] of deviceSlot) {
      if (slot === b.slot && modelOf(d) === b.model) return d;
    }
    return null;
  }
  function slotChar(slot) { return "ABCDEF"[slot] || ("#" + slot); }

  function hidSupported() { return !!navigator.hid; }

  // Multi-collection HID devices (e.g. Phoenixwan exposes Keyboard +
  // Joystick + Mouse collections) appear as N HIDDevice objects from
  // getDevices(), one per collection. Only the collection(s) that actually
  // declare input reports will ever fire `inputreport` events — the empty
  // shells just hog slots. Filter on collections[].inputReports.length > 0
  // so a single physical Phoenixwan results in a single [A] chip, not [A][B][C].
  function deviceHasInputReports(d) {
    if (!d || !d.collections || !d.collections.length) return true;   // unknown shape, allow
    for (const c of d.collections) {
      if (c && c.inputReports && c.inputReports.length > 0) return true;
    }
    return false;
  }

  // IIDX uses at most 1P + 2P = 2 controllers. Cap accordingly — if user
  // tries to add a 3rd via Connect controller, silently refuse and let the
  // disabled Connect button + tooltip communicate the cap. User can ×-out
  // an existing device to free a slot.
  const HID_MAX_DEVICES = 2;
  async function attachHidDevice(d) {
    if (!d) return false;
    if (!deviceHasInputReports(d)) {
      dlog("DBG", "hid", "skip — no input reports", { name: d.productName, model: modelOf(d) });
      return false;
    }
    if (!hidDevices.has(d) && deviceSlot.size >= HID_MAX_DEVICES) {
      dlog("INFO", "hid", "refuse — at cap", { name: d.productName, model: modelOf(d) });
      return false;
    }
    try { if (!d.opened) await d.open(); } catch (e) {
      dlog("WARN", "hid", "open failed", { name: d.productName, msg: e && e.message });
      return false;
    }
    if (hidDevices.has(d)) return true;
    d.addEventListener("inputreport", onHidReport);
    hidDevices.set(d, { prev: new Uint8Array(0) });
    allocateSlot(d);
    dlog("INFO", "hid", "attach", {
      name: d.productName, model: modelOf(d), slot: deviceSlot.get(d),
    });
    updateHidStatus();
    refreshBindingsDisplay();
    return true;
  }
  async function autoAttachGrantedHid() {
    if (!hidSupported()) { updateHidStatus(); return; }
    try {
      const devs = await navigator.hid.getDevices();
      for (const d of devs) await attachHidDevice(d);
    } catch (e) {}
    updateHidStatus();
  }
  // OS-level device-change notification (Windows WM_DEVICECHANGE → Chrome
  // → WebHID). Fires for any device the user has previously granted —
  // first-time grants still require requestDevice() via the Rescan button.
  // With this listener, plugging the controller in mid-session (or after
  // the page loaded with it unplugged) auto-attaches without a reload.
  function detachHidDevice(d) {
    if (!hidDevices.has(d)) return;
    dlog("INFO", "hid", "detach", {
      name: d.productName, model: modelOf(d), slot: deviceSlot.get(d),
    });
    try { d.removeEventListener("inputreport", onHidReport); } catch (e) {}
    hidDevices.delete(d);
    freeSlot(d);
    updateHidStatus();
    refreshBindingsDisplay();
  }
  // User-initiated disconnect (× chip click). Closes the HID connection so
  // the device stops reporting AND frees its slot — browser permission is
  // kept, so a click on "Connect controller" later re-attaches without a
  // permission prompt. Session-scoped (no persistent ignore list — the
  // device would auto-reattach next session via getDevices, which matches
  // user expectation: "I want this gone for now, not forever").
  function userDisconnectHidDevice(d) {
    detachHidDevice(d);
    try { d.close(); } catch (e) {}
  }
  if (hidSupported() && !navigator.hid.__cpKeymapWatched) {
    navigator.hid.addEventListener("connect", function (e) {
      attachHidDevice(e.device);
    });
    navigator.hid.addEventListener("disconnect", function (e) {
      detachHidDevice(e.device);
    });
    navigator.hid.__cpKeymapWatched = true;
  }
  async function rescanHid() {
    if (!hidSupported()) {
      alert("WebHID is not supported in this browser. Use Chrome or Edge over HTTPS / localhost.");
      return;
    }
    try {
      const devs = await navigator.hid.requestDevice({ filters: [] });
      for (const d of devs) await attachHidDevice(d);
    } catch (e) {}
  }
  function updateHidStatus() {
    // Connect button state reflects cap, independent of pill presence.
    if (captureRescanBtn) {
      const atCap = deviceSlot.size >= HID_MAX_DEVICES;
      captureRescanBtn.disabled = atCap;
      captureRescanBtn.title = atCap
        ? "Max " + HID_MAX_DEVICES + " controllers — disconnect one to add another"
        : "Connect a HID controller";
    }
    if (!hidStatusEl) return;
    // Clear any prior chip children.
    while (hidStatusEl.firstChild) hidStatusEl.removeChild(hidStatusEl.firstChild);
    if (!hidSupported()) {
      hidStatusEl.textContent = "WebHID unavailable";
      hidStatusEl.dataset.state = "off";
      return;
    }
    const devices = Array.from(deviceSlot.keys())
      .sort(function (a, b) { return deviceSlot.get(a) - deviceSlot.get(b); });
    if (devices.length === 0) {
      hidStatusEl.textContent = "No controller — keyboard only";
      hidStatusEl.dataset.state = "off";
      return;
    }
    hidStatusEl.dataset.state = "on";
    // ● prefix
    const dot = document.createElement("span");
    dot.className = "cp-keymap__hid-dot";
    dot.textContent = "●";
    hidStatusEl.appendChild(dot);
    // One chip per device: "<name> [X] ×"
    devices.forEach(function (d, i) {
      const chip = document.createElement("span");
      chip.className = "cp-keymap__hid-chip";
      const name = d.productName || ("HID " + modelOf(d));
      const labelText = name + " [" + slotChar(deviceSlot.get(d)) + "]";
      const label = document.createElement("span");
      label.className = "cp-keymap__hid-chip-label";
      label.textContent = labelText;
      label.title = labelText;   // full name on hover when CSS ellipsis truncates
      chip.appendChild(label);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "cp-keymap__hid-chip-close";
      close.textContent = "×";
      close.title = "Disconnect this device (frees the slot; reconnect via Connect controller)";
      close.addEventListener("click", function (e) {
        e.stopPropagation();
        userDisconnectHidDevice(d);
      });
      chip.appendChild(close);
      hidStatusEl.appendChild(chip);
    });
  }
  function popcount(n) {
    n = (n & 0xff) - ((n >> 1) & 0x55);
    n = (n & 0x33) + ((n >> 2) & 0x33);
    return (n + (n >> 4)) & 0x0f;
  }
  function detectHidChange(dev, cur, prev, hint) {
    // hint = "axis" → caller is binding SC, prefer signed-byte interpretation.
    // hint = "bit"  → caller is binding a key, prefer bit-flip interpretation.
    // Both fall back to the other kind so an axis-style scratch button or a
    // bit-style key both still work.
    const model = modelOf(dev);
    const slot  = logicalSlot(dev);
    for (let i = 0; i < cur.length; i++) {
      const p = prev[i] || 0;
      const c = cur[i];
      if (p === c) continue;
      const signed = c > 127 ? c - 256 : c;
      const newBits = c & ~p;
      const newBitCount = popcount(newBits);
      const axisHit = c !== 0 && Math.abs(signed) >= 5;
      const bitHit  = newBits !== 0;
      if (hint === "axis") {
        if (axisHit) {
          return { kind: "hid-axis", model, slot,
                   byte: i, dir: signed > 0 ? "+" : "-", threshold: 5 };
        }
        if (bitHit) {
          const mask = newBits & -newBits;
          return { kind: "hid-bit", model, slot, byte: i, mask };
        }
      } else {
        if (bitHit && newBitCount <= 2) {
          const mask = newBits & -newBits;
          return { kind: "hid-bit", model, slot, byte: i, mask };
        }
        if (axisHit) {
          return { kind: "hid-axis", model, slot,
                   byte: i, dir: signed > 0 ? "+" : "-", threshold: 5 };
        }
      }
    }
    return null;
  }
  function bindingPressedFor(b, byteArr) {
    if (!b) return false;
    if (b.kind === "hid-bit") {
      const v = byteArr[b.byte] || 0;
      return (v & (b.mask || 0)) !== 0;
    }
    if (b.kind === "hid-axis") {
      const v = byteArr[b.byte] || 0;
      const signed = v > 127 ? v - 256 : v;
      const t = b.threshold || 5;
      return b.dir === "+" ? signed >= t : signed <= -t;
    }
    return false;
  }

  // ── Capture state ───────────────────────────────────────────────────
  // captureState.active flips the modal into "next input wins" mode. The
  // overlay is shown over the body until either a key, an HID change, or
  // Esc is pressed.
  const captureState = {
    active: false,
    padId: null,
    hint: "bit",
    keyHandler: null,
  };
  // Per-lane reference count so SC↻ + SC↺ sharing one lane don't blink off
  // when only one direction releases. Also used by keyboard dispatch so
  // multiple codes can map to the same lane safely.
  const lanePressCount = new Array(16).fill(0);
  function resetLanePressCounts() {
    for (let i = 0; i < lanePressCount.length; i++) lanePressCount[i] = 0;
  }
  // r11 Phase 4 — release every currently-held lane on the view AND zero
  // the host-side counts. Used before mutations that change the binding
  // map (swap1P2P, finishCapture) so a key/HID input held during the
  // mutation doesn't leave a lane logically stuck. After this call any
  // subsequent release for that input is routed through the NEW map and
  // bindingRelease's early-return on count === 0 keeps the renderer from
  // seeing a release it never matched with a press.
  function forceReleaseAllLanes() {
    if (!view) { resetLanePressCounts(); return; }
    let releasedAny = false;
    for (let lane = 0; lane < lanePressCount.length; lane++) {
      if (lanePressCount[lane] <= 0) continue;
      lanePressCount[lane] = 0;
      if (view.setLanePressed) view.setLanePressed(lane, false);
      if (view.releaseLane)    view.releaseLane(lane);
      releasedAny = true;
    }
    if (releasedAny) dlog("DBG", "bindings", "force-release on rebind");
  }
  function bindingPress(lane) {
    if (!view) return;
    lanePressCount[lane] = (lanePressCount[lane] || 0) + 1;
    if (lanePressCount[lane] === 1 && view.setLanePressed) view.setLanePressed(lane, true);
    if (view.isPlaying && view.isPlaying() && view.pressLane) view.pressLane(lane);
  }
  function bindingRelease(lane) {
    if (!view) return;
    if (!lanePressCount[lane]) return;
    lanePressCount[lane]--;
    if (lanePressCount[lane] === 0) {
      if (view.setLanePressed) view.setLanePressed(lane, false);
      if (view.releaseLane) view.releaseLane(lane);
    }
  }
  function buildKeyMapForMode(mode) {
    const isDP = mode === "DP";
    const out = {};
    for (const id of PAD_IDS) {
      if (!isDP && id.indexOf("2p") !== -1) continue;
      const b = keybindings[id];
      if (!b || b.kind !== "key") continue;
      const lane = PAD_LANE[id];
      if (!out[b.code]) out[b.code] = [];
      out[b.code].push(lane);
    }
    return out;
  }

  // R8-26 — Swap = 1P ↔ 2P keymap content swap. Works for any input kind
  // (keyboard, HID, mixed): we just exchange the binding objects between
  // each matched pad pair (sc1p_cw↔sc2p_cw, sc1p_ccw↔sc2p_ccw, key1pN↔key2pN).
  // Also covers the "two identical controllers, OS enumeration flipped"
  // case implicitly — swapping the bindings ends up routing 1P pads to the
  // physical device the user actually treats as 1P.
  function swap1P2P() {
    // r11 Phase 4 — release any held lanes BEFORE the mapping flips so a
    // physical input held during the swap doesn't leave its old lane
    // stuck.
    forceReleaseAllLanes();
    const seen = new Set();
    for (const id of PAD_IDS) {
      if (seen.has(id)) continue;
      const pair = id.replace("1p", "2p");
      if (pair === id || !Object.prototype.hasOwnProperty.call(PAD_LANE, pair)) continue;
      const tmp = keybindings[id];
      keybindings[id] = keybindings[pair];
      keybindings[pair] = tmp;
      seen.add(id); seen.add(pair);
    }
    saveKeybindings();
    dlog("INFO", "bindings", "swap 1P↔2P");
    refreshBindingsDisplay();
    if (view && view.timeline) {
      currentKeyMap = buildKeyMapForMode(view.timeline.mode);
    }
  }

  function resetStats() {
    // r12.3 — Fast/Slow counters reset with the rest of the stats.
    counts = { PG: 0, G: 0, Good: 0, Bad: 0, Miss: 0, Fast: 0, Slow: 0 };
    combo = 0;
    maxCombo = 0;
    renderStats();
    hideJudgment();
  }
  function renderStats() {
    // Phase B — score moved to the key zone strip. Renderer owns those
    // DOM nodes; we just push the latest values.
    if (view && view.setStats) {
      view.setStats({
        combo,
        PG: counts.PG, G: counts.G, Good: counts.Good, Bad: counts.Bad, Miss: counts.Miss,
        Fast: counts.Fast, Slow: counts.Slow,
      });
    }
    // Backwards-compat — if the legacy in-controls span still exists,
    // mirror to it (it's display:none now but harmless).
    if (comboEl) {
      comboEl.textContent = "combo " + combo;
      comboEl.classList.toggle("is-zero", combo === 0);
    }
    if (countsEl) {
      countsEl.innerHTML = JUDGMENT_TYPES
        .map(t => `<span class="ct-${t}">${t} ${counts[t]}</span>`)
        .join(" · ");
    }
  }
  // R8-12: match the indicator strip — spell out PG/G as PGREAT/GREAT.
  const POPUP_LABELS = { PG: "PGREAT", G: "GREAT", Good: "GOOD", Bad: "BAD", Miss: "MISS" };
  function flashJudgment(type, deltaMs) {
    if (!judgmentEl) return;
    // R8-8: split into label + ±ms sub-label. The sub-label is absolutely
    // positioned at the bottom-right of the verdict text via CSS so the
    // verdict stays the visual anchor.
    const sign = (deltaMs != null && deltaMs > 0) ? "+" : "";
    const deltaText = deltaMs == null ? "" : (sign + deltaMs + "ms");
    const labelText = POPUP_LABELS[type] || type;
    judgmentEl.innerHTML =
      '<span class="cp-judgment__label">' + labelText + '</span>' +
      (deltaText ? '<span class="cp-judgment__delta">' + deltaText + '</span>' : '');
    JUDGMENT_TYPES.forEach(t => judgmentEl.classList.remove("ct-" + t));
    judgmentEl.classList.add("ct-" + type);
    // Restart animation: remove class, force reflow, re-add.
    judgmentEl.classList.remove("is-flash");
    void judgmentEl.offsetWidth;
    judgmentEl.classList.add("is-flash");
    if (judgmentFadeTimer) clearTimeout(judgmentFadeTimer);
    judgmentFadeTimer = setTimeout(() => {
      judgmentEl.classList.remove("is-flash");
    }, 180);
  }

  // R8-8: anchor the popup to the SCRATCH~KEY lane center (not the cp-field
  // center) and 70 px above the judgment line. cp-field also includes the
  // SP left rail (measure marker column), which threw centering off to the
  // right; getLaneCenterPx() returns the x-center of just the playable lanes
  // in canvas CSS pixels, which equal the cp-field__canvas DOM pixels.
  function positionJudgment() {
    if (!judgmentEl || !dialog || !view) return;
    const canvas = dialog.querySelector(".cp-field__canvas");
    const bodyEl = dialog.querySelector(".cp-body");
    if (!canvas || !bodyEl) return;
    const cr = canvas.getBoundingClientRect();
    const br = bodyEl.getBoundingClientRect();
    if (cr.width === 0) return;
    const laneCx = (view.getLaneCenterPx ? view.getLaneCenterPx() : cr.width / 2);
    judgmentEl.style.left = (cr.left - br.left + laneCx) + "px";
    // Y — popup sits POPUP_BASE_GAP (30) + slider extra above the judgment
    // line. Compute the line's screen y directly from the canvas rect so
    // both SP and DP (which have different keyzone reservations and, in
    // DP's case, a bottom panel between canvas and cp-body bottom) land
    // correctly without hardcoded layout magic.
    // R11 Phase 1 — keyzone heights sourced from existing :root vars
    // --cp-keyzone-h (SP) and --cp-keyzone-h-dp (DP). bodyEl is in the
    // document tree under :root so getComputedStyle reads the cascaded
    // value. Use isFinite (not `||`) so a legitimate 0px override is
    // honoured instead of falling back to the boot default.
    const mode = (view.timeline && view.timeline.mode) || "SP";
    const kzVar = (mode === "DP") ? "--cp-keyzone-h-dp" : "--cp-keyzone-h";
    const kzRaw = parseFloat(getComputedStyle(bodyEl).getPropertyValue(kzVar));
    const kzCanvas = isFinite(kzRaw) ? kzRaw : ((mode === "DP") ? 3 : 135);
    const lineLift = (fxSettings && fxSettings.lineOffset) || 0;
    const POPUP_BASE_GAP = 30;
    const extra = (fxSettings && fxSettings.judgmentPopupOffset != null)
      ? fxSettings.judgmentPopupOffset : 0;
    const judgmentScreenY = cr.bottom - kzCanvas - lineLift;
    const popupScreenY    = judgmentScreenY - POPUP_BASE_GAP - extra;
    judgmentEl.style.bottom = (br.bottom - popupScreenY) + "px";
  }
  let judgmentResizeBound = false;
  function bindJudgmentResize() {
    if (judgmentResizeBound) return;
    judgmentResizeBound = true;
    window.addEventListener("resize", function () {
      positionJudgment();
      positionLoopCountdown();
    });
  }

  // R8-10: cinematic loop standby countdown. Renderer fires onLoopWrap on
  // every wrap with { holdMs }; if standby > Instant we paint a numeral
  // (ceil(remaining / 1000)) inside a circular progress ring centred over
  // the play canvas. Driven by a chart-preview-owned rAF so updates stay
  // smooth even though the renderer's transport is paused during stage 1.
  const LOOP_COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * 46;
  let countdownRAF = 0;
  let countdownStartTs = 0;
  let countdownTotalMs = 0;
  let countdownDelayTimer = null;
  function positionLoopCountdown() {
    if (!loopCountdownEl || !dialog || !view) return;
    const canvas = dialog.querySelector(".cp-field__canvas");
    const bodyEl = dialog.querySelector(".cp-body");
    if (!canvas || !bodyEl) return;
    const cr = canvas.getBoundingClientRect();
    const br = bodyEl.getBoundingClientRect();
    if (cr.width === 0) return;
    const laneCx = view.getLaneCenterPx ? view.getLaneCenterPx() : cr.width / 2;
    loopCountdownEl.style.left = (cr.left - br.left + laneCx) + "px";
  }
  function startLoopCountdown(holdMs) {
    if (!loopCountdownEl) return;
    // Strip the 250 ms Instant decoder grace from the countdown — that's a
    // silent ramp owned by the renderer. Anything ≤ grace ⇒ no countdown.
    const visibleMs = holdMs - LOOP_STANDBY_INSTANT_MS;
    if (visibleMs <= 0) return;
    if (countdownDelayTimer) clearTimeout(countdownDelayTimer);
    // Delay show by the grace window so the ring appears starting at FULL
    // for a clean ceil(visibleMs/1000) opening (matches the user picking
    // "1 s" → seeing the ring fill exactly one full second before audio).
    countdownDelayTimer = setTimeout(function () {
      countdownDelayTimer = null;
      countdownTotalMs = visibleMs;
      countdownStartTs = performance.now();
      // Reset visual state — prior wrap's drained offset would otherwise
      // bleed into the first paint (ring shows already-empty before rAF runs).
      if (loopCountdownFgEl) loopCountdownFgEl.style.strokeDashoffset = "0";
      if (loopCountdownNumEl) loopCountdownNumEl.textContent = String(Math.ceil(visibleMs / 1000));
      positionLoopCountdown();
      loopCountdownEl.hidden = false;
      if (countdownRAF) cancelAnimationFrame(countdownRAF);
      countdownRAF = requestAnimationFrame(stepLoopCountdown);
    }, LOOP_STANDBY_INSTANT_MS);
  }
  function stepLoopCountdown(ts) {
    countdownRAF = 0;
    if (!loopCountdownEl || loopCountdownEl.hidden) return;
    const elapsed = ts - countdownStartTs;
    const remaining = countdownTotalMs - elapsed;
    if (remaining <= 0) { hideLoopCountdown(); return; }
    const sec = Math.ceil(remaining / 1000);
    // Per-second progress: ring resets to full at the start of each second
    // (movie countdown convention) and drains to 0 by end of that second.
    const inSec = remaining - (sec - 1) * 1000;
    const secProgress = Math.max(0, Math.min(1, inSec / 1000));
    if (loopCountdownNumEl) loopCountdownNumEl.textContent = String(sec);
    if (loopCountdownFgEl) {
      loopCountdownFgEl.style.strokeDashoffset =
        ((1 - secProgress) * LOOP_COUNTDOWN_CIRCUMFERENCE).toFixed(2);
    }
    countdownRAF = requestAnimationFrame(stepLoopCountdown);
  }
  function hideLoopCountdown() {
    if (countdownDelayTimer) { clearTimeout(countdownDelayTimer); countdownDelayTimer = null; }
    if (countdownRAF) cancelAnimationFrame(countdownRAF);
    countdownRAF = 0;
    if (loopCountdownEl) loopCountdownEl.hidden = true;
  }

  // R8-15 / R8-16 — lane-mod gear config modal.
  //   RANDOM     : chip strip (drag-reorderable) + Re-roll;
  //                textbox + Apply (empty textbox ⇒ use chip strip's order).
  //   R-RANDOM   : chip strip (read-only display) + Re-roll;
  //                cp-numbox (text + ▲▼) + Apply.
  // All buttons inline next to their input — no separate bottom action row.
  function sideStartFor(side) { return side === "2p" ? 8 : 1; }
  function setLanemodConfigError(msg) {
    if (!lanemodConfigBody) return;
    const el = lanemodConfigBody.querySelector("[data-cp-lanemod-config-error]");
    if (el) el.textContent = msg || "";
  }
  function chartPermFromUserNumbers(nums, sideStart) {
    return nums.map(function (n) { return n + (sideStart - 1); });
  }
  function userNumbersFromChartPerm(chartPerm, sideStart) {
    return chartPerm.map(function (cl) { return cl - (sideStart - 1); });
  }
  function currentUserPerm() {
    if (!view || !view.getLaneMapping || !lanemodConfigCtx) return [1,2,3,4,5,6,7];
    return userNumbersFromChartPerm(
      view.getLaneMapping(lanemodConfigCtx.side),
      sideStartFor(lanemodConfigCtx.side)
    );
  }
  function readChipsAsUserNumbers() {
    if (!lanemodConfigBody) return [];
    return Array.from(lanemodConfigBody.querySelectorAll("[data-cp-lanemod-config-chip]"))
      .map(function (c) { return parseInt(c.getAttribute("data-val"), 10); });
  }
  function applyUserPerm(userNums) {
    if (!view || !view.setLaneMapping || !lanemodConfigCtx) return false;
    const chartPerm = chartPermFromUserNumbers(userNums, sideStartFor(lanemodConfigCtx.side));
    return view.setLaneMapping(lanemodConfigCtx.side, chartPerm);
  }
  function renderChips(container, userNums, draggable) {
    container.innerHTML = "";
    userNums.forEach(function (n) {
      const chip = document.createElement("span");
      chip.className = "cp-lanemod-config-chip" + (draggable ? "" : " cp-lanemod-config-chip--readonly");
      chip.setAttribute("data-cp-lanemod-config-chip", "");
      chip.setAttribute("data-val", String(n));
      chip.textContent = String(n);
      if (draggable) chip.setAttribute("draggable", "true");
      container.appendChild(chip);
    });
    if (draggable) container.classList.remove("cp-lanemod-config-chips--locked");
    else container.classList.add("cp-lanemod-config-chips--locked");
  }
  function wireChipDrag(container) {
    let dragSrc = null;
    container.addEventListener("dragstart", function (e) {
      const t = e.target.closest && e.target.closest("[data-cp-lanemod-config-chip]");
      if (!t) return;
      dragSrc = t;
      t.classList.add("is-dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); } catch (er) {}
    });
    container.addEventListener("dragend", function () {
      if (dragSrc) dragSrc.classList.remove("is-dragging");
      // Commit new order immediately on drop release.
      const nums = readChipsAsUserNumbers();
      if (nums.length === 7) applyUserPerm(nums);
      dragSrc = null;
    });
    container.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (!dragSrc) return;
      const over = e.target.closest && e.target.closest("[data-cp-lanemod-config-chip]");
      if (!over || over === dragSrc) return;
      const rect = over.getBoundingClientRect();
      const after = (e.clientX - rect.left) > rect.width / 2;
      const next = after ? over.nextElementSibling : over;
      if (next !== dragSrc) container.insertBefore(dragSrc, next);
    });
  }
  function renderLanemodConfigBody() {
    if (!lanemodConfigBody || !lanemodConfigCtx) return;
    const isRandom = lanemodConfigCtx.modType === "random";
    const perm = currentUserPerm();
    if (isRandom) {
      lanemodConfigBody.innerHTML =
        '<div class="cp-lanemod-config-row">' +
        '<div class="cp-lanemod-config-chips" data-cp-lanemod-config-chips></div>' +
        '<button type="button" class="cp-lanemod-config-btn" data-cp-lanemod-config-reroll>Re-roll</button>' +
        '</div>' +
        '<div class="cp-lanemod-config-row">' +
        '<input type="text" class="cp-lanemod-config-input" data-cp-lanemod-config-input maxlength="7" placeholder="e.g. 4725163">' +
        '<button type="button" class="cp-lanemod-config-btn" data-cp-lanemod-config-apply>Apply</button>' +
        '</div>' +
        '<div class="cp-lanemod-config-error" data-cp-lanemod-config-error></div>';
      const chipsEl = lanemodConfigBody.querySelector("[data-cp-lanemod-config-chips]");
      renderChips(chipsEl, perm, true);
      wireChipDrag(chipsEl);
    } else {
      // R-RANDOM — single row: ◄ [chips] ► [Re-roll]. Chevrons cycle shift
      // 1↔6 wrap and apply immediately; chip strip is pure display.
      lanemodConfigBody.innerHTML =
        '<div class="cp-lanemod-config-row">' +
        '<button type="button" class="cp-lanemod-config-chev" data-cp-lanemod-config-step="-1" aria-label="Shift left">◄</button>' +
        '<div class="cp-lanemod-config-chips" data-cp-lanemod-config-chips></div>' +
        '<button type="button" class="cp-lanemod-config-chev" data-cp-lanemod-config-step="+1" aria-label="Shift right">►</button>' +
        '<button type="button" class="cp-lanemod-config-btn" data-cp-lanemod-config-reroll>Re-roll</button>' +
        '</div>' +
        '<div class="cp-lanemod-config-error" data-cp-lanemod-config-error></div>';
      const chipsEl = lanemodConfigBody.querySelector("[data-cp-lanemod-config-chips]");
      renderChips(chipsEl, perm, false);
      // Seed the modal-side shift tracker from current perm (perm[0] - 1).
      const s = perm[0] - 1;
      lanemodConfigCtx.rrandomShift = (s >= 1 && s <= 6) ? s : 1;
      lanemodConfigBody.querySelectorAll("[data-cp-lanemod-config-step]").forEach(function (b) {
        b.addEventListener("click", function () {
          const delta = parseInt(b.getAttribute("data-cp-lanemod-config-step"), 10) || 0;
          let next = lanemodConfigCtx.rrandomShift + delta;
          if (next < 1) next = 6;
          if (next > 6) next = 1;
          lanemodConfigCtx.rrandomShift = next;
          const base = [1,2,3,4,5,6,7];
          const shifted = base.slice(next).concat(base.slice(0, next));
          applyUserPerm(shifted);
          renderChips(chipsEl, currentUserPerm(), false);
        });
      });
    }
    // Wire Re-roll.
    const rerollBtn = lanemodConfigBody.querySelector("[data-cp-lanemod-config-reroll]");
    if (rerollBtn) {
      rerollBtn.addEventListener("click", function () {
        if (!view || !view.rerollLaneMapping) return;
        const ok = view.rerollLaneMapping(lanemodConfigCtx.side);
        if (!ok) { setLanemodConfigError("Cannot re-roll this mod type."); return; }
        setLanemodConfigError("");
        // Refresh chip strip to reflect new perm.
        const chipsEl = lanemodConfigBody.querySelector("[data-cp-lanemod-config-chips]");
        if (chipsEl) {
          renderChips(chipsEl, currentUserPerm(), lanemodConfigCtx.modType === "random");
          if (lanemodConfigCtx.modType === "random") wireChipDrag(chipsEl);
        }
      });
    }
    // Wire Apply (RANDOM only — R-RANDOM applies inline via chevrons).
    if (lanemodConfigCtx.modType === "random") {
      const applyBtn = lanemodConfigBody.querySelector("[data-cp-lanemod-config-apply]");
      const input    = lanemodConfigBody.querySelector("[data-cp-lanemod-config-input]");
      if (input) {
        input.addEventListener("input", function () {
          input.value = input.value.replace(/[^1-7]/g, "").slice(0, 7);
        });
      }
      if (applyBtn) {
        applyBtn.addEventListener("click", function () {
          if (!view || !view.setLaneMapping || !input) return;
          const raw = (input.value || "").trim();
          // Empty ⇒ apply the chips' current order (no-op if unchanged).
          let userNums;
          if (raw === "") {
            userNums = readChipsAsUserNumbers();
          } else {
            const compact = raw.replace(/\s+/g, "");
            if (!/^[1-7]{7}$/.test(compact)) {
              setLanemodConfigError("7 digits, each in 1–7 (e.g. 4725163).");
              return;
            }
            const parts = compact.split("").map(function (c) { return parseInt(c, 10); });
            if (new Set(parts).size !== 7) {
              setLanemodConfigError("Each digit must appear exactly once.");
              return;
            }
            userNums = parts;
          }
          const ok = applyUserPerm(userNums);
          if (!ok) { setLanemodConfigError("Permutation rejected."); return; }
          setLanemodConfigError("");
          input.value = "";
          const chipsEl = lanemodConfigBody.querySelector("[data-cp-lanemod-config-chips]");
          if (chipsEl) { renderChips(chipsEl, currentUserPerm(), true); wireChipDrag(chipsEl); }
        });
      }
    }
  }
  function openLanemodConfig(req) {
    if (!view || !lanemodConfigModal) return;
    if (!req || (req.modType !== "random" && req.modType !== "r-random")) return;
    lanemodConfigCtx = { side: req.side || "1p", modType: req.modType };
    const isDp = view.timeline && view.timeline.mode === "DP";
    const sideLabel = isDp ? (lanemodConfigCtx.side === "2p" ? "2P " : "1P ") : "";
    const modLabel  = (lanemodConfigCtx.modType === "random") ? "RANDOM" : "R-RANDOM";
    if (lanemodConfigTitle) lanemodConfigTitle.textContent = sideLabel + modLabel + " Configuration";
    renderLanemodConfigBody();
    try { lanemodConfigModal.showModal(); } catch (e) { /* already open */ }
  }
  if (lanemodConfigClose) {
    lanemodConfigClose.addEventListener("click", function () { lanemodConfigModal.close(); });
  }
  function hideJudgment() {
    if (judgmentEl) judgmentEl.classList.remove("is-flash");
    if (judgmentFadeTimer) { clearTimeout(judgmentFadeTimer); judgmentFadeTimer = null; }
  }
  function handleJudgment(j) {
    if (!(j.type in counts)) return;
    counts[j.type] += 1;
    if (j.type === "Bad" || j.type === "Miss") {
      combo = 0;
    } else {
      combo++;
      if (combo > maxCombo) maxCombo = combo;
    }
    // r12.3 — Fast/Slow tally. deltaMs sign: positive = early (FAST),
    // negative = late (SLOW). Miss has null deltaMs and contributes to
    // neither. deltaMs === 0 is "exact" and contributes to neither either.
    // PG (PGREAT) is excluded — already inside the tightest window, so
    // its fast/slow micro-tilt is noise rather than actionable feedback.
    if (j.type !== "PG" && typeof j.deltaMs === "number") {
      if (j.deltaMs > 0)      counts.Fast += 1;
      else if (j.deltaMs < 0) counts.Slow += 1;
    }
    renderStats();
    flashJudgment(j.type, j.deltaMs);
  }

  function setKeyHint(mode) {
    if (!keyhintEl) return;
    if (mode === "DP") {
      keyhintEl.textContent =
        "1P: LSHIFT  Z S X D C F V  ·  2P: M K , L . ; /  RSHIFT";
    } else {
      keyhintEl.textContent = "LSHIFT  Z S X D C F V";
    }
  }

  let view = null;
  let clockTimer = null;
  let currentRow = null;

  function fmtT(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec.toFixed(1);
  }
  function updateClock() {
    if (!view) return;
    const st = view.getState();
    const t = view.timeline;
    const meas = view.getMeasures();
    const mIdx = st.activeIdx >= 0 && st.activeIdx < meas.length
      ? "m" + meas[st.activeIdx].idx : "—";
    clockEl.textContent = fmtT(st.currentSec) + " / " + fmtT(t.total_sec) + "  (" + mIdx + ")";
    if (progressEl && !progressDragging) {
      // Keep slider tracking the audio clock while not being scrubbed.
      progressEl.value = String(st.currentSec || 0);
    }
    if (progressTimeEl) {
      progressTimeEl.innerHTML =
        '<span class="cp-progress__cur">' + fmtT(st.currentSec)
        + '</span><span class="cp-progress__tot"> / ' + fmtT(t.total_sec) + '</span>';
    }
  }

  // ── Sync scrubber state ─────────────────────────────────────────────
  // Drag protocol: pointerdown pauses (stashing wasPlaying), input events
  // call view.seekToSec which only touches the audio clock when audio is
  // currently playing — during drag we're paused, so it's pure visual.
  // pointerup resumes from the new sec via play()'s built-in audio sync.
  let progressDragging = false;
  let progressWasPlaying = false;

  // Per-measure dual density sparkline (notes above, scratch below the slider).
  // Tone matches the page palette: cyan (calm) → gold (attention) → red
  // (urgency). These three are already accent tokens (--cp-cyan/--cp-gold/
  // --cp-red) so the bar feels native instead of a foreign matplotlib LUT.
  function toneMap(v) {
    v = Math.max(0, Math.min(1, v));
    let r, g, b;
    if (v < 0.5) {
      const t = v * 2;                       // cyan #34e0ff → gold #ffd23f
      r = Math.round(0x34 + (0xff - 0x34) * t);
      g = Math.round(0xe0 + (0xd2 - 0xe0) * t);
      b = Math.round(0xff + (0x3f - 0xff) * t);
    } else {
      const t = (v - 0.5) * 2;               // gold #ffd23f → red #ff3344
      r = 0xff;
      g = Math.round(0xd2 + (0x33 - 0xd2) * t);
      b = Math.round(0x3f + (0x44 - 0x3f) * t);
    }
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  let densityData = null;     // { measures, totalSec, perMeasureNotes, perMeasureScratch, maxNotes, maxScratch }
  let densityResizeObs = null;
  function scratchLanesForMode(mode) {
    // SP: lane 0 = LShift scratch. DP: lane 0 (1P SC) + lane 15 (2P SC).
    return mode === "DP" ? new Set([0, 15]) : new Set([0]);
  }
  function buildDensityData(v) {
    if (!v || !v.getMeasures || !v.timeline) return null;
    const measures = v.getMeasures();
    const rawNotes = v.timeline.notes || [];
    const totalSec = v.timeline.total_sec || (measures.length ? measures[measures.length - 1].end_sec : 0);
    if (measures.length === 0 || totalSec <= 0) return null;
    const scratchLanes = scratchLanesForMode(v.timeline.mode);
    const perMeasureNotes   = new Array(measures.length).fill(0);
    const perMeasureScratch = new Array(measures.length).fill(0);
    for (let k = 0; k < rawNotes.length; k++) {
      const n = rawNotes[k];
      const lane = n[0];
      const sec = n[1];
      let lo = 0, hi = measures.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const m = measures[mid];
        if (sec < m.start_sec) hi = mid - 1;
        else if (sec >= m.end_sec) lo = mid + 1;
        else {
          if (scratchLanes.has(lane)) perMeasureScratch[mid]++;
          else perMeasureNotes[mid]++;
          break;
        }
      }
    }
    let maxNotes = 1, maxScratch = 1;
    for (let i = 0; i < measures.length; i++) {
      if (perMeasureNotes[i]   > maxNotes)   maxNotes   = perMeasureNotes[i];
      if (perMeasureScratch[i] > maxScratch) maxScratch = perMeasureScratch[i];
    }
    return { measures, totalSec, perMeasureNotes, perMeasureScratch, maxNotes, maxScratch };
  }
  // R8-26 — slider thumb is 14 px diameter, centered on value position.
  // At value=0 the thumb spans x=0..14 in CSS. If density measure 0 starts
  // at x=7 (thumb center), the cyan thumb visually merges with the first
  // measure rect (especially when measure 0 is low-intensity cyan). Inset
  // by the FULL diameter (14) so the first measure rect starts AT the
  // thumb's right edge — visually separate. Same inset on the right keeps
  // the last measure away from the thumb at value=max.
  const DENSITY_SLIDER_THUMB_R = 14;   // matches --cp-thumb diameter
  function drawDensityPanel(canvas, counts /*, anchor (unused) */) {
    // Heatmap line: a thin horizontal strip parallel to the slider, per-measure
    // segments coloured by intensity. Empty measures stay transparent.
    if (!canvas || !densityData) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW < 1 || cssH < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    canvas.width = bw;
    canvas.height = bh;
    const ctx = canvas.getContext("2d");
    // R8-26: draw in BACKING-pixel space (no setTransform). This guarantees
    // every fillRect snaps to integer device pixels — even on dpr=1.25/1.5
    // (Windows scaling) where CSS-integer coordinates become fractional
    // device pixels and the browser antialiased the seam between adjacent
    // measure rects into a faint blur.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    const { measures, totalSec } = densityData;
    let maxCount = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > maxCount) maxCount = counts[i];
    }
    if (maxCount <= 0) return;
    // Effective track range in BACKING pixels — slider thumb sits centered at
    // value=0 with its left edge at x=0, so the time-axis origin is at x=r.
    const r = Math.round(DENSITY_SLIDER_THUMB_R * dpr);
    const trackStart = r;
    const trackW = Math.max(1, bw - 2 * r);
    const xs = new Array(measures.length + 1);
    for (let i = 0; i < measures.length; i++) {
      xs[i] = trackStart + Math.round((measures[i].start_sec / totalSec) * trackW);
    }
    const lastEnd = measures.length ? measures[measures.length - 1].end_sec : 0;
    xs[measures.length] = trackStart + Math.round((lastEnd / totalSec) * trackW);
    for (let i = 0; i < measures.length; i++) {
      const c = counts[i];
      if (c <= 0) continue;
      const intensity = c / maxCount;
      const x = xs[i];
      // R8-26: subtract 1 backing px so adjacent rects have a thin dark
      // sliver between them (~0.5-0.7 CSS px depending on dpr). Breaks the
      // complementary-color illusion when e.g. cyan + red measures sit
      // back-to-back. Narrow measures clamp to min width 1.
      const w = Math.max(1, xs[i + 1] - x - 1);
      ctx.fillStyle = toneMap(intensity);
      ctx.fillRect(x, 0, w, bh);
    }
  }
  function drawDensity() {
    if (!densityData) return;
    // Notes panel sits ABOVE the slider — anchor bars to the bottom so they
    // grow toward the slider (tall = busy). Scratch panel sits BELOW —
    // anchor bars to the top so they grow away from the slider downward.
    drawDensityPanel(densityNotesEl,   densityData.perMeasureNotes,   "bottom");
    drawDensityPanel(densityScratchEl, densityData.perMeasureScratch, "top");
  }
  function setupDensityForView(v) {
    densityData = buildDensityData(v);
    if (!densityData) return;
    drawDensity();
    if (typeof ResizeObserver !== "undefined") {
      if (densityResizeObs) { try { densityResizeObs.disconnect(); } catch (e) {} }
      densityResizeObs = new ResizeObserver(drawDensity);
      if (densityNotesEl)   densityResizeObs.observe(densityNotesEl);
      if (densityScratchEl) densityResizeObs.observe(densityScratchEl);
    }
  }
  function teardownDensity() {
    if (densityResizeObs) { try { densityResizeObs.disconnect(); } catch (e) {} densityResizeObs = null; }
    densityData = null;
    for (const el of [densityNotesEl, densityScratchEl]) {
      if (!el) continue;
      const ctx = el.getContext("2d");
      ctx && ctx.clearRect(0, 0, el.width, el.height);
    }
  }

  // Slider-side loop indicator + drag handles. Mirrors the queue's loop band
  // on the progress slider so the user has a second drag surface and a
  // location preview without scrolling the queue.
  // The slider's thumb is inset by thumb_width/2 at each end (so the thumb
  // stays in-bounds at sec=0 and sec=max). Loop band must use the same
  // inset to stay perfectly centred against the thumb.
  function thumbHalfWidth() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--cp-thumb");
    const v = parseFloat(raw);
    return (isFinite(v) && v > 0 ? v : 14) / 2;
  }
  function updateLoopBand(loop) {
    if (!progressLoopEl) return;
    if (!loop || !progressEl) { progressLoopEl.hidden = true; return; }
    const total = parseFloat(progressEl.max);
    if (!isFinite(total) || total <= 0) { progressLoopEl.hidden = true; return; }
    const bar = progressLoopEl.parentElement;          // cp-progress__bar
    const barW = bar ? bar.clientWidth : 0;
    if (barW < 1) { progressLoopEl.hidden = true; return; }
    const inset = thumbHalfWidth();
    const trackW = Math.max(1, barW - inset * 2);
    const leftPx  = inset + (loop.startSec / total) * trackW;
    const widthPx = Math.max(4, ((loop.endSec - loop.startSec) / total) * trackW);
    progressLoopEl.style.left = leftPx + "px";
    progressLoopEl.style.width = widthPx + "px";
    progressLoopEl.hidden = false;
  }
  function bindLoopHandle(handle, which) {
    if (!handle) return;
    let pointerId = null;
    handle.addEventListener("pointerdown", function (e) {
      if (!view || !view.getLoop) return;
      const loop = view.getLoop();
      if (!loop) return;
      pointerId = e.pointerId;
      try { handle.setPointerCapture(pointerId); } catch (er) {}
      e.preventDefault();
      e.stopPropagation();
    });
    handle.addEventListener("pointermove", function (e) {
      if (pointerId === null || !view || !view.setLoopState) return;
      const bar = progressLoopEl && progressLoopEl.parentElement;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const total = parseFloat(progressEl.max);
      if (!isFinite(total) || total <= 0 || rect.width < 1) return;
      const inset = thumbHalfWidth();
      const trackW = Math.max(1, rect.width - inset * 2);
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - inset) / trackW));
      const sec = ratio * total;
      const loop = view.getLoop();
      if (!loop) return;
      if (which === "start") view.setLoopState(sec, loop.endSec);
      else                   view.setLoopState(loop.startSec, sec);
    });
    function release() {
      if (pointerId !== null) { try { handle.releasePointerCapture(pointerId); } catch (er) {} }
      pointerId = null;
    }
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
  }
  bindLoopHandle(progressLoopStartEl, "start");
  bindLoopHandle(progressLoopEndEl,   "end");

  function teardownView() {
    if (view) {
      if (view.destroy) view.destroy();
      else view.pause();
      view = null;
    }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    host.innerHTML = "";
    currentKeyMap = null;
    resetLanePressCounts();
    resetStats();
    teardownDensity();
    if (progressLoopEl) progressLoopEl.hidden = true;
    if (keyhintEl) keyhintEl.textContent = "";
    if (progressEl) {
      progressEl.max = "0";
      progressEl.value = "0";
      progressEl.disabled = true;
    }
    if (progressTimeEl) progressTimeEl.textContent = "0:00.0 / 0:00.0";
    progressDragging = false;
    progressWasPlaying = false;
    showEmpty(true);   // PORT_FIXUPS #4
  }

  function _setupLoadingUI(label) {
    titleEl.textContent = label || "Chart preview";
    metaEl.textContent = "loading…";
    teardownView();
    const body = $(".cp-body", dialog);
    const rect = body.getBoundingClientRect();
    const mainHeight = Math.max(360, Math.min(900, Math.floor(rect.height - 24)));
    return { mainHeight: mainHeight, apiBase: apiBaseFromPage() };
  }

  function _baseRendererOpts(ctx) {
    const _kzRaw = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--cp-keyzone-h"));
    return {
      mainHeight: ctx.mainHeight,
      profile: profileEl ? profileEl.checked : false,
      apiBase: ctx.apiBase || undefined,
      keyZoneH: isFinite(_kzRaw) ? _kzRaw : 135,
    };
  }

  function _onLoadError(e) {
    console.error("[chart-preview] load failed", e);
    dlog("WARN", "chart", "load failed", { msg: e && e.message, stack: e && e.stack ? String(e.stack).slice(0, 400) : null });
    metaEl.textContent = "Error: " + e.message;
  }

  function _finalizeLoadedView() {
      const t = view.timeline;
      const measCount = view.getMeasures().length;
      const audioOk = !!(t.audio && view.hasAudio);
      const audioBad = !!(t.audio && !view.hasAudio);

      // Phase G — populate identity row: mode badge + tier badge + title +
      // meta badge chips. Legacy metaEl is hidden but mirrored for compat.
      if (modeBadgeEl) { modeBadgeEl.textContent = t.mode || "SP"; modeBadgeEl.hidden = false; }
      if (tierBadgeEl) {
        const tier = (currentRow && (currentRow.family || currentRow.tag)) || "";
        if (tier) { tierBadgeEl.textContent = tier; tierBadgeEl.hidden = false; }
        else { tierBadgeEl.textContent = ""; tierBadgeEl.hidden = true; }
      }
      if (metaBadgesEl) {
        const badges = [
          "BPM " + t.base_bpm,
          t.notes.length.toLocaleString() + " notes",
          measCount + " measures",
        ];
        let html = badges.map(function (b) { return '<li class="cp-meta__item">' + b + '</li>'; }).join("");
        if (audioOk)  html += '<li class="cp-meta__item cp-meta__item--audio">audio <b>✓</b></li>';
        if (audioBad) html += '<li class="cp-meta__item cp-meta__item--audio" style="color:var(--cp-orange);">audio ✗</li>';
        metaBadgesEl.innerHTML = html;
      }
      if (metaEl) {
        metaEl.textContent = t.mode + " · " + t.lanes + " lanes · " +
          t.notes.length + " notes · " + measCount + " measures · " +
          t.total_sec.toFixed(1) + "s · base BPM " + t.base_bpm +
          (audioOk ? " · audio ✓" : audioBad ? " · audio ✗" : "");
      }
      dlog("INFO", "chart", "loaded", {
        mode: t.mode, lanes: t.lanes,
        notes: t.notes.length, measures: measCount,
        totalSec: t.total_sec, baseBpm: t.base_bpm,
        audio: audioOk ? "ok" : (audioBad ? "fail" : "none"),
      });
      view.setOnPlayStateChange(function (playing) {
        dlog("INFO", "transport", playing ? "play" : "pause", { sec: view.getState && view.getState().currentSec });
        if (playBtn) playBtn.classList.toggle("is-playing", playing);
        // Set BOTH the hidden attribute AND inline display — the attribute
        // gets overridden by `.cp-btn svg { display: block }` in some
        // theme cascades, so the inline style is the belt-and-braces.
        if (playIconEl) {
          playIconEl.hidden = playing;
          playIconEl.style.display = playing ? "none" : "block";
        }
        if (pauseIconEl) {
          pauseIconEl.hidden = !playing;
          pauseIconEl.style.display = playing ? "block" : "none";
        }
        // R8-10: user-initiated pause aborts any in-flight wrap standby UI.
        if (!playing) hideLoopCountdown();
      });
      view.setOnJudgment(handleJudgment);
      showEmpty(false);   // PORT_FIXUPS #4
      // Debug-only — expose the live view so the user can inspect state
      // from the console (`__cpView.getState()`, `__cpView.getLoop()`).
      window.__cpView = view;
      if (view.setOnAutoAdjust) {
        view.setOnAutoAdjust(function (newOffsetMs) {
          fxSettings.judgeOffsetMs = newOffsetMs;
          if (fxOffsetSlider) fxOffsetSlider.value = String(newOffsetMs);
          if (fxOffsetVal) fxOffsetVal.textContent = fmtSignedMs(newOffsetMs);
          saveFxSettings();
        });
      }
      applyFxToView();
      // R8-25 — bindings-driven keyboard dispatch. buildKeyMapForMode
      // emits { code: [lane, ...] } from the user's saved bindings; the
      // renderer's getKeyMap is kept only as a fallback for legacy paths.
      currentKeyMap = buildKeyMapForMode(t.mode);
      resetLanePressCounts();
      setKeyHint(t.mode);
      resetStats();
      if (progressEl) {
        progressEl.max = String(t.total_sec || 0);
        progressEl.value = "0";
        progressEl.disabled = false;
      }
      updateClock();
      clockTimer = setInterval(updateClock, 100);
      setupDensityForView(view);
      if (view.setOnLoopChange) {
        view.setOnLoopChange(function (loop) {
          dlog("INFO", "loop", loop ? "set" : "clear", loop || undefined);
          updateLoopBand(loop);
          // R8-10: clearing the loop kills any in-flight standby countdown.
          if (!loop) hideLoopCountdown();
        });
      }
      updateLoopBand(view.getLoop ? view.getLoop() : null);
      if (view.setOnLoopWrap) view.setOnLoopWrap(function (info) {
        dlog("DBG", "loop", "wrap", { holdMs: info && info.holdMs });
        startLoopCountdown((info && info.holdMs) || 0);
      });
      // R8-13: lanemod chip row fires this on every change so the host can
      // persist the chosen mod across loads / page reloads. Only the SETTING
      // is persisted — RANDOM / R-RANDOM permutations regenerate on each load.
      if (view.setOnLaneSettingsChange) {
        view.setOnLaneSettingsChange(function (partial) {
          if (partial.laneMod      !== undefined) fxSettings.laneMod      = partial.laneMod;
          if (partial.laneFilter   !== undefined) fxSettings.laneFilter   = partial.laneFilter;
          if (partial.laneMod2P    !== undefined) fxSettings.laneMod2P    = partial.laneMod2P;
          if (partial.laneFilter2P !== undefined) fxSettings.laneFilter2P = partial.laneFilter2P;
          saveFxSettings();
        });
      }
      // R8-15 — gear click opens the lanemod config modal.
      if (view.setOnLaneModConfigRequested) {
        view.setOnLaneModConfigRequested(openLanemodConfig);
      }
      // R8-26: popup Y now lives in positionJudgment() — it reads kz +
      // lineOffset + judgmentPopupOffset every call so the popup tracks
      // the judgment line slider AND any future popup-offset slider.
      if (judgmentEl) {
        positionJudgment();
        bindJudgmentResize();
      }
  }

  async function loadByUrl(url, label) {
    dlog("INFO", "chart", "loadByUrl start", { url: url, label: label });
    const ctx = _setupLoadingUI(label);
    try {
      view = await window.ChartRenderer.loadAndRender(host, url, _baseRendererOpts(ctx));
      _finalizeLoadedView();
    } catch (e) { _onLoadError(e); }
  }

  async function _tryFetchBundle(bundleUrl) {
    const resp = await fetch(bundleUrl, { credentials: "include" });
    if (!resp.ok) {
      dlog("WARN", "chart", "bundle fetch HTTP " + resp.status);
      return null;
    }
    const buf = await resp.arrayBuffer();
    const zip = await window.JSZip.loadAsync(buf);
    const jsonFile = zip.file("timeline.json");
    if (!jsonFile) {
      dlog("WARN", "chart", "bundle missing timeline.json");
      return null;
    }
    const timeline = JSON.parse(await jsonFile.async("text"));
    let audioUrl = null;
    const mp3File = zip.file("audio.mp3");
    if (mp3File) {
      const blob = await mp3File.async("blob");
      audioUrl = URL.createObjectURL(blob);
    }
    return { timeline: timeline, audioUrl: audioUrl };
  }

  async function loadByBundle(bundle, label) {
    dlog("INFO", "chart", "loadByBundle start", { label: label, hasAudio: !!bundle.audioUrl });
    const ctx = _setupLoadingUI(label);
    try {
      const opts = _baseRendererOpts(ctx);
      if (bundle.audioUrl) opts.audioUrl = bundle.audioUrl;
      view = await window.ChartRenderer.renderTimeline(host, bundle.timeline, opts);
      _finalizeLoadedView();
    } catch (e) { _onLoadError(e); }
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
        dlog("WARN", "chart", "bundle attempt failed, falling back", { msg: e && e.message });
      }
    }
    const url = "/Resource/NoteAttributes/timeline/" + row.md5 + ".json";
    return loadByUrl(url, label);
  }

  // ── Pick-chart wiring (search modal stacked above cp-dialog) ────────
  const searchModal   = document.querySelector("[data-na-search-modal]");
  const searchInput   = document.querySelector("[data-na-search-input]");
  const searchResults = document.querySelector("[data-na-search-results]");
  const searchClose   = document.querySelector("[data-na-search-close]");
  let searchController = null;
  let corpusPromise = null;

  function ensureCorpus() {
    if (!corpusPromise) {
      // Load summary.json (all charts) AND timeline-index.json (md5s for
      // which a timeline has actually been deployed). Filter the corpus
      // down to playable charts so the picker can't surface 404s.
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
    // NEVER touch pickBtn.textContent — it wipes the magnify SVG child.
    // Use title (tooltip) + disabled for the loading state instead.
    const origTitle = pickBtn ? pickBtn.title : null;
    if (pickBtn) {
      pickBtn.disabled = true;
      pickBtn.title = "Loading corpus…";
    }
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
          titleOnly: true,    // Phase G — chart-preview filters by title only
          onSelect: function (row) {
            requestAnimationFrame(function () { loadByRow(row); });
            return true;
          },
        });
      }
      if (pickBtn) {
        pickBtn.title = origTitle || "Pick chart (P)";
        pickBtn.disabled = false;
      }
      searchController.open();
    } catch (e) {
      console.error("[chart-preview] corpus load failed", e);
      if (pickBtn) {
        pickBtn.title = origTitle || "Pick chart (P)";
        pickBtn.disabled = false;
      }
      metaEl.textContent = "Search unavailable: " + e.message;
    }
  }

  // PORT_FIXUPS #4 — both top-bar Pick button and empty-state CTA share
  // data-cp-pick. Bind all so the CTA fires too.
  dialog.querySelectorAll("[data-cp-pick]").forEach(function (el) {
    el.addEventListener("click", openPicker);
  });

  function openDialogEmpty() {
    if (dialog.open) return;
    dialog.showModal();
    // Show the empty state (cp-empty has its own CTA) and let the user
    // press the magnify button when they want to pick a chart. Auto-
    // opening the picker every time was intrusive.
    if (!currentRow) {
      titleEl.textContent = "Chart preview";
      metaEl.textContent = "";
    }
  }
  if (openBtn) openBtn.addEventListener("click", openDialogEmpty);

  // Public API — other pages on the site can include
  // _includes/chart-preview-modal.html and call this to open the modal,
  // optionally pre-loading a specific chart by URL or by a summary.json
  // row object (carries md5/title/mode/family). No-arg call just opens
  // the empty modal.
  window.openChartPreview = function (target, label) {
    openDialogEmpty();
    if (typeof target === "string") {
      return loadByUrl(target, label);
    }
    if (target && typeof target === "object" && target.md5) {
      return loadByRow(target);
    }
    return Promise.resolve();
  };

  closeBtn.addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("close", function () {
    teardownView();
    currentRow = null;
    titleEl.textContent = "Chart preview";
    // Reset topbar badges so a stale SP/DP + tier doesn't carry over to
    // the next open. Mode badge hides too — it'll re-appear with the next
    // loaded chart's mode.
    if (modeBadgeEl) { modeBadgeEl.textContent = ""; modeBadgeEl.hidden = true; }
    if (tierBadgeEl) { tierBadgeEl.textContent = ""; tierBadgeEl.hidden = true; }
    if (metaBadgesEl) metaBadgesEl.innerHTML = "";
  });

  playBtn.addEventListener("click", function () { if (view) view.toggle(); });
  resetBtn.addEventListener("click", function () {
    if (view) view.reset();
    resetStats();
  });
  profileEl.addEventListener("change", function () {
    if (currentRow) loadByRow(currentRow);
  });

  if (progressEl) {
    function beginScrub() {
      if (!view || progressEl.disabled) return;
      progressDragging = true;
      progressWasPlaying = view.isPlaying();
      if (progressWasPlaying) view.pause();
    }
    function applyScrub() {
      if (!view || !progressDragging) return;
      const sec = parseFloat(progressEl.value);
      if (!isFinite(sec)) return;
      if (view.seekToSec) view.seekToSec(sec);
      // Stats are wiped by seekToSec (resetJudgments inside renderer);
      // mirror that on the chart-preview side so combo / counts reset too.
      resetStats();
    }
    function endScrub() {
      if (!progressDragging) return;
      progressDragging = false;
      if (progressWasPlaying && view) view.play();
      progressWasPlaying = false;
      // Hand focus back to the dialog so lane keys keep working.
      progressEl.blur();
    }
    progressEl.addEventListener("pointerdown", beginScrub);
    progressEl.addEventListener("input", applyScrub);
    progressEl.addEventListener("pointerup", endScrub);
    progressEl.addEventListener("pointercancel", endScrub);
    // Keyboard arrows on a focused range also fire `input` — same handler
    // works, but we won't have called beginScrub. Treat keyboard scrub as
    // a no-op press-cycle: pause briefly, seek, resume.
    progressEl.addEventListener("keydown", function (e) {
      const isStep = (e.key === "ArrowLeft" || e.key === "ArrowRight"
                   || e.key === "ArrowUp"   || e.key === "ArrowDown"
                   || e.key === "Home"      || e.key === "End"
                   || e.key === "PageUp"    || e.key === "PageDown");
      if (!isStep) return;
      if (!progressDragging) beginScrub();
    });
    progressEl.addEventListener("keyup", function (e) {
      const isStep = (e.key === "ArrowLeft" || e.key === "ArrowRight"
                   || e.key === "ArrowUp"   || e.key === "ArrowDown"
                   || e.key === "Home"      || e.key === "End"
                   || e.key === "PageUp"    || e.key === "PageDown");
      if (isStep) endScrub();
    });
    progressEl.disabled = true;     // until a chart is loaded
  }

  // ── R8-25 Key Mapping popup wiring ──────────────────────────────────
  // Click a pad (SVG or list row) → capture overlay shows → next keypress
  // OR HID change is recorded as that pad's binding. Esc cancels.
  // Bindings persist via localStorage. Default seeds keyboard for SP/DP.
  let captureOverlayEl = null;
  let captureOverlayLabel = null;
  let captureRescanBtn = null;

  // Pressed-pad highlight — only fires while the modal is open. SVG pads
  // and their matching bindings-list row get .is-pressing during the press.
  function padsByCode(code) {
    const out = [];
    for (const id of PAD_IDS) {
      const b = keybindings[id];
      if (b && b.kind === "key" && b.code === code) out.push(id);
    }
    return out;
  }
  function highlightPad(padId, on) {
    if (!keymapModal || !keymapModal.open) return;
    keymapModal.querySelectorAll('[data-cp-keymap-pad="' + padId + '"]').forEach(function (el) {
      el.classList.toggle("is-pressing", !!on);
    });
    const bindEl = keymapModal.querySelector('[data-cp-keymap-bind="' + padId + '"]');
    if (bindEl) {
      const li = bindEl.closest("li");
      if (li) li.classList.toggle("is-pressing", !!on);
    }
  }
  function clearAllPressing() {
    if (!keymapModal) return;
    keymapModal.querySelectorAll(".is-pressing").forEach(function (el) {
      el.classList.remove("is-pressing");
    });
  }
  let keymapHighlightKeyDown = null;
  let keymapHighlightKeyUp = null;
  function installKeymapHighlight() {
    if (keymapHighlightKeyDown) return;   // already installed
    keymapHighlightKeyDown = function (e) {
      if (captureState.active) return;    // capture handler swallows the event
      const ids = padsByCode(e.code);
      for (let i = 0; i < ids.length; i++) highlightPad(ids[i], true);
    };
    keymapHighlightKeyUp = function (e) {
      const ids = padsByCode(e.code);
      for (let i = 0; i < ids.length; i++) highlightPad(ids[i], false);
    };
    window.addEventListener("keydown", keymapHighlightKeyDown);
    window.addEventListener("keyup",   keymapHighlightKeyUp);
  }
  function uninstallKeymapHighlight() {
    if (keymapHighlightKeyDown) {
      window.removeEventListener("keydown", keymapHighlightKeyDown);
      keymapHighlightKeyDown = null;
    }
    if (keymapHighlightKeyUp) {
      window.removeEventListener("keyup", keymapHighlightKeyUp);
      keymapHighlightKeyUp = null;
    }
    clearAllPressing();
  }

  function refreshBindingsDisplay() {
    if (!keymapModal) return;
    keymapModal.querySelectorAll("[data-cp-keymap-bind]").forEach(function (el) {
      const id = el.getAttribute("data-cp-keymap-bind");
      const b = keybindings[id];
      el.textContent = bindingLabel(b);
      el.classList.toggle("is-bound", !!b);
    });
    keymapModal.querySelectorAll("[data-cp-keymap-pad]").forEach(function (el) {
      const id = el.getAttribute("data-cp-keymap-pad");
      el.classList.toggle("is-bound", !!keybindings[id]);
    });
  }

  function showCaptureOverlay(padId) {
    if (!captureOverlayEl) return;
    if (captureOverlayLabel) {
      captureOverlayLabel.textContent = PAD_LABELS[padId] || padId;
    }
    captureOverlayEl.hidden = false;
  }
  function hideCaptureOverlay() {
    if (captureOverlayEl) captureOverlayEl.hidden = true;
  }
  function isScratchPad(id) { return typeof id === "string" && id.indexOf("sc") === 0; }

  function enterCapture(padId) {
    if (!PAD_LANE.hasOwnProperty(padId)) return;
    if (captureState.active) cancelCapture();
    captureState.active = true;
    captureState.padId = padId;
    captureState.hint = isScratchPad(padId) ? "axis" : "bit";
    // Reset HID prev so the next inbound report registers as a transition
    // from idle (no phantom "release" from whatever the user happened to
    // be touching when they clicked).
    for (const ctx of hidDevices.values()) ctx.prev = new Uint8Array(0);
    showCaptureOverlay(padId);
    captureState.keyHandler = function (e) {
      if (!captureState.active) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        cancelCapture();
        return;
      }
      // Ignore modifiers-only events so users can hold Shift to clear if
      // we add that later — for now, Shift itself is a valid binding.
      e.preventDefault(); e.stopPropagation();
      finishCapture({ kind: "key", code: e.code });
    };
    window.addEventListener("keydown", captureState.keyHandler, true);
  }
  function cancelCapture() {
    if (!captureState.active) return;
    captureState.active = false;
    if (captureState.keyHandler) {
      window.removeEventListener("keydown", captureState.keyHandler, true);
      captureState.keyHandler = null;
    }
    hideCaptureOverlay();
    captureState.padId = null;
  }
  function finishCapture(binding) {
    if (!captureState.active) return;
    const padId = captureState.padId;
    // r11 Phase 4 — release any held lanes BEFORE the binding flips so a
    // physical input held during capture (e.g. user rebinds the very key
    // they just pressed to enter capture) doesn't leave its old lane
    // stuck.
    forceReleaseAllLanes();
    keybindings[padId] = binding;
    saveKeybindings();
    dlog("INFO", "bindings", "captured", { pad: padId, binding: binding });
    cancelCapture();
    refreshBindingsDisplay();
    if (view && view.timeline) {
      currentKeyMap = buildKeyMapForMode(view.timeline.mode);
    }
  }
  function handleHidCapture(dev, cur, prev) {
    const detected = detectHidChange(dev, cur, prev, captureState.hint);
    if (detected) finishCapture(detected);
  }

  function dispatchHidPlay(dev, cur, prev) {
    if (!view) return;
    for (const id of PAD_IDS) {
      const b = keybindings[id];
      if (!b) continue;
      if (b.kind !== "hid-bit" && b.kind !== "hid-axis") continue;
      if (resolveBindingDevice(b) !== dev) continue;
      const wasPressed = bindingPressedFor(b, prev);
      const nowPressed = bindingPressedFor(b, cur);
      if (wasPressed === nowPressed) continue;
      const lane = PAD_LANE[id];
      if (nowPressed) { bindingPress(lane); highlightPad(id, true); }
      else            { bindingRelease(lane); highlightPad(id, false); }
    }
  }

  function onHidReport(e) {
    const dev = e.device || e.currentTarget || e.target;
    const ctx = hidDevices.get(dev);
    if (!ctx) return;
    const view8 = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    // Take a copy so subsequent reports can't mutate our prev snapshot.
    const cur = new Uint8Array(view8);
    const prev = ctx.prev;
    // r12.1 — calibration grabs HID input first while running so taps
    // get measured instead of routed to play. handleHidEvent returns
    // true on rising-edge press; prev still advances so the next event
    // sees an accurate baseline.
    if (calibrationDialog && calibrationDialog.handleHidEvent
        && calibrationDialog.handleHidEvent(e.timeStamp, prev, cur)) {
      ctx.prev = cur;
      return;
    }
    if (captureState.active) handleHidCapture(dev, cur, prev);
    else dispatchHidPlay(dev, cur, prev);
    ctx.prev = cur;
  }

  if (keymapModal && keymapOpen) {
    captureOverlayEl    = keymapModal.querySelector("[data-cp-keymap-overlay]");
    captureOverlayLabel = keymapModal.querySelector("[data-cp-keymap-overlay-target]");
    captureRescanBtn    = keymapModal.querySelector("[data-cp-keymap-rescan]");
    hidStatusEl         = keymapModal.querySelector("[data-cp-keymap-status]");
    hidSwapBtn          = keymapModal.querySelector("[data-cp-keymap-swap]");

    keymapOpen.addEventListener("click", function () {
      refreshBindingsDisplay();
      updateHidStatus();
      if (!keymapModal.open) keymapModal.showModal();
      installKeymapHighlight();
    });
    if (keymapClose) {
      keymapClose.addEventListener("click", function () {
        cancelCapture();
        if (keymapModal.open) keymapModal.close();
      });
    }
    keymapModal.addEventListener("click", function (e) {
      if (e.target === keymapModal) { cancelCapture(); keymapModal.close(); }
    });
    keymapModal.addEventListener("close", function () {
      cancelCapture();
      uninstallKeymapHighlight();
    });
    // Esc during capture cancels capture only — don't let the dialog close.
    keymapModal.addEventListener("cancel", function (e) {
      if (captureState.active) { e.preventDefault(); cancelCapture(); }
    });

    if (captureRescanBtn) {
      captureRescanBtn.addEventListener("click", function () { rescanHid(); });
    }
    if (hidSwapBtn) {
      hidSwapBtn.addEventListener("click", function () { swap1P2P(); });
    }
    // r12 — Calibrate Input button. Pauses the chart on open so the
    // chart's keydown handler doesn't compete; keymap modal stays open
    // underneath so the user lands back in the same context after Apply.
    const calibBtn = keymapModal.querySelector("[data-cp-keymap-calib]");
    if (calibBtn) {
      calibBtn.addEventListener("click", function () {
        if (view && view.isPlaying && view.isPlaying() && view.pause) view.pause();
        calibrationDialog.open();
      });
    }

    // SVG pad click → start capture for that pad. Pads carry the same
    // pad-id (data-cp-keymap-pad) we use everywhere else.
    keymapModal.querySelectorAll("[data-cp-keymap-pad]").forEach(function (pad) {
      pad.addEventListener("click", function (e) {
        e.preventDefault();
        const id = pad.getAttribute("data-cp-keymap-pad");
        enterCapture(id);
      });
    });
    // List rows are click targets too — these are the only way to bind
    // SC↺ (the disc itself defaults to SC↻).
    keymapModal.querySelectorAll("[data-cp-keymap-bind]").forEach(function (row) {
      const li = row.closest("li");
      if (!li) return;
      li.style.cursor = "pointer";
      li.addEventListener("click", function () {
        const id = row.getAttribute("data-cp-keymap-bind");
        enterCapture(id);
      });
    });

    refreshBindingsDisplay();
    autoAttachGrantedHid();
  }

  // ── Settings popup wiring ────────────────────────────────────────────
  if (settingsModal && settingsOpen) {
    settingsOpen.addEventListener("click", function () {
      syncFxControls();
      if (!settingsModal.open) settingsModal.showModal();
    });
    if (settingsClose) {
      settingsClose.addEventListener("click", function () {
        if (settingsModal.open) settingsModal.close();
      });
    }
    settingsModal.addEventListener("click", function (e) {
      if (e.target === settingsModal) settingsModal.close();
    });
    for (const r of fxBeamLenRadios) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        if (!BEAM_LENGTH_RATIOS[r.value]) return;
        fxSettings.beamLength = r.value;
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxLineSlider) {
      fxLineSlider.addEventListener("input", function () {
        const v = Math.max(1, Math.min(20, parseInt(fxLineSlider.value, 10) || 1));
        fxSettings.lineOffset = v;
        if (fxLineVal) fxLineVal.textContent = v + " px";
        // popup follows automatically via positionJudgment's formula
        // (= kz + lineOffset + gap). No need to mutate popup slider.
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxPopupSlider) {
      fxPopupSlider.addEventListener("input", function () {
        const v = Math.max(0, Math.min(200, parseInt(fxPopupSlider.value, 10) || 0));
        fxSettings.judgmentPopupOffset = v;
        if (fxPopupVal) fxPopupVal.textContent = v + " px";
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxSudplusSlider) {
      fxSudplusSlider.addEventListener("input", function () {
        // setSudPlus handles clamp + snap-to-off + slider/text/apply/save.
        setSudPlus(parseInt(fxSudplusSlider.value, 10) || 0);
      });
    }
    if (fxOffsetSlider) {
      fxOffsetSlider.addEventListener("input", function () {
        if (fxSettings.autoAdjust) return;  // locked by auto
        const v = Math.max(-150, Math.min(150, parseInt(fxOffsetSlider.value, 10) || 0));
        fxSettings.judgeOffsetMs = v;
        if (fxOffsetVal) fxOffsetVal.textContent = fmtSignedMs(v);
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxAutoToggle) {
      fxAutoToggle.addEventListener("change", function () {
        fxSettings.autoAdjust = !!fxAutoToggle.checked;
        if (fxOffsetSlider) fxOffsetSlider.disabled = fxSettings.autoAdjust;
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxMarkersToggle) {
      fxMarkersToggle.addEventListener("change", function () {
        fxSettings.showMeasureMarkers = !!fxMarkersToggle.checked;
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxHideRailToggle) {
      fxHideRailToggle.addEventListener("change", function () {
        fxSettings.hideMeasureRail = !!fxHideRailToggle.checked;
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxHideJudgmentToggle) {
      fxHideJudgmentToggle.addEventListener("change", function () {
        fxSettings.hideJudgment = !!fxHideJudgmentToggle.checked;
        applyFxToView();
        saveFxSettings();
      });
    }
    if (fxGhostToggle) {
      fxGhostToggle.addEventListener("change", function () {
        fxSettings.ghostEnabled = !!fxGhostToggle.checked;
        applyFxToView();
        saveFxSettings();
      });
    }
    for (const r of fxStandbyRadios) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        if (!LOOP_STANDBY_MS[r.value]) return;
        fxSettings.loopStandby = r.value;
        applyFxToView();
        saveFxSettings();
      });
    }
    if (settingsReset) {
      settingsReset.addEventListener("click", function () {
        settingsBridge.reset();
        syncFxControls();
        applyFxToView();
        saveFxSettings();
      });
    }
    // Initialise control values from saved settings on first paint.
    syncFxControls();
  }

  // ── Keyboard play wiring ────────────────────────────────────────────
  // Listener lives on the cp-dialog so it auto-scopes to the modal — when
  // the search dialog stacks on top, focus moves there and these handlers
  // stop firing (the search modal handles its own keys inside its input).
  // We still guard with !searchModal.open as a belt-and-braces check for
  // browsers that bubble through dialog boundaries.
  dialog.addEventListener("keydown", function (e) {
    if (searchModal && searchModal.open) return;
    if (settingsModal && settingsModal.open) return;
    if (!view) return;
    // Don't fight type-into-input scenarios (profile checkbox doesn't take
    // typing, but future fields might).
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Capture mode lives on window/capture-phase — if it's swallowing keys
    // for binding, we never get here.
    if (keymapModal && keymapModal.open) return;

    // Lane-key check first so Shift-on-button doesn't double as a verb.
    // currentKeyMap is { code: [lane, ...] } — one code can drive multiple
    // lanes (e.g. user binds Shift to both SC↻ and SC↺, or duplicates a key).
    if (currentKeyMap && Object.prototype.hasOwnProperty.call(currentKeyMap, e.code)) {
      if (e.repeat) { e.preventDefault(); return; }
      e.preventDefault();
      const lanes = currentKeyMap[e.code];
      for (let i = 0; i < lanes.length; i++) bindingPress(lanes[i]);
      return;
    }

    const k = e.key;
    if (k === " " || e.code === "Space") {
      if (e.repeat) { e.preventDefault(); return; }
      e.preventDefault();
      view.toggle();
    } else if (k === "r" || k === "R") {
      if (e.repeat) return;
      e.preventDefault();
      view.reset();
      resetStats();
    } else if (k === "p" || k === "P") {
      if (e.repeat) return;
      e.preventDefault();
      openPicker();
    } else if (k === "ArrowLeft") {
      if (view.isPlaying()) return;
      e.preventDefault();
      const st = view.getState();
      view.seekToMeasure(Math.max(0, st.activeIdx - 1));
      resetStats();
    } else if (k === "ArrowRight") {
      if (view.isPlaying()) return;
      e.preventDefault();
      const st = view.getState();
      view.seekToMeasure(st.activeIdx + 1);
      resetStats();
    } else if (k === "Home") {
      if (view.isPlaying()) return;
      e.preventDefault();
      view.seekToMeasure(0);
      resetStats();
    } else if (k === "End") {
      if (view.isPlaying()) return;
      e.preventDefault();
      view.seekToMeasure(view.getMeasures().length - 1);
      resetStats();
    }
    // Esc falls through — native <dialog> handles close.
  });

  // Keyup → unlight the keycap (and Phase C: release LN judgment).
  dialog.addEventListener("keyup", function (e) {
    if (!view) return;
    if (!currentKeyMap) return;
    if (!Object.prototype.hasOwnProperty.call(currentKeyMap, e.code)) return;
    const lanes = currentKeyMap[e.code];
    for (let i = 0; i < lanes.length; i++) bindingRelease(lanes[i]);
  });
})();
