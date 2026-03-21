---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults
layout: scale_analyzer
title: "Scale analyzer"
permalink: /Scale-analyzer
nav_order: 3
---

## Scale Analyzer

This page provides a song-wise scale reference for both SP and DP charts.
Each table lists the chart title, difficulty label, discrimination, and the estimated EASY and HARD clear difficulty values.

* `Discrimination`: how strongly a chart separates player skill levels.
* `Easy`: estimated difficulty for achieving an EASY clear.
* `Hard`: estimated difficulty for achieving a HARD clear.
* These values are only rough analytical references, so please do not treat them as absolute or fully reliable ratings.


<div data-tab-control data-scale-analyzer>
  <div class="tab-list" role="tablist" aria-label="Scale analyzer mode">
    <button class="tab-button is-active" data-tab-target="sp">SP</button>
    <button class="tab-button" data-tab-target="dp">DP</button>
  </div>

  <section class="tab-panel is-active" data-tab-panel="sp">
    <iframe
      class="scale-chart-frame"
      src="/Resource/Scales/songwise_candlestick_overlay_SP.html"
      title="SP scale candlestick chart"
      loading="lazy"></iframe>
    <div class="tab-meta" data-tab-count="sp">Loading...</div>
    <div class="table-wrapper scale-analyzer-table-wrap">
      <table class="sortable-table scale-analyzer-table" data-scale-table="sp" data-source="/Resource/Scales/scale-analyzer-sp.json">
        <thead>
          <tr>
            <th data-sort data-sort-type="text">Title</th>
            <th data-sort data-sort-type="text">Difficulty</th>
            <th data-sort data-sort-type="number">Discrimination</th>
            <th data-sort data-sort-type="number">Easy</th>
            <th data-sort data-sort-type="number">Hard</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="5">Loading...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="tab-panel" data-tab-panel="dp">
    <iframe
      class="scale-chart-frame"
      src="/Resource/Scales/songwise_candlestick_overlay_DP.html"
      title="DP scale candlestick chart"
      loading="lazy"></iframe>
    <div class="tab-meta" data-tab-count="dp">Loading...</div>
    <div class="table-wrapper scale-analyzer-table-wrap">
      <table class="sortable-table scale-analyzer-table" data-scale-table="dp" data-source="/Resource/Scales/scale-analyzer-dp.json">
        <thead>
          <tr>
            <th data-sort data-sort-type="text">Title</th>
            <th data-sort data-sort-type="text">Difficulty</th>
            <th data-sort data-sort-type="number">Discrimination</th>
            <th data-sort data-sort-type="number">Easy</th>
            <th data-sort data-sort-type="number">Hard</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="5">Loading...</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</div>
