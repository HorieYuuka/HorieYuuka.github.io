/* chart-renderer.js — BMS chart visual preview (continuous main + horizontal queue)
 *
 *   ┌──────────────┐  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
 *   │  future ↑    │  │     │ │     │ │     │ │     │
 *   │   notes      │  │ m+1 │ │ m+2 │ │ m+3 │ │ m+4 │
 *   │   fall       │  │     │ │     │ │     │ │     │
 *   │   ↓          │  │     │ │     │ │     │ │     │
 *   │ ─ judgment ─ │  │     │ │     │ │     │ │     │
 *   └──────────────┘  └─────┘ └─────┘ └─────┘ └─────┘
 *      main                     queue (horizontal)
 *
 * Main panel: IIDX-style continuous scroll. Notes appear at top, fall
 * down at the rate of (active measure height) / (active measure duration),
 * cross the judgment line at the bottom when their time arrives.
 *
 * Queue: horizontal row of next-N measures as compact static previews.
 * When the active measure boundary is crossed, the head of the queue
 * becomes the new active and the rest shifts left.
 */

(function (root) {
  "use strict";

  // ── Lane definitions ──────────────────────────────────────────────────
  const SP_LAYOUT = [
    { w: 1.6, color: "#d44", kind: "scratch", label: "SC" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "1" },
    { w: 0.9, color: "#4af", kind: "black", label: "2" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "3" },
    { w: 0.9, color: "#4af", kind: "black", label: "4" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "5" },
    { w: 0.9, color: "#4af", kind: "black", label: "6" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "7" },
  ];

  const DP_LAYOUT = [
    { w: 1.6, color: "#d44", kind: "scratch", label: "1SC" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "1-1" },
    { w: 0.9, color: "#4af", kind: "black", label: "1-2" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "1-3" },
    { w: 0.9, color: "#4af", kind: "black", label: "1-4" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "1-5" },
    { w: 0.9, color: "#4af", kind: "black", label: "1-6" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "1-7" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "2-1" },
    { w: 0.9, color: "#4af", kind: "black", label: "2-2" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "2-3" },
    { w: 0.9, color: "#4af", kind: "black", label: "2-4" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "2-5" },
    { w: 0.9, color: "#4af", kind: "black", label: "2-6" },
    { w: 1.0, color: "#f0f0f0", kind: "white", label: "2-7" },
    { w: 1.6, color: "#d44", kind: "scratch", label: "2SC" },
  ];

  const DEFAULT_OPTS = {
    // Main panel
    mainLaneUnit:    { SP: 30, DP: 26 },
    mainHeight:      520,
    mainHeaderHeight: 0,           // dropped — measure labels now live in the left rail
    mainFooterHeight: 14,
    mainNoteHeight:  10,
    mainLeftRailWidth: 50,         // measure label sub-lane on the left of the lanes
    // Queue panels (horizontal row, each matching main height + width)
    queueLaneUnit:   { SP: 30, DP: 26 },  // matched to main for visual continuity
    queueHeaderHeight: 22,
    queueGapPx:      6,
    queueNoteHeight: 8,
    queueScrollbarReservePx: 18,           // bottom reserve so scrollbar doesn't cover canvas
    queueCanvasMaxWidth: 32000,            // total queue width safety cap (truncates beyond)
    measuresPerTile: 8,                    // tile granularity — each tile is its own canvas
    // Both
    p1p2GapPx:       8,
    lnAlpha:         0.65,
    bg:              "#0a0c10",
    panelBg:         "#0e1117",
    laneBg:          "#15181f",
    laneSep:         "#1f2530",
    beatLine:        "#2a3a4f",
    halfBeatLine:    "#1d2735",
    subBeatLine:     "rgba(211,211,211,0.4)",
    activeBorder:    "#fcd34d",
    queueBorder:     "#2d3a4f",
    labelColor:      "#9aa9bf",
    labelColorActive:"#fcd34d",
    bpmColor:        "#fcd34d",
    judgmentLineColor: "#facc15",
  };

  function layoutFor(timeline) {
    return timeline.mode === "DP" ? DP_LAYOUT : SP_LAYOUT;
  }

  function laneOffsetsPx(layout, laneUnit, p1p2GapPx) {
    const xs = [];
    let cum = 0;
    for (let i = 0; i < layout.length; i++) {
      xs.push(cum);
      cum += layout[i].w * laneUnit;
      if (layout.length === 16 && i === 7) cum += p1p2GapPx;
    }
    xs.push(cum);
    return xs;
  }
  function laneTotalWidth(layout, laneUnit, p1p2GapPx) {
    return laneOffsetsPx(layout, laneUnit, p1p2GapPx).slice(-1)[0];
  }

  // ── Measure boundaries ────────────────────────────────────────────────
  function computeMeasures(bpmChanges, totalSec) {
    const measures = [];
    if (!bpmChanges || bpmChanges.length === 0) return measures;
    let curBpm = bpmChanges[0][1] || 130;
    let t = 0;
    let beatIdx = 0;
    let segIdx = 0;
    let measureStart = 0;
    let measureStartBpm = curBpm;
    let idx = 1;
    let safety = 0;
    while (t < totalSec && safety < 100000) {
      while (segIdx + 1 < bpmChanges.length && t >= bpmChanges[segIdx + 1][0] - 1e-9) {
        segIdx++;
        curBpm = bpmChanges[segIdx][1];
      }
      const beatDur = 60 / Math.max(curBpm, 1);
      t += beatDur;
      beatIdx++;
      if (beatIdx % 4 === 0) {
        const end = Math.min(t, totalSec);
        measures.push({ idx, start_sec: measureStart, end_sec: end, bpm: measureStartBpm });
        idx++;
        measureStart = t;
        measureStartBpm = curBpm;
      }
      safety++;
    }
    if (measureStart < totalSec - 1e-3) {
      measures.push({ idx, start_sec: measureStart, end_sec: totalSec, bpm: measureStartBpm, partial: true });
    }
    return measures;
  }

  function bucketNotesByMeasure(notes, measures) {
    const buckets = new Array(measures.length);
    for (let i = 0; i < buckets.length; i++) buckets[i] = [];
    if (measures.length === 0) return buckets;
    const starts = measures.map(m => m.start_sec);
    function findIdx(t) {
      let lo = 0, hi = starts.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return ans;
    }
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const mi = findIdx(n[1]);
      buckets[mi].push(n);
    }
    return buckets;
  }

  // ── Static queue-panel draw ───────────────────────────────────────────
  function drawQueuePanel(ctx, p) {
    const {
      x, y, w, h, layout, laneUnit, p1p2GapPx,
      headerH, noteHeight, lnAlpha, opts,
      label, bpmLabel, measure, notes,
    } = p;
    const bodyTop = y + headerH;
    const bodyBot = y + h;
    const bodyH = bodyBot - bodyTop;
    const innerW = laneTotalWidth(layout, laneUnit, p1p2GapPx);
    const innerLeft = x + Math.max(2, (w - innerW) / 2);

    ctx.fillStyle = opts.panelBg;
    ctx.fillRect(x, y, w, h);

    if (label) {
      ctx.fillStyle = opts.labelColor;
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 6, y + headerH / 2);
    }
    if (bpmLabel) {
      ctx.fillStyle = opts.bpmColor;
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(bpmLabel, x + w - 6, y + headerH / 2);
    }

    const xs = laneOffsetsPx(layout, laneUnit, p1p2GapPx);
    for (let i = 0; i < layout.length; i++) {
      const lx = innerLeft + xs[i];
      const lw = layout[i].w * laneUnit;
      ctx.fillStyle = opts.laneBg;
      ctx.fillRect(lx, bodyTop, lw, bodyH);
    }

    // 16th note grid: 15 internal lines. Beats (i % 4 === 0) use opts.beatLine,
    // sub-beats use a translucent lightgray so the beat structure stays
    // dominant while still resolving 16th note alignment.
    ctx.lineWidth = 1;
    for (let i = 1; i < 16; i++) {
      const ly = bodyTop + (i / 16) * bodyH;
      ctx.strokeStyle = (i % 4 === 0) ? opts.beatLine : (opts.subBeatLine || "rgba(211,211,211,0.4)");
      ctx.beginPath();
      ctx.moveTo(innerLeft, ly + 0.5);
      ctx.lineTo(innerLeft + innerW, ly + 0.5);
      ctx.stroke();
    }

    // Notes — IIDX-style: bottom edge of note sits ON the timing line.
    // Queue uses flipped y: bodyBot = measure start, bodyTop = measure end.
    const dur = Math.max(measure.end_sec - measure.start_sec, 1e-6);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const laneIdx = n[0];
      if (laneIdx < 0 || laneIdx >= layout.length) continue;
      const lx = innerLeft + xs[laneIdx];
      const lw = layout[laneIdx].w * laneUnit;
      const frac = Math.max(0, (n[1] - measure.start_sec) / dur);
      if (frac > 1) continue;
      const yNote = bodyBot - frac * bodyH;
      const ndur = n[2];
      if (ndur > 0) {
        const tEnd = Math.min(n[1] + ndur, measure.end_sec);
        const fracEnd = Math.min(1, (tEnd - measure.start_sec) / dur);
        const yNoteEnd = bodyBot - fracEnd * bodyH;
        const top = Math.min(yNote, yNoteEnd);
        const bot = Math.max(yNote, yNoteEnd);
        ctx.fillStyle = layout[laneIdx].color;
        ctx.globalAlpha = lnAlpha;
        ctx.fillRect(lx + 1, top, lw - 2, bot - top);
        ctx.globalAlpha = 1;
        ctx.fillRect(lx, yNote - 2, lw, 2);
        ctx.fillRect(lx, yNoteEnd - 2, lw, 2);
      } else {
        ctx.fillStyle = layout[laneIdx].color;
        ctx.fillRect(lx, yNote - noteHeight, lw, noteHeight);
      }
    }

    ctx.strokeStyle = opts.queueBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // ── Continuous-scroll main draw ───────────────────────────────────────
  // Notes are positioned at y = judgmentY - (note_time - currentSec) * pxPerSec.
  // Notes whose time matches currentSec sit on the judgment line at the
  // bottom; future notes are above; just-played notes briefly stay below
  // the line before clipping off.
  function drawMainScrolling(ctx, p) {
    const {
      x, y, w, h, layout, laneUnit, p1p2GapPx,
      headerH, footerH, noteHeight, lnAlpha, opts,
      activeMeasure, allNotes, currentSec, scrollPxPerSec, maxLnDuration,
      measures, leftRailWidth, mainZoom,
    } = p;
    const bodyTop = y + headerH;
    const bodyBot = y + h - footerH;
    const bodyH = bodyBot - bodyTop;
    const judgmentY = bodyBot;
    const innerW = laneTotalWidth(layout, laneUnit, p1p2GapPx);
    // Lanes start AFTER the left rail; right padding fills any remainder.
    const innerLeft = x + leftRailWidth + Math.max(2, (w - leftRailWidth - innerW) / 2);

    // Background.
    ctx.fillStyle = opts.panelBg;
    ctx.fillRect(x, y, w, h);

    // Lane backgrounds.
    const xs = laneOffsetsPx(layout, laneUnit, p1p2GapPx);
    for (let i = 0; i < layout.length; i++) {
      const lx = innerLeft + xs[i];
      const lw = layout[i].w * laneUnit;
      ctx.fillStyle = opts.laneBg;
      ctx.fillRect(lx, bodyTop, lw, bodyH);
    }

    // 16th note grid — per measure, 15 internal subdivisions (3 between
    // each beat). Beats (i % 4 === 0) use beatLine; sub-beats use a
    // translucent lightgray so the beat structure stays readable but the
    // 16th positions are visible for alignment.
    const subBeatColor = opts.subBeatLine || "rgba(211,211,211,0.4)";
    if (activeMeasure && measures && measures.length) {
      const visibleSpanLocal = bodyH / scrollPxPerSec;
      const tMinGrid = currentSec - 0.05 * visibleSpanLocal;
      const tMaxGrid = currentSec + visibleSpanLocal + 0.05 * visibleSpanLocal;
      ctx.lineWidth = 1;
      for (let mi = 0; mi < measures.length; mi++) {
        const m = measures[mi];
        if (m.end_sec < tMinGrid) continue;
        if (m.start_sec > tMaxGrid) break;
        const mDur = m.end_sec - m.start_sec;
        for (let i = 0; i < 16; i++) {
          const t = m.start_sec + (i / 16) * mDur;
          if (t < tMinGrid || t > tMaxGrid) continue;
          const ly = judgmentY - (t - currentSec) * scrollPxPerSec;
          if (ly < bodyTop || ly > bodyBot) continue;
          ctx.strokeStyle = (i % 4 === 0) ? opts.beatLine : subBeatColor;
          ctx.beginPath();
          ctx.moveTo(innerLeft, ly + 0.5);
          ctx.lineTo(innerLeft + innerW, ly + 0.5);
          ctx.stroke();
        }
      }
    }

    // Notes within visible time window.
    //   tMin = bottom of the visible body (just under judgment, small tail
    //          so taps don't pop out instantly).
    //   tMax = top of the visible body (one panel-height of future).
    // Taps care only about their own tn (point-in-time). LNs span a range
    // [tn, tn + ndur] — a LN whose tn started long ago can still be active
    // (body crossing the panel right now). Binary-search start is therefore
    // tMin - maxLnDuration so any active long-LN is considered.
    const visibleSpan = bodyH / scrollPxPerSec;
    const tMin = currentSec - 0.1 * visibleSpan;
    const tMax = currentSec + visibleSpan + 0.05 * visibleSpan;
    const searchFrom = tMin - (maxLnDuration || 0);

    let lo = 0, hi = allNotes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (allNotes[mid][1] < searchFrom) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < allNotes.length; i++) {
      const n = allNotes[i];
      const tn = n[1];
      if (tn > tMax) break;
      const laneIdx = n[0];
      if (laneIdx < 0 || laneIdx >= layout.length) continue;
      const lx = innerLeft + xs[laneIdx];
      const lw = layout[laneIdx].w * laneUnit;
      const ndur = n[2];
      if (ndur > 0) {
        // LN body spans [tn, tn + ndur]. Skip only if fully past judgment.
        if (tn + ndur < tMin) continue;
        const yStart = judgmentY - (tn - currentSec) * scrollPxPerSec;
        const yEnd   = judgmentY - (tn + ndur - currentSec) * scrollPxPerSec;
        // yEnd is the future-end (smaller y); yStart is the head (larger y).
        const drawTop = Math.max(yEnd, bodyTop);
        const drawBot = Math.min(yStart, judgmentY);
        if (drawBot <= drawTop) continue;
        ctx.fillStyle = layout[laneIdx].color;
        ctx.globalAlpha = lnAlpha;
        ctx.fillRect(lx + 1, drawTop, lw - 2, drawBot - drawTop);
        ctx.globalAlpha = 1;
        // Head cap (where the note first lands at judgment) — bottom edge on line.
        if (yStart >= bodyTop && yStart <= judgmentY + 1) {
          ctx.fillRect(lx, yStart - 2, lw, 2);
        }
        // Tail cap (LN release) — bottom edge on line.
        if (yEnd >= bodyTop && yEnd <= judgmentY + 1) {
          ctx.fillRect(lx, yEnd - 2, lw, 2);
        }
      } else {
        if (tn < tMin) continue;  // tap already past
        const yNote = judgmentY - (tn - currentSec) * scrollPxPerSec;
        if (yNote < bodyTop - opts.mainNoteHeight || yNote > bodyBot + opts.mainNoteHeight) continue;
        ctx.fillStyle = layout[laneIdx].color;
        ctx.fillRect(lx, yNote - noteHeight, lw, noteHeight);
      }
    }

    // Judgment line.
    ctx.strokeStyle = opts.judgmentLineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerLeft, judgmentY + 0.5);
    ctx.lineTo(innerLeft + innerW, judgmentY + 0.5);
    ctx.stroke();

    // Left rail: per-measure label "<mxx>" at the measure-start y position.
    // Labels stay anchored to their measure boundary and scroll downward
    // with the notes — same reference frame as the IIDX-style flow.
    if (measures && measures.length) {
      const visibleSpan = bodyH / scrollPxPerSec;
      const tMinLabel = currentSec - 0.1 * visibleSpan;
      const tMaxLabel = currentSec + visibleSpan + 0.05 * visibleSpan;
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        if (m.start_sec < tMinLabel) continue;
        if (m.start_sec > tMaxLabel) break;
        const ly = judgmentY - (m.start_sec - currentSec) * scrollPxPerSec;
        if (ly < bodyTop - 4 || ly > bodyBot + 4) continue;
        ctx.fillStyle = opts.labelColor;
        ctx.fillText("<m" + m.idx + ">", x + 6, ly - 4);
        // BPM annotation when it changes at this measure.
        if (i > 0 && Math.abs(measures[i - 1].bpm - m.bpm) > 0.5) {
          ctx.fillStyle = opts.bpmColor;
          ctx.fillText("♩" + Math.round(m.bpm), x + 6, ly + 12);
        }
      }
    }

    // Active border.
    ctx.strokeStyle = opts.activeBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Zoom indicator (bottom-right of body).
    if (mainZoom != null && Math.abs(mainZoom - 1.0) > 0.01) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const txt = "×" + mainZoom.toFixed(2);
      ctx.font = "11px monospace";
      const tw = ctx.measureText(txt).width + 10;
      ctx.fillRect(x + w - tw - 6, bodyBot - 22, tw, 18);
      ctx.fillStyle = opts.labelColor;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, x + w - 10, bodyBot - 13);
    }
  }

  // ── View ──────────────────────────────────────────────────────────────
  function createChartView(host, timeline, optsOverride) {
    const opts = Object.assign({}, DEFAULT_OPTS, optsOverride || {});
    const layout = layoutFor(timeline);
    const mode = timeline.mode;
    const totalSec = timeline.total_sec || 0;
    const measures = computeMeasures(timeline.bpm_changes || [[0, timeline.base_bpm || 130]], totalSec);
    const notesByMeasure = bucketNotesByMeasure(timeline.notes || [], measures);
    const allNotesSorted = (timeline.notes || []).slice().sort((a, b) => a[1] - b[1]);
    let maxLnDuration = 0;
    for (let i = 0; i < allNotesSorted.length; i++) {
      const d = allNotesSorted[i][2];
      if (d > maxLnDuration) maxLnDuration = d;
    }

    // Sizing.
    const mainLaneUnit = opts.mainLaneUnit[mode] || 24;
    const queueLaneUnit = opts.queueLaneUnit[mode] || mainLaneUnit;
    const mainInnerW = laneTotalWidth(layout, mainLaneUnit, opts.p1p2GapPx);
    const mainLeftRailWidth = opts.mainLeftRailWidth || 0;
    const mainW = Math.max(mainInnerW + mainLeftRailWidth + 16, 220);
    const mainH = opts.mainHeight;
    // Queue panel width matches main panel width (lane units now match too).
    const queueW = mainW;
    const queueH = mainH;

    // DOM: flex row [ main canvas | queue scroll wrapper [ queue canvas ] ].
    host.innerHTML = "";
    host.style.position = "relative";
    host.style.background = opts.bg;
    host.style.padding = "10px";
    host.style.borderRadius = "4px";
    host.style.boxSizing = "border-box";

    const layoutRow = document.createElement("div");
    layoutRow.style.display = "flex";
    layoutRow.style.alignItems = "flex-start";
    layoutRow.style.gap = "12px";
    layoutRow.style.minWidth = "0";
    host.appendChild(layoutRow);

    const mainCanvas = document.createElement("canvas");
    mainCanvas.style.display = "block";
    mainCanvas.style.flex = "0 0 auto";
    mainCanvas.style.width = mainW + "px";
    mainCanvas.style.height = mainH + "px";
    layoutRow.appendChild(mainCanvas);

    // Vertical separator between live and queue.
    const divider = document.createElement("div");
    divider.style.flex = "0 0 1px";
    divider.style.width = "1px";
    divider.style.alignSelf = "stretch";
    divider.style.background = opts.dividerColor || "#2d3a4f";
    divider.style.height = mainH + "px";
    layoutRow.appendChild(divider);

    const queueWrap = document.createElement("div");
    queueWrap.style.flex = "1 1 0";
    queueWrap.style.minWidth = "0";
    queueWrap.style.overflowX = "auto";
    queueWrap.style.overflowY = "hidden";
    queueWrap.style.height = (queueH + opts.queueScrollbarReservePx) + "px";
    layoutRow.appendChild(queueWrap);

    // queueInner holds all tile canvases as an inline-flex row. Wider than
    // queueWrap, scroll happens on queueWrap.
    const queueInner = document.createElement("div");
    queueInner.style.display = "inline-flex";
    queueInner.style.height = queueH + "px";
    queueInner.style.whiteSpace = "nowrap";
    queueWrap.appendChild(queueInner);

    const dpr = window.devicePixelRatio || 1;

    function setupCanvas(c, w, h, customDpr) {
      const d = customDpr || dpr;
      c.width = Math.round(w * d);
      c.height = Math.round(h * d);
      c.style.width = w + "px";
      c.style.height = h + "px";
      const cctx = c.getContext("2d");
      cctx.setTransform(d, 0, 0, d, 0, 0);
      return cctx;
    }
    const mainCtx = setupCanvas(mainCanvas, mainW, mainH);

    // Performance instrumentation (toggle via opts.profile = true).
    const PROFILE = !!opts.profile;
    let frameCount = 0;
    let frameMsAcc = 0;
    let lastReportTs = 0;
    function profileFrame(label, ms) {
      if (!PROFILE) return;
      if (label === "frame") {
        frameMsAcc += ms;
        frameCount++;
        if (performance.now() - lastReportTs > 1000) {
          const avg = frameMsAcc / Math.max(1, frameCount);
          console.log(`[chart] avg drawMain: ${avg.toFixed(2)}ms × ${frameCount}fps`);
          frameMsAcc = 0;
          frameCount = 0;
          lastReportTs = performance.now();
        }
      } else {
        console.log(`[chart] ${label}: ${ms.toFixed(2)}ms`);
      }
    }

    const state = {
      activeIdx: 0,
      currentSec: measures.length > 0 ? measures[0].start_sec : 0,
      mainZoom: 1.0,           // scroll-speed multiplier driven by wheel-on-main
    };

    function bpmLabelFor(midx) {
      if (midx < 0 || midx >= measures.length) return null;
      const m = measures[midx];
      if (midx === 0 || measures[midx - 1].bpm !== m.bpm) return String(Math.round(m.bpm));
      return null;
    }

    function activeScrollPxPerSec() {
      const m = measures[state.activeIdx];
      if (!m) return 0;
      const bodyH = mainH - opts.mainHeaderHeight - opts.mainFooterHeight;
      const dur = Math.max(m.end_sec - m.start_sec, 1e-6);
      return (bodyH / dur) * state.mainZoom;
    }

    function drawMain() {
      mainCtx.fillStyle = opts.bg;
      mainCtx.fillRect(0, 0, mainW, mainH);
      const haveActive = state.activeIdx >= 0 && state.activeIdx < measures.length;
      if (haveActive) {
        drawMainScrolling(mainCtx, {
          x: 0, y: 0, w: mainW, h: mainH,
          layout, laneUnit: mainLaneUnit, p1p2GapPx: opts.p1p2GapPx,
          headerH: opts.mainHeaderHeight,
          footerH: opts.mainFooterHeight,
          noteHeight: opts.mainNoteHeight,
          lnAlpha: opts.lnAlpha,
          opts,
          activeMeasure: measures[state.activeIdx],
          allNotes: allNotesSorted,
          currentSec: state.currentSec,
          scrollPxPerSec: activeScrollPxPerSec(),
          maxLnDuration,
          measures,
          leftRailWidth: mainLeftRailWidth,
          mainZoom: state.mainZoom,
        });
      } else {
        mainCtx.fillStyle = opts.panelBg;
        mainCtx.fillRect(0, 0, mainW, mainH);
        mainCtx.strokeStyle = opts.queueBorder;
        mainCtx.strokeRect(0.5, 0.5, mainW - 1, mainH - 1);
        mainCtx.fillStyle = opts.labelColor;
        mainCtx.font = "13px monospace";
        mainCtx.textAlign = "center";
        mainCtx.textBaseline = "middle";
        mainCtx.fillText("— end —", mainW / 2, mainH / 2);
      }
    }

    // Queue tiles. Each tile is its own canvas holding `measuresPerTile`
    // panels, ~2200×520 px at dpr 2 → ~18MB backing buffer each. Browser
    // composites each tile as a separate GPU layer; off-screen tiles are
    // cheap to keep around vs one huge canvas.
    const queueStride = queueW + opts.queueGapPx;
    const measuresPerTile = opts.measuresPerTile;
    const queueDesiredW = Math.max(1, measures.length * queueStride - opts.queueGapPx);
    const queueRenderedW = Math.min(queueDesiredW, opts.queueCanvasMaxWidth);
    const queueRenderedCount = queueRenderedW < queueDesiredW
      ? Math.floor((queueRenderedW + opts.queueGapPx) / queueStride)
      : measures.length;
    const tileCount = Math.max(1, Math.ceil(queueRenderedCount / measuresPerTile));
    const tiles = [];
    for (let i = 0; i < tileCount; i++) {
      const startG = i * measuresPerTile;
      const endG = Math.min(startG + measuresPerTile, queueRenderedCount);
      const count = Math.max(0, endG - startG);
      const tileW = Math.max(1, count * queueStride);
      const c = document.createElement("canvas");
      c.style.display = "block";
      c.style.flex = "0 0 auto";
      c.style.height = queueH + "px";
      queueInner.appendChild(c);
      const cctx = setupCanvas(c, tileW, queueH);
      tiles.push({ canvas: c, ctx: cctx, startG, endG, tileW });
    }

    function tileForGlobal(globalIdx) {
      if (globalIdx < 0) return null;
      const ti = Math.floor(globalIdx / measuresPerTile);
      return ti < tiles.length ? tiles[ti] : null;
    }

    function renderQueuePanelAt(globalIdx) {
      const tile = tileForGlobal(globalIdx);
      if (!tile || globalIdx >= queueRenderedCount) return;
      const local = globalIdx - tile.startG;
      const qx = local * queueStride;
      const m = measures[globalIdx];
      tile.ctx.fillStyle = opts.bg;
      tile.ctx.fillRect(qx, 0, queueW, queueH);
      drawQueuePanel(tile.ctx, {
        x: qx, y: 0, w: queueW, h: queueH,
        layout, laneUnit: queueLaneUnit, p1p2GapPx: opts.p1p2GapPx,
        headerH: opts.queueHeaderHeight,
        noteHeight: opts.queueNoteHeight,
        lnAlpha: opts.lnAlpha,
        opts,
        label: "<m" + m.idx + ">",
        bpmLabel: bpmLabelFor(globalIdx),
        measure: m,
        notes: notesByMeasure[globalIdx],
      });
    }

    function drawFullQueue() {
      const t0 = performance.now();
      for (const t of tiles) {
        t.ctx.fillStyle = opts.bg;
        t.ctx.fillRect(0, 0, t.tileW, queueH);
      }
      for (let g = 0; g < queueRenderedCount; g++) renderQueuePanelAt(g);
      profileFrame("drawFullQueue (" + queueRenderedCount + " panels, " + tiles.length + " tiles)", performance.now() - t0);
      if (queueRenderedCount < measures.length && tiles.length > 0) {
        // Truncation indicator on last tile's trailing area.
        const lastTile = tiles[tiles.length - 1];
        const localCount = lastTile.endG - lastTile.startG;
        const tx = localCount * queueStride;
        if (tx + 80 < lastTile.tileW + 200) {
          lastTile.ctx.fillStyle = opts.labelColor;
          lastTile.ctx.font = "11px monospace";
          lastTile.ctx.textAlign = "left";
          lastTile.ctx.textBaseline = "middle";
          lastTile.ctx.fillText(
            "+" + (measures.length - queueRenderedCount) + " more (truncated)",
            tx + 4, queueH / 2
          );
        }
      }
    }

    function drawAll() {
      drawMain();
      drawFullQueue();
      queueWrap.scrollLeft = state.activeIdx * queueStride;
    }

    // ── Playback ───────────────────────────────────────────────────────
    let rafHandle = null;
    let lastTs = 0;
    let onPlayStateChange = null;
    let onMeasureChange = null;

    // Optional audio sync. When present, chart time is driven by
    // audio.currentTime (+ offset) rather than dt accumulation. Without
    // audio everything falls back to dt-based playback.
    let audioEl = null;
    const audioOffsetSec = opts.audioOffsetSec || 0;
    if (opts.audioUrl) {
      audioEl = new Audio();
      audioEl.preload = "auto";
      audioEl.crossOrigin = "anonymous";
      audioEl.src = opts.audioUrl;
      audioEl.addEventListener("error", (e) => {
        console.warn("[chart] audio error", e, audioEl.error);
      });
      audioEl.addEventListener("ended", () => { pause(); });
    }

    function audioToChartSec(audioTime) {
      return audioTime + audioOffsetSec;
    }
    function chartToAudioSec(chartSec) {
      return Math.max(0, chartSec - audioOffsetSec);
    }

    function isPlaying() { return rafHandle !== null; }

    function loop(ts) {
      if (!rafHandle) return;
      if (audioEl && !audioEl.paused) {
        // Drive chart from audio clock — sample-accurate sync.
        state.currentSec = audioToChartSec(audioEl.currentTime);
      } else {
        const dt = lastTs ? (ts - lastTs) / 1000 : 0;
        state.currentSec += dt;
      }
      lastTs = ts;

      while (
        state.activeIdx < measures.length - 1 &&
        state.currentSec >= measures[state.activeIdx].end_sec - 1e-6
      ) {
        const prev = state.activeIdx;
        state.activeIdx++;
        if (onMeasureChange) onMeasureChange(state.activeIdx, prev);
      }
      if (
        state.activeIdx >= measures.length - 1 &&
        state.currentSec >= measures[measures.length - 1].end_sec - 1e-6
      ) {
        state.currentSec = measures[measures.length - 1].end_sec;
        drawMain();
        pause();
        return;
      }
      const tM = performance.now();
      drawMain();
      profileFrame("frame", performance.now() - tM);
      rafHandle = requestAnimationFrame(loop);
    }

    function play() {
      if (rafHandle) return;
      if (state.activeIdx >= measures.length - 1 &&
          state.currentSec >= measures[measures.length - 1].end_sec - 1e-3) {
        state.activeIdx = 0;
        state.currentSec = measures[0].start_sec;
        if (onMeasureChange) onMeasureChange(0, -1);
      }
      if (audioEl) {
        audioEl.currentTime = chartToAudioSec(state.currentSec);
        const p = audioEl.play();
        if (p && p.catch) p.catch((e) => console.warn("[chart] audio play rejected", e));
      }
      lastTs = 0;
      rafHandle = requestAnimationFrame(loop);
      if (onPlayStateChange) onPlayStateChange(true);
    }
    function pause() {
      if (audioEl && !audioEl.paused) audioEl.pause();
      if (!rafHandle) return;
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
      if (onPlayStateChange) onPlayStateChange(false);
    }
    function toggle() { isPlaying() ? pause() : play(); }

    function reset() {
      pause();
      state.activeIdx = 0;
      state.currentSec = measures.length > 0 ? measures[0].start_sec : 0;
      if (audioEl) {
        try { audioEl.currentTime = 0; } catch (e) { /* not yet seekable */ }
      }
      drawMain();
      queueWrap.scrollLeft = 0;
    }

    function seekToMeasure(i) {
      if (measures.length === 0) return;
      i = Math.max(0, Math.min(measures.length - 1, i));
      state.activeIdx = i;
      state.currentSec = measures[i].start_sec;
      if (audioEl) {
        try { audioEl.currentTime = chartToAudioSec(state.currentSec); }
        catch (e) { /* not yet seekable */ }
      }
      drawMain();
      if (onMeasureChange) onMeasureChange(i, -1);
    }

    function destroy() {
      pause();
      if (audioEl) {
        audioEl.src = "";
        audioEl.load();
        audioEl = null;
      }
    }

    mainCanvas.addEventListener("click", () => {
      if (state.activeIdx >= 0 && state.activeIdx < measures.length) {
        state.currentSec = measures[state.activeIdx].start_sec;
        drawMain();
      }
    });
    // Wheel over main = zoom scroll speed. Ctrl+wheel falls through so the
    // browser still page-scrolls when the user is just trying to read.
    const MAIN_ZOOM_MIN = 0.25;
    const MAIN_ZOOM_MAX = 8.0;
    const MAIN_ZOOM_STEP = 1.12;
    mainCanvas.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? MAIN_ZOOM_STEP : 1 / MAIN_ZOOM_STEP;
      const next = state.mainZoom * factor;
      state.mainZoom = Math.max(MAIN_ZOOM_MIN, Math.min(MAIN_ZOOM_MAX, next));
      drawMain();
    }, { passive: false });
    for (const t of tiles) {
      const tileRef = t;
      tileRef.canvas.addEventListener("click", (e) => {
        const rect = tileRef.canvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const slot = Math.floor(localX / queueStride);
        const globalIdx = tileRef.startG + slot;
        if (globalIdx < tileRef.startG || globalIdx >= tileRef.endG) return;
        seekToMeasure(globalIdx);
      });
    }

    drawAll();

    return {
      draw: drawAll,
      play, pause, toggle, isPlaying,
      reset, seekToMeasure, destroy,
      hasAudio: !!audioEl,
      setOnPlayStateChange(fn) { onPlayStateChange = fn; },
      setOnMeasureChange(fn) { onMeasureChange = fn; },
      getState() { return Object.assign({}, state); },
      getMeasures() { return measures.slice(); },
      timeline,
    };
  }

  // ── File-api fileId helper ──────────────────────────────────────────────
  // fileId is base64url(JSON.stringify({relativePath})). Mirrors the server's
  // encodeFileId in horieyuuka-file-api/server/src/services/file-service.js.
  function encodeFileId(relativePath) {
    const json = JSON.stringify({ relativePath });
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  async function resolveAudioUrl(apiBase, audioMeta) {
    if (!apiBase || !audioMeta || !audioMeta.relative_path) return null;
    const fileId = encodeFileId(audioMeta.relative_path);
    const grantUrl = apiBase.replace(/\/+$/, "") +
      "/api/v1/files/" + encodeURIComponent(fileId) + "/download-grants";
    try {
      const resp = await fetch(grantUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Accept": "application/json" },
      });
      if (!resp.ok) {
        console.warn("[chart] audio grant failed: HTTP " + resp.status);
        return null;
      }
      const data = await resp.json();
      if (!data || !data.downloadUrl) {
        console.warn("[chart] audio grant response missing downloadUrl", data);
        return null;
      }
      // downloadUrl is server-relative; resolve against apiBase.
      return apiBase.replace(/\/+$/, "") + data.downloadUrl;
    } catch (e) {
      console.warn("[chart] audio grant fetch threw", e);
      return null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  async function loadAndRender(host, timelineUrl, opts) {
    const r = await fetch(timelineUrl);
    if (!r.ok) throw new Error("Failed to fetch timeline: " + r.status);
    const timeline = await r.json();

    const resolvedOpts = Object.assign({}, opts || {});
    if (timeline.audio && resolvedOpts.apiBase) {
      const url = await resolveAudioUrl(resolvedOpts.apiBase, timeline.audio);
      if (url) {
        resolvedOpts.audioUrl = url;
        resolvedOpts.audioOffsetSec = timeline.audio.offset_sec || 0;
      }
    }
    return createChartView(host, timeline, resolvedOpts);
  }

  root.ChartRenderer = {
    createChartView,
    loadAndRender,
    DEFAULT_OPTS,
    encodeFileId,
    resolveAudioUrl,
  };
})(window);
