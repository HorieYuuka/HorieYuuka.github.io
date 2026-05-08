# Phase 1V — Keysound-aware stair detection (handoff)

세션: 2026-05-07 ~ 2026-05-08 후속.
사전 phase: Phase 1U AEζηκ pipeline (PHASE1U_AEZHK_HANDOFF.md).

---

## 0. 현재 baseline (Phase 1U end-state, 2026-05-08)

### 적용 완료 (note_attributes.py)

| 변경 | 위치 | 비고 |
|---|---|---|
| stair v3 spec | `_detect_stair_chains_v2` (~L2071) | length ≥ 3, gap [6, 12] ticks (32분~16분) |
| stair v3 normalization | `_PHASE1U_P95["SP"]["stair_burden_per_sec"]` = 0.9255 | post-regen p95 |
| x_stair formula | `_axes_r1_character` (~L3919) | clip01(stair_burden_per_sec / p95) — burden 기반 |
| x_peak v_l2 | `_axes_r1_character` (~L3935) | peak_jab only (peak_l2 / p95). peak_uppercut diagnostic 만 보존. |
| jack floor relaxation | `_PHASE1U_JACK_FLOOR_PAIRS` = 12 | 15 → 12 (HF Spectrum etude in_stream=13 활성화) |
| chord conflation fix | `_distraction_qualifying_participation` | distinct-tkey count |
| distraction intensity | `_axes_r1_character` x_distraction | × (1 + clip(scratch_max_run/3)) |

### Empirical 결과 (post-regen, SP only n=5838)

```
pipeline      cands   WF   CC%     ρ_h
D1             462    24   5.19   0.8079
A              462    19   4.11   0.8158
AEζηκ          462     6   1.47   0.8529   ← 현재 baseline (WF=6)
```

### Phase 1U 진행 요약

```
시작 (D1 pre-Phase1U):     WF=86
  + ε.I_max (cognitive):    WF=50
  + ζ (variance/burst):     WF=32
  + η (finger jack):        WF=31
  + κ (TOTAL gauge):        WF=29
  + distraction redesign:   WF=29 (post-regen)
  + stair v3 redesign:      WF=11   (-18, large arch fix)
  + x_peak v_l2:            WF=9    (-2)
  + jack floor=12:          WF=6    (-3)
                            
Pareto-strict 진행. ρ_h: 0.8742 → 0.8529 (D1 baseline → AEζηκ).
```

---

## 1. 잔여 6 페어 (post-jack-floor=12 regen, 2026-05-08)

```
 #  fam  tierΔ  AEζηκΔ   xstΔ    HARDER → LOWER
 1  st     +7  -0.278  -0.070  Hyper Fiber World Travel  → ★So SweeT LittlE HearT★
 2  st     +4  -0.135  -0.038  CROSSFIRE                 → Cong＊Chu＊Jelly
 3  st     +4  -0.107  -0.003  Electric Revolution!      → 濡羽色ノ天使
 4  st     +6  -0.093  +0.044  Hyper Fiber World Travel  → 雪原と少女の冒険 [Insane]
 5  st     +4  -0.087  -0.049  恐鳥[INFERNO]               → Absolute Future
 6  st     +4  -0.042  -0.036  Theine                    → 裁きの鐘
```

### Cluster 분석

```
HFWT (HF World Travel) cluster — 2 페어:
  recurring HARDER, framework 가 underrate (chord-stream burst pattern)
  user 통찰 (m48-78 chord burst) 검증됨 — chord_burden 평균이 burst 못 잡음

裁きの鐘 cluster — 1 페어 잔존 (Theine → 裁きの鐘):
  chord-rich uniform stream — framework over-rate
  
margin small (Δ < 0.1): 4 페어 (#3, #5, #6, plus #4 marginal)
```

---

## 2. **결정 보류** — Stair K-filter 변형 (NOT YET ADOPTED)

이번 세션 sweep 한 K=3/p99/parallel-dedup/chord-weight 변형들. **note_attributes.py 미적용 상태.** 다음 세션에서 audio FFT 와 함께 결정.

### Sweep 결과 (current baseline 대비)

