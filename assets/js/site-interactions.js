(function () {
  "use strict";

  function initTabs(root) {
    const buttons = Array.from(root.querySelectorAll("[data-tab-target]"));
    const panels = Array.from(root.querySelectorAll("[data-tab-panel]"));
    if (!buttons.length || !panels.length) {
      return;
    }

    const activate = (tabId) => {
      buttons.forEach((button) => {
        const isActive = button.dataset.tabTarget === tabId;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
        button.setAttribute("tabindex", isActive ? "0" : "-1");
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.tabPanel === tabId;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      });
    };

    buttons.forEach((button) => {
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => activate(button.dataset.tabTarget));
    });

    const tabList = root.querySelector("[role='tablist']");
    if (tabList) {
      tabList.addEventListener("keydown", (event) => {
        const currentIndex = buttons.findIndex((button) => button.classList.contains("is-active"));
        if (currentIndex === -1) {
          return;
        }

        let nextIndex = currentIndex;
        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % buttons.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        } else {
          return;
        }

        event.preventDefault();
        buttons[nextIndex].focus();
        activate(buttons[nextIndex].dataset.tabTarget);
      });
    }

    const initialButton = buttons.find((button) => button.classList.contains("is-active")) || buttons[0];
    activate(initialButton.dataset.tabTarget);
  }

  function initSortableTable(table) {
    if (table.dataset.sortInitialized === "true") {
      return;
    }

    const headRow = table.tHead && table.tHead.rows[0];
    const body = table.tBodies[0];
    if (!headRow || !body) {
      return;
    }

    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });

    const getCellValue = (row, index) => {
      const cell = row.cells[index];
      if (!cell) {
        return "";
      }
      return (cell.dataset.sortValue || cell.textContent || "").trim();
    };

    Array.from(headRow.cells).forEach((cell, index) => {
      if (!cell.hasAttribute("data-sort")) {
        return;
      }

      const label = cell.textContent.trim();
      const sortType = cell.dataset.sortType || "text";
      cell.setAttribute("aria-sort", "none");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.innerHTML = `<span>${label}</span><span class="sort-indicator" aria-hidden="true"></span>`;
      cell.textContent = "";
      cell.appendChild(button);

      button.addEventListener("click", () => {
        const rows = Array.from(body.rows);
        const currentDirection = cell.dataset.sortDirection === "asc" ? "asc" : "desc";
        const nextDirection = currentDirection === "asc" ? "desc" : "asc";

        Array.from(headRow.cells).forEach((header) => {
          header.dataset.sortDirection = "";
          header.setAttribute("aria-sort", "none");
        });

        rows.sort((left, right) => {
          const leftValue = getCellValue(left, index);
          const rightValue = getCellValue(right, index);

          let comparison = 0;
          if (sortType === "number") {
            comparison = Number(leftValue) - Number(rightValue);
          } else {
            comparison = collator.compare(leftValue, rightValue);
          }

          return nextDirection === "asc" ? comparison : -comparison;
        });

        rows.forEach((row) => body.appendChild(row));
        cell.dataset.sortDirection = nextDirection;
        cell.setAttribute("aria-sort", nextDirection === "asc" ? "ascending" : "descending");
      });
    });

    table.dataset.sortInitialized = "true";
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "";
    }
    return number.toFixed(3);
  }

  function buildScaleRow(entry) {
    const row = document.createElement("tr");
    const cells = [
      { text: entry.title, sortValue: entry.title },
      { text: entry.difficulty, sortValue: entry.difficulty },
      { text: formatNumber(entry.discrimination), sortValue: entry.discrimination },
      { text: formatNumber(entry.easy), sortValue: entry.easy },
      { text: formatNumber(entry.hard), sortValue: entry.hard },
    ];

    cells.forEach((cellData) => {
      const cell = document.createElement("td");
      cell.textContent = cellData.text;
      cell.dataset.sortValue = String(cellData.sortValue ?? "");
      row.appendChild(cell);
    });

    return row;
  }

  function initScaleAnalyzer(root) {
    const tables = Array.from(root.querySelectorAll("[data-scale-table]"));
    if (!tables.length) {
      return;
    }

    tables.forEach((table) => {
      const source = table.dataset.source;
      if (!source) {
        return;
      }

      const tbody = table.tBodies[0];
      if (!tbody) {
        return;
      }

      fetch(source)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load ${source}`);
          }
          return response.json();
        })
        .then((entries) => {
          const collator = new Intl.Collator(undefined, {
            numeric: true,
            sensitivity: "base",
          });

          entries.sort((left, right) => collator.compare(left.title, right.title));
          const fragment = document.createDocumentFragment();
          entries.forEach((entry) => fragment.appendChild(buildScaleRow(entry)));
          tbody.replaceChildren(fragment);

          const countTarget = root.querySelector(`[data-tab-count='${table.dataset.scaleTable}']`);
          if (countTarget) {
            countTarget.textContent = `${entries.length.toLocaleString()} charts`;
          }

          initSortableTable(table);
        })
        .catch((error) => {
          tbody.innerHTML = `<tr><td colspan="5">Failed to load data.</td></tr>`;
          console.error(error);
        });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function buildArchiveRow(entry) {
    const row = document.createElement("tr");
    const folder = entry.parent_path || entry.path || "";
    const directUrl = entry.direct_download_url || "";
    const shareUrl = entry.share_url || "";

    row.innerHTML = `
      <td data-sort-value="${escapeHtml(entry.name || "")}">${escapeHtml(entry.name || "")}</td>
      <td data-sort-value="${escapeHtml(folder)}">${escapeHtml(folder)}</td>
      <td class="archive-search-actions">
        ${directUrl ? `<a href="${encodeURI(directUrl)}" target="_blank" rel="noopener noreferrer">Download</a>` : ""}
        ${shareUrl ? `<a href="${encodeURI(shareUrl)}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}
      </td>
    `;

    return row;
  }

  function initArchiveSearch(root) {
    if (root.dataset.archiveSearchInitialized === "true") {
      return;
    }

    const source = root.dataset.source;
    const input = root.querySelector("[data-archive-search-input]");
    const resultBody = root.querySelector("[data-archive-search-results]");
    const summary = root.querySelector("[data-archive-search-summary]");
    const emptyState = root.querySelector("[data-archive-search-empty]");
    const table = root.querySelector("table.sortable-table");
    const initialLimit = Number(root.dataset.initialLimit || "150");
    const renderLimit = Number(root.dataset.renderLimit || "250");

    if (!source || !input || !resultBody || !summary || !emptyState || !table) {
      return;
    }

    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });

    let entries = [];

    const render = (query) => {
      const normalizedQuery = query.trim().toLowerCase();
      const filtered = normalizedQuery
        ? entries.filter((entry) => {
            const haystack = `${entry.name || ""} ${entry.path || ""} ${entry.parent_path || ""}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          })
        : entries.slice(0, initialLimit);

      const visible = normalizedQuery ? filtered.slice(0, renderLimit) : filtered;
      const fragment = document.createDocumentFragment();
      visible.forEach((entry) => fragment.appendChild(buildArchiveRow(entry)));
      resultBody.replaceChildren(fragment);

      const hiddenCount = Math.max(filtered.length - visible.length, 0);
      summary.textContent = normalizedQuery
        ? `${filtered.length.toLocaleString()} matches${hiddenCount ? `, showing first ${visible.length.toLocaleString()}` : ""}`
        : `${entries.length.toLocaleString()} files indexed, showing first ${visible.length.toLocaleString()}`;

      emptyState.hidden = visible.length > 0;
    };

    fetch(source)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${source}`);
        }
        return response.json();
      })
      .then((payload) => {
        const files = Array.isArray(payload.files) ? payload.files : [];
        files.sort((left, right) => collator.compare(left.name || "", right.name || ""));
        entries = files;
        render("");
        initSortableTable(table);
      })
      .catch((error) => {
        summary.textContent = "Failed to load file index.";
        emptyState.hidden = false;
        emptyState.textContent = "File metadata could not be loaded.";
        console.error(error);
      });

    input.addEventListener("input", (event) => {
      render(event.target.value || "");
    });

    root.dataset.archiveSearchInitialized = "true";
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tab-control]").forEach(initTabs);
    document.querySelectorAll("table.sortable-table").forEach(initSortableTable);
    document.querySelectorAll("[data-scale-analyzer]").forEach(initScaleAnalyzer);
    document.querySelectorAll("[data-archive-search]").forEach(initArchiveSearch);
  });
})();

