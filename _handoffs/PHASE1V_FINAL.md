# Phase 1V — FINAL (purity factor adopted, 8-pair residual analyzed)

세션: 2026-05-08 ~ 2026-05-17 누적.
status: K=3 + p99 + purity factor 채택. 잔여 8 페어 분석 완료, 다음 phase 후보.

---

## 0. TL;DR

```
Phase 1V 변경 점:
  1. K=3 chord_size filter (denim 1357→246 차단) — 2026-05-16
  2. p99 normalization (was p95) — 2026-05-16
  3. x_stair × (1 - 0.5 × x_chord) purity factor — 2026-05-17

각 변경 효과:
  - K=3 + p99:   WF 6→5 ρ=0.853→0.856 (Pareto-strict)
  - +purity α=0.5: WF 5→8 ρ=0.856→0.865 (Non-Pareto-strict, user adopted)

Phase 1V audio FFT 가설 검증:
  - 가설 "stair = scale 옥타브 연속" 부분만 검증
  - user audit (熊蜂의 飛行, Terminal Strike) 으로 real stair 가 audio-sequential
    하지 않음을 발견 → audio modulation 거부
  - 대신 K=3 (geometric) + purity factor (chord-aware) 채택
  - audio infra 보존 (Phase 1W+ 다른 axis 적용 검토)

Final AEζηκ baseline (n=5838):
  D1     WF=24 ρ_h=0.8023
  A      WF=17 ρ_h=0.8147
  AEζηκ  WF=8  ρ_h=0.8653  ← adopted
```

---

## 1. Adopted spec (note_attributes.py)

### 1.1 Stair chain detection (K=3 chord_size filter)

```python
def _detect_stair_chains_v2(
    playable_events, sec_table, chord_threshold_ms, player_lanes,
    max_step=1,
    gap_min_ticks=6, gap_max_ticks=12,
    min_chain_length=3,
    max_chord_size=3,        # ← Phase 1V K=3 filter (denim block)
):
    # ...
    for i in range(1, len(eff)):
        gap_in_range = (gap_min_ticks <= gap_tk <= gap_max_ticks)
        chord_ok = (
            len(prev_lanes) <= max_chord_size
            and len(cur_lanes) <= max_chord_size
        )
        if gap_in_range and chord_ok:
            # extend chain logic
        # Emit logic also gated by gap_in_range AND chord_ok
```

### 1.2 p99 normalization

```python
_PHASE1U_P95["SP"]["stair_burden_per_sec"] = 0.9812   # Phase 1V K=3 + p99 (was 0.9255 v3 p95)
_PHASE1U_P95["DP"]["stair_burden_per_sec"] = 0.9812   # SP-derived, refine after DP regen
```

### 1.3 Purity factor

```python
# _axes_r1_character (~L3927):
_x_stair_raw = (
    min(stair_burden / p95_stair, 1.0)
    if p95_stair > 0 and stair_burden > 0 else 0.0
)
# Phase 1V purity factor (2026-05-17): chord-rich charts have stair mixed
# with chord — pure-stair character (low x_chord) gets full credit
out["x_stair"] = _x_stair_raw * max(0.0, 1.0 - 0.5 * out["x_chord"])
```

---

## 2. 결정 history

### Audio FFT path (REJECTED)

```
Phase 1V audio FFT 시도 + 검증 결과 (2026-05-08 ~ 2026-05-16):
  - librosa.yin pitch cache (453,325 wavs)
  - audio_stair_cache (5894 charts)
  - factor α/β/γ/δ variants sweep
  
  REJECT 이유: user audit
    熊蜂의 飛行 Psy [ゲーミング焼き魚]: 4번 마디 통째로 stair
    T.S Terminal Strike [GOD]: 50-57마디 통째로 stair
    
    audio factor_γ 가 이들을 *over-deflate* (0.66 → 0.22, 0.95 → 0.29)
    → user verdict "stair 배치가 꼭 audio-sequential 하지 않다"
    → 가설 부분 실패

audio infra 보존 (Phase 1W+ 활용 가능):
  C:/tmp/phase1v_chart_index.json          (10 MB)
  C:/tmp/phase1v_pitch_cache.json          (74 MB, 453k wavs)
  C:/tmp/phase1v_audio_stair_cache.json    (3 MB)
  C:/tmp/phase1v_stair_wav_list.json       (25 MB)
```

