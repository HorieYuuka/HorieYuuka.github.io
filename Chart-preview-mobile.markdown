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
      <span class="cp-badge cp-badge--mode" data-cpm-mode hidden></span>
      <span class="cp-badge" data-cpm-tier hidden></span>
      <span class="cpm-title" data-cpm-title>Chart preview</span>
    </div>
    <div class="cpm-top-actions">
      <button type="button" class="cp-btn cp-btn-icon cp-btn-pick"
              data-cpm-pick aria-label="Pick chart">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <button type="button" class="cp-btn cp-btn-icon cpm-btn-help"
              data-cpm-help aria-label="Gesture help">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.7.7-1.5 1-1.5 2v.5"/><line x1="12" y1="17" x2="12" y2="17.01"/></svg>
      </button>
    </div>
  </header>

  <main class="cpm-stage" data-cpm-host>
    <div class="cpm-hispeed-toast" data-cpm-hispeed-toast></div>
    <div class="cpm-toast" data-cpm-toast></div>
  </main>

  <div class="cpm-empty" data-cpm-empty>
    <div class="cpm-empty__inner">
      <h2>No chart selected</h2>
      <p>Open the search to pick one.</p>
      <button type="button" class="cp-btn" data-cpm-pick>Search charts</button>
    </div>
  </div>

  <footer class="cpm-bottom" data-cpm-bottom hidden>
    <button type="button" class="cp-btn cp-btn-icon cp-btn-reset"
            data-cpm-reset aria-label="Reset to start">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
    </button>
    <button type="button" class="cp-btn cp-btn-icon cp-btn-play"
            data-cpm-play aria-label="Play / pause">
      <svg class="cpm-play__icon cpm-play__icon--play" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20"/></svg>
      <svg class="cpm-play__icon cpm-play__icon--pause" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" hidden><rect x="5" y="4" width="5" height="16"/><rect x="14" y="4" width="5" height="16"/></svg>
    </button>
    <input type="range" class="cp-progress" data-cpm-progress min="0" max="0" step="0.05" value="0">
    <span class="cp-progress-time" data-cpm-time><span class="cur">0:00</span> / 0:00</span>
  </footer>
</div>

<dialog class="cpm-help-modal" data-cpm-help-modal aria-label="Gesture help">
  <form method="dialog" class="cpm-help-head">
    <h2 class="cpm-help-title">Touch gestures</h2>
    <button type="button" class="cpm-help-close" data-cpm-help-close aria-label="Close">×</button>
  </form>
  <ul class="cpm-help-list">
    <li class="cpm-help-row">
      <div class="cpm-gesture cpm-gesture--tap" aria-hidden="true">
        <span class="cpm-gesture__finger"></span>
        <span class="cpm-gesture__ripple"></span>
      </div>
      <div class="cpm-help-text">
        <strong>Single tap</strong>
        <span>Toggle play / pause</span>
      </div>
    </li>
    <li class="cpm-help-row">
      <div class="cpm-gesture cpm-gesture--double" aria-hidden="true">
        <span class="cpm-gesture__finger"></span>
        <span class="cpm-gesture__ripple"></span>
        <span class="cpm-gesture__ripple cpm-gesture__ripple--2"></span>
      </div>
      <div class="cpm-help-text">
        <strong>Double tap</strong>
        <span>Reset to start</span>
      </div>
    </li>
    <li class="cpm-help-row">
      <div class="cpm-gesture cpm-gesture--pinch" aria-hidden="true">
        <span class="cpm-gesture__finger cpm-gesture__finger--left"></span>
        <span class="cpm-gesture__finger cpm-gesture__finger--right"></span>
      </div>
      <div class="cpm-help-text">
        <strong>Pinch</strong>
        <span>Adjust HI-SPEED</span>
      </div>
    </li>
  </ul>
</dialog>

{% include chart-search-dialog.html %}

<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="{{ '/assets/js/chart-renderer.js' | relative_url }}"></script>
<script src="{{ '/assets/js/chart-search.js' | relative_url }}"></script>
<script src="{{ '/assets/js/chart-preview-mobile.js' | relative_url }}"></script>
