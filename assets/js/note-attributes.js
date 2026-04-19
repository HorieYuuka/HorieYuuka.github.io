(function () {
  "use strict";

  const PAGE_SIZE = 50;
  const AXES = ["chord", "stream", "scratch", "soft", "ln", "stair", "peak", "jack"];
  const AXIS_LABELS = ["Chord", "Stream", "Scratch", "Soft", "LN", "Stair", "Peak", "Jack"];

  const TAG_LABELS = {
    big_chord_burst: "Big Chord Burst",
    burst_focused: "Burst Focus",
    chord_heavy: "Chord Density",
    chord_stream: "Chord Stream",
    dense_chart: "High Density",
    extreme_burst: "Extreme Burst",
    fast_chart: "Fast Tempo",
    gimmick_soflan: "Gimmick Soflan",
    jack_chart: "Jack Pattern",
    ln_chart: "Long Note",
    peak_intense: "Peak Intensity",
    peak_outlier: "Peak Outlier",
    pure_stream: "Pure Stream",
    scratch_active: "Scratch",
    slow_chart: "Slow Tempo",
    soflan: "Soflan",
    stair_focused: "Stair Pattern",
    stream_heavy: "Stream Density",
    sustained: "Sustained Density",
    visual_gimmick: "Visual Gimmick",
  };

  const SCALE_ORDER = ["sl", "st", "so", "sn", "DPsl", "DPst", "★", "★★"];

  function tagLabel(t) {
    return TAG_LABELS[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const root = document.querySelector("[data-note-attrs]");
  if (!root) return;

  const summaryUrl = root.dataset.summaryUrl;
  const attrsBase = root.dataset.attrsBase;

  const els = {
    search: root.querySelector("[data-na-search]"),
    modes: Array.from(root.querySelectorAll("[data-na-mode]")),
    scales: root.querySelector("[data-na-scales]"),
    tags: root.querySelector("[data-na-tags]"),
    sort: root.querySelector("[data-na-sort]"),
    count: root.querySelector("[data-na-count]"),
    list: root.querySelector("[data-na-list]"),
    prev: root.querySelector("[data-na-prev]"),
    next: root.querySelector("[data-na-next]"),
    page: root.querySelector("[data-na-page]"),
    detail: root.querySelector("[data-na-detail]"),
    tpl: document.getElementById("note-attrs-detail-tpl"),
  };

  const state = {
    rows: [],
    filtered: [],
    page: 0,
    selectedScales: new Set(),
    selectedTags: new Set(),
    selected: null,
    chart: null,
    detailToken: 0,
  };

  function init() {
    fetch(summaryUrl)
      .then((r) => r.json())
      .then((rows) => {
        state.rows = rows.map((r) => ({ ...r, scales: r.scales || [] }));
        buildScalePills();
        buildTagPills();
        bindEvents();
        applyHashSelection();
        refresh();
      })
      .catch((err) => {
        els.count.textContent = "Failed to load summary: " + err;
      });
  }

  function buildScalePills() {
    const scales = new Set();
    state.rows.forEach((r) => (r.scales || []).forEach((s) => scales.add(s)));
    const ordered = Array.from(scales).sort((a, b) => {
      const ia = SCALE_ORDER.indexOf(a);
      const ib = SCALE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    els.scales.innerHTML = "";
    ordered.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-attrs-pill";
      btn.dataset.value = s;
      btn.textContent = s;
      btn.addEventListener("click", () => {
        if (state.selectedScales.has(s)) {
          state.selectedScales.delete(s);
          btn.classList.remove("is-active");
        } else {
          state.selectedScales.add(s);
          btn.classList.add("is-active");
        }
        state.page = 0;
        refresh();
      });
      els.scales.appendChild(btn);
    });
  }

  function buildTagPills() {
    const tags = new Set();
    state.rows.forEach((r) => (r.tags || []).forEach((t) => tags.add(t)));
    const ordered = Array.from(tags).sort();
    els.tags.innerHTML = "";
    ordered.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-attrs-pill";
      btn.dataset.value = t;
      btn.textContent = tagLabel(t);
      btn.addEventListener("click", () => {
        if (state.selectedTags.has(t)) {
          state.selectedTags.delete(t);
          btn.classList.remove("is-active");
        } else {
          state.selectedTags.add(t);
          btn.classList.add("is-active");
        }
        state.page = 0;
        refresh();
      });
      els.tags.appendChild(btn);
    });
  }

  function bindEvents() {
    els.search.addEventListener("input", () => {
      state.page = 0;
      refresh();
    });
    els.modes.forEach((cb) =>
      cb.addEventListener("change", () => {
        state.page = 0;
        refresh();
      })
    );
    els.sort.addEventListener("change", () => {
      state.page = 0;
      refresh();
    });
    els.prev.addEventListener("click", () => {
      if (state.page > 0) {
        state.page -= 1;
        renderList();
      }
    });
    els.next.addEventListener("click", () => {
      const maxPage = Math.max(0, Math.ceil(state.filtered.length / PAGE_SIZE) - 1);
      if (state.page < maxPage) {
        state.page += 1;
        renderList();
      }
    });
    window.addEventListener("hashchange", applyHashSelection);
  }

  function applyHashSelection() {
    const m = window.location.hash.match(/chart=([^&]+)/);
    if (!m) return;
    const file = decodeURIComponent(m[1]);
    state.selected = file;
    if (state.rows.length) renderDetail(file);
  }

  function activeModes() {
    return new Set(els.modes.filter((cb) => cb.checked).map((cb) => cb.value));
  }

  function refresh() {
    const q = els.search.value.trim().toLowerCase();
    const modes = activeModes();
    const sortKey = els.sort.value;

    state.filtered = state.rows.filter((r) => {
      if (!modes.has(r.mode)) return false;
      if (state.selectedScales.size) {
        const has = (r.scales || []).some((s) => state.selectedScales.has(s));
        if (!has) return false;
      }
      if (state.selectedTags.size) {
        const tagSet = new Set(r.tags || []);
        for (const t of state.selectedTags) if (!tagSet.has(t)) return false;
      }
      if (q) {
        const hay = (r.title + " " + r.artist).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const [field, dir] = sortKey.split(":");
    const mul = dir === "asc" ? 1 : -1;
    state.filtered.sort((a, b) => {
      const va = a[field], vb = b[field];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    });

    renderList();
  }

  function renderList() {
    const total = state.filtered.length;
    const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
    if (state.page > maxPage) state.page = maxPage;
    const start = state.page * PAGE_SIZE;
    const slice = state.filtered.slice(start, start + PAGE_SIZE);

    els.count.textContent = `${total} chart${total === 1 ? "" : "s"}`;
    els.page.textContent = total ? `${state.page + 1} / ${maxPage + 1}` : "—";
    els.prev.disabled = state.page === 0;
    els.next.disabled = state.page >= maxPage;

    els.list.innerHTML = "";
    slice.forEach((r) => {
      const li = document.createElement("li");
      li.className = "note-attrs-row";
      if (r.file === state.selected) li.classList.add("is-selected");
      const scaleTags = (r.scales || [])
        .map((s) => `<span class="note-attrs-scale-tag">${escapeHtml(s)}</span>`)
        .join("");
      li.innerHTML = `
        <span class="note-attrs-row-mode note-attrs-row-mode--${r.mode.toLowerCase()}">${r.mode}</span>
        <span class="note-attrs-row-scales">${scaleTags}</span>
        <span class="note-attrs-row-title">${escapeHtml(r.title || r.file)}</span>
        <span class="note-attrs-row-sum">${(r.sum || 0).toFixed(2)}</span>
      `;
      li.addEventListener("click", () => {
        state.selected = r.file;
        window.location.hash = "chart=" + encodeURIComponent(r.file);
        renderList();
        renderDetail(r.file);
      });
      els.list.appendChild(li);
    });
  }

  function renderDetail(file) {
    const row = state.rows.find((r) => r.file === file);
    if (!row) return;
    const token = ++state.detailToken;

    els.detail.innerHTML = "";
    const node = els.tpl.content.cloneNode(true);
    els.detail.appendChild(node);

    const titleEl = els.detail.querySelector("[data-na-title]");
    const metaEl = els.detail.querySelector("[data-na-meta]");
    const tagsRow = els.detail.querySelector("[data-na-tags-row]");
    const md5El = els.detail.querySelector("[data-na-md5]");

    titleEl.textContent = row.title || row.file;
    const metaParts = [
      row.artist,
      row.mode,
      (row.scales || []).join(" / "),
      `${row.header_bpm || row.effective_bpm || 0} BPM`,
      `${row.total_notes || 0} notes`,
    ].filter(Boolean);
    metaEl.textContent = metaParts.join(" · ");
    tagsRow.innerHTML = (row.tags || [])
      .map((t) => `<span class="note-attrs-tag">${escapeHtml(tagLabel(t))}</span>`)
      .join("");
    md5El.textContent = row.md5 || "(unknown)";

    const canvas = els.detail.querySelector("[data-na-radar]");
    const data = AXES.map((a) => row["x_" + a] || 0);
    drawRadar(canvas, data);

    fetch(attrsBase + encodeURIComponent(file.replace(/\.(bms|bme|bml)$/i, "")) + ".json")
      .then((r) => (r.ok ? r.json() : null))
      .then((attrs) => {
        if (token !== state.detailToken || !attrs) return;
        renderSubmetrics(els.detail.querySelector("[data-na-submetrics]"), attrs);
      })
      .catch(() => {});
  }

  function renderSubmetrics(table, attrs) {
    const sm = attrs.submetrics || {};
    const rows = [];
    AXES.forEach((axis) => {
      const block = sm[axis];
      if (!block) return;
      Object.entries(block).forEach(([k, v]) => {
        rows.push([axis, k, v]);
      });
    });
    table.innerHTML =
      "<thead><tr><th>Axis</th><th>Metric</th><th>Value</th></tr></thead>" +
      "<tbody>" +
      rows
        .map(
          ([axis, k, v]) =>
            `<tr><td>${axis}</td><td>${escapeHtml(k)}</td><td>${formatVal(v)}</td></tr>`
        )
        .join("") +
      "</tbody>";
  }

  function formatVal(v) {
    if (typeof v === "number") {
      if (Number.isInteger(v)) return String(v);
      return v.toFixed(4);
    }
    return escapeHtml(String(v));
  }

  function drawRadar(canvas, data) {
    if (!window.Chart) {
      // Chart.js not yet loaded; retry shortly
      setTimeout(() => drawRadar(canvas, data), 100);
      return;
    }
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    state.chart = new window.Chart(canvas, {
      type: "radar",
      data: {
        labels: AXIS_LABELS,
        datasets: [
          {
            label: "axis",
            data,
            fill: true,
            backgroundColor: "rgba(96, 165, 250, 0.25)",
            borderColor: "rgba(59, 130, 246, 0.9)",
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 1,
            ticks: { stepSize: 0.2, backdropColor: "transparent" },
            pointLabels: { font: { size: 12 } },
          },
        },
      },
    });
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
