# Phase 1V — Audio FFT keysound modulation (in-progress)

세션: 2026-05-08
상태: **결과 검증 완료, 채택 결정 + implementation 대기**

---

## 0. TL;DR

```
가설 (user 통찰): 진짜 stair = lane progression + 음정 progression (scale)
                  chord-stream incidental "stair" = 음정 무관 (false positive)
                  → keysound (audio FFT) 가 2nd-order signal

검증: 5-chart POC + 5995 SP corpus 처리 완료
가설 partial 검증:
  - Liszt 파가니니: scale% 70%, factor_α=0.685 → real scale stair ✓
  - delayflower: same% 66%, factor_α=0.107 → 2-finger same-pitch repeat ✓
  - JUMMER: percussion (pitch 신호 없음) → factor 낮음 (path 1: stair 아님) ✓
  - Liberte: varied wavs (low coverage) → audio 신뢰성 낮음
  - HFWT: chord-stream (low coverage) → audio 신뢰성 낮음

empirical Pareto frontier:
  baseline                     WF=6  ρ=0.853 (current Phase 1U end-state)
  γ cov≥70% (near-neutral)     WF=6  ρ=0.851 (-0.002)
  γ sat>60% + chains≥100       WF=4  ρ=0.847 (-0.006)  ★ best balance
  γ sat>60% only               WF=4  ρ=0.846 (-0.007)
  γ sat>60% + cov≥10%          WF=3  ρ=0.832 (-0.021)  aggressive WF
```

---

## 1. 인프라 (built — 재사용 가능, persistent caches)

```
C:/tmp/phase1v_chart_index.json          (~10 MB)
  - 8555 samples charts → BMS.Generator dir 매핑 (md5 기반, 100% match)

C:/tmp/phase1v_stair_wav_list.json       (~25 MB)
  - 453,325 unique WAV paths (v3 chain step 에 참여하는 wav 만)

C:/tmp/phase1v_pitch_cache.json          (~74 MB)
  - 453,325 wav 의 librosa.yin pitch 결과
  - 분류: ok (181,619 = 40%), unvoiced (2,821), fail/noisy (268,885 = 60%)
  - gate: voiced≥4 frames AND std_rel<0.15 (pitch consistency)
  - 빌드 시간: 11.4분 (8 workers, 0.5s duration per file, soundfile direct read)

C:/tmp/phase1v_audio_stair_cache.json    (~3 MB)
  - 5894 SP charts × {base, alpha, beta, gamma, delta} burden_per_sec
  - per-chart stats: n_chains, voiced steps, scale/arp/cj/large/same counts
  - 빌드 시간: 15.1분
```

---

## 2. Pitch detection 환경

```
Library:    librosa 0.11.0 + soundfile 0.13.1
Algorithm:  librosa.yin (autocorrelation, ~1ms per call, vs pyin 230ms)
Audio:      first 0.5s of each WAV (BMS samples are short single-note)
Gate:       std_rel < 15% (frame-by-frame pitch consistency)
              tonal samples: std_rel ~0-7%
              percussion:    std_rel 40-125% (correctly filtered)

Filename heuristic 거부 이유:
  - flameflower의 piano1A4.wav 실제 pitch = 220.6Hz = A3 (1 octave off)
  - Liszt etud_A4.wav 실제 = 441.3Hz = A4 ✓
  - 즉 author convention 신뢰 불가, audio FFT 가 ground truth
```

---

## 3. Factor formulas (chain-level)

```
Per chain step, |Δ| in semitones (audio FFT 기반):
  same:       |Δ| < 0.5      (동일 wav 반복)
  scale:      |Δ| ∈ [1, 2]   (chromatic / whole-tone)
  arpeggio:   |Δ| ∈ [3, 5]   (3rd / 4th)
  chord_jump: |Δ| ∈ [6, 12]  (5th / 6th / octave — Liszt's gymnastics)
  large:      |Δ| > 12       (random)

Per chain factor (n_steps = total chain steps including unvoiced):
  alpha:  n_scale / n_steps                                              # 가장 strict
  beta:   (n_scale + 0.5×n_arpeggio) / n_steps                            # melodic
  gamma:  (n_scale + 0.5×n_arpeggio + 0.3×n_chord_jump) / n_steps         # melodic + Liszt 옥타브 도약
  delta:  1 - n_same/n_steps                                              # anti-same-pitch only

Modulated burden per chain:
  contribution = (length-1) × pace_weight × factor
  burden_per_sec = sqrt(sum(contributions²)) / chart_seconds
```

---

## 4. 정규화 + gate (핵심 fix)

