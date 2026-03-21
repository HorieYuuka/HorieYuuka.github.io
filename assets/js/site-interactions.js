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

  function formatBytes(value) {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 0) {
      return "";
    }

    if (size < 1024) {
      return `${size} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let normalized = size / 1024;
    let unitIndex = 0;

    while (normalized >= 1024 && unitIndex < units.length - 1) {
      normalized /= 1024;
      unitIndex += 1;
    }

    const digits = normalized >= 100 ? 0 : normalized >= 10 ? 1 : 2;
    return `${normalized.toFixed(digits)} ${units[unitIndex]}`;
  }

  function formatTimestamp(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function buildArchiveRow(entry, options = {}) {
    const row = document.createElement("tr");
    const sizeLabel = formatBytes(entry.sizeBytes);
    const fileId = entry.id || "";
    const isDownloading = options.downloadingFileId === fileId;
    const primaryName = entry.title
      ? `${entry.title}${entry.subtitle ? ` ${entry.subtitle}` : ""}`
      : (entry.name || "");
    const displayName = primaryName || entry.name || "";
    const artistName = entry.artist || "";
    const downloadLabel = displayName ? `Download ${displayName}` : "Download file";
    const columnMode = options.columnMode || "name-size-download";
    const nameMarkup = options.showSecondaryName && entry.artist && entry.title && entry.name && entry.title !== entry.name
        ? `<div class="archive-name-primary">${escapeHtml(displayName)}</div><div class="archive-name-secondary">${escapeHtml(entry.artist)} · ${escapeHtml(entry.name)}</div>`
        : escapeHtml(displayName);
    const middleCell = columnMode === "name-artist-download"
      ? `<td data-sort-value="${escapeHtml(artistName)}">${escapeHtml(artistName)}</td>`
      : `<td data-sort-value="${escapeHtml(String(entry.sizeBytes || ""))}">${escapeHtml(sizeLabel)}</td>`;

    row.innerHTML = `
      <td data-sort-value="${escapeHtml(displayName)}">${nameMarkup}</td>
      ${middleCell}
      <td data-sort-value="${escapeHtml(displayName)}">
        ${fileId ? `
          <button
            type="button"
            class="archive-download-link"
            data-archive-download
            data-file-id="${escapeHtml(fileId)}"
            aria-label="${escapeHtml(downloadLabel)}"
            title="${escapeHtml(downloadLabel)}"
            ${isDownloading ? "disabled" : ""}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2.5v7"></path>
              <path d="M5.5 7.5 8 10l2.5-2.5"></path>
              <path d="M3 12.5h10"></path>
            </svg>
          </button>
        ` : ""}
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
    const submitButton = root.querySelector("[data-archive-search-submit]");
    const clearButton = root.querySelector("[data-archive-search-clear]");
    const resultBody = root.querySelector("[data-archive-search-results]");
    const summary = root.querySelector("[data-archive-search-summary]");
    const emptyState = root.querySelector("[data-archive-search-empty]");
    const status = root.querySelector("[data-archive-search-status]");
    const pagination = root.querySelector("[data-archive-search-pagination]");
    const pageList = root.querySelector("[data-archive-page-list]");
    const prevButton = root.querySelector("[data-archive-page-prev]");
    const nextButton = root.querySelector("[data-archive-page-next]");
    const browserLabel = root.dataset.browserLabel || "Files";
    const itemLabelPlural = root.dataset.itemLabelPlural || "items";
    const pageLimit = Number(root.dataset.pageLimit || "100");
    const downloadGrantPathTemplate = root.dataset.downloadGrantPathTemplate || "/api/v1/files/{id}/download-grants";
    const columnMode = root.dataset.columnMode || "name-size-download";
    const showSecondaryName = root.dataset.showSecondaryName === "true";

    if (!source || !input || !submitButton || !clearButton || !resultBody || !summary || !emptyState || !status || !pagination || !pageList || !prevButton || !nextButton) {
      return;
    }

    const apiOrigin = new URL(source, window.location.href).origin;
    let entries = [];
    let hasMore = true;
    let isLoading = false;
    let activeQuery = "";
    let loadError = "";
    let currentPage = 1;
    let currentOffset = 0;
    let downloadingFileId = "";
    let statusMessage = "";
    const isLocalDevHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const titleLabel = browserLabel;
    const nounPlural = itemLabelPlural;

    const setOptionalText = (element, text) => {
      element.textContent = text;
      element.hidden = !text;
    };

    const getRequestUrl = () => {
      const url = new URL(source, window.location.href);
      url.searchParams.set("limit", String(pageLimit));
      url.searchParams.set("offset", String(currentOffset));
      if (activeQuery) {
        url.searchParams.set("q", activeQuery);
      }
      return url.toString();
    };

    const render = () => {
      const fragment = document.createDocumentFragment();
      entries.forEach((entry) => fragment.appendChild(buildArchiveRow(entry, { downloadingFileId, columnMode, showSecondaryName })));
      resultBody.replaceChildren(fragment);
      const loadedCount = entries.length.toLocaleString();
      const summaryText = loadError
        ? `Failed to load ${titleLabel}.`
        : activeQuery
          ? `Showing ${loadedCount} ${nounPlural} for "${activeQuery}" on page ${currentPage}.`
          : "";

      const statusText = loadError
        ? loadError
        : isLoading
          ? `Loading ${nounPlural}...`
          : statusMessage;
      setOptionalText(summary, summaryText);
      setOptionalText(status, statusText);
      emptyState.hidden = entries.length > 0;
      if (!emptyState.hidden) {
        emptyState.textContent = loadError
          ? `The file list could not be reached.`
          : activeQuery
            ? `No ${nounPlural} matched the current search.`
            : `No ${nounPlural} are available right now.`;
      }

      prevButton.disabled = isLoading || currentPage <= 1;
      nextButton.disabled = isLoading || !hasMore;
      submitButton.disabled = isLoading;
      clearButton.disabled = isLoading || (!activeQuery && !input.value.trim());
    };

    const renderPagination = () => {
      pageList.replaceChildren();
      const pageBlockSize = 10;
      const blockStart = Math.floor((currentPage - 1) / pageBlockSize) * pageBlockSize + 1;
      const blockEnd = hasMore
        ? blockStart + pageBlockSize - 1
        : Math.min(blockStart + pageBlockSize - 1, currentPage);

      for (let page = blockStart; page <= blockEnd; page += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn archive-page-button${page === currentPage ? " is-active" : ""}`;
        button.textContent = String(page);
        button.disabled = isLoading || page === currentPage;
        button.addEventListener("click", () => loadPage(page));
        pageList.appendChild(button);
      }
    };

    const loadPage = (page) => {
      if (isLoading) {
        return;
      }

      currentPage = Math.max(1, page);
      currentOffset = (currentPage - 1) * pageLimit;
      isLoading = true;
      loadError = "";
      statusMessage = "";
      render();
      renderPagination();

      fetch(getRequestUrl(), {
        credentials: "include",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load ${response.url}`);
          }
          return response.json();
        })
        .then((payload) => {
          const items = Array.isArray(payload.items)
            ? payload.items
            : Array.isArray(payload.files)
              ? payload.files
              : [];

          entries = items;
          hasMore = Boolean(payload.hasMore);
          render();
          renderPagination();
        })
        .catch((error) => {
          loadError = isLocalDevHost
            ? "Local Jekyll testing needs this origin to be allowed by the NAS API CORS settings."
            : "Check the NAS API status or CORS configuration.";
          console.error(error);
        })
        .finally(() => {
          isLoading = false;
          render();
          renderPagination();
        });
    };

    const startDownload = (fileId) => {
      if (!fileId || downloadingFileId || isLoading) {
        return;
      }

      downloadingFileId = fileId;
      statusMessage = "";
      render();

      const grantPath = downloadGrantPathTemplate.replace("{id}", encodeURIComponent(fileId));
      const grantUrl = new URL(grantPath, apiOrigin);
      fetch(grantUrl.toString(), {
        method: "POST",
        credentials: "include",
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const errorMessage = typeof payload.error === "string" ? payload.error : "";
            if (response.status === 403) {
              throw new Error("Download request was blocked by the current origin or session policy.");
            }
            if (response.status === 404) {
              throw new Error("The requested file could not be found.");
            }
            throw new Error(errorMessage || "Failed to prepare the download.");
          }

          if (!payload.downloadUrl) {
            throw new Error("The server did not return a download URL.");
          }

          const absoluteDownloadUrl = new URL(payload.downloadUrl, apiOrigin).toString();
          const link = document.createElement("a");
          link.href = absoluteDownloadUrl;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          link.remove();
        })
        .catch((error) => {
          statusMessage = error.message || "Failed to prepare the download.";
          console.error(error);
        })
        .finally(() => {
          downloadingFileId = "";
          render();
        });
    };

    const runSearch = () => {
      activeQuery = input.value.trim();
      loadPage(1);
    };

    const clearSearch = () => {
      input.value = "";
      activeQuery = "";
      loadPage(1);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });

    submitButton.addEventListener("click", runSearch);
    clearButton.addEventListener("click", clearSearch);
    resultBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-archive-download]");
      if (!(button instanceof HTMLElement)) {
        return;
      }
      startDownload(button.dataset.fileId || "");
    });

    prevButton.addEventListener("click", () => loadPage(currentPage - 1));
    nextButton.addEventListener("click", () => loadPage(currentPage + 1));

    root.dataset.archiveSearchInitialized = "true";
    loadPage(1);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tab-control]").forEach(initTabs);
    document.querySelectorAll("table.sortable-table").forEach(initSortableTable);
    document.querySelectorAll("[data-scale-analyzer]").forEach(initScaleAnalyzer);
    document.querySelectorAll("[data-archive-search]").forEach(initArchiveSearch);
  });
})();

