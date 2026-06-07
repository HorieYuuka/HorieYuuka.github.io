---
layout: chart_preview_mobile
title: "Chart preview"
permalink: /chart-preview/m
nav_exclude: true
sitemap: false
---

<div class="cpm-shell" data-cpm-shell>
  <header class="cpm-top">
    <div class="cpm-title-row">
      <span class="cpm-mode" data-cpm-mode hidden></span>
      <span class="cpm-tier" data-cpm-tier hidden></span>
      <span class="cpm-title" data-cpm-title>Chart preview</span>
    </div>
    <button type="button" class="cpm-pickbtn" data-cpm-pick aria-label="Pick chart">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>
  </header>

  <div class="cpm-rotate-hint" data-cpm-rotate-hint>
    <div class="cpm-rotate-hint__inner">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10a4 4 0 0 1 4 4v9"/><path d="m6 5-3 3 3 3"/><path d="m20 24 3-3-3-3"/></svg>
      <p>Rotate to landscape for DP charts.</p>
    </div>
  </div>

  <main class="cpm-stage" data-cpm-host></main>

  <div class="cpm-empty" data-cpm-empty>
    <div class="cpm-empty__inner">
      <h2>No chart selected</h2>
      <p>Open the search to pick one.</p>
      <button type="button" class="cpm-pickbtn cpm-pickbtn--lg" data-cpm-pick>Search charts</button>
    </div>
  </div>

  <footer class="cpm-bottom" data-cpm-bottom hidden>
    <button type="button" class="cpm-play" data-cpm-play aria-label="Play / pause">
      <svg class="cpm-play__icon cpm-play__icon--play" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20"/></svg>
      <svg class="cpm-play__icon cpm-play__icon--pause" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" hidden><rect x="5" y="4" width="5" height="16"/><rect x="14" y="4" width="5" height="16"/></svg>
    </button>
    <input type="range" class="cpm-progress" data-cpm-progress min="0" max="0" step="0.05" value="0">
    <span class="cpm-time" data-cpm-time>0:00 / 0:00</span>
  </footer>
</div>

{% include chart-search-dialog.html %}

<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="{{ '/assets/js/chart-renderer.js' | relative_url }}"></script>
<script src="{{ '/assets/js/chart-search.js' | relative_url }}"></script>
<script src="{{ '/assets/js/chart-preview-mobile.js' | relative_url }}"></script>
