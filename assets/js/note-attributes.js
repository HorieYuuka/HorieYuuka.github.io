(function () {
  "use strict";

  // Phase 1Z-1F (2026-05-25): radar reduced to 6 shape axes from the
  // shape_v2 parallel ownership partition (priority order
  // scratch > stair > chord > ln > soft > stream). x_peak / x_jack /
  // x_distraction are no longer radar axes — peak surfaces in the
  // Density panel as an absolute burst scalar; jack moves to the
  // jack_present / double_tab / triple_tab tag set; distraction moves
  // to a tag in Step 5. Radar display order keeps the legacy reading
  // pattern (chord top, stream / scratch / etc. clockwise).
  // Phase 1Z-1H (2026-05-25): 7 axes. distraction reinstated as
  // "stream-flow + scratch interference" (Codex 2026-05-25 — conditional
  // modifier framing). Independent strengths, sum ≠ 1.
  const AXES = ["chord", "stream", "scratch", "soft", "ln", "stair", "distraction"];
  const AXIS_LABELS = ["Chord", "Stream", "Scratch", "Soft", "LN", "Stair", "Distraction"];

  // Boolean pattern flags emitted by `assign_tags` (BMS.Tools/note_attributes.py).
  // Per-axis strength tags (chord_heavy / stream_heavy / peak_intense /
  // scratch_active / distraction_heavy / ln_chart / soflan / stair_focused)
  // were removed 2026-04-26 — strength now lives in axis_intensities (see
  // INTENSITY_COLORS below). Cross-axis composites (pure_stream /
  // chord_stream / gimmick_soflan) and BPM descriptors (slow_chart /
  // fast_chart) were also removed.
  // Phase 1Z (2026-05-23): family-relative icon row + AEζηκ contribution bar.
  // Glyphs cover the 9 axes plus 5 boolean modifiers. The polarity (strong /
  // lighter) is encoded in CSS class, not the glyph itself — same icon, two
  // Phase 1Z-1G (2026-05-25): tag description tooltips. Source of truth
  // for the boolean conditions is `assign_tags` in
  // BMS.Tools/scripts/note_attributes.py — keep these descriptions in
  // sync if a tag's firing rule changes.
  // Phase 1Z-1O (2026-05-28): per-axis corpus p99 for radar normalization.
  // raw `x_axis ∈ [0,1]` makes sparse axes (LN, scratch, soft) read tiny
  // even at the red tier. radar maps each value to `min(x / p99, 1.0)` so
  // 1.0 on the polar = "this axis's top 1 %". p99 (over p95) preserves
  // within-red differentiation — a chart at the corpus 96-99 percentile
  // sits ~0.5-1.0 on radar instead of all stacked at 1.0. Captured
  // 2026-05-28 from the live summary; refresh on corpus shift.
  const AXIS_RADAR_NORM = {
    SP: { chord: 0.9147, stream: 0.9784, scratch: 0.6611, soft: 0.9645,
          ln: 0.5916, stair: 0.4959, distraction: 0.5837 },
    DP: { chord: 0.8453, stream: 0.9933, scratch: 0.1113, soft: 0.8005,
          ln: 0.0875, stair: 0.3623, distraction: 0.8053 },
  };

  const TAG_DESCRIPTIONS = {
    advanced_ln:           "LN technical-pattern composite — short-hold transitions, stacked LN chords, irregular scatter.",
    jack_chart:            "Pure-jack rate per second exceeds threshold (isolated same-lane jacks, not in streams).",
    flow_break:            "Jacks interrupt running streams at a high rate.",
    jack_present:          "Count of rapid same-lane pairs exceeds the presence floor (keysound-agnostic).",
    double_tab:            "Keysound-matched 2-chain repetitions present (same #WAV id, gap ≤ 12 ticks).",
    triple_tab:            "Keysound-matched 3+ chain repetitions present.",
    scratch_burst:         "Scratch flurry within a 1-second window exceeds threshold.",
    long_scratch:          "Sustained Long-Scratch (wheel-hold) presence above the count floor.",
    complex_long_scratch:  "Long Scratch embedded in surrounding scratch context (not isolated).",
    scratch_chord:         "[SP] Scratch coincident with adjacent-key chord-tier notes (cross-domain pressure).",
    adjacent_scratch:      "[DP] 인접 스크래치 — 같은 사이드 S + KEY1/2/3 (가까운 키) 동시치기. 한 손으로 칠 수 있지만 불편한 손동작.",
    impossible_scratch:    "[DP] 무리 스크래치 — 같은 사이드 S + KEY4/5/6/7 (먼 키) 동시치기. 양손을 한 쪽으로 강제로 모이게 만드는 배치.",
    bilateral_scratch:     "[DP] 양 스크래치 — 한 마디 안에 양쪽 사이드 모두 ≥3 scratch 배치. P1/P2 wheel 동시 운용.",
    visual_gimmick:        "BPM-trick chart — high soflan max-intensity (display jumpscare or stop sections).",
    extreme_burst:         "Very high off-base density per beat (BPM-scaled burst severity).",
    big_chord_burst:       "Peak chord size is large (many simultaneous keys at the maximum).",
    burst_focused:         "Peak burden is concentrated in a small region (peak_concentration high).",
    sustained:             "Peak burden is spread across the chart (peak_concentration low).",
    peak_outlier:          "Peak axis red AND spread out — high peak density without clustering.",
    dense_chart:           "Average notes-per-second across the whole chart exceeds threshold.",
    last_killing:          "End-of-chart density spike — escalating finale or back-spike + calm coda.",
  };

  // Per-axis intensity tier colors. Used for the small comparison radars
  // (point colors per axis) and as fill backgrounds in the comparison
  // table's axis rows. SP and DP are calibrated separately upstream.
  const INTENSITY_COLORS = {
    red: "#bb6f6f",      // top third of nonzero corpus
    yellow: "#d4a017",   // middle third
    green: "#6fb87f",    // bottom third
    null: "#9ca3af",     // inactive (no axis activity)
  };
  const INTENSITY_FILLS = {
    red: "rgba(187, 111, 111, 0.55)",
    yellow: "rgba(212, 160, 23, 0.55)",
    green: "rgba(111, 184, 127, 0.55)",
    null: "rgba(156, 163, 175, 0.25)",
  };

  const root = document.querySelector("[data-note-attrs]");
  if (!root) return;

  const summaryUrl = root.dataset.summaryUrl;
  const attrsBase = (root.dataset.attrsBase || "").replace(/\/?$/, "/");

  // Phase 1Z-1I (2026-05-25): per-card density bars. Absolute jet scale —
  // colors compare across cards. Bar height encodes the chart's own
  // profile (normalized to chart_max), color encodes absolute NPS so a
  // sparse chart reads as dim blue and Aleph-class reads as red.
  const DENSITY_BAR_ABS_CAP = 60; // ≈ corpus p99 NPS_max (Z4 1-sec bucket)

  const els = {
    searchTrigger: root.querySelector("[data-na-search-open]"),
    searchModal: document.querySelector("[data-na-search-modal]"),
    searchInput: document.querySelector("[data-na-search-input]"),
    searchResults: document.querySelector("[data-na-search-results]"),
    searchClose: document.querySelector("[data-na-search-close]"),
    // Phase 1Z-1G (2026-05-25): mode checkboxes live inside the search
    // dialog now. The aside (with the paginated list / scale / tag / sort
    // filters) was removed — chart navigation is 100% via search.
    compareCards: root.querySelector("[data-na-compare-cards]"),
    compareTable: root.querySelector("[data-na-compare-table]"),
  };

  // Unlimited search results — full corpus pass per query. Heaviest realistic
  // case: empty/single-char query matches ~thousands → ~200-400ms render.
  // Mitigated by SEARCH_INPUT_DEBOUNCE_MS so render only runs after typing
  // stops, not on every keystroke.
  const SEARCH_MAX_RESULTS = Infinity;
  const SEARCH_INPUT_DEBOUNCE_MS = 80;
  const COMPARE_MAX = 8;

  // Phase 1Z-1G (2026-05-25): page is now a comparison view — up to 4
  // charts side by side. Single-chart deep view (icons / AEζηκ panel /
  // measure heatmap) was removed.
  const state = {
    rows: [],
    compareSet: [],          // array of row objects, max COMPARE_MAX
    compareCharts: new Map(),// file -> Chart.js instance (for destroy on remove)
    // Phase 1Z-1I (2026-05-25): lazy-fetched measure_density.measures
    // per chart. file -> { dense: number[], maxNps: number } | "loading"
    // | "error". Densified to a [0..maxM] array with 0 for silent seconds.
    compareMeasures: new Map(),
    // Phase 1Z-1G (2026-05-25): compare table sort. null = input order;
    // otherwise { key, dir }. key matches a COMPARE_COLS.key or "title".
    // Cards stay in input order regardless — sort affects the table only.
    sort: null,
    // Phase 1Z-1G (2026-05-25): per-mode sorted arrays for each metric,
    // used to compute "top N%" corpus percentile next to raw values in
    // the compare table. Built once after summary.json loads. Mode-
    // separated because SP and DP have different corpus distributions.
    percentileIndex: { SP: {}, DP: {} },
  };

  // Phase 1Z-1I (2026-05-25): inject the density-bar styles at runtime.
  // The SCSS rule for .note-attrs-compare-card-density is in custom.scss
  // but Jekyll's full rebuild on the large attrs folder is slow; this
  // ensures the bar renders even before the next CSS compile lands.
  function injectDensityStyles() {
    if (document.getElementById("na-density-styles")) return;
    const css = `
.note-attrs-compare-card-density {
  width: 100%;
  height: 38px;
  margin-top: 0.25rem;
  border-radius: 3px;
  overflow: hidden;
  cursor: help;
}
.note-attrs-compare-card-density canvas {
  display: block;
  width: 100%;
  height: 100%;
}
`;
    const el = document.createElement("style");
    el.id = "na-density-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function init() {
    injectDensityStyles();
    fetch(summaryUrl)
      .then((r) => r.json())
      .then((rows) => {
        state.rows = rows.map((r) => ({ ...r, scales: r.scales || [] }));
        buildPercentileIndex();
        bindEvents();
        renderCompare();
      })
      .catch((err) => {
        els.compareCards.innerHTML = `<p class="note-attrs-empty">Failed to load summary: ${escapeHtml(String(err))}</p>`;
      });
  }

  // Keys whose corpus distribution we want percentile-rank against. The
  // COMPARE_COLS getters return values from these underlying fields, so
  // we index by the getter rather than the column key.
  const PERCENTILE_KEYS = [
    { key: "bpm",      get: (r) => r.header_bpm || r.effective_bpm || 0 },
    { key: "nps_min",  get: (r) => (r.density && r.density.nps_min) ?? 0 },
    { key: "nps_mean", get: (r) => (r.density && (r.density.nps_mean ?? r.density.nps)) || 0 },
    { key: "nps_max",  get: (r) => (r.density && r.density.nps_max)  ?? 0 },
    { key: "pos_per_sec", get: (r) => (r.density && r.density.distinct_per_sec) ?? 0 },
    { key: "chord",       get: (r) => r.x_chord || 0 },
    { key: "stream",      get: (r) => r.x_stream || 0 },
    { key: "scratch",     get: (r) => r.x_scratch || 0 },
    { key: "soft",        get: (r) => r.x_soft || 0 },
    { key: "ln",          get: (r) => r.x_ln || 0 },
    { key: "stair",       get: (r) => r.x_stair || 0 },
    { key: "distraction", get: (r) => r.x_distraction || 0 },
    { key: "peak",        get: (r) => r.x_peak || 0 },
  ];

  function buildPercentileIndex() {
    for (const mode of ["SP", "DP"]) {
      const modeRows = state.rows.filter((r) => r.mode === mode);
      for (const spec of PERCENTILE_KEYS) {
        const arr = modeRows.map(spec.get).sort((a, b) => a - b);
        state.percentileIndex[mode][spec.key] = arr;
      }
    }
  }

  // Binary search for the rank (count of values < target). Returns the
  // "top X%" representation: top 1% = highest in corpus, top 99% = bottom.
  // null when the value is 0 (axis inactive) — we don't show a percentile
  // for inactive axes (the cell already reads as "0" with null color).
  function topPercent(mode, key, value) {
    if (value == null || value <= 0) return null;
    const arr = state.percentileIndex[mode] && state.percentileIndex[mode][key];
    if (!arr || !arr.length) return null;
    // Count values strictly less than `value` — binary search lower_bound.
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    const rank = lo;             // # values < value
    const n = arr.length;
    // "top X%" — X is the fraction of corpus AT OR ABOVE this value.
    const top = (n - rank) / n * 100;
    return top;
  }

  function fmtTop(p) {
    if (p == null) return "";
    if (p < 1) return "top <1%";
    if (p > 99) return `top ${p.toFixed(0)}%`;
    return `top ${p.toFixed(0)}%`;
  }

  // Search modal — behavior lives in assets/js/chart-search.js. The factory
  // owns the modal's open/close/render lifecycle; this page wires the
  // trigger button and the on-select action (add to compare).
  let searchController = null;
  function bindEvents() {
    if (!els.searchModal || !window.ChartSearch) return;
    searchController = window.ChartSearch.create({
      modal: els.searchModal,
      input: els.searchInput,
      results: els.searchResults,
      close: els.searchClose,
      rows: state.rows,
      maxResults: SEARCH_MAX_RESULTS,
      debounceMs: SEARCH_INPUT_DEBOUNCE_MS,
      kbShortcuts: true,
      onSelect: (row) => {
        // Add policy B2: when full, keep modal open so the user can free a
        // slot. flashFullCue is the in-modal visual ping.
        return addToCompare(row);
      },
    });
    if (els.searchTrigger) {
      els.searchTrigger.addEventListener("click", () => searchController?.open());
    }
  }

  // Phase 1Z-1G (2026-05-25): comparison set management.
  // Add policy B2: when full, block the add and surface a visual cue in
  // the search modal. The user must remove a card before a new one fits.

  function addToCompare(row) {
    if (state.compareSet.length >= COMPARE_MAX) {
      flashFullCue();
      return false;
    }
    if (state.compareSet.some((r) => r.file === row.file)) return true;
    state.compareSet.push(row);
    ensureMeasures(row);
    renderCompare();
    return true;
  }

  function removeFromCompare(file) {
    const idx = state.compareSet.findIndex((r) => r.file === file);
    if (idx === -1) return;
    state.compareSet.splice(idx, 1);
    const chart = state.compareCharts.get(file);
    if (chart) {
      chart.destroy();
      state.compareCharts.delete(file);
    }
    state.compareMeasures.delete(file);
    renderCompare();
  }

  // Phase 1Z-1I (2026-05-25): lazy-fetch the per-chart attrs.json (only
  // the submetrics.measure_density.measures field is needed). The summary
  // row's `file` field is the on-disk BMS basename — swap the extension
  // for `.json` to address the exported attrs file.
  function ensureMeasures(row) {
    if (!attrsBase || !row || !row.file) return;
    if (state.compareMeasures.has(row.file)) return;
    state.compareMeasures.set(row.file, "loading");
    const name = row.file.replace(/\.[^./]+$/, "") + ".json";
    fetch(attrsBase + encodeURIComponent(name))
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const md = (data.submetrics && data.submetrics.measure_density) || {};
        const dense = densifyMeasures(md.measures || []);
        const maxNps = dense.length ? Math.max(...dense) : 0;
        state.compareMeasures.set(row.file, { dense, maxNps });
        drawCardDensity(row);
      })
      .catch(() => {
        state.compareMeasures.set(row.file, "error");
        drawCardDensity(row);
      });
  }

  function densifyMeasures(measures) {
    if (!measures.length) return [];
    let maxM = 0;
    for (const b of measures) if (b.m > maxM) maxM = b.m;
    const arr = new Array(maxM + 1).fill(0);
    for (const b of measures) arr[b.m] = b.nps || 0;
    return arr;
  }

  // matplotlib-style jet colormap. t in [0, 1].
  function jet(t) {
    if (!(t > 0)) return "rgb(0, 0, 128)";
    if (t >= 1) return "rgb(128, 0, 0)";
    const r = clamp01(1.5 - Math.abs(4 * t - 3));
    const g = clamp01(1.5 - Math.abs(4 * t - 2));
    const b = clamp01(1.5 - Math.abs(4 * t - 1));
    return `rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function drawCardDensity(row) {
    const canvas = els.compareCards.querySelector(
      `[data-na-compare-density="${cssEscape(row.file)}"]`
    );
    if (!canvas) return;
    const entry = state.compareMeasures.get(row.file);
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Background — subtle so empty buckets and the canvas extent are visible.
    ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
    ctx.fillRect(0, 0, w, h);
    if (!entry || entry === "loading" || entry === "error") return;
    const dense = entry.dense || [];
    if (!dense.length) return;
    const heightScale = entry.maxNps || 1;
    const barW = w / dense.length;
    const minDraw = Math.max(0.6, barW);
    for (let i = 0; i < dense.length; i++) {
      const v = dense[i];
      if (v <= 0) continue;
      const t = v / DENSITY_BAR_ABS_CAP;
      const barH = (v / heightScale) * (h - 1);
      ctx.fillStyle = jet(t);
      ctx.fillRect(i * barW, h - barH, minDraw, barH);
    }
  }

  function flashFullCue() {
    if (!els.searchResults) return;
    els.searchResults.classList.add("is-full");
    setTimeout(() => els.searchResults.classList.remove("is-full"), 600);
  }

  function renderCompare() {
    renderCompareCards();
    renderCompareTable();
  }

  function renderCompareCards() {
    // Destroy any existing chart instances before re-rendering — Chart.js
    // leaks if you replace the canvas without destroying.
    state.compareCharts.forEach((c) => c.destroy());
    state.compareCharts.clear();

    if (!state.compareSet.length) {
      els.compareCards.innerHTML = `<p class="note-attrs-empty">No charts yet.<br>Open search (Ctrl+K) to add up to ${COMPARE_MAX}.</p>`;
      return;
    }
    els.compareCards.innerHTML = state.compareSet.map((r, i) => {
      const family = r.family ? `<span class="note-attrs-compare-family">${escapeHtml(r.family)}</span>` : "";
      const modeCls = `note-attrs-row-mode--${r.mode.toLowerCase()}`;
      const tags = (r.tags || [])
        .map((t) => {
          const desc = TAG_DESCRIPTIONS[t] || "";
          const help = desc
            ? `<span class="note-attrs-compare-tag-help" title="${escapeHtml(desc)}" aria-label="What is ${escapeHtml(t)}">ⓘ</span>`
            : "";
          return `<span class="note-attrs-compare-tag">${escapeHtml(t)}${help}</span>`;
        })
        .join("");
      const tagsBlock = tags
        ? `<div class="note-attrs-compare-card-tags">${tags}</div>`
        : "";
      return `
        <div class="note-attrs-compare-card" data-na-compare-slot="${i}">
          <div class="note-attrs-compare-card-head">
            <span class="note-attrs-compare-mode ${modeCls}">${r.mode}</span>
            ${family}
            <button type="button" class="note-attrs-compare-preview"
                    data-na-compare-preview="${escapeHtml(r.file)}"
                    title="Open in chart preview"
                    aria-label="Preview chart">▶</button>
            <button type="button" class="note-attrs-compare-close"
                    data-na-compare-remove="${escapeHtml(r.file)}"
                    aria-label="Remove from comparison">&times;</button>
          </div>
          <div class="note-attrs-compare-card-title" title="${escapeHtml(r.title || r.file)}">${escapeHtml(r.title || r.file)}</div>
          <div class="note-attrs-compare-card-radar">
            <canvas data-na-compare-radar="${escapeHtml(r.file)}"></canvas>
          </div>
          <div class="note-attrs-compare-card-density">
            <canvas data-na-compare-density="${escapeHtml(r.file)}"></canvas>
          </div>
          ${tagsBlock}
        </div>
      `;
    }).join("");

    // Wire close buttons.
    els.compareCards.querySelectorAll("[data-na-compare-remove]").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCompare(btn.dataset.naCompareRemove));
    });

    // Wire preview buttons. Narrow viewports route to the dedicated mobile
    // preview page; everything else opens the in-page modal. The viewport
    // check fires at click time so a device-rotation mid-session picks the
    // right path.
    els.compareCards.querySelectorAll("[data-na-compare-preview]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = state.compareSet.find((r) => r.file === btn.dataset.naComparePreview);
        if (!row) return;
        const isMobile = typeof window.matchMedia === "function" &&
          window.matchMedia("(max-width: 900px)").matches;
        if (isMobile) {
          if (row.md5) location.href = "/chart-preview/m?md5=" + encodeURIComponent(row.md5);
          return;
        }
        if (typeof window.openChartPreview === "function") window.openChartPreview(row);
      });
    });

    // Render radars after the canvases are in the DOM.
    state.compareSet.forEach((r) => {
      const canvas = els.compareCards.querySelector(
        `[data-na-compare-radar="${cssEscape(r.file)}"]`
      );
      if (!canvas) return;
      drawCompareRadar(canvas, r);
    });

    // Density bars — draws what's cached, draws placeholder background
    // for rows still loading. ensureMeasures() will redraw when fetch
    // resolves.
    state.compareSet.forEach((r) => {
      ensureMeasures(r);
      drawCardDensity(r);
      const dcanvas = els.compareCards.querySelector(
        `[data-na-compare-density="${cssEscape(r.file)}"]`
      );
      if (dcanvas) attachDensityTooltip(dcanvas, r);
    });
  }

  // Phase 1Z-1K (2026-05-26): per-bucket NPS tooltip for the density
  // strip. Reuses the radar tooltip element (single floating div).
  // x → bucket index = floor(x / canvasWidth × dense.length). Shows
  // "sec N · V NPS"; hides on empty buckets to avoid noise during idle
  // seconds.
  function attachDensityTooltip(canvas, row) {
    const tip = getRadarTooltipEl();
    canvas.addEventListener("mousemove", (e) => {
      const entry = state.compareMeasures.get(row.file);
      if (!entry || typeof entry !== "object") { tip.style.display = "none"; return; }
      const dense = entry.dense || [];
      if (!dense.length) { tip.style.display = "none"; return; }
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.floor((x / rect.width) * dense.length);
      if (idx < 0 || idx >= dense.length) { tip.style.display = "none"; return; }
      const v = dense[idx];
      tip.textContent = `sec ${idx} · ${v.toFixed(0)} NPS`;
      tip.style.display = "block";
      tip.style.left = (e.clientX + window.scrollX + 12) + "px";
      tip.style.top  = (e.clientY + window.scrollY + 12) + "px";
    });
    canvas.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  }

  function drawCompareRadar(canvas, row) {
    if (!window.Chart) {
      setTimeout(() => drawCompareRadar(canvas, row), 100);
      return;
    }
    // Per-axis p95 normalization: `x_axis / p95_axis_per_mode` clipped at
    // 1.0. Visual saturation tracks the red-tier intensity threshold so
    // sparse axes (LN/scratch/soft) read with the same emphasis as dense
    // axes (chord/stream). raw values still drive the table column.
    const p95 = AXIS_RADAR_NORM[row.mode] || AXIS_RADAR_NORM.SP;
    const rawData = AXES.map((a) => row["x_" + a] || 0);
    const data = AXES.map((a, i) => {
      const denom = p95[a] || 1;
      return Math.min(rawData[i] / denom, 1.0);
    });
    const intensities = row.axis_intensities || {};
    const pointColors = AXES.map((a) => INTENSITY_COLORS[intensities[a] == null ? "null" : intensities[a]]);
    const chart = new window.Chart(canvas, {
      type: "radar",
      data: {
        labels: AXIS_LABELS,
        datasets: [{
          data,
          fill: true,
          backgroundColor: "rgba(96, 165, 250, 0.20)",
          borderColor: "rgba(59, 130, 246, 0.7)",
          borderWidth: 1.2,
          // Phase 1Z-1G (2026-05-25): no point markers — the axis labels
          // carry the hover tooltip instead (see attachRadarLabelTooltip).
          pointRadius: 0,
          pointHoverRadius: 0,
          pointBorderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          // Chart.js tooltip disabled — point markers are gone, so the
          // built-in tooltip has nothing to bind to. Custom DOM tooltip
          // wired to the label hit zones takes over.
          tooltip: { enabled: false },
        },
        scales: {
          r: {
            min: 0,
            max: 1,
            ticks: { stepSize: 0.25, backdropColor: "transparent", font: { size: 9 } },
            pointLabels: {
              font: { size: 10, weight: "600" },
              color: (ctx) => pointColors[ctx.index],
            },
          },
        },
      },
    });
    state.compareCharts.set(row.file, chart);
    // Tooltip shows raw `x_axis` values (data passed to chart is per-axis
    // p95-normalized; raw is what users expect to read out).
    attachRadarLabelTooltip(canvas, chart, rawData);
  }

  // Phase 1Z-1G (2026-05-25): per-label hover tooltip for the compare
  // radars. Hit-tests against the label coords Chart.js exposes via
  // `scales.r._pointLabelItems` — radius-based so we don't need exact
  // text bounding boxes (labels never overlap in a 6-axis 240px radar).
  let _radarTooltipEl = null;

  function getRadarTooltipEl() {
    if (_radarTooltipEl) return _radarTooltipEl;
    const el = document.createElement("div");
    el.className = "note-attrs-radar-tooltip";
    el.style.display = "none";
    document.body.appendChild(el);
    _radarTooltipEl = el;
    return el;
  }

  function attachRadarLabelTooltip(canvas, chart, data) {
    const tip = getRadarTooltipEl();
    const hitRadius = 28;
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const items = (chart.scales && chart.scales.r && chart.scales.r._pointLabelItems) || [];
      let hit = -1;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const dx = x - it.x;
        const dy = y - it.y;
        if (dx * dx + dy * dy < hitRadius * hitRadius) { hit = i; break; }
      }
      if (hit === -1) { tip.style.display = "none"; return; }
      tip.textContent = `${AXIS_LABELS[hit]}: ${(data[hit] || 0).toFixed(3)}`;
      tip.style.display = "block";
      tip.style.left = (e.clientX + window.scrollX + 10) + "px";
      tip.style.top  = (e.clientY + window.scrollY + 10) + "px";
    });
    canvas.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  }

  // Phase 1Z-1G (2026-05-25): comparison table columns.
  // 9 metrics: NPS · 6 character axes · peak · BPM. Family was removed
  // (cards already carry the family badge).
  // Layout: rows = charts, columns = metrics. Leftmost column (chart
  // title) is sticky so it stays visible while horizontally scrolling.
  const COMPARE_COLS = [
    // Phase 1Z-1L (2026-05-26): BPM column shows musical range when the
    // chart has BPM variation across note-bearing segments. `bpm_min_musical`
    // and `bpm_max_musical` from the backend are filtered to plausible
    // musical range [30, 1500] to drop gimmick-trick segments (e.g.
    // Aleph-0 m204) that would otherwise inflate the max. Falls back to
    // single BPM when min ≈ max (Δ < 1) or when range data is missing.
    { key: "bpm",      label: "BPM",
      get: (r) => (r.density && r.density.bpm_max_musical) || r.header_bpm || r.effective_bpm || 0,
      fmt: (v, r) => {
        const lo = r && r.density && r.density.bpm_min_musical;
        const hi = r && r.density && r.density.bpm_max_musical;
        if (lo != null && hi != null && Math.abs(hi - lo) >= 1) {
          return `${Math.round(lo)} – ${Math.round(hi)}`;
        }
        const single = (r && r.header_bpm) || (r && r.effective_bpm) || v;
        return String(Math.round(single));
      } },
    { key: "irt_easy", label: "EASY", get: (r) => (r.irt && typeof r.irt.easy === "number") ? r.irt.easy : null,
      fmt: (v) => (v == null ? "—" : v.toFixed(2)) },
    { key: "irt_hard", label: "HARD", get: (r) => (r.irt && typeof r.irt.hard === "number") ? r.irt.hard : null,
      fmt: (v) => (v == null ? "—" : v.toFixed(2)) },
    // Phase 1Z-1G (2026-05-25): NPS split into min / mean / max — all
    // over aligned 1-sec felt-time buckets (active only). nps_mean
    // falls back to density.nps when measure_density wasn't recorded.
    // Phase 1Z-1J revert (2026-05-26): sliding-window form abandoned
    // because the scalar must equal `max(visible bars)` for the table
    // to cross-check against the per-card density bar visualization;
    // peak_uppercut already carries the burst signal in the axis layer.
    { key: "nps_min",  label: "NPS min",  get: (r) => (r.density && r.density.nps_min)  ?? 0,                            fmt: (v) => v.toFixed(1) },
    { key: "nps_mean", label: "NPS mean", get: (r) => (r.density && (r.density.nps_mean ?? r.density.nps)) || 0,         fmt: (v) => v.toFixed(1) },
    { key: "nps_max",  label: "NPS max",  get: (r) => (r.density && r.density.nps_max)  ?? 0,                            fmt: (v) => v.toFixed(1) },
    // Phase 1Z-1L (2026-05-26): Pos/s — distinct timing positions per
    // second. NPS = Pos/s × avg_chord_size, so two charts at the same
    // NPS may differ in mechanism (Skydive: 7 pos × 6.7 chord vs FD
    // [FOUR DIMENSIONS]: 12 pos × 3.3 chord). Pos/s makes the
    // position-rate component explicit alongside raw NPS.
    { key: "pos_per_sec", label: "Pos/s", get: (r) => (r.density && r.density.distinct_per_sec) ?? 0,                     fmt: (v) => v.toFixed(1) },
    { key: "chord",       label: "Chord",       axis: "chord",       get: (r) => r.x_chord || 0,       fmt: (v) => v.toFixed(3) },
    { key: "stream",      label: "Stream",      axis: "stream",      get: (r) => r.x_stream || 0,      fmt: (v) => v.toFixed(3) },
    { key: "scratch",     label: "Scratch",     axis: "scratch",     get: (r) => r.x_scratch || 0,     fmt: (v) => v.toFixed(3) },
    { key: "soft",        label: "Soft",        axis: "soft",        get: (r) => r.x_soft || 0,        fmt: (v) => v.toFixed(3) },
    { key: "ln",          label: "LN",          axis: "ln",          get: (r) => r.x_ln || 0,          fmt: (v) => v.toFixed(3) },
    { key: "stair",       label: "Stair",       axis: "stair",       get: (r) => r.x_stair || 0,       fmt: (v) => v.toFixed(3) },
    { key: "distraction", label: "Dist", axis: "distraction", get: (r) => r.x_distraction || 0, fmt: (v) => v.toFixed(3) },
    { key: "peak",        label: "Peak",        axis: "peak",        get: (r) => r.x_peak || 0,        fmt: (v) => v.toFixed(3) },
  ];

  function sortIndicator(key) {
    if (!state.sort || state.sort.key !== key) return "";
    return state.sort.dir === "asc"
      ? ` <span class="note-attrs-compare-sortind">↑</span>`
      : ` <span class="note-attrs-compare-sortind">↓</span>`;
  }

  function getSortedCompareSet() {
    if (!state.sort) return state.compareSet.slice();
    const { key, dir } = state.sort;
    let getter;
    if (key === "title") {
      getter = (r) => (r.title || r.file || "").toLowerCase();
    } else {
      const col = COMPARE_COLS.find((c) => c.key === key);
      if (!col) return state.compareSet.slice();
      getter = col.get;
    }
    const arr = state.compareSet.slice();
    arr.sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      const mul = dir === "asc" ? 1 : -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * mul;
      }
      return ((va || 0) - (vb || 0)) * mul;
    });
    return arr;
  }

  function handleSort(key) {
    if (state.sort && state.sort.key === key) {
      state.sort.dir = state.sort.dir === "desc" ? "asc" : "desc";
    } else {
      // Title default = asc (A→Z), numeric default = desc (high→low).
      state.sort = { key, dir: key === "title" ? "asc" : "desc" };
    }
    renderCompareTable();
  }

  function renderCompareTable() {
    if (!state.compareSet.length) {
      els.compareTable.innerHTML = "";
      return;
    }
    const headerCells = COMPARE_COLS
      .map((c) => `<th class="note-attrs-compare-sortable" data-na-sort="${escapeHtml(c.key)}">${escapeHtml(c.label)}${sortIndicator(c.key)}</th>`)
      .join("");

    const colCount = COMPARE_COLS.length;
    const sorted = getSortedCompareSet();
    // Per-chart block = title row (spans all metric columns) + header row
    // (repeated for legibility while scrolling) + values row.
    const bodyRows = sorted.map((r) => {
      const modeCls = `note-attrs-row-mode--${r.mode.toLowerCase()}`;
      const familyBadge = r.family ? `<span class="note-attrs-compare-family">${escapeHtml(r.family)}</span>` : "";
      const titleRow = `
        <tr class="note-attrs-compare-titlerow">
          <th colspan="${colCount}" class="note-attrs-compare-titlecell" title="${escapeHtml(r.title || r.file)}">
            <span class="note-attrs-compare-mode ${modeCls}">${r.mode}</span>
            ${familyBadge}
            <span class="note-attrs-compare-rowtitle">${escapeHtml(r.title || r.file)}</span>
          </th>
        </tr>
      `;
      const headerRow = `<tr class="note-attrs-compare-headerrow">${headerCells}</tr>`;
      const valueCells = COMPARE_COLS.map((c) => {
        const v = c.get(r);
        let cls = "note-attrs-compare-td";
        let style = "";
        if (c.axis) {
          const lvl = (r.axis_intensities || {})[c.axis];
          if (lvl) {
            cls += ` is-${lvl}`;
            const fill = INTENSITY_FILLS[lvl];
            if (fill) style = `style="background:${fill}"`;
          }
        }
        const pct = topPercent(r.mode, c.key, v);
        const pctLine = pct != null
          ? `<div class="note-attrs-compare-pct">${escapeHtml(fmtTop(pct))}</div>`
          : "";
        return `<td class="${cls}" ${style}>
          <div class="note-attrs-compare-val">${escapeHtml(c.fmt(v, r))}</div>
          ${pctLine}
        </td>`;
      }).join("");
      const valueRow = `<tr class="note-attrs-compare-valuerow">${valueCells}</tr>`;
      return titleRow + headerRow + valueRow;
    }).join("");

    els.compareTable.innerHTML = `
      <table class="note-attrs-compare-table">
        <tbody>${bodyRows}</tbody>
      </table>
    `;

    // Sort handlers bind to ALL header cells (each chart block has its
    // own repeated header). Clicking any "BPM" header sorts the chart
    // blocks globally; sort indicators show on every repetition.
    els.compareTable.querySelectorAll("[data-na-sort]").forEach((th) => {
      th.addEventListener("click", () => handleSort(th.dataset.naSort));
    });
  }

  function cssEscape(s) {
    // CSS.escape is enough for selectors; fall back to a basic replacement
    // for old browsers (defensive — modern target only).
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    return String(s).replace(/(["\\\]\[])/g, "\\$1");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
