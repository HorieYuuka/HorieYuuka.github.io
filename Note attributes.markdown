---
layout: scale_analyzer
title: "Note attributes"
permalink: /Note-attributes
nav_order: 3.7
---

## Note Attributes

Per-chart fingerprint across 8 axes (chord / stream / scratch / soft / LN / stair / peak / jack), with qualitative tags. Pick a chart on the left to see its octagon, sub-metrics, and (later) its ranking distribution.

* All axes are normalised to the [0, 1] range against per-mode references — **SP and DP are not directly comparable on raw axis values**.
* Tags are heuristic descriptors (e.g. `chord_heavy`, `peak_intense`, `ln_dense`) thresholded against the same per-mode corpus.
* Detail data loads on demand from `Resource/NoteAttributes/attrs/`.

<div class="note-attrs" data-note-attrs
     data-summary-url="/Resource/NoteAttributes/summary.json"
     data-attrs-base="/Resource/NoteAttributes/attrs/">

  <aside class="note-attrs-side">
    <div class="note-attrs-filters">
      <label class="note-attrs-field">
        <span>Search</span>
        <input type="search" data-na-search placeholder="title or artist" autocomplete="off">
      </label>

      <fieldset class="note-attrs-field">
        <legend>Mode</legend>
        <label><input type="checkbox" data-na-mode value="SP" checked> SP</label>
        <label><input type="checkbox" data-na-mode value="DP" checked> DP</label>
      </fieldset>

      <fieldset class="note-attrs-field">
        <legend>Scale</legend>
        <div data-na-scales class="note-attrs-pillset">Loading…</div>
      </fieldset>

      <fieldset class="note-attrs-field">
        <legend>Tags</legend>
        <div data-na-tags class="note-attrs-pillset">Loading…</div>
      </fieldset>

      <label class="note-attrs-field">
        <span>Sort by</span>
        <select data-na-sort>
          <option value="sum:desc">Sum (high→low)</option>
          <option value="x_chord:desc">Chord (high→low)</option>
          <option value="x_stream:desc">Stream (high→low)</option>
          <option value="x_scratch:desc">Scratch (high→low)</option>
          <option value="x_soft:desc">Soft (high→low)</option>
          <option value="x_ln:desc">LN (high→low)</option>
          <option value="x_stair:desc">Stair (high→low)</option>
          <option value="x_peak:desc">Peak (high→low)</option>
          <option value="x_jack:desc">Jack (high→low)</option>
          <option value="header_bpm:desc">BPM (high→low)</option>
          <option value="title:asc">Title (A→Z)</option>
        </select>
      </label>
    </div>

    <p class="note-attrs-count" data-na-count>Loading summary…</p>

    <ol class="note-attrs-list" data-na-list></ol>

    <div class="note-attrs-pager">
      <button type="button" class="btn" data-na-prev>‹ prev</button>
      <span data-na-page>—</span>
      <button type="button" class="btn" data-na-next>next ›</button>
    </div>
  </aside>

  <section class="note-attrs-detail" data-na-detail>
    <p class="note-attrs-empty">Pick a chart from the list.</p>
  </section>
</div>

<template id="note-attrs-detail-tpl">
  <header class="note-attrs-detail-head">
    <p class="note-attrs-detail-title" data-na-title></p>
    <p data-na-meta class="note-attrs-meta"></p>
    <p data-na-tags-row class="note-attrs-tags-row"></p>
  </header>

  <div class="note-attrs-radar-wrap">
    <canvas data-na-radar width="360" height="360"></canvas>
  </div>

  <details class="note-attrs-section" open>
    <summary>Sub-metrics</summary>
    <table class="note-attrs-submetrics" data-na-submetrics></table>
  </details>

  <details class="note-attrs-section">
    <summary>Ranking</summary>
    <p class="note-attrs-stub" data-na-ranking>
      Ranking integration is not wired yet. When the REST endpoint is available,
      lamp / score / population data for md5 <code data-na-md5></code> will appear here.
    </p>
  </details>
</template>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" defer></script>
<script src="{{ '/assets/js/note-attributes.js' | relative_url }}" defer></script>
