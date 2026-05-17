# Phase 1W FINAL — chord clamp + AEζηκ refinement

**Date**: 2026-05-17
**Trigger**: Pair #4 (CROSSFIRE vs Cong[mint]) inversion fix attempt → expanded to comprehensive AEζηκ refinement.
**Result**: WF 8 → 2 (-75%), 6 inversions fixed, 0 NEW (Pareto-strict).

## TL;DR — adopted changes

```
Framework-level (note_attributes.py, corpus regen 적용 완료):
  1. asymp(K=3) chord event clamp on event counts
  2. chord_shape_variety_alpha 0.4 → 0.7

Analysis-only (D1/AEζηκ formula in audit scripts):
  3. V3 T14   chord_burden NPS-gated:  cb × thresh(nps, 14, p95)
  4. ε.I T14  NPS threshold 18 → 14
  5. H4       + 0.5 × clip01(run_17, p95)              (sustained back-end peak)
  6. B_MS     + 0.5 × clip01(main_05, p95)             (intro/outro discounted NPS)
  7. BM       - 0.5 × clip01(big/mid-0.5, p95) × top4_mod   (bimodality penalty)

D1 final:
  D1 = sum5
     + clip01(chord_burden, p95_cb) × thresh_clip(nps, 14, p95_nps)
     + 1.5 × clip01(back_spike, p95_bs)
     + 0.5 × clip01(run_17, p95_run17)
     + 0.5 × clip01(main_05, p95_main05)
     - 0.5 × clip01(max(0, big_to_mid - 0.5), p95_bm05) × top4_mod(r)

where:
  run_17 = longest consecutive bins in back half above 1.7 × chart_mean
  main_05 = avg of qbin_densities bins > 0.5 × chart_mean (intro/outro 제외)
  big_to_mid = positions with size 5+ / positions with size 3-4
  top4_avg = avg of top 4 qbin_densities bins
  top4_mod(r) = smooth ramp 32 → 38 on top4_avg:
              1.0 if top4_avg ≤ 32, 0.0 if ≥ 38, linear interp between

A_  = D1 + 0.5 × clip01(ac, p95_ac) × clip01(bs, p95_bs)
ε.I = thresh_clip(nps, 14, p95_nps) × max(clip01(bpm, p95_bpm), clip01(npb, p95_npb))
ζ   = 0.25 × (clip01(cv, p95_cv) + clip01(burst, p95_burst)) × clip01(bs, p95_bs)
η   = 0.30 × clip01(j12_is, p95_j12)
κ   = max(0, (300 - TOTAL) / 300)

AEζηκ = A_ + ε.I + ζ + η + κ
```

## Aggregate (Phase 1V → Phase 1W final)

```
                          Phase 1V (pre)    Phase 1W final
AEζηκ within-family WF         8                 2          (-6, -75%)
AEζηκ ρ_h                    0.8653             0.8316     (-0.034)
cands                          484               532
NEW inversions                  —                 0          ★ Pareto-strict
```

## Pair status

```
FIXED (6 user-flagged or motivation pairs):
  ✓ CROSSFIRE / Cong[mint flavor]            ← Phase 1W 본래 motivation, -0.175 margin
  ✓ ★SweeT DiscoverY★ (AFOTHER) / Faith[SP Lunatic]
  ✓ MASAMUNE [Hexagon] / Under the starry sky [Disghitect]
  ✓ M-A (FOOLISH) / DESPERATE -fatal-
  ✓ 恐鳥 [INFERNO] / Absolute Future          ← user audit: sustained back peak
  ✓ Pursuit Of Outer Space [Meteor] / 円環の理 [ＱＢ]  ← user audit: main-section density

KEPT (2 — known framework gap):
  - Cry-for BMS Mix [7KEYS Maniac] / Everblue [7key Sabother]
    GROUP A residual (ε.I dead-zone, NPS<14)
    NPS 14.0 vs 14.3 — even ε.I T=14 marginal
  - 先手必勝戦闘機 [Vent Divin] / tinnitus [Nyannurs]
    GROUP B (peak metric short-window mismatch)
    user audit: 先手 instantaneous density > tinnitus but framework peak (1s) misses
```

## User perceptual audits (4 critical insights)

```
1. CROSSFIRE vs Cong (2026-05-17):
   "Cong = 6-note chord 사이 얕은 chord (alternation, rest 기회)
    CROSSFIRE = 여러 chord 모양 + 빠른 BPM (continuous pressure)"
   → BM penalty: big/mid ratio 로 bimodal alternation 검출

2. Kakuriyo Dancehall (2026-05-17):
   "Kakuriyo 도 bimodal pattern 이지만 밀도 차이 있음"
   → top4_avg 38.07 vs Cong 31.58 → modulation 도입 (smooth 32-38 ramp)

3. PoOS [Meteor] vs 円環 (2026-05-17):
   "PoOS 변속부는 intro/outro 수준 easy. 진짜 어려운 건 dominant section."
   → variable BPM 가설 거부, main_05 (intro/outro 제외 NPS) 채택

4. 恐鳥 [INFERNO] vs Absolute (2026-05-17):
   "distraction 문제 아님. 후반 밀도 비교."
   → run_17 (sustained back-end peak) 채택

이전 (Phase 1V):
5. SAKURA chord visibility (2026-05-17):
   "variety dampener α=0.4 가 SAKURA underrate"
   → α 0.4 → 0.7
```

