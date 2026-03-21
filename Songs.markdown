---
layout: scale_analyzer
title: "Songs"
permalink: /Songs
nav_order: 4
---

## Songs

Browse songs, look up a title, and download what you need.

<div
  class="archive-search"
  data-archive-search
  data-source="https://horie.synology.me:8443/api/v1/folders/Songs/files"
  data-browser-label="Songs"
  data-item-label-singular="song"
  data-item-label-plural="songs"
  data-page-limit="100">
  <label class="archive-search-label" for="songs-filter">Search</label>
  <div class="archive-search-toolbar">
    <input
      id="songs-filter"
      class="archive-search-input"
      type="search"
      inputmode="search"
      placeholder="Type part of a song name or path"
      autocomplete="off"
      data-archive-search-input>
    <button type="button" class="btn archive-search-submit archive-icon-button" data-archive-search-submit aria-label="Search" title="Search">
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="7" cy="7" r="4.5"></circle>
        <path d="m10.5 10.5 3 3"></path>
      </svg>
    </button>
    <button type="button" class="btn btn-outline archive-search-clear archive-icon-button" data-archive-search-clear aria-label="Clear" title="Clear">
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4l8 8"></path>
        <path d="M12 4 4 12"></path>
      </svg>
    </button>
  </div>

  <p class="archive-search-summary" data-archive-search-summary>Loading songs...</p>
  <p class="archive-search-status" data-archive-search-status></p>

  <div class="archive-search-pagination" data-archive-search-pagination>
    <button type="button" class="btn archive-page-button archive-page-nav" data-archive-page-prev aria-label="Previous page" title="Previous page">
      <span aria-hidden="true">&#8249;</span>
    </button>
    <div class="archive-page-list" data-archive-page-list></div>
    <button type="button" class="btn archive-page-button archive-page-nav" data-archive-page-next aria-label="Next page" title="Next page">
      <span aria-hidden="true">&#8250;</span>
    </button>
  </div>

  <p class="archive-search-empty" data-archive-search-empty hidden>No songs are available right now.</p>

  <div class="table-wrapper">
    <table class="archive-search-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>DL</th>
        </tr>
      </thead>
      <tbody data-archive-search-results></tbody>
    </table>
  </div>
</div>