### A/B lane-isolation + surrounding context (REJECTED)

```
user 가 "인접 노트 배치" 고려 제안 (2026-05-17):
  A: lane-isolation — chain step lane 의 다른 lane 거리
  B: surrounding context — chain 전후 chord_size

sweep 결과 (n=5838):
  baseline (K=3+p99):           WF=5  ρ=0.856 ← pre-purity
  A_d2 (lane-isol ≥ 2):         WF=7  ρ=0.855
  A_d3:                         WF=14 ρ=0.864
  B_N3_K3:                      WF=12 ρ=0.851
  B_N5_K2:                      WF=13 ρ=0.864
  A_d2 + B_N3_K3:               WF=13 ρ=0.853
  A_d3 + B_N3_K3:               WF=16 ρ=0.862
  
  → Pareto-strict 후보 없음
  → Raspberry [SP EXTRA] / delayflower / BAMBOO TWIST 못 잡음
  → 진짜 stair (熊蜂, Terminal) over-deflate

→ REJECT, purity factor 로 pivot
```

### Purity factor (ADOPTED)

```
user 4-chart audit (2026-05-17):
  Empress of Raizze [フルマラソン]      x_chord=0.270  HIGH
  Complex path [さぼてんのとげザ－]       x_chord=0.266  HIGH
  Icyxis [Mystery]                   x_chord=0.512  MEDIUM
  覚醒フィールド-DEATHER-                x_chord=0.482  MEDIUM
  
  → 모두 K=3+p99 baseline 에서 1.000 saturated, 그러나 user 가 2 tier 구분
  → x_chord 가 discriminator

sweep:
  baseline (K=3+p99):              WF=5  ρ=0.856
  × (1 - 0.25 × x_chord):          WF=7  ρ=0.861
  × (1 - 0.50 × x_chord):          WF=8  ρ=0.865 ★ adopted
  × (1 - 0.75 × x_chord):          WF=12 ρ=0.869

α=0.5 효과:
  Empress 0.865 / Complex 0.867 ≈ HIGH
  Icyxis 0.744 / 覚醒 0.759 ≈ MEDIUM ✓ user verdict 정합
```

---

## 3. Post-regen baseline (2026-05-17)

```
                                  D1       A       AEζηκ
cands                            484     484     484
WF                               24      17      8
CC%                              4.96%   3.51%   1.65%
ρ_h                              0.8023  0.8147  0.8653

axis p95 vs hard:                                 standalone ρ ~0.36-0.40
```

### 핵심 audit cases (post-purity, TITLE [SUBTITLE])

```
Real scale stair (preserved):
  Le Vol du bourdon                                 x_stair=0.784
  Liszt 파가니니 [trans / bravoure / etc]              x_stair 0.45~0.58
  Raspberry Memories [SP EXTRA]                     x_stair=0.919  (user updated: real)
  
Real partial stair (moderate deflate):
  熊蜂の飛行 Psy [ゲーミング焼き魚]                          x_stair=0.287
  T.S : Terminal Strike[GOD]                        x_stair=0.484
  NO NIGHT MORE SOUL! [HARDEST]                     x_stair=0.428
  我武者羅[殺]                                          x_stair=0.275
  
Mixed real (purity discriminated):
  Empress of Raizze [フルマラソン]      (HIGH)         x_stair=0.865
  Complex path [さぼてんのとげザ－]       (HIGH)         x_stair=0.867
  Icyxis [Mystery]                   (MEDIUM)       x_stair=0.744
  覚醒フィールド-DEATHER-                (MEDIUM)       x_stair=0.759
  SYNTHETICS                                        x_stair=0.697
  Ladymade corestar [No...Human...]                 x_stair=0.735
  Pursuit Of Outer Space [Meteor]                   x_stair=0.181  ← #6 잔여 페어

NOT stair (deflated):
  L9 -Heaven-                                       x_stair=0.221
  L9 -Genocide-                                     x_stair=0.136
  Demystify Burst[BLAST]                            x_stair=0.228
  
Chord-stream desat:
  Hyper Fiber World Travel                          x_stair=0.076
  水晶世界 [MANIAC]                                    x_stair=0.417
  裁きの鐘                                            x_stair=0.383
  
Residuals (K=3+purity 못 잡음):
  炎花 - delayflower -                               x_stair=0.754
  BAMBOO TWIST [TWISTREAM]                          x_stair=0.799   (user 인정: real high)
  JUMMER                                            x_stair=0.829   (rhythmic, user OK)
```

