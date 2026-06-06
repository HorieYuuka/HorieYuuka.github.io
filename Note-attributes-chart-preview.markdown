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
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

/* Phase A — mockup color system + fonts. Scoped to .cp-dialog and its
   nested dialogs so the rest of the site is untouched. */
dialog.cp-dialog,
dialog.note-attrs-search-modal,
dialog.cp-settings-modal,
dialog.cp-lanemod-config-modal,
dialog.cp-keymap-modal,
dialog.cp-calib-modal {
  --cp-bg: #05070d;
  --cp-panel: #0c111c;
  --cp-panel-2: #0e1320;
  --cp-line: rgba(120,150,200,0.12);
  --cp-line-soft: rgba(120,150,200,0.07);
  --cp-text: #e8edf6;
  --cp-text-dim: #7c879a;
  --cp-text-mute: #4a5566;
  --cp-cyan: #34e0ff;
  --cp-cyan-dim: #1c6f86;
  --cp-judge-line: #ff3344;
  --cp-pg: #ffd23f;
  --cp-g: #37e58f;
  --cp-good: #56a8ff;
  --cp-bad: #ff7a45;
  --cp-miss: #ff3b5c;
  --cp-loop: #a78bfa;        /* Phase G — violet, reserved for loop boundaries */
  --cp-reset: #f0995a;       /* Reset button accent (orange) */
  --cp-font-ui: 'Chakra Petch', system-ui, sans-serif;
  --cp-font-mono: 'JetBrains Mono', monospace;
  font-family: var(--cp-font-ui);
}

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
  background: var(--cp-bg);
  color: var(--cp-text);
}
dialog.cp-dialog::backdrop { background: rgba(0,0,0,0.7); }
.cp-shell { display: flex; flex-direction: column; height: 100%; }

/* ── Top bar (Phase G) — identity row + transport row ───────────────── */
.cp-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--cp-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.014), transparent);
  flex: 0 0 auto;
  min-height: 50px;
}
.cp-tb-left  { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto; }
.cp-tb-right { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; }
.cp-badge-mode {
  font-family: var(--cp-font-mono); font-size: 11px; font-weight: 700;
  color: var(--cp-cyan);
  border: 1px solid rgba(52,224,255,0.40); border-radius: 5px;
  padding: 3px 8px; background: rgba(52,224,255,0.08);
  letter-spacing: .5px; flex: 0 0 auto;
}
.cp-badge-tier {
  font-family: var(--cp-font-mono); font-size: 11px; font-weight: 500;
  color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 5px;
  padding: 3px 8px; background: rgba(255,255,255,0.03);
  letter-spacing: .3px; flex: 0 0 auto; white-space: nowrap;
}
.cp-badge-tier[hidden] { display: none; }
.cp-title-name {
  font-size: 16px; font-weight: 700; letter-spacing: .2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 0 1 auto; max-width: 42ch;
}
.cp-meta-badges { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; overflow: hidden; }
.cp-mb {
  font-family: var(--cp-font-mono); font-size: 11px; font-weight: 500;
  color: var(--cp-text-dim);
  background: rgba(255,255,255,0.022);
  border: 1px solid var(--cp-line-soft); border-radius: 5px;
  padding: 3px 8px; letter-spacing: .3px; white-space: nowrap; flex: 0 0 auto;
}
.cp-mb b { color: var(--cp-g); font-weight: 500; }

.cp-transport-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--cp-line);
  flex: 0 0 auto;
}

/* Icon-only buttons */
.cp-btn { font-family: var(--cp-font-ui); }
/* SVG inside buttons must NOT swallow pointer events — otherwise click
   target lands on the path/svg and the button's click handler may not
   fire on certain browsers (esp. Play / Pick / Reset icon-only buttons). */
.cp-btn svg, .cp-btn span, .cp-btn kbd { pointer-events: none; }
.cp-btn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 32px; padding: 0; gap: 0;
  background: var(--cp-panel-2); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 7px; cursor: pointer;
  transition: .13s;
}
.cp-btn-icon:hover {
  background: #131a2a; border-color: rgba(120,150,200,0.3);
}
.cp-btn-icon:disabled { opacity: .4; cursor: not-allowed; }
.cp-btn-icon.cp-btn-pick { color: #cfe9ff; }
.cp-btn-icon.cp-btn-pick:hover { border-color: rgba(52,224,255,0.4); color: #fff; }
.cp-btn-icon.cp-btn-play {
  background: var(--cp-cyan); border-color: var(--cp-cyan); color: #031018;
  box-shadow: 0 0 0 1px rgba(52,224,255,0.3), 0 4px 14px -6px rgba(52,224,255,0.6);
}
.cp-btn-icon.cp-btn-play:hover:not(:disabled) {
  background: #5beaff; border-color: #5beaff;
}
.cp-btn-icon.cp-btn-play.is-playing {
  color: var(--cp-cyan); background: rgba(52,224,255,0.10); box-shadow: none;
}
.cp-btn-icon.cp-btn-reset { color: var(--cp-reset); }
.cp-btn-icon.cp-btn-reset:hover:not(:disabled) {
  color: #ffb274; border-color: rgba(240,153,90,0.45); background: #1a1410;
}
.cp-close .cp-x { font-size: 16px; line-height: 1; }

.cp-meta { color: var(--cp-text-dim); font-size: 0.85rem; font-family: var(--cp-font-mono); }
.cp-body { flex: 1 1 auto; overflow: hidden; display: flex; position: relative; }
.cp-host { flex: 1 1 auto; min-width: 0; min-height: 0; background: var(--cp-bg); display: flex; flex-direction: column; }

/* Sync-mode progress slider. Lives in its own thin bar between the
   controls row and the canvas body. Hidden until a chart is loaded
   (max stays at 0 in that state). */
.cp-progress {
  flex: 1 1 auto;
  margin: 0;
  accent-color: var(--cp-cyan);
  cursor: pointer;
  -webkit-appearance: none; appearance: none;
  height: 5px; border-radius: 3px;
  background: var(--cp-line);
}
.cp-progress::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: var(--cp-cyan); border: 2px solid #05121a;
  box-shadow: 0 0 10px rgba(52,224,255,0.7); cursor: pointer;
}
.cp-progress::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--cp-cyan); border: 2px solid #05121a;
  box-shadow: 0 0 10px rgba(52,224,255,0.7); cursor: pointer;
}
.cp-progress:disabled { opacity: .4; cursor: default; }
.cp-progress-time {
  font-family: var(--cp-font-mono); font-size: 13px;
  color: var(--cp-text-dim); white-space: nowrap;
  min-width: 11ch; text-align: right;
}
.cp-progress-time .cur { color: var(--cp-cyan); font-weight: 700; }

/* Play-mode UI — combo + judgment counts in the controls bar, judgment
   popup floats over the canvas. Color tokens come from the mockup palette. */
.cp-combo { font-family: var(--cp-font-mono); font-weight: 700; color: var(--cp-text); letter-spacing: -.3px; }
.cp-combo.is-zero { color: var(--cp-text-mute); }
.cp-counts { font-family: var(--cp-font-mono); font-size: 0.82rem; color: var(--cp-text-dim); }
.cp-counts .ct-PG   { color: var(--cp-pg); }
.cp-counts .ct-G    { color: var(--cp-g); }
.cp-counts .ct-Good { color: var(--cp-good); }
.cp-counts .ct-Bad  { color: var(--cp-bad); }
.cp-counts .ct-Miss { color: var(--cp-miss); }
/* R8-8: judgment popup relocated to ~30 px above the judgment line over the
   play canvas. Size halved (was 2.6rem). `left` + `bottom` are set inline
   by chart-preview.js to track the cp-field (play canvas) geometry per
   chart load + on window resize. The ±ms delta is a small sub-label that
   sits at the bottom-right corner of the verdict text. */
.cp-judgment {
  position: absolute;
  transform: translateX(-50%);
  font-family: var(--cp-font-ui); font-weight: 700; font-size: 1.3rem;
  text-shadow: 0 0 6px rgba(0,0,0,0.75), 0 0 12px rgba(0,0,0,0.5);
  letter-spacing: .3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;
  z-index: 5;
  display: inline-block;
  white-space: nowrap;
}
.cp-judgment.is-flash {
  opacity: 1;
  transform: translateX(-50%) scale(1.08);
}
.cp-judgment__label { display: inline-block; }
.cp-judgment__delta {
  position: absolute;
  right: -0.2em;
  bottom: -0.45em;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0;
  opacity: 0.8;
  text-shadow: 0 0 4px rgba(0,0,0,0.85);
}
/* R8-10: cinematic loop-standby countdown — circular progress ring around
   a 3/2/1 numeral. Visible only when standby > Instant. `left` is set
   inline by chart-preview.js to track the play-canvas lane center. */
.cp-loop-countdown {
  position: absolute;
  top: 45%;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* CSS class display wins over UA [hidden] without this — same trap that
   bit Play/Pause SVGs. Explicit attribute rule restores hide behaviour. */
.cp-loop-countdown[hidden] { display: none; }
.cp-loop-countdown__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.cp-loop-countdown__bg {
  fill: rgba(0,0,0,0.55);
  stroke: rgba(255,255,255,0.18);
  stroke-width: 4;
}
.cp-loop-countdown__fg {
  fill: none;
  stroke: var(--cp-cyan);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 289.027;
  stroke-dashoffset: 0;
  filter: drop-shadow(0 0 6px rgba(52,224,255,0.6));
}
.cp-loop-countdown__num {
  font-family: var(--cp-font-ui);
  font-weight: 700;
  font-size: 38px;
  color: #fff;
  text-shadow: 0 0 8px rgba(0,0,0,0.85);
  position: relative;
  z-index: 1;
  line-height: 1;
}
.cp-judgment.ct-PG   { color: var(--cp-pg);   text-shadow: 0 0 12px rgba(255,210,63,0.55); }
.cp-judgment.ct-G    { color: var(--cp-g);    text-shadow: 0 0 12px rgba(55,229,143,0.55); }
.cp-judgment.ct-Good { color: var(--cp-good); text-shadow: 0 0 12px rgba(86,168,255,0.55); }
.cp-judgment.ct-Bad  { color: var(--cp-bad);  text-shadow: 0 0 12px rgba(255,122,69,0.55); }
.cp-judgment.ct-Miss { color: var(--cp-miss); text-shadow: 0 0 12px rgba(255,59,92,0.55); }
.cp-keyhint { display: none; }   /* superseded by key zone caps */

/* ── Key zone (Phase B): fixed 126px panel anchored at the bottom of
   the main canvas wrapper. Layered above the canvas via absolute
   positioning so the renderer just stops drawing 3px above its top.
   Three stacked rows: keycaps / HI-SPEED / score strip. */
.cp-main-frame {
  position: relative;
  flex: 0 0 auto;
  background: #070a12;
  border-right: 1px solid var(--cp-line);
  box-shadow: inset 0 0 60px -30px rgba(52,224,255,0.25);
}
.cp-main-frame::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(52,224,255,0.10);
}
.cp-main-label {
  position: absolute; top: 8px; left: 10px; z-index: 2;
  font-family: var(--cp-font-ui);
  font-size: 9px; font-weight: 700; letter-spacing: 2.5px;
  color: var(--cp-cyan); opacity: .7;
  pointer-events: none;
}

/* Queue region (Phase J chrome) */
.cp-queue-region {
  display: flex; flex-direction: column;
  background: var(--cp-panel);
  min-width: 0;
}
.cp-queue-label {
  font-family: var(--cp-font-ui);
  font-size: 9px; font-weight: 700; letter-spacing: 2.5px;
  color: var(--cp-text-mute);
  padding: 8px 0 6px 14px;
  flex: 0 0 auto;
}
.cp-keyzone {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: var(--cp-keyzone-h);
  display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(8,11,18,0.5), #06080e 45%);
  border-top: 1px solid var(--cp-line);
  font-family: var(--cp-font-ui);
  user-select: none;
}
.cp-keycaps { display: flex; height: 48px; align-items: stretch; }
.cp-keycap {
  display: flex; align-items: center; justify-content: center;
  position: relative;
  border-right: 1px solid var(--cp-line-soft);
  transition: background .07s;
  flex-basis: 0;
}
.cp-keycap:last-child { border-right: none; }
.cp-kc-key {
  font-family: var(--cp-font-mono); font-size: 11px; font-weight: 600;
  color: var(--cp-text-dim); letter-spacing: .3px;
}
.cp-keycap.is-sc   .cp-kc-key { color: #e7a4ad; }
.cp-keycap.is-blue .cp-kc-key { color: #8fb8e8; }
.cp-keycap.is-pressed { background: rgba(52,224,255,0.18); }
.cp-keycap.is-pressed::before { box-shadow: 0 0 10px var(--cp-cyan); }
.cp-keycap.is-pressed .cp-kc-key { color: #fff; }

.cp-hispeed {
  display: flex; align-items: center; gap: 11px;
  height: 38px; padding: 0 12px;
  border-top: 1px solid var(--cp-line-soft);
  background: rgba(0,0,0,0.28);
}
.cp-hs-label {
  font-size: 9px; font-weight: 700; letter-spacing: 1.8px;
  color: var(--cp-text-mute); white-space: nowrap;
}
.cp-hs-slider {
  -webkit-appearance: none; appearance: none;
  flex: 1; height: 5px; border-radius: 3px;
  background: var(--cp-line); cursor: pointer;
  accent-color: var(--cp-cyan);
}
.cp-hs-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: var(--cp-cyan); border: 2px solid #06121a;
  box-shadow: 0 0 8px rgba(52,224,255,0.6); cursor: pointer;
}
.cp-hs-slider::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--cp-cyan); border: none;
  box-shadow: 0 0 8px rgba(52,224,255,0.6); cursor: pointer;
}
.cp-hs-box {
  display: flex; align-items: center; gap: 2px;
  border: 1px solid var(--cp-line); border-radius: 6px;
  background: var(--cp-panel); padding: 2px 4px 2px 8px;
}
.cp-hs-input {
  width: 44px; border: none; background: none; outline: none;
  font-family: var(--cp-font-mono); font-size: 15px; font-weight: 700;
  color: var(--cp-cyan); text-align: right;
}
.cp-hs-x { font-family: var(--cp-font-mono); font-size: 13px; color: var(--cp-text-dim); }