### 정규화: p95_BASE 사용 (NOT p95_modulated)

```
잘못된 시도 (initial sweep): p95_modulated 사용
  - p95_α = 0.206 vs p95_base = 0.926 (4.5x 작음)
  - delayflower base 1.48 → α 0.228 (deflation 6.5x)
  - 그러나 p95_α 도 작아서 0.228/0.206 = 1.11 → clip01 = 1.0 (saturated 유지)
  - 파가니니 trans 같은 chart: base 0.412 → α 0.268 → 0.268/0.206 = 1.30 → 1.0 (false positive saturation)
  - 결과: WF +4, ρ -0.030 (worse than baseline)

수정: p95_BASE (=0.926) 사용
  - delayflower α 0.228/0.926 = 0.247 (correct deflation)
  - 파가니니 trans α 0.268/0.926 = 0.290 (preserved + slight deflate)
  - 결과: WF +13 (over-deflate low-coverage charts)
  
→ 추가 gate 필요
```

### Gate: saturation-targeted (best 발견)

```
intervention 조건: 현재 x_stair > 0.6 (이미 saturated 인 chart 만)
                   AND chain_count ≥ 100 (enough audio sample for confidence)

작동:
  if x_stair_base > 0.6 AND n_chains >= 100:
    x_stair = clip01(modulated_burden_γ / p95_base)
  else:
    x_stair = baseline (변경 없음)

이유:
  - mid-tier chart 변경 안 함 (audio noise 영향 0)
  - false-positive saturation (chord-stream, 2-finger pattern) 만 deflate
  - low-chain-count chart 보호 (<100 chains 면 audio 신뢰성 낮음)
```

---

## 5. Empirical sweep 결과

### Pareto frontier

```
variant                              cands   WF   CC%    ρ_h     Δρ
═══════════════════════════════════════════════════════════════════
baseline (Phase 1U end-state)         407    6  1.47  0.8529   ─    ← current
γ cov≥70% (audio impact 최소)         402    6  1.49  0.8506  -0.002
γ sat>60% + chains≥100                417    4  0.96  0.8465  -0.006  ★ best balance
γ sat>60% only                        417    4  0.96  0.8456  -0.007
β sat>60% only                        435    4  0.92  0.8451  -0.008
β cov≥40%                             344    4  1.16  0.8425  -0.010
γ sat>65%                             396    4  1.01  0.8429  -0.010
γ sat>70%                             376    4  1.06  0.8411  -0.012
γ sat>60% + cov≥30%                   355    4  1.13  0.8410  -0.012
α cov≥40%                             340    4  1.18  0.8396  -0.013
γ sat>60% + cov≥20%                   317    3  0.95  0.8354  -0.018  ★ aggressive WF
γ sat>60% + cov≥10%                   289    3  1.04  0.8315  -0.021
α p95_α (initial wrong norm)          256   10  3.91  0.8233  -0.030  rejected
γ sat>50%                             486    8  1.65  0.8502   ─       no WF improvement
γ sat>55%                             459    6  1.31  0.8502   ─       no WF improvement
```

### Audit cases (γ sat>60% + chains≥100)

```
chart                          base    final   verdict
═══════════════════════════════════════════════════════
delayflower (st t5)            1.000   0.247   ✓ chord voicing cycle deflate
JUMMER LASER REMIX (st t0)     0.987   0.322   ✓ percussion deflate
Liszt 파가니니 [trans] (★★ t3) 0.412   0.290   slight deflate (preserved)
Liszt 파가니니 [bravoure] (★★) 0.931   0.572   slight deflate (preserved high)
flameflower [life] (st t8)     0.738   0.738   base 유지 (≤0.6, NOT saturated)
flameflower [ClimaX] (sl t5)   0.720   0.720   base 유지
HFWT (st t7)                   0.594   0.594   base 유지 (≤0.6)
HFWS Spectrum (st t4)          0.549   0.549   base 유지 (≤0.6)
水晶 GOD (st t3)                1.000   1.000   base 유지 (chains≥100 fail)
裁きの鐘 (st t1)                0.919   0.919   base 유지 (chains≥100 fail)
Liberte ★ (★★ t3)              0.235   0.235   base 유지 (≤0.6)
Demystify Feast NORM+ (★★ t2) 0.561   0.561   base 유지 (≤0.6)
파가니니 S140 (★★ t3)           0.412   0.412   base 유지 (≤0.6)
```

intervention scope: ~150-200 charts (corpus 5894 중 ~3-4%).

---

## 6. 채택 결정 후보 (user 결정 영역)