---

## 4. 잔여 8 inversion pairs 분석 (next session 대상)

```
Family 분포: st 5, ★ 3
ΔAEζηκ range: +0.010 ~ +0.108 (모두 marginal)
```

### 페어 list (TITLE [SUBTITLE] full)

```
#1 (★)  ★SweeT DiscoverY★ (AFOTHER) (t6)
        vs Faith.[SP Lunatic] (t3)                    Δ=+0.010
        주요 diff: x_stream/peak HIGHER 우세, 거의 tie

#2 (★)  M-A (FOOLISH) (t12)
        vs DESPERATE -fatal- (t4)                     Δ=+0.072
        HIGHER stair +0.07, LOWER chord/peak 약간

#3 (★)  Cry-for BMS Mix-[7KEYS Maniac] (t10)
        vs Everblue [7key Sabother] (t2)              Δ=+0.058
        stair *wrong direction*: LOWER stair=0.289 > HIGHER 0.245

#4 (st) CROSSFIRE (t7)
        vs Cong＊Chu＊Jelly [mint flavor] (t3)         Δ=+0.108
        ★ user 가설: BPM 차이 (147 vs 130) 미반영

#5 (st) 先手必勝戦闘機　鳳 [Vent Divin] (t6)
        vs tinnitus [Nyannurs] (t1)                   Δ=+0.051
        ★ user 가설: 순간 밀도 (instantaneous density)

#6 (st) Pursuit Of Outer Space [Meteor] (t5)
        vs 円環の理 [ＱＢ] (t1)                          Δ=+0.034
        ★ user 가설: 변속 (variable BPM) under-rated

#7 (st) MASAMUNE [Hexagon] (t4)
        vs Under the starry sky [Disghitect] (t1)     Δ=+0.026
        LOWER chord/stream/stair 우세, HIGHER peak

#8 (st) 恐鳥[INFERNO] (t5)
        vs Absolute Future (t1)                       Δ=+0.056
        LOWER chord, HIGHER peak, distraction
```

### Deep audit findings (2026-05-17, 3 pairs)

#### Pair #4 — CROSSFIRE vs Cong＊Chu＊Jelly [mint flavor]

```
CROSSFIRE                       (st t7)  bpm=147 nps=24.0 npb=9.81  pk_jab=25.22 pk_max=12.25
Cong＊Chu＊Jelly [mint flavor]   (st t3)  bpm=130 nps=23.5 npb=10.86 pk_jab=28.50 pk_max=15.17

진단: ε.I = thresh(nps,18) × max(bpm/p95, npb/p95)
  CROSSFIRE: max(147/p95, 9.81/p95) → npb 가 picked (boost)
  Cong: max(130/p95, 10.86/p95) → 더 큰 npb 가 picked
  → 낮은 BPM + 같은 NPS = 더 cramped = npb 높음 = ε.I 더 큼
  → framework 가 BPM-slow-dense 도 valid 로 봄 (memory project_phase1u_eI_max_revision)

user verdict: BPM 자체가 difficulty source — npb 우선 안 됨
fix candidates:
  α. ε.I = thresh × (w × bpm + (1-w) × npb) — weighted sum (max 대신)
  β. ε.I_bpm 별도 추가 sum term: thresh × bpm_clip
  γ. 그대로 — framework 의 npb 시각 vs user 시각 trade
```

