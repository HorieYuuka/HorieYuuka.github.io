---
layout: scale_analyzer
title: "Player stats"
permalink: /Player-stats
nav_order: 3.5
---

## Player Stats

This page summarizes the per-player skill distribution produced by the IRT model, side-by-side with player dani ranks (when available) so you can locate yourself on the curve.

* `Quantitative skill`: model-derived baseline. All players have a value.
* `Ceiling skill`: *realistic* upper bound. Anchored on each player's hardest solved plays plus *surprising failures* (failures on charts the player should have been able to clear). Failures pull the estimate down, so it cannot be pushed up by cherry-picking lucky clears — a ceiling clearly above the quantitative skill is a credible signal of room to grow.
* `Peak skill`: *burst* / outlier-upside. Anchored only on *surprising successes* (clears of charts above the player's baseline). Failures are not considered, so this captures the highest single moment the player has demonstrably reached. When `Peak skill == Quantitative skill`, the player has no evidence of clearing anything above their baseline. Capped at the dataset's hardest chart + a small margin, so top players converge to a shared ceiling instead of diverging.
* Typical ordering is `Quantitative ≤ Ceiling ≤ Peak`. Reading them together: quantitative is the steady-state, ceiling is what they can reliably push to, peak is what they have pulled off at least once.
* Nickname badges (`LR2`, `TACHI`, `MIN`) indicate which IRs contributed records for the player.
* Hovering on a histogram bar shows the bin's skill range, player count, and the *typical (most common) dani* of players in that bin (e.g. `typical dani: ★09 (5/12)`). Casual outliers (e.g. an old ★01 holder sitting in a high-skill bin) do not pull the label.
* The boxplot shows skill distribution per dani level. The ☆ family is excluded (not meaningful in this community); only ★01–★10, ★★, and `(^^)` (special top-tier) are shown. Color: ★ family in gray, `(^^)` in gold.
* Anchors are recomputed each pipeline run. Treat them as a snapshot, not a stable label.

<div data-tab-control data-player-analyzer>
  <div class="tab-list" role="tablist" aria-label="Player stats mode">
    <button class="tab-button is-active" data-tab-target="sp">SP</button>
    <button class="tab-button" data-tab-target="dp">DP</button>
  </div>

  <section class="tab-panel is-active" data-tab-panel="sp">
    <iframe
      class="scale-chart-frame scale-chart-frame--tall"
      src="/Resource/Users/userstats_SP.html"
      title="SP player skill distribution"
      loading="lazy"></iframe>
    <div class="player-search">
      <input
        type="search"
        class="player-search-input"
        data-player-search="sp"
        placeholder="Search SP players by nickname"
        aria-label="Search SP players by nickname"
        autocomplete="off">
      <span class="player-count" data-player-count="sp">Loading…</span>
    </div>
    <div class="table-wrapper player-stats-table-wrap">
      <table class="sortable-table player-stats-table" data-player-table="sp" data-source="/Resource/Users/scale-analyzer-players-sp.json">
        <thead>
          <tr>
            <th data-sort data-sort-type="text">Nickname</th>
            <th data-sort data-sort-type="text">Dani</th>
            <th data-sort data-sort-type="number">Quantitative skill</th>
            <th data-sort data-sort-type="number">Ceiling skill</th>
            <th data-sort data-sort-type="number">Peak skill</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="5">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="tab-panel" data-tab-panel="dp">
    <iframe
      class="scale-chart-frame scale-chart-frame--tall"
      src="/Resource/Users/userstats_DP.html"
      title="DP player skill distribution"
      loading="lazy"></iframe>
    <div class="player-search">
      <input
        type="search"
        class="player-search-input"
        data-player-search="dp"
        placeholder="Search DP players by nickname"
        aria-label="Search DP players by nickname"
        autocomplete="off">
      <span class="player-count" data-player-count="dp">Loading…</span>
    </div>
    <div class="table-wrapper player-stats-table-wrap">
      <table class="sortable-table player-stats-table" data-player-table="dp" data-source="/Resource/Users/scale-analyzer-players-dp.json">
        <thead>
          <tr>
            <th data-sort data-sort-type="text">Nickname</th>
            <th data-sort data-sort-type="text">Dani</th>
            <th data-sort data-sort-type="number">Quantitative skill</th>
            <th data-sort data-sort-type="number">Ceiling skill</th>
            <th data-sort data-sort-type="number">Peak skill</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="5">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</div>