```
variant                          cands  WF   CC%    ρ_h    standalone ρ
═══════════════════════════════════════════════════════════════════
v3 K=99 p95 (current baseline)   462    6   1.47  0.8529   0.5903   ← current
K=3 p95                           301    4   1.33  0.8396   0.4576   ρ regression
K=3 p99 (renorm)                  379    5   1.32  0.8556   0.4579   ★ Pareto-strict
K=3 + parallel dedup + p99        417    8   1.92  0.8618   0.4416
K=3 + chord weight + p99          500   10   2.00  0.8643   0.3938
K=3 + both + p99                  513   15   2.92  0.8652   0.3697   delayflower discrim
K=3 + both + max-norm             888   24   2.70  0.8763   0.3697   max top discrim
```

### 핵심 audit cases

```
                       v3 (current)  K=3 + p99   K=3 + both p99
JUMMER -Delayed-       1.000         1.000       1.000
delayflower            1.000         1.000       0.890   ← user perception 정합 only here
Liszt パガニーニ        1.000         1.000       1.000
Liberte ★ Another      0.240         0.225       0.154
Liberte ★★ egalite     0.236         0.210       0.121
水晶 MANIAC            1.000         0.564       0.255   (chord-stream desat)
HFWT                   0.594         0.104       0.067   (chord-stream desat)
裁きの鐘                0.919         0.534       0.278   (chord-stream desat)
```

### 결정 보류 이유 (user 의견)

1. **K=3 + p99 (Pareto-strict)** — 진행 가능하지만 *delayflower vs JUMMER 구분 안 됨* (둘 다 saturated)
2. **K=3 + both** — perceptual fix 하지만 WF +9 cost
3. **둘 다 algorithmic limit 의 trade-off** — 진정한 해결 = audio FFT (Phase 1V)

---

## 3. Phase 1V 핵심 — Keysound-aware stair detection

### 3.1 user 통찰 (2026-05-08)

> "키음의 연결성을 고려해보고 싶어. 계단이라면 연속적인 옥타브가 가정되서 깔릴텐데."
>
> "각 축의 패턴을 고려할 때 키음의 상관관계도 함께 감안하는 게 어떨까? (단, stair 축에만 우선 고려)"

### 3.2 가설

```
진짜 stair 의 본질 = lane progression (geometry) + scale/pitch progression (musical intent)

알고리즘이 capture 가능한 것:        알고리즘이 capture 못 하는 것:
  ✓ 단조성 (lane direction)          ✗ "intentional sweep"
  ✓ 길이 (chain length)              ✗ "musical phrasing"
  ✓ 박자 (gap timing)                ✗ "scale progression"  ← Phase 1V 의 target
  ✓ chord 깊이 (K filter)            ✗ "harmony vs melody"
  ✓ 병렬성 (parallel dedup)
```

### 3.3 Token heuristic POC 결과 (2026-05-08)

```
chart                  |diff|=1%   |diff|=0%   avg |diff|   결론
파가니니 (Liszt)        49.1%       0.0%        3.55       ★ scale 기반 stair (진짜)
delayflower             2.3%       30.9%        4.97       ★ NOT scale (modular 6 = chord voice cycle)
JUMMER -Delayed-        9.9%       34.9%       20.97       percussion (single instrument 반복) — scale 없음
Liberte ★ Another       6.8%        3.8%      161.97       다양한 wav (random)
[life] cycling chord    60.0%       0.0%        4.31       UNEXPECTED — chord cycle 이 우연히 consecutive
HFWT (chord-stream)    25.0%       8.3%      217.50       chord-stream + 다양한 wav
```

**verdict**: 
- 가설은 *Liszt (49%) vs delayflower (2%)* 에서 명확히 검증
- 그러나 token heuristic 만으로는 unreliable:
  - JUMMER 같은 percussion stair 구분 불가
  - Liberte 같은 varied wav 분배 false negative
  - [life] 같은 chord cycle false positive
- token (wav_id) 가 *임의 할당* 되므로 pitch 추정 unreliable

### 3.4 진정한 검증 = Audio FFT pitch detection

#### 구현 plan

