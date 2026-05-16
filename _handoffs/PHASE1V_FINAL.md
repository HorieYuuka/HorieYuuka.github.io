# Phase 1V — FINAL (K=3 + p99 adopted, audio rejected)

세션 종료: 2026-05-16

---

## 0. TL;DR

```
Phase 1V audio FFT 가설 (user 2026-05-08):
  "stair = scale 옥타브 연속" → audio FFT 로 검증

검증 결과 (2026-05-16, user audit):
  - 부분 검증: delayflower-class (same-pitch repeat), L9 (random pitch)
  - 부분 실패: 熊蜂의 飛行 (4번 마디 stair), Terminal Strike (50-57 stair)
  - 결론: "stair 배치가 꼭 audio-sequential 하지 않다"
  - audio modulation 이 real stair (chord 사이에 끼어있는 stair sections) 도 deflate

대체 채택: K=3 chord_size filter (geometric, audio 없이)
  - denim 1357→246 (size 4, 3) → 차단 ✓
  - real stair (size 1-2) → 통과 ✓
  - 동일한 user motivation 달성, audio dependency 없음

Empirical (post-regen 2026-05-16):
  AEζηκ baseline:  WF=5  ρ_h=0.8556  (pre-K3: WF=6 ρ=0.8529)
  → Pareto-strict: WF -1, ρ +0.003

Phase 1V purity factor (2026-05-17, user adoption):
  x_stair := x_stair_raw × (1 - 0.5 × x_chord)
  User audit: Empress[フルマラソン]/Complex[さぼてんのとげザ－] (HIGH, x_chord ~0.27)
  vs Icyxis[Mystery]/覚醒[DEATHER] (MEDIUM, x_chord ~0.48). Multiplier discriminates.
  Post-regen baseline: AEζηκ WF=8 ρ_h=0.8653 (non-Pareto-strict: WF +3, ρ +0.010).
```

---

## 1. Adopted spec

### Code changes (`scripts/note_attributes.py`)

```python
def _detect_stair_chains_v2(
    playable_events, sec_table, chord_threshold_ms, player_lanes,
    max_step=1,
    gap_min_ticks=6, gap_max_ticks=12,
    min_chain_length=3,
    max_chord_size=3,        # ← Phase 1V (2026-05-16): K=3 denim filter
):
    # ...
    for i in range(1, len(eff)):
        # ...
        gap_in_range = (gap_min_ticks <= gap_tk <= gap_max_ticks)
        chord_ok = (                   # ← Phase 1V
            len(prev_lanes) <= max_chord_size
            and len(cur_lanes) <= max_chord_size
        )
        if gap_in_range and chord_ok:
            # extend chain
        # Emit logic also gated by `chord_ok`

_PHASE1U_P95["SP"]["stair_burden_per_sec"] = 0.9812   # K=3 + p99 (was 0.9255)
_PHASE1U_P95["DP"]["stair_burden_per_sec"] = 0.9812   # SP-derived (refine after DP regen)
```

### Architectural rationale

```
denim pattern: 1357 → 246 → 1357 (chord-stream alternation)
  - chord_size sequence: 4, 3, 4
  - K=3 filter: max(prev, cur) > 3 → block chain extension
  - real stair (single note ascending): chord_size 1
  - chord-into-stair transition: chord_size 1-2 (passes K=3)

p99 vs p95 normalization:
  - K=3 burden distribution: more compressed (top 5% removed)
  - p95_K3 = 0.7107, p99_K3 = 0.9812
  - p99 keeps top-tier discrimination intact
```

---

## 2. Audit cases (post-regen baseline, 2026-05-16)

