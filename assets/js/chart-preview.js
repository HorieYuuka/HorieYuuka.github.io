/* chart-preview.js — POC modal wiring for the chart preview page */
(function () {
  "use strict";

  const SAMPLES = [
    { label: "Liberte-SuperSaw Epic mix [Another] (SP ★)", url: "/Resource/NoteAttributes/timeline/SP__%E2%98%85__Liberte-Another.json" },
    { label: "Cosmo Memory [SP sl] (LN sample)",               url: "/Resource/NoteAttributes/timeline/SP__sl__cosmomemory.json" },
    { label: "$trange Attraktor [DP ANOTHER] (DP ★)",     url: "/Resource/NoteAttributes/timeline/DP__%E2%98%85__strange_dpa.json" },
    { label: "キマグレ☆テキトウ・ポップミュージック！ [DP HYPER] (DP ★)", url: "/Resource/NoteAttributes/timeline/DP__%E2%98%85__kimagure_dph.json" },
  ];

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

  const dialog  = $("[data-cp-dialog]");
  const openBtn = $("[data-cp-open]");
  if (!dialog || !openBtn) return;

  const sel       = $("[data-cp-sel]",     dialog);
  const titleEl   = $("[data-cp-title]",   dialog);
  const host      = $("[data-cp-host]",    dialog);
  const metaEl    = $("[data-cp-meta]",    dialog);
  const clockEl   = $("[data-cp-clock]",   dialog);
  const playBtn   = $("[data-cp-play]",    dialog);
  const resetBtn  = $("[data-cp-reset]",   dialog);
  const profileEl = $("[data-cp-profile]", dialog);
  const closeBtn  = $("[data-cp-close]",   dialog);

  // Populate selector once.
  SAMPLES.forEach(function (s, i) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = s.label;
    sel.appendChild(opt);
  });

  let view = null;
  let clockTimer = null;

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
  }

  function teardownView() {
    if (view) {
      if (view.destroy) view.destroy();
      else view.pause();
      view = null;
    }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    host.innerHTML = "";
  }

  async function load(idx) {
    const sample = SAMPLES[idx];
    if (!sample) return;
    titleEl.textContent = sample.label;
    metaEl.textContent = "loading…";
    teardownView();
    const body = $(".cp-body", dialog);
    const rect = body.getBoundingClientRect();
    const mainHeight = Math.max(360, Math.min(900, Math.floor(rect.height - 24)));
    const apiBase = apiBaseFromPage();
    try {
      view = await window.ChartRenderer.loadAndRender(host, sample.url, {
        mainHeight: mainHeight,
        profile: profileEl.checked,
        apiBase: apiBase || undefined,
      });
      const t = view.timeline;
      const measCount = view.getMeasures().length;
      const audioStatus = t.audio
        ? (view.hasAudio ? " · audio ✓" : " · audio ✗ (offline / quota / 404)")
        : "";
      metaEl.textContent = t.mode + " · " + t.lanes + " lanes · " +
        t.notes.length + " notes · " + measCount + " measures · " +
        t.total_sec.toFixed(1) + "s · base BPM " + t.base_bpm + audioStatus;
      view.setOnPlayStateChange(function (playing) {
        playBtn.textContent = playing ? "❙❙ Pause" : "▶ Play";
      });
      updateClock();
      clockTimer = setInterval(updateClock, 100);
    } catch (e) {
      console.error("[chart-preview] load failed", e);
      metaEl.textContent = "Error: " + e.message;
    }
  }

  openBtn.addEventListener("click", function () {
    if (dialog.open) return;
    dialog.showModal();
    // Defer load until after the dialog has laid out so cp-body height is real.
    requestAnimationFrame(function () { load(parseInt(sel.value, 10) || 0); });
  });
  closeBtn.addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("close", teardownView);

  sel.addEventListener("change", function () { load(parseInt(sel.value, 10)); });
  playBtn.addEventListener("click", function () { if (view) view.toggle(); });
  resetBtn.addEventListener("click", function () { if (view) view.reset(); });
  profileEl.addEventListener("change", function () { load(parseInt(sel.value, 10)); });
})();