```
1. 각 chart 의 wav 디렉토리 인식
   - BMS 파일 디렉토리에 # WAV definitions
   - 파일 path: {chart_dir}/{wav_filename}
   - 일부는 .ogg / .mp3 / .flac 등 다른 format

2. Per-wav pitch detection (cache)
   - librosa 또는 scipy.signal 로 fundamental frequency 추출
   - YIN / pYIN 알고리즘 (단음 추적 잘 됨)
   - 또는 spectral peak detection (CQT chroma 기반)
   - 결과: wav_id → frequency (Hz) 또는 MIDI note number
   - cache to JSON: {wav_path: pitch_hz}

3. Per-chart cache build
   - Per chart, build event → pitch mapping
   - cache: {chart_file: {tkey: {lane: pitch_hz}}}
   - corpus-wide ~5995 SP charts, audio loading 비용 큼
   - 추정: ~수 시간 (병렬화 가능)

4. Stair chain pitch progression analysis
   - For each detected chain (v3 spec)
   - Extract pitch sequence: pitch[step_0], pitch[step_1], ...
   - 음정 차이 (semitone) 계산: diff_i = round(12 * log2(pitch_i+1 / pitch_i))
   - Scale progression detection:
     * Stair-like: |diff| ∈ {1, 2} (chromatic or whole-tone scale)
     * Octave: |diff| = 12
     * Chord-voicing: |diff| > 4 mostly (jumping arpeggio)
     * Random: 분산 큼
   
5. Stair score modulation by pitch
   - chain "stair-likeliness" = fraction of steps with |semitone_diff| ≤ 4
   - Adopt as multiplier: x_stair = base_x_stair × stair_likeliness
   - 또는 threshold: chain 만 fully count if pitch fits scale pattern
```

#### Phase 1V plan: stair 축 한정 (user 명시)

```
- chord, stream, peak 축은 *Phase 1V 적용 대상 아님*
- user: "Stair 축에만 우선 고려"
- 다른 axis 확장은 Phase 1W+ 별도 결정
```

### 3.5 Implementation effort 추정

```
1. Audio loading + FFT pitch detection 코어:    1-2 hours
2. WAV → pitch cache (corpus build):            2-4 hours (병렬화 OK)
3. Chain pitch progression analyzer:            1-2 hours
4. Integration into _axes_r1_character:         1 hour
5. Sweep + validate:                            2-3 hours
                                                ─────────────
                                                ~7-12 hours total
```

### 3.6 Library / dependency 후보

```python
# Option A: librosa (가장 표준)
import librosa
y, sr = librosa.load(wav_path)
f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=50, fmax=2000)
fundamental_hz = np.median(f0[voiced_flag])

# Option B: scipy.signal (가벼움)
from scipy.signal import find_peaks
import numpy as np
# FFT, peak detection — manual approach

# Option C: aubio (실시간 pitch 전문)
# pip install aubio
import aubio
pitch_o = aubio.pitch("yin", buf_size, hop_size, sr)
```

권장: **librosa.pyin** (정확도 높음, 표준)

### 3.7 Edge cases / 주의

```
1. 무조 음악 (atonal): scale-progression 없음 — stair 인지 모호
   - user 인지: "무조음악이라면 어쩔 수 없지만"
   - fallback: pure-geometry-based detection (Phase 1U state)

2. Percussion-stair (JUMMER): same wav 반복 → pitch invariant
   - "stair" but no scale
   - 처리: "rhythmic stair" 별도 카테고리
   - 또는 pitch 무관 stair 도 OK 인정

3. Chord voicing cycle (delayflower): 6-note pattern
   - pitch diff modular (e.g., 7, 12, 7, 12 = 5th + octave)
   - scale 아닌 harmony pattern
   - filter 가능

4. Multi-sample wavs (한 wav 안에 여러 음): pitch 모호
   - rare case
   - skip 또는 confidence weighting

5. Performance — 6000 차트 × 평균 100 wavs/차트 = 600,000 wav loads
   - parallelize across charts (mp.Pool)
   - librosa.pyin ~0.5s per wav → 600k × 0.5s / 8 workers = 10 hours
   - 1회 cache 만 build 하고 재사용
```

---

## 4. 다음 세션 시작 지점

### 4.1 우선순위 1: 결정 — adopt K=3 변형 immediate?

```
Option A (보수적): 현재 baseline 유지 (WF=6) → Phase 1V 만 진행
  - 코드 변경 없음
  - audio FFT 결과로 stair 자체 재설계
  
Option B (Pareto fix): K=3 + p99 채택 (WF=5)
  - 코드 변경 (1-2 lines + p95 → p99)
  - regen 필요
  - immediate Pareto win, audio FFT 와 별개로 안정
  
Option C (perceptual): K=3 + both + p99 (WF=15)
  - WF cost 큼
  - audio FFT 와 일부 redundant 가능
  - 권장 안 함 — audio approach 가 cleaner
```