#### Pair #5 — 先手必勝戦闘機 鳳 [Vent Divin] vs tinnitus [Nyannurs]

```
先手必勝戦闘機　鳳 [Vent Divin]   (st t6)  bpm=177 nps=24.3 pk_jab=31.67 pk_max=14.75 x_peak=0.541
tinnitus [Nyannurs]            (st t1)  bpm=208 nps=24.5 pk_jab=32.64 pk_max=16.47 x_peak=0.557

진단: NPS, peak_jab 거의 동일. tinnitus 가 약간 우세.
user verdict: 先手 의 *순간 밀도* 더 높음 (framework 의 peak_jab top-K disjoint window 정의와 다른 단위)
  - peak_jab: top-K disjoint 1초 window L²
  - user 의 "순간": 다른 time scale 또는 chord-burst burst character

fix candidates:
  α. 더 짧은 window (0.5s, 0.25s) max-NPS sub-metric 추가
  β. peak_uppercut (single max window) 강조 — 그러나 Phase 1U 에서 single-burst 인플레로 제거됨
  γ. burst_density (gimmick_burst) 활용 — 다른 axis 와 연계
```

#### Pair #6 — Pursuit Of Outer Space [Meteor] vs 円環の理 [ＱＢ] (★ user 가설 검증됨)

```
Pursuit Of Outer Space [Meteor]  (st t5)  bpm_eff=146  bpm_header=146  nps=22.0
  BPM segments: 24 distinct (30~146 BPM, ratio 4.87x)
                dominant 146 (15360 ticks) + sub 30-74 (brief sections)

円環の理 [ＱＢ]                     (st t1)  bpm_eff=180  bpm_header=180  nps=21.3
  BPM segments: 1 BPM only (180)

진단: PoOS 는 명확한 변속 chart (24 distinct BPMs). framework 의 eff_bpm 은
   note-weighted average 이므로 짧은 slow 구간 (30-74 BPM) 평탄화 됨 → 146 BPM 표시.
   변속 자체가 difficulty source 인데 *framework 측정 metric 없음*.

★ user 가설 정확 검증 ✓ — REAL FRAMEWORK GAP

fix candidates:
  α. bpm_range = (max - min) / mean   sub-metric 추가
  β. distinct_bpm_count               sub-metric 추가
  γ. bpm_change_rate = changes/sec   sub-metric 추가
  
구현 cost: medium — new sub-metric + sweep + regen
```

---

## 5. Phase 1V infra (preserved, Phase 1W+ 후보)

```
audio cache 보존 (Phase 1V audio FFT 실험 결과물):
  C:/tmp/phase1v_chart_index.json          (10 MB, 8555 charts md5)
  C:/tmp/phase1v_pitch_cache.json          (74 MB, 453k wavs librosa.yin)
  C:/tmp/phase1v_audio_stair_cache.json    (3 MB, per-chart variants)
  C:/tmp/phase1v_stair_wav_list.json       (25 MB)

stair detail cache (lane-isolation + surrounding context):
  C:/tmp/phase1v_stair_ab_cache.json       (~50 MB, per-step + context)

Phase 1W+ 후보 use:
  - chord 축 audio: delayflower-class chord voicing cycle detection
  - audio + density 결합 stream/peak character 추출
  - BPM variability sub-metric for variable-BPM charts
```

---

## 6. 다음 phase 시작 지점 (Phase 1W)