```
chart                                  base→K3+p99   verdict
═══════════════════════════════════════════════════════════════
real stairs (preserved):
  熊蜂의 飛行 Psy (sn t9)              0.664→0.374   ✓
  T.S Terminal Strike [GOD] (st t1)    0.946→0.662   ✓
  NO NIGHT MORE SOUL [HARDEST] (★17)   0.764→0.571   ✓
  我武者羅[殺] (★★ t4)                 0.843→0.378   ✓
  MEPHISTO [FS] (?? t6)                ~1.0 →0.734   ✓
  SYNTHETICS (sl t11)                  1.000→0.894   ✓
  MooNatioN (st t2)                    1.000→0.548   ✓
  Absolute Gate [四次元への扉] (st t5)   1.000→0.588   ✓
  ポケモン Haxorus (st t6)              1.000→0.508   ✓
  Ladymade corestar (st t10)           1.000→1.000   ✓ preserved
  Liszt 발狂2 (★★ t5)                  ~1.0 →0.582   ✓

chord-stream / NOT stair (deflated):
  L9 -Heaven- (st t11)                 0.815→0.318   ✓ NOT stair fix
  L9 -Genocide- (st t10)               0.756→0.199   ✓ NOT stair fix
  Demystify Burst[BLAST] (st t0)       0.635→0.311   ✓ stream/peak dominant
  Hyper Fiber World Travel (st t7)     0.594→0.104   ✓ chord-stream desat
  水晶世界 [MANIAC] (st t1)             1.000→0.564   ✓ chord-stream desat
  裁きの鐘 (st t1)                       0.919→0.534   ✓ chord-stream desat

residuals (K=3 못 잡음):
  delayflower (st t5)                  1.000→1.000   chord_size=2 통과
  BAMBOO TWIST (sl)                    1.000→0.959   percussion-only
  JUMMER -Delayed- (st)                1.000→1.000   rhythmic stair preserved
  Liberte (★, ★★)                      0.240→0.225   varied wavs
```

---

## 3. Empirical comparison

```
                    Pre-K3 (Phase 1U end-state)   Post-K3 + p99
  D1                WF=24  ρ_h=0.8079             WF=17  ρ_h=0.7873
  A                 WF=19  ρ_h=0.8158             WF=14  ρ_h=0.8004
  AEζηκ             WF=6   ρ_h=0.8529             WF=5   ρ_h=0.8556   ← Pareto-strict

cands change: 407 → 379 (-28, axis filter narrowed due to deflated chord-stream)
```

---

## 4. Phase 1V audio infrastructure (preserved, not adopted)

Phase 1V 가 채택되지 않았지만 infra 는 **보존** — Phase 1W+ 에서 다른 axis 적용 검토.

```
preserved files (재사용 가능):
  C:/tmp/phase1v_chart_index.json          (~10 MB, 8555 charts md5)
  C:/tmp/phase1v_pitch_cache.json          (~74 MB, 453,325 wavs librosa.yin)
  C:/tmp/phase1v_audio_stair_cache.json    (~3 MB, 5894 charts per-chart variants)
  C:/tmp/phase1v_stair_wav_list.json       (~25 MB)

Phase 1V infrastructure 발견:
  - librosa.yin + std_rel<0.15 gate: tonal vs percussion 명확 discrimination
  - 453k wav pitch detection in 11.4 min (8 workers)
  - factor_α / β / γ / δ per-chart variants

Phase 1W+ candidate uses:
  - chord 축 audio: delayflower-class chord-voicing-cycle detection
  - audio + density 결합 stream/peak character 추출
  - 다른 axis 의 predictive feature 로 활용
```

---

## 5. 잔여 페어 (Phase 1V end-state, 5 페어)

```
post-regen sweep AEζηκ: 5 inversions (cands 379)

다음 phase 분석 가능:
  1. delayflower 같은 fine-denim chord_size=2 패턴 처리
  2. BAMBOO TWIST 같은 percussion-only saturated 케이스
  3. JUMMER 같은 rhythmic stair 의 다른 axis 처리
```

---

## 6. user durable instructions (cross-session)

```
- "stair" 가설 limitation 확인됨:
  - "scale 옥타브 연속" 만이 stair 아님
  - chord 사이 stair sections 도 real stair
  - geometric chord_size filter 가 audio 보다 더 안전

- audio infra 재사용 가능 — Phase 1W+ 에서 다른 axis 적용

- "ship" 언어 금지 (durable)
- premature 마무리 / freeze 금지 (durable)
- WF empirical metric 우선 (ρ/CC 보조)
- 정성 단서 (audit case) 받으면서 진행
```

---

## 7. 다음 phase 시작 지점 (Phase 1W)

```
1. memory 자동 load 됨:
   - project_phase1u_stair_k3_swept.md (K=3 채택 record)
   - project_phase1v_audio_reject.md (audio 거부 record + infra preserved)
   - project_phase1v_audio_pareto_candidates.md (historical sweep data)
   - feedback_perceptual_vs_empirical_trade.md
   
2. 잔여 5 페어 분석 + axis 개선:
   a. chord 축 redesign (delayflower fine-denim 처리)
   b. 또는 audio 를 chord 축에 적용 검토 (preserved infra)
   c. 다른 axis (peak / stream) tuning
   
3. Phase 1 closure 시점 결정:
   - 현재 AEζηκ pipeline 안정 (WF=5, ρ=0.856)
   - 잔여 5 페어 처리 완료 시 Phase 1 closure 후보
```