.cp-scorestrip {
  display: flex; align-items: center; gap: 14px;
  height: 40px; padding: 0 12px;
  border-top: 1px solid var(--cp-line-soft);
  background: rgba(0,0,0,0.38);
}
.cp-ss-combo {
  display: flex; flex-direction: column; align-items: center;
  line-height: 1; min-width: 46px;
}
.cp-ss-combo-num {
  font-family: var(--cp-font-mono); font-size: 20px; font-weight: 700;
  color: var(--cp-text); letter-spacing: -.5px;
}
.cp-ss-combo-num.is-zero { color: var(--cp-text-mute); }
.cp-ss-combo-label {
  font-size: 7.5px; font-weight: 600; letter-spacing: 1.5px;
  color: var(--cp-text-mute); margin-top: 1px;
}
.cp-ss-judges {
  display: flex; flex: 1; align-items: center;
  border-left: 1px solid var(--cp-line-soft); padding-left: 6px;
}
.cp-ss-judge {
  display: flex; flex: 1; flex-direction: column; align-items: center; gap: 1px;
}
.cp-ss-jl { font-size: 8px; font-weight: 700; letter-spacing: 1px; }
.cp-ss-jv { font-family: var(--cp-font-mono); font-size: 15px; font-weight: 700; color: var(--cp-text); }
.cp-ss-judge.ct-PG   .cp-ss-jl { color: var(--cp-pg); }
.cp-ss-judge.ct-G    .cp-ss-jl { color: var(--cp-g); }
.cp-ss-judge.ct-Good .cp-ss-jl { color: var(--cp-good); }
.cp-ss-judge.ct-Bad  .cp-ss-jl { color: var(--cp-bad); }
.cp-ss-judge.ct-Miss .cp-ss-jl { color: var(--cp-miss); }

/* DP 좌측 보조 컬럼 — 목업 `.cp-dp-aux` 변환 (PORT_FIXUPS r5b).
   r5-3 의 아케이드 카드 스타일은 디자이너가 명시한 mockup `.cp-dp-aux`
   디자인(테두리·배경 없음, 콘텐츠 하단 정렬)과 어긋나 폐기. */
.cp-dp-side {
  display: flex; flex-direction: column;
  justify-content: flex-end;          /* mockup: 콘텐츠 하단 정렬 */
  gap: 16px;
  padding: 18px 16px 24px;
  min-width: 0; box-sizing: border-box;
}
/* HI-SPEED — base `.cp-hispeed` 의 스트립 스타일(border-top / 어두운 bg /
   고정 38px / cursor ns-resize)을 DP 컬럼 안에서는 전부 무력화하고
   wrap 컨트롤로 노출. */
.cp-dp-side .cp-hispeed {
  border-top: none; background: none;
  height: auto; padding: 0;
  cursor: default;
  flex-wrap: wrap; gap: 8px;
}
.cp-dp-side .cp-hispeed .cp-hs-slider { width: 100%; }
/* 스코어 스트립 — 얇은 상단 디바이더만, 배경/높이/패딩 제거 */
.cp-dp-side .cp-scorestrip {
  border-top: 1px solid var(--cp-line-soft);
  background: none;
  height: auto; padding: 14px 0 0;
}

/* DP 키존: 캡만, 54px. base `.cp-keyzone` (126px) 를 덮어씀. */
.cp-keyzone.is-dp { height: 54px; }

/* DP 키존 중앙 갭: cap 7 ↔ cap 8 사이 1.3 weight 공백. 캔버스 중앙 기둥과 정렬. */
.cp-key-gap { align-self: stretch; }