```
A. 채택 안 함 (Phase 1V scope null) — Phase 1U 완성도로 freeze
   pros: 단순, 추가 코드/cache 의존성 없음
   cons: 가설 검증 결과 무시; perceptual 일부 case 보류
   
B. γ cov≥70% 채택 — near-neutral, audio 영향 최소
   pros: WF 동일, ρ 거의 동일 (-0.002), 무리 없는 audio integration
   cons: 사실상 의미 있는 영향 없음
   
C. γ sat>60% + chains≥100 채택 — best balance ★
   pros: WF -2 (33% reduction), ρ -0.006 (modest)
   cons: ρ 완전 Pareto-strict 아님 (작은 trade)
   
D. γ sat>60% + cov≥10% 채택 — aggressive WF
   pros: WF -3 (50% reduction)
   cons: ρ -0.021 (significant)

implementation cost (any 채택):
  - librosa + soundfile dependency 추가 (~수 GB venv)
  - phase1v_pitch_cache.json (74 MB) + phase1v_audio_stair_cache.json (3 MB) corpus regen
    마다 재빌드 필요
    혹은 chart_md5 keyed pre-computed scale_factor 만 cache (~5 MB)
  - note_attributes.py 변경:
    a. _PHASE1V_AUDIO_CACHE load on import
    b. metric_stair() audio-modulated burden 별도 계산
    c. _axes_r1_character() x_stair 의 sat-gate logic
```

---

## 7. 다음 세션 시작 지점

```
1. 이 문서 + memory/project_phase1v_audio_pareto_candidates.md 읽기
2. user 채택 결정 받기 (A/B/C/D)
3. 채택 시:
   a. note_attributes.py 변경 (chain detection 에서 token 캡쳐 + scale_factor 계산)
   b. corpus regen (BMS.Tools/scripts/batch_attrs.py 실행)
   c. 새 baseline 측정 (phase1v_audio_stair_sweep.py)
   d. Phase 1V handoff 완료
```

---

## 8. Reference scripts (재현용)

### 인프라 빌드 (재실행 1회)
```
C:/tmp/phase1v_build_md5_index.py        → chart_index.json (md5 매핑)
C:/tmp/phase1v_collect_stair_wavs.py     → stair_wav_list.json (대상 wav 추출)
C:/tmp/phase1v_build_pitch_cache.py      → pitch_cache.json (yin pitch detection)
C:/tmp/phase1v_audio_stair_cache.py      → audio_stair_cache.json (per-chart variants)
```

### Sweep / audit (분석)
```
C:/tmp/phase1v_audio_poc.py              → 5-chart proof-of-concept
C:/tmp/phase1v_validate_poc_against_corpus_cache.py → POC vs corpus consistency
C:/tmp/phase1v_diagnose_anomalies.py     → α=1.000 anomaly 진단
C:/tmp/phase1v_audio_stair_sweep.py      → α/β/γ/δ p95_α normalization
C:/tmp/phase1v_normalization_sweep.py    → p95_BASE + cov gate variants
C:/tmp/phase1v_cov_sweep.py              → cov threshold sweep
C:/tmp/phase1v_targeted_sweep.py         → saturation-targeted sweep
C:/tmp/phase1v_combined_sweep.py         → sat + cov + chains 결합
```

---

## 9. 검증된 user 통찰

```
1. "키음의 연결성" 가설 검증:
   - Liszt (47-70% scale) vs delayflower (87% same) — clean discrimination
   - Audio FFT 가 lane geometry 만으로 못 잡는 정보 확실 capture
   
2. "stair 자체가 마음에 안 드네" 의 empirical 매핑:
   - 현재 x_stair 가 false positive saturation 유발 (delayflower, JUMMER LASER 등)
   - audio modulation 으로 17개+ charts 정확 deflate
   
3. Path 1 ("stair = melodic only, percussion 은 jack/peak 로") empirical 검증:
   - JUMMER 같은 percussion stair 자동 down-rate
   - 그러나 chord-stream 은 audio coverage 낮아서 base 유지 (sat-gate 의 의도)
```

---

## 10. 미해결 / Phase 1W+ 후보

```
1. step-level weighting: chain-level factor 대신 each step 별 weight
   (현재 결과로 marginal gain 예상; 시도 가치 낮음)
   
2. cluster-conditional modulation: chord-stream cluster (HIGH per memory) 만
   modulation — 더 targeted intervention
   
3. audio + Phase 1U K=3 chord filter 결합
   (audio 가 K=3 와 orthogonal? 미검증)
   
4. axis 확장: chord 축에 audio (delayflower 같은 동음 lane 패턴 → chord 축 redesign)
```
