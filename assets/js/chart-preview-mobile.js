/* Slim chart-preview host for the mobile page (watch-only).
   Reuses chart-renderer.js + chart-search.js + bundle grant flow. */
(function () {
  "use strict";

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
    const progressEl   = $("[data-cpm-progress]");
    const timeEl       = $("[data-cpm-time]");
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

    function showEmpty(on) {
      if (emptyEl) emptyEl.hidden = !on;
      if (bottomEl) bottomEl.hidden = on;
    }
    showEmpty(true);

    function teardownView() {
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
      if (view && view.destroy) {
        try { view.destroy(); } catch (e) {}
      }
      view = null;
      while (host.firstChild) host.removeChild(host.firstChild);
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
      const total = (view.timeline && view.timeline.total_sec) || 0;
      if (!dragging && progressEl) {
        progressEl.value = String(cur);
      }
      if (timeEl) {
        timeEl.textContent = fmtTime(cur) + " / " + fmtTime(total);
      }
    }

    function _finalizeView() {
      const t = view.timeline;
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
        progressEl.max = String(t.total_sec || 0);
        progressEl.value = "0";
        progressEl.disabled = false;
      }
      updateClock();
      clockTimer = setInterval(updateClock, 200);
      showEmpty(false);
    }

    async function loadByBundle(bundle, label) {
      teardownView();
      if (titleEl) titleEl.textContent = label || "loading…";
      try {
        const opts = { apiBase: apiBaseFromPage() || undefined, keyZoneH: 0 };
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
      if (titleEl) titleEl.textContent = label || "loading…";
      try {
        const opts = { apiBase: apiBaseFromPage() || undefined, keyZoneH: 0 };
        view = await window.ChartRenderer.loadAndRender(host, url, opts);
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