내 추천: **Option A 또는 B**. C 는 audio FFT 와 정합성 충돌 위험.

### 4.2 우선순위 2: Audio FFT 구현

```
1. 환경 setup: librosa 설치, BMS audio loading test
2. 1 chart proof-of-concept (delayflower + JUMMER + Liszt 정도)
3. corpus-wide pitch cache build (병렬화)
4. Chain pitch progression analyzer
5. Stair score modulation
6. WF/ρ sweep
```

### 4.3 작업 환경

```
- 코어 모듈: C:\Repos\BMS.Tools\scripts\note_attributes.py
- 핸드오프: C:\Repos\BMS.Tools\AGENTS\PHASE1V_KEYSOUND_HANDOFF.md (이 파일)
- 캐시 디렉토리: C:\tmp\
- BMS sample 디렉토리: C:\Repos\BMS.Tools\samples\
- 각 chart 의 wav 디렉토리: BMS 파일 옆 (혹은 다른 path — `#WAV` definitions 확인)
```

---

## 5. Reference — 이번 세션 (Phase 1U) 핵심 발견 / 가설

### 5.1 architectural fix (적용됨)

```
1. Stair v3 spec: length≥3 + gap[6,12]
   - 이전: length≥2, gap 무제한
   - chord-stream length-2 fragment 제거
   - 8분-or-slower 제외
   
2. x_peak = peak_jab only
   - 이전: 0.5 × jab + 0.5 × uppercut
   - peak_uppercut (single window max) 가 single-burst 인플레 (裁きの鐘)
   - peak_l2 (top-K) 만 사용 — multi-burst 정확 측정

3. jack floor 12
   - 이전: 15
   - HF Spectrum etude in_stream=13 활성화
```

### 5.2 framework 한계 인식 (Phase 1V 으로 이월)

```
1. delayflower 2-finger parallel pattern
   - geometry: stair (length-4 chains × 2 parallel)
   - perception: 2-finger trill / double-roll
   - K-filter 로 부분 처리 가능, but trade-off

2. cycling chord-stream (e.g., [life] m80)
   - 6-key chord with rolling missing lane
   - geometry: length-2 chain per step
   - perception: chord roll, NOT stair
   - K=3 으로 처리 가능

3. JUMMER vs delayflower 같은 burden 값
   - 둘 다 saturated under p95
   - perception: JUMMER > delayflower 명확
   - 알고리즘 limit — *audio approach 필요*
```

### 5.3 Sweep 한 시도 / 결과 reference

```
시도                                결과                    채택
═══════════════════════════════════════════════════════════════
section CV / max-mean ratio          WF -2 ~ +5             rejected (correlation 약함)
HF Travel chord-burst 의 section 분석   user 통찰 검증 OK      Phase 1V 으로
Audio token continuity heuristic     Liszt vs delayflower OK
                                     JUMMER 적용 안 됨        Phase 1V 으로 (audio FFT)