## Pair #4 motivation 회복 progression

```
Pre-Phase-1W:           +0.118 (large inversion)
+ V3 T14:               -0.053 (fixed)
+ ε.I T14:              -0.008 (fixed, marginal)
+ H4 run17:             -0.008 (unchanged, run17=0 for both)
+ B_MS main_05:         +0.003 (micro re-inv, sign flip)
+ BM modulated:         -0.175 (FULL FIX, comfortable margin)
```

## Chart-class protection summary

```
chart                   tier  big/mid   top4_avg    BM penalty?   status
─────────────────────────────────────────────────────────────────────────
Cong [mint]              st3   1.449     31.58       FULL          ← penalty (target)
Kakuriyo Dancehall       st7   1.586     38.07       NONE (mod=0)  ← protected
Skydive                  st4   9.415     56.51       NONE          ← protected
UFS                      sl12  7.375     47.24       NONE          ← protected
SAKURA (桜吹雪)           st6   0.498     37.11       <T (no penalty) ← protected
CROSSFIRE                st7   0.398     31.95       <T (no penalty) ← protected
P8107                    st1   0.569     34.50       partial (38%) ← partial
先手                       st6   0.516     33.27       partial (28%) ← small effect
```

## Implementation

```
Analysis scripts (C:/tmp/):
  phase1w_post_regen_audit.py       - main audit ★
  phase1w_residual_pairs_full.py    - 8-pair detail
  phase1w_pair4_only.py             - Pair #4 verification
  phase1w_pair_compare.py           - vs Phase 1V baseline diff

Sweep scripts (record of decisions):
  phase1w_build_chord_hist_cache.py     - chord size histogram cache
  phase1w_clamp_sweep.py                - asymp(K=3) clamp variants
  phase1w_chord_burden_sweep.py         - chord_burden weight sweep
  phase1w_chord_burden_redesign_sweep.py - V0-V6 alternatives
  phase1w_v3_soft_gate_sweep.py         - V3 T18/T16/T14 ★
  phase1w_eI_threshold_sweep.py         - ε.I T sweep ★
  phase1w_back_loaded_sweep.py          - B/D/C back-loaded variants
  phase1w_F_replace_sweep.py            - back_spike replacement
  phase1w_G_conditional_sweep.py        - last_killing conditional
  phase1w_H_sustained_back_sweep.py     - run17 ★
  phase1w_main_section_sweep.py         - main_05 ★
  phase1w_bm_threshold_grid.py          - BM threshold × weight grid
  phase1w_bm_modulated_sweep.py         - BM with top4 modulation ★

Caches:
  phase1w_chord_hist_cache.json     - chord size histogram (per chart)
  phase1w_chord_seq_cache.json      - chord size sequence features
  phase1w_bpm_stats_cache.json      - BPM variability stats

Framework code (note_attributes.py):
  chord submetric: _chord_event_weight (asymp K=3) applied
  chord_shape_variety_alpha: 0.4 → 0.7

NOT in framework attrs:
  D1 / A_ / AEζηκ formula (analysis-side composite)
  run_17, main_05, big_to_mid, top4_avg (derived from existing submetrics)
```

## Outstanding work (Phase 1X candidates)

```
Priority 1 — Cry-for / Everblue residual:
  Both NPS<14, ε.I dead-zone. Likely framework-external factor (memorization, pattern).
  Approach: case audit. Compare specific patterns / lane sequences.

Priority 2 — 先手 / tinnitus residual:
  user 가설: 先手 instantaneous density higher than tinnitus.
  Approach: short-window (0.5s/0.25s) peak sub-metric design.
  
Priority 3 — Framework-level integration:
  Currently D1/A_/AEζηκ are analysis-only composites.
  For production downstream (frontend display, external consumers):
    - Add run_17, main_05, big_to_mid, top4_avg, top4_mod as submetrics
    - Add chord_burden_eI_gated as derived
    - Surface composite difficulty score in attrs
  Requires: regen + downstream contract updates.

Priority 4 — Audit framework-level changes for cohort impact:
  Phase 1W chord clamp + α=0.7 affected all x_chord values.
  Need to verify cohort comparisons / display consistency.
```

## Reference memory entries

```
memory/MEMORY.md (index)
memory/project_phase1w_v3_t14_chord_burden_gate.md
memory/project_phase1w_eI_t14_adopted.md
memory/project_phase1w_h4_run17_adopted.md
memory/project_phase1w_b_ms_main_section_adopted.md
memory/project_phase1w_bm_modulated_adopted.md
```
