---
layout: scale_analyzer
title: "Note attributes"
permalink: /Note-attributes
nav_order: 3.7
has_children: true
---

## Note Attributes — Chart comparison

Add up to **8 charts** to the comparison set and compare their radar
character + key metrics side by side. Open search (Ctrl+K or `/`) to pick
charts; each chart lives in a card with a small radar + 1-sec density
strip + tags, and the table below lines up NPS · Pos/s · the 7 character
axes · Peak · BPM per column.

> **Framework paper** — formal write-up of the 7-axis design, felt-time
> normalization, calibration, validation, and limitations:
> [Read here](/Note-attributes/Framework-paper)

<details class="note-attrs-help" markdown="1">
<summary><strong>What the table columns mean</strong> (click to expand)</summary>

**Density columns** — measured over the felt-time-corrected chart (BPM-trick
charts are normalized first, see the [framework
paper](https://github.com/HorieYuuka/HorieYuuka.github.io) for details).

| Column | Meaning |
|---|---|
| **BPM** | Header BPM, or felt-BPM-corrected effective BPM |
| **NPS min / mean / max** | **Raw note count** per second over aligned 1-sec felt-time buckets (active only). `max` matches the highest bar in the card's density strip. |
| **Pos/s** | **Distinct timing positions** per second (a chord counts as 1). The decomposition is `NPS = Pos/s × avg_chord_size` — same NPS can come from a slow chord wall (low Pos/s, big chord) or fast varied stream (high Pos/s, small chord). |

**Character axes** — 0–1 normalized via shape_v2 candidate ratios (event
count for each axis divided by total events). Axes are *independent* —
one event may count toward several axes, and the ratios do *not* sum to 1.

| Axis | What it captures |
|---|---|
| **Chord** | Events at positions with ≥3 simultaneous lanes |
| **Stream** | Sustained per-second density (±0.75-beat windowed NPS ≥ 8.0, scratch-excluded) |
| **Scratch** | Share of events on the turntable lane |
| **Soft** | Share of events on off-base BPM segments (soflan-with-notes) |
| **LN** | Share of long-note (hold) events on KEY lanes |
| **Stair** | Adjacent-lane chains (length ≥ 3, ±1 lane, tick gap [6,12]), p99-normalized, chord-purity adjusted |
| **Distraction** | SP: scratch interfering with stream flow (v3 product-sum). DP: 3-component mean — hand-role transition + same-side S+far-key + same-side S+near-key. |
| **Peak** | Peak burst severity (peak_jab + peak_uppercut, drill-down; not on the radar) |

**Per-cell "top N%"** — the small line under each value is the chart's
percentile *within the same mode (SP or DP) corpus*. "top 5 %" means the
chart sits at or above the 95th percentile of the whole mode for that
metric. Read together with the chart's curator family/tier (e.g. `st4`,
`★★5`) to interpret.

**Caveat — character is not difficulty**: the axes describe *what kind
of chart this is*, not *how hard it is to clear*. Two charts with the
same NPS may belong to very different tiers (see e.g. Skydive st4 vs
FREEDOM DiVE [FOUR DIMENSIONS] st8/★★5). Use the radar + tags + Pos/s
together with curator labels, not NPS alone.

</details>


<div class="note-attrs" data-note-attrs
     data-summary-url="/Resource/NoteAttributes/summary.json"
     data-attrs-base="/Resource/NoteAttributes/attrs/">

  <button type="button" class="note-attrs-search-trigger" data-na-search-open>
    <span class="note-attrs-search-trigger-label">Search by title or artist…</span>
    <kbd class="note-attrs-search-trigger-kbd">Ctrl+K</kbd>
  </button>

  <div class="note-attrs-compare-cards" data-na-compare-cards></div>

  <div class="note-attrs-compare-table-wrap" data-na-compare-table></div>
</div>

<dialog class="note-attrs-search-modal" data-na-search-modal aria-label="Search charts">
  <form method="dialog" class="note-attrs-search-form" data-na-search-form>
    <input type="search" class="note-attrs-search-input" data-na-search-input
           placeholder="title or artist" autocomplete="off"
           aria-label="Search title or artist">
    <button type="button" class="note-attrs-search-close" data-na-search-close
            aria-label="Close search">Close</button>
  </form>
  <ul class="note-attrs-search-results" data-na-search-results></ul>
  <p class="note-attrs-search-hint">
    <kbd>↑</kbd> <kbd>↓</kbd> navigate
    · <kbd>Enter</kbd> select
    · <kbd>Esc</kbd> close
  </p>
</dialog>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" defer></script>
<script src="{{ '/assets/js/note-attributes.js' | relative_url }}" defer></script>