/* PORT_FIXUPS #4 — empty state */
.cp-empty {
  position: absolute; inset: 0; z-index: 4;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(80% 60% at 50% 40%, rgba(10,18,34,0.6), rgba(5,7,13,0.85));
  backdrop-filter: blur(2px);
}
.cp-empty[hidden] { display: none; }
.cp-empty-card {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  max-width: 440px; padding: 0 24px;
}
.cp-empty-glyph {
  display: flex; align-items: flex-end; gap: 5px;
  height: 48px; margin-bottom: 22px; position: relative;
}
.cp-eg-bar {
  width: 9px; border-radius: 3px;
  background: linear-gradient(180deg, var(--cp-cyan), var(--cp-cyan-dim));
  box-shadow: 0 0 16px rgba(52,224,255,0.5);
  animation: cpEg 1.4s ease-in-out infinite;
}
.cp-eg-bar:nth-child(1) { height: 30px; animation-delay: 0s; }
.cp-eg-bar:nth-child(2) { height: 46px; animation-delay: .18s; }
.cp-eg-bar:nth-child(3) {
  height: 22px;
  background: linear-gradient(180deg, var(--cp-pg), #a8801f);
  box-shadow: 0 0 16px rgba(255,210,63,0.5);
  animation-delay: .36s;
}
.cp-eg-line {
  position: absolute; bottom: -6px; left: -8px; right: -8px;
  height: 2px; background: var(--cp-cyan);
  box-shadow: 0 0 10px var(--cp-cyan);
}
@keyframes cpEg {
  0%, 100% { transform: scaleY(.8); opacity: .8; }
  50% { transform: scaleY(1.05); opacity: 1; }
}
.cp-empty-card h2 {
  font-size: 24px; font-weight: 700; margin: 0 0 8px;
  line-height: 1.25;
}
.cp-empty-card p {
  font-size: 13.5px; color: var(--cp-text-dim);
  margin: 0 0 22px; line-height: 1.5;
}
.cp-empty-cta {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 14px; padding: 11px 20px;
}
.cp-empty-kbd {
  font-size: 10px; color: var(--cp-text-mute);
  border: 1px solid var(--cp-line); border-radius: 4px;
  padding: 2px 6px;
}
.cp-empty-quick {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  justify-content: center; margin-top: 24px;
}
.cp-empty-quick[hidden] { display: none; }
.cp-empty-quick-label {
  font-size: 10px; font-weight: 700; letter-spacing: 2px;
  color: var(--cp-text-mute);
}
.cp-quick-chip {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--cp-font-ui); font-size: 12px;
  color: var(--cp-text-dim);
  background: var(--cp-panel);
  border: 1px solid var(--cp-line); border-radius: 20px;
  padding: 6px 13px; cursor: pointer;
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cp-quick-chip:hover {
  color: var(--cp-text); border-color: rgba(52,224,255,0.4); background: #111826;
}

/* ── Loop band (Phase H) — violet overlay inside queueInner ─────────── */
.cp-loop-band {
  position: absolute; top: 0;
  background: rgba(167,139,250,0.12);
  border: 1px solid var(--cp-loop);
  border-radius: 4px;
  pointer-events: none;
  box-sizing: border-box;
  box-shadow: 0 0 0 1px rgba(167,139,250,0.25), 0 0 20px -6px rgba(167,139,250,0.4);
}
.cp-loop-playhead {
  position: absolute;
  background: var(--cp-judge-line);
  pointer-events: none;
  box-shadow: 0 0 5px var(--cp-judge-line);
}
.cp-loop-handle {
  position: absolute;
  background: var(--cp-loop);
  cursor: ew-resize;
  z-index: 3;
  border-radius: 2px;
  box-shadow: 0 0 6px rgba(167,139,250,0.6);
}
.cp-loop-handle.is-vertical { cursor: ns-resize; }
.cp-loop-tag {
  position: absolute;
  font-family: var(--cp-font-mono); font-size: 10px; font-weight: 700;
  color: #1a1226; background: var(--cp-loop);
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 1px;
  pointer-events: none;
  z-index: 4;
}
.cp-loop-x {
  position: absolute;
  width: 18px; height: 18px;
  border: 1px solid var(--cp-loop);
  background: rgba(167,139,250,0.15);
  color: var(--cp-loop);
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px; line-height: 14px; font-weight: 700;
  padding: 0;
  z-index: 4;
}
.cp-loop-x:hover { background: rgba(167,139,250,0.3); color: #fff; }

/* ============================================================================
   PORT_FIXUPS B.1 — chart-preview-static/styles.css (BEM + tokens).
   Source: C:\Repos\horieyuuka-file-api\chart-preview-static\styles.css
   Rules above (cp-main-frame, cp-keycaps, cp-ss-*, cp-dp-side, cp-loop-*,
   cp-tb-*, cp-btn-icon, etc.) stay until B.2/B.3 finish — once JS DOM uses
   BEM names below and the static markup is migrated, the old block can
   be deleted. cp-judgment popup + cp-empty + cp-settings-modal are custom
   to our port (not in spec) and are NOT migrated.
   ========================================================================== */

/* ---- spec token extensions (added to existing dialog-scoped block) ---- */
dialog.cp-dialog,
dialog.note-attrs-search-modal,
dialog.cp-settings-modal,
dialog.cp-lanemod-config-modal,
dialog.cp-keymap-modal,
dialog.cp-calib-modal {
  /* meaning-locked colour aliases */
  --cp-red:        #ff3344;
  --cp-gold:       #ffd23f;
  --cp-violet:     #a78bfa;
  --cp-violet-hi:  #c4b0ff;
  --cp-violet-ink: #04121a;
  --cp-green:      #37e58f;
  --cp-blue:       #56a8ff;
  --cp-orange:     #f0995a;
  --cp-orange-hi:  #ffb274;
  --cp-cyan-ink:   #031018;
  --cp-cyan-a08:   rgba(52,224,255,0.08);
  --cp-cyan-a18:   rgba(52,224,255,0.18);
  /* matte notes */
  --cp-note-white:   #d7dfeb;
  --cp-note-blue:    #2f80d8;
  --cp-note-scratch: #e23a55;
  --cp-cap-white:    #9aa6b8;
  /* surfaces */
  --cp-bg-2:      #080b12;
  --cp-field-bg:  #070a12;
  /* type sizes (label/xs/sm/md/lg + num scale) */
  --cp-fs-label:  9px;
  --cp-fs-xs:     11px;
  --cp-fs-sm:     13px;
  --cp-fs-md:     15px;
  --cp-fs-lg:     17px;
  --cp-fs-num-sm: 14px;
  --cp-fs-num-md: 15px;
  --cp-fs-num-lg: 20px;
  --cp-fs-num-xl: 26px;
  /* radius */
  --cp-r-sm:  4px;
  --cp-r-md:  6px;
  --cp-r-lg:  7px;
  --cp-r-pill: 20px;
  /* spacing scale */
  --cp-sp-1: 4px;
  --cp-sp-2: 7px;
  --cp-sp-3: 10px;
  --cp-sp-4: 12px;
  --cp-sp-5: 16px;
  --cp-sp-6: 18px;
  --cp-sp-7: 24px;
  /* layout invariants */
  --cp-topbar-h:      50px;
  --cp-main-w:        460px;
  --cp-main-w-min:    340px;
  --cp-keyzone-h:     135px;        /* SP: caps 3 + hi-speed 38 + lanemod 54 + score 40 */
  --cp-keyzone-h-dp:  3px;          /* DP: caps strip only */
  --cp-caps-h:        3px;
  --cp-hispeed-h:     38px;
  --cp-lanemod-h:     54px;         /* R8-13 — TWO chip rows stacked (LANE / VIEW) */
  --cp-score-h:       40px;
  --cp-sidepanel-w:   140px;
  --cp-scrollbar:     9px;
  --cp-sc-weight:     1.45;
  --cp-dp-gap-weight: 1.3;
  --cp-thumb:         14px;
  /* R8-26 — Layout CSS variable taxonomy.
     Two distinct categories share this :root block:
     (1) CONSTANTS — true single-source-of-truth design tokens. JS reads
         them via getComputedStyle / cssPxOf at init (+ on resize). Edit
         the CSS value and JS auto-syncs. Never written by JS at runtime.
     (2) RUNTIME MESSAGE BUS — transient state that the renderer/host
         writes to coordinate layout-dependent UI. NOT a design token;
         the initial value here is the boot default only. Codex flagged
         this as a layering smell (presentation tokens carrying runtime
         coordination). It works in practice but new vars should default
         to category (1) unless a clear inter-module signal is needed.
     ===================================================================
     CATEGORY 1 — constants (queue / keyzone / panel geometry)            */
  --cp-queue-label-h:        24px;  /* fixed height of cp-queue__label */
  --cp-queue-bottom-pad:     12px;  /* SP tile body's bottom breathing area */
  --cp-sp-scrollbar-reserve: 14px;  /* horizontal scrollbar gutter under SP queue */
  --cp-tile-vertical-h:      360px; /* DP queue tile height (fixed per tile) */
  --cp-dp-bottom-panel-h:    114px; /* cp-field__bottom in DP — 3 control rows */
  /* Keyzone heights are declared above (--cp-keyzone-h for SP, --cp-keyzone-h-dp
     for DP). JS reads them via getComputedStyle for popup positioning and
     renderer init. Do not redeclare. */
  /* CATEGORY 2 — runtime message bus (JS writes these per session/chart) */
  --cp-line-lift:            1px;   /* judgmentLineOffset, written on settings change */
  --cp-stage-h:              520px; /* cp-stage row height, written on init + ResizeObserver */
  /* elevation */
  --cp-glow-cyan:   0 0 10px rgba(52,224,255,0.7);
  --cp-glow-play:   0 0 0 1px rgba(52,224,255,0.3), 0 4px 16px -6px rgba(52,224,255,0.6);
  --cp-inset-field: inset 0 0 60px -30px rgba(52,224,255,0.25);
}

/* ===== top bar ===== */
.cp-topbar { display: flex; align-items: center; justify-content: space-between; gap: var(--cp-sp-5); padding: var(--cp-sp-2) var(--cp-sp-5); min-height: var(--cp-topbar-h); border-bottom: 1px solid var(--cp-line); background: linear-gradient(180deg, rgba(255,255,255,0.014), transparent); flex: 0 0 auto; }
.cp-topbar__left  { display: flex; align-items: center; gap: var(--cp-sp-3); min-width: 0; flex: 1; }
.cp-topbar__right { display: flex; align-items: center; gap: var(--cp-sp-2); flex: 0 0 auto; }
.cp-topbar__title { margin: 0; font-size: 14px !important; font-weight: 700; letter-spacing: .2px; color: #fff !important; flex: 0 0 auto; max-width: 42ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-topbar__title--dim { color: var(--cp-text-dim) !important; font-weight: 600; }

/* ===== badge ===== */
.cp-badge { font-family: var(--cp-font-mono); font-size: var(--cp-fs-xs); font-weight: 500; border: 1px solid var(--cp-line); border-radius: var(--cp-r-sm); padding: 3px var(--cp-sp-2); letter-spacing: .3px; white-space: nowrap; flex: 0 0 auto; background: rgba(255,255,255,0.03); color: var(--cp-text); }
.cp-badge--mode { font-weight: 700; color: var(--cp-cyan); border-color: rgba(52,224,255,0.4); background: var(--cp-cyan-a08); letter-spacing: .5px; }
.cp-badge[hidden] { display: none; }

/* ===== meta list ===== */
.cp-meta { display: flex; align-items: center; gap: var(--cp-sp-2); flex: 0 1 auto; overflow: hidden; min-width: 0; list-style: none; margin: 0; padding: 0; }
.cp-meta__item { font-family: var(--cp-font-mono); font-size: var(--cp-fs-xs); font-weight: 500; color: var(--cp-text-dim); background: rgba(255,255,255,0.022); border: 1px solid var(--cp-line-soft); border-radius: var(--cp-r-sm); padding: 3px var(--cp-sp-2); letter-spacing: .3px; white-space: nowrap; flex: 0 0 auto; }
.cp-meta__item--audio { color: var(--cp-text-dim); }
.cp-meta__item--audio b { color: var(--cp-green); }

/* ===== buttons ===== */
.cp-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--cp-sp-2); font-family: var(--cp-font-ui); font-size: var(--cp-fs-sm); font-weight: 600; color: var(--cp-text); background: var(--cp-panel-2); border: 1px solid var(--cp-line); border-radius: var(--cp-r-lg); padding: var(--cp-sp-2) var(--cp-sp-4); cursor: pointer; letter-spacing: .3px; transition: .13s; white-space: nowrap; }
.cp-btn:hover { border-color: rgba(120,150,200,0.3); background: #131a2a; }
.cp-btn:disabled { opacity: .4; cursor: not-allowed; }
.cp-btn svg { display: block; }
.cp-btn svg[hidden] { display: none; }
.cp-btn--icon  { padding: 0; width: 34px; height: 32px; gap: 0; }
.cp-btn--pick  { color: #cfe9ff; }
.cp-btn--pick:hover  { border-color: rgba(52,224,255,0.4); color: #fff; }
.cp-btn--ghost { color: var(--cp-text-dim); }
.cp-btn--ghost:hover { color: var(--cp-text); }
.cp-btn--play  { color: var(--cp-cyan-ink); background: var(--cp-cyan); border-color: var(--cp-cyan); font-weight: 700; box-shadow: var(--cp-glow-play); }
.cp-btn--play:hover:not(:disabled) { background: #5beaff; border-color: #5beaff; }
.cp-btn--play.is-playing { color: var(--cp-cyan); background: rgba(52,224,255,0.10); box-shadow: none; }
.cp-btn--reset { color: var(--cp-orange); }
.cp-btn--reset:hover:not(:disabled) { color: var(--cp-orange-hi); border-color: rgba(240,153,90,0.45); background: #1a1410; }
.cp-btn--close__x { font-size: 18px; line-height: 1; }

/* ===== progress (transport row) ===== */
.cp-progress__row { display: flex; align-items: center; gap: var(--cp-sp-2); padding: var(--cp-sp-2) var(--cp-sp-5); border-bottom: 1px solid var(--cp-line); flex: 0 0 auto; }
.cp-progress__bar { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; min-height: 36px; align-items: stretch; justify-content: center; position: relative; }
.cp-progress__density { width: 100%; display: block; }
.cp-progress__density--notes   { height: 6px; }
.cp-progress__density--scratch { height: 6px; }
.cp-progress__slider { width: 100%; flex: 0 0 auto; margin: 0; position: relative; z-index: 1; }
.cp-progress__slot { position: relative; width: 100%; flex: 0 0 auto; }
.cp-progress__loop { position: absolute; top: 0; bottom: 0; background: rgba(167,139,250,0.22); border: 1px solid rgba(167,139,250,0.5); border-radius: 3px; pointer-events: none; z-index: 3; }
.cp-progress__loop[hidden] { display: none; }
.cp-progress__loop-handle { position: absolute; top: 0; bottom: 0; width: 5px; background: var(--cp-violet); opacity: 0.45; cursor: ew-resize; pointer-events: auto; border-radius: 2px; }
.cp-progress__loop-handle--start { left: -2.5px; }
.cp-progress__loop-handle--end   { right: -2.5px; }
.cp-progress__loop-handle:hover  { opacity: 0.85; }
.cp-progress__time { font-family: var(--cp-font-mono); font-size: 12px; white-space: nowrap; display: flex; gap: var(--cp-sp-1); }
.cp-progress__cur { color: var(--cp-cyan); font-weight: 700; }
.cp-progress__tot { color: var(--cp-text-dim); }

/* ===== range (shared slider) ===== */
.cp-range { -webkit-appearance: none; appearance: none; height: 5px; border-radius: 3px; background: var(--cp-line); cursor: pointer; }
.cp-range::-webkit-slider-thumb { -webkit-appearance: none; width: var(--cp-thumb); height: var(--cp-thumb); border-radius: 50%; background: var(--cp-cyan); border: 2px solid #05121a; box-shadow: var(--cp-glow-cyan); cursor: pointer; }
.cp-range::-moz-range-thumb { width: var(--cp-thumb); height: var(--cp-thumb); border-radius: 50%; background: var(--cp-cyan); border: none; box-shadow: var(--cp-glow-cyan); cursor: pointer; }
.cp-range:disabled { opacity: .4; cursor: default; }

/* ===== stage ===== */
.cp-stage { flex: 1; display: flex; gap: 0; min-height: 0; position: relative; }
/* r12.5 — Right column intentionally empty (the queue moved here from the
   left in r12.6; the LEFT cell now plays the placeholder role). Future
   replacement content can drop a child with grid-area: aux into the
   cp-stage--dp later. */
.cp-stage--dp { display: grid; grid-template-columns: 1fr 2fr 1fr; grid-template-rows: 1fr; grid-template-areas: "aux field queue"; }

/* ===== DP cp-field bottom panel — Row1 LANE, Row2 VIEW, Row3 HS+JUDGE. ===== */
/* Height matches DP_BOTTOM_PANEL_H in chart-renderer.js so the queueWrap
   alignment math stays in sync. Total = padding-y(16) + row1(22) + gap(7)
   + row2(22) + gap(7) + row3(40) = 114. Rows take their content height
   (no flex:1) so chips are not vertically padded by row stretch — SP-style
   tight packing. */
.cp-field__bottom { display: flex; flex-direction: column; gap: var(--cp-sp-2); padding: var(--cp-sp-3) var(--cp-sp-4); border-top: 1px solid var(--cp-line); background: var(--cp-bg-2); height: var(--cp-dp-bottom-panel-h); box-sizing: border-box; flex: 0 0 auto; }
.cp-dp-bottom__row { flex: 0 0 auto; min-height: 0; }
/* Row 1 / 2: 3-column grid [1P group | central caption | 2P group]. The
   caption sits in the middle column so it visually aligns with the centre
   pillar in the play canvas. Groups stretch to fill their columns so the
   chips can grow to the column width (chip flex:1 inside the group). */
.cp-dp-bottom__row--lane, .cp-dp-bottom__row--view { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--cp-sp-3); }
.cp-dp-bottom__row--lane > .cp-lanemod__group, .cp-dp-bottom__row--view > .cp-lanemod__group { justify-self: stretch; min-width: 0; }
.cp-dp-bottom__row--lane .cp-lanemod__caption, .cp-dp-bottom__row--view .cp-lanemod__caption { display: none; }
.cp-dp-bottom__caption { font-size: var(--cp-fs-label); font-weight: 700; letter-spacing: 2px; color: var(--cp-text-mute); text-align: center; padding: 0 var(--cp-sp-2); }
/* Row 3: HI-SPEED + JUDGE INDICATOR with 1:1 column ratio. */
.cp-dp-bottom__row--hs-judge { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: var(--cp-sp-4); }

/* ===== field ===== */
.cp-field { position: relative; flex: 0 0 auto; width: clamp(var(--cp-main-w-min), 30vw, var(--cp-main-w)); border-right: 1px solid var(--cp-line); background: var(--cp-field-bg); box-shadow: var(--cp-inset-field); }
.cp-field::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 1px rgba(52,224,255,0.1); }
/* R8-26 — SUD+ overlay. Solid black panel that masks the top portion of
   the play area so notes only appear close to the judgment line. Height
   controlled per-session via --cp-sudplus-h CSS variable. 0 = disabled.
   Bottom edge accent built into the gradient (no border-bottom) so when
   height is 0 there's no stray 1 px line at the top. */
.cp-field::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0;
  height: var(--cp-sudplus-h, 0);
  background:
    linear-gradient(180deg, #04070d 0%, #04070d calc(100% - 2px),
                    rgba(52,224,255,0.22) calc(100% - 1px), rgba(52,224,255,0) 100%);
  pointer-events: none; z-index: 4;
}
/* R8-26 — SUD+ live value tip. Floats at the centre of the panel's
   bottom edge while the user wheels / drags the slider, then fades out
   after 1 s. White mono 10 px. */
.cp-sudplus-tip {
  position: absolute; left: 50%; top: var(--cp-sudplus-h, 0);
  transform: translate(-50%, -50%);
  pointer-events: none; z-index: 5;
  font-family: var(--cp-font-mono); font-size: 10px;
  color: #fff; background: rgba(0,0,0,0.55);
  padding: 1px 5px; border-radius: 3px; white-space: nowrap;
  opacity: 0; transition: opacity 200ms ease;
}
.cp-sudplus-tip.is-on { opacity: 1; }
.cp-field__label { position: absolute; top: var(--cp-sp-2); left: var(--cp-sp-3); z-index: 2; font-size: var(--cp-fs-label); font-weight: 700; letter-spacing: 2.5px; color: var(--cp-cyan); opacity: .7; pointer-events: none; }
.cp-field__canvas { width: 100%; height: 100%; display: block; }
.cp-stage--dp .cp-field { grid-area: field; width: 100%; min-width: 0; min-height: 0; border-left: 1px solid var(--cp-line); display: flex; flex-direction: column; }
/* DP play area wraps canvas + keyzone strip so cp-field__bottom can sit
   below them as a sibling flex item without the absolute canvas overlapping. */
.cp-field__play { position: relative; flex: 1; min-height: 0; }
.cp-stage--dp .cp-field__label { display: none; }

/* ===== keyzone (BEM modifiers — co-exist with legacy `.cp-keyzone.is-dp` until cleanup) ===== */
.cp-keyzone--dp { height: var(--cp-keyzone-h-dp); }
.cp-keyzone__caps { display: flex; height: var(--cp-caps-h); align-items: stretch; }
.cp-keycap--scratch { background: var(--cp-note-scratch); flex-grow: var(--cp-sc-weight); }
.cp-keycap--white   { background: var(--cp-cap-white); }
.cp-keycap--blue    { background: var(--cp-blue); }
.cp-keycap--pressed { box-shadow: 0 0 6px rgba(52,224,255,0.55); }
.cp-keycap-gap { flex: var(--cp-dp-gap-weight) 1 0; }

/* ===== hi-speed (BEM child classes; .cp-hispeed itself defined above) ===== */
.cp-hispeed__label { font-size: var(--cp-fs-label); font-weight: 700; letter-spacing: 1.8px; color: var(--cp-text-mute); white-space: nowrap; }
.cp-hispeed__slider { flex: 1; }

/* ===== numeric stepper box ===== */
.cp-numbox { display: flex; align-items: center; gap: 2px; border: 1px solid var(--cp-line); border-radius: var(--cp-r-md); background: var(--cp-bg-2); padding: 2px var(--cp-sp-1) 2px var(--cp-sp-2); }
.cp-numbox__input { width: 44px; border: none; background: none; outline: none; font-family: var(--cp-font-mono); font-size: var(--cp-fs-md); font-weight: 700; color: var(--cp-cyan); text-align: right; }
.cp-numbox__unit { font-family: var(--cp-font-mono); font-size: var(--cp-fs-xs); color: var(--cp-text-dim); }
.cp-numbox__chev { display: flex; flex-direction: column; margin-left: 1px; }
.cp-numbox__chev button { border: none; background: none; color: var(--cp-text-dim); font-size: 7px; line-height: 8px; padding: 0 2px; cursor: pointer; }
.cp-numbox__chev button:hover { color: var(--cp-cyan); }

/* R8-11: just-the-docs (.main-content ul > li::before { content: "•" } plus
   padding-left: 1.5em + margin-top: 0.5em on ul) leaks into our dialogs and
   stamps a grey "•" between the judge label and value inside .cp-score__judges,
   while also shoving the strip rightward by 1.5em. Neutralize the theme rules
   for any list nested under our dialogs. */
.cp-dialog ul, .cp-dialog ol,
.cp-settings-modal ul, .cp-settings-modal ol {
  margin: 0;
  padding-left: 0;
}
.cp-dialog ul > li::before,
.cp-dialog ol > li::before,
.cp-settings-modal ul > li::before,
.cp-settings-modal ol > li::before {
  content: none;
  display: none;
}

/* ===== R8-13 lanemod chip row (under hi-speed) =====
   Two chip radio groups stacked, one per row: LANE (OFF/RANDOM/R-RANDOM/
   MIRROR) and VIEW (OFF/SCR-Only/KEY-Only). Within a row the caption is
   fixed-width and the chips share the remaining space with `flex: 1`, so
   columns align across both rows regardless of label length. Cyan outline
   when unselected; cyan fill + dark text when active. */
.cp-lanemod { display: flex; flex-direction: column; gap: var(--cp-sp-2); height: var(--cp-lanemod-h); padding: 4px var(--cp-sp-4); border-top: 1px solid var(--cp-line-soft); font-family: var(--cp-font-ui); }
.cp-lanemod__group { display: flex; align-items: center; gap: var(--cp-sp-2); flex: 1; min-width: 0; }
.cp-lanemod__caption { flex: 0 0 56px; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; color: var(--cp-text-mute); }
.cp-lanemod__chip { flex: 1; display: inline-flex; align-items: center; justify-content: center; position: relative; height: 20px; padding: 0 6px; border: 1px solid rgba(52,224,255,0.55); border-radius: 5px; background: transparent; color: var(--cp-cyan); font-size: 9px; font-weight: 700; letter-spacing: 0.8px; cursor: pointer; line-height: 1; user-select: none; transition: background 90ms ease-out, color 90ms ease-out, box-shadow 90ms ease-out; min-width: 0; white-space: nowrap; }
.cp-lanemod__chip:hover { box-shadow: 0 0 6px rgba(52,224,255,0.35); }
.cp-lanemod__chip > input { position: absolute; opacity: 0; pointer-events: none; }
.cp-lanemod__chip--active { background: var(--cp-cyan); color: #06080e; box-shadow: 0 0 8px rgba(52,224,255,0.5); }
.cp-lanemod__chip--off    { /* OFF chip — slightly muted cyan when inactive to read as a reset, not a peer mod */ border-color: rgba(168,184,200,0.45); color: var(--cp-text-mute); }
.cp-lanemod__chip--off.cp-lanemod__chip--active { background: var(--cp-text-mute); color: #06080e; box-shadow: 0 0 6px rgba(168,184,200,0.4); }
.cp-lanemod__sep { display: none; }   /* legacy `|` separator killed — rows do the splitting now */
/* R8-15 gear button inside RANDOM / R-RANDOM chips — placeholder style.
   Sits next to the label, transparent until hover. Click stops propagation
   (handled in JS) so it doesn't toggle the radio. Final look to be tuned
   together with the user. */
.cp-lanemod__chip-label { display: inline-block; }
/* Gear only appears when its chip is active — re-rolling / manual setting
   only makes sense for the currently-applied mod. */
.cp-lanemod__gear {
  display: none;
  align-items: center; justify-content: center;
  margin-left: 4px;
  width: 14px; height: 14px;
  padding: 0; border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  opacity: 0.8;
  border-radius: 3px;
}
.cp-lanemod__chip--active .cp-lanemod__gear { display: inline-flex; color: #06080e; }
.cp-lanemod__gear:hover { opacity: 1; background: rgba(0,0,0,0.18); }

/* R8-15 — Lane config modal. Minimal scaffolding so the UI is usable;
   the visual polish (colours, spacing, layout for the per-lane mapping
   editor) gets dialled in together with the user. */
/* Aligned with cp-settings-modal — opaque panel bg, soft border, same head/body layout. */
dialog.cp-lanemod-config-modal {
  width: 370px; max-width: 90vw;
  padding: 0;
  background: var(--cp-panel); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 8px;
}
dialog.cp-lanemod-config-modal::backdrop { background: rgba(0,0,0,0.25); }
.cp-lanemod-config-shell { display: flex; flex-direction: column; }
.cp-lanemod-config-head  {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid var(--cp-line);
}
.cp-lanemod-config-head  strong { font-size: 0.95rem; letter-spacing: .3px; color: var(--cp-cyan); }
.cp-lanemod-config-head  button {
  background: transparent; border: 1px solid var(--cp-line); color: var(--cp-text);
  border-radius: 5px; padding: 0.15rem 0.55rem; font-size: 0.85rem; cursor: pointer;
  font-family: var(--cp-font-ui);
}
.cp-lanemod-config-body  {
  padding: 0.7rem 0.9rem; display: flex; flex-direction: column; gap: 0.65rem;
  font-size: 0.88rem;
}
.cp-lanemod-config-row   { display: flex; align-items: center; gap: 0.5rem; }
/* Draggable number chips — the displayed permutation IS the editor.
   Mouse drag-reorders within the strip; the change applies on drop. */
.cp-lanemod-config-chips {
  flex: 1; display: flex; align-items: center; gap: 4px;
  padding: 4px; border: 1px solid var(--cp-line); border-radius: 5px;
  background: var(--cp-panel-2);
  min-height: 28px;
}
.cp-lanemod-config-chip {
  flex: 1; display: inline-flex; align-items: center; justify-content: center;
  height: 22px;
  border: 1px solid rgba(52,224,255,0.35); border-radius: 4px;
  background: rgba(52,224,255,0.06);
  color: var(--cp-cyan);
  font-family: var(--cp-font-mono); font-size: 0.85rem; font-weight: 700;
  cursor: grab; user-select: none;
}
.cp-lanemod-config-chip.is-dragging { opacity: 0.4; cursor: grabbing; }
.cp-lanemod-config-chip--readonly { cursor: default; opacity: 0.85; }
.cp-lanemod-config-chips--locked .cp-lanemod-config-chip { cursor: default; }
/* Manual entry textbox — empty input falls back to the chip strip's current
   state on Apply; focus gets a cyan-tinted ring. */
.cp-lanemod-config-input {
  flex: 1;
  background: var(--cp-panel-2); border: 1px solid var(--cp-line); color: var(--cp-text);
  padding: 0.3rem 0.5rem; font-family: var(--cp-font-mono); font-size: 0.88rem;
  border-radius: 5px; outline: none;
  transition: border-color 120ms ease-out, box-shadow 120ms ease-out;
}
.cp-lanemod-config-input::placeholder { color: var(--cp-text-dim); }
.cp-lanemod-config-input:focus { border-color: var(--cp-cyan); box-shadow: 0 0 0 2px rgba(52,224,255,0.25); }
/* R-RANDOM uses the existing cp-numbox shell; raise the focus halo to the
   shell since the inner input is borderless. Scoped to the modal so the
   Hi-Speed numbox in the keyzone is unaffected. */
.cp-lanemod-config-modal .cp-numbox { transition: border-color 120ms ease-out, box-shadow 120ms ease-out; }
.cp-lanemod-config-modal .cp-numbox:focus-within { border-color: var(--cp-cyan); box-shadow: 0 0 0 2px rgba(52,224,255,0.25); }
/* Inline action buttons (Re-roll, Apply) — same shape as cp-settings-foot button. */
.cp-lanemod-config-row button.cp-lanemod-config-btn {
  background: var(--cp-panel-2); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 5px;
  padding: 0.3rem 0.7rem; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.5px;
  cursor: pointer; font-family: var(--cp-font-ui);
  white-space: nowrap;
}
.cp-lanemod-config-row button.cp-lanemod-config-btn:hover { background: #131a2a; border-color: var(--cp-cyan); color: var(--cp-cyan); }
.cp-lanemod-config-shift-label { color: var(--cp-text-dim); font-size: 0.8rem; letter-spacing: 0.5px; flex: 0 0 auto; }
/* R-RANDOM left/right shift chevrons — flank the chip strip in a single row. */
.cp-lanemod-config-chev {
  flex: 0 0 auto;
  width: 36px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--cp-line); border-radius: 5px;
  background: var(--cp-panel-2); color: var(--cp-cyan);
  font-size: 0.85rem; line-height: 1; cursor: pointer;
  font-family: var(--cp-font-ui);
}
.cp-lanemod-config-chev:hover { border-color: var(--cp-cyan); background: rgba(52,224,255,0.08); }
.cp-lanemod-config-chev:active { background: rgba(52,224,255,0.18); }

/* ===== r12 — Input latency calibration sub-dialog =====
   Stacks over the keymap modal. Canvas draws the falling-note
   animation via rAF; the host JS measures event.timeStamp minus the
   note's expected hit moment and applies the median to judgeOffsetMs. */
dialog.cp-calib-modal {
  width: 460px; max-width: 95vw;
  padding: 0;
  background: var(--cp-panel); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 8px;
  /* Sit above the keymap modal — native dialog stacking treats whichever
     calls .showModal() last as topmost, but an explicit z-index avoids
     reflow surprises if the keymap modal is later restructured. */
  z-index: 50;
}
dialog.cp-calib-modal::backdrop { background: rgba(0,0,0,0.45); }
.cp-calib__shell { display: flex; flex-direction: column; }
.cp-calib__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid var(--cp-line);
}
.cp-calib__head strong { font-size: 0.95rem; letter-spacing: .3px; color: var(--cp-cyan); }
.cp-calib__close {
  background: transparent; border: 1px solid var(--cp-line); color: var(--cp-text);
  border-radius: 5px; padding: 0.15rem 0.55rem; font-size: 0.85rem; cursor: pointer;
  font-family: var(--cp-font-ui); line-height: 1;
}
.cp-calib__close:hover { border-color: var(--cp-red); color: var(--cp-red); }
.cp-calib__hint {
  margin: 0; padding: 0.55rem 0.9rem;
  font-size: 0.82rem; line-height: 1.4; color: var(--cp-text-dim);
}
.cp-calib__hint kbd {
  background: var(--cp-panel-2); border: 1px solid var(--cp-line);
  border-radius: 4px; padding: 1px 5px; font-family: var(--cp-font-mono);
  font-size: 0.78rem; color: var(--cp-text);
}
.cp-calib__stage {
  display: grid; grid-template-columns: 240px 1fr; gap: 0.9rem;
  padding: 0.55rem 0.9rem 0.9rem;
}
.cp-calib__canvas {
  width: 240px; height: 320px;
  background: #04070d; border: 1px solid var(--cp-line); border-radius: 5px;
  display: block;
}
.cp-calib__status {
  display: flex; flex-direction: column; gap: 0.4rem;
  font-size: 0.85rem; font-family: var(--cp-font-mono);
}
.cp-calib__status-row {
  display: flex; justify-content: space-between; gap: 0.6rem;
  padding: 0.25rem 0.35rem; border-bottom: 1px dashed rgba(120,150,200,0.15);
  /* r12.4 — long suggest breakdown ("-20 ms (= -120 ms − baseline -100 ms)")
     can overflow the narrow 240 px status column; allow wrap so the value
     drops to a second line instead of pushing the label out of frame. */
  flex-wrap: wrap;
}
.cp-calib__status-row span:first-child { color: var(--cp-text-dim); }
.cp-calib__status-row span:last-child  { color: var(--cp-cyan); font-weight: 700; text-align: right; flex: 0 1 auto; min-width: 0; }
.cp-calib__hist {
  margin-top: 0.4rem; height: 64px;
  background: var(--cp-panel-2); border: 1px solid var(--cp-line); border-radius: 4px;
  position: relative; overflow: hidden;
}
/* Centre line — the "perfect timing" reference at delta=0. */
.cp-calib__hist::before {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%;
  width: 1px; background: rgba(52,224,255,0.35);
}
.cp-calib__hist-dot {
  position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: var(--cp-cyan); box-shadow: 0 0 4px rgba(52,224,255,0.7);
  transform: translate(-50%, -50%);
}
.cp-calib__hist-dot--reject { background: var(--cp-red); box-shadow: 0 0 4px rgba(255,68,76,0.6); opacity: 0.55; }
.cp-calib__actions {
  display: flex; justify-content: flex-end; gap: 0.5rem;
  padding: 0.55rem 0.9rem; border-top: 1px solid var(--cp-line);
}
.cp-calib__btn {
  background: var(--cp-panel-2); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 5px;
  padding: 0.35rem 0.85rem; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.5px;
  cursor: pointer; font-family: var(--cp-font-ui);
}
.cp-calib__btn:hover:not(:disabled) { background: #131a2a; border-color: var(--cp-cyan); color: var(--cp-cyan); }
.cp-calib__btn:disabled { opacity: 0.4; cursor: default; }
.cp-calib__btn--primary { border-color: rgba(52,224,255,0.5); color: var(--cp-cyan); }
.cp-calib__btn--apply   { border-color: rgba(106,255,176,0.5); color: #6affb0; }
.cp-calib__btn--apply:hover:not(:disabled) { background: rgba(106,255,176,0.08); border-color: #6affb0; color: #6affb0; }

/* ===== R8-24 Key Mapping modal — IIDX DP (1P/2P symmetric) ===== */
dialog.cp-keymap-modal {
  width: 800px; max-width: 95vw;
  padding: 0;
  background: var(--cp-panel); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 8px;
}
dialog.cp-keymap-modal::backdrop { background: rgba(0,0,0,0.3); }
.cp-keymap__shell { display: flex; flex-direction: column; position: relative; }
.cp-keymap__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid var(--cp-line);
}
.cp-keymap__head strong { font-size: 0.95rem; letter-spacing: .3px; color: var(--cp-cyan); }
.cp-keymap__head-actions { display: flex; align-items: center; gap: 0.5rem; }
.cp-keymap__hid-status {
  font-family: var(--cp-font-mono); font-size: 0.72rem; letter-spacing: 0.5px;
  padding: 0.18rem 0.5rem; border-radius: 999px;
  border: 1px solid var(--cp-line);
  background: rgba(0,0,0,0.25);
  display: inline-flex; align-items: center; gap: 6px;
  /* Flexbox shrink behavior — pill survives long device names by allowing
     internal labels to ellipsis. min-width:0 unlocks shrink past content. */
  min-width: 0;
  flex-shrink: 1;
  max-width: 100%;
}
.cp-keymap__hid-status[data-state="off"] { color: var(--cp-text-dim); }
.cp-keymap__hid-status[data-state="on"]  {
  color: #6affb0; border-color: rgba(106,255,176,0.4);
  text-shadow: 0 0 6px rgba(106,255,176,0.35);
}
.cp-keymap__hid-dot { color: #6affb0; line-height: 1; }
.cp-keymap__hid-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 0 2px;
  min-width: 0;        /* allow shrink */
}
.cp-keymap__hid-chip + .cp-keymap__hid-chip {
  border-left: 1px solid rgba(106,255,176,0.25);
  padding-left: 6px; margin-left: 2px;
}
.cp-keymap__hid-chip-label {
  color: inherit;
  max-width: 18ch;     /* ~"Controller INF&BMS" fits; long names truncate */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
}
.cp-keymap__hid-chip-close {
  background: transparent; border: none; color: var(--cp-text-dim);
  cursor: pointer; padding: 0 2px; font-size: 0.95rem; line-height: 1;
  font-family: inherit; text-shadow: none;
  transition: color 120ms;
}
.cp-keymap__hid-chip-close:hover { color: var(--cp-red); }
.cp-keymap__head-btn {
  background: transparent; border: 1px solid var(--cp-line); color: var(--cp-text);
  border-radius: 5px; padding: 0.15rem 0.55rem; font-size: 0.82rem; cursor: pointer;
  font-family: inherit;
}
.cp-keymap__head-btn:hover { border-color: var(--cp-cyan); color: var(--cp-cyan); }
.cp-keymap__head-btn:disabled {
  opacity: 0.4; cursor: not-allowed;
  border-color: var(--cp-line); color: var(--cp-text-dim);
}
.cp-keymap__head-btn:disabled:hover {
  border-color: var(--cp-line); color: var(--cp-text-dim);
}
.cp-keymap__head-btn--close { padding: 0.15rem 0.5rem; line-height: 1; }

/* Capture overlay — covers the shell while a pad is awaiting input. */
.cp-keymap__capture-overlay {
  position: absolute; inset: 0;
  background: rgba(2,4,10,0.82); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 5;
}
.cp-keymap__capture-overlay[hidden] { display: none; }
.cp-keymap__capture-card {
  background: var(--cp-panel-2);
  border: 1px solid var(--cp-cyan);
  border-radius: 8px;
  padding: 1.2rem 1.8rem;
  text-align: center;
  box-shadow: 0 0 22px rgba(52,224,255,0.25);
  min-width: 240px;
}
.cp-keymap__capture-line {
  margin: 0; font-family: var(--cp-font-mono);
  font-size: 0.78rem; letter-spacing: 1px; color: var(--cp-text-dim);
}
.cp-keymap__capture-line--hint { margin-top: 0.6rem; }
.cp-keymap__capture-line kbd {
  background: rgba(0,0,0,0.45); border: 1px solid var(--cp-line);
  border-radius: 4px; padding: 0.05rem 0.3rem; font-size: 0.72rem;
  color: var(--cp-text);
}
.cp-keymap__capture-target {
  margin: 0.35rem 0 0; font-family: var(--cp-font-mono);
  font-size: 1.25rem; font-weight: 800; color: var(--cp-cyan);
  letter-spacing: 2px;
}
.cp-keymap__body {
  padding: 0.8rem 1rem 1rem;
  display: flex; flex-direction: column; gap: 0.7rem;
}
.cp-keymap__hint { margin: 0; font-size: 0.82rem; color: var(--cp-text); }
.cp-keymap__hint--dim { color: var(--cp-text-dim); font-size: 0.75rem; font-style: italic; }

/* SVG stage — IIDX DP layout (mirror-symmetric) */
.cp-keymap__stage {
  padding: 0.6rem 0.4rem;
  background: linear-gradient(180deg, #06080e 0%, #02040a 100%);
  border: 1px solid var(--cp-line);
  border-radius: 6px;
}
.cp-keymap__svg { width: 100%; height: auto; display: block; }

/* turntable — record-on-cabinet aesthetic */
.cp-keymap__sc { transition: filter 140ms; }
.cp-keymap__sc-rim    { fill: #1c2230; stroke: rgba(140,160,190,0.45); stroke-width: 1.4; }
.cp-keymap__sc-bezel  { fill: #0e131e; stroke: rgba(120,150,200,0.2); stroke-width: 0.6; }
.cp-keymap__sc-vinyl  { stroke: rgba(255,51,68,0.45); stroke-width: 0.8; }
.cp-keymap__sc-groove { fill: none; stroke: rgba(140,160,190,0.08); stroke-width: 0.5; }
.cp-keymap__sc-label-bg    { stroke: rgba(255,255,255,0.12); stroke-width: 0.6; }
.cp-keymap__sc-label-inner { fill: rgba(0,0,0,0.18); }
.cp-keymap__sc-label {
  fill: #fff; font-family: var(--cp-font-mono); font-size: 13px;
  font-weight: 800; text-anchor: middle; letter-spacing: 2px;
}
.cp-keymap__sc-spindle { fill: #02040a; stroke: rgba(255,255,255,0.15); stroke-width: 0.4; }
.cp-keymap__sc-notch { stroke: rgba(255,255,255,0.55); stroke-width: 1.5; stroke-linecap: round; }
.cp-keymap__sc-side {
  fill: var(--cp-text-dim); font-family: var(--cp-font-mono);
  font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-anchor: middle;
}
.cp-keymap__sc.is-selected .cp-keymap__sc-rim   { stroke: var(--cp-cyan); stroke-width: 2.2; }
.cp-keymap__sc.is-selected .cp-keymap__sc-bezel { stroke: var(--cp-cyan); }
.cp-keymap__sc.is-selected { filter: drop-shadow(0 0 10px rgba(52,224,255,0.55)); }
/* R8-26 — half-rim emphasis. The disc is decorative; CW (left) and CCW
   (right) are independent click zones, each with its own rim arc + arrow. */
.cp-keymap__sc-half { cursor: pointer; }
.cp-keymap__sc-half-rim {
  stroke: rgba(255,75,90,0.45); stroke-width: 2.5; stroke-linecap: round;
  transition: stroke 140ms, stroke-width 140ms, filter 140ms;
}
.cp-keymap__sc-half:hover .cp-keymap__sc-half-rim {
  stroke: var(--cp-cyan); stroke-width: 3;
  filter: drop-shadow(0 0 6px rgba(52,224,255,0.7));
}
.cp-keymap__sc-half.is-pressing .cp-keymap__sc-half-rim {
  stroke: var(--cp-cyan); stroke-width: 4;
  filter: drop-shadow(0 0 12px rgba(52,224,255,0.95));
}
.cp-keymap__sc-arrow {
  fill: rgba(255,255,255,0.5);
  font-family: var(--cp-font-mono); font-size: 14px; font-weight: 700;
  text-anchor: middle; dominant-baseline: middle;
  transition: fill 140ms;
}
.cp-keymap__sc-half:hover .cp-keymap__sc-arrow,
.cp-keymap__sc-half.is-pressing .cp-keymap__sc-arrow {
  fill: var(--cp-cyan);
}

/* keys — gradient-shaded for slight 3D feel */
.cp-keymap__key { cursor: pointer; transition: filter 120ms; }
.cp-keymap__key:hover { filter: drop-shadow(0 0 6px rgba(52,224,255,0.7)); }
.cp-keymap__key rect { stroke-width: 0.8; }
.cp-keymap__key--white rect { stroke: rgba(232,237,246,0.8); }
.cp-keymap__key--blue  rect { stroke: rgba(120,170,235,0.9); }
.cp-keymap__key-label {
  fill: #06080e; font-family: var(--cp-font-mono);
  font-size: 13px; font-weight: 700; text-anchor: middle;
}
.cp-keymap__key.is-selected rect {
  stroke: var(--cp-cyan); stroke-width: 2.5;
}
.cp-keymap__key.is-selected { filter: drop-shadow(0 0 8px rgba(52,224,255,0.7)); }
/* R8-25 live-press feedback — cyan halo + brighten while bound input is held */
.cp-keymap__key.is-pressing rect {
  stroke: var(--cp-cyan); stroke-width: 3;
  filter: brightness(1.25);
}
.cp-keymap__key.is-pressing { filter: drop-shadow(0 0 14px rgba(52,224,255,0.95)); }

/* centre 1P / 2P seam */
.cp-keymap__divider { stroke: rgba(120,150,200,0.18); stroke-width: 1; stroke-dasharray: 3 4; }

/* bindings — 1P / 2P stacked side by side */
.cp-keymap__bindings-cols {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;
}
.cp-keymap__bindings {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 0.25rem;
  font-size: 0.82rem;
}
.cp-keymap__bindings li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.3rem 0.55rem;
  background: var(--cp-panel-2);
  border: 1px solid var(--cp-line); border-radius: 5px;
  transition: border-color 120ms, background 120ms;
}
.cp-keymap__bindings li:not(.cp-keymap__col-head):hover {
  border-color: var(--cp-cyan);
  background: rgba(52,224,255,0.06);
}
/* R8-25 list-row live-press feedback (mirror of SVG highlight). */
.cp-keymap__bindings li.is-pressing {
  border-color: var(--cp-cyan);
  background: rgba(52,224,255,0.18);
  box-shadow: 0 0 10px rgba(52,224,255,0.35) inset;
}
.cp-keymap__col-head {
  background: transparent !important;
  border: none !important;
  padding: 0.1rem 0 0.3rem !important;
  font-family: var(--cp-font-mono);
  font-size: 0.78rem; font-weight: 800; letter-spacing: 2px;
  color: var(--cp-cyan); opacity: 0.75;
  text-transform: uppercase;
  justify-content: flex-start !important;
  border-bottom: 1px solid var(--cp-line) !important;
  border-radius: 0 !important;
}
.cp-keymap__pad-label {
  font-family: var(--cp-font-mono); font-weight: 700; letter-spacing: 1px;
  color: var(--cp-cyan); opacity: 0.85; font-size: 0.78rem;
}
.cp-keymap__pad-binding {
  font-family: var(--cp-font-mono); font-size: 0.76rem;
  color: var(--cp-text-dim); font-style: italic;
}
.cp-keymap__pad-binding.is-bound {
  color: var(--cp-text); font-style: normal;
}
/* Reserve a stable row so error appearance doesn't jump the modal layout. */
.cp-lanemod-config-error { color: var(--cp-red); font-size: 0.78rem; line-height: 1.35; min-height: 1.7em; }
/* R-RANDOM uses the existing cp-numbox shell — stretch it to fill the row
   so the shift number gets the same column real-estate as RANDOM's textbox.
   And drop the inner input's modal-bordered style here so the shell's border
   doesn't double up. */
.cp-lanemod-config-modal .cp-numbox { flex: 1; }
.cp-lanemod-config-modal .cp-numbox .cp-numbox__input {
  flex: 1; width: auto;
  background: none; border: none; box-shadow: none;
  padding: 0;
}
/* DP cp-aux variant — same stacked layout, no fixed total height so the
   side column can flow naturally. */
.cp-aux .cp-lanemod { height: auto; border-top: 1px solid var(--cp-line-soft); padding: var(--cp-sp-3) 0 0; }

/* ===== score strip ===== */
.cp-score { display: flex; align-items: center; gap: var(--cp-sp-4); height: var(--cp-score-h); padding: 0 var(--cp-sp-4); border-top: 1px solid var(--cp-line-soft); background: rgba(0,0,0,0.38); }
.cp-score__combo { display: flex; flex-direction: column; align-items: center; line-height: 1; min-width: 46px; }
.cp-score__combo-num { font-family: var(--cp-font-mono); font-size: var(--cp-fs-num-lg); font-weight: 700; color: var(--cp-text); letter-spacing: -.5px; }
.cp-score__combo-num.is-zero { color: var(--cp-text-mute); }
.cp-score__combo-label { font-size: 8px; font-weight: 600; letter-spacing: 1.5px; color: var(--cp-text-mute); margin-top: 1px; }
.cp-score__judges { display: flex; flex: 1; align-items: center; border-left: 1px solid var(--cp-line-soft); padding-left: var(--cp-sp-2); list-style: none; margin: 0; }
.cp-score__judge { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 0; line-height: 1; }
/* R8-12: line-height: 1 strips the default ~1.4 leading so the 8 px label's
   internal bottom whitespace stops shoving the value down. `gap: 0` on the
   parent + tight line-height = labels and counts read as a single block. */
.cp-score__jl { font-size: 8px; font-weight: 700; letter-spacing: 1px; line-height: 1; }
.cp-score__jv { font-family: var(--cp-font-mono); font-size: var(--cp-fs-md); font-weight: 700; color: var(--cp-text); line-height: 1; }
.cp-score__judge--pg   .cp-score__jl { color: var(--cp-gold); }
.cp-score__judge--g    .cp-score__jl { color: var(--cp-green); }
.cp-score__judge--good .cp-score__jl { color: var(--cp-blue); }
/* r12.6 — Bad/Miss cell, stacked rows like the timing cell. */
.cp-score__judge--badmiss { flex-direction: column; justify-content: center; gap: 2px; }
.cp-score__bm-row    { display: flex; align-items: center; justify-content: center; gap: 4px; line-height: 1; }
.cp-score__bm-lbl    { font-size: 8px; font-weight: 700; letter-spacing: 1px; line-height: 1; }
.cp-score__bm-row--bad  .cp-score__bm-lbl { color: var(--cp-orange); }
.cp-score__bm-row--miss .cp-score__bm-lbl { color: var(--cp-red); }
.cp-score__bm-val    { font-family: var(--cp-font-mono); font-size: var(--cp-fs-md); font-weight: 700; color: var(--cp-text); line-height: 1; }
/* r12.3 — Timing cell holding FAST + SLOW counters stacked. */
.cp-score__judge--timing { flex-direction: column; justify-content: center; gap: 2px; }
.cp-score__timing-row    { display: flex; align-items: center; justify-content: center; gap: 4px; line-height: 1; }
.cp-score__timing-lbl    { font-size: 8px; font-weight: 700; letter-spacing: 1px; line-height: 1; }
.cp-score__timing-lbl--fast { color: var(--cp-cyan); }
.cp-score__timing-lbl--slow { color: var(--cp-orange); }
.cp-score__timing-val    { font-family: var(--cp-font-mono); font-size: var(--cp-fs-md); font-weight: 700; color: var(--cp-text); line-height: 1; }

/* ===== DP aux column (hi-speed + score moved out of key zone) ===== */
.cp-aux { grid-area: aux; display: flex; flex-direction: column; justify-content: flex-end; gap: var(--cp-sp-5); padding: var(--cp-sp-6) var(--cp-sp-5) var(--cp-sp-7); min-width: 0; }
.cp-aux .cp-hispeed { border-top: none; background: none; height: auto; padding: 0; cursor: default; flex-wrap: wrap; gap: var(--cp-sp-3); }
.cp-aux .cp-score   { border-top: 1px solid var(--cp-line-soft); background: none; height: auto; padding: var(--cp-sp-4) 0 0; }

/* ===== queue (BEM block + children — coexists with legacy cp-queue-region/-label/-wrap) ===== */
.cp-queue { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--cp-bg-2); }
.cp-stage--dp .cp-queue { grid-area: queue; min-width: 0; min-height: 0; border-left: 1px solid var(--cp-line); }
/* r12.5 — `.cp-queue--foresee` rule removed (foresee queue dropped). The
   right grid cell (area: aux) is empty until replacement content lands. */
.cp-queue__label { display: flex; align-items: center; justify-content: space-between; gap: var(--cp-sp-3); font-size: var(--cp-fs-label); font-weight: 700; letter-spacing: 2.5px; color: var(--cp-text-mute); padding: var(--cp-sp-2) var(--cp-sp-4) var(--cp-sp-1) var(--cp-sp-5); }
.cp-queue__hint { font-size: var(--cp-fs-label); font-weight: 600; letter-spacing: 1px; color: var(--cp-text-mute); }
.cp-queue__wrap { flex: 1; overflow-x: auto; overflow-y: hidden; min-height: 0; box-sizing: border-box; padding-bottom: var(--cp-sp-scrollbar-reserve); }
.cp-stage--dp .cp-queue__wrap { overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; cursor: pointer; padding-bottom: 0; }
.cp-queue__inner { height: 100%; position: relative; }
/* R8-26 — SP keeps the queueWrap = queue-tile-height + scrollbar-pad calc
   so its tile bottom aligns with the main judgment line. (SP's keyzone is
   inside cp-field, so the alignment coupling matches the user's
   single-column intuition.) */
.cp-stage:not(.cp-stage--dp) .cp-queue__inner { height: max(120px, calc(var(--cp-stage-h) - var(--cp-keyzone-h) - var(--cp-line-lift) + var(--cp-queue-bottom-pad) - var(--cp-queue-label-h))); }
.cp-stage:not(.cp-stage--dp) .cp-queue__wrap { flex: none; height: max(134px, calc(var(--cp-stage-h) - var(--cp-keyzone-h) - var(--cp-line-lift) + var(--cp-queue-bottom-pad) - var(--cp-queue-label-h) + var(--cp-sp-scrollbar-reserve))); }
/* DP: queueWrap inherits the base `flex: 1` and fills cp-queue minus the
   label. No reference to cp-field's internals — each column sizes by its
   own contents only. Trade-off: queue tile bottom no longer aligns with
   the main canvas judgment line. */
/* #4 — DP 큐 vertical scrollbar 확실히 보이게. spec 9px → 12px,
   color 강화, Firefox 용 scrollbar-color/width 도 추가. */
.cp-queue__wrap { scrollbar-color: rgba(120,150,200,0.65) rgba(0,0,0,0.5); scrollbar-width: auto; }
.cp-queue__wrap::-webkit-scrollbar { height: 12px; width: 12px; }
.cp-queue__wrap::-webkit-scrollbar-track { background: rgba(0,0,0,0.5); border-left: 1px solid rgba(120,150,200,0.15); }
.cp-queue__wrap::-webkit-scrollbar-thumb { background: rgba(120,150,200,0.6); border-radius: 6px; border: 2px solid rgba(0,0,0,0.5); background-clip: padding-box; }
.cp-queue__wrap::-webkit-scrollbar-thumb:hover { background: rgba(120,150,200,0.85); background-clip: padding-box; }
.cp-queue__wrap::-webkit-scrollbar-corner { background: rgba(0,0,0,0.5); }
.cp-qtile { border-radius: var(--cp-r-md); border: 1px solid var(--cp-line-soft); }

/* ===== loop band (BEM — coexists with legacy cp-loop-* above) ===== */
.cp-loop { border: 2px solid var(--cp-violet); border-radius: var(--cp-r-md); background: rgba(167,139,250,0.12); box-shadow: 0 0 14px -2px rgba(167,139,250,0.5), inset 0 0 22px -10px rgba(167,139,250,0.6); z-index: 4; pointer-events: none; }
.cp-loop--h { border: none; background: none; box-shadow: none; }
.cp-loop__tag { position: absolute; top: var(--cp-sp-1); left: var(--cp-sp-2); z-index: 2; font-family: var(--cp-font-mono); font-size: var(--cp-fs-label); font-weight: 700; letter-spacing: 1.5px; color: var(--cp-violet-ink); background: var(--cp-violet); border-radius: 3px; padding: 1px var(--cp-sp-1); }
.cp-loop__playhead { position: absolute; pointer-events: none; background: none; border-top: 2px solid var(--cp-red); box-shadow: 0 -1px 8px rgba(255,51,68,0.7); z-index: 5; }
.cp-loop__handle { position: absolute; left: 28%; right: 28%; height: 24px; z-index: 3; pointer-events: auto; cursor: ns-resize; display: flex; align-items: center; justify-content: center; }
.cp-loop__handle span { width: 48px; height: 6px; border-radius: 3px; background: var(--cp-violet); box-shadow: 0 0 10px rgba(167,139,250,0.9); }
.cp-loop__handle:hover span { background: var(--cp-violet-hi); height: 7px; }
.cp-loop__handle--start { bottom: -12px; }
.cp-loop__handle--end   { top: -12px; }
.cp-loop--h .cp-loop__handle { left: 0; right: auto; top: 0; bottom: auto; }
.cp-loop--h .cp-loop__playhead { display: none; }
.cp-loop__canvas { position: absolute; pointer-events: none; z-index: 1; display: none; }
.cp-loop__x { position: absolute; top: 3px; right: var(--cp-sp-1); z-index: 3; pointer-events: auto; cursor: pointer; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: none; border-radius: var(--cp-r-sm); font-family: var(--cp-font-ui); font-size: var(--cp-fs-md); line-height: 1; color: var(--cp-violet-ink); background: var(--cp-violet); font-weight: 700; }
.cp-loop__x:hover { background: var(--cp-violet-hi); }

/* When the search dialog opens on top of cp-dialog the two backdrops
   stack (their alpha multiplies). Lighten the inner one so the dim is
   readable, not opaque-black. */
dialog.note-attrs-search-modal::backdrop { background: rgba(0,0,0,0.25); }

/* Configuration popup — floating dialog stacked above cp-dialog.
   R8-22: widened to 640px for the 2xN (DISPLAY / GAMEPLAY) grid layout. */
dialog.cp-settings-modal {
  width: 640px; max-width: 92vw;
  padding: 0;
  background: var(--cp-panel); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 8px;
}
dialog.cp-settings-modal::backdrop { background: rgba(0,0,0,0.25); }
.cp-settings-shell { display: flex; flex-direction: column; }
.cp-settings-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid var(--cp-line);
}
.cp-settings-head strong { font-size: 0.95rem; letter-spacing: .3px; }
.cp-settings-head button {
  background: transparent; border: 1px solid var(--cp-line); color: var(--cp-text);
  border-radius: 5px; padding: 0.15rem 0.55rem; font-size: 0.85rem; cursor: pointer;
  font-family: var(--cp-font-ui);
}
.cp-settings-body {
  padding: 0.75rem 1.1rem 0.9rem; font-size: 0.88rem;
  display: grid; grid-template-columns: 1fr 1fr;
  column-gap: 1.6rem; row-gap: 0;
}
.cp-settings-col { display: flex; flex-direction: column; gap: 0.7rem; min-width: 0; }
.cp-settings-col__head {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: var(--cp-cyan);
  opacity: 0.7;
  text-transform: uppercase;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--cp-line);
  margin-bottom: 0.25rem;
}
/* Collapse to single column on narrow viewports — modal stays usable. */
@media (max-width: 600px) {
  dialog.cp-settings-modal { width: 360px; }
  .cp-settings-body { grid-template-columns: 1fr; row-gap: 1rem; }
}
.cp-settings-row { display: flex; flex-direction: column; gap: 0.35rem; }
.cp-settings-row .row-head {
  display: flex; justify-content: space-between; align-items: baseline;
}
/* R8-20: Configuration row captions — kill just-the-docs `.label:not(g)`
   pill (white-on-blue) and replace with a subtle uppercase cyan caption.
   Higher specificity to win over the theme. */
.cp-settings-modal .cp-settings-row .label,
.cp-settings-modal .cp-settings-row .row-head .label {
  display: inline-block;
  padding: 0; margin: 0;
  background: transparent;
  border-radius: 0;
  text-transform: uppercase;
  letter-spacing: 1.6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--cp-cyan);
  opacity: 0.78;
  vertical-align: baseline;
  position: relative;
}
.cp-settings-modal .cp-settings-row .row-head .value {
  color: var(--cp-cyan);
  font-family: var(--cp-font-mono);
  font-size: 0.85rem;
  letter-spacing: 0.5px;
  opacity: 0.92;
}
/* Sliders inherit cp-range pill styling now; this rule keeps the row full-width. */
.cp-settings-modal .cp-settings-row input[type=range] { width: 100%; }
.cp-settings-row label.toggle {
  display: inline-flex; gap: 0.6rem; align-items: center; cursor: pointer;
  font-size: 0.85rem; color: var(--cp-text);
}
/* R8-20: real toggle switch. Hide the native checkbox and use a sibling
   .toggle__track span as the visual. */
.cp-settings-modal label.toggle input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0; height: 0;
  pointer-events: none;
}
.cp-settings-modal .toggle__track {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  width: 34px; height: 18px;
  border-radius: 9px;
  background: var(--cp-line);
  transition: background 140ms ease-out, box-shadow 140ms ease-out;
}
.cp-settings-modal .toggle__track::after {
  content: "";
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--cp-text-mute);
  box-shadow: 0 1px 2px rgba(0,0,0,0.35);
  transition: transform 140ms ease-out, background 140ms ease-out;
}
.cp-settings-modal label.toggle input[type="checkbox"]:checked + .toggle__track {
  background: var(--cp-cyan);
  box-shadow: 0 0 6px rgba(52,224,255,0.35);
}
.cp-settings-modal label.toggle input[type="checkbox"]:checked + .toggle__track::after {
  background: #0a1320;
  transform: translateX(16px);
}
.cp-settings-modal label.toggle input[type="checkbox"]:focus-visible + .toggle__track {
  outline: 2px solid var(--cp-cyan);
  outline-offset: 2px;
}
.cp-settings-radios {
  display: flex; gap: 0.8rem; flex-wrap: wrap;
  margin-top: 0.35rem;
}
.cp-settings-radios label {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.88rem; cursor: pointer; color: var(--cp-text);
}
.cp-settings-radios input[type=radio] { accent-color: var(--cp-cyan); }
.cp-settings-foot {
  padding: 0.55rem 0.9rem;
  border-top: 1px solid var(--cp-line);
  display: flex; justify-content: flex-end; gap: 0.4rem;
}
.cp-settings-foot button {
  background: var(--cp-panel-2); color: var(--cp-text);
  border: 1px solid var(--cp-line); border-radius: 5px;
  padding: 0.25rem 0.65rem; font-size: 0.85rem; cursor: pointer;
  font-family: var(--cp-font-ui);
}
.cp-settings-foot button:hover { background: #131a2a; }
.cp-gear {
  background: transparent !important; border: 1px solid var(--cp-line) !important;
  color: var(--cp-text) !important; padding: 0.25rem 0.5rem !important;
  font-size: 0.95rem; line-height: 1; cursor: pointer;
}
.cp-gear:hover { background: var(--cp-panel-2) !important; }
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
    <!-- Row 1: identity + meta badges + icon-only chrome (BEM per chart-preview-static) -->
    <header class="cp-topbar">
      <div class="cp-topbar__left">
        <span class="cp-badge cp-badge--mode" data-cp-badge-mode hidden></span>
        <span class="cp-badge cp-badge--tier" data-cp-badge-tier hidden></span>
        <h1 class="cp-topbar__title" data-cp-title>Chart preview</h1>
        <ul class="cp-meta" data-cp-meta-badges></ul>
      </div>
      <div class="cp-topbar__right">
        <button type="button" class="cp-btn cp-btn--icon cp-btn--pick" data-cp-pick title="Pick chart (P)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>
        </button>
        <button type="button" class="cp-btn cp-btn--icon cp-btn--ghost" data-cp-settings-open title="Configuration">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>
        </button>
        <button type="button" class="cp-btn cp-btn--icon cp-btn--ghost" data-cp-keymap-open title="Key mapping">
          <svg width="16" height="14" viewBox="0 0 24 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="1" y="1" width="22" height="16" rx="2"/>
            <path d="M5 6h1M9 6h1M13 6h1M17 6h1M5 10h1M9 10h1M13 10h1M17 10h1M6.5 14h11"/>
          </svg>
        </button>
        <button type="button" class="cp-btn cp-btn--icon cp-btn--ghost" data-cp-debug-download title="Download debug log (for bug reports)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button type="button" class="cp-btn cp-btn--icon cp-btn--close" data-cp-close title="Close (Esc)"><span class="cp-btn--close__x">×</span></button>
      </div>
    </header>

    <!-- Row 2: transport + progress slider + clock -->
    <div class="cp-progress__row">
      <button type="button" class="cp-btn cp-btn--icon cp-btn--play" data-cp-play title="Play / Pause (Space)">
        <svg class="cp-icon-play" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>
        <svg class="cp-icon-pause" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" hidden><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      </button>
      <button type="button" class="cp-btn cp-btn--icon cp-btn--reset" data-cp-reset title="Reset (R)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></svg>
      </button>
      <div class="cp-progress__bar">
        <canvas class="cp-progress__density cp-progress__density--scratch" data-cp-density-scratch aria-hidden="true"></canvas>
        <div class="cp-progress__slot">
          <input type="range" class="cp-range cp-progress__slider" data-cp-progress
                 min="0" max="0" step="0.01" value="0" aria-label="Playback position">
        </div>
        <canvas class="cp-progress__density cp-progress__density--notes" data-cp-density-notes aria-hidden="true"></canvas>
        <div class="cp-progress__loop" data-cp-progress-loop hidden>
          <div class="cp-progress__loop-handle cp-progress__loop-handle--start" data-cp-progress-loop-start aria-label="Loop start"></div>
          <div class="cp-progress__loop-handle cp-progress__loop-handle--end" data-cp-progress-loop-end aria-label="Loop end"></div>
        </div>
      </div>
      <span class="cp-progress__time" data-cp-progress-time>0:00.0 / 0:00.0</span>

      <!-- Hidden compat — old selectors still present for chart-preview.js. -->
      <input type="checkbox" data-cp-profile hidden>
      <span data-cp-meta hidden></span>
      <span data-cp-clock hidden></span>
    </div>

    <div class="cp-body">
      <div class="cp-host" data-cp-host></div>
      <div class="cp-judgment" data-cp-judgment></div>
      <div class="cp-loop-countdown" data-cp-loop-countdown hidden>
        <svg class="cp-loop-countdown__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" class="cp-loop-countdown__bg"/>
          <circle cx="50" cy="50" r="46" class="cp-loop-countdown__fg"/>
        </svg>
        <span class="cp-loop-countdown__num" data-cp-loop-countdown-num>3</span>
      </div>

      <!-- PORT_FIXUPS #4 — empty state overlay (glyph + CTA + optional chips) -->
      <div class="cp-empty" data-cp-empty>
        <div class="cp-empty-card">
          <div class="cp-empty-glyph">
            <span class="cp-eg-bar"></span><span class="cp-eg-bar"></span><span class="cp-eg-bar"></span>
            <span class="cp-eg-line"></span>
          </div>
          <h2>Pick a chart to preview</h2>
          <p>Watch notes scroll in sync with the audio, or play along with the keyboard.</p>
          <button type="button" class="cp-btn cp-btn--pick cp-empty-cta" data-cp-pick>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>
            <span>Pick chart</span><kbd class="cp-empty-kbd">P</kbd>
          </button>
          <div class="cp-empty-quick" data-cp-empty-quick hidden>
            <span class="cp-empty-quick-label">TRY</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</dialog>

{% include chart-search-dialog.html %}

<dialog class="cp-settings-modal" data-cp-settings-modal aria-label="Chart preview settings">
  <div class="cp-settings-shell">
    <div class="cp-settings-head">
      <strong>⚙ Configuration</strong>
      <button type="button" data-cp-settings-close>✕</button>
    </div>
    <div class="cp-settings-body">
      <section class="cp-settings-col">
        <header class="cp-settings-col__head">Display</header>
        <div class="cp-settings-row">
          <span class="label">Beam length</span>
          <div class="cp-settings-radios" role="radiogroup" data-cp-settings-beam-len>
            <label><input type="radio" name="cp-beam-len" value="default" checked> Default</label>
            <label><input type="radio" name="cp-beam-len" value="short"> Short</label>
            <label><input type="radio" name="cp-beam-len" value="very_short"> Min</label>
          </div>
        </div>
        <div class="cp-settings-row">
          <div class="row-head">
            <span class="label">Judgment line raise</span>
            <span class="value" data-cp-settings-line-val>1 px</span>
          </div>
          <input type="range" class="cp-range" min="1" max="20" step="1" value="1" data-cp-settings-line>
        </div>
        <div class="cp-settings-row">
          <div class="row-head">
            <span class="label">Judgment popup offset</span>
            <span class="value" data-cp-settings-popup-val>0 px</span>
          </div>
          <input type="range" class="cp-range" min="0" max="200" step="5" value="0" data-cp-settings-popup>
        </div>
        <div class="cp-settings-row">
          <div class="row-head">
            <span class="label">SUD+ cover</span>
            <span class="value" data-cp-settings-sudplus-val>0 px</span>
          </div>
          <input type="range" class="cp-range" min="0" max="500" step="10" value="0" data-cp-settings-sudplus>
        </div>
        <div class="cp-settings-row">
          <label class="toggle">
            <input type="checkbox" data-cp-settings-markers checked>
            <span class="toggle__track"></span>
            <span>Show measure markers</span>
          </label>
          <span class="cp-settings-hint" style="font-size:0.78rem;color:var(--cp-text-mute);font-style:italic;">&lt;mxx&gt; · BPM 150→200 · ■0.50s</span>
        </div>
        <div class="cp-settings-row">
          <label class="toggle">
            <input type="checkbox" data-cp-settings-hide-rail>
            <span class="toggle__track"></span>
            <span>Hide left measure rail (SP)</span>
          </label>
          <span class="cp-settings-hint" style="font-size:0.78rem;color:var(--cp-text-mute);font-style:italic;">collapses the rail; lanes shift left</span>
        </div>
      </section>
      <section class="cp-settings-col">
        <header class="cp-settings-col__head">Gameplay</header>
        <div class="cp-settings-row">
          <div class="row-head">
            <span class="label">Judge offset</span>
            <span class="value" data-cp-settings-offset-val>+0 ms</span>
          </div>
          <input type="range" class="cp-range" min="-150" max="150" step="1" value="0" data-cp-settings-offset>
        </div>
        <div class="cp-settings-row">
          <label class="toggle">
            <input type="checkbox" data-cp-settings-auto>
            <span class="toggle__track"></span>
            <span>Auto adjust judge offset</span>
          </label>
          <span class="cp-settings-hint" style="font-size:0.78rem;color:var(--cp-text-mute);font-style:italic;">avg of last 16 hits</span>
        </div>
        <div class="cp-settings-row">
          <label class="toggle">
            <input type="checkbox" data-cp-settings-hide-judgment>
            <span class="toggle__track"></span>
            <span>Hide judgment (watch mode)</span>
          </label>
          <span class="cp-settings-hint" style="font-size:0.78rem;color:var(--cp-text-mute);font-style:italic;">disables hit-test, press beam, popup, and score</span>
        </div>
        <div class="cp-settings-row">
          <label class="toggle">
            <input type="checkbox" data-cp-settings-ghost checked>
            <span class="toggle__track"></span>
            <span>Ghost (queue hit feedback)</span>
          </label>
          <span class="cp-settings-hint" style="font-size:0.78rem;color:var(--cp-text-mute);font-style:italic;">judged notes re-tint in the queue + timing line at actual hit</span>
        </div>
        <div class="cp-settings-row">
          <span class="label">Loop standby</span>
          <div class="cp-settings-radios" role="radiogroup" data-cp-settings-loop-standby>
            <label><input type="radio" name="cp-loop-standby" value="instant" checked> Instant</label>
            <label><input type="radio" name="cp-loop-standby" value="1s"> 1s</label>
            <label><input type="radio" name="cp-loop-standby" value="2s"> 2s</label>
            <label><input type="radio" name="cp-loop-standby" value="3s"> 3s</label>
          </div>
          <span class="cp-settings-hint" style="font-size:0.78rem;color:var(--cp-text-mute);font-style:italic;">pause on loop wraparound — Instant = 250 ms decoder grace</span>
        </div>
      </section>
    </div>
    <div class="cp-settings-foot">
      <button type="button" data-cp-settings-reset>Reset to defaults</button>
    </div>
  </div>
</dialog>

<dialog class="cp-keymap-modal" data-cp-keymap aria-label="Key mapping">
  <div class="cp-keymap__shell">
    <div class="cp-keymap__head">
      <strong>⌨ Key Mapping</strong>
      <div class="cp-keymap__head-actions">
        <span class="cp-keymap__hid-status" data-cp-keymap-status data-state="off">No controller — keyboard only</span>
        <button type="button" class="cp-keymap__head-btn cp-keymap__head-btn--swap" data-cp-keymap-swap title="Swap 1P ↔ 2P bindings (all pads — keyboard + HID)">⇄ Swap</button>
        <button type="button" class="cp-keymap__head-btn" data-cp-keymap-calib title="Measure input latency and apply as Judge offset">🎯 Calibrate</button>
        <button type="button" class="cp-keymap__head-btn" data-cp-keymap-rescan title="Connect a HID controller">🔌 Connect</button>
        <button type="button" class="cp-keymap__head-btn cp-keymap__head-btn--close" data-cp-keymap-close aria-label="Close">✕</button>
      </div>
    </div>
    <div class="cp-keymap__body">
      <p class="cp-keymap__hint">
        Click any pad (or list row) and press the input you want to assign. <kbd>Esc</kbd> cancels.
        <br><span class="cp-keymap__hint--dim">Disc clicks bind <b>↻</b>; use the list rows for <b>↺</b>. Bindings save per browser.</span>
      </p>
      <div class="cp-keymap__stage">
        <svg viewBox="0 0 720 200" class="cp-keymap__svg" aria-label="IIDX DP layout (1P left, 2P right)">
          <defs>
            <radialGradient id="cp-keymap-vinyl" cx="50%" cy="40%" r="60%">
              <stop offset="0%"  stop-color="#1c2030" stop-opacity="0.9"/>
              <stop offset="55%" stop-color="#06090f" stop-opacity="1"/>
              <stop offset="100%" stop-color="#02040a" stop-opacity="1"/>
            </radialGradient>
            <radialGradient id="cp-keymap-label" cx="50%" cy="35%" r="65%">
              <stop offset="0%"  stop-color="#ff6b78"/>
              <stop offset="100%" stop-color="#bd1a2a"/>
            </radialGradient>
            <linearGradient id="cp-keymap-key-white" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#eef2f7"/>
              <stop offset="100%" stop-color="#a8b3c4"/>
            </linearGradient>
            <linearGradient id="cp-keymap-key-blue" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#5fa0e8"/>
              <stop offset="100%" stop-color="#1f5fa8"/>
            </linearGradient>
          </defs>

          <!-- ─── 1P side ─── -->
          <g class="cp-keymap__sc">
            <circle cx="60" cy="100" r="56" class="cp-keymap__sc-rim"/>
            <circle cx="60" cy="100" r="52" class="cp-keymap__sc-bezel"/>
            <circle cx="60" cy="100" r="48" class="cp-keymap__sc-vinyl" fill="url(#cp-keymap-vinyl)"/>
            <circle cx="60" cy="100" r="44" class="cp-keymap__sc-groove"/>
            <circle cx="60" cy="100" r="40" class="cp-keymap__sc-groove"/>
            <circle cx="60" cy="100" r="36" class="cp-keymap__sc-groove"/>
            <circle cx="60" cy="100" r="32" class="cp-keymap__sc-groove"/>
            <circle cx="60" cy="100" r="28" class="cp-keymap__sc-groove"/>
            <circle cx="60" cy="100" r="22" class="cp-keymap__sc-label-bg" fill="url(#cp-keymap-label)"/>
            <circle cx="60" cy="100" r="20" class="cp-keymap__sc-label-inner"/>
            <circle cx="60" cy="100" r="2" class="cp-keymap__sc-spindle"/>
            <line x1="60" y1="46"  x2="60" y2="54"  class="cp-keymap__sc-notch"/>
            <!-- CW half (left rim arc) -->
            <g class="cp-keymap__sc-half cp-keymap__sc-half--cw" data-cp-keymap-pad="sc1p_cw">
              <path d="M 60,44 A 56,56 0 0 0 60,156 L 60,44 Z" class="cp-keymap__sc-half-zone" fill="transparent" pointer-events="all"/>
              <path d="M 60,44 A 56,56 0 0 0 60,156" class="cp-keymap__sc-half-rim" fill="none" pointer-events="none"/>
            </g>
            <!-- CCW half (right rim arc) -->
            <g class="cp-keymap__sc-half cp-keymap__sc-half--ccw" data-cp-keymap-pad="sc1p_ccw">
              <path d="M 60,44 A 56,56 0 0 1 60,156 L 60,44 Z" class="cp-keymap__sc-half-zone" fill="transparent" pointer-events="all"/>
              <path d="M 60,44 A 56,56 0 0 1 60,156" class="cp-keymap__sc-half-rim" fill="none" pointer-events="none"/>
            </g>
            <text x="60" y="20" class="cp-keymap__sc-side">1P</text>
          </g>
          <!-- 1P keys (W B W B W B W) — stride 33 (28 + 5 gap). Whites (1/3/5/7)
               bottom row, blues (2/4/6) top row, both 50 tall, vertically
               symmetric around scratch cy=100 -->
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key1p1">
            <rect x="124" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="138" y="130" class="cp-keymap__key-label">1</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--blue" data-cp-keymap-pad="key1p2">
            <rect x="157" y="50" width="28" height="50" rx="3" fill="url(#cp-keymap-key-blue)"/>
            <text x="171" y="80" class="cp-keymap__key-label">2</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key1p3">
            <rect x="190" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="204" y="130" class="cp-keymap__key-label">3</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--blue" data-cp-keymap-pad="key1p4">
            <rect x="223" y="50" width="28" height="50" rx="3" fill="url(#cp-keymap-key-blue)"/>
            <text x="237" y="80" class="cp-keymap__key-label">4</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key1p5">
            <rect x="256" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="270" y="130" class="cp-keymap__key-label">5</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--blue" data-cp-keymap-pad="key1p6">
            <rect x="289" y="50" width="28" height="50" rx="3" fill="url(#cp-keymap-key-blue)"/>
            <text x="303" y="80" class="cp-keymap__key-label">6</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key1p7">
            <rect x="322" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="336" y="130" class="cp-keymap__key-label">7</text>
          </g>

          <!-- centre divider (faint vertical line marking 1P / 2P seam) -->
          <line x1="360" y1="40" x2="360" y2="180" class="cp-keymap__divider"/>

          <!-- ─── 2P side (mirrored: keys numbered 7→1 left-to-right) ─── -->
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key2p7">
            <rect x="370" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="384" y="130" class="cp-keymap__key-label">7</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--blue" data-cp-keymap-pad="key2p6">
            <rect x="403" y="50" width="28" height="50" rx="3" fill="url(#cp-keymap-key-blue)"/>
            <text x="417" y="80" class="cp-keymap__key-label">6</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key2p5">
            <rect x="436" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="450" y="130" class="cp-keymap__key-label">5</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--blue" data-cp-keymap-pad="key2p4">
            <rect x="469" y="50" width="28" height="50" rx="3" fill="url(#cp-keymap-key-blue)"/>
            <text x="483" y="80" class="cp-keymap__key-label">4</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key2p3">
            <rect x="502" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="516" y="130" class="cp-keymap__key-label">3</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--blue" data-cp-keymap-pad="key2p2">
            <rect x="535" y="50" width="28" height="50" rx="3" fill="url(#cp-keymap-key-blue)"/>
            <text x="549" y="80" class="cp-keymap__key-label">2</text>
          </g>
          <g class="cp-keymap__key cp-keymap__key--white" data-cp-keymap-pad="key2p1">
            <rect x="568" y="100" width="28" height="50" rx="3" fill="url(#cp-keymap-key-white)"/>
            <text x="582" y="130" class="cp-keymap__key-label">1</text>
          </g>
          <g class="cp-keymap__sc">
            <circle cx="660" cy="100" r="56" class="cp-keymap__sc-rim"/>
            <circle cx="660" cy="100" r="52" class="cp-keymap__sc-bezel"/>
            <circle cx="660" cy="100" r="48" class="cp-keymap__sc-vinyl" fill="url(#cp-keymap-vinyl)"/>
            <circle cx="660" cy="100" r="44" class="cp-keymap__sc-groove"/>
            <circle cx="660" cy="100" r="40" class="cp-keymap__sc-groove"/>
            <circle cx="660" cy="100" r="36" class="cp-keymap__sc-groove"/>
            <circle cx="660" cy="100" r="32" class="cp-keymap__sc-groove"/>
            <circle cx="660" cy="100" r="28" class="cp-keymap__sc-groove"/>
            <circle cx="660" cy="100" r="22" class="cp-keymap__sc-label-bg" fill="url(#cp-keymap-label)"/>
            <circle cx="660" cy="100" r="20" class="cp-keymap__sc-label-inner"/>
            <circle cx="660" cy="100" r="2" class="cp-keymap__sc-spindle"/>
            <line x1="660" y1="46"  x2="660" y2="54"  class="cp-keymap__sc-notch"/>
            <g class="cp-keymap__sc-half cp-keymap__sc-half--cw" data-cp-keymap-pad="sc2p_cw">
              <path d="M 660,44 A 56,56 0 0 0 660,156 L 660,44 Z" class="cp-keymap__sc-half-zone" fill="transparent" pointer-events="all"/>
              <path d="M 660,44 A 56,56 0 0 0 660,156" class="cp-keymap__sc-half-rim" fill="none" pointer-events="none"/>
            </g>
            <g class="cp-keymap__sc-half cp-keymap__sc-half--ccw" data-cp-keymap-pad="sc2p_ccw">
              <path d="M 660,44 A 56,56 0 0 1 660,156 L 660,44 Z" class="cp-keymap__sc-half-zone" fill="transparent" pointer-events="all"/>
              <path d="M 660,44 A 56,56 0 0 1 660,156" class="cp-keymap__sc-half-rim" fill="none" pointer-events="none"/>
            </g>
            <text x="660" y="20" class="cp-keymap__sc-side">2P</text>
          </g>
        </svg>
      </div>
      <div class="cp-keymap__bindings-cols">
        <ul class="cp-keymap__bindings">
          <li class="cp-keymap__col-head">1P</li>
          <li><span class="cp-keymap__pad-label">SC ↻</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="sc1p_cw">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">SC ↺</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="sc1p_ccw">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 1</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p1">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 2</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p2">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 3</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p3">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 4</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p4">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 5</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p5">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 6</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p6">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 7</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key1p7">— unmapped —</span></li>
        </ul>
        <ul class="cp-keymap__bindings">
          <li class="cp-keymap__col-head">2P</li>
          <li><span class="cp-keymap__pad-label">SC ↻</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="sc2p_cw">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">SC ↺</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="sc2p_ccw">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 1</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p1">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 2</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p2">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 3</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p3">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 4</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p4">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 5</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p5">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 6</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p6">— unmapped —</span></li>
          <li><span class="cp-keymap__pad-label">Key 7</span><span class="cp-keymap__pad-binding" data-cp-keymap-bind="key2p7">— unmapped —</span></li>
        </ul>
      </div>
    </div>
    <div class="cp-keymap__capture-overlay" data-cp-keymap-overlay hidden>
      <div class="cp-keymap__capture-card">
        <p class="cp-keymap__capture-line cp-keymap__capture-line--dim">Press input to bind</p>
        <p class="cp-keymap__capture-target" data-cp-keymap-overlay-target>—</p>
        <p class="cp-keymap__capture-line cp-keymap__capture-line--hint"><kbd>Esc</kbd> to cancel</p>
      </div>
    </div>
  </div>
</dialog>

<dialog class="cp-lanemod-config-modal" data-cp-lanemod-config aria-label="Lane mod configuration">
  <div class="cp-lanemod-config-shell">
    <div class="cp-lanemod-config-head">
      <strong data-cp-lanemod-config-title>Lane Configuration</strong>
      <button type="button" data-cp-lanemod-config-close aria-label="Close">✕</button>
    </div>
    <div class="cp-lanemod-config-body" data-cp-lanemod-config-body></div>
  </div>
</dialog>

<!-- r12 — Latency calibration sub-dialog. Stacks over the keymap modal.
     Canvas drives the falling-note animation via rAF; the host JS measures
     event.timeStamp minus expected hit time per tap, dropping outliers,
     and applies the median delta to fxSettings.judgeOffsetMs on Apply. -->
<dialog class="cp-calib-modal" data-cp-calib aria-label="Input latency calibration">
  <div class="cp-calib__shell">
    <div class="cp-calib__head">
      <strong>🎯 Input Latency Calibration</strong>
      <button type="button" class="cp-calib__close" data-cp-calib-close aria-label="Close">✕</button>
    </div>
    <p class="cp-calib__hint">
      Tap any key when each note reaches the line.<br>
      First 4 are warmup; next 16 are measured.
    </p>
    <div class="cp-calib__stage">
      <canvas class="cp-calib__canvas" data-cp-calib-canvas width="240" height="320"></canvas>
      <div class="cp-calib__status">
        <div class="cp-calib__status-row">
          <span>State:</span>
          <span data-cp-calib-state>Idle</span>
        </div>
        <div class="cp-calib__status-row">
          <span>Taps:</span>
          <span data-cp-calib-count>0 / 16</span>
        </div>
        <div class="cp-calib__status-row">
          <span>Median:</span>
          <span data-cp-calib-median>—</span>
        </div>
        <div class="cp-calib__hist" data-cp-calib-hist aria-label="Sample histogram"></div>
      </div>
    </div>
    <div class="cp-calib__actions">
      <button type="button" class="cp-calib__btn cp-calib__btn--primary" data-cp-calib-start>Start</button>
      <button type="button" class="cp-calib__btn cp-calib__btn--apply" data-cp-calib-apply disabled>Apply</button>
      <button type="button" class="cp-calib__btn" data-cp-calib-cancel>Cancel</button>
    </div>
  </div>
</dialog>

<script src="{{ '/assets/js/chart-renderer.js' | relative_url }}" defer></script>
<script src="{{ '/assets/js/chart-search.js' | relative_url }}" defer></script>
<script src="{{ '/assets/js/chart-preview.js' | relative_url }}" defer></script>