```
잔여 작업 우선순위:

1순위 — Pair #6 (BPM variability)
  - real framework gap (변속 metric 없음)
  - PoOS [Meteor] 외 여러 변속 chart 영향 가능
  - 구현: bpm_range / distinct_bpm_count / bpm_change_rate sub-metric
  - regen + sweep 필요

2순위 — Pair #4 (CROSSFIRE BPM 우세)
  - ε.I 의 max(bpm, npb) 구조 재검토
  - weighted average 또는 BPM-only term 추가
  - 영향 범위 큼 (다른 charts 도 영향)
  
3순위 — Pair #5 (순간 밀도)
  - peak 정의 mismatch 분석 필요
  - 새 sub-metric (short-window max NPS) 도입
  - 가장 복잡

저순위 — Pair #1, #2, #3, #7, #8
  - marginal (Δ < 0.07)
  - framework noise 가능
  - 별도 신호 필요한지 case-by-case

3 가지 옵션:
  A. Phase 1V closure — 잔여 8 페어 accept, 현재 baseline freeze (WF=8 ρ=0.865)
  B. Phase 1W 시작 — BPM variability sub-metric 부터 (Pair #6 fix)
  C. 종합 sweep — ε.I + peak + BPM variability 묶어서 검토 (광범위)
```

---

## 7. user durable instructions (cross-session)

```
1. BMS chart tables must always include #SUBTITLE
   - 같은 title 아래 여러 variant 존재 (Raspberry [Happy Tarts] vs [SP EXTRA])
   - title 만 보여주면 user 혼란
   - memory feedback_always_show_subtitle.md
   
2. "ship" 언어 금지
3. premature freeze / null 금지
4. perception 정확함 > Pareto strict (user explicit acceptance)
5. WF empirical metric 우선, ρ/CC 보조
6. 정성 단서 (audit case) 받으면서 진행
7. audio infra 보존 (Phase 1V 결과물)
```

---

## 8. Reference

### code commits

```
BMS.Tools (local, no remote):
  49e6c3a Phase 1V purity factor — x_stair × (1 - 0.5 × x_chord)
  118432b Phase 1U + 1V — adopted character-profile redesign (AEζηκ pipeline)
  404f9fd Phase 1U/1V handoff documents — investigation state captured
  
github.io (remote pushed):
  81d22cfea Phase 1V handoff update — purity factor adopted
  aa5dd6247 Phase 1V FINAL — K=3 + p99 adopted, audio rejected
  064615d01 Phase 1V audio FFT handoff — mobile-readable session notes
```

### Mobile readable

```
https://github.com/HorieYuuka/HorieYuuka.github.io/blob/redesign/character-profile/_handoffs/PHASE1V_FINAL.md
```

### Reference scripts (next session)

```
C:/tmp/phase1v_K3p99_baseline.py        — post-regen baseline measurement
C:/tmp/phase1v_purity_sweep.py          — α purity factor sweep
C:/tmp/phase1v_residual8_audit.py       — 잔여 8 pair detail
C:/tmp/phase1v_pair_deep.py             — pair #4/#5/#6 deep audit (BPM, peak, variable BPM)
C:/tmp/phase1v_degree_audit.py          — 4-chart axis breakdown (Empress/Complex/Icyxis/覚醒)
C:/tmp/phase1v_AB_filter_sweep.py       — lane-isolation + surrounding context (rejected)
C:/tmp/phase1v_top_saturated_audit.py   — top-50 saturated charts list
```

### Memory entries (next session 자동 load)

```
project_phase1u_stair_v3_adopted.md        — stair v3 spec
project_phase1u_stair_k3_swept.md          — K=3 adopted 기록
project_phase1u_xpeak_v_l2.md              — x_peak v_l2 (peak_jab only)
project_phase1u_jack_floor_12.md           — jack floor 12
project_phase1u_eI_max_revision.md         — ε.I MAX form (max bpm/npb)
project_phase1v_audio_reject.md            — Phase 1V audio rejection 기록
project_phase1v_audio_pareto_candidates.md — audio sweep history
project_phase1v_purity_factor.md           — purity adoption 기록
feedback_perceptual_vs_empirical_trade.md — perception > empirical trade
feedback_always_show_subtitle.md           — subtitle 표시 의무 (durable)
```
