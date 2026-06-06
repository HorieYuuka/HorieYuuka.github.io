/* chart-search.js — reusable chart search modal.
 *
 * Factory that wires a <dialog>-based search UI to a corpus of chart rows
 * (typically loaded from Resource/NoteAttributes/summary.json). Caller
 * provides the modal elements and an `onSelect(row)` callback that decides
 * what happens when the user picks a result. Returning truthy from
 * `onSelect` closes the modal; falsy leaves it open (e.g. when a compare
 * table is full and the user must remove a card first).
 */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function create(opts) {
    const o = Object.assign({
      modal: null,
      input: null,
      results: null,
      close: null,                    // optional close button
      rows: [],
      onSelect: null,                 // (row) => truthy to close, falsy to stay
      maxResults: Infinity,
      debounceMs: 80,
      kbShortcuts: false,             // bind Ctrl+K / `/` at document level
      resultClass: "note-attrs-search-result",
      activeClass: "is-active",
      // Result row HTML template — receives the row and returns a string.
      // Default mirrors the note-attributes shape (mode chip, family,
      // title, artist).
      renderRow: null,
    }, opts || {});

    if (!o.modal || !o.input || !o.results) return null;

    let corpus = o.rows.slice();
    let activeIdx = 0;
    let debounceTimer = null;

    function defaultRenderRow(r) {
      const family = r.family
        ? `<span class="note-attrs-search-family">${escapeHtml(r.family)}</span>`
        : "";
      return `
        <span class="note-attrs-search-mode note-attrs-row-mode--${(r.mode || "").toLowerCase()}">${escapeHtml(r.mode || "")}</span>
        ${family}
        <span class="note-attrs-search-title">${escapeHtml(r.title || r.file || "")}</span>
        <span class="note-attrs-search-artist">${escapeHtml(r.artist || "")}</span>
      `;
    }
    const renderRow = o.renderRow || defaultRenderRow;

    function highlight(items) {
      items.forEach((li, i) => li.classList.toggle(o.activeClass, i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: "nearest" });
    }

    function render() {
      const q = o.input.value.trim().toLowerCase();
      o.results.innerHTML = "";
      if (!q) return;
      const matches = [];
      for (const r of corpus) {
        const hay = o.titleOnly
          ? (r.title || "").toLowerCase()
          : ((r.title || "") + " " + (r.artist || "")).toLowerCase();
        if (!hay.includes(q)) continue;
        matches.push(r);
        if (matches.length >= o.maxResults) break;
      }
      // SP > DP > other. Stable sort preserves within-mode order.
      const MODE_RANK = { SP: 0, DP: 1 };
      matches.sort((a, b) => (MODE_RANK[a.mode] ?? 2) - (MODE_RANK[b.mode] ?? 2));
      matches.forEach((r, i) => {
        const li = document.createElement("li");
        li.className = o.resultClass;
        if (i === activeIdx) li.classList.add(o.activeClass);
        li.innerHTML = renderRow(r);
        li.addEventListener("click", () => {
          const shouldClose = o.onSelect ? !!o.onSelect(r) : true;
          if (shouldClose) close();
        });
        o.results.appendChild(li);
      });
    }

    function open() {
      if (!o.modal || o.modal.open) return;
      o.modal.showModal();
      o.input.focus();
      render();
    }

    function close() {
      if (o.modal && o.modal.open) o.modal.close();
    }

    function setRows(newRows) {
      corpus = (newRows || []).slice();
      if (o.modal.open) render();
    }

    // ── wire events ─────────────────────────────────────────────────────
    if (o.close) o.close.addEventListener("click", close);
    o.modal.addEventListener("close", () => {
      o.input.value = "";
      o.results.innerHTML = "";
      activeIdx = 0;
    });
    o.modal.addEventListener("click", (e) => {
      if (e.target === o.modal) close();
    });
    o.input.addEventListener("input", () => {
      activeIdx = 0;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(render, o.debounceMs);
    });
    o.input.addEventListener("keydown", (e) => {
      const items = o.results.querySelectorAll("li");
      const k = e.key;
      if (k === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        highlight(items);
      } else if (k === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlight(items);
      } else if (k === "Enter") {
        if (items.length > 0) {
          e.preventDefault();
          items[activeIdx]?.click();
        }
      }
    });

    if (o.kbShortcuts) {
      document.addEventListener("keydown", (e) => {
        const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target && e.target.tagName) || ""
        );
        const ctrl = e.ctrlKey || e.metaKey;
        const k = (e.key || "").toLowerCase();
        if (ctrl && k === "k") {
          e.preventDefault();
          open();
        } else if (k === "/" && !inField && !o.modal.open) {
          e.preventDefault();
          open();
        }
      });
    }

    return { open, close, setRows, rebuild: render };
  }

  if (typeof window !== "undefined") {
    window.ChartSearch = { create };
  }
})();
