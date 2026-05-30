---
layout: scale_analyzer
title: "Chart preview (POC)"
permalink: /Note-attributes/Chart-preview
parent: "Note attributes"
nav_exclude: true
has_toc: false
---

<!-- horieyuuka-file-api base URL. Audio playback only activates when this
     is set AND a chart's timeline JSON has an `audio` field. Remove this
     line (or leave content empty) to disable audio entirely. -->
<meta name="cp-api-base" content="https://horie.synology.me:8443">

<style>
.cp-page { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.5rem; max-width: 720px; }
.cp-page button {
  padding: 0.4rem 0.9rem; font-size: 0.95rem;
  background: #2563eb; color: #fff;
  border: 1px solid #1d4ed8; border-radius: 3px; cursor: pointer; font-weight: 600;
  width: max-content;
}
.cp-page button:hover { background: #1d4ed8; }
.cp-hint { color: #64748b; font-size: 0.85rem; line-height: 1.5; }

dialog.cp-dialog {
  width: 95vw; height: 95vh;
  max-width: 95vw; max-height: 95vh;
  padding: 0; border: none; border-radius: 6px;
  background: #0a0c10;
  color: #e2e8f0;
}
dialog.cp-dialog::backdrop { background: rgba(0,0,0,0.7); }
.cp-shell { display: flex; flex-direction: column; height: 100%; }
.cp-head {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid #1f2937;
  flex: 0 0 auto;
}
.cp-head-title { font-size: 0.95rem; font-weight: 600; flex: 1 1 auto; }
.cp-controls {
  display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid #1f2937;
  flex: 0 0 auto;
  font-size: 0.9rem;
}
.cp-controls select, .cp-controls button {
  padding: 0.25rem 0.6rem; font-size: 0.9rem;
  background: #1f2937; color: #e2e8f0;
  border: 1px solid #374151; border-radius: 3px; cursor: pointer;
}
.cp-controls select { min-width: 280px; max-width: 520px; }
.cp-controls button:hover { background: #374151; }
.cp-close {
  background: transparent !important; border: 1px solid #374151 !important;
  font-size: 1rem; padding: 0.25rem 0.75rem; color: #e2e8f0; cursor: pointer;
  border-radius: 3px;
}
.cp-close:hover { background: #1f2937 !important; }
.cp-meta { color: #94a3b8; font-size: 0.85rem; font-family: monospace; }
.cp-body { flex: 1 1 auto; overflow: hidden; display: flex; }
.cp-host { flex: 1 1 auto; min-width: 0; min-height: 0; background: #0a0c10; }
</style>

# Chart preview (proof-of-concept)

<div class="cp-page">
  <div class="cp-hint">
    Tetris-style preview — main panel scrolls notes IIDX-style toward the judgment line, queue holds the rest of the chart as a horizontal ribbon. Opens in a dialog so the queue gets the full viewport width.
  </div>
  <button type="button" data-cp-open>▶ Open preview</button>
</div>

<dialog class="cp-dialog" data-cp-dialog aria-label="Chart preview">
  <div class="cp-shell">
    <div class="cp-head">
      <div class="cp-head-title" data-cp-title>Chart preview</div>
      <button type="button" class="cp-close" data-cp-close>✕ Close</button>
    </div>
    <div class="cp-controls">
      <label>Chart:
        <select data-cp-sel></select>
      </label>
      <button type="button" data-cp-play>▶ Play</button>
      <button type="button" data-cp-reset>Reset</button>
      <label style="display:inline-flex;align-items:center;gap:0.25rem;">
        <input type="checkbox" data-cp-profile> profile
      </label>
      <span class="cp-meta" data-cp-meta></span>
      <span class="cp-meta" data-cp-clock></span>
    </div>
    <div class="cp-body">
      <div class="cp-host" data-cp-host></div>
    </div>
  </div>
</dialog>

<script src="{{ '/assets/js/chart-renderer.js' | relative_url }}" defer></script>
<script src="{{ '/assets/js/chart-preview.js' | relative_url }}" defer></script>