K=3 chord-size filter                WF -2, ρ -0.013        보류
K=3 + p99 normalization              WF -1, ρ +0.003        보류 (Pareto-strict, 채택 가능)
K=3 + parallel-dedup                 WF +2 from K3-only     보류
K=3 + chord-size weight              WF +5 from K3-only     보류
K=3 + both                           WF +9 from K3-only     보류 (perceptual but cost)
sum4 (stair 제거 9-filter)            WF=9                   rejected
sum4 (stair 제거 8-filter)            WF=39 (cands ↑)        rejected
```

---

## 6. 캐시 + 스크립트 reference

### 캐시 (외부, regen 필요 시 별도)

```
C:/tmp/density_cv_cache.json         — corpus per-sec CV/burst (6703 SP)
C:/tmp/back_loaded_cache.json        — front/back density ratio
C:/tmp/strict_jack_cache.json        — j6/j12/j24 in/out stream
C:/tmp/total_header_cache.json       — TOTAL header (8555 entries)
C:/tmp/section_cv_cache.json         — section-level CV (rejected variant)
C:/tmp/stair_v4_cache.json           — chord_size + new-lane chain cache
C:/tmp/stair_v6_cache.json           — chord_size + parallel + chord weight cache
```

### 핵심 스크립트 (이번 세션)

```
C:/tmp/phase1u_residual11_audit.py             — 잔여 11 페어 audit
C:/tmp/phase1u_residual11_family_tier.py       — family-tier breakdown
C:/tmp/phase1u_xpeak_weight_sweep.py           — peak_jab vs uppercut sweep
C:/tmp/phase1u_jack_floor_sweep.py             — jack floor 8/10/12/15 sweep
C:/tmp/phase1u_chain_chord_size_test.py        — chord_size at chain step
C:/tmp/phase1u_stair_v4_cache.py               — K-filter cache build (v4/v5)
C:/tmp/phase1u_stair_v4_sweep.py               — K-filter WF/ρ sweep
C:/tmp/phase1u_stair_v4_norm_sweep.py          — K=3 + p95/p97/p99/max sweep
C:/tmp/phase1u_stair_v6_cache.py               — parallel + chord weight cache build
C:/tmp/phase1u_stair_v6_sweep.py               — v6 variant sweep
C:/tmp/phase1u_v6_both_norm_sweep.py           — K=3+both norm sweep
C:/tmp/phase1u_keysound_continuity_poc.py      — token continuity POC ★
C:/tmp/phase1u_delayflower_audit.py            — delayflower 2-finger 발견
C:/tmp/phase1u_flameflower_m80.py              — [life] m80 cycling chord 발견
C:/tmp/phase1u_hfwt_pairs_audit.py             — HFWT 의 모든 LOWER 후보 audit
```

### Memory entries (저장 요망)

```
project_phase1u_xpeak_v_l2.md            — peak_jab only 채택 근거
project_phase1u_jack_floor_12.md          — jack floor 15→12 (HF Spectrum etude)
project_phase1u_stair_k3_swept.md         — K=3 sweep 결과 + 미채택 이유
project_phase1u_keysound_continuity_poc.md — POC findings (Phase 1V handoff)
project_phase1v_audio_fft_plan.md         — Phase 1V 계획
feedback_perceptual_vs_empirical_trade.md — user 의 perception vs WF trade-off insight
```

---

## 7. Phase 1V 핵심 결정 사항 (next session)

```
1. 즉시 채택 vs Phase 1V 대기:
   - K=3 + p99 (Pareto-strict, 안전한 간단 변경) 즉시 채택?
   - 또는 audio FFT 와 함께 한꺼번에 stair 재설계?
   
2. Audio FFT 구현 시간 budget:
   - ~7-12 hours (cache build 포함)
   - 첫 세션 in scope?
   
3. Audio FFT 적용 범위:
   - user: "Stair 축에만 우선 고려"
   - chord/stream/peak 적용은 Phase 1W+?
   
4. Edge cases 처리:
   - JUMMER (rhythmic stair): pitch invariant 도 OK?
   - 무조 음악: fallback to geometry?
   - chord voicing cycle (delayflower): scale-not-detected → score 감산?
```

---

## 8. user instructions / preferences (durable)

```
- "ship" 언어 금지 (banned: ship, shipped, ship-grade 등)
- "outlier" 단순 framing 금지 (잔여 페어 = framework defect)
- WF 가 critical metric (ρ/CC 보조)
- Pareto-strict 우선, perceptual fix 는 trade 검토
- Architectural correctness 중시 (broken metric 끌고 가지 말 것)
- 정성 단서 (audit case) 받으면서 진행
- *premature 마무리 / freeze 금지* — user 가 명시적 결정
- 다음 세션 fresh context 로 시작 — 이 handoff 가 starting point
```

---

## 9. handoff 사용법 (next session)

```
1. 이 파일 (PHASE1V_KEYSOUND_HANDOFF.md) 읽기
2. memory/MEMORY.md 의 phase1u_* / phase1v_* entries 확인
3. 현재 baseline (Section 0) 검증
4. Phase 1V audio FFT 구현 시작:
   a. librosa 설치 + BMS audio path 확인
   b. proof-of-concept (delayflower + JUMMER + Liszt 3 charts)
   c. pitch progression 시각화
   d. corpus pitch cache build (~수 시간)
   e. Stair score modulation
   f. WF/ρ sweep + validation

또는 (옵션):
   a. K=3 + p99 즉시 채택 → regen → baseline 측정
   b. 그 후 audio FFT 진행
```
