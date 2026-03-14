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

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tab-control]").forEach(initTabs);
    document.querySelectorAll("table.sortable-table").forEach(initSortableTable);
    document.querySelectorAll("[data-scale-analyzer]").forEach(initScaleAnalyzer);
  });
})();
