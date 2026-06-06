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
  // Phase A — mockup palette. Notes are matte (no highlight edge, no glow);
  // colors are deliberately desaturated so the cyan press beam + judgment
  // bursts read as the "active" signal against them.
  const SP_LAYOUT = [
    { w: 1.6, color: "#e23a55", kind: "scratch", label: "SC" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "1" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "2" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "3" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "4" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "5" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "6" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "7" },
  ];

  const DP_LAYOUT = [
    { w: 1.6, color: "#e23a55", kind: "scratch", label: "1SC" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "1-1" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "1-2" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "1-3" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "1-4" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "1-5" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "1-6" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "1-7" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "2-1" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "2-2" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "2-3" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "2-4" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "2-5" },
    { w: 0.9, color: "#2f80d8", kind: "black",   label: "2-6" },
    { w: 1.0, color: "#d7dfeb", kind: "white",   label: "2-7" },
    { w: 1.6, color: "#e23a55", kind: "scratch", label: "2SC" },
  ];

  const DEFAULT_OPTS = {
    // Main panel
    mainLaneUnit:    { SP: 30, DP: 30 },
    mainHeight:      520,
    mainHeaderHeight: 0,           // dropped — measure labels now live in the left rail
    mainFooterHeight: 0,           // R8-26: dropped — was 14 px of dead canvas
                                   // between judgment line and the keyzone overlay
                                   // (nothing was ever drawn there). Removing it
                                   // tightens the gap to just kzClear (3 px).
    mainNoteHeight:  10,
    mainLeftRailWidth: 50,         // measure label sub-lane on the left of the lanes
    // Phase B key zone — 0 means "no key zone, full canvas is play area".
    // chart-preview passes 126 to reserve a strip at the bottom for key
    // caps + HI-SPEED + score. Renderer subtracts (keyZoneH + 3 px
    // clearance) from the play area height when computing judgmentY.
    keyZoneH:        0,
    // Queue panels (horizontal row, each matching main height + width)
    queueLaneUnit:   { SP: 20, DP: 26 },  // SP narrower than main so tiles fit more measures
    queueHeaderHeight: 22,
    queueGapPx:      6,
    queueNoteHeight: 8,
    queueScrollbarReservePx: 18,           // bottom reserve so scrollbar doesn't cover canvas
    queueCanvasMaxWidth: 0,                // 0 = no cap (virtualization handles arbitrary length)
    measuresPerTile: 1,                    // one measure per tile (uniform memory; SP+DP same model)
    // Both — Phase A mockup palette. Dark navy bg + cyan accents + red
    // judgment line. activeBorder stays cyan now so the queue overlay and
    // any future "this is active" cues read against the gold judgment
    // palette without competing.
    p1p2GapPx:       8,
    lnAlpha:         0.65,
    bg:              "#05070d",
    panelBg:         "#0c111c",
    laneBg:          "#0c111c",
    laneSep:         "rgba(120,150,200,0.10)",
    beatLine:        "rgba(150,175,215,0.26)",
    halfBeatLine:    "rgba(150,175,215,0.10)",
    subBeatLine:     "rgba(150,175,215,0.14)",
    activeBorder:    "#34e0ff",
    queueBorder:     "rgba(120,150,200,0.12)",
    labelColor:      "#7c879a",
    labelColorActive:"#34e0ff",
    bpmColor:        "#ffd23f",   // gold — BPM change indicator
    stopColor:       "#ff3344",   // red — STOP indicator
    judgmentLineColor: "#ff3344",
  };

  function layoutFor(timeline) {
    return timeline.mode === "DP" ? DP_LAYOUT : SP_LAYOUT;
  }

  // ── Play-mode constants ─────────────────────────────────────────────
  // KeyboardEvent.code → lane index (matches SP_LAYOUT / DP_LAYOUT).
  // SP: scratch on Left Shift, then Z S X D C F V for keys 1-7.
  // DP: 1P side identical to SP; 2P side uses LR2 default
  //   (1P scratch=LShift, 2P scratch=RShift). Comma/Period/Semicolon/Slash
  //   are layout-independent in `e.code`.
  const KEY_MAP_SP = {
    ShiftLeft: 0,
    KeyZ: 1, KeyS: 2, KeyX: 3, KeyD: 4, KeyC: 5, KeyF: 6, KeyV: 7,
  };
  const KEY_MAP_DP = {
    ShiftLeft: 0,
    KeyZ: 1, KeyS: 2, KeyX: 3, KeyD: 4, KeyC: 5, KeyF: 6, KeyV: 7,
    KeyM: 8, KeyK: 9, Comma: 10, KeyL: 11, Period: 12, Semicolon: 13, Slash: 14,
    ShiftRight: 15,
  };
  // LR2-style judgment windows (seconds from note time).
  const JUDGMENT_WINDOWS = {
    PG: 0.018,
    G: 0.040,
    Good: 0.100,
    Bad: 0.200,
  };
  // R8-26 — ghost rendering. Per-note state stored as small uint codes so
  // a single Uint8Array tracks all judgments without object allocation.
  const JUDGMENT_CODE_NONE = 0;
  const JUDGMENT_CODE_PG   = 1;
  const JUDGMENT_CODE_G    = 2;
  const JUDGMENT_CODE_GOOD = 3;
  const JUDGMENT_CODE_BAD  = 4;
  const JUDGMENT_CODE_MISS = 5;
  const JUDGMENT_CODE_BY_NAME = {
    PG: JUDGMENT_CODE_PG, G: JUDGMENT_CODE_G,
    Good: JUDGMENT_CODE_GOOD, Bad: JUDGMENT_CODE_BAD,
    Miss: JUDGMENT_CODE_MISS,
  };
  // Ghost tint colours (RGB only — alpha applied at draw site). Tuned to
  // sit between the lane base colour and the verdict glow so the note
  // stays readable but is clearly judged.
  const JUDGMENT_TINT = [
    null,             // 0 NONE
    "52,224,255",     // PG  cyan
    "86,168,255",     // G   blue
    "255,213,63",     // Good gold
    "255,136,68",     // Bad  orange
    "180,40,55",      // Miss dark red
  ];
  // IIDX-style press beam — vertical light shaft rising from the judgment
  // line when a lane key is pressed. Triggered on EVERY press (judged or
  // empty) since it's input feedback, not judgment feedback. The duration
  // and alpha scale are tunable via view.setSettings({...}).

  // r12.1 — Fixed internal baseline that absorbs the typical
  // browser→render→reaction chain so the judge-offset slider stays in a
  // tight sensitive range around 0. Effective judging offset
  // = INPUT_BASELINE_MS + settings.judgeOffsetMs.
  const INPUT_BASELINE_MS = -100;
  const BEAM_DEFAULTS = {
    beamLengthRatio: 0.55,    // fraction of body height
    beamDurationSec: 0.18,
    beamAlphaScale: 1.0,
    hitBurstEnabled: true,
    hitBurstDurationSec: 0.25,
    hiSpeed: 1.0,             // mockup HI-SPEED — visibleBeats = 8 / hiSpeed
    // Phase D — input timing correction. judgeOffsetMs shifts the judging
    // clock: delta = note.sec − (currentSec + offsetSec). Positive offset
    // means the player is hitting early; we judge later to compensate.
    // autoAdjust accumulates the avg of the last 16 successful-hit signed
    // deltas into judgeOffsetMs (clamped ±100).
    judgeOffsetMs: 0,
    autoAdjust: false,
    judgmentLineOffset: 0,    // Phase F — px the line rises above its base.
    showMeasureMarkers: true, // <mxx> + BPM change + STOP markers.
                              // SP: shown in left rail; OFF collapses rail
                              // and lanes shift left. DP: shown in centre
                              // pillar; OFF removes pillar text only.
    // R8-21 — hide SP's left measure-rail entirely. Independent from
    // showMeasureMarkers: forces the rail width to 0 even when markers are on.
    // No-op on DP (which never has a left rail).
    hideMeasureRail: false,
    // R8-21 — Watch mode: suppress everything judgment-related. pressLane /
    // releaseLane / ageMisses / emitJudgment all early-return so there's no
    // hit-test, no press beam, no popup, and no score increment. Notes still
    // scroll visually so the player can follow along.
    hideJudgment: false,
    // R8-26 — queue ghost overlay. When true (default), queue tiles re-tint
    // judged notes by verdict color and draw a 1 px timing line at the
    // actual hit position. Toggle off to hide the post-hit feedback while
    // keeping the rest of the play loop intact. Re-renders cached tiles
    // when flipped via setSettings.
    ghostEnabled: true,
    // R8-10 — loop wrap "Standby" window. Stage-1 hold (audio paused, visual
    // pinned) before stage-2 audio-resume gate fires. 250 ms is the in-house
    // "Instant" floor (going to 0 reintroduces the decoder-warmup stutter);
    // 1000 / 2000 / 3000 give an explicit beat for re-orienting during
    // practice. UI surfaces this in the Effects modal as a radio group.
    loopWrapHoldMs: 250,
    // R8-13 / R8-14 — gameplay lane modifiers (LR2 convention).
    //   laneMod    / laneFilter    apply to SP (and to the 1P side in DP)
    //   laneMod2P  / laneFilter2P  apply to the 2P side in DP only (ignored on SP)
    // RANDOM / R-RANDOM regenerate per chart load AND on each set; MIRROR is
    // deterministic. View filters suppress drawing of the off-set lanes and
    // disable hit-testing for that side (per user spec).
    laneMod:      "off",
    laneFilter:   "off",
    laneMod2P:    "off",
    laneFilter2P: "off",
  };
  // Phase A — vibrant cyan from the mockup palette. Beam = "cyan = system".
  const BEAM_RGB = "52,224,255";
  // Hit-burst colors by judgment type — only fires on a successful hit
  // (PG/G/Good). Bad/Miss are left to the popup. Hex aligned with the
  // mockup CSS vars so canvas bursts and DOM popup/counts stay in sync.
  const HIT_BURST_RGB = {
    PG:   "255,210,63",   // gold  (#ffd23f)
    G:    "55,229,143",   // green (#37e58f)
    Good: "86,168,255",   // blue  (#56a8ff)
  };
  function keyMapFor(mode) {
    return mode === "DP" ? KEY_MAP_DP : KEY_MAP_SP;
  }

  function laneOffsetsPx(layout, laneUnit, _p1p2GapPx) {
    // PORT_FIXUPS r5 — DP center gap is 1.3 lane-weight units (mockup
    // cp-engine.js gapW). Proportional to laneUnit so main (laneUnit=30)
    // gets 39 px gap, queue (laneUnit=26) gets 33.8 px gap — the visual
    // ratio of the gap to a lane stays constant. Old fixed opts.p1p2GapPx
    // (8 px) made the center pillar too narrow vs mockup; arg kept for
    // back-compat but ignored.
    const gap = (layout.length === 16) ? 1.3 * laneUnit : 0;
    const xs = [];
    let cum = 0;
    for (let i = 0; i < layout.length; i++) {
      xs.push(cum);
      cum += layout[i].w * laneUnit;
      if (layout.length === 16 && i === 7) cum += gap;
    }
    xs.push(cum);
    return xs;
  }
  function laneTotalWidth(layout, laneUnit, p1p2GapPx) {
    return laneOffsetsPx(layout, laneUnit, p1p2GapPx).slice(-1)[0];
  }

  // ── time_map helpers (sec ↔ beat) ─────────────────────────────────────
  // time_map intervals are [sec_start, sec_end, beat_start, beat_end].
  // Linear intervals advance beat with sec; freeze intervals (beat_start ===
  // beat_end) hold beat constant while sec advances (this is how STOPs are
  // represented).
  function secToBeat(sec, timeMap) {
    if (!timeMap || !timeMap.length) return sec;
    if (sec <= timeMap[0][0]) return timeMap[0][2];
    // Binary search for the interval containing sec.
    let lo = 0, hi = timeMap.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (timeMap[mid][0] <= sec) lo = mid; else hi = mid - 1;
    }
    const iv = timeMap[lo];
    const span = iv[1] - iv[0];
    if (span <= 1e-9 || iv[3] === iv[2]) return iv[2];
    if (sec >= iv[1]) return iv[3];
    return iv[2] + (sec - iv[0]) / span * (iv[3] - iv[2]);
  }

  function beatToSec(beat, timeMap) {
    if (!timeMap || !timeMap.length) return beat;
    // Find the FIRST interval whose [beat_start, beat_end] contains beat.
    // During a freeze (beat_start === beat_end === beat), this returns the
    // sec at which the freeze begins, which is what "seek to this beat"
    // should land on.
    for (let i = 0; i < timeMap.length; i++) {
      const iv = timeMap[i];
      const bStart = Math.min(iv[2], iv[3]);
      const bEnd = Math.max(iv[2], iv[3]);
      if (beat < bStart - 1e-6) continue;
      if (beat > bEnd + 1e-6) continue;
      const beatSpan = iv[3] - iv[2];
      if (Math.abs(beatSpan) < 1e-9) return iv[0];
      return iv[0] + (beat - iv[2]) / beatSpan * (iv[1] - iv[0]);
    }
    const last = timeMap[timeMap.length - 1];
    return last[1];
  }

  function ensureTimeMap(timeline) {
    if (timeline.time_map && timeline.time_map.length) return timeline.time_map;
    // Legacy: synthesize a single linear interval from base_bpm.
    const bpm = timeline.base_bpm || 130;
    const totalSec = timeline.total_sec || 0;
    const totalBeats = totalSec * bpm / 60;
    return [[0, totalSec, 0, totalBeats]];
  }

  function ensureBeatNotes(notes, timeMap) {
    // notes (v2): [lane, sec, hold_sec, beat, hold_beat]. Pass through.
    // notes (v1): [lane, sec, hold_sec] — derive beat from timeMap.
    return notes.map(n => {
      if (n.length >= 5) return n;
      const beat = secToBeat(n[1], timeMap);
      const holdBeat = n[2] > 0 ? secToBeat(n[1] + n[2], timeMap) - beat : 0;
      return [n[0], n[1], n[2], beat, holdBeat];
    });
  }

  // ── Measure boundaries ────────────────────────────────────────────────
  // bpmChanges: [[sec, bpm], ...]
  // stops:      [[start_sec, duration_sec], ...] — each entry's start_sec
  //             is the real time at which the STOP fires (i.e. already
  //             includes the dead-time of every earlier STOP).
  function computeMeasures(bpmChanges, stops, totalSec) {
    const measures = [];
    if (!bpmChanges || bpmChanges.length === 0) return measures;
    let curBpm = bpmChanges[0][1] || 130;
    let t = 0;
    let beatIdx = 0;
    let segIdx = 0;
    let stopIdx = 0;
    let measureStart = 0;
    let measureStartBpm = curBpm;
    let idx = 1;
    let safety = 0;
    const sortedStops = (stops || []).slice().sort((a, b) => a[0] - b[0]);
    while (t < totalSec && safety < 100000) {
      while (segIdx + 1 < bpmChanges.length && t >= bpmChanges[segIdx + 1][0] - 1e-9) {
        segIdx++;
        curBpm = bpmChanges[segIdx][1];
      }
      const beatDur = 60 / Math.max(curBpm, 1);
      t += beatDur;
      // After advancing by one beat, absorb any STOPs whose start_sec is now
      // at-or-behind us. The measure that contained the beat naturally
      // extends because measureStart is fixed and t (= future end_sec) just
      // grew by the STOP duration.
      while (stopIdx < sortedStops.length && sortedStops[stopIdx][0] <= t + 1e-9) {
        t += sortedStops[stopIdx][1];
        stopIdx++;
      }
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

  // ── Active-measure overlay (Phase E) ──────────────────────────────────
  // Cyan-system framing of the active queue tile:
  //   (a) Cyan rounded-rect frame around the whole tile with a soft glow.
  //   (b) White corner ticks (L-shapes 10 px long) at the four corners.
  //   (c) Bottom-edge cyan progress fill, width = panel_w × progress.
  //   (d) Red horizontal playhead line at the measure-internal position
  //       of the judgment line — same convention as the queue panel
  //       layout: bottom = measure start, top = measure end. So at
  //       progress=0 the line sits at the bottom; at progress=1 it sits
  //       at the top of the panel body.
  function drawProgressBorder(ctx, x, y, w, h, progress, color, measureIdx, headerH, footerReserve) {
    if (!isFinite(progress)) progress = 0;
    progress = Math.max(0, Math.min(1, progress));
    const cyan = color || "#34e0ff";
    const judgeRed = "#ff3344";

    // (a) Cyan frame.
    ctx.save();
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2;
    const fx = x + 1.5, fy = y + 1.5;
    const fw = w - 3, fh = h - 3;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(fx, fy, fw, fh, 5);
      ctx.stroke();
    } else {
      ctx.strokeRect(fx, fy, fw, fh);
    }
    ctx.restore();

    // (b) White corner ticks.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    const t = 10;
    const corners = [
      [x + 2,     y + 2,     1,  1],
      [x + w - 2, y + 2,    -1,  1],
      [x + 2,     y + h - 2, 1, -1],
      [x + w - 2, y + h - 2,-1, -1],
    ];
    for (const c of corners) {
      const cx = c[0], cy = c[1], dx = c[2], dy = c[3];
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * t);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * t, cy);
      ctx.stroke();
    }

    // (c) Bottom progress fill.
    ctx.save();
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = cyan;
    ctx.fillRect(x + 2, y + h - 5, (w - 4) * progress, 3);
    ctx.restore();

    // (d) Red playhead. Panel convention: bottom = measure start, top =
    // end → playY = headerH + (1 - progress) * bodyH. footerReserve
    // shrinks bodyH from below so the playhead lands on the same on-screen y
    // as the main canvas judgment line (aligns with note-being-judged).
    if (headerH > 0) {
      const bodyH = h - headerH - (footerReserve || 0);
      const playY = y + headerH + (1 - progress) * bodyH;
      ctx.save();
      ctx.shadowColor = judgeRed;
      ctx.shadowBlur = 5;
      ctx.strokeStyle = judgeRed;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, playY + 0.5);
      ctx.lineTo(x + w, playY + 0.5);
      ctx.stroke();
      ctx.restore();
      // Left-edge triangle marker for readability over dense notes.
      ctx.fillStyle = judgeRed;
      ctx.beginPath();
      ctx.moveTo(x, playY - 4);
      ctx.lineTo(x + 6, playY);
      ctx.lineTo(x, playY + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Static queue-panel draw ───────────────────────────────────────────
  function drawQueuePanel(ctx, p) {
    const {
      x, y, w, h, layout, laneUnit, p1p2GapPx,
      headerH, noteHeight, lnAlpha, opts,
      label, bpmLabel, measure, notes,
      displayPos,                          // R8-13 lane permutation
      laneFilterMode, laneFilterMode2P,    // R8-14 per-side filters (1P/SP, 2P)
      mode,
      noteToIdx, noteJudgmentType, noteDeltaMs,   // R8-26 ghost (optional)
      ghostLoopStart, ghostLoopEnd,               // R8-26 — when set, ghost only applies to notes within [start, end]
      bodyFooter,   // R8-26 alignment — shrinks usable body so the panel's
                    // logical "now line" coincides with the main canvas
                    // judgment line on screen. 0 = body fills to panel bottom.
    } = p;
    function chartLaneVisible(cl) {
      const f = (mode === "DP" && cl >= 8) ? (laneFilterMode2P || "off") : (laneFilterMode || "off");
      if (f === "off") return true;
      const isScratch = (cl === 0) || (mode === "DP" && cl === 15);
      return f === "scr-only" ? isScratch : !isScratch;
    }
    function dispLaneFor(cl) {
      return (displayPos && displayPos[cl] != null) ? displayPos[cl] : cl;
    }
    const bodyTop = y + headerH;
    const bodyBot = y + h - (bodyFooter || 0);
    const bodyH = bodyBot - bodyTop;
    const innerW = laneTotalWidth(layout, laneUnit, p1p2GapPx);
    const innerLeft = x + Math.max(2, (w - innerW) / 2);

    ctx.fillStyle = opts.panelBg;
    ctx.fillRect(x, y, w, h);

    const isDP_layout = (layout.length === 16);
    if (label && !isDP_layout) {
      // SP — measure label top-left of header.
      ctx.fillStyle = opts.labelColor;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 6, y + headerH / 2);
    }
    // DP measure label is rendered later (in the centre pillar, after
    // pillar fill so it sits on top of the bg).
    if (bpmLabel) {
      ctx.fillStyle = opts.bpmColor;
      ctx.font = "10px 'JetBrains Mono', monospace";
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
    // R8-26 — thin horizontal lines at body top (header/body divider) and
    // bottom (playhead start = main judgment line equivalent). Frames each
    // measure with a clear ceiling and ground line.
    ctx.strokeStyle = opts.queueBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(innerLeft, bodyTop + 0.5);
    ctx.lineTo(innerLeft + innerW, bodyTop + 0.5);
    ctx.moveTo(innerLeft, bodyBot - 0.5);
    ctx.lineTo(innerLeft + innerW, bodyBot - 0.5);
    ctx.stroke();
    // #5 — DP centre pillar in queue panel (same as main).
    if (layout.length === 16) {
      const gapW = 1.3 * laneUnit;
      const gapLeft = innerLeft + xs[7] + layout[7].w * laneUnit;
      ctx.fillStyle = opts.bg;
      ctx.fillRect(gapLeft, bodyTop, gapW, bodyH);
      // R8-26 — DP measure label centered (h+v) inside the pillar.
      if (label) {
        ctx.fillStyle = opts.labelColor;
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, gapLeft + gapW / 2, (bodyTop + bodyBot) / 2);
      }
    }

    // 16th note grid: 15 internal lines. Beats (i % 4 === 0) use opts.beatLine,
    // sub-beats use a translucent lightgray so the beat structure stays
    // dominant while still resolving 16th note alignment.
    // #1 — split lines around DP centre pillar (matches main).
    const isDP_q = (layout.length === 16);
    const gapStartX_q = isDP_q ? (innerLeft + xs[7] + layout[7].w * laneUnit) : 0;
    const gapEndX_q = isDP_q ? (innerLeft + xs[8]) : 0;
    ctx.lineWidth = 1;
    // R8-19: DP queue stacks tiles vertically with no gap — without an
    // explicit beat line at bodyBot the measure seam reads as missing.
    // Extend the upper bound for DP only; SP horizontal layout already
    // delimits measures via the inter-tile gap.
    const iMax = isDP_q ? 16 : 15;
    for (let i = 1; i <= iMax; i++) {
      const ly = bodyTop + (i / 16) * bodyH;
      const pathY = Math.min(ly + 0.5, y + h - 0.5);
      ctx.strokeStyle = (i % 4 === 0) ? opts.beatLine : (opts.subBeatLine || "rgba(211,211,211,0.4)");
      ctx.beginPath();
      if (isDP_q) {
        ctx.moveTo(innerLeft, pathY);
        ctx.lineTo(gapStartX_q, pathY);
        ctx.moveTo(gapEndX_q, pathY);
        ctx.lineTo(innerLeft + innerW, pathY);
      } else {
        ctx.moveTo(innerLeft, pathY);
        ctx.lineTo(innerLeft + innerW, pathY);
      }
      ctx.stroke();
    }

    // Notes — IIDX-style: bottom edge of note sits ON the timing line.
    // Queue uses flipped y: bodyBot = measure start, bodyTop = measure end.
    const dur = Math.max(measure.end_sec - measure.start_sec, 1e-6);
    const haveGhost = !!(noteToIdx && noteJudgmentType);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const laneIdx = n[0];   // chart lane
      if (laneIdx < 0 || laneIdx >= layout.length) continue;
      if (!chartLaneVisible(laneIdx)) continue;
      const dispLane = dispLaneFor(laneIdx);
      const lx = innerLeft + xs[dispLane];
      const lw = layout[dispLane].w * laneUnit;
      const frac = Math.max(0, (n[1] - measure.start_sec) / dur);
      if (frac > 1) continue;
      const yNote = bodyBot - frac * bodyH;
      const ndur = n[2];
      // R8-26 — ghost lookup. ghostCode 0 = note not judged → render as
      // normal. ghostCode > 0 → tint by verdict + a ghost timing line at
      // the actual hit position (skipped for Miss / no delta).
      let ghostCode = 0, ghostDeltaMs = 0;
      if (haveGhost) {
        const gIdx = noteToIdx.get(n);
        if (gIdx != null) {
          ghostCode = noteJudgmentType[gIdx] || 0;
          if (noteDeltaMs) ghostDeltaMs = noteDeltaMs[gIdx];
        }
      }
      // R8-26 — when a loop is active, suppress ghost for notes outside it.
      // The player only practised the loop range; outside-loop judgments are
      // stale data from a previous full-chart pass and would mislead.
      if (ghostCode && ghostLoopStart != null && ghostLoopEnd != null) {
        const nSec = n[1];
        if (nSec < ghostLoopStart || nSec > ghostLoopEnd) ghostCode = 0;
      }
      const baseColor = layout[dispLane].color;
      let fillColor = baseColor;
      let noteAlphaMul = 1;
      if (ghostCode) {
        fillColor = "rgb(" + JUDGMENT_TINT[ghostCode] + ")";
        if (ghostCode === JUDGMENT_CODE_MISS) noteAlphaMul = 0.45;
      }
      if (ndur > 0) {
        const tEnd = Math.min(n[1] + ndur, measure.end_sec);
        const fracEnd = Math.min(1, (tEnd - measure.start_sec) / dur);
        const yNoteEnd = bodyBot - fracEnd * bodyH;
        const top = Math.min(yNote, yNoteEnd);
        const bot = Math.max(yNote, yNoteEnd);
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = lnAlpha * noteAlphaMul;
        ctx.fillRect(lx + 1, top, lw - 2, bot - top);
        ctx.globalAlpha = noteAlphaMul;
        ctx.fillRect(lx, yNote - 2, lw, 2);
        ctx.fillRect(lx, yNoteEnd - 2, lw, 2);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = fillColor;
        if (noteAlphaMul !== 1) ctx.globalAlpha = noteAlphaMul;
        ctx.fillRect(lx, yNote - noteHeight, lw, noteHeight);
        if (noteAlphaMul !== 1) ctx.globalAlpha = 1;
      }
      // Ghost timing line — drawn AFTER the note so it sits on top. Skipped
      // for Miss (no actual hit) and for exact-on-time hits where it would
      // overlap the note edge anyway. deltaMs > 0 = late = larger frac =
      // ghostY ABOVE note in flipped queue; < 0 = early = BELOW.
      if (ghostCode && ghostCode !== JUDGMENT_CODE_MISS && Math.abs(ghostDeltaMs) >= 1) {
        const ghostFrac = frac + (ghostDeltaMs / 1000) / dur;
        if (ghostFrac >= 0 && ghostFrac <= 1) {
          const ghostY = bodyBot - ghostFrac * bodyH;
          ctx.fillStyle = "rgba(" + JUDGMENT_TINT[ghostCode] + ",0.9)";
          ctx.fillRect(lx, ghostY - 0.5, lw, 1);
        }
      }
    }

    ctx.strokeStyle = opts.queueBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // ── Continuous-scroll main draw (beat domain) ────────────────────────
  // Notes are positioned at y = judgmentY - (note_beat - currentBeat) * pxPerBeat.
  // currentBeat is derived from currentSec via the timeMap: during STOPs the
  // beat freezes (visuals freeze with it); during a BPM change the rate at
  // which currentBeat advances per real second changes smoothly (no leap).
  function drawMainScrolling(ctx, p) {
    const {
      x, y, w, h, layout, laneUnit, p1p2GapPx,
      headerH, footerH, noteHeight, lnAlpha, opts,
      activeMeasure, allNotes, currentBeat, pxPerBeat, maxLnHoldBeat,
      measures, stopsBeat, mode, leftRailWidth, mainZoom, judgedFlags,
      lanePressStamp, currentSec, settings,
      laneHitStamp, laneHitType, keyZoneH, laneHold,
      displayPos,    // R8-13: chartLane → visual lane (identity when laneMod off)
      chartLaneAt,   // R8-13: inverse — visual lane → chart lane
    } = p;
    // R8-14: per-side view filter. DP lanes 0..7 follow laneFilter, lanes
    // 8..15 follow laneFilter2P. SP uses laneFilter for everything.
    const f1 = (settings && settings.laneFilter)   || "off";
    const f2 = (settings && settings.laneFilter2P) || "off";
    function filterForLane(li) { return (mode === "DP" && li >= 8) ? f2 : f1; }
    function laneInvisibleByFilter(li) {
      const f = filterForLane(li);
      if (f === "off") return false;
      const isScratch = (li === 0) || (mode === "DP" && li === 15);
      return f === "scr-only" ? !isScratch : /* key-only */ isScratch;
    }
    function chartLaneVisible(cl) { return !laneInvisibleByFilter(cl); }
    function visualLaneVisible(li) { return !laneInvisibleByFilter(li); }
    function dispLaneFor(cl) {
      return (displayPos && displayPos[cl] != null) ? displayPos[cl] : cl;
    }
    function chartLaneFor(li) {
      return (chartLaneAt && chartLaneAt[li] != null) ? chartLaneAt[li] : li;
    }
    // Phase B + F: subtract key-zone height + 3 px clearance from the play
    // area so notes/judgment line stop above the DOM key panel. Phase F
    // adds an optional judgmentLineOffset (0..20 px) that raises the line
    // above its base position without moving the key zone — the lane area
    // between the new line and the (untouched) key zone stays blank but
    // notes never render below the line anyway.
    const kz = keyZoneH || 0;
    // R8-26: kzClear was 3 px (line-thickness allowance). User wants the
    // judgment line flush with the caps row top — drop to 0. The judgment
    // line still draws its 2.5 px stroke + 4 px shadow blur at judgmentY,
    // but the keyzone overlay's top edge (rgba(8,11,18,0.5) gradient start
    // = 50% opaque) lets the line glow show through the upper half.
    const kzClear = 0;
    const lineLift = (settings && settings.judgmentLineOffset) || 0;
    const bodyTop = y + headerH;
    const bodyBot = y + h - footerH - kz - kzClear - lineLift;
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
    // #5 — DP centre pillar (1P|2P gap). Fill with cp-bg (darker than
    // laneBg) so the gap is visible as a "pillar" instead of blending
    // with lane background. Mirror in drawQueuePanel.
    if (layout.length === 16) {
      const gapW = 1.3 * laneUnit;
      const gapLeft = innerLeft + xs[7] + layout[7].w * laneUnit;
      ctx.fillStyle = opts.bg;
      ctx.fillRect(gapLeft, bodyTop, gapW, bodyH);
    }

    // 16th note grid — per measure, 15 internal subdivisions (3 between
    // each beat). Beats (i % 4 === 0) use beatLine; sub-beats use a
    // translucent lightgray so the beat structure stays readable but the
    // 16th positions are visible for alignment.
    const subBeatColor = opts.subBeatLine || "rgba(211,211,211,0.4)";
    // #1 — for DP, split beat lines around the centre pillar so the gap
    // stays visually clean. SP draws a single line across.
    const isDP_lines = (layout.length === 16);
    const gapStartX = isDP_lines ? (innerLeft + xs[7] + layout[7].w * laneUnit) : 0;
    const gapEndX = isDP_lines ? (innerLeft + xs[8]) : 0;
    if (activeMeasure && measures && measures.length) {
      const visibleSpanLocal = bodyH / pxPerBeat;
      const bMinGrid = currentBeat - 0.05 * visibleSpanLocal;
      const bMaxGrid = currentBeat + visibleSpanLocal + 0.05 * visibleSpanLocal;
      ctx.lineWidth = 1;
      for (let mi = 0; mi < measures.length; mi++) {
        const m = measures[mi];
        if (m.end_beat < bMinGrid) continue;
        if (m.start_beat > bMaxGrid) break;
        const mSpan = m.end_beat - m.start_beat;
        for (let i = 0; i < 16; i++) {
          const b = m.start_beat + (i / 16) * mSpan;
          if (b < bMinGrid || b > bMaxGrid) continue;
          const ly = judgmentY - (b - currentBeat) * pxPerBeat;
          if (ly < bodyTop || ly > bodyBot) continue;
          ctx.strokeStyle = (i % 4 === 0) ? opts.beatLine : subBeatColor;
          ctx.beginPath();
          if (isDP_lines) {
            ctx.moveTo(innerLeft, ly + 0.5);
            ctx.lineTo(gapStartX, ly + 0.5);
            ctx.moveTo(gapEndX, ly + 0.5);
            ctx.lineTo(innerLeft + innerW, ly + 0.5);
          } else {
            ctx.moveTo(innerLeft, ly + 0.5);
            ctx.lineTo(innerLeft + innerW, ly + 0.5);
          }
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
    const visibleSpan = bodyH / pxPerBeat;
    const bMin = currentBeat - 0.1 * visibleSpan;
    const bMax = currentBeat + visibleSpan + 0.05 * visibleSpan;
    const searchFrom = bMin - (maxLnHoldBeat || 0);

    // allNotes sorted by beat (n[3]). Binary-search the head.
    let lo = 0, hi = allNotes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (allNotes[mid][3] < searchFrom) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < allNotes.length; i++) {
      const n = allNotes[i];
      const bn = n[3];
      if (bn > bMax) break;
      const flag = judgedFlags ? judgedFlags[i] : 0;
      const laneIdx = n[0];   // chart lane (note's source)
      if (laneIdx < 0 || laneIdx >= layout.length) continue;
      // R8-13 — view filter suppresses off-set lanes entirely.
      if (!chartLaneVisible(laneIdx)) continue;
      const dispLane = dispLaneFor(laneIdx);   // where to PAINT it
      const lx = innerLeft + xs[dispLane];
      const lw = layout[dispLane].w * laneUnit;
      const bdur = n[4];
      if (bdur > 0) {
        // Phase C: LN stays on screen until its TAIL crosses the line.
        //   flag 0 (pending) → normal color
        //   flag 1 (released hit) → done, hide entirely
        //   flag 2 (missed)  → gray bar, still drains so the user can see
        //                       what they missed
        //   flag 3 (holding) → normal color + cyan energised overlay
        if (flag === 1) continue;
        const tailBeat = bn + bdur;
        if (tailBeat < bMin) continue;
        const yStart = judgmentY - (bn - currentBeat) * pxPerBeat;       // head
        const yEnd   = judgmentY - (tailBeat - currentBeat) * pxPerBeat; // tail
        const drawTop = Math.max(yEnd, bodyTop);
        const drawBot = Math.min(yStart, judgmentY);
        if (drawBot <= drawTop) continue;
        const fillX = lx + 3, fillW = lw - 6;
        const fillY = drawTop, fillH = drawBot - drawTop;
        ctx.fillStyle = flag === 2 ? "rgba(108,118,134,0.8)" : layout[dispLane].color;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(fillX, fillY, fillW, fillH, 3);
          ctx.fill();
        } else {
          ctx.fillRect(fillX, fillY, fillW, fillH);
        }
        if (flag === 3) {
          // Cyan energised overlay while held.
          ctx.fillStyle = "rgba(52,224,255,0.40)";
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(fillX, fillY, fillW, fillH, 3);
            ctx.fill();
          } else {
            ctx.fillRect(fillX, fillY, fillW, fillH);
          }
        }
      } else {
        // Tap — hide once resolved (hit or miss).
        if (flag) continue;
        if (bn < bMin) continue;
        const yNote = judgmentY - (bn - currentBeat) * pxPerBeat;
        if (yNote < bodyTop - opts.mainNoteHeight || yNote > bodyBot + opts.mainNoteHeight) continue;
        ctx.fillStyle = layout[dispLane].color;
        ctx.fillRect(lx, yNote - noteHeight, lw, noteHeight);
      }
    }

    // Press beams — Phase A re-design from the mockup. Three additive
    // layers per pressed lane:
    //   (1) wide cyan shaft fading up the lane,
    //   (2) narrow white-hot core column in the lane center,
    //   (3) base glow band at the judgment line.
    // All three modulated by linear-fade alpha over `beamDurationSec`.
    // 'lighter' composite makes overlapping presses (chords) read brighter.
    const beamDur = (settings && settings.beamDurationSec) || 0.18;
    const beamScale = (settings && settings.beamAlphaScale) != null
      ? settings.beamAlphaScale : 1.0;
    const beamRatio = (settings && settings.beamLengthRatio) || 0.55;
    if (lanePressStamp && currentSec != null && beamDur > 0 && beamScale > 0 && beamRatio > 0) {
      const beamH = bodyH * beamRatio;
      const beamTop = judgmentY - beamH;
      const prevCompBeam = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      for (let li = 0; li < layout.length; li++) {
        // R8-13: hide press beam for lanes filtered out of view (notes are
        // suppressed there too, so a beam in empty space reads as a glitch).
        if (!visualLaneVisible(li)) continue;
        let a;
        // Phase C: while an LN is held in this lane the beam stays lit
        // continuously (slight pulse) — release closes it. laneHold is
        // chart-lane-indexed under R8-13; translate via chartLaneFor.
        if (laneHold && laneHold[chartLaneFor(li)]) {
          a = (0.92 + 0.08 * Math.sin(currentSec * 26)) * beamScale;
        } else {
          const stamp = lanePressStamp[li];
          const dt = currentSec - stamp;
          if (dt < 0 || dt > beamDur) continue;
          a = (1 - dt / beamDur) * beamScale;
        }
        if (a <= 0) continue;
        const lx = innerLeft + xs[li];
        const lw = layout[li].w * laneUnit;

        // (1) wide cyan shaft
        const g1 = ctx.createLinearGradient(0, judgmentY, 0, beamTop);
        g1.addColorStop(0,   "rgba(" + BEAM_RGB + "," + (a * 0.85).toFixed(3) + ")");
        g1.addColorStop(0.4, "rgba(" + BEAM_RGB + "," + (a * 0.34).toFixed(3) + ")");
        g1.addColorStop(1,   "rgba(" + BEAM_RGB + ",0)");
        ctx.fillStyle = g1;
        ctx.fillRect(lx + 1, beamTop, lw - 2, beamH);

        // (2) white-hot core column
        const cw = Math.min(lw * 0.5, 16);
        const cx = lx + lw / 2;
        const g2 = ctx.createLinearGradient(0, judgmentY, 0, beamTop);
        g2.addColorStop(0,    "rgba(255,255,255," + (a * 0.6).toFixed(3) + ")");
        g2.addColorStop(0.25, "rgba(" + BEAM_RGB + "," + (a * 0.45).toFixed(3) + ")");
        g2.addColorStop(1,    "rgba(" + BEAM_RGB + ",0)");
        ctx.fillStyle = g2;
        ctx.fillRect(cx - cw / 2, beamTop, cw, beamH);

        // (3) base glow band right at the judgment line
        const glowH = 40;
        const gbTop = judgmentY - glowH;
        const g3 = ctx.createLinearGradient(0, judgmentY, 0, gbTop);
        g3.addColorStop(0, "rgba(223,250,255," + (a * 0.55).toFixed(3) + ")");
        g3.addColorStop(1, "rgba(" + BEAM_RGB + ",0)");
        ctx.fillStyle = g3;
        ctx.fillRect(lx + 1, gbTop, lw - 2, glowH);
      }
      ctx.globalCompositeOperation = prevCompBeam;
    }

    // Hit burst — judgment-quality halo at the judgment line for a
    // successful hit (PG/G/Good). Additive ('lighter') blend so it pops
    // against the lane bg and chained presses stay visible.
    const burstEnabled = !settings || settings.hitBurstEnabled !== false;
    const burstDur = (settings && settings.hitBurstDurationSec) || 0.25;
    if (burstEnabled && laneHitStamp && laneHitType && currentSec != null && burstDur > 0) {
      const prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      for (let li = 0; li < layout.length; li++) {
        if (!visualLaneVisible(li)) continue;   // R8-13
        const stamp = laneHitStamp[li];
        const dt = currentSec - stamp;
        if (dt < 0 || dt > burstDur) continue;
        const type = laneHitType[li];
        const rgb = type && HIT_BURST_RGB[type];
        if (!rgb) continue;
        const lx = innerLeft + xs[li];
        const lw = layout[li].w * laneUnit;
        const cx = lx + lw / 2;
        const t = dt / burstDur;                    // 0..1
        const a = Math.max(0, 1 - t) * 0.85;
        const baseR = Math.max(8, lw * 0.4);
        const r = baseR * (1 + t * 1.6);            // expand outward
        const grad = ctx.createRadialGradient(cx, judgmentY, 0, cx, judgmentY, r);
        grad.addColorStop(0, "rgba(" + rgb + "," + a.toFixed(3) + ")");
        grad.addColorStop(0.4, "rgba(" + rgb + "," + (a * 0.55).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(" + rgb + ",0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, judgmentY, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = prevComp;
    }

    // Judgment line — Phase A: red with a subtle red shadow + a 12 px
    // faint downward glow band. Notes are clipped above the line, so the
    // band sits over the lane footer area only.
    ctx.save();
    ctx.shadowColor = opts.judgmentLineColor;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = opts.judgmentLineColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(innerLeft, judgmentY + 0.5);
    ctx.lineTo(innerLeft + innerW, judgmentY + 0.5);
    ctx.stroke();
    ctx.restore();
    const jlGrad = ctx.createLinearGradient(0, judgmentY, 0, judgmentY + 12);
    // 16 chars after "rgba(" assume #ff3344 → (255, 51, 68). Use a literal
    // rgba here since we don't have the channels split out for the line.
    jlGrad.addColorStop(0, "rgba(255,51,68,0.10)");
    jlGrad.addColorStop(1, "rgba(255,51,68,0)");
    ctx.fillStyle = jlGrad;
    ctx.fillRect(innerLeft, judgmentY, innerW, 12);

    // Measure markers: <mxx> label + "prevBPM→curBPM" + "■<dur>s" STOP.
    // SP: drawn in the left rail (leftRailWidth > 0). When the toggle is
    //     off, leftRailWidth is 0 and the block is skipped entirely.
    // DP: drawn centred in the pillar between lane 7 and lane 8. SP-style
    //     left rail is never used in DP (leftRailWidth always 0 there).
    const markersOn = settings && settings.showMeasureMarkers !== false;
    const drawMarkersInRail   = markersOn && mode !== "DP" && leftRailWidth > 0;
    const drawMarkersInPillar = markersOn && mode === "DP";
    if ((drawMarkersInRail || drawMarkersInPillar) && measures && measures.length) {
      const visibleSpanLabel = bodyH / pxPerBeat;
      const bMinLabel = currentBeat - 0.1 * visibleSpanLabel;
      const bMaxLabel = currentBeat + visibleSpanLabel + 0.05 * visibleSpanLabel;
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textBaseline = "alphabetic";

      let labelX;
      if (drawMarkersInPillar) {
        // Pillar centre = lane7 right edge + half the inter-side gap.
        // laneOffsetsPx inserts a (1.3 * laneUnit) gap after lane index 7.
        const offsets = laneOffsetsPx(layout, laneUnit, p1p2GapPx);
        const lane7Right = offsets[7] + layout[7].w * laneUnit;
        const gap = (layout.length === 16) ? 1.3 * laneUnit : 0;
        labelX = innerLeft + lane7Right + gap / 2;
        ctx.textAlign = "center";
      } else {
        labelX = x + 6;
        ctx.textAlign = "left";
      }

      for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        if (m.start_beat < bMinLabel) continue;
        if (m.start_beat > bMaxLabel) break;
        const ly = judgmentY - (m.start_beat - currentBeat) * pxPerBeat;
        if (ly < bodyTop - 4 || ly > bodyBot + 4) continue;
        ctx.fillStyle = opts.labelColor;
        ctx.fillText("#" + m.idx, labelX, ly - 4);
        if (i > 0 && Math.abs(measures[i - 1].bpm - m.bpm) > 0.5) {
          ctx.fillStyle = opts.bpmColor;
          const prev = Math.round(measures[i - 1].bpm);
          const cur  = Math.round(m.bpm);
          ctx.fillText(prev + "→" + cur, labelX, ly + 10);
        }
      }

      // STOPs — drawn at their own beat position (not measure boundary).
      if (stopsBeat && stopsBeat.length) {
        ctx.fillStyle = opts.stopColor;
        for (let i = 0; i < stopsBeat.length; i++) {
          const s = stopsBeat[i];
          if (s.start_beat < bMinLabel) continue;
          if (s.start_beat > bMaxLabel) break;
          const ly = judgmentY - (s.start_beat - currentBeat) * pxPerBeat;
          if (ly < bodyTop - 4 || ly > bodyBot + 4) continue;
          ctx.fillText("■" + s.duration_sec.toFixed(2) + "s", labelX, ly + 10);
        }
      }
    }

    // R8-26 — zoom indicator (×N.NN) removed; HI-SPEED value is already
    // shown in the keyzone HI-SPEED row.
  }

  // ── View ──────────────────────────────────────────────────────────────
  // ── Pure chart model builder ─────────────────────────────────────────
  // r11 Phase 2 — normalises raw timeline JSON into the runtime model that
  // createChartView consumes. No DOM access, no opts, no closures kept
  // alive past return; pure data in / data out. Returned arrays/maps are
  // mutable and owned by the caller (game state fields zero-initialise and
  // are mutated during play). Splitting this out gives the domain prep a
  // name and a stable contract — clean extraction with no behaviour
  // change.
  function buildChartModel(timeline) {
    const layout    = layoutFor(timeline);
    const mode      = timeline.mode;
    const totalSec  = timeline.total_sec || 0;
    const timeMap   = ensureTimeMap(timeline);
    const totalBeats = timeline.total_beats
      || (timeMap.length ? timeMap[timeMap.length - 1][3] : 0);

    // Per-measure BPM (look up from bpm_changes; defaults to base_bpm).
    const bpmChanges = timeline.bpm_changes || [[0, timeline.base_bpm || 130]];
    function bpmAtSec(sec) {
      let bpm = bpmChanges[0][1] || (timeline.base_bpm || 130);
      for (let i = 0; i < bpmChanges.length; i++) {
        if (bpmChanges[i][0] <= sec + 1e-9) bpm = bpmChanges[i][1]; else break;
      }
      return bpm;
    }

    // Measures in beat space. Prefer the new schema; fall back to
    // beat-converting the legacy sec-based computeMeasures output.
    let measures;
    if (timeline.measures && timeline.measures.length) {
      measures = timeline.measures.map(m => {
        const startSec = beatToSec(m[1], timeMap);
        return {
          idx: m[0],
          start_beat: m[1],
          end_beat: m[2],
          start_sec: startSec,
          end_sec: beatToSec(m[2], timeMap),
          bpm: bpmAtSec(startSec),
          // 4th element flags A2-style outro measures (synthetic = no notes,
          // only there to keep the chart scrolling through the audio tail).
          synthetic: !!m[3],
        };
      });
    } else {
      const secMeasures = computeMeasures(bpmChanges, timeline.stops || [], totalSec);
      measures = secMeasures.map(m => ({
        idx: m.idx,
        start_sec: m.start_sec,
        end_sec: m.end_sec,
        start_beat: secToBeat(m.start_sec, timeMap),
        end_beat: secToBeat(m.end_sec, timeMap),
        bpm: m.bpm,
        partial: m.partial,
      }));
    }

    // Queue measure set — exclude synthetic outro filler. Main canvas keeps
    // the full measures[] (synthetic measures are part of the scroll
    // playback) but the queue only lists "real" measures so charts like
    // Aleph-0[INSANE] (40032 measures, 281 non-synthetic) don't drown the
    // queue in dead tiles. Mapping arrays bridge between queueIdx (0..K-1)
    // and globalIdx (0..measures.length-1).
    const queueMeasures = [];
    const queueGlobalIdx = [];                              // queueIdx → globalIdx
    const globalToQueueIdx = new Array(measures.length).fill(-1);  // globalIdx → queueIdx (-1 = synthetic)
    for (let gi = 0; gi < measures.length; gi++) {
      if (measures[gi].synthetic) continue;
      const qi = queueMeasures.length;
      queueMeasures.push(measures[gi]);
      queueGlobalIdx.push(gi);
      globalToQueueIdx[gi] = qi;
    }

    // STOPs — pre-compute beat positions so the renderer can place a
    // "■<dur>s" marker at the exact y of each stop. timeline.stops is
    // [[start_sec, duration_sec], ...]; beat is fixed during the freeze
    // interval so start_beat is unambiguous.
    const stopsBeat = (timeline.stops || []).map(s => ({
      start_beat: secToBeat(s[0], timeMap),
      duration_sec: s[1],
    }));

    // Notes — augment to 5-element schema if needed, sort by beat for the
    // scrolling binary search.
    const augmentedNotes = ensureBeatNotes(timeline.notes || [], timeMap);
    const notesByMeasure = bucketNotesByMeasure(augmentedNotes, measures);
    const allNotesSorted = augmentedNotes.slice().sort((a, b) => a[3] - b[3]);
    let maxLnHoldBeat = 0;
    for (let i = 0; i < allNotesSorted.length; i++) {
      const d = allNotesSorted[i][4];
      if (d > maxLnHoldBeat) maxLnHoldBeat = d;
    }

    // Per-lane sorted note refs (used by createChartView for press
    // dispatch). flag arrays / index map zero-initialise — mutated by
    // pressLane / releaseLane / ageMisses during play.
    const laneCount = layout.length;
    const notesByLane = Array.from({ length: laneCount }, () => []);
    for (let i = 0; i < allNotesSorted.length; i++) {
      const n = allNotesSorted[i];
      const lane = n[0];
      if (lane < 0 || lane >= laneCount) continue;
      notesByLane[lane].push({ idx: i, sec: n[1], holdSec: n[2] });
    }
    // Phase C — judgedFlags carry four states:
    //   0 = pending  1 = fully resolved (hit, or LN with released tail)
    //   2 = missed   3 = LN head was hit, tail still pending (holding)
    const judgedFlags = new Uint8Array(allNotesSorted.length);
    // R8-26 — ghost: per-note verdict code + timing offset (ms). Both
    // indexed by note's allNotesSorted position so a single TypedArray
    // each, no per-note objects. Populated by pressLane/releaseLane/
    // ageMisses and read by drawQueuePanel to tint the note + draw the
    // actual-hit timing line.
    const noteJudgmentType = new Uint8Array(allNotesSorted.length);
    const noteDeltaMs      = new Float32Array(allNotesSorted.length);
    const noteToGlobalMeasure = new Int32Array(allNotesSorted.length);
    // Map note ARRAY ref → its allNotesSorted index, so drawQueuePanel can
    // look up ghost state for the notes it's drawing.
    const noteToIdx = new Map();
    for (let i = 0; i < allNotesSorted.length; i++) noteToIdx.set(allNotesSorted[i], i);
    for (let mi = 0; mi < notesByMeasure.length; mi++) {
      const bucket = notesByMeasure[mi];
      for (let k = 0; k < bucket.length; k++) {
        const idx = noteToIdx.get(bucket[k]);
        if (idx != null) noteToGlobalMeasure[idx] = mi;
      }
    }

    return {
      layout, mode, totalSec, timeMap, totalBeats,
      measures, queueMeasures, queueGlobalIdx, globalToQueueIdx,
      stopsBeat,
      augmentedNotes, notesByMeasure, allNotesSorted, maxLnHoldBeat,
      laneCount, notesByLane,
      judgedFlags, noteJudgmentType, noteDeltaMs, noteToGlobalMeasure, noteToIdx,
    };
  }

  function createChartView(host, timeline, optsOverride) {
    const opts = Object.assign({}, DEFAULT_OPTS, optsOverride || {});
    // r11 Phase 2 — domain layer separated; createChartView consumes the
    // model, no longer builds it. See buildChartModel above.
    const {
      layout, mode, totalSec, timeMap, totalBeats,
      measures, queueMeasures, queueGlobalIdx, globalToQueueIdx,
      stopsBeat,
      augmentedNotes, notesByMeasure, allNotesSorted, maxLnHoldBeat,
      laneCount, notesByLane,
      judgedFlags, noteJudgmentType, noteDeltaMs, noteToGlobalMeasure, noteToIdx,
    } = buildChartModel(timeline);
    const laneCursor = new Array(laneCount).fill(0);
    // Active LN being held per lane (lane index → notesByLane entry). The
    // press beam stays lit continuously while a lane has an entry here.
    const laneHold = new Array(laneCount).fill(null);
    // Press timestamps (chart-sec) for the IIDX-style press beam. -Infinity
    // means "never pressed" so dt comparison is always > duration.
    const lanePressStamp = new Float64Array(laneCount);
    lanePressStamp.fill(-1e9);
    // Hit-burst stamps + per-lane judgment-type ("PG"/"G"/"Good") so the
    // burst can render in the type's color. Bad/Miss leave the prior burst
    // alone (they don't fire a new one).
    const laneHitStamp = new Float64Array(laneCount);
    laneHitStamp.fill(-1e9);
    const laneHitType = new Array(laneCount).fill(null);
    const settings = Object.assign({}, BEAM_DEFAULTS);
    let onJudgment = null;
    let onLaneSettingsChange = null;        // R8-13 host hook for persistence
    let onLaneModConfigRequested = null;    // R8-15 host opens the gear-config modal

    // R8-13 — lane permutation state.
    //   displayPos[chartLane]  → which display position the chart lane goes to
    //   chartLaneAt[dispLane]  → which chart lane plays at this display position
    // Identity arrays for laneMod === "off". RANDOM / R-RANDOM pick fresh
    // permutations on regenerateLaneMap(); MIRROR is deterministic.
    let displayPos    = new Array(laneCount);
    let chartLaneAt   = new Array(laneCount);
    function permuteRange(start, end, modValue) {
      const src = [];
      for (let i = start; i <= end; i++) src.push(i);
      if (modValue === "mirror") {
        return src.reverse();
      } else if (modValue === "random") {
        const dst = src.slice();
        for (let i = dst.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = dst[i]; dst[i] = dst[j]; dst[j] = tmp;
        }
        return dst;
      } else if (modValue === "r-random") {
        const shift = 1 + Math.floor(Math.random() * (src.length - 1));
        return src.slice(shift).concat(src.slice(0, shift));
      }
      return src;   // "off" or unknown ⇒ identity
    }
    function regenerateLaneMap() {
      for (let i = 0; i < laneCount; i++) { displayPos[i] = i; chartLaneAt[i] = i; }
      // R8-14 — 1P / 2P apply different mods on DP. SP ignores laneMod2P.
      const sides = (mode === "DP")
        ? [{ s: 1, e: 7, mod: settings.laneMod }, { s: 8, e: 14, mod: settings.laneMod2P }]
        : [{ s: 1, e: 7, mod: settings.laneMod }];
      for (const side of sides) {
        if (side.mod === "off") continue;
        const src = [];
        for (let i = side.s; i <= side.e; i++) src.push(i);
        const dst = permuteRange(side.s, side.e, side.mod);
        for (let k = 0; k < src.length; k++) {
          displayPos[src[k]]  = dst[k];
          chartLaneAt[dst[k]] = src[k];
        }
      }
    }
    regenerateLaneMap();
    // R8-15 — per-side mapping accessors for the gear-config modal.
    //   side = "1p" → key range [1..7]; "2p" → [8..14] (DP only).
    function sideRange(side) {
      return (side === "2p") ? [8, 14] : [1, 7];
    }
    function getLaneMapping(side) {
      const [s, e] = sideRange(side);
      const out = [];
      for (let i = s; i <= e; i++) out.push(chartLaneAt[i]);
      return out;
    }
    function setLaneMapping(side, perm) {
      const [s, e] = sideRange(side);
      const len = e - s + 1;
      if (!Array.isArray(perm) || perm.length !== len) return false;
      const seen = new Set();
      for (const v of perm) {
        if (!Number.isInteger(v) || v < s || v > e) return false;
        if (seen.has(v)) return false;
        seen.add(v);
      }
      for (let k = 0; k < perm.length; k++) {
        chartLaneAt[s + k] = perm[k];
        displayPos[perm[k]] = s + k;
      }
      if (typeof resetJudgments === "function") resetJudgments();
      if (typeof drawMain === "function") try { drawMain(); } catch (e) {}
      if (typeof drawFullQueue === "function") try { drawFullQueue(); } catch (e) {}
      return true;
    }
    function rerollLaneMapping(side) {
      const [s, e] = sideRange(side);
      const modValue = (side === "2p") ? settings.laneMod2P : settings.laneMod;
      if (modValue === "off" || modValue === "mirror") return false;
      const newPerm = permuteRange(s, e, modValue);
      return setLaneMapping(side, newPerm);
    }
    // R8-13 / R8-14 — view filter helpers. Per-side on DP: lanes 0..7 follow
    // settings.laneFilter, lanes 8..15 follow settings.laneFilter2P. Filter
    // active on a chart lane ⇒ hide its notes AND disable hit-test for
    // anything pressed there (per user spec).
    function filterForChartLane(chartLane) {
      if (mode === "DP" && chartLane >= 8) return settings.laneFilter2P;
      return settings.laneFilter;
    }
    function laneFilterIsActiveForChartLane(chartLane) {
      return filterForChartLane(chartLane) !== "off";
    }
    function laneVisible(chartLane) {
      const f = filterForChartLane(chartLane);
      if (f === "off") return true;
      const isScratch = (chartLane === 0) || (mode === "DP" && chartLane === 15);
      if (f === "scr-only") return isScratch;
      if (f === "key-only") return !isScratch;
      return true;
    }
    // Phase D — ring buffer of signed-ms deltas for auto-adjust. Pushed
    // on every successful hit (PG / G / Good — not Bad / Miss / null).
    // When full (16 entries) we shift the offset by their average and
    // clear, clamped to ±100 ms.
    const adjustBuf = [];
    function emitJudgment(payload) {
      if (settings.hideJudgment) return;   // R8-21 watch mode
      if (onJudgment) {
        try { onJudgment(payload); } catch (e) { /* swallow */ }
      }
    }
    function judgmentFor(absDelta) {
      if (absDelta <= JUDGMENT_WINDOWS.PG) return "PG";
      if (absDelta <= JUDGMENT_WINDOWS.G) return "G";
      if (absDelta <= JUDGMENT_WINDOWS.Good) return "Good";
      if (absDelta <= JUDGMENT_WINDOWS.Bad) return "Bad";
      return null;
    }
    // R8-26 — ghost tile invalidation. When a note's judgment changes,
    // re-render only the queue tile containing that measure (tiles are
    // otherwise cached). renderQueuePanelAt / globalToQueueIdx / tilesPool
    // are hoisted declarations defined later in createChartView; safe to
    // call at runtime once init has completed.
    function invalidateTileForNote(noteIdx) {
      if (noteIdx < 0 || noteIdx >= noteToGlobalMeasure.length) return;
      const gi = noteToGlobalMeasure[noteIdx];
      if (gi < 0 || gi >= globalToQueueIdx.length) return;
      const qi = globalToQueueIdx[gi];
      if (qi == null || qi < 0) return;
      if (tilesPool.has(qi)) renderQueuePanelAt(qi);
    }
    function invalidateAllQueueTiles() {
      if (!tilesPool) return;
      for (const qi of tilesPool.keys()) renderQueuePanelAt(qi);
    }
    // R8-13 — pressLane / releaseLane now take the PHYSICAL (display) lane,
    // and translate to a chart lane via chartLaneAt[] before touching the
    // note queues. Stamps that drive visuals (press beam, hit burst) stay
    // indexed by the visual lane — that's where the user actually pressed.
    // Hit-testing is gated off when a view filter is active per user spec.
    function pressLane(lane) {
      if (lane < 0 || lane >= laneCount) return;
      if (settings.hideJudgment) return;   // R8-21 watch mode — no beam, no hit-test
      // Press beam fires unconditionally — input feedback, not judgment.
      lanePressStamp[lane] = state.currentSec;
      // r12.2 — synchronous paint so the press beam lands on screen this
      // microtask instead of waiting for the next rAF tick (saves 0-16 ms
      // of beam-appearance latency on top of the still-unavoidable
      // compositor + display delay). Hit burst that may fire below is
      // covered by the same draw since drawMain() reads both stamps.
      // Drawn BEFORE the filter / hold gates so the beam still appears
      // for the side-filtered or LN-held presses (input feedback).
      let _drewBeam = false;
      function _paintBeamNow() {
        if (_drewBeam) return;
        _drewBeam = true;
        if (typeof drawMain === "function") {
          try { drawMain(); } catch (e) {}
        }
      }
      // R8-14: hit-test gate uses the SIDE-appropriate filter (chartLane
      // determines which side: lane ≥ 8 on DP = 2P).
      const chartLane = chartLaneAt[lane];
      if (laneFilterIsActiveForChartLane(chartLane)) { _paintBeamNow(); return; }
      // Already holding an LN in this lane — ignore the press.
      if (laneHold[chartLane]) { _paintBeamNow(); return; }
      const queue = notesByLane[chartLane];
      let c = laneCursor[chartLane];
      while (c < queue.length) {
        const f = judgedFlags[queue[c].idx];
        if (f === 1 || f === 2) c++; else break;
      }
      laneCursor[chartLane] = c;
      if (c >= queue.length) { _paintBeamNow(); return; }
      const entry = queue[c];
      // r12.1 — effective offset = fixed baseline + user residual.
      const offsetSec = (INPUT_BASELINE_MS + (settings.judgeOffsetMs || 0)) / 1000;
      const delta = entry.sec - (state.currentSec + offsetSec);
      const absDelta = Math.abs(delta);
      const verdict = judgmentFor(absDelta);
      if (!verdict) { _paintBeamNow(); return; }
      if (entry.holdSec > 0) {
        judgedFlags[entry.idx] = 3;
        laneHold[chartLane] = entry;
      } else {
        judgedFlags[entry.idx] = 1;
        laneCursor[chartLane] = c + 1;
      }
      if (verdict !== "Bad" && HIT_BURST_RGB[verdict]) {
        laneHitStamp[lane] = state.currentSec;
        laneHitType[lane] = verdict;
      }
      const deltaMs = Math.round(delta * 1000);
      // R8-26 ghost — record verdict + timing, invalidate the tile.
      noteJudgmentType[entry.idx] = JUDGMENT_CODE_BY_NAME[verdict] || 0;
      noteDeltaMs[entry.idx] = deltaMs;
      invalidateTileForNote(entry.idx);
      emitJudgment({ type: verdict, lane, deltaMs });
      _maybeAutoAdjust(verdict, deltaMs);
      _paintBeamNow();
    }

    function releaseLane(lane) {
      if (lane < 0 || lane >= laneCount) return;
      if (settings.hideJudgment) return;   // R8-21 watch mode
      const chartLane = chartLaneAt[lane];
      if (laneFilterIsActiveForChartLane(chartLane)) return;   // R8-14
      const entry = laneHold[chartLane];
      if (!entry) return;
      laneHold[chartLane] = null;
      const tailSec = entry.sec + entry.holdSec;
      // r12.1 — effective offset = fixed baseline + user residual.
      const offsetSec = (INPUT_BASELINE_MS + (settings.judgeOffsetMs || 0)) / 1000;
      const delta = tailSec - (state.currentSec + offsetSec);
      const absDelta = Math.abs(delta);
      let verdict;
      if (absDelta <= JUDGMENT_WINDOWS.PG) verdict = "PG";
      else if (absDelta <= JUDGMENT_WINDOWS.G) verdict = "G";
      else if (absDelta <= JUDGMENT_WINDOWS.Good) verdict = "Good";
      else if (absDelta <= JUDGMENT_WINDOWS.Bad) verdict = "Bad";
      else verdict = "Miss";
      judgedFlags[entry.idx] = verdict === "Miss" ? 2 : 1;
      const queue = notesByLane[chartLane];
      let c = laneCursor[chartLane];
      while (c < queue.length) {
        const f = judgedFlags[queue[c].idx];
        if (f === 1 || f === 2) c++; else break;
      }
      laneCursor[chartLane] = c;
      if (verdict !== "Bad" && verdict !== "Miss" && HIT_BURST_RGB[verdict]) {
        laneHitStamp[lane] = state.currentSec;
        laneHitType[lane] = verdict;
      }
      const deltaMs = verdict === "Miss" ? null : Math.round(delta * 1000);
      // R8-26 ghost — record verdict + timing for LN tail release.
      noteJudgmentType[entry.idx] = JUDGMENT_CODE_BY_NAME[verdict] || 0;
      noteDeltaMs[entry.idx] = deltaMs == null ? 0 : deltaMs;
      invalidateTileForNote(entry.idx);
      emitJudgment({ type: verdict, lane, deltaMs });
      _maybeAutoAdjust(verdict, deltaMs);
      // r12.2 — sync paint so LN release visual (held beam pulse stops,
      // optional hit burst fires) appears this microtask instead of next rAF.
      if (typeof drawMain === "function") {
        try { drawMain(); } catch (e) {}
      }
    }

    function _maybeAutoAdjust(verdict, deltaMs) {
      if (!settings.autoAdjust) return;
      if (deltaMs == null) return;
      if (verdict === "Bad" || verdict === "Miss") return;
      adjustBuf.push(deltaMs);
      if (adjustBuf.length >= 16) {
        let sum = 0;
        for (const v of adjustBuf) sum += v;
        const avg = sum / adjustBuf.length;
        const next = Math.max(-150, Math.min(150,
          Math.round((settings.judgeOffsetMs || 0) + avg)));
        settings.judgeOffsetMs = next;
        adjustBuf.length = 0;
        if (onAutoAdjust) {
          try { onAutoAdjust(next); } catch (e) { /* swallow */ }
        }
      }
    }
    let onAutoAdjust = null;
    function ageMisses() {
      if (settings.hideJudgment) return;   // R8-21 watch mode — no auto-miss
      const cutoff = state.currentSec - JUDGMENT_WINDOWS.Bad;
      for (let lane = 0; lane < laneCount; lane++) {
        const queue = notesByLane[lane];
        let c = laneCursor[lane];
        while (c < queue.length) {
          const entry = queue[c];
          const f = judgedFlags[entry.idx];
          if (f === 1 || f === 2) { c++; continue; }
          if (f === 3) {
            // Holding LN — late-miss when tail + Bad window has passed
            // without a release.
            const tailEnd = entry.sec + entry.holdSec;
            if (tailEnd + JUDGMENT_WINDOWS.Bad < state.currentSec) {
              judgedFlags[entry.idx] = 2;
              noteJudgmentType[entry.idx] = JUDGMENT_CODE_MISS;   // R8-26 ghost
              noteDeltaMs[entry.idx] = 0;
              invalidateTileForNote(entry.idx);
              if (laneHold[lane] === entry) laneHold[lane] = null;
              emitJudgment({ type: "Miss", lane, deltaMs: null });
              c++;
              continue;
            }
            break;  // still legal to release — stop cursor advance.
          }
          // Pending tap or LN head not hit yet.
          if (entry.sec < cutoff) {
            judgedFlags[entry.idx] = 2;
            noteJudgmentType[entry.idx] = JUDGMENT_CODE_MISS;     // R8-26 ghost
            noteDeltaMs[entry.idx] = 0;
            invalidateTileForNote(entry.idx);
            emitJudgment({ type: "Miss", lane, deltaMs: null });
            c++;
          } else {
            break;
          }
        }
        laneCursor[lane] = c;
      }
    }
    function resetJudgments() {
      judgedFlags.fill(0);
      noteJudgmentType.fill(0);   // R8-26 ghost — clear all verdicts
      noteDeltaMs.fill(0);
      for (let i = 0; i < laneCursor.length; i++) laneCursor[i] = 0;
      for (let i = 0; i < laneHold.length; i++) laneHold[i] = null;
      lanePressStamp.fill(-1e9);
      laneHitStamp.fill(-1e9);
      for (let i = 0; i < laneHitType.length; i++) laneHitType[i] = null;
      adjustBuf.length = 0;
      invalidateAllQueueTiles();   // R8-26 ghost — re-render every cached tile
    }
    // Phase B: key zone integration helpers — toggle a keycap's pressed
    // state visually and push live stats into the score strip.
    function setLanePressed(lane, on) {
      if (lane < 0 || lane >= capEls.length) return;
      const el = capEls[lane];
      if (el) el.classList.toggle("cp-keycap--pressed", !!on);
    }
    function setStats(stats) {
      if (!stats) return;
      if (stripComboEl) {
        const combo = stats.combo | 0;
        stripComboEl.textContent = String(combo);
        stripComboEl.classList.toggle("is-zero", combo === 0);
      }
      // r12.3 — Fast/Slow counters share the same strip; host pushes the
      // running totals each time renderStats fires.
      for (const t of ["PG","G","Good","Bad","Miss","Fast","Slow"]) {
        const el = stripCountEls[t];
        if (el) el.textContent = String(stats[t] | 0);
      }
    }

    // R8-13 / R8-14 — sync pill-chip active class + radio.checked to current
    // settings. SP has 2 groups, DP has 4. Called on programmatic setSettings.
    // R8-26 — DP redistributes chip groups across 2 rows in cp-field__bottom
    // (LANE row + VIEW row), so queries scope to chipQueryRoot (a captured
    // container that holds all chip elements) instead of lanemodRowEl alone.
    function syncLanemodChips() {
      const root = chipQueryRoot || lanemodRowEl;
      if (!root) return;
      const groups = (mode === "DP")
        ? [
            { name: "cp-lanemod-set",       key: "laneMod" },
            { name: "cp-lanemod-filter",    key: "laneFilter" },
            { name: "cp-lanemod-set-2p",    key: "laneMod2P" },
            { name: "cp-lanemod-filter-2p", key: "laneFilter2P" },
          ]
        : [
            { name: "cp-lanemod-set",       key: "laneMod" },
            { name: "cp-lanemod-filter",    key: "laneFilter" },
          ];
      groups.forEach(function (g) {
        const activeValue = settings[g.key];
        const chips = root.querySelectorAll('[data-cp-chip^="' + g.name + ':"]');
        chips.forEach(function (c) {
          const isActive = c.getAttribute("data-cp-chip") === (g.name + ":" + activeValue);
          c.classList.toggle("cp-lanemod__chip--active", isActive);
          const input = c.querySelector('input[type="radio"]');
          if (input) input.checked = isActive;
        });
      });
    }
    let chipQueryRoot = null;   // set during DOM creation

    function setSettings(partial) {
      if (!partial) return;
      const prevLaneMod   = settings.laneMod;
      const prevLaneMod2P = settings.laneMod2P;
      for (const k of Object.keys(BEAM_DEFAULTS)) {
        if (partial[k] != null && Number.isFinite(partial[k])) {
          settings[k] = partial[k];
        } else if (partial[k] === true || partial[k] === false) {
          settings[k] = partial[k];
        } else if (typeof partial[k] === "string" && typeof BEAM_DEFAULTS[k] === "string") {
          // R8-13/14 — string enums (laneMod, laneFilter, laneMod2P,
          // laneFilter2P, loopStandby...). Trust the host to validate.
          settings[k] = partial[k];
        }
      }
      // R8-13/14 — regenerate permutation when either side's laneMod toggles.
      if (settings.laneMod !== prevLaneMod || settings.laneMod2P !== prevLaneMod2P) {
        regenerateLaneMap();
        resetJudgments();
      }
      syncLanemodChips();
      // Derived layout: SP keycap row paddingLeft tracks the effective
      // rail width (DP base is 0, so this is a no-op there).
      if (capsRowEl) {
        // R8-26 — h-padding matches new 2px each-side lane padding.
        capsRowEl.style.paddingLeft = (effectiveRailWidth() + 2) + "px";
        capsRowEl.style.paddingRight = "2px";
      }
      // R8-26 — judgmentLineOffset (lineLift) → --cp-line-lift on host so
      // the queue layout calc()s re-evaluate. Single source of truth: same
      // value drives main canvas drawing (via settings.judgmentLineOffset)
      // and queue layout (via CSS variable).
      if (host && host.style && partial && typeof partial.judgmentLineOffset === "number") {
        host.style.setProperty("--cp-line-lift", settings.judgmentLineOffset + "px");
      }
      // Force a redraw so toggle changes (rail collapse, marker visibility)
      // appear immediately rather than waiting for the next input event.
      if (typeof drawMain === "function") {
        try { drawMain(); } catch (e) { /* layout not ready yet — fine */ }
      }
      if (typeof drawFullQueue === "function") {
        try { drawFullQueue(); } catch (e) {}
      }
    }

    // Sizing.
    const mainLaneUnit = opts.mainLaneUnit[mode] || 24;
    const queueLaneUnit = opts.queueLaneUnit[mode] || mainLaneUnit;
    const mainInnerW = laneTotalWidth(layout, mainLaneUnit, opts.p1p2GapPx);
    // DP draws measure markers in the centre pillar (not a left rail), so
    // its base rail width is 0. SP keeps the 50 px left rail when the
    // showMeasureMarkers setting is ON.
    const baseLeftRailWidth = (mode === "DP") ? 0 : (opts.mainLeftRailWidth || 0);
    function effectiveRailWidth() {
      // R8-21 — hideMeasureRail also collapses the rail (independent of markers).
      if (settings.hideMeasureRail) return 0;
      return settings.showMeasureMarkers ? baseLeftRailWidth : 0;
    }
    // Sizing math uses the BASE rail width so the canvas dimensions don't
    // jump every time the setting toggles. Draw-time uses effective.
    const mainLeftRailWidth = baseLeftRailWidth;
    // Phase J: caller-overridable main width (mockup uses ~30vw clamped).
    // R2-2-A: DP ignores opts.mainWidth and uses the lane-fit width so all
    // 16 lanes fit the canvas (otherwise main frame ends up wider than the
    // canvas → right-side black gap, keycaps/lanes misaligned).
    const laneFitW = mainInnerW + mainLeftRailWidth + 16;
    const mainW = (mode === "DP")
      ? Math.max(laneFitW, 220)
      : (opts.mainWidth || Math.max(laneFitW, 220));
    let mainH = opts.mainHeight;   // R8-26 — `let`; recomputeLayoutCache() refreshes on resize
    // Queue tile width — derived from QUEUE lane unit (not main), so SP
    // tiles are narrower than the main canvas (mockup convention).
    // Drop mainLeftRailWidth (label rail is main-only). Small padding only.
    const queueInnerW = laneTotalWidth(layout, queueLaneUnit, opts.p1p2GapPx);
    const queueW = Math.max(queueInnerW + 16, 160);
    // SP queue reserves vertical room for the horizontal scrollbar so tile
    // canvases don't render into the padding-bottom area (overflow:hidden
    // clips at the padding-box, not the content-box — padding stays in
    // bounds). DP queue is vertical scroll → no reserve.
    // SP queue tile height: shrunk so its body bottom lands at the same
    // on-screen y as the main canvas judgment line, with a small
    // QUEUE_BOTTOM_PAD so the playhead/note at prog=0 isn't flush with the
    // tile bottom edge. The queueLabel ("UP NEXT →") above the tile pushes
    // it down by QUEUE_LABEL_H px in cp-stage coords — the math compensates.
    // Uses opts.keyZoneH directly — the closure-scoped `keyZoneH` (which
    // applies the DP=3 override) isn't declared yet at this point in the
    // file, but the SP branch only fires when mode !== "DP".
    // R8-26 — single source of truth for the vertical alignment constants
    // is now CSS :root (--cp-queue-label-h, --cp-queue-bottom-pad,
    // --cp-sp-scrollbar-reserve, --cp-dp-bottom-panel-h, --cp-line-lift).
    // JS reads them via getComputedStyle on the host element so a CSS edit
    // propagates automatically. Helper returns 0 on a missing/invalid var
    // instead of NaN.
    function cssPxOf(el, name) {
      const v = (getComputedStyle(el).getPropertyValue(name) || "").trim();
      const n = parseFloat(v);
      return isFinite(n) ? n : 0;
    }
    // R8-26 — these are `let`, not `const`. recomputeLayoutCache() re-reads
    // them from CSS on every resize so a CSS variable edit or container
    // resize stays in sync with the JS drawing-side math (queueBodyFooter,
    // pointerToSec, active overlay sizing, tile bitmap sync).
    let QUEUE_LABEL_H        = cssPxOf(host, "--cp-queue-label-h")    || 24;
    let QUEUE_BOTTOM_PAD     = cssPxOf(host, "--cp-queue-bottom-pad") || 12;
    let SP_SCROLLBAR_RESERVE = cssPxOf(host, "--cp-sp-scrollbar-reserve") || 14;
    let DP_BOTTOM_PANEL_H    = cssPxOf(host, "--cp-dp-bottom-panel-h") || 114;
    let _DEFAULT_LINE_LIFT   = cssPxOf(host, "--cp-line-lift") || 1;
    let _SP_TILE_FOOTER = (opts.keyZoneH || 0) + _DEFAULT_LINE_LIFT - QUEUE_BOTTOM_PAD + QUEUE_LABEL_H;
    let queueH = (mode === "DP") ? mainH : Math.max(120, mainH - _SP_TILE_FOOTER);

    // DOM: flex row [ main canvas | queue scroll wrapper [ queue canvas ] ].
    host.innerHTML = "";
    host.style.position = "relative";
    host.style.background = opts.bg;
    host.style.padding = "10px";
    host.style.borderRadius = "4px";
    host.style.boxSizing = "border-box";
    // R8-26 — dynamic CSS variables. --cp-stage-h is cp-stage row height
    // (= cp-host - bottomPanel for DP, cp-host for SP). queue calc() uses
    // it and --cp-line-lift to derive queueWrap height. ResizeObserver
    // re-syncs after layout settles.
    const _initialStageH = mainH - (mode === "DP" ? DP_BOTTOM_PANEL_H : 0);
    host.style.setProperty("--cp-stage-h", _initialStageH + "px");
    host.style.setProperty("--cp-line-lift", _DEFAULT_LINE_LIFT + "px");

    // PORT_FIXUPS B.4 — layoutRow is `cp-stage` (SP: flex / DP: grid via
    // CSS `cp-stage--dp`, columns 1fr 2fr 1fr). Inline display/justify
    // dropped: CSS owns layout per chart-preview-static spec.
    // Round-2 fix — use plain <div>. Jekyll's just-the-docs theme styles
    // semantic block elements (main/section/aside) in ways that broke
    // visibility (cp-aux was hidden under <aside>).
    const layoutRow = document.createElement("div");
    layoutRow.className = "cp-stage" + (mode === "DP" ? " cp-stage--dp" : "");
    layoutRow.style.minHeight = "0";
    host.appendChild(layoutRow);

    // Main frame — relative-positioned wrapper around the canvas so the
    // Phase B key zone (DOM panel) can be absolute-positioned along the
    // bottom edge over the canvas backdrop. Phase J adds a "NOW PLAYING"
    // tag (mockup chrome).
    // B.5 — `cp-field` widths are CSS-driven (spec). SP: clamp(340,30vw,460).
    // DP: 100% of grid 2fr cell.
    // Round-7 — inline `height: mainH` REMOVED. Was setting cp-field to a
    // computed mainH (up to 900) which often exceeded cp-body's actual
    // height → cp-stage taller than cp-body → cp-body overflow:hidden
    // clipped the bottom → cp-aux content (justify-content:flex-end) was
    // BELOW the viewport. Now cp-host is display:flex column; cp-stage
    // gets `flex:1`; grid row 1fr fills cp-host height naturally.
    const mainFrame = document.createElement("div");
    mainFrame.className = "cp-field";
    layoutRow.appendChild(mainFrame);

    // R8-26 — "NOW PLAYING" / "DUAL PLAY" label removed (was decorative,
    // ate ~30 px of visual area at the top-left of the field).

    // B.5 — `cp-field__canvas` fully responsive. CSS sets
    // `width:100%; height:100%` (spec). Inline width/height dropped for
    // BOTH modes — bitmap is sized dynamically from clientWidth/Height ×
    // dpr at draw time, lane positions scale to canvas width.
    const mainCanvas = document.createElement("canvas");
    mainCanvas.className = "cp-field__canvas";
    mainCanvas.style.position = "absolute";
    mainCanvas.style.top = "0";
    mainCanvas.style.left = "0";
    // R8-26 — DP wraps canvas (+ keyzone) in cp-field__play so cp-field can
    // host a sibling cp-field__bottom panel without the absolute canvas
    // overlaying it. SP keeps the original direct-child structure.
    let playArea;
    if (mode === "DP") {
      playArea = document.createElement("div");
      playArea.className = "cp-field__play";
      playArea.appendChild(mainCanvas);
      mainFrame.appendChild(playArea);
    } else {
      mainFrame.appendChild(mainCanvas);
      playArea = mainFrame;
    }

    // Key zone DOM — only built when opts.keyZoneH > 0. Three rows:
    // keycaps / HI-SPEED / score strip. Renderer owns DOM; chart-preview
    // pumps stats through view.setStats() and lane-down state through
    // view.setLanePressed().
    // DP keyzone is caps-only (3 px strip), SP keeps the multi-row panel.
    // Both DOM height AND drawer reservation use this — keeps the judgment
    // line flush against the keycaps top edge in DP (no dead band).
    const keyZoneH = (mode === "DP" && (opts.keyZoneH || 0) > 0)
      ? 3
      : (opts.keyZoneH || 0);
    let keyZoneEl = null;
    let capsRowEl = null;
    const capEls = [];
    let hsSliderEl = null, hsInputEl = null;
    let lanemodRowEl = null;   // R8-13 — outer ref so setSettings can sync chips
    let stripComboEl = null;
    const stripCountEls = {};
    if (keyZoneH > 0) {
      keyZoneEl = document.createElement("div");
      keyZoneEl.className = "cp-keyzone" + (mode === "DP" ? " cp-keyzone--dp" : "");

      const capsRow = document.createElement("div");
      capsRow.className = "cp-keyzone__caps";
      capsRowEl = capsRow;
      // #6 — align caps row with the canvas lane area. Canvas reserves
      // `leftRailWidth` (currently effective rail) on the left for the
      // measure label rail and an 8 px gap before lanes begin; the right
      // side has 8 px padding too. Pad the caps row by the same so each
      // cap sits directly under its canvas lane. Refreshed in setSettings
      // when the rail toggles off.
      // R8-26: was 8 px each side to match the old -16 lane budget; now 2 px.
      capsRow.style.paddingLeft = (effectiveRailWidth() + 2) + "px";
      capsRow.style.paddingRight = "2px";
      for (let i = 0; i < layout.length; i++) {
        // #6 — DP centre gap = 1.3 lane-weight units (matches canvas).
        if (mode === "DP" && i === 8) {
          const kgap = document.createElement("div");
          kgap.className = "cp-keycap-gap";
          kgap.style.flex = "1.3 1 0";
          capsRow.appendChild(kgap);
        }
        const cap = document.createElement("div");
        const kind = layout[i].kind;
        const kindCls = kind === "scratch" ? "cp-keycap--scratch"
          : kind === "white" ? "cp-keycap--white" : "cp-keycap--blue";
        cap.className = "cp-keycap " + kindCls;
        // #6 — flex-grow = layout[i].w so cap width matches the canvas
        // lane width (scratch 1.6, white 1.0, black 0.9 etc.). flex-basis:0
        // so growth distributes against the row's remaining space.
        cap.style.flex = layout[i].w + " 1 0";
        capsRow.appendChild(cap);
        capEls.push(cap);
      }
      keyZoneEl.appendChild(capsRow);

      // B.3 — `cp-hispeed` with BEM children + cp-numbox stepper markup
      // (chart-preview-static spec). `cp-numbox__chev` up/down buttons are
      // wired in B.7; they're tabindex=-1 so keyboard focus skips them.
      const hsRow = document.createElement("div");
      hsRow.className = "cp-hispeed";
      hsRow.innerHTML =
        '<span class="cp-hispeed__label">HI-SPEED</span>' +
        '<input type="range" class="cp-range cp-hispeed__slider" min="0.5" max="5" step="0.01" value="1.00">' +
        '<div class="cp-numbox">' +
        '<input class="cp-numbox__input" value="1.00" inputmode="decimal" spellcheck="false">' +
        '<span class="cp-numbox__unit">×</span>' +
        '<div class="cp-numbox__chev">' +
        '<button type="button" tabindex="-1" aria-label="Increase">▲</button>' +
        '<button type="button" tabindex="-1" aria-label="Decrease">▼</button>' +
        '</div>' +
        '</div>';
      hsSliderEl = hsRow.querySelector(".cp-hispeed__slider");
      hsInputEl  = hsRow.querySelector(".cp-numbox__input");

      // R8-13 — lane-mod chip row. Two pill-chip radio groups: LANE (OFF,
      // RANDOM, R-RANDOM, MIRROR) and VIEW (OFF, SCR-Only, KEY-Only). OFF
      // sits first in each group so it reads as the inactive default. The
      // chips are <label> wrappers around a hidden radio so click/keyboard
      // selection comes free.
      const LANE_MOD_OPTIONS    = [
        { value: "off",      label: "OFF",      modifier: "off" },
        { value: "random",   label: "RANDOM",   modifier: null },
        { value: "r-random", label: "R-RANDOM", modifier: null },
        { value: "mirror",   label: "MIRROR",   modifier: null },
      ];
      const LANE_FILTER_OPTIONS = [
        { value: "off",      label: "OFF",      modifier: "off" },
        { value: "scr-only", label: "SCR-Only", modifier: null },
        { value: "key-only", label: "KEY-Only", modifier: null },
      ];
      function chipHtml(groupName, opt, checked) {
        const offMod = opt.modifier === "off" ? " cp-lanemod__chip--off" : "";
        const activeMod = checked ? " cp-lanemod__chip--active" : "";
        // R8-15: RANDOM / R-RANDOM get an inline gear that opens a config
        // dialog for re-rolling the seed or manually specifying values.
        // The gear stops propagation so click-on-gear doesn't also flip the radio.
        const showGear = (opt.value === "random" || opt.value === "r-random");
        const gearHtml = showGear
          ? '<button type="button" class="cp-lanemod__gear" data-cp-gear="' +
              groupName + ':' + opt.value + '" tabindex="-1" aria-label="Configure ' +
              opt.label + '">⚙</button>'
          : '';
        return '<label class="cp-lanemod__chip' + offMod + activeMod +
          '" data-cp-chip="' + groupName + ':' + opt.value + '">' +
          '<input type="radio" name="' + groupName + '" value="' + opt.value + '"' +
          (checked ? ' checked' : '') + '>' +
          '<span class="cp-lanemod__chip-label">' + opt.label + '</span>' +
          gearHtml + '</label>';
      }
      function groupHtml(groupName, caption, options, activeValue) {
        return '<div class="cp-lanemod__group" role="radiogroup" aria-label="' + caption + '">' +
          '<span class="cp-lanemod__caption">' + caption + '</span>' +
          options.map(function (o) { return chipHtml(groupName, o, o.value === activeValue); }).join('') +
          '</div>';
      }
      const lanemodRow = document.createElement("div");
      lanemodRow.className = "cp-lanemod";
      // R8-14: DP renders 4 stacked groups (1P LANE / 1P VIEW / 2P LANE /
      // 2P VIEW). SP keeps the two-row LANE / VIEW layout.
      // R8-15: group like-size rows (LANE/LANE then VIEW/VIEW) so the
      // 4-chip and 3-chip rows don't zigzag.
      const lanemodGroupSpecs = (mode === "DP")
        ? [
            { name: "cp-lanemod-set",        caption: "1P LANE", options: LANE_MOD_OPTIONS,    settingKey: "laneMod" },
            { name: "cp-lanemod-set-2p",     caption: "2P LANE", options: LANE_MOD_OPTIONS,    settingKey: "laneMod2P" },
            { name: "cp-lanemod-filter",     caption: "1P VIEW", options: LANE_FILTER_OPTIONS, settingKey: "laneFilter" },
            { name: "cp-lanemod-filter-2p",  caption: "2P VIEW", options: LANE_FILTER_OPTIONS, settingKey: "laneFilter2P" },
          ]
        : [
            { name: "cp-lanemod-set",        caption: "LANE",    options: LANE_MOD_OPTIONS,    settingKey: "laneMod" },
            { name: "cp-lanemod-filter",     caption: "VIEW",    options: LANE_FILTER_OPTIONS, settingKey: "laneFilter" },
          ];
      lanemodRow.innerHTML = lanemodGroupSpecs
        .map(function (g) { return groupHtml(g.name, g.caption, g.options, settings[g.settingKey]); })
        .join("");
      lanemodRowEl = lanemodRow;

      // Chip click listeners — radio change → update setting, regenerate
      // permutation if needed (laneMod-side groups), redraw, fire host hook.
      function attachChipGroup(groupName, applyValue) {
        const root = chipQueryRoot || lanemodRow;
        const radios = root.querySelectorAll('input[name="' + groupName + '"]');
        radios.forEach(function (r) {
          r.addEventListener("change", function () {
            if (!r.checked) return;
            applyValue(r.value);
          });
        });
      }
      function broadcastChange(settingKey, value) {
        if (typeof drawMain === "function") try { drawMain(); } catch (e) {}
        if (typeof drawFullQueue === "function") try { drawFullQueue(); } catch (e) {}
        if (onLaneSettingsChange) {
          const partial = {};
          partial[settingKey] = value;
          try { onLaneSettingsChange(partial); } catch (e) {}
        }
      }
      for (const g of lanemodGroupSpecs) {
        const isLaneModGroup = (g.settingKey === "laneMod" || g.settingKey === "laneMod2P");
        attachChipGroup(g.name, function (value) {
          if (settings[g.settingKey] === value) return;
          settings[g.settingKey] = value;
          if (isLaneModGroup) {
            regenerateLaneMap();
            resetJudgments();
          }
          syncLanemodChips();
          broadcastChange(g.settingKey, value);
        });
      }
      // R8-15: gear click → host opens the config modal (host owns the
      // dialog markup so renderer stays presentation-only here). Gears live
      // inside the chip groups, so chipQueryRoot (set after DP redistribution
      // or SP's lanemodRow) covers both layouts.
      const _gearAttachRoot = chipQueryRoot || lanemodRow;
      _gearAttachRoot.querySelectorAll('[data-cp-gear]').forEach(function (gear) {
        gear.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!onLaneModConfigRequested) return;
          const ctx = gear.getAttribute("data-cp-gear");   // "<groupName>:<modValue>"
          const colon = ctx.indexOf(":");
          const groupName = ctx.slice(0, colon);
          const modType   = ctx.slice(colon + 1);
          const side = groupName.endsWith("-2p") ? "2p" : "1p";
          try { onLaneModConfigRequested({ side: side, modType: modType }); } catch (er) {}
        });
      });

      // B.3 — `cp-score` BEM. Modifier map: PG→pg, G→g, Good→good, Bad→bad, Miss→miss.
      const JUDGE_MODS = { PG: "pg", G: "g", Good: "good", Bad: "bad", Miss: "miss" };
      const scoreRow = document.createElement("div");
      scoreRow.className = "cp-score";
      scoreRow.innerHTML =
        '<div class="cp-score__combo">' +
        '<span class="cp-score__combo-num is-zero" data-strip-combo>0</span>' +
        '<span class="cp-score__combo-label">COMBO</span>' +
        '</div>' +
        '<ul class="cp-score__judges">' +
        ['PG','G','Good'].map(function (t) {
          // R8-12: spell out PG/G as PGREAT/GREAT in the indicator strip so
          // the row reads consistently with full words across all slots.
          var lbl = t === "PG"   ? "PGREAT"
                  : t === "G"    ? "GREAT"
                  : t === "Good" ? "GOOD"
                  : t;
          return '<li class="cp-score__judge cp-score__judge--' + JUDGE_MODS[t] + '">' +
            '<span class="cp-score__jl">' + lbl + '</span>' +
            '<span class="cp-score__jv" data-strip-count="' + t + '">0</span>' +
            '</li>';
        }).join('') +
        // r12.6 — Bad / Miss stacked into ONE cell (same row pattern as
        // Fast/Slow) so the strip reads as three count tiers + two
        // tilt/penalty tiers: solid hits | bad+miss | timing tilt.
        '<li class="cp-score__judge cp-score__judge--badmiss">' +
          '<div class="cp-score__bm-row cp-score__bm-row--bad">' +
            '<span class="cp-score__bm-lbl">BAD</span>' +
            '<span class="cp-score__bm-val" data-strip-count="Bad">0</span>' +
          '</div>' +
          '<div class="cp-score__bm-row cp-score__bm-row--miss">' +
            '<span class="cp-score__bm-lbl">MISS</span>' +
            '<span class="cp-score__bm-val" data-strip-count="Miss">0</span>' +
          '</div>' +
        '</li>' +
        // r12.3 — Fast / Slow counters stacked. Host increments by deltaMs
        // sign on every judged hit (positive = early = FAST, negative =
        // late = SLOW). PG and Miss are excluded.
        '<li class="cp-score__judge cp-score__judge--timing">' +
          '<div class="cp-score__timing-row">' +
            '<span class="cp-score__timing-lbl cp-score__timing-lbl--fast">FAST</span>' +
            '<span class="cp-score__timing-val" data-strip-count="Fast">0</span>' +
          '</div>' +
          '<div class="cp-score__timing-row">' +
            '<span class="cp-score__timing-lbl cp-score__timing-lbl--slow">SLOW</span>' +
            '<span class="cp-score__timing-val" data-strip-count="Slow">0</span>' +
          '</div>' +
        '</li>' +
        '</ul>';
      stripComboEl = scoreRow.querySelector("[data-strip-combo]");
      for (const t of ["PG","G","Good","Bad","Miss","Fast","Slow"]) {
        stripCountEls[t] = scoreRow.querySelector('[data-strip-count="' + t + '"]');
      }

      // R8-26 — DP layout: hsRow, lanemodRow, scoreRow live in cp-field__bottom
      // (under the play canvas + keycap strip) as three rows. Row 1 = LANE
      // (1P+2P), Row 2 = VIEW (1P+2P), Row 3 = HI-SPEED + JUDGE INDICATOR.
      // SP keeps the original stacked-in-keyzone arrangement.
      if (mode === "DP") {
        // Pull the 4 chip groups out of lanemodRow (built earlier with the
        // DP specs in order: 1P LANE, 2P LANE, 1P VIEW, 2P VIEW). The
        // per-group captions ("1P LANE" etc.) are hidden via CSS in this
        // layout and replaced by a single central caption that matches the
        // play canvas's centre pillar.
        const lmGroups = Array.from(lanemodRow.children);
        const laneRow_dp = document.createElement("div");
        laneRow_dp.className = "cp-dp-bottom__row cp-dp-bottom__row--lane";
        const viewRow_dp = document.createElement("div");
        viewRow_dp.className = "cp-dp-bottom__row cp-dp-bottom__row--view";
        function dpRowCaption(text) {
          const el = document.createElement("span");
          el.className = "cp-dp-bottom__caption";
          el.textContent = text;
          return el;
        }
        if (lmGroups.length >= 4) {
          laneRow_dp.appendChild(lmGroups[0]);          // 1P LANE
          laneRow_dp.appendChild(dpRowCaption("LANE")); // pillar-aligned caption
          laneRow_dp.appendChild(lmGroups[1]);          // 2P LANE
          viewRow_dp.appendChild(lmGroups[2]);          // 1P VIEW
          viewRow_dp.appendChild(dpRowCaption("VIEW"));
          viewRow_dp.appendChild(lmGroups[3]);          // 2P VIEW
        }
        const hsJudgeRow_dp = document.createElement("div");
        hsJudgeRow_dp.className = "cp-dp-bottom__row cp-dp-bottom__row--hs-judge";
        hsJudgeRow_dp.appendChild(hsRow);
        hsJudgeRow_dp.appendChild(scoreRow);

        const bottomPanel = document.createElement("div");
        bottomPanel.className = "cp-field__bottom";
        bottomPanel.appendChild(laneRow_dp);
        bottomPanel.appendChild(viewRow_dp);
        bottomPanel.appendChild(hsJudgeRow_dp);
        mainFrame.appendChild(bottomPanel);

        chipQueryRoot = bottomPanel;

        // r12.5 — Foresee queue removed. DP right grid cell is intentionally
        // empty so future content (chart minimap, NPS preview, stats panel,
        // etc.) can drop into the existing `1fr 2fr 1fr` slot without a
        // layout reshuffle.
      } else {
        keyZoneEl.appendChild(hsRow);
        keyZoneEl.appendChild(lanemodRow);
        keyZoneEl.appendChild(scoreRow);
        chipQueryRoot = lanemodRow;
      }

      playArea.appendChild(keyZoneEl);
    }

    // B.4 — divider div removed. Spec uses CSS border on .cp-field
    // (border-right for SP, border-left+right for DP). Keeps layoutRow
    // child count = 2 (SP) / 3 (DP) so grid template matches exactly.

    // B.2 / B.4 — `cp-queue` BEM block. SP: flex:1 from CSS (legacy flow);
    // DP: grid-area:queue from CSS (cp-stage--dp). Inline flex/height
    // dropped — CSS owns sizing. queueWrap retains overflow + scrollbar
    // gutter from CSS spec.
    // Round-2 — plain <div> (Jekyll theme safety).
    const queueRegion = document.createElement("div");
    queueRegion.className = "cp-queue";
    // Round-7 — inline queueRegion height removed for SP too. cp-host is
    // now display:flex column with cp-stage flex:1 filling it; cp-stage's
    // flex row stretches cp-queue via align-items default.
    // R8-26 — SP: cp-queue sizes to its content (label + tile + scrollbar)
    // via align-self: flex-start, leaving cp-stage bg visible below.
    // DP: cp-queue STRETCHES to fill the grid row (default align-self in
    // grid). queueWrap inside still uses calc() for alignment with the
    // main judgment line; the remaining space below queueWrap inside the
    // cp-queue panel shows the queue's own bg, NOT cp-stage's, so the
    // visible boundary is removed.
    if (mode !== "DP") {
      queueRegion.style.alignSelf = "flex-start";
    }
    layoutRow.appendChild(queueRegion);

    const queueLabel = document.createElement("div");
    queueLabel.className = "cp-queue__label";
    // R5-4: DP 큐는 세로(아래=현재, 위=다가올 마디) → 화살표 위로.
    queueLabel.innerHTML = '<span>' + ((mode === "DP") ? "UP NEXT ↑" : "UP NEXT →") + '</span>'
      + '<span class="cp-queue__hint">drag to set a loop</span>';
    // R8-26 — label height is pinned via CSS variable --cp-queue-label-h.
    // The CSS rule for .cp-queue__label sets `height: var(--cp-queue-label-h)`
    // (added in the queue block); JS no longer overrides inline. flex:0 0 auto
    // stays inline because cp-queue is a flex column and the label must NOT
    // grow to fill the wrap area.
    queueLabel.style.boxSizing = "border-box";
    queueLabel.style.flex = "0 0 auto";
    queueLabel.style.height = "var(--cp-queue-label-h)";
    queueRegion.appendChild(queueLabel);

    const queueWrap = document.createElement("div");
    queueWrap.className = "cp-queue__wrap";
    // R8-26 — queueWrap height is driven by CSS calc() expressions on
    // .cp-queue__wrap (SP) and .cp-stage--dp .cp-queue__wrap (DP). They
    // read --cp-stage-h (JS sets this from mainHeight), --cp-line-lift,
    // --cp-keyzone-h(-dp), --cp-queue-label-h, --cp-queue-bottom-pad,
    // --cp-sp-scrollbar-reserve, --cp-dp-bottom-panel-h. No JS-side
    // inline style.height — change a variable and everything follows.
    queueRegion.appendChild(queueWrap);

    // queueInner holds all tile canvases as an inline-flex row. Wider than
    // queueWrap, scroll happens on queueWrap. position:relative so the
    // active-progress overlay can absolute-position itself over the active
    // measure and scroll along with the tiles.
    // B.2 — `cp-queue__inner`. CSS sets `height:100%; position:relative`;
    // SP overrides inline (inline-flex row, explicit height) for horizontal
    // tile stride. DP keeps CSS defaults.
    const queueInner = document.createElement("div");
    queueInner.className = "cp-queue__inner";
    // R7: SP also uses absolute-positioned tiles inside a block inner. inner's
    // width fixes the scroll extent; tiles are appended/removed by the
    // virtualization pool. Height stays CSS-controlled (100% of wrap content).
    if (mode !== "DP") {
      queueInner.style.display = "block";
      queueInner.style.position = "relative";
    }
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
    // B.5 — bitmap sync for responsive canvases. CSS owns display size
    // (width:100% / fit-cell); this matches bitmap pixels to display ×
    // dpr so drawing is crisp at any container width. Returns true when
    // the bitmap was changed (caller may want to redraw).
    function syncCanvasBitmap(c, cctx, displayW, displayH) {
      if (displayW < 1 || displayH < 1) return false;
      const bw = Math.round(displayW * dpr);
      const bh = Math.round(displayH * dpr);
      if (c.width === bw && c.height === bh) return false;
      c.width = bw;
      c.height = bh;
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }
    const mainCtx = mainCanvas.getContext("2d");
    mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      // mainZoom dropped — wheel + HI-SPEED slider write to settings.hiSpeed
      // and pxPerBeatActive() reads it directly. drawMainScrolling still
      // receives a `mainZoom` prop for the "×N.NN" overlay label, which is
      // sourced from settings.hiSpeed.
    };

    function bpmLabelFor(midx) {
      if (midx < 0 || midx >= measures.length) return null;
      const m = measures[midx];
      if (midx === 0 || measures[midx - 1].bpm !== m.bpm) return String(Math.round(m.bpm));
      return null;
    }

    // Phase B: HI-SPEED replaces the old fixed "one measure visible at
    // zoom=1". visibleBeats = 8 / hiSpeed (matches the mockup); higher
    // HI-SPEED → fewer visible beats → faster perceived scroll. Body
    // height accounts for the key zone (when present) so notes never
    // draw under it.
    // B.5 — Helpers for responsive lane sizing. laneUnitForWidth returns
    // the lane unit (px per weight) so the entire layout fits the
    // available width (canvas display width minus left rail + padding).
    function totalLaneWeight(layout) {
      const gapW = (layout.length === 16) ? 1.3 : 0;
      let sum = gapW;
      for (let i = 0; i < layout.length; i++) sum += layout[i].w;
      return sum;
    }
    function laneUnitForMainWidth(displayW) {
      // R8-26: was `displayW - mainLeftRailWidth - 16` (base rail + 16 px
      // combined h-padding). Two issues:
      //   1) Used base rail → when hideMeasureRail toggled the 50 px from
      //      the rail got folded into centering padding (8 → 33 px each side).
      //   2) The 16 px built-in padding showed as 8 px each side.
      // Now uses effective rail (lanes expand when rail hidden) and only
      // 4 px combined (2 each side) → lanes fill ~99% of available width
      // in both rail states.
      const rail = effectiveRailWidth();
      const avail = Math.max(0, displayW - rail - 4);
      return avail / totalLaneWeight(layout);
    }
    function laneUnitForQueueWidth(displayW) {
      const avail = Math.max(0, displayW - 16);
      return avail / totalLaneWeight(layout);
    }
    function currentMainH() {
      return (mainCanvas.clientHeight) || mainH;
    }
    function currentMainW() {
      return (mainCanvas.clientWidth) || mainW;
    }
    function pxPerBeatActive() {
      const kz = keyZoneH;
      const clearance = 0;   // R8-26: matched to kzClear in drawMainScrolling
      // R8-23: lineLift INTENTIONALLY excluded here. LR2/IIDX convention:
      // raising the judgment line keeps scroll speed (px/sec) constant —
      // notes simply travel less distance and appear faster on screen. The
      // previous version subtracted lineLift here, slowing the scroll in
      // proportion to the lift, which threw muscle-memory timing off.
      const bodyH = currentMainH() - opts.mainHeaderHeight - opts.mainFooterHeight
        - kz - clearance;
      const hs = (settings && settings.hiSpeed) || 1.0;
      return bodyH * hs / 8;
    }

    function drawMain() {
      // B.5 — sync bitmap to display × dpr before drawing. Computes the
      // current canvas dims AFTER the sync so the bitmap and drawer agree.
      const cw0 = currentMainW();
      const ch0 = currentMainH();
      syncCanvasBitmap(mainCanvas, mainCtx, cw0, ch0);
      const cw = currentMainW();
      const ch = currentMainH();
      const dynLaneUnit = laneUnitForMainWidth(cw);
      mainCtx.fillStyle = opts.bg;
      mainCtx.fillRect(0, 0, cw, ch);
      const haveActive = state.activeIdx >= 0 && state.activeIdx < measures.length;
      if (haveActive) {
        const currentBeat = secToBeat(state.currentSec, timeMap);
        drawMainScrolling(mainCtx, {
          x: 0, y: 0, w: cw, h: ch,
          layout, laneUnit: dynLaneUnit, p1p2GapPx: opts.p1p2GapPx,
          headerH: opts.mainHeaderHeight,
          footerH: opts.mainFooterHeight,
          noteHeight: opts.mainNoteHeight,
          lnAlpha: opts.lnAlpha,
          opts,
          activeMeasure: measures[state.activeIdx],
          allNotes: allNotesSorted,
          currentBeat,
          pxPerBeat: pxPerBeatActive(),
          maxLnHoldBeat,
          measures,
          stopsBeat,
          mode,
          leftRailWidth: effectiveRailWidth(),
          mainZoom: settings.hiSpeed,
          judgedFlags,
          lanePressStamp,
          currentSec: state.currentSec,
          settings,
          laneHitStamp,
          laneHitType,
          keyZoneH: keyZoneH,
          laneHold,
          displayPos,    // R8-13
          chartLaneAt,   // R8-13
        });
      } else {
        mainCtx.fillStyle = opts.panelBg;
        mainCtx.fillRect(0, 0, cw, ch);
        mainCtx.strokeStyle = opts.queueBorder;
        mainCtx.strokeRect(0.5, 0.5, cw - 1, ch - 1);
        mainCtx.fillStyle = opts.labelColor;
        mainCtx.font = "13px 'JetBrains Mono', monospace";
        mainCtx.textAlign = "center";
        mainCtx.textBaseline = "middle";
        mainCtx.fillText("— end —", cw / 2, ch / 2);
      }
      // Queue overlay always tracks the active measure + progress within
      // it. Function declaration is hoisted; activeOverlay/overlayCtx are
      // populated before drawAll() (the first frame that calls drawMain).
      drawActiveProgress();
    }

    // Phase I — DP queue is vertical (mockup §6 "DP 큐는 세로 스크롤").
    // queueVertical = true: tiles stack bottom-up (m1 at bottom, larger
    // tile height); loop drag swaps to the Y axis; activeOverlay
    // translates Y instead of X. SP path unchanged.
    const queueVertical = mode === "DP";
    // Round-2 — force scrollbar even when not yet needed (overflow: scroll
    // instead of auto). CSS spec was getting overridden by some legacy
    // rule or theme; inline always wins.
    if (queueVertical) {
      queueWrap.style.overflowX = "hidden";
      queueWrap.style.overflowY = "scroll";
      queueWrap.style.scrollbarGutter = "stable";
    }
    // R8-18: DP queue tile height bumped 230 → 360 to bring its body-per-
    // measure (358 px = 360 - 22 header) closer to SP queue's (≈484 px).
    // Sub-beat spacing 13 → 22.4 px, so the 8 px note no longer dominates
    // the grid (drops from ~62 % of a subdivision to ~36 %). Trade-off:
    // fewer measures visible in the queue at once.
    // R11 Phase 1 — sourced from --cp-tile-vertical-h (CSS constant). Const,
    // not let — changing tile height mid-session would invalidate tile
    // positions, queueInner total height, and the pool index, so it is
    // treated as boot-time only.
    const tileVerticalH = queueVertical ? (cssPxOf(host, "--cp-tile-vertical-h") || 360) : 0;
    const tileVerticalW = queueW;

    // R8-26 alignment — queue tile body bottom should sit at the same
    // on-screen y as the main canvas judgment line. Tile already pre-sized
    // for the default lineLift; this footer absorbs any drift when the
    // slider deviates from the default. Body bottom (in tile coords) =
    // tile_height - footer. With queueLabel pushing the tile down by
    // QUEUE_LABEL_H px in cp-stage coords, the on-screen body bottom is
    // QUEUE_LABEL_H + (queueH - footer). We want it = mainH - keyZoneH -
    // lineLift, so footer = queueH + QUEUE_LABEL_H - mainH + keyZoneH +
    // lineLift.
    function queueBodyFooter() {
      if (queueVertical) return 0;
      const lineLift = (settings && settings.judgmentLineOffset) || 0;
      return Math.max(0, queueH + QUEUE_LABEL_H - mainH + keyZoneH + lineLift);
    }

    // Queue tiles. Each tile is its own canvas holding `measuresPerTile`
    // panels, ~2200×520 px at dpr 2 → ~18MB backing buffer each. Browser
    // composites each tile as a separate GPU layer; off-screen tiles are
    // cheap to keep around vs one huge canvas.
    const queueStride = queueVertical ? tileVerticalH : (queueW + opts.queueGapPx);
    // R7 virtualization: one measure per tile (SP+DP same model). Memory is
    // bounded by the visible tile count; lifecycle is lazy via tilesPool.
    // queueMeasures (= non-synthetic) drives queue size, NOT measures[] — the
    // queue should never show synthetic outro filler.
    const measuresPerTile = 1;
    const queueDesiredExtent = queueVertical
      ? queueMeasures.length * tileVerticalH
      : Math.max(1, queueMeasures.length * queueStride - opts.queueGapPx);
    const queueRenderedExtent = queueDesiredExtent;
    const queueRenderedCount = queueMeasures.length;
    const tileCount = Math.max(1, queueRenderedCount);

    // Size queueInner to define the scroll extent. SP: horizontal width
    // covers every queue measure; DP: vertical height covers every queue
    // measure (bottom-up). queueMeasures excludes synthetic outro filler.
    if (queueVertical) {
      queueInner.style.width = "100%";
      queueInner.style.height = (queueMeasures.length * tileVerticalH) + "px";
    } else {
      queueInner.style.width = (queueMeasures.length * queueStride) + "px";
      // R8-26 — SP queueInner.height is driven by the CSS rule on
      // .cp-stage:not(.cp-stage--dp) .cp-queue__inner (= queueH derived from
      // CSS variables). JS no longer overrides — change a variable and the
      // inner box resizes automatically.
    }

    // R7 virtualization — lazy tile pool. Each measure has at most ONE tile
    // alive at a time; createTile builds + renders + appends, disposeTile
    // releases the bitmap (canvas.width = 0 — the GC-safe way) and detaches
    // the node. updateVirtualization() (defined below) maintains the
    // invariant: pool === viewport tiles ∪ buffer.
    const tilesPool = new Map();  // tileIdx → tile object

    function createTile(queueIdx) {
      // queueIdx is the index into queueMeasures (non-synthetic). The actual
      // global measure idx is queueGlobalIdx[queueIdx].
      const c = document.createElement("canvas");
      c.className = "cp-qtile";
      c.style.display = "block";
      let tile;
      if (queueVertical) {
        // Bottom-up over queueMeasures (so m1 at bottom, last queue measure at top).
        const topPx = (queueMeasures.length - 1 - queueIdx) * tileVerticalH;
        c.style.position = "absolute";
        c.style.left = "0";
        c.style.top = topPx + "px";
        c.style.width = "100%";
        c.style.height = tileVerticalH + "px";
        const cctx = c.getContext("2d");
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        tile = { canvas: c, ctx: cctx, queueIdx, tileW: null, tileH: tileVerticalH };
      } else {
        // SP: absolute by left offset within queueMeasures.
        c.style.position = "absolute";
        c.style.left = (queueIdx * queueStride) + "px";
        c.style.top = "0";
        c.style.height = queueH + "px";
        const cctx = setupCanvas(c, queueStride, queueH);
        c.style.height = "100%";
        tile = { canvas: c, ctx: cctx, queueIdx, tileW: queueStride };
      }
      queueInner.appendChild(c);
      tilesPool.set(queueIdx, tile);
      renderQueuePanelAt(queueIdx);
      return tile;
    }

    function disposeTile(tileIdx) {
      const tile = tilesPool.get(tileIdx);
      if (!tile) return;
      try { tile.canvas.width = 0; tile.canvas.height = 0; } catch (e) {}
      if (tile.canvas.parentNode) tile.canvas.parentNode.removeChild(tile.canvas);
      tilesPool.delete(tileIdx);
    }

    // Active-measure progress overlay — single small canvas, the size of
    // one queue panel, positioned over the active measure via translateX.
    // Redrawn each frame in drawActiveProgress() to show how far the
    // playhead has advanced inside the active measure (sec-fraction).
    // Sized at canvas pixel resolution (dpr-scaled) so the partial
    // perimeter stroke stays crisp at any zoom level.
    const activeOverlay = document.createElement("canvas");
    activeOverlay.style.display = "block";
    activeOverlay.style.position = "absolute";
    activeOverlay.style.top = "0";
    activeOverlay.style.left = "0";
    activeOverlay.style.pointerEvents = "none";
    activeOverlay.style.willChange = "transform";
    // R7 — tiles are appended lazily by createTile, which would put them on
    // top of activeOverlay in source order and hide the cyan frame /
    // playhead under the freshly-rendered measure. Pin the overlay above
    // every tile.
    activeOverlay.style.zIndex = "10";
    queueInner.appendChild(activeOverlay);
    // B.5 — DP overlay width is responsive (CSS 100%); SP keeps fixed
    // tile width since SP queue is horizontal-fixed scroll geometry.
    // SP active overlay matches the tile (queueH is already pre-reduced by
    // SP_SCROLLBAR_RESERVE so the cyan frame ends above the scrollbar).
    const activeOverlayH = queueVertical ? tileVerticalH : queueH;
    let activeOverlayCtx;
    if (queueVertical) {
      activeOverlay.style.width = "100%";
      activeOverlay.style.height = activeOverlayH + "px";
      activeOverlayCtx = activeOverlay.getContext("2d");
      activeOverlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      activeOverlayCtx = setupCanvas(activeOverlay, queueW, activeOverlayH);
      // SP — CSS height tracks the wrap content area (same reason as qtile).
      activeOverlay.style.height = "100%";
    }

    // Page-wise queue scroll. We DO NOT pull the queue under the playhead
    // every boundary — that motion was distracting and erased the user's
    // hand-scrolled browsing position constantly. Instead, only re-scroll
    // when the active measure has slipped out of the visible viewport
    // (either past the right edge during play, or behind the left edge
    // after a backward seek). When it has, snap so the active sits at the
    // viewport's left edge — the rest of the page shows what's upcoming.
    function ensureActiveInView() {
      // Map the global active measure to its queue position. If the active
      // measure is synthetic (not present in the queue), nothing to scroll.
      if (state.activeIdx < 0 || state.activeIdx >= globalToQueueIdx.length) return;
      const qi = globalToQueueIdx[state.activeIdx];
      if (qi < 0) return;
      if (queueVertical) {
        const top = (queueMeasures.length - 1 - qi) * tileVerticalH;
        const bot = top + tileVerticalH;
        const viewTop = queueWrap.scrollTop;
        const viewBot = viewTop + queueWrap.clientHeight;
        if (bot > viewBot || top < viewTop) {
          queueWrap.scrollTop = Math.max(0, bot - queueWrap.clientHeight);
        }
        return;
      }
      const activeLeft = qi * queueStride;
      const activeRight = activeLeft + queueW;
      const viewLeft = queueWrap.scrollLeft;
      const viewRight = viewLeft + queueWrap.clientWidth;
      if (activeRight > viewRight || activeLeft < viewLeft) {
        queueWrap.scrollLeft = activeLeft;
      }
    }

    // ── Loop (Phase H) ────────────────────────────────────────────────
    // Drag on the queue to create a violet loop band. Click = seek. The
    // active-measure cyan overlay is suppressed while a loop is set.
    // Wraparound in the play loop snaps currentSec back to startSec on
    // currentSec >= endSec.
    //
    // Visual layers inside queueInner (chart-preview-static spec BEM):
    //   - cp-loop             (rect for DP; cp-loop--h for SP — canvas-painted)
    //   - cp-loop__playhead   (red line inside the band at currentSec)
    //   - cp-loop__handle x2  (drag-resize bars; --start / --end modifiers)
    //   - cp-loop__tag        ("LOOP" badge at the top-left of the band)
    //   - cp-loop__x          (close button at the top-right)
    //   - cp-loop__canvas     (SP staircase painter)
    let loopState = null;     // { startSec, endSec } | null
    let loopDragMoved = false;
    let loopHandleDrag = null;  // "start" | "end" | null
    // R8-7 / R8-9: two-stage lazy wrap.
    //   STAGE 1 — Time hold (LOOP_WRAP_HOLD_MS, default 250 ms): visual is
    //   pinned at loopState.startSec and audio is paused. Gives the decoder
    //   a fixed window to prime.
    //   STAGE 2 — Audio resume gate (loopWrapAudioResuming): after the hold
    //   timer expires we call audio.play() and KEEP state.currentSec pinned
    //   at startSec until audio.currentTime demonstrably advances past
    //   startSec (i.e. the decoder is actually producing samples). Without
    //   this gate, audio.paused flips to false a few frames before currentTime
    //   actually moves, the existing audioSeekPending threshold clears
    //   immediately (abs(audioChart - target) < 0.08 is satisfied while both
    //   sit at startSec), and the rAF loop snaps state backwards from
    //   "startSec + a few dt" to "startSec", which the user sees as a stutter
    //   right after the loop restarts. LOOP_WRAP_MAX_MS is a safety cap so
    //   we don't pin forever if the audio element dies / autoplay is denied.
    let loopWrapHoldUntil = 0;
    let loopWrapAudioWasPlaying = false;
    let loopWrapAudioResuming = false;
    let loopWrapMaxUntil = 0;
    // Stage-1 hold is user-tunable via settings.loopWrapHoldMs (Effects ▸
    // Loop standby). Stage-2 safety cap scales off the hold so longer
    // standby still has a sensible give-up window (≥800 ms).
    const LOOP_WRAP_RESUME_EPSILON = 0.005;   // 5 ms past startSec ⇒ "decoder is producing samples"

    // PORT_FIXUPS #2 — edge auto-scroll while loop-creating or handle-dragging.
    const LOOP_EDGE_PX = 30;
    const LOOP_EDGE_SPEED = 3.5;
    let loopAutoRAF = null;
    let lastPointerEvt = null;
    function loopEdgeScrollTick() {
      loopAutoRAF = null;
      if (!lastPointerEvt) return;
      const dragging = loopHandleDrag || (loopDragStartSec !== null && loopDragMoved);
      if (!dragging) return;
      const rect = queueWrap.getBoundingClientRect();
      let moved = false;
      if (queueVertical) {
        const top = lastPointerEvt.clientY - rect.top;
        const bot = rect.bottom - lastPointerEvt.clientY;
        if (top < LOOP_EDGE_PX)      { queueWrap.scrollTop -= LOOP_EDGE_SPEED; moved = true; }
        else if (bot < LOOP_EDGE_PX) { queueWrap.scrollTop += LOOP_EDGE_SPEED; moved = true; }
      } else {
        const left = lastPointerEvt.clientX - rect.left;
        const right = rect.right - lastPointerEvt.clientX;
        if (left < LOOP_EDGE_PX)      { queueWrap.scrollLeft -= LOOP_EDGE_SPEED; moved = true; }
        else if (right < LOOP_EDGE_PX){ queueWrap.scrollLeft += LOOP_EDGE_SPEED; moved = true; }
      }
      if (moved) updateLoopFromPointer(lastPointerEvt);
      loopAutoRAF = requestAnimationFrame(loopEdgeScrollTick);
    }
    function ensureLoopAutoScroll() { if (!loopAutoRAF) loopAutoRAF = requestAnimationFrame(loopEdgeScrollTick); }
    function stopLoopAutoScroll() {
      if (loopAutoRAF) cancelAnimationFrame(loopAutoRAF);
      loopAutoRAF = null; lastPointerEvt = null;
    }

    // B.2 — loop band BEM. `cp-loop` for DP single rect; SP uses cp-loop--h
    // modifier (removes border/bg; canvas paints staircase). Handles get
    // an inner <span> per spec markup.
    const loopBand = document.createElement("div");
    loopBand.className = "cp-loop" + (queueVertical ? "" : " cp-loop--h");
    loopBand.style.position = "absolute";
    loopBand.style.display = "none";
    queueInner.appendChild(loopBand);

    const loopCanvas = document.createElement("canvas");
    loopCanvas.className = "cp-loop__canvas";
    loopCanvas.style.display = "none";
    queueInner.appendChild(loopCanvas);

    const loopPlayhead = document.createElement("div");
    loopPlayhead.className = "cp-loop__playhead";
    loopPlayhead.style.display = "none";
    queueInner.appendChild(loopPlayhead);

    const loopStartHandle = document.createElement("div");
    loopStartHandle.className = "cp-loop__handle cp-loop__handle--start";
    loopStartHandle.style.display = "none";
    loopStartHandle.innerHTML = '<span></span>';
    queueInner.appendChild(loopStartHandle);

    const loopEndHandle = document.createElement("div");
    loopEndHandle.className = "cp-loop__handle cp-loop__handle--end";
    loopEndHandle.style.display = "none";
    loopEndHandle.innerHTML = '<span></span>';
    queueInner.appendChild(loopEndHandle);

    const loopTag = document.createElement("div");
    loopTag.className = "cp-loop__tag";
    loopTag.textContent = "LOOP";
    loopTag.style.display = "none";
    queueInner.appendChild(loopTag);

    const loopX = document.createElement("button");
    loopX.className = "cp-loop__x";
    loopX.type = "button";
    loopX.textContent = "×";
    loopX.title = "Close loop";
    loopX.style.display = "none";
    queueInner.appendChild(loopX);

    // PORT_FIXUPS #1-E — pxToMeasureIdx + loopHandleRangePx removed
    // (replaced by pointerToSec / measureIdxForSec direct use). Left a
    // stub block in case some external caller references the names.
    function loopHandleRangePx() {
      if (!loopState) return null;
      const mS = measureIdxForSec(loopState.startSec);
      const mE = measureIdxForSec(loopState.endSec, true);
      if (queueVertical) {
        const topPx = (measures.length - 1 - mE) * tileVerticalH;
        const botPx = (measures.length - mS) * tileVerticalH;
        return { startPx: topPx, endPx: botPx };
      }
      const startPx = mS * queueStride;
      const endPx = (mE + 1) * queueStride - opts.queueGapPx;
      return { startPx, endPx };
    }
    function measureIdxForSec(sec, snapEnd) {
      // Returns the inclusive measure index for the given sec. snapEnd: if
      // sec lands exactly on a boundary, choose the previous measure
      // (used for end positions so a "to m3" loop ends at m3, not m4).
      for (let i = 0; i < measures.length; i++) {
        if (sec >= measures[i].start_sec - 1e-6 && sec < measures[i].end_sec - 1e-6) {
          return i;
        }
      }
      if (snapEnd) return measures.length - 1;
      return measures.length - 1;
    }
    function secToTilePx(sec) {
      // Returns the queueInner-local axis pixel for a given sec.
      //   SP: horizontal — at left edge of measure tile when at start.
      //   DP: vertical   — at bottom edge when at start, top when at end.
      // sec → queue px uses the queueMeasures coordinate system.
      const gi = measureIdxForSec(sec);
      if (gi < 0 || gi >= globalToQueueIdx.length) return 0;
      let qi = globalToQueueIdx[gi];
      let m;
      if (qi < 0) {
        // Active sec falls in a synthetic measure — clamp to the nearest
        // queue measure so the loop band / playhead still has a position.
        qi = Math.max(0, queueMeasures.length - 1);
        m = queueMeasures[qi];
        const dur = Math.max(m.end_sec - m.start_sec, 1e-6);
        const frac = sec < m.start_sec ? 0 : 1;
        if (queueVertical) {
          const tileTop = (queueMeasures.length - 1 - qi) * tileVerticalH;
          const bodyH_q = tileVerticalH - opts.queueHeaderHeight;
          return tileTop + tileVerticalH - frac * bodyH_q;
        }
        return qi * queueStride + frac * queueW;
      }
      m = queueMeasures[qi];
      const dur = Math.max(m.end_sec - m.start_sec, 1e-6);
      const frac = Math.max(0, Math.min(1, (sec - m.start_sec) / dur));
      if (queueVertical) {
        const tileTop = (queueMeasures.length - 1 - qi) * tileVerticalH;
        const tileBot = tileTop + tileVerticalH;
        // R8-26 — bodyH (not tileVerticalH) so the returned px tracks the
        // playhead's body-relative position. frac=0 → tileBot (measure start
        // = body bottom); frac=1 → tileBot - bodyH = tileTop + headerH
        // (= top of body, just below the #m label).
        const bodyH_q = tileVerticalH - opts.queueHeaderHeight;
        return tileBot - frac * bodyH_q;
      }
      return qi * queueStride + frac * queueW;
    }

    // PORT_FIXUPS #1-A — sub-measure loop helpers. px (queueInner-local
    // axis) ↔ sec inverse of secToTilePx. Pointer → sec includes the SP
    // 2D model (x = tile, y = sub-measure position with bottom=start).
    // Uses the queueMeasures coordinate system: x/y px both index into
    // queueIdx, not measures global idx.
    function pxToSec(px) {
      const N = queueMeasures.length;
      if (!N) return 0;
      if (queueVertical) {
        const qi = Math.max(0, Math.min(N - 1,
          (N - 1) - Math.floor(px / tileVerticalH)));
        const m = queueMeasures[qi];
        const tileTop = (N - 1 - qi) * tileVerticalH;
        const tileBot = tileTop + tileVerticalH;
        // R8-26 — frac is measured against the body height (tile minus
        // header), matching the playhead's bodyH-based formula. Clicking
        // at body bottom → frac=0; at body top (just below header) → frac=1.
        // Clicks above the body (within the 22 px header) clamp to 1.
        const bodyH = tileVerticalH - opts.queueHeaderHeight;
        const frac = Math.max(0, Math.min(1, (tileBot - px) / bodyH));
        return m.start_sec + frac * (m.end_sec - m.start_sec);
      }
      const qi = Math.max(0, Math.min(N - 1, Math.floor(px / queueStride)));
      const m = queueMeasures[qi];
      const within = px - qi * queueStride;
      const frac = Math.max(0, Math.min(1, within / queueW));
      return m.start_sec + frac * (m.end_sec - m.start_sec);
    }
    function pointerToSec(e) {
      const rect = queueWrap.getBoundingClientRect();
      if (queueVertical) {
        const py = queueWrap.scrollTop + (e.clientY - rect.top);
        return pxToSec(py);
      }
      const px = queueWrap.scrollLeft + (e.clientX - rect.left);
      const N = queueMeasures.length;
      const qi = Math.max(0, Math.min(N - 1, Math.floor(px / queueStride)));
      const m = queueMeasures[qi];
      const py = e.clientY - rect.top;             // SP queue has no Y scroll
      const qFooter = queueBodyFooter();           // R8-26 alignment
      const bodyH = queueH - opts.queueHeaderHeight - qFooter;
      const bodyBot = queueH - qFooter;
      let frac = (bodyBot - py) / bodyH;           // bottom of body = measure start
      frac = Math.max(0, Math.min(1, frac));
      return m.start_sec + frac * (m.end_sec - m.start_sec);
    }
    const LOOP_MIN_SEC = 0.12;
    function setLoopState(a, b) {
      let s = Math.min(a, b), en = Math.max(a, b);
      const totalSec = measures[measures.length - 1].end_sec;
      s = Math.max(0, s); en = Math.min(totalSec, en);
      if (en - s < LOOP_MIN_SEC) en = Math.min(totalSec, s + LOOP_MIN_SEC);
      loopState = { startSec: s, endSec: en };
      positionLoopBand();
      // Notify observers (slider-side loop band, etc.) on every change, not
      // just at drag end — gives the slider real-time tracking when the queue
      // is being dragged.
      if (onLoopChange) try { onLoopChange(loopState); } catch (er) {}
      // R8-26 — ghost filter tracks loop range. Re-render cached tiles so
      // out-of-range ghosts disappear / in-range ghosts reappear immediately.
      if (typeof drawFullQueue === "function") {
        try { drawFullQueue(); } catch (e) {}
      }
    }

    function positionLoopBand() {
      if (!loopState) {
        loopBand.style.display = "none";
        loopCanvas.style.display = "none";
        loopPlayhead.style.display = "none";
        loopStartHandle.style.display = "none";
        loopEndHandle.style.display = "none";
        loopTag.style.display = "none";
        loopX.style.display = "none";
        return;
      }
      const headerH = opts.queueHeaderHeight;
      if (queueVertical) {
        // DP — continuous vertical axis, single rect band, sub-measure
        // accurate. B.5 — width is `100%` (CSS) so the band naturally
        // tracks the responsive column. Inline width dropped.
        const topPx = secToTilePx(loopState.endSec);
        const botPx = secToTilePx(loopState.startSec);
        const span = Math.max(8, botPx - topPx);
        loopCanvas.style.display = "none";
        loopBand.style.display = "block";
        loopBand.style.left = "0";
        loopBand.style.right = "0";
        loopBand.style.top = topPx + "px";
        loopBand.style.width = "";
        loopBand.style.height = span + "px";

        loopStartHandle.style.display = "block";
        loopStartHandle.style.left = "0";
        loopStartHandle.style.right = "0";
        loopStartHandle.style.top = (botPx - 12) + "px";
        loopStartHandle.style.width = "";
        loopStartHandle.style.height = "24px";
        loopEndHandle.style.display = "block";
        loopEndHandle.style.left = "0";
        loopEndHandle.style.right = "0";
        loopEndHandle.style.top = (topPx - 12) + "px";
        loopEndHandle.style.width = "";
        loopEndHandle.style.height = "24px";

        loopTag.style.display = "block";
        loopTag.style.left = "6px";
        loopTag.style.top = (topPx + 4) + "px";
        loopX.style.display = "block";
        loopX.style.left = "auto";
        loopX.style.right = "6px";
        loopX.style.top = (topPx + 4) + "px";

        const phPx = secToTilePx(state.currentSec);
        if (phPx >= topPx && phPx <= botPx) {
          loopPlayhead.style.display = "block";
          loopPlayhead.style.left = "0";
          loopPlayhead.style.right = "0";
          loopPlayhead.style.top = (phPx - 1) + "px";
          loopPlayhead.style.width = "";
          loopPlayhead.style.height = "2px";
        } else loopPlayhead.style.display = "none";
        return;
      }

      // SP — horizontal tiles + within-tile vertical flow → staircase.
      // Pixel-space uses queueIdx (queueMeasures), not the global measure
      // idx, since synthetic measures are not in the queue.
      const mS = measureIdxForSec(loopState.startSec);
      const mE = measureIdxForSec(loopState.endSec, true);
      const qS = (mS >= 0 && mS < globalToQueueIdx.length && globalToQueueIdx[mS] >= 0)
        ? globalToQueueIdx[mS] : 0;
      const qE = (mE >= 0 && mE < globalToQueueIdx.length && globalToQueueIdx[mE] >= 0)
        ? globalToQueueIdx[mE] : Math.max(0, queueMeasures.length - 1);
      const durS = measures[mS].end_sec - measures[mS].start_sec;
      const durE = measures[mE].end_sec - measures[mE].start_sec;
      const fracS = Math.max(0, Math.min(1, (loopState.startSec - measures[mS].start_sec) / durS));
      const fracE = Math.max(0, Math.min(1, (loopState.endSec - measures[mE].start_sec) / durE));
      const qFooter = queueBodyFooter();
      const bodyH = queueH - headerH - qFooter;
      const yS = headerH + (1 - fracS) * bodyH;       // start sec's Y (tile qS)
      const yE = headerH + (1 - fracE) * bodyH;       // end sec's Y (tile qE)

      const x0 = qS * queueStride;
      const x1 = qE * queueStride + queueW;
      const wpx = Math.max(queueW, x1 - x0);

      loopBand.style.display = "none";
      loopCanvas.style.display = "block";
      loopCanvas.style.left = x0 + "px";
      loopCanvas.style.top = "0";
      loopCanvas.style.width = wpx + "px";
      loopCanvas.style.height = queueH + "px";
      const lctx = setupCanvas(loopCanvas, wpx, queueH);
      lctx.clearRect(0, 0, wpx, queueH);
      lctx.fillStyle = "rgba(167,139,250,0.12)";
      lctx.strokeStyle = "#a78bfa";
      lctx.lineWidth = 1;
      const seg = (lx, top, h) => {
        if (h <= 0) return;
        lctx.fillRect(lx, top, queueW, h);
        if (lctx.roundRect) { lctx.beginPath(); lctx.roundRect(lx + 0.5, top + 0.5, queueW - 1, h - 1, 4); lctx.stroke(); }
        else lctx.strokeRect(lx + 0.5, top + 0.5, queueW - 1, h - 1);
      };
      if (qS === qE) {
        seg(0, yE, yS - yE);
      } else {
        seg(0, headerH, yS - headerH);                                   // start tile top fragment
        for (let q = qS + 1; q < qE; q++) seg((q - qS) * queueStride, headerH, bodyH); // middle full
        seg((qE - qS) * queueStride, yE, (headerH + bodyH) - yE);        // end tile bottom fragment
      }

      // Handles — horizontal bars (ns-resize) at each end's tile + sec height.
      loopStartHandle.style.display = "block";
      loopStartHandle.style.left = x0 + "px";
      loopStartHandle.style.top = (yS - 12) + "px";
      loopStartHandle.style.width = queueW + "px";
      loopStartHandle.style.height = "24px";
      loopEndHandle.style.display = "block";
      loopEndHandle.style.left = (qE * queueStride) + "px";
      loopEndHandle.style.top = (yE - 12) + "px";
      loopEndHandle.style.width = queueW + "px";
      loopEndHandle.style.height = "24px";

      loopTag.style.display = "block";
      loopTag.style.left = (qE * queueStride + 6) + "px";
      loopTag.style.top = (yE + 4) + "px";
      loopX.style.display = "block";
      loopX.style.left = (qE * queueStride + queueW - 22) + "px";
      loopX.style.right = "auto";
      loopX.style.top = (yE + 4) + "px";

      if (state.currentSec >= loopState.startSec - 1e-6 && state.currentSec <= loopState.endSec + 1e-6) {
        const gi = measureIdxForSec(state.currentSec);
        const qC = (gi >= 0 && gi < globalToQueueIdx.length && globalToQueueIdx[gi] >= 0)
          ? globalToQueueIdx[gi] : qS;
        const durC = measures[gi].end_sec - measures[gi].start_sec;
        const fracC = Math.max(0, Math.min(1, (state.currentSec - measures[gi].start_sec) / durC));
        const yC = headerH + (1 - fracC) * bodyH;
        loopPlayhead.style.display = "block";
        loopPlayhead.style.left = (qC * queueStride) + "px";
        loopPlayhead.style.top = (yC - 1) + "px";
        loopPlayhead.style.width = queueW + "px";
        loopPlayhead.style.height = "2px";
      } else loopPlayhead.style.display = "none";
    }

    function clearLoop() {
      if (!loopState) return;
      loopState = null;
      stopLoopAutoScroll();    // PORT_FIXUPS #1-F
      positionLoopBand();
      drawMain();
      if (onLoopChange) try { onLoopChange(null); } catch (e) {}
      // R8-26 — ghost filter follows loop. Clearing loop reveals all judged
      // notes' ghosts (no range filter); refresh cached tiles.
      if (typeof drawFullQueue === "function") {
        try { drawFullQueue(); } catch (e) {}
      }
    }
    let onLoopChange = null;
    // R8-10: fired once per loop wrap so the host UI can paint a countdown
    // overlay during the standby window. Payload = { holdMs, startedAt }.
    let onLoopWrap = null;

    function pointerOffsetPx(e) {
      const rect = queueWrap.getBoundingClientRect();
      if (queueVertical) return queueWrap.scrollTop + (e.clientY - rect.top);
      return queueWrap.scrollLeft + (e.clientX - rect.left);
    }
    function checkLoopWrap() {
      if (!loopState) return false;
      if (state.currentSec >= loopState.endSec - 1e-6) {
        state.currentSec = loopState.startSec;
        const mS = measureIdxForSec(loopState.startSec);
        state.activeIdx = mS;
        resetJudgments();
        if (audioEl) {
          loopWrapAudioWasPlaying = !audioEl.paused;
          try { audioEl.pause(); } catch (e) {}
          try { audioEl.currentTime = chartToAudioSec(loopState.startSec); } catch (e) {}
          audioSeekPending = false;
        }
        const now = performance.now();
        const holdMs = Math.max(0, settings.loopWrapHoldMs | 0);
        loopWrapHoldUntil = now + holdMs;
        // Safety cap = hold + 800 ms decoder budget. Always ≥ 800 ms even
        // when the user picks a 3 s standby (gives 3.8 s before we bail).
        loopWrapMaxUntil  = now + holdMs + 800;
        loopWrapAudioResuming = false;   // stage 2 hasn't started yet
        if (onLoopWrap) {
          try { onLoopWrap({ holdMs: holdMs, startedAt: now }); } catch (e) {}
        }
        return true;
      }
      return false;
    }

    // PORT_FIXUPS #1-D — pointer handlers (sec-based, sub-measure precision)
    // + #2 auto-scroll hooks. Simple click = seek, drag ≥6px = create loop,
    // handle drag = resize. Mockup convention: when loop active, clicks
    // outside the band are ignored (no seek).
    let loopDragStartSec = null;
    let loopDownClientX = 0, loopDownClientY = 0;
    // R3-fix: bump threshold from 6 → 14 px. The mockup uses 6 but on a
    // trackpad/HiDPI mouse it's trivial to "click" with >6 px micro-drift,
    // which silently spawned a loop and ran finalizeLoopHead (sending
    // currentSec to loop.startSec, usually m0). User sees "Play always
    // starts from the beginning" without realizing a loop was created.
    const LOOP_DRAG_MIN_PX = 14;

    function updateLoopFromPointer(e) {
      const sec = pointerToSec(e);
      if (loopHandleDrag === "start") {
        setLoopState(Math.min(sec, loopState.endSec - LOOP_MIN_SEC), loopState.endSec);
      } else if (loopHandleDrag === "end") {
        setLoopState(loopState.startSec, Math.max(sec, loopState.startSec + LOOP_MIN_SEC));
      } else if (loopDragStartSec !== null) {
        setLoopState(loopDragStartSec, sec);
      }
    }
    function finalizeLoopHead() {
      if (!loopState) return;
      state.currentSec = loopState.startSec;
      state.activeIdx = measureIdxForSec(loopState.startSec);
      resetJudgments();
      if (audioEl && !audioEl.paused) {
        try { audioEl.currentTime = chartToAudioSec(loopState.startSec); } catch (er) {}
      }
      drawMain();
    }

    queueWrap.addEventListener("pointerdown", (e) => {
      if (!measures.length) return;
      const tgt = e.target;
      if (tgt === loopX) { e.stopPropagation(); clearLoop(); return; }
      if (tgt === loopStartHandle || tgt === loopEndHandle) {
        loopHandleDrag = (tgt === loopStartHandle) ? "start" : "end";
        lastPointerEvt = e;
        try { queueWrap.setPointerCapture(e.pointerId); } catch (er) {}
        ensureLoopAutoScroll();
        e.preventDefault();
        return;
      }
      loopDownClientX = e.clientX; loopDownClientY = e.clientY;
      loopDragStartSec = pointerToSec(e);
      loopDragMoved = false;
      try { queueWrap.setPointerCapture(e.pointerId); } catch (er) {}
    });

    queueWrap.addEventListener("pointermove", (e) => {
      if (loopHandleDrag) { lastPointerEvt = e; updateLoopFromPointer(e); ensureLoopAutoScroll(); return; }
      if (loopDragStartSec === null) return;
      if (!loopDragMoved &&
          Math.hypot(e.clientX - loopDownClientX, e.clientY - loopDownClientY) <= LOOP_DRAG_MIN_PX) return;
      loopDragMoved = true;
      lastPointerEvt = e;
      updateLoopFromPointer(e);
      ensureLoopAutoScroll();
    });

    queueWrap.addEventListener("pointerup", (e) => {
      stopLoopAutoScroll();
      if (loopHandleDrag) {
        loopHandleDrag = null;
        finalizeLoopHead();
        if (onLoopChange) try { onLoopChange(loopState); } catch (er) {}
        try { queueWrap.releasePointerCapture(e.pointerId); } catch (er) {}
        return;
      }
      if (loopDragStartSec === null) return;
      if (loopDragMoved) {
        finalizeLoopHead();
        if (onLoopChange) try { onLoopChange(loopState); } catch (er) {}
      } else {
        // Simple click → exact-sec seek. Loop active: ignore clicks outside band.
        const sec = pointerToSec(e);
        if (loopState && (sec < loopState.startSec - 1e-6 || sec >= loopState.endSec)) {
          /* outside band — ignore */
        } else {
          seekToSec(sec);
        }
      }
      loopDragStartSec = null;
      loopDragMoved = false;
      try { queueWrap.releasePointerCapture(e.pointerId); } catch (er) {}
    });

    queueWrap.addEventListener("pointercancel", () => {
      stopLoopAutoScroll();
      loopDragStartSec = null; loopDragMoved = false; loopHandleDrag = null;
    });

    function drawActiveProgress() {
      if (!activeOverlayCtx) return;
      // B.5 — DP overlay width is responsive; sync bitmap to display × dpr
      // each frame (cheap if unchanged). SP overlay stays fixed queueW.
      const aw = queueVertical ? (activeOverlay.clientWidth || queueW) : queueW;
      const ah = queueVertical ? tileVerticalH : queueH;
      if (queueVertical) syncCanvasBitmap(activeOverlay, activeOverlayCtx, aw, ah);
      activeOverlayCtx.clearRect(0, 0, aw, ah);
      if (loopState) {
        activeOverlay.style.visibility = "hidden";
        positionLoopBand();
        return;
      }
      const i = state.activeIdx;
      // Translate global activeIdx → queueIdx. Synthetic measures aren't
      // in the queue, so hide the overlay when active is one of those.
      const qi = (i >= 0 && i < globalToQueueIdx.length) ? globalToQueueIdx[i] : -1;
      if (qi < 0) {
        activeOverlay.style.visibility = "hidden";
        return;
      }
      activeOverlay.style.visibility = "visible";
      if (queueVertical) {
        const top = (queueMeasures.length - 1 - qi) * tileVerticalH;
        activeOverlay.style.transform = "translateY(" + top + "px)";
      } else {
        activeOverlay.style.transform = "translateX(" + (qi * queueStride) + "px)";
      }
      const m = measures[i];
      const dur = Math.max(m.end_sec - m.start_sec, 1e-6);
      const prog = Math.min(1, Math.max(0, (state.currentSec - m.start_sec) / dur));
      drawProgressBorder(
        activeOverlayCtx, 0, 0, aw, ah, prog,
        opts.activeBorder,
        m.idx,
        opts.queueHeaderHeight,
        queueBodyFooter()
      );
    }

    function tileForGlobal(globalIdx) {
      const qi = globalIdx >= 0 && globalIdx < globalToQueueIdx.length
        ? globalToQueueIdx[globalIdx] : -1;
      return qi >= 0 ? (tilesPool.get(qi) || null) : null;
    }

    function renderQueuePanelAt(queueIdx) {
      const tile = tilesPool.get(queueIdx);
      if (!tile || queueIdx < 0 || queueIdx >= queueMeasures.length) return;
      const m = queueMeasures[queueIdx];
      const globalIdx = queueGlobalIdx[queueIdx];
      const ghostOn = settings.ghostEnabled !== false;
      const _gToIdx = ghostOn ? noteToIdx       : null;
      const _gType  = ghostOn ? noteJudgmentType : null;
      const _gDelta = ghostOn ? noteDeltaMs     : null;
      const _gLoopS = (ghostOn && loopState) ? loopState.startSec : null;
      const _gLoopE = (ghostOn && loopState) ? loopState.endSec   : null;
      const _qFoot  = queueBodyFooter();
      if (queueVertical) {
        // Tile width responsive: sync bitmap to clientWidth × dpr.
        const tw = tile.canvas.clientWidth || queueW;
        syncCanvasBitmap(tile.canvas, tile.ctx, tw, tileVerticalH);
        const ql = laneUnitForQueueWidth(tw);
        tile.ctx.fillStyle = opts.bg;
        tile.ctx.fillRect(0, 0, tw, tileVerticalH);
        const _qPanelProps = {
          x: 0, y: 0, w: tw, h: tileVerticalH,
          layout, laneUnit: ql, p1p2GapPx: opts.p1p2GapPx,
          headerH: opts.queueHeaderHeight,
          noteHeight: opts.queueNoteHeight,
          lnAlpha: opts.lnAlpha,
          opts,
          label: "#" + m.idx,
          bpmLabel: bpmLabelFor(globalIdx),
          measure: m,
          notes: notesByMeasure[globalIdx],
          displayPos, laneFilterMode: settings.laneFilter, laneFilterMode2P: settings.laneFilter2P, mode,
          noteToIdx: _gToIdx, noteJudgmentType: _gType, noteDeltaMs: _gDelta,
          ghostLoopStart: _gLoopS, ghostLoopEnd: _gLoopE,
          bodyFooter: _qFoot,
        };
        drawQueuePanel(tile.ctx, _qPanelProps);
        return;
      }
      // SP: each tile holds a single measure; draw at x=0 in its own ctx.
      tile.ctx.fillStyle = opts.bg;
      tile.ctx.fillRect(0, 0, queueW, queueH);
      drawQueuePanel(tile.ctx, {
        x: 0, y: 0, w: queueW, h: queueH,
        layout, laneUnit: queueLaneUnit, p1p2GapPx: opts.p1p2GapPx,
        headerH: opts.queueHeaderHeight,
        noteHeight: opts.queueNoteHeight,
        lnAlpha: opts.lnAlpha,
        opts,
        label: "#" + m.idx,
        bpmLabel: bpmLabelFor(globalIdx),
        measure: m,
        notes: notesByMeasure[globalIdx],
        displayPos, laneFilterMode: settings.laneFilter, mode,   // R8-13
        noteToIdx: _gToIdx, noteJudgmentType: _gType, noteDeltaMs: _gDelta,   // R8-26 ghost
        ghostLoopStart: _gLoopS, ghostLoopEnd: _gLoopE,
        bodyFooter: _qFoot,
      });
    }

    // R7 virtualization viewport math + diff pump.
    const VIEWPORT_BUFFER = 2;  // extra tiles on each side of the visible range

    function visibleTileRange() {
      const N = queueMeasures.length;
      if (queueVertical) {
        const ch = queueWrap.clientHeight || queueH;
        const top = queueWrap.scrollTop;
        // Bottom-up over queueMeasures: queueIdx q sits at top = (N-1-q)*tileH.
        const lastVisibleQ = (N - 1) - Math.floor(top / tileVerticalH);
        const firstVisibleQ = (N - 1) - Math.ceil((top + ch) / tileVerticalH);
        return {
          lo: Math.max(0, firstVisibleQ - VIEWPORT_BUFFER),
          hi: Math.min(N - 1, lastVisibleQ + VIEWPORT_BUFFER),
        };
      }
      const cw = queueWrap.clientWidth || queueW;
      const left = queueWrap.scrollLeft;
      const firstVisible = Math.floor(left / queueStride);
      const lastVisible = Math.floor((left + cw) / queueStride);
      return {
        lo: Math.max(0, firstVisible - VIEWPORT_BUFFER),
        hi: Math.min(N - 1, lastVisible + VIEWPORT_BUFFER),
      };
    }

    function updateVirtualization() {
      if (queueMeasures.length === 0) return;
      const { lo, hi } = visibleTileRange();
      // Dispose tiles outside the new range.
      for (const tileIdx of Array.from(tilesPool.keys())) {
        if (tileIdx < lo || tileIdx > hi) disposeTile(tileIdx);
      }
      // Ensure tiles inside the range exist.
      for (let i = lo; i <= hi; i++) {
        if (!tilesPool.has(i)) createTile(i);
      }
    }

    function drawFullQueue() {
      const t0 = performance.now();
      // Sweep existing pool tiles; createTile already renders new ones.
      for (const [idx, tile] of tilesPool) {
        if (queueVertical) {
          tile.ctx.fillStyle = opts.bg;
          tile.ctx.fillRect(0, 0, tile.canvas.clientWidth || queueW, tileVerticalH);
        } else {
          tile.ctx.fillStyle = opts.bg;
          tile.ctx.fillRect(0, 0, queueStride, queueH);
        }
        renderQueuePanelAt(idx);
      }
      profileFrame("drawFullQueue (pool=" + tilesPool.size + " / " + measures.length + ")", performance.now() - t0);
    }

    function snapQueueToActive() {
      if (!queueVertical) return;
      if (state.activeIdx < 0 || state.activeIdx >= globalToQueueIdx.length) return;
      const qi = globalToQueueIdx[state.activeIdx];
      if (qi < 0) return;
      const top = (queueMeasures.length - 1 - qi) * tileVerticalH;
      const bot = top + tileVerticalH;
      const ch = queueWrap.clientHeight;
      if (ch < 1) return;                     // layout not settled
      queueWrap.scrollTop = Math.max(0, bot - ch);
    }
    function drawAll() {
      drawMain();
      // R7 virtualization: ensure the active measure is on-screen FIRST
      // (which may scroll the queue), then sync the pool to the new
      // viewport, then render. Without this order, drawFullQueue may
      // paint stale tiles or skip the active one entirely.
      ensureActiveInView();
      updateVirtualization();
      drawFullQueue();
      snapQueueToActive();
      if (queueVertical) {
        requestAnimationFrame(snapQueueToActive);
        requestAnimationFrame(() => requestAnimationFrame(snapQueueToActive));
        // Round-5 — keep retrying for 3 seconds. Some browsers / dialog
        // animations leave queueWrap.clientHeight=0 for much longer than
        // a few rAFs.
        let snapAttempts = 0;
        const snapInterval = setInterval(() => {
          snapAttempts++;
          snapQueueToActive();
          if (snapAttempts >= 30) clearInterval(snapInterval);
        }, 100);
      }
    }

    // ── Playback ───────────────────────────────────────────────────────
    let rafHandle = null;
    let lastTs = 0;
    let onPlayStateChange = null;
    let onMeasureChange = null;

    // R4 — audio seek gate. play()/seekToSec() flag a seek as pending; the
    // 'seeked' event (or the audio clock landing near the target) clears
    // it. While pending, the loop advances by dt instead of slaving to
    // audio.currentTime, which avoids "Play always starts at 0" — the
    // browser briefly reports currentTime=0 between currentTime=N and
    // the seek completing.
    let audioSeekPending = false;
    let audioSeekTargetChart = 0;
    function audioSafeMaxChart() {
      // r4-extra: timeline.total_sec may exceed audio.duration when A2
      // outro synthetic measures were added. Setting audio.currentTime
      // past audio.duration triggers a NETWORK / DEMUXER read error.
      // Clamp seeks to the audio's actual playable range.
      if (audioEl && isFinite(audioEl.duration) && audioEl.duration > 0) {
        return audioToChartSec(audioEl.duration) - 0.05;
      }
      return Infinity;
    }
    function beginAudioSeek(chartSec) {
      if (!audioEl) return;
      const safe = Math.min(chartSec, audioSafeMaxChart());
      audioSeekTargetChart = Math.max(0, safe);
      audioSeekPending = true;
      try { audioEl.currentTime = chartToAudioSec(audioSeekTargetChart); } catch (e) {}
    }

    // Optional audio sync. When present, chart time is driven by
    // audio.currentTime (+ offset) rather than dt accumulation. Without
    // audio everything falls back to dt-based playback.
    let audioEl = null;
    let audioBlobUrl = null;
    const audioOffsetSec = opts.audioOffsetSec || 0;
    if (opts.audioUrl) {
      audioEl = new Audio();
      audioEl.preload = "auto";
      audioEl.crossOrigin = "anonymous";

      // r4-extra-2: pre-download audio as a Blob and serve via blob: URL
      // so subsequent seeks (audio.currentTime = N) don't trigger HTTP
      // Range requests against the file-api grant. file-api grants are
      // short-lived / single-use — Chrome's seek-time refetch turns into
      // PIPELINE_ERROR_READ, breaking the audio. With a blob URL the audio
      // is in-memory and seek is purely client-side.
      fetch(opts.audioUrl, { credentials: "include" })
        .then(function (r) {
          if (!r.ok) {
            const err = new Error("HTTP " + r.status);
            err.status = r.status;
            throw err;
          }
          return r.blob();
        })
        .then(function (blob) {
          audioBlobUrl = URL.createObjectURL(blob);
          audioEl.src = audioBlobUrl;
        })
        .catch(function (e) {
          // 429 = rate limit. The direct-src fallback used to retry the same
          // grant URL via the <audio> element, which just re-triggers the
          // same 429 and breaks audio entirely. Bail instead: clear the
          // audio element so chart visualization still renders silently.
          // Any other failure (network blip, expired grant) falls back to
          // direct src — the audio element handles a brief HTTP Range
          // request differently than fetch() and may succeed.
          if (e && e.status === 429) {
            console.warn("[chart] audio prefetch rate-limited (429); skipping audio for this load", e);
            audioEl = null;
            return;
          }
          console.warn("[chart] audio prefetch failed, using direct src", e);
          audioEl.src = opts.audioUrl;
        });
      audioEl.addEventListener("error", (e) => {
        console.warn("[chart] audio error", e, audioEl.error);
      });
      // When audio reaches its natural end, snap the playhead back to the
      // first measure and stay paused — caller can hit play to re-watch.
      // (Calling reset() instead of pause() means the next play() starts
      // from the top, not from the end of the outro.)
      audioEl.addEventListener("ended", () => { reset(); });
      // R4 + r4-extra — clear the seek gate ONLY when audio actually
      // landed near the target. Browsers fire 'seeked' even when the
      // currentTime set was effectively ignored (audio not yet
      // metadata-loaded), in which case audio.currentTime ≈ 0 ≠ target.
      // Letting the gate drop in that case made loop slave to audio's
      // 0-clock → currentSec was driven from 0, hiding all notes up
      // to the user's clicked measure.
      audioEl.addEventListener("seeked", () => {
        if (!audioSeekPending) return;
        const landed = audioToChartSec(audioEl.currentTime);
        if (Math.abs(landed - audioSeekTargetChart) < 0.5) {
          audioSeekPending = false;
        }
        // Otherwise: leave the gate up. loop will keep coasting on dt,
        // and the Math.abs check inside loop() will close the gate the
        // moment audio actually catches up.
      });
      // r4-extra — when audio becomes truly playable, retry the seek if
      // the gate is still up (initial currentTime set was discarded
      // because metadata wasn't loaded yet). Use loadedmetadata (fires
      // once) instead of canplay (fires repeatedly per playable buffer
      // chunk) to avoid retry storms that cause NETWORK / DEMUXER errors.
      audioEl.addEventListener("loadedmetadata", () => {
        if (audioSeekPending) {
          const safe = Math.min(audioSeekTargetChart, audioSafeMaxChart());
          try { audioEl.currentTime = chartToAudioSec(Math.max(0, safe)); } catch (e) {}
        }
      });
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

      // R4: dt is the master clock. Audio is the slave, but ONLY after
      // the seek gate clears — otherwise audio.currentTime read-back can
      // briefly return 0 right after play() set it to N, snapping
      // state.currentSec to 0 ("Play always starts from 0").
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.25) : 0;
      lastTs = ts;

      // R8-7 / R8-9: two-stage wrap.
      //   stage 1 = inWrapHold     → audio paused, state pinned at startSec
      //   stage 2 = wrapAudioResume → audio.play() called, state STILL pinned
      //                               until audio.currentTime advances past
      //                               startSec (decoder produces samples).
      // Either stage's "pin" suppresses both dt accumulation and audio-slave,
      // so there's no backward jump when the slave catches up.
      const inWrapHold = loopWrapHoldUntil > 0 && ts < loopWrapHoldUntil && loopState !== null;

      if (inWrapHold) {
        state.currentSec = loopState.startSec;
      } else {
        // Hold timer just expired this frame — transition into stage 2.
        if (loopWrapHoldUntil > 0) {
          loopWrapHoldUntil = 0;
          if (audioEl && audioEl.paused && loopWrapAudioWasPlaying && loopState) {
            loopWrapAudioWasPlaying = false;
            loopWrapAudioResuming = true;
            try {
              const p = audioEl.play();
              if (p && typeof p.catch === "function") p.catch(function () {});
            } catch (e) {}
          } else {
            // User pre-empted (paused / seeked during stage 1) — drop everything.
            loopWrapAudioWasPlaying = false;
            loopWrapMaxUntil = 0;
          }
        }

        if (loopWrapAudioResuming && loopState) {
          let resolved = false;
          if (audioEl && !audioEl.paused) {
            const audioChart = audioToChartSec(audioEl.currentTime);
            if (audioChart > loopState.startSec + LOOP_WRAP_RESUME_EPSILON) {
              // Decoder is producing samples → safe to slave normally.
              loopWrapAudioResuming = false;
              loopWrapMaxUntil = 0;
              state.currentSec = audioChart;
              resolved = true;
            }
          }
          if (!resolved) {
            // Pin until samples come (or the safety cap fires). NO dt
            // accumulation here — that's exactly what produced the visible
            // backward-jump stutter when the slave finally kicked in.
            state.currentSec = loopState.startSec;
            if (loopWrapMaxUntil > 0 && ts >= loopWrapMaxUntil) {
              loopWrapAudioResuming = false;
              loopWrapMaxUntil = 0;
            }
          }
        } else if (audioEl && !audioEl.paused) {
          const audioChart = audioToChartSec(audioEl.currentTime);
          if (audioSeekPending) {
            // Seek not landed yet — advance by dt, watch for audio reaching the target.
            state.currentSec += dt;
            if (Math.abs(audioChart - audioSeekTargetChart) < 0.08) audioSeekPending = false;
          } else {
            state.currentSec = audioChart;   // sample-accurate slave
          }
        } else {
          state.currentSec += dt;
        }
      }

      if (checkLoopWrap()) { /* state reset inside */ }
      ageMisses();

      while (
        state.activeIdx < measures.length - 1 &&
        state.currentSec >= measures[state.activeIdx].end_sec - 1e-6
      ) {
        const prev = state.activeIdx;
        state.activeIdx++;
        ensureActiveInView();
        if (onMeasureChange) onMeasureChange(state.activeIdx, prev);
      }
      if (
        state.activeIdx >= measures.length - 1 &&
        state.currentSec >= measures[measures.length - 1].end_sec - 1e-6
      ) {
        reset();
        return;
      }
      const tM = performance.now();
      drawMain();
      profileFrame("frame", performance.now() - tM);
      rafHandle = requestAnimationFrame(loop);
    }

    function play() {
      if (rafHandle) return;
      const lastEnd = measures[measures.length - 1].end_sec;

      // Play at end → restart from top.
      if (state.activeIdx >= measures.length - 1 && state.currentSec >= lastEnd - 1e-3) {
        state.activeIdx = 0;
        state.currentSec = measures[0].start_sec;
        resetJudgments();
        if (onMeasureChange) onMeasureChange(0, -1);
      }

      // Loop active + playhead outside range → snap to loop start.
      if (loopState && (state.currentSec < loopState.startSec - 1e-6 ||
                        state.currentSec >= loopState.endSec - 1e-6)) {
        state.currentSec = loopState.startSec;
        state.activeIdx = measureIdxForSec(loopState.startSec);
        resetJudgments();
      }

      // R4 core + r4-extra: gate the seek instead of setting + immediately
      // re-reading. AND re-assert currentTime after play() resolves —
      // some browser/audio combinations silently discard the pre-play
      // currentTime assignment (audio starts from 0 even though we set
      // 7.19s before calling play()). Re-checking after the play promise
      // resolves catches that path.
      if (audioEl) {
        // If audio reached natural end on a previous play, audio.ended
        // is true and play() will auto-reset currentTime to 0. Nudge it
        // first so the subsequent beginAudioSeek's set sticks.
        if (audioEl.ended) {
          try { audioEl.currentTime = 0.001; } catch (e) {}
        }
        beginAudioSeek(state.currentSec);
        const p = audioEl.play();
        if (p && p.then) {
          p.then(() => {
            // After play actually starts, verify audio landed near
            // target. If not (set was discarded), force it again.
            if (audioEl.paused) return;
            const audioChart = audioToChartSec(audioEl.currentTime);
            if (Math.abs(audioChart - audioSeekTargetChart) > 0.3) {
              try { audioEl.currentTime = chartToAudioSec(audioSeekTargetChart); } catch (e) {}
            }
          }).catch((e) => {
            if (e && e.name !== "AbortError") {
              console.warn("[chart] audio play rejected", e);
            }
          });
        }
      }

      lastTs = 0;
      rafHandle = requestAnimationFrame(loop);
      if (onPlayStateChange) onPlayStateChange(true);
    }
    function pause() {
      // R8-7 / R8-9 cleanup: any user-initiated transport action invalidates
      // the pending wrap-hold AND the stage-2 audio-resume gate — otherwise
      // the next play() would hand audio off to our wrap-recovery code path
      // and re-seek to loopState.startSec.
      loopWrapHoldUntil = 0;
      loopWrapAudioWasPlaying = false;
      loopWrapAudioResuming = false;
      loopWrapMaxUntil = 0;
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
      resetJudgments();
      if (audioEl) {
        try { audioEl.currentTime = 0; } catch (e) {}
        audioSeekPending = false;       // R4 — direct set; no gate needed.
      }
      drawMain();
      ensureActiveInView();             // R4 — works for SP horizontal AND DP vertical queue.
    }

    function seekToMeasure(i) {
      if (measures.length === 0) return;
      i = Math.max(0, Math.min(measures.length - 1, i));
      state.activeIdx = i;
      state.currentSec = measures[i].start_sec;
      // Any seek wipes play-state — notes you skipped over shouldn't count
      // as Misses, and notes behind you shouldn't sit in the lane queue.
      resetJudgments();
      // R8-7 / R8-9: invalidate the wrap recovery; the user just chose a
      // new playback position.
      loopWrapHoldUntil = 0;
      loopWrapAudioWasPlaying = false;
      loopWrapAudioResuming = false;
      loopWrapMaxUntil = 0;
      if (audioEl) {
        try { audioEl.currentTime = chartToAudioSec(state.currentSec); }
        catch (e) { /* not yet seekable */ }
      }
      drawMain();
      ensureActiveInView();
      if (onMeasureChange) onMeasureChange(i, -1);
    }

    // R4 — arbitrary-sec seek. Drag-pause protocol preserved: while
    // audio is paused (the progress-slider drag policy pauses on
    // pointerdown), we set audioEl.currentTime directly and clear the
    // gate. While audio is playing (programmatic mid-play seek), we use
    // beginAudioSeek so the raf loop coasts on dt until the seek lands.
    function seekToSec(sec) {
      if (!measures.length) return;
      const totalSec = measures[measures.length - 1].end_sec;
      sec = Math.max(0, Math.min(totalSec, sec));
      state.currentSec = sec;

      // Binary search for the measure index.
      let lo = 0, hi = measures.length - 1, found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (measures[mid].start_sec <= sec) { found = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      const prevIdx = state.activeIdx;
      state.activeIdx = found;
      resetJudgments();
      // R8-7 / R8-9: invalidate the wrap recovery.
      loopWrapHoldUntil = 0;
      loopWrapAudioWasPlaying = false;
      loopWrapAudioResuming = false;
      loopWrapMaxUntil = 0;

      if (audioEl) {
        if (!audioEl.paused) {
          beginAudioSeek(sec);
        } else {
          try { audioEl.currentTime = chartToAudioSec(sec); } catch (e) {}
          audioSeekPending = false;
        }
      }

      drawMain();
      ensureActiveInView();
      if (onMeasureChange && state.activeIdx !== prevIdx) onMeasureChange(state.activeIdx, prevIdx);
    }

    // B.6 — ResizeObserver. cp-field / cp-queue__wrap clientWidth changes
    // (window resize, dialog resize, Jekyll dev reload) trigger bitmap
    // sync + redraw. Each tile's bitmap is sized lazily on next draw via
    // syncCanvasBitmap; we just trigger the redraw here. Debounced to one
    // rAF so a single resize storm collapses to one redraw.
    // Round-2: also re-snap queue scroll for the FIRST few resize events
    // (covers dialog open animation settling).
    let resizeRafHandle = 0;
    let resizeSnapBudget = 5;          // snap on the first few resizes
    // R8-26 — recompute the JS-side layout cache (mainH, queueH, the CSS
    // constants) from current CSS + container rect. Idempotent. Called from
    // resize handlers so the JS math stays in sync with CSS calc()-driven
    // layout. Returns true when any cached value changed (triggers tile
    // bitmap / active overlay re-sync).
    function recomputeLayoutCache() {
      const prevMainH = mainH;
      const prevQueueH = queueH;
      // Stage height — measured from cp-field, falls back to construction
      // mainH if not yet sized (initial layout, hidden dialogs, etc.).
      const measuredH = (mainFrame && mainFrame.getBoundingClientRect)
        ? mainFrame.getBoundingClientRect().height : 0;
      if (measuredH > 0) mainH = measuredH;
      // Re-read CSS constants. They rarely change at runtime, but reading
      // every refresh keeps us honest if a designer hot-reloads CSS.
      QUEUE_LABEL_H        = cssPxOf(host, "--cp-queue-label-h")    || 24;
      QUEUE_BOTTOM_PAD     = cssPxOf(host, "--cp-queue-bottom-pad") || 12;
      SP_SCROLLBAR_RESERVE = cssPxOf(host, "--cp-sp-scrollbar-reserve") || 14;
      DP_BOTTOM_PANEL_H    = cssPxOf(host, "--cp-dp-bottom-panel-h") || 114;
      _DEFAULT_LINE_LIFT   = cssPxOf(host, "--cp-line-lift") || 1;
      _SP_TILE_FOOTER      = (opts.keyZoneH || 0) + _DEFAULT_LINE_LIFT - QUEUE_BOTTOM_PAD + QUEUE_LABEL_H;
      queueH = (mode === "DP") ? mainH : Math.max(120, mainH - _SP_TILE_FOOTER);
      return prevMainH !== mainH || prevQueueH !== queueH;
    }

    function onContainerResize() {
      if (resizeRafHandle) return;
      resizeRafHandle = requestAnimationFrame(() => {
        resizeRafHandle = 0;
        const layoutChanged = recomputeLayoutCache();
        // R8-26 — keep --cp-stage-h in sync so CSS calc() rules track JS.
        if (host && host.style) {
          host.style.setProperty("--cp-stage-h", mainH + "px");
        }
        // SP — tile bitmaps and active overlay were sized to the OLD queueH
        // / queueStride at creation. Resize them so the rendered pixels
        // match the new CSS dimensions; otherwise the browser stretches
        // bitmaps and notes drift.
        if (layoutChanged && !queueVertical) {
          if (activeOverlay && activeOverlayCtx) {
            syncCanvasBitmap(activeOverlay, activeOverlayCtx, queueW, queueH);
          }
          if (tilesPool) {
            for (const tile of tilesPool.values()) {
              try { syncCanvasBitmap(tile.canvas, tile.ctx, queueStride, queueH); } catch (e) {}
            }
          }
        }
        drawMain();
        if (queueVertical) {
          drawFullQueue();
          if (resizeSnapBudget > 0) {
            resizeSnapBudget--;
            snapQueueToActive();
          }
        } else if (layoutChanged) {
          // SP — redraw all tile bitmaps with new dimensions.
          if (typeof drawFullQueue === "function") {
            try { drawFullQueue(); } catch (e) {}
          }
        }
      });
    }
    let resizeObs = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(onContainerResize);
      try { resizeObs.observe(mainFrame); } catch (e) {}
      if (queueVertical) {
        try { resizeObs.observe(queueWrap); } catch (e) {}
      }
    }

    function destroy() {
      pause();
      teardownVirtualization();
      if (resizeObs) {
        try { resizeObs.disconnect(); } catch (e) {}
        resizeObs = null;
      }
      if (resizeRafHandle) {
        cancelAnimationFrame(resizeRafHandle);
        resizeRafHandle = 0;
      }
      if (audioEl) {
        audioEl.src = "";
        audioEl.load();
        audioEl = null;
      }
      if (audioBlobUrl) {
        try { URL.revokeObjectURL(audioBlobUrl); } catch (e) {}
        audioBlobUrl = null;
      }
    }

    mainCanvas.addEventListener("click", () => {
      if (state.activeIdx >= 0 && state.activeIdx < measures.length) {
        state.currentSec = measures[state.activeIdx].start_sec;
        drawMain();
      }
    });
    // Wheel over main = HI-SPEED nudge. Ctrl+wheel falls through to the
    // browser so the user can still page-scroll while reading. Wheel and
    // the key-zone slider/textbox are the same control; whichever moves
    // syncs the others through _syncHiSpeedDom().
    const HS_MIN = 0.5, HS_MAX = 5.0, HS_STEP = 1.05;
    function setHiSpeedFromUI(v, fromSlider) {
      const clamped = Math.max(HS_MIN, Math.min(HS_MAX, v));
      settings.hiSpeed = clamped;
      _syncHiSpeedDom(fromSlider);
      drawMain();
    }
    function _syncHiSpeedDom(fromSlider) {
      if (hsSliderEl && !fromSlider) hsSliderEl.value = String(settings.hiSpeed);
      if (hsInputEl) hsInputEl.value = settings.hiSpeed.toFixed(2);
    }
    mainCanvas.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? HS_STEP : 1 / HS_STEP;
      setHiSpeedFromUI((settings.hiSpeed || 1.0) * factor, false);
    }, { passive: false });
    if (hsSliderEl) {
      hsSliderEl.addEventListener("input", () => {
        const v = parseFloat(hsSliderEl.value);
        if (isFinite(v)) setHiSpeedFromUI(v, true);
      });
    }
    if (hsInputEl) {
      const commitInput = () => {
        const v = parseFloat(hsInputEl.value);
        if (isFinite(v)) setHiSpeedFromUI(v, false);
        else _syncHiSpeedDom(false);
      };
      hsInputEl.addEventListener("change", commitInput);
      hsInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { commitInput(); hsInputEl.blur(); }
        e.stopPropagation();
      });
    }
    _syncHiSpeedDom(false);
    // PORT_FIXUPS #1-E — per-tile click handlers removed. The queueWrap
    // pointerup handler now owns click-to-seek (with exact sec from
    // pointerToSec) so we don't double-handle clicks.

    // R7 — wire virtualization to queue scroll + resize. scroll fires often;
    // rAF-coalesce so we don't re-diff per pixel. Initial call seeds the
    // viewport before the first drawAll() so renderQueuePanelAt finds tiles.
    let _virtRaf = 0;
    function scheduleVirtUpdate() {
      if (_virtRaf) return;
      _virtRaf = requestAnimationFrame(() => {
        _virtRaf = 0;
        updateVirtualization();
      });
    }
    queueWrap.addEventListener("scroll", scheduleVirtUpdate, { passive: true });
    let _virtResizeObs = null;
    if (typeof ResizeObserver !== "undefined") {
      _virtResizeObs = new ResizeObserver(scheduleVirtUpdate);
      _virtResizeObs.observe(queueWrap);
    }
    function teardownVirtualization() {
      if (_virtRaf) { cancelAnimationFrame(_virtRaf); _virtRaf = 0; }
      if (_virtResizeObs) { try { _virtResizeObs.disconnect(); } catch (e) {} _virtResizeObs = null; }
      queueWrap.removeEventListener("scroll", scheduleVirtUpdate);
      for (const idx of Array.from(tilesPool.keys())) disposeTile(idx);
    }
    updateVirtualization();

    drawAll();

    return {
      draw: drawAll,
      play, pause, toggle, isPlaying,
      reset, seekToMeasure, seekToSec, destroy,
      hasAudio: !!audioEl,
      setOnPlayStateChange(fn) { onPlayStateChange = fn; },
      setOnMeasureChange(fn) { onMeasureChange = fn; },
      setOnJudgment(fn) { onJudgment = fn; },
      setOnAutoAdjust(fn) { onAutoAdjust = fn; },
      pressLane,
      releaseLane,
      getKeyMap() { return keyMapFor(mode); },
      getJudgmentWindows() { return Object.assign({}, JUDGMENT_WINDOWS); },
      // r12.1 — host needs the baseline so calibration can convert a
      // measured TOTAL latency into a user-residual judgeOffsetMs.
      getInputBaselineMs() { return INPUT_BASELINE_MS; },
      setSettings,
      getSettings() { return Object.assign({}, settings); },
      getSettingsDefaults() { return Object.assign({}, BEAM_DEFAULTS); },
      setLanePressed,
      setStats,
      clearLoop,
      setLoopState,
      setOnLoopChange(fn) { onLoopChange = fn; },
      setOnLoopWrap(fn) { onLoopWrap = fn; },
      setOnLaneSettingsChange(fn) { onLaneSettingsChange = fn; },   // R8-13
      setOnLaneModConfigRequested(fn) { onLaneModConfigRequested = fn; },   // R8-15
      getLaneMapping, setLaneMapping, rerollLaneMapping,                    // R8-15
      getLoop() { return loopState ? Object.assign({}, loopState) : null; },
      // R8-8: x-center (canvas CSS px) of the scratch~key lane area, excluding
      // the SP left rail. Mirrors drawMainScrolling's innerLeft/innerW math
      // so callers can overlay UI (e.g. the judgment popup) flush with the
      // playable lanes rather than the bare canvas geometry.
      getLaneCenterPx() {
        const w = currentMainW();
        const laneUnit = laneUnitForMainWidth(w);
        const lrw = effectiveRailWidth();
        const innerW = laneTotalWidth(layout, laneUnit, opts.p1p2GapPx);
        const innerLeft = lrw + Math.max(2, (w - lrw - innerW) / 2);
        return innerLeft + innerW / 2;
      },
      __getAudioEl() { return audioEl; },   // debug only
      __getSeekState() { return { audioSeekPending, audioSeekTargetChart }; },
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
    // r12.1 — module-level baseline so the host can subtract it during
    // calibration apply even before any chart is loaded (no view yet).
    INPUT_BASELINE_MS,
    encodeFileId,
    resolveAudioUrl,
  };
})(window);
