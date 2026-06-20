---
layout: scale_analyzer
title: "Framework paper (한국어)"
permalink: /Note-attributes/Framework-paper-ko
parent: "Note attributes"
nav_exclude: true
has_toc: false
---

<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true
  },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

<style>
.fp-langbar { display: flex; gap: 0; margin: 0.4rem 0 1.1rem 0; border-bottom: 1px solid #d0d7de; }
.fp-langtab { padding: 0.4rem 0.95rem; font-size: 0.9rem; font-weight: 600; color: #57606a !important; text-decoration: none; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; margin-bottom: -1px; }
.fp-langtab:hover { color: #1f2328 !important; background: #f6f8fa; text-decoration: none; }
.fp-langtab.is-active { color: #1f2328 !important; background: #fff; border-color: #d0d7de; border-bottom: 1px solid #fff; }
</style>
<div class="fp-langbar"><a class="fp-langtab" href="/Note-attributes/Framework-paper">EN</a><a class="fp-langtab is-active" href="/Note-attributes/Framework-paper-ko">한국어</a><a class="fp-langtab" href="/Note-attributes/Framework-paper-ja">日本語</a></div>

*라이브 도구: [차트 비교](/Note-attributes)*

# BMS 차트 캐릭터 프레임워크 — 7축 레이더, 태그, 그리고 시간축 정규화

**부제**: BMS 차트가 "어떤 종류로 어려운지" 를 1차원 점수가 아닌 다축 캐릭터 스냅샷으로 시각화하는 분석 프레임워크의 설계와 검증.

**버전**: Phase 1Z + soft v2 / stair v3 (2026-06-14)

> 이 문서는 BMS 커뮤니티를 대상으로 한 기술 보고서입니다. 차트 분석 / 음악 게임 난이도 평가에 대한 기본 지식을 전제하지만, 도입된 용어와 수식은 각 절에서 풀어서 설명합니다.

---

## 초록 (Abstract)

기존 BMS 난이도 라벨 (★, sl, st, 발광 BMS, 난이도표 등) 은 차트의 **요구 실력 강도** 를 1차원 스칼라로 압축한다. 그러나 같은 라벨이라도 차트가 어려운 *이유* 는 매우 다양하다 — 어떤 차트는 동시치기로 부담을 주고, 어떤 차트는 연타로, 어떤 차트는 변속으로 인지를 흔든다.

본 프레임워크는 차트의 *난이도 (difficulty)* 가 아닌 *캐릭터 (character)* — 즉 "어떤 종류로 어려운가" — 를 직접 시각화하는 데 초점을 둔다. 핵심 기여는 다음과 같다.

1. 7개 독립 축 (chord / stream / scratch / soft / ln / stair / distraction) 의 **parallel-ownership** 모델: 한 이벤트가 여러 축에 동시 기여 가능하며, 합이 1로 고정되지 않는다.
2. **felt-time 1초 버킷** 기반의 시간축 정규화로, BPM trick 차트의 NPS 과대 측정 문제를 해소.
3. 가족 상대 분위수 (p33 / p67) 와 절대 최소값 (0.03 / 0.08) 의 **이중 임계** 로, 희소 축이 raw 값만으로 red 처리되는 문제를 차단.
4. radar + tags + density bar 의 3-layer **카드 기반 비교 UI**.

총 8,555 개 BMS 차트 (SP 6,703 / DP 1,852) 코퍼스에 대해 calibration 및 검증을 수행했다.

---

## 1. 도입 (Introduction)

### 1.1 문제 정의

BMS 차트의 난이도는 전통적으로 **단일 점수** 또는 **단일 라벨** 로 표현된다.

- 가족 / 스케일 (sl1~sl12, st0~st10, ★1~★10, ★★1~★★10, …)
- 발광 / 난이도표 별점
- IRT (Item Response Theory) 기반 차트 별 θ 추정치

그러나 BMS 차트의 *부담의 종류* 는 다음과 같이 다양하다:

| 부담 유형 | 예시 |
|---|---|
| 동시치기 (chord) | 3+ 키 동시 입력 비율이 높은 차트 |
| 흐름 (stream) | 일정 NPS 가 길게 지속되는 차트 |
| 스크래치 (scratch) | 8키 (turntable) 사용 비율이 높은 차트 |
| 변속 (soft) | BPM 변화가 잦은 차트 |
| 롱 노트 (LN) | hold 의 비중이 높은 차트 |
| 음계 진행 (stair) | 키 진행이 음계 형태로 흐르는 차트 |
| 산만함 (distraction) | stream 중간에 scratch 가 섞이는 차트 |

같은 sl10 이라도 차트 A 는 chord-heavy 이고 차트 B 는 scratch-heavy 일 수 있다. 1차원 스칼라는 이 정보를 보존하지 못한다.

### 1.2 본 연구의 목표

차트의 **character snapshot** — 어떤 종류의 부담이 얼마나 강한가 — 을 직접 시각화한다. 본 프레임워크의 output 은 다음과 같다:

- **레이더 차트** — 7축의 강도를 hex polygon 으로 표시
- **태그 (boolean flags)** — 축이 담을 수 없는 sub-pattern (예: visual_gimmick, last_killing, double_tab)
- **density bar** — 차트 진행 시간에 따른 초당 NPS 변화

### 1.3 본 연구의 기여 (Contributions)

- **C1** Parallel-ownership 7-axis 모델 — 한 이벤트가 여러 축에 동시 기여, 합 ≠ 1
- **C2** felt-time 1초 버킷 (Z4) — BPM trick 의 NPS 폭증 차단 (8,000 NPS → 449 NPS)
- **C3** family-relative + absolute-floor 이중 임계 — 희소 축 false-red 차단
- **C4** scalar ↔ visualization invariant — 비교 표 column 이 카드 시각화와 자체 일관됨

---

## 2. 배경 (Background)

### 2.1 BMS 차트 구조

BMS 는 텍스트 기반 차트 포맷이다. 본 절은 후속 절에서 사용할 용어를 정의한다.

- **lane (line / channel)** — 키 위치. 7키 SP 의 경우 1-7 + 스크래치 (turntable, 통상 lane 8 또는 "S"). DP 는 14키 + 2 스크래치.
- **note** — lane × time 위치의 입력 지시.
  - **Tap (단타)** — 즉시 입력
  - **Long Note (LN)** — hold 입력, start + end 두 시점
- **tick** — 시간 단위. `#PLAYLEVEL` 와 무관하게 `#xxxNN` 라인 (마디 N, 채널) 의 슬롯 위치로 표현됨.
- **measure (마디)** — 음악적 마디. 기본 `4/4 = 192 tick`.
- **`#xxxNN02`** — 마디 길이 배율. 예: `#xxx02:0.5` → 그 마디는 절반 길이. **measure-scale trick** 의 핵심 메커니즘.
- **BPM** — 분당 비트. `#BPM xxx` (전체) 또는 `#BPMxx` (per-measure change) 로 정의됨.
- **`#STOP`** — 일시 정지 마디. 보통 짧은 stutter 용.
- **`#WAV` keysound** — 각 note 가 트리거하는 음원 슬롯 id.
- **chord** — 같은 tick 에 여러 lane note 가 동시 존재.

### 2.2 측정의 어려움

BMS 의 시간/밀도 측정은 다음 메커니즘으로 인해 단순 NPS 계산이 무력해진다.

**Class A — uniform BPM trick**: 전체 BPM 이 비현실적으로 높음 (예: 9,999,999). 모든 시간이 압축되어 NPS 가 천 단위로 폭증.

**Class B — segment BPM trick**: 차트 일부 구간만 비현실적 BPM. 그 구간에서 짧은 시간에 많은 노트.

**Class D — measure-scale trick**: `#xxxNN02:1000` 등으로 한 마디를 1,000배로 늘려서 그 안에 노트를 많이 채움. BPM 은 그대로지만 *마디 단위 NPS* 가 폭증.

**`#STOP`**: 짧은 정지가 빈번하면 평균 NPS 가 왜곡됨.

본 프레임워크는 이 메커니즘들을 인지하고 felt-time 보정 (§5) 을 도입한다.

### 2.3 기존 metric 들

- **NPS (Notes Per Second)** — 차트 전체 노트 수 ÷ 차트 길이. 평균값. Class A 차트에서 부풀려짐.
- **IRT-based θ** — 플레이어 clear/fail 통계로 chart 난이도를 베이지안 추정. 차트의 *clearable* 여부에 대한 추정이며 character 정보는 없음.
- **가족 (family) / 스케일 (scale)** — 큐레이션된 묶음 라벨. sl < st (satellite 스케일), ★ < ★★ (overjoy 스케일) 두 별개 패밀리. 대략적으로 sl ≈ ★, st ≈ ★★ 수준이고, ★20 부근부터 ★★1 과 겹쳐 시작.

### 2.4 본 프레임워크의 입장: difficulty ≠ character

본 프레임워크는 IRT clear-difficulty 와 의도적으로 **decoupling** 되어 있다. 같은 가족 cohort 내에서 sum-of-axes 와 IRT EASY-clear difficulty 의 Spearman 상관은 약 0.105 로 매우 낮다. 즉:

- **axes** = "이 차트는 어떤 부담을 가지고 있는가" (attribute strength)
- **IRT** = "이 차트는 클리어 가능한가" (clear difficulty)

두 측정은 서로 다른 질문에 답한다. axes 가 IRT 와 일치해야 한다고 강제하지 않는다.

### 2.5 가족 × 티어 단조성 (IRT 와 NPS 의 경험적 관계)

§2.4 의 decoupling 주장 (within-cohort 약한 상관) 만 보면 IRT 와 NPS 가 무관한 신호처럼 들릴 수 있다. **그렇지 않다** — 두 metric 은 **가족 × 티어 평균** 수준에서는 강하게 함께 움직인다. 무관한 것은 *같은 티어 내부의 chart-by-chart 랭킹* 뿐.

이 절은 본 framework 의 calibration (가족 상대 percentile) 과 design 철학 (axes ≠ difficulty, but both grow with family/tier) 의 경험적 기반이다.

#### 2.5.1 측정 방법

코퍼스 8,555 차트 중 **low-confidence 가 아닌** IRT 통계가 있는 SP 차트 5,371 개를 분석. 각 차트의 가족 라벨 (예: `sl12`) 을 base (`sl`) 와 tier (`12`) 로 분해. 가족별로 tier-by-tier 의 IRT EASY-clear difficulty 평균과 NPS_mean / NPS_max 평균을 계산.

이상적 패턴: tier 가 올라가면 두 metric 모두 monotonically 증가.

#### 2.5.2 세 가지 가족 class — 단조성 기대치가 다름

BMS 커뮤니티의 가족 큐레이션 관행에 따라, 가족마다 *tier 가 어떤 강도로 단조 증가하는지* 의 기대치가 다르다. 이를 세 class 로 식별한다:

| Class | 의미 | 해당 가족 |
|---|---|---|
| **linear-rank** | tier-mean 단조 + within-tier 랭킹도 안정 | SP: `sl`, `★` / DP: `DPsl`, `★` |
| **body-linear-top-break** | body (하위 3/4) 단조, top tier 는 specialist 차트 scatter 허용 | SP: `st`, `★★` / DP: `DPst`, `★★` |
| **mean-tracking** | tier 평균만 단조, within-tier 랭킹은 noisy 가정 | SP: `so`, `sn` |

#### 2.5.3 경험 데이터

**[Figure 1]** SP 가족 × tier 단조성. 좌 → 우: tier 별 mean IRT EASY-clear · NPS_mean · NPS_max. 색은 가족, 선 스타일은 class (linear-rank solid bold / body-linear solid / mean-tracking dotted).

![SP family × tier monotonicity](/Resource/Framework/figures/family_tier_monotonicity_SP.png)

→ 인터랙티브 HTML: [`figures/family_tier_monotonicity_SP.html`](/Resource/Framework/figures/family_tier_monotonicity_SP.html) (hover 시 tier-별 n 과 값 표시)

**[Figure 2]** DP 가족 × tier 단조성. 동일 구조. DP 코퍼스는 sample 이 작아 (n = 1,852) tier 범위가 짧지만 동일 단조 패턴 관찰.

![DP family × tier monotonicity](/Resource/Framework/figures/family_tier_monotonicity_DP.png)

→ HTML: [`figures/family_tier_monotonicity_DP.html`](/Resource/Framework/figures/family_tier_monotonicity_DP.html)

재생성: `python paper/plot_family_tier.py --mode both --png`

**linear-rank — `sl`** (티어 0-12, n = 1,965)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 238 | −2.64 | 11.88 | 21.08 |
| 3 | 167 | −1.68 | 15.21 | 27.03 |
| 6 | 132 | −0.96 | 17.47 | 30.94 |
| 9 | 109 | −0.42 | 19.37 | 33.62 |
| 12 | 160 | +0.28 | 21.05 | 36.31 |

IRT 와 NPS 둘 다 strict monotonic. tier-by-tier 차이가 일관됨.

**linear-rank — `★`** (티어 1-24, n = 952)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 1 | 47 | −2.48 | 13.15 | 25.55 |
| 6 | 47 | −1.38 | 15.86 | 28.30 |
| 12 | 57 | −0.43 | 18.25 | 33.26 |
| 18 | 28 | +0.39 | 20.26 | 38.61 |
| 24 | 7 | +1.70 | 25.13 | 47.71 |

24 단계 전부에 걸쳐 monotonic. 가장 긴 dynamic range.

**body-linear-top-break — `st`** (티어 0-11, n = 1,921)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 202 | +0.53 | 21.53 | 37.66 |
| 3 | 283 | +1.36 | 24.35 | 40.88 |
| 6 | 136 | +2.14 | 26.71 | 45.24 |
| 9 | 67 | +2.72 | 28.34 | 49.75 |
| **11** | **3** | **+3.38** | **31.28** | **52.67** |

body (tier 0-9) 는 깔끔. 상위 (tier 10, 11) 는 n 이 20, 3 으로 급격히 감소 — 통계로 안정한 monotonic 검정 불가. 큐레이션 관행상 top-tier 는 specialist 차트의 산포 영역이므로 metric 평가에서도 "body 단조 + top 분산 허용" 기준 적용.

**body-linear-top-break — `★★`** (티어 0-6, n = 264)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 1 | 45 | +1.19 | 21.03 | 40.78 |
| 3 | 61 | +1.75 | 22.61 | 43.56 |
| 5 | 29 | +2.53 | 25.88 | 49.10 |
| 6 | 5 | +2.83 | 28.32 | 51.40 |

`st` 와 같은 패턴 — body 단조, top n 감소.

**mean-tracking — `so`** (티어 0-12, n = 128)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 16 | −2.32 | 10.50 | 20.38 |
| 2 | 15 | −1.48 | 13.48 | 27.27 |
| 4 | 10 | −0.74 | 13.66 | 28.80 |
| 5 | 6 | −0.97 | 15.71 | 29.50 |
| 8 | 16 | +0.25 | 17.06 | 31.19 |
| 11 | 5 | +0.28 | 17.34 | 37.20 |
| 12 | 3 | +1.02 | 19.46 | 35.67 |

전반 trend 는 상승이지만 tier 4 → 5 에서 IRT 가 잠시 dip (-0.74 → -0.97), tier 3 NPS (14.25) > tier 4 NPS (13.66) 등 within-tier noise 가 큼. **mean-tracking** 기대치는 "전반 trend 만 보고 within-tier rank 약함은 허용".

**mean-tracking — `sn`** (티어 0-9, n = 41)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 9 | +1.14 | 19.20 | 38.44 |
| 2 | 6 | +1.57 | 20.59 | 40.33 |
| 4 | 6 | +2.00 | 23.71 | 44.67 |
| 5 | 4 | +2.12 | 26.25 | 45.25 |
| 6 | 2 | +2.21 | 10.52 | 23.50 |
| 9 | 1 | +3.39 | 25.91 | 55.00 |

sample 이 작아서 (tier 6 n=2) NPS 가 급격히 떨어지는 outlier 가 보임. IRT 는 안정 단조. mean-tracking 의 typical 패턴.

#### 2.5.4 함의

이 데이터가 본 프레임워크 설계의 두 가지 기반을 제공한다:

**(a) IRT 와 NPS 가 가족-tier 차원에선 함께 움직임** — 즉 코퍼스를 통째로 분석하면 둘이 매우 강한 상관 (Spearman > 0.85) 을 보인다. "axes ≠ difficulty" 는 **within-tier cohort 내부** 의 약한 상관을 의미하지 cross-tier 상관이 약하다는 의미가 아니다.

이 distinction 이 중요한 이유 — 큐레이션된 라벨 (가족/tier) 자체가 difficulty 정보를 이미 강하게 담고 있다. 본 framework 는 그 가족/tier 라벨을 빼앗는 시도가 아니라, *같은 가족/tier 안에서 character 의 종류* 를 보여주려는 시도다.

**(b) 가족 상대 calibration 의 정당성** — 본 framework 의 axis threshold (p33/p67) 는 가족-구분 없이 mode 별 (SP/DP) 로만 calibrate 된다. 가족-구분 없는 cohort 에서 percentile 을 뽑는 것은 가족 분포가 tier-monotonic 하다는 것이 전제이다. 위 데이터가 그 전제를 확인.

즉 같은 raw axis 값 0.5 가 sl0 (NPS-mean 12) 와 sl12 (NPS-mean 21) 양쪽에서 같은 시각 강도로 표시되는 것은 의도된 것 — "이 차트 안에서 chord 가 얼마나 강한가" 는 family 차원에서 단조 증가하는 NPS scale 의 *위* 에서 가족 cohort 끼리 비교했을 때의 ratio 다.

**(c) 평가 시 기대 단조성 매칭** — 어떤 axis metric 의 가족-tier 거동을 평가할 때, 그 가족의 class (linear-rank / body-linear-top-break / mean-tracking) 에 맞는 단조성을 기대해야 한다. linear-rank 가족에서 within-tier rank Spearman < 0.5 이면 metric defect; mean-tracking 가족에서 같은 결과면 정상.

#### 2.5.5 축 종류에 맞는 검증

두 번째 distinction 은 *어떤* gold standard 로 축을 검증할지를 정하며, 이는 축이 density 에 결합돼 있는지 직교하는지로 갈린다:

- **density-결합 축** (chord / stream / peak) 은 difficulty 와 함께 움직이므로 **family cohort-mean trend** vs PL2 tier (§2.5.3 의 단조성, 가족 class 에 맞춰) 로 검증한다.
- **직교 character 축** (scratch / ln / stair) 은 tier 와 함께 움직이지 않는다 — 차트는 *어느* tier 에서든 scratch-heavy, LN-heavy, stair-heavy 일 수 있다. 이들에겐 tier 단조성이 **틀린** 기준이다. **membership discrimination** (큐레이터 리스트 멤버를 코퍼스 나머지와 분리하는 축의 rank AUC: x_scratch vs SC.json 0.9996, x_ln vs LN.json 0.9993) 과 **known-verdict canary 차트** (§4.6.3) 로 검증한다.

x_scratch vs SC-tier Spearman 이 +0.007 에 불과한데도 축이 옳은 이유가 이것이다: scratch 난이도는 tier 에 단조하지 않으므로, 0 에 가까운 tier 상관은 결함이 아니라 *모델과 일치*한다. character 축에 tier-단조 테스트를 적용하면 잘 작동하는 metric 을 기각하게 된다.

---

## 3. 시스템 구조 (Architecture)

### 3.1 3-layer character snapshot

차트당 출력은 다음 3개 layer 로 구성된다:

```
┌─────────────────────────────────────────┐
│  Radar (7 independent axes)             │
│  ─ chord, stream, scratch,              │
│    soft, ln, stair, distraction         │
├─────────────────────────────────────────┤
│  Tags (boolean flags, ~18종)            │
│  ─ axis 가 못 담는 sub-pattern          │
│    (visual_gimmick, last_killing 등)    │
├─────────────────────────────────────────┤
│  Density bar (per-second NPS timeline) │
│  ─ 차트 진행 시 시간축 강도 변화        │
└─────────────────────────────────────────┘
```

### 3.2 Radar — parallel ownership

7개 축은 **독립 detector** 다. 한 이벤트가 여러 축의 candidate 가 될 수 있다 (예: scratch lane 위의 chord-tier event = chord + scratch 양쪽 모두 +1). 결과적으로:

$$\sum_{a \in \text{axes}} r_a \neq 1$$

여기서 $r_a$ = 축 $a$ 의 candidate event count / total event count.

**왜 이렇게 하는가?** 이전 partition 모델 (각 event 가 정확히 하나의 축에 할당, $\sum r_a = 1$) 은 우선순위 (예: scratch > chord > ...) 에 따라 "지는" 축의 raw 값을 구조적으로 압축시켰다. 예를 들어 stream 이 우선순위 최하위였을 때 stream-heavy 차트의 stream radar 가 항상 작게 나오는 문제가 있었다 (Aleph-0 [INSANE] 의 사례). 독립 detection 으로 이 압축이 풀린다.

### 3.3 Tags

태그는 **axis 가 못 담거나 담으면 안 되는** sub-pattern 을 boolean 으로 노출한다. 예:

- `visual_gimmick` — soflan max intensity ≥ 5.0 AND off_base_note_count ≥ 4 인 BPM-trick 차트
- `last_killing` — 차트 후반 NPS spike
- `double_tab` / `triple_tab` — keysound id 일치 chain (jack 의 sub-class)
- `jack_present` — same-lane rapid pair 의 floor count 초과
- `bpm_ramp` — 점진적 accelerando (단조 + 유계-step BPM 상승이 상당 비율의 note 를 덮음); §5.6 참조
- `randomized` — 곡 전체 매-플레이 #RANDOM (`#RANDOM N>1` 블록 ≥10); radar/density 는 매-플레이 가변 차트의 md5-고정 한 분기를 반영; §5.7 참조

태그는 **cross-axis 조합을 surface 하지 않는다** (radar 가 이미 다축을 보여주기 때문). 태그의 영역은 sub-metric / composite 뿐.

### 3.4 Density bar

차트의 felt-time 진행에 따라 1초 단위 NPS 를 jet colormap 으로 그린 strip. 색은 절대 스케일 (cap = 60 NPS ≈ 코퍼스 p99), 높이는 차트 내부 정규화 (chart_max). 즉:

- **색** = 차트 간 비교 가능 (절대 NPS 절대 수준)
- **높이** = 차트 내부 모양 (시간축 프로필)

호버 시 `sec N · V NPS` instant tooltip.

### 3.5 비교 표 의 metric — NPS, Pos/s, 그리고 합성성

비교 도구의 표는 카드 (radar + density bar) 와 별도로 raw scalar 들을 한 줄에 모아 보여준다. 표의 컬럼 의미:

| 컬럼 | 의미 | 단위 |
|---|---|---|
| **BPM** | 차트의 header BPM 또는 felt-BPM 보정 후 effective BPM | beats/min |
| **NPS min / mean / max** | aligned 1초 felt-time bucket 안의 **raw note 수** (§5.5 Z4) | events / sec |
| **Pos/s** | 1초당 **distinct timing position** 수 (chord 는 1개로 셈) | positions / sec |
| **chord / stream / scratch / soft / ln / stair / distraction** | 7 축 의 shape_v2 ratio (§4) | 0–1 |
| **Peak** | x_peak (peak_jab + peak_uppercut 합성) | 0–1 |

#### NPS = Pos/s × avg_chord_size

`NPS` 는 합성 측정값이다 — 1초 안의 **raw lane press 수**. 분해하면:

$$\text{NPS} = \text{Pos/s} \times \overline{\text{chord_size}}$$

이 약식은 거의 모든 위치가 chord 라고 가정한다 (`chord_rate ≈ 1`). 일부 위치가 단노트인 mixed 차트에서는 정확한 형태가 필요하다:

$$\text{NPS} = \text{Pos/s} \times \left[ r_{\text{chord}} \cdot \overline{\text{chord_size}} + (1 - r_{\text{chord}}) \right]$$

여기서 `r_chord` (`chord_rate`) 는 chord event 인 위치의 비율. 괄호 항은 위치당 평균 노트 수다. 약식과 정확형은 `chord_rate > ~0.85` 이면 일치하고, stream 비중이 큰 차트는 정확형이 필요하다 (§7.4a 의 κανων 사례에서 약식이 45 % 과대평가).

같은 NPS 가 매우 다른 mechanism 에서 나올 수 있다:

> **[2026-06-06 수정]** 아래 Skydive 수치는 BMS §11 `#RANDOM/#IF` 블록을 무시하던 `bms_parser.py` 버그 (모든 분기를 한꺼번에 합침) 에 기반한 값이었다. 취소선 행은 부풀려진 데이터, 정정 행이 그 다음. 전체 meta 논의는 §7.4 참조.

| 패턴 | Pos/s | avg chord | NPS | 부담 종류 |
|---|---:|---:|---:|---|
| ~~chord wall (예: Skydive st4, 120 BPM, 모든 16분에 7-key chord)~~ | ~~7~~ | ~~6.7~~ | ~~47~~ | ~~endurance (한 패턴 반복)~~ |
| chord wall (Skydive st4, **정정**: 120 BPM, 섞인 4-chord 패턴) | 7 | 4.3 | 29 | endurance (한 패턴 반복) |
| varied chord-stream (예: FD [FOUR DIMENSIONS], 222 BPM, 3-4 chord 가 빠른 위치 변화) | 12 | 3.3 | 40 | pattern + speed (위치 변화 따라가기) |

**정정 (bms_parser 수정 후)**: spurious `#RANDOM` 분기를 제거하면 Skydive 의 NPS 가 FD 아래로 내려간다 (29 vs 40). 원래 서술 — "같은 NPS, 반대 tier" — 는 파서 버그 artefact 였다. 다만 근본 논점은 유지된다: 같은 NPS 에서도 mechanism (chord-wall endurance vs 위치-변화 speed) 이 난이도의 지배적 동인이고, Pos/s 분해가 그것을 드러낸다.

**Pos/s column 의 역할**: 사용자가 NPS 옆의 Pos/s 를 같이 보고, *"이 차트가 chord 가 크고 느린가 (low Pos/s + high NPS) vs 위치가 빠르고 chord 가 작은가 (high Pos/s + moderate NPS)"* 를 직접 판단할 수 있게 한다. NPS 단일 숫자에서 잃은 mechanism 정보를 분해해 surface.

radar 의 `chord` axis 도 같은 정보를 다른 방식으로 노출 (~~Skydive chord 0.99~~ 정정 ~0.985 — 어느 쪽이든 saturated, vs FD 0.73), 하지만 *NPS 자체의 산술 분해* 를 원하면 Pos/s 가 가장 직관적.

#### 한계 — 단일 차트 내 균일성 가정

`Pos/s` 와 `avg chord` 모두 차트 전체의 평균. 차트 전반과 후반의 mechanism 이 달라도 (예: 전반 chord-wall + 후반 single-stream) 평균 한 값으로 압축됨. density bar 의 막대 시각화가 시간축 distribution 정보를 보완.

---

## 4. 축별 metric 설계 (Per-axis design)

각 절은 (정의 / 계산식 / 임계 / 검증 사례) 의 4단 구조.

### 4.1 chord — 동시 입력 (3+ lane)

#### 4.1.1 radar 의 raw 값 (shape_v2 ratio)

같은 16.67 ms (≈ 1/60 sec, 60 fps 1 frame) 윈도우 안에 3개 이상의 lane note 가 존재하는 이벤트를 chord candidate 로 본다.

$$\text{cand}_{\text{chord}}(e) = \mathbb{1}\left[ |\{ e' : |t(e') - t(e)| < 16.67 \text{ms} \}| \geq 3 \right]$$

$$r_{\text{chord}} = \frac{\sum_e \text{cand}_{\text{chord}}(e)}{|E|}$$

**왜 ≥3 인가?** 이전 ≥2 정의는 단순 dual-tap (두 손가락 동시) 까지 chord 로 잡아 코퍼스 median 이 0.67 — 거의 모든 차트의 radar 에서 chord 가 지배. ≥3 으로 바꾼 후 median 0.54 로 안정. 인지적으로도 *"손가락 자리가 부족해지는"* 부담은 3개 이상부터 발생한다는 사용자 정의 기반.

2-lane 동시는 별도 sub-metric (`chord_pair_rate`) 로 보존되어 drill-down 에 사용 가능.

**임계**: SP (0.430, 0.638), DP (0.395, 0.563)

#### 4.1.2 chord_burden_per_sec — shape-variety 보정 (v2.1)

radar 의 단순 ratio 외에 **동일 단위 시간당 chord 부담** 을 별도로 계산해서 difficulty 관련 sub-metric 으로 export. v2.1 (2026-05-01) 의 형태:

$$\text{chord_pace_per_sec} = \frac{\text{chord_positions}}{\text{chart_seconds}}$$

$$\text{eff_avg_size} = 1 + (\text{avg_chord_size} - 1) \times (\alpha + (1 - \alpha) \times \text{variety})$$

$$\text{chord_burden_per_sec} = \text{chord_pace_per_sec} \times \text{eff_avg_size}$$

여기서:
- $\text{variety} \in [0, 1]$ — burden-weighted per-size **chord shape Shannon entropy**, 정규화. 0 = 한 종류 chord 만 스팸, 1 = 매 chord 마다 다른 lane 조합
- $\alpha = 0.4$ — *irreducible single-shape load* fraction. variety=0 이라도 chord 크기 자체의 손가락-개수 부담은 40% 인정

**왜 shape-variety 보정인가?** UFS (Unidentified Flying Scotsman) 같은 차트는 sl12 인데 62% 가 full-7-chord 8th-note stream 을 200 BPM 으로 친다. 단순 `pace × size` 공식 (v2) 으로는 chord 0.945 + stream 0.975 — 두 축 동시 saturation 으로 측정. 그러나 7-key full-chord 는 SP 에서 **모양이 단 하나**: 따로 외울 패턴이 없는 endurance 차트. shape-variety 보정으로 "단조 wall" 의 size premium 을 깎는다.

α=0.4 의 의미: variety=0 (스팸) → size premium 40% 만 인정, variety=1 (다양) → 100% 인정. Codex 권장 floor.

#### 4.1.3 chord size 분포 — big_to_mid

추가 sub-metric:

$$\text{big_to_mid} = \frac{|\{e : \text{chord_size}(e) \geq 5\}|}{|\{e : \text{chord_size}(e) \in \{3, 4\}\}|}$$

5-7 chord 비율 vs 3-4 chord 비율. AEζηκ composite 의 chord 항 (BM modulated) 에서 사용. 직관: bimodal chord-spacing (작은 chord 와 큰 chord 가 섞임) 패턴 검출.

`max_chord_size` 도 별도 export — `big_chord_burst` tag (max chord size 가 크면 발화) 의 base.

### 4.2 stream — sustained-density

**정의**: 각 event 의 ±0.75 beat (총 1.5 beat) 윈도우 안의 가중 NPS 가 임계 이상.

**계산**:

각 event $e$ 의 felt-time $t(e)$ 와 BPM $b$ 에 대해, 윈도우 길이를 beat 단위로 측정:

$$W(e) = \frac{0.75 \text{ beat}}{b / 60} = \frac{45}{b} \text{ sec}$$

윈도우 내 가중 노트 수:

$$N_W(e) = \sum_{e' : |t(e') - t(e)| \leq W(e)} w(e')$$

가중치 $w(e')$:
- single (단일 lane note): 1.0
- chord 의 일부: 0.6
- scratch lane: 0.0

window NPS:

$$\text{nps}_W(e) = \frac{N_W(e)}{2 W(e)}$$

stream candidate:

$$\text{cand}_{\text{stream}}(e) = \mathbb{1}\left[ \text{nps}_W(e) \geq 8.0 \,\wedge\, e \notin \text{scratch lane} \right]$$

**왜 이런 형태인가?** 이전 explicit chain detector (consecutive single-lane, n≥6, purity≥70%, CV≤0.20) 는 Aleph-0 [INSANE] 같이 chord 가 섞인 stream 차트를 실패로 잡았다 (14/1686 candidate). time-window weighted NPS 로 바꾸면서 corpus nz% 47.6% → 98.1%, Aleph 의 stream raw 0.0083 → 0.7248 로 회복. Codex 2회 cross-validation 채택.

**임계**:
```
SP: (0.736, 0.851)
DP: (0.813, 0.899)
```

### 4.3 scratch — turntable lane

#### 4.3.1 radar 의 raw 값 (shape_v2 ratio)

scratch lane (SP lane 8, DP lane 8/16) 의 event 비율. 가장 단순한 정의:

$$r_{\text{scratch}} = \frac{|\{e : \text{lane}(e) \in \text{SCR}\}|}{|E|}$$

**임계**: SP (0.020, 0.041), DP (0.008, 0.022)

가족 의존성이 크다 — sl/st 가족 의 차트는 scratch 가 거의 없고, sn / `★★` 의 SC (scratch character) 차트는 압도적. 동일 absolute floor 가 sparse 가족에서 false-red 차단.

#### 4.3.2 사용자에게 보이지 않는 sub-metric — 3-feature scratch character

simple ratio 만으로는 같은 scratch 비중의 차트가 가진 *다른 부담* 을 구분 못 한다:

- **case A** — 일정 간격 scratch 가 차트 전체에 균일하게 분산 (단순 metronome)
- **case B** — scratch burst (1초에 3개 이상) 가 차트 중 몇 군데
- **case C** — scratch chain 이 길게 (예: 8초 이상) 지속 (sustained wheel work)

이 3 mechanism 을 각각 잡는 sub-feature 가 함께 계산되어 SC-tier 검증과 tag 발화에 쓰인다:

| feature | 정의 | mechanism |
|---|---|---|
| `scratch_per_sec` | scratch event 수 / 차트 길이 (felt-sec) | overall density (case A) |
| `scratch_burst_max_per_sec` | 1초 윈도우 내 scratch 최대 수 | peak intensity (case B) |
| `scratch_max_run_sec` | gap ≤ 0.5 sec 로 연결되는 scratch 연속 chain 의 최장 sec 길이 | sustained run (case C) |

#### 4.3.3 Long-Scratch (LS) sub-metric

scratch lane 위의 Long event = **wheel-hold**. 빠른 wheel-turn 과 mechanically 다름 (디스크를 잡고 있어야 함). 이 LS 의 존재와 복잡도를 별도로 추적:

- `long_scratch` 태그 — LS count 가 floor 초과 시 발화
- `complex_long_scratch` 태그 — LS event 의 [ts - W, te + W] 윈도우에 다른 scratch 가 dense 일 때 발화 (isolated LS 가 아닌, 다른 scratch 와 섞인 LS — wheel hold 중 wheel turn 동작 필요)

LS 는 SC-tier (SP n=128) 에서 axis composite 에 +0.013 Spearman 만 추가해 axis 에는 안 들어가고 sub-metric 으로만 유지 — *noise floor 아래의 신호* 라 판단.

#### 4.3.4 SP scratch-centric 정책

SP 의 scratch + chord 동시 발생 (`scratch_chord` 태그) 은 **chord 영역**, scratch + stream 중간 발생 은 **distraction 영역** (§4.7) 으로 분리. scratch axis 자체는 *얼마나 많은 scratch 가 있는가* 만 측정.

DP 는 scratch 가 두 개 (P1/P2 각각) 이고 양손 burden 의 mechanic 이 다르므로 distraction 의 별도 formulation 으로 처리 (§4.7).

### 4.4 soft — off-base BPM (변속)

#### 4.4.1 radar 의 raw 값 — 누적 log² burden

다른 6개 축(shape_v2 후보 비율)과 달리 soft 는 **정의적 축**이다: curator 변속 목록이 없어 축 자체가 정의다. radar 값은 off-base BPM 위 노트들에 대한 초당 누적 burden 으로, 각 노트를 (a) tempo 편차의 **octave-scale 크기**, (b) 그 off-base 구간의 **상대적 국소 노트 밀도**로 가중한다:

$$\text{burden}/\text{sec} = \frac{1}{T}\sum_{s\,\in\,\text{off-base}} \log_2\!\left(\frac{\text{bpm}_s}{\text{bpm}_\text{base}}\right)^2 \cdot n_s \cdot \frac{\rho_s}{\rho_\text{base}}$$

여기서 $s$ 는 off-base BPM segment, $n_s$ 는 그 노트 수, $\rho_s$ 는 그 노트 밀도, $\rho_\text{base}$ 는 on-base(home) 노트 밀도, $T$ 는 차트 재생 초.

- **octave-scale ($\log_2^2$)**: BPM 인지는 곱셈적 — 절반은 +1 octave, 1/4 은 +2. 제곱 log 한 항으로 급격한 점프(큰 per-note 비율)와 완만한 깊은 ramp(많은 노트가 점진적으로 base 에서 멀어짐)를 모두 포착.
- **상대 밀도 ($\rho_s/\rho_\text{base}$)**: 밀집된 off-base hold 는 희소한 것보다 압박이 크다 — "변화는 변하는 순간만이 아니라 머무는 동안 노트가 많아도 압박". 비율이라 단위 불변 → BPM trick 차트의 abs_tick 팽창에 강건.
- **초당 누적** ($\div T$, chord/stair burden 과 동일), per-note 평균이 *아님* — 평균이면 "밀집 off-base hold = 압박" 신호를 정확히 나눠 없앤다.

**정규화 (p97 knee 에서 log).** raw 초당 burden 은 4 자릿수 범위다 — 단독 풀-송 ramp([シャトルラン], per_sec ≈ 8634)이 2위의 60배에 위치하고 대부분의 nonzero 차트는 0.01–6. 선형/max-anchored clip 은 그 본체를 0 근처로 뭉갠다. 따라서:

$$x_\text{soft} = \min\!\left(1,\; \frac{\log_2(1 + \text{burden}/\text{sec})}{\log_2(1 + \text{ref})}\right),\quad \text{ref} = \text{nonzero per_sec 의 p97 (SP } 7.15,\ \text{DP } 6.14)$$

p97 knee 는 인지적으로 이미 최대 변속인 상위 ~3% 꼬리만 1.0 으로 포화시키고, 강하지만 극단은 아닌 cohort 를 구분되게 둔다. **임계** (nonzero $x_\text{soft}$ 의 p33/p67): SP (0.013, 0.153), DP (0.009, 0.152).

#### 4.4.2 base BPM 의 결정, 그리고 felt frame

**base BPM.** **note-weighted mode**(가장 많은 노트가 사는 BPM)로 계산, duration-weighted mode 로 tie-break. BPM trick 차트는 비현실적 BPM(예: 10^7)을 wall-clock 으로 길게 잡지만 그 segment 에 노트는 거의 없다 → note-weighting 이 base 후보에서 제외. duration tie-break 는 순수 ramp(BPM 간 노트 수 동률)에서만 작동해 가장 길게 유지된 값(ramp 바닥)을 골라, 편차를 바닥부터 측정한다. `#BASEBPM` 헤더가 있으면 우선.

**felt frame (visual gimmick ≠ soft).** burden 은 offset 변환 + Class A–D felt-recovery 파이프라인(§5)이 gimmick BPM 을 복구된 진실로 pin 한 **felt-보정** BPM segment 위에서 계산된다. 이게 축의 핵심이다: *Alcubierre Drive [INSANE]* 는 실제 174-BPM 차트 위에 10^7-BPM 시각 trick 을 얹는다. raw BPM 으로 읽으면 최대 변속(거짓 양성)이 되지만, felt frame 에서는 gimmick segment 가 on-base 라 $x_\text{soft} \approx 0$. 진짜 점진 ramp([シャトルラン], 60→573, 단일 진실 복구 불가)는 편차를 유지해 높게 남는다. 귀속은 abs_tick 축에서 한다 — measure-number trick 차트에서 노트 위치와 BPM-segment 위치가 정렬되는 유일한 frame.

#### 4.4.3 `soflan` / `visual_gimmick` tag 와의 책임 분리

soft axis 와 변속 관련 tag 들의 의미는 서로 다르다:

| 측정 | 무엇을 보는가 |
|---|---|
| **soft axis** | 노트가 지는 *felt* 변속-disruption burden (octave 편차 × 밀도, 초당) |
| **`soflan` tag** | BPM 변경의 *횟수* 와 *변화 폭* (차트의 *구조적 변속성*) |
| **`visual_gimmick` tag** | 큰 BPM trick (`max_intensity ≥ 5.0`) + off_base_note_count ≥ 4 — *display jumpscare 의 존재* |

soft axis 가 felt frame 위에서 돌기 때문에, 순수 시각 gimmick 은 `visual_gimmick` 을 fire 하되 soft 는 낮게 둔다 — 둘이 깔끔히 분리. 진짜 변속 challenge 는 soft 높음. BPM 은 바뀌지만 노트가 없는 차트(시각 transition 만)는 `soflan` 만 fire.

#### 4.4.4 한계

soft axis 는 BPM 의 *방향* (가속 vs 감속) 을 구분하지 않는다. 가속하는 변속과 감속하는 변속이 player perception 으로 다르게 느껴지지만 metric 으로는 동일. 향후 작업 후보 (§9 참조).

### 4.5 ln — Long Note

#### 4.5.1 radar 의 raw 값

radar 의 `x_ln` 자체는 단순한 ratio 다 — chord/stream 등 다른 축과 동일한 *shape_v2 candidate count / total events* 형태:

$$r_{\text{ln}} = \frac{|\{e : \text{type}(e) = \text{LN} \,\wedge\, \text{lane}(e) \in \text{KEY}\}|}{|E|}$$

scratch lane 의 LN (= wheel-hold) 는 mechanism 이 다르므로 제외 — wheel-hold 는 scratch 축 (§4.3) 의 영역이지 multi-finger lock 부담이 아니다. **KEY lane 전용** 정책 (Phase 1Z, "각 축은 자기 lane mechanics 만 소유" 원칙).

LN 의 hold 시작/끝 event 가 각각 카운트되므로, 같은 LN 수라도 hold 길이가 길수록 ratio 가 살짝 커진다 (`r_ln` 은 LN 의 *event 비중* 이지 *수* 가 아님).

**임계** (SP / DP):
```
SP: (0.004, 0.013)
DP: (0.009, 0.020)
```

희소 축이므로 absolute floor (0.03 / 0.08) 가 사실상 분류를 주도 (§4.9).

#### 4.5.2 사용자에게 보이지 않는 sub-metric — M1 / M2 / M3 / m_concurrent

위 단순 ratio 만으로는 LN 의 *진짜 부담* 을 다 잡지 못한다. 같은 LN 비중 (예: 40%) 이라도:

- **case A** — 긴 hold 들이 sequentially 흐름. 한 손으로 하나씩 잡았다 놓는 단순 LN.
- **case B** — 짧은 hold 들이 stream 처럼 빠르게 이어짐. LN 인데 stream 느낌.
- **case C** — 긴 hold 가 active 인 중에 다른 lane 의 Tap 이 빠르게 들어옴. 여러 손가락 lock + 빠른 동시 입력.
- **case D** — "wall of LN" — 동시에 여러 LN 이 hold 되어 손가락 자리가 부족.

이 mechanism 차이는 단순 ratio 로 표현이 안 된다. metric 으로 다음 5개의 *real-time* (felt-time 보정 후) sub-feature 를 함께 계산해 두면 advanced LN 검출 (다음 §4.5.3) 의 입력이 된다.

각 long event 의 felt-time hold 길이를 $h_e$ 라 하고, hold floor 1 frame (≈ 16.67ms), short/long 경계 6 frame (≈ 100ms) 으로 분류:

**M1 — short LN as stream** (hold $\in$ [1 frame, 6 frames))

$$M_1 = \frac{|\{e : 1f \leq h_e < 6f\}|}{|E|}$$

stream-처럼 흐르는 짧은 hold 들 (case B). 길이가 짧아서 release 가 빠르게 옴.

**M2 — long LN + tap activity** (long LN active 중에 다른 lane 의 Tap 부담)

$$M_2 = \frac{1}{T_{\text{long}}} \sum_{e \in \text{Tap}^*} n_{\text{locked}}(t_e) \times s_{\text{surround}}(t_e)$$

여기서:
- $T_{\text{long}}$ = long LN ($h_e \geq 6f$) 들의 총 hold 시간
- $\text{Tap}^*$ = long LN 이 active 인 동안의 key Tap 들
- $n_{\text{locked}}(t)$ = 시점 $t$ 에 lock 된 long LN 수 (strict interior: $t_s < t < t_e$)
- $s_{\text{surround}}(t)$ = $t$ 주변 ±1초 윈도우의 non-LN tap 수

직관: long LN 이 잡혀 있는 동안 ($n_{\text{locked}}$) 다른 손가락이 얼마나 바쁜가 ($s_{\text{surround}}$) 의 누적 (case C).

**M2 burst** — 위 burden 의 1초 윈도우 max:

$$M_2^\text{burst} = \max_{\text{1-sec window}} \sum_{e \in \text{Tap}^*} n_{\text{locked}}(t_e) \times s_{\text{surround}}(t_e)$$

M2 가 평균 burden 이라면 M2 burst 는 peak intensity.

**M3 — M2 + short-LN-during-long** (case B + C 동시 발생)

$$M_3 = M_2 + \frac{1}{T_{\text{long}}} \sum_{e \in \text{ShortLN start}^*} n_{\text{locked}}(t_e) \times (s_{\text{surround}}(t_e) + 1)$$

long LN active 중에 short LN 까지 시작되는 도전적인 패턴.

**m_concurrent — multi-LN wall** (case D)

$$m_{\text{concurrent}} = \frac{T_{\text{long}} - T_{\text{any-active}}}{T_{\text{any-active}}} = \mathbb{E}[n_{\text{active}}(t) - 1 \mid n_{\text{active}}(t) \geq 1]$$

여기서 $T_{\text{any-active}}$ 는 *어떤* long LN 이라도 active 인 시간의 union. 직관: long LN 이 한 개라도 잡혀 있는 동안 평균적으로 *추가로* 몇 개의 long LN 이 동시 lock 되는가. sequential-only = 0, always-2-held = 1, wall = 큰 값.

case A (M2 = 0, $m_{\text{concurrent}}$ = 0), B ($M_1$ 큼), C ($M_2$ 큼), D ($m_{\text{concurrent}}$ 큼) — 네 모드가 서로 다른 sub-feature 에 신호를 남긴다.

#### 4.5.3 `advanced_ln` tag — 5 technical-pattern feature 의 midrank-percentile mean

위 5개의 RT feature 외에 5개의 *advanced pattern* feature 가 별도로 계산되어 `advanced_ln` tag 의 발화에 쓰인다 (radar 에는 안 올라감):

| feature | 정의 | 의도 |
|---|---|---|
| `adv_hand_imb` | $\frac{\|n_L - n_R\|}{n_{\text{long}}}$ | 손 좌우 LN 분포의 불균형 |
| `adv_rel_pressure_1beat` | release 후 ≤ 1 beat 안에 다음 Tap 이 오는 long LN 의 비율 | "잡았다 놓고 즉시 jab" 압박 |
| `adv_ln_hold_min_beats` | 차트 안 *가장 짧은* LN 의 hold (authored beats) — *invert* | 극단적으로 짧은 hold = 더 어려움 |
| `adv_ln_chord_big_rate` | ≥3개 LN 이 동시에 시작하는 위치의 비율 | stacked LN chord (여러 손가락 commit) |
| `adv_ln_scatter_cv` | LN 간 gap 의 coefficient of variation | irregular scatter (불규칙 분산) |

advanced_ln score = 위 5개 feature 의 mode 별 midrank percentile mean. invert=true 인 feature (`hold_min_beats`) 는 $1 - p$ 로 reflect 후 평균.

LN 이 0인 차트는 score = 0 으로 collapse (no-LN → no advanced-LN 일관성). p95 이상에서 `advanced_ln` tag 가 발화.

#### 4.5.4 왜 이렇게 두 layer 인가

- **radar `x_ln`** = "이 차트는 LN 이 얼마나 있는가" (사용자의 1차 질문)
- **`advanced_ln` tag** = "그 LN 이 단순 hold 가 아니라 기술적으로 까다로운 패턴인가" (드물게 fire, audit 가치)

단순 ratio 만 radar 에 올린 이유: 다른 6 축 (chord/stream/scratch/soft/stair/distraction) 과 같은 *shape_v2 candidate 비율* 형태로 통일 → 사용자 mental model 일관성. 정밀한 LN 부담 차원은 tag layer 로 분리.

현재 코퍼스 (SP n=6,703) 에서 `advanced_ln` tag fire = 0 — calibration 의 p95 임계가 너무 엄격하거나, 코퍼스에 충분히 극단적 패턴이 부재. 정의는 보존되어 향후 audit 사례 발견 시 임계 재조정 가능.

### 4.6 stair — 음계 진행 chain

stair = **인접 lane (±1) 으로 흐르는 note 의 chain** (distinct timing position 을 가로질러). 도-레-미-파 같이 lane 1→2→3→4 순서로 흐르는 음계 진행 패턴을 잡는다. 검출기는 **v3 (2026-06-13)** 에서 재설계됐다 — `_detect_stair_chains_v3` 가 두 consumer 모두에서 기존 `_detect_stair_chains_v2` 를 대체. 코퍼스 마이닝 세션에서 구 검출기가 embedded / 고속 stair 를 체계적으로 놓쳐 `st`-family cohort-mean trend 를 역전시킨다는 것 (ρ = −0.495) 이 드러난 데 따른 것.

#### 4.6.1 chain 검출 (v3)

note 를 effective timing position (16.67ms chord window 내, KEY lane, player 별) 으로 묶은 뒤, 새 lane 이 최근에 본 lane 의 ±1 일 때 chain 을 연장한다. v3 를 규정하는 네 가지 설계:

1. **Lookback matching** — lane 별 recency table 을 두고, 최근 24 tick 내에 등장한 lane ±1 에서 step 을 연장한다. **직전 position 만 보지 않는다.** 구 검출기는 직전 position 만 봤기 때문에, 다른 stream voice 가 사이에 끼면 매 노트마다 chain 이 끊겼다 (Another Day, アニマのささやき — 이전엔 ≈0 으로 읽혔으나 사용자 확인된 양성).
2. **pace floor 제거.** 구 검출기는 step gap $\in [6, 12]$ tick (16~8분) 을 요구해 더 빠른 figure 를 배제했다. v3 는 floor 를 없앤다: trill / jack 은 monotonic ±1 진행 요건에 의해 **구조적으로** 배제되므로 (trill 은 length-2 조각만, jack 은 chain 자체가 안 됨) pace gate 가 불필요하며 — 또한 hard window 로는 "16분 계단은 계단이 아닌가?" 라는 질문에 답할 수 없다. 검출은 24-tick (8분) ceiling 까지 열려 있고, 이는 chain 연속성만 제한한다.
3. **WALL rule** — **3 lane 초과** position 은 열린 chain 을 모두 닫고 recency table 을 비운다. 큰 chord 는 지각적으로 불투명하다: 5-lane chord 양옆의 single 은 하나의 계단 라인으로 읽히지 않으며, wall lane 은 chain source 가 되어서도 안 된다. 이것이 개별 segment 를 재분류하던 v2 의 "K=3 chord-size filter" 를 대체한다.
4. **Pace-uniformity split** — step gap 이 chain 의 직전 gap 대비 $\max(1\ \text{tick}, 25\%)$ 이상 달라지면 figure 를 닫고 새로 시작한다 (one chain = one authored pace). chain 길이 $\geq 3$ 만 채택.

#### 4.6.2 pace 는 gate 가 아니라 attribute

각 chain 은 **real-time** pace $v$ (steps/sec) 와 weight 를 가진다:

$$w = \mathrm{clip}_{01}\!\left(\frac{v - 5}{5}\right)$$

따라서 ~5 steps/sec 미만은 $w=0$, ~10 초과는 $w=1$. pace 는 tick 이 아니라 **real-time** 기준이다: Death Opera (BPM 450) 는 tick 상 "8분음표" 진행을 ~15 steps/sec 로 걷는다 — 사용자 verdict 상 full-strength 계단 — 반면 R.I.P My Pudding (BPM 166) 은 같은 tick gap 을 5.5 steps/sec 로 걸으며 사용자는 이를 계단이 *아니라고* 판정했다. tick 기준 gate 는 둘을 혼동하지만, real-time weight 는 shape 검출은 pace-agnostic 으로 두면서 둘을 분리한다.

radar 의 raw 값은 pace-weighted 참여 비율 (나머지 6축과 공유하는 parallel-ownership 형태):

$$r_{\text{stair}} = \frac{\sum_{e \in \text{stair_cand}} w(e)}{|E|}$$

$w(e)$ 는 event $e$ 가 참여한 chain 들의 최대 weight. binary count 가 아니라 **graded** 이다: 느린 진행은 shape 로는 검출되지만 ≈0 기여하므로, "느린 계단도 계단인가?" 에 gate 판정이 아닌 graded 답을 준다.

**임계**: SP (0.120, 0.237), DP (0.054, 0.120) — v3 코퍼스 리빌드로 재보정; 다른 축의 p33/p67 은 불변 (변경 격리).

#### 4.6.3 검증 (canary 차트, tier 단조성 아님)

stair 는 density-orthogonal **character** 축이다: 차트는 어느 tier 에서든 강한 계단 차트일 수 있으므로 tier 단조성은 옳은 기준이 아니다 (§2.5.5 참조). v3 는 사용자 verdict canary 로 검증했다. embedded / 고속 계단이 회복되고, chord-stream / denim 컨트롤은 보존:

| 차트 | x_stair 전 | 후 | verdict |
|---|---:|---:|---|
| stairway to the universe | 0.000 | 0.612 | 48분 sweep, embedded |
| klimt_(:3 」∠ )_ | 0.000 | 0.537 | 48분 roll |
| Death Opera (Eclipse / Genocide / Luna) | 0.000 | 0.46 / 0.50 / 0.30 | BPM 450, tick 느리나 real-time 빠름 |
| Another Day (★★3) | 0.025 | 0.520 | stream-embedded 계단 |
| Skydive (control) | 0.003 | 0.003 | chord-stream, 올바르게 ~0 |
| R.I.P My Pudding (control) | 0.003 | 0.011 | 실제 m12/14/16 64분 roll 만 |
| JUMMER (×3, control) | 0.40–0.56 | 0.40–0.56 | delay-stair, 보존 |
| 幽雅に咲かせ (control) | — | ±0.01 | 불변 |

`st`-family cohort-mean stair trend 가 ρ = −0.495 (체계적 역전) 에서 +0.115 로; `★` −0.070 → +0.453; `★★` −0.893 → −0.536 (잔여 음의 기울기는 검출기 결함이 아니라 정직한 composition 의미 — 밀집 차트일수록 계단 비중이 비례적으로 줄어듦).

#### 4.6.4 폐기: p99-burden 과 purity factor (AEζηκ 시대)

parallel-ownership radar (Phase 1Z-1H, 2026-05-25) 이전에는, export 되는 `x_stair` 가 p99-정규화 chain burden $\min(\text{chain notes}/\text{chart_seconds}\,/\,p_{99}, 1)$ 에 **purity factor** $\times \max(0, 1 - 0.5\,x_\text{chord})$ 를 곱해 깎은 값이었다 — chord-mixed stair 가 pure 보다 낮게 읽히도록 (audit: Empress of Raizze / Complex path 0.865 vs Icyxis / 覚醒 0.744). Phase 1Z-1H 이후 radar 는 shape_v2 ratio 를 직접 읽으므로, 이 burden + purity 공식은 **radar 값에 더 이상 적용되지 않는다**; legacy `_axes_r1_character` drill-down 경로에만 남아 있다. `shape × fast × count` L² burden (`stair_l2 = √(Σ chain_burden²)`) 도 drill-down sub-metric 으로 여전히 계산된다.

### 4.7 distraction — mode-split formulation

#### 4.7.1 사용자 정의

distraction 은 SP 와 DP 에서 mechanism 이 다르므로 **별도 formulation**.

**SP** (단일 손이 scratch + 7 키 동시 운용):
"**stream-flow 중에 끼어드는 scratch 의 정량화**" — cross-domain 측정이 아닌, *stream 영역 안에서만* scratch 가 얼마나 산만한지. 사용자 직관: "stream 을 치다가 scratch 가 박혀 흐름을 끊는" 감각.

**DP** (양손 분리, P1 / P2 각각 scratch + 7 키):
SP 의 "흐름 + scratch interruption" framing 이 적용 안 됨. 양손 독립이 강한 DP 에서 user 가 정의한 distraction 은 다음 세 가지 패턴.

DP 키 배치는 **`S 1 2 3 4 5 6 7 │ 1 2 3 4 5 6 7 S`** — 양쪽 scratch 가 *바깥* 끝에 있어, 각 사이드의 near/far 는 그 사이드의 scratch 기준으로 **미러**된다:
- **1P** (scratch 가 왼쪽): near = KEY1-3, far (안쪽) = KEY4-7
- **2P** (scratch 가 오른쪽): near = KEY5-7, far (안쪽) = KEY1-4

1. **빠른 주기의 hand-role transition** — 왼손 scratch + 오른손 키 ↔ 왼손 키 + 오른손 scratch 로 손 역할이 빠르게 swap.
2. **무리 스크래치 (impossible)** — same-side scratch + 같은 사이드 **먼 키** (1P KEY4-7 / 2P KEY1-4) 동시치기 또는 약간 어긋남. 한 손으로 동시에 누를 수 없는 모양처럼 보이지만, 판정 폭이 있어 scratch 를 살짝 빠르게·키를 살짝 늦게 (혹은 그 반대로) **어긋나게** 입력하면 한 손으로 둘 다 처리된다. 부담은 이 정밀한 타이밍 분할이지, **반대 손을 강제하는 것이 아니다** (이름은 譜面상 보이는 모양을 가리킬 뿐, 문자 그대로 양손을 요구하는 의미가 아니다).
3. **인접 스크래치 (adjacent)** — same-side scratch + 같은 사이드 **가까운 키** (1P KEY1-3 / 2P KEY5-7) 동시치기. 한 손으로 칠 수는 있지만 불편한 손동작.

다른 영역과의 책임 분리 (양 mode 공통):
- 차트 전체의 scratch 양 → scratch axis (§4.3)
- pure scratch chain (chord 없는 sustained scratch run) → scratch axis 의 `scratch_max_run_sec`
- SP scratch + chord 동시 → SP `scratch_chord` 태그, **chord 영역** (§4.1)
- DP 의 chord-tier exact 동시 / 양 사이드 마디 배치 → DP-specific tags (§4.7.3)

#### 4.7.2 SP formulation (v3 알고리즘)

250 ms bin 기반의 4-step pipeline:

1. **Bin 화** — 차트의 모든 event 를 250 ms (`bin_sec = 0.25`) felt-time 버킷에 할당. bucket $i$ 마다 `key_count[i]`, `scratch_count[i]` 집계.

2. **key-flow interval 검출** — 연속된 bin 들 중 `key_count[i] ≥ t_key` (key 노트가 임계 이상) 인 bin 의 chain. 중간에 `gap_bins` (현재 1-2) 까지의 inactive bin 은 허용 (gap-tolerant — stream 의 잠깐 휴식 허용).

3. **qualifying interval 필터** — 위 key-flow interval 중 그 안에 **`min_scratches` 개 이상의 scratch** 가 있는 구간만 채택. *scratch 가 전혀 없는 순수 key passage* 는 contribution 0 (SP 의 "scratches inserted into flow" framing).

4. **v3 score 계산** — qualifying interval 안의 bin 들에 대해:

$$\text{v3_score} = \frac{1}{\text{chart_seconds}} \sum_{i \in \text{qualifying bins}} \text{scratch_count}[i] \times \text{key_count}[i]$$

**왜 product 형태인가?** 동일 bin 합계라도 *concentrated* (5×5 bin × 5개) 가 *scattered* (1×1 bin × 25개) 보다 burden 이 크다. 곱셈으로 concentration 을 직접 보상.

**왜 chart_seconds 정규화인가?** Codex 권장 (2026-04-26): qualifying_sec (qualifying interval 의 총 시간) 으로 나누면 short-flow + dense-scratch 비율이 inflate 됨. chart_seconds 정규화는 *전체 차트 안에서의 distraction 부담* 을 반영.

**SC tier 검증** (`scripts/_distraction_overlap_probe_full.py`):
- Shipped legacy +0.642 → v3 +0.715 (SC tier Spearman)
- partial | scratch_per_sec: +0.354 → +0.572 (scratch density 와 무관한 cross-domain 신호 직접 측정)

#### 4.7.3 DP formulation (2-component 산술합, Phase 1Z-1M)

DP 의 `x_distraction` 은 §4.7.1 의 세 패턴 (transition + 무리 + 인접) 을 두 component 로 묶어 산술평균:

$$x_\text{distraction}^{DP} = \frac{C_1 + C_2}{2}$$

**Component C1 — hand-role transition (alt_ratio):**

시간 순서로 정렬된 scratch event sequence 에서, 인접 pair $(s_i, s_{i+1})$ 중 time-gap $\Delta t$ 가 $[0.05, 0.30]$ 초 범위 안인 것만 분류:
- 두 scratch 의 lane 사이드가 다르면 (P1 ↔ P2): `cross_count`
- 같으면: `same_count`

$$C_1 = \begin{cases} \dfrac{\text{cross_count}}{\text{cross_count} + \text{same_count}} & \text{if total} > 0 \\ 0 & \text{otherwise} \end{cases}$$

**왜 ratio 인가, 왜 rate 가 아닌가?** Rate (`cross_count / chart_sec`) 는 sustained 한쪽 burst 의 incidental 반대측 swap 도 inflate. $trange Attraktor [DP ANOTHER] (n=546 scratches, cross 82 / same 380) 의 alt_ratio 는 0.18 (낮음) 이지만 alt rate 는 0.61/s (가짜 양성). Ratio 가 차트 전체 character 의 hand-role 균형을 정확히 반영.

**Window 0.30 초 고정** (BPM-anchor 가 아님) 이유 — C2 의 "musical phrase grouping" 와 달리 C1 은 *motor swap* 의미. 100 BPM 1 beat (0.6초) 는 swap 으로 보기에 너무 느슨. `td < 0.05` (chord-tier 가까운 양손 동시 wheel) 는 swap 이 아니라 bilateral chord 로 분류, C1 에서 제외 (§4.7.3 의 bilateral_scratch tag 로 별도 surface).

**Component C2 — same-side scratch + key proximity (merged):**

각 scratch event $s$ 에 대해, 같은 사이드의 모든 KEY1-7 event 중 BPM-anchored window 안에 있는 것들을 enumerate. 각 pair contribution:

$$\frac{1}{\max(\Delta t,\ \text{chord_threshold_sec})}$$

전체 합을 chart_sec 으로 정규화 후 corpus p95 (= 7.66) 로 clip:

$$C_2 = \min\left(\frac{1}{\text{chart_sec}} \sum_{s \in \text{SCR}}\sum_{k \in K_s} \frac{1}{\max(\Delta t_{s,k},\ \text{chord_thresh})},\ 1.0\right)$$

여기서 $K_s$ = scratch $s$ 와 같은 사이드의 KEY1-7 중 window 안 event.

**Window: half-beat at local BPM, clamped [0.10, 0.40] 초.** 1-beat (legacy) 는 130 BPM 에서 0.46s — 두 별개 event 수준으로 느슨. half-beat 가 user 의 "동시치기 또는 약간 어긋남" 정합.

**왜 near / far 키 merge 인가?** Compound chord (예: S + KEY1 + KEY5) 가 둘 다 활성화하면 두 component 가 같은 scratch event 를 double-count. $trange 의 firing scratches 의 ~44% 가 BOTH (near + far) 활성. Lane 구분은 *axis* 가 아닌 *tag* 에서 처리:

**DP-specific tags** (chord-tier $\le$ 16.67 ms exact 또는 per-measure 패턴):

| tag | 발화 조건 | 의미 |
|---|---|---|
| `adjacent_scratch` (인접) | same-side $S$ + near 키 chord-tier count $\ge 4$ | 한 손 chord, 불편한 손동작 |
| `impossible_scratch` (무리) | same-side $S$ + far 키 chord-tier count $\ge 2$ | 못 칠 것처럼 보이나, 판정 폭 내 입력 어긋내기로 한 손 처리 |
| `bilateral_scratch` (양 스크래치) | 한 마디 안에 양쪽 사이드 모두 $\ge 3$ scratch, 그런 마디 수 $\ge 5$ | 양 wheel 동시 운용 |

#### 4.7.4 BPM trick 처리

`bpm_segments` 는 `analyze()` 의 felt-BPM 보정 (§5) 이 끝난 상태로 전달된다. 따라서 Alcubierre Drive [INSANE], ZAKOTEMPO 등의 BPM trick 차트도 bin 화가 felt-time 위에서 정상 수행. 이전 (felt-BPM 미보정) buggy 측정에서 BPM trick 차트의 distraction 이 비현실적으로 측정되던 문제 해결. DP 의 local_bpm 도 effective_bpm 의 5× 이상 stub 면 fallback 으로 effective_bpm 사용 (BPM stub trap 회피).

#### 4.7.5 검증 — 5-차트 verdict (DP)

사용자 정의 5-차트 ground truth (DP, 2026-05-26 label):

| 차트 | curator | verdict | C1 | C2 | x_distraction | corpus rank |
|---|---|---|---:|---:|---:|---:|
| P.S: Plasma Strike [GALGALIM] | DP ★ | **참** | 0.75 | 1.00 | **0.874** | #14 |
| キマグレ☆ [DP ANOTHER] | DP ★ | **참** | 0.47 | 1.00 | **0.734** | (samples 외) |
| Forceful Beat [DP HYPER] | DP ★ | **참** | 0.36 | 1.00 | **0.679** | #74 |
| キマグレ☆ [DP HYPER] | DP ★ | 중립 ref | 0.49 | 0.21 | 0.350 | #480 |
| $trange Attraktor [DP ANOTHER] | DP ★ | **거짓** | **0.18** | 0.94 | 0.559 | #198 |
| ファンキーホット [DP INSANE] | DP ★ | **거짓** | 0.07 | 0.37 | 0.218 | #727 |

C1 (alt_ratio) 가 핵심 discriminator. $trange 는 C2 saturate (high scratch density) 되어도 C1 낮아 (0.18) 참 chart 들 (0.36-0.75) 와 분리. 5/5 ranking 정합.

**임계**: SP (0.032, 0.084), DP (0.086, 0.290).

### 4.8 (radar-out) peak, jack — drill-down 전용

라디아 7축 외에 두 metric 이 raw 로 계산되어 드릴다운에 사용된다:

- **peak** — 짧은 윈도우 (≤2 sec) 의 burden 강도 (peak_jab + peak_uppercut). burst severity 의 cross-chart 신호.
- **jack** — same-lane 연타 빈도 (window=12 tick). `jack_present` tag 의 base metric.

이 두 metric 은 radar 에 들어가지 않는다 (peak 는 차트 character 보다는 burst 강도, jack 은 tag 로 충분히 표현되기 때문).

### 4.9 절대 floor 와 이중 임계

각 축은 가족 상대 분위수 cutoff 외에 **절대 floor** 를 추가로 적용한다:

- yellow ≥ max(p33, 0.03)
- red ≥ max(p67, 0.08)

**왜 floor 인가?** 희소 축 (LN, soft) 은 p33/p67 자체가 매우 낮다 (예: LN p67 = 0.013). 이 경우 raw 값 0.015 (낮은 절대 비중) 인 차트가 빨강으로 보고된다. user 입장에서 "이 차트가 LN-heavy 인가?" 의 답이 빨강이면 안 됨. floor 가 이런 false-red 를 차단한다.

dense 축 (chord, stream, stair, distraction) 은 p67 이 floor 보다 훨씬 위에 있으므로 floor 가 무력. 즉 floor 는 sparse 축에만 실효.

---

## 5. 시간축 정규화 (Felt-time normalization)

본 절은 본 프레임워크가 가장 많은 설계 결정을 거친 부분이다. BMS 차트의 시간/밀도를 *제대로 측정* 하려는 시도는 차트 작가들이 시간 단위 자체를 가지고 노는 다양한 메커니즘과 부딪힌다. 우리는 이 메커니즘들을 4가지 class 로 식별하고, 각각에 대해 다른 처리를 적용한다.

### 5.0 전체 처리 순서

차트의 시간/밀도를 측정하기 전에 다음 순서로 보정이 적용된다:

```
원본 차트
    ↓
[A] BPM offset translation   (§5.1)
    — 모든 BPM 이 거대 offset 공유 시 빼냄
    ↓
[B] Stage 1: Class B truth recovery   (§5.2)
    — 일부 gimmick segment 만 truth_bpm 으로 pin
    ↓
[C] Stage 2: Class A H1 fallback   (§5.3)
    — Stage 1 미적용 + 트리거 조건 시 전체 BPM 압축
    ↓
[D] Z4 1초 felt-time 버킷   (§5.5)
    — 보정된 시간축 위에서 NPS 계산
```

Class D (measure-scale trick) 는 felt-BPM 보정이 적용되지 않는다 — 메커니즘 자체가 다르기 때문 (§5.4).

---

### 5.1 [A] BPM offset translation

#### 메커니즘

`#BPM` 헤더나 `#BPMxx` 명령에서 의미 있는 BPM 에 거대 offset 이 더해진 케이스. 예를 들어 실제 60 BPM 부분을 `#BPM 10000060` 으로 표기하면, BMS 플레이어는 1천만 BPM 으로 해석하여 모든 노트가 micro-second 단위로 압축된다.

#### 감지 규칙

차트에서 사용된 모든 BPM (base + 모든 `#BPMxx`) 이 같은 10^k offset 을 공유하고, residual (offset 을 뺀 후의 값) 이 plausible range (대략 30 ~ 1500) 안에 들어가면 차감.

#### 예시: シャトルラン [Hexagon]

```
원본 BPM (시간순):
  10000060, 10000064, 10000069, ..., 10000573  (선형 ramp 60 → 573)

감지: 모든 BPM 이 10^7 offset 공유, residual ∈ [60, 573] 모두 plausible
처리: offset 차감 → 60, 64, 69, ..., 573 BPM 으로 재해석

결과:
  effective_bpm: 101 (선형 ramp 의 note-weighted mean)
  chart_seconds: 138.8 sec (정상 음악 길이)
  Z4 nps_max: 7.0 (정상 sn-tier 흐름)
```

원본 그대로 해석했다면 effective BPM 이 10M 단위로 측정되어 후속 모든 metric 이 무력해진다.

#### 예시: ZAKOTEMPO

```
원본: 10000199 ~ 10000277 (10^7 + [199, 277] 변동)
차감 후: 199 ~ 277 BPM, effective_bpm = 199
chart_seconds: 130.5 sec
```

#### 한계

BPM offset translation 은 `#BPMxx` 명령 *밖* 의 메커니즘 (`#xxxNN02` measure scale, layered `#STOP`) 은 보정하지 못한다. 위 차트들이 felt-time bucket count 에서 잔존 artifact 를 보이는 이유 (예: シャトルラン bucket_count = 8.8M — note 들은 대부분 보정된 시간에 있지만, 일부 micro-second 단위 잔존 segment 가 felt-time span 을 압도). 이 잔존 artifact 가 NPS_max 자체에는 영향 없음 (1초 버킷 단위) — 다만 차트 길이 통계는 왜곡됨.

---

### 5.2 [B] Stage 1 — Class B truth recovery (segment trick)

#### 메커니즘

차트의 *일부 구간* 만 비현실적 BPM 으로 채우고, 나머지는 정상 BPM 으로 진행. 예: 차트가 250 BPM 으로 흐르다가 m204 한 마디만 BPM 9,990,400 으로 빠르게 지나가게 만들어 그 마디에 노트를 micro-second 단위로 쑤셔 넣음.

이 형태는 *진짜 BPM* (truth_bpm) 이 차트 안에 존재한다. duration 으로 가중된 mode BPM 이 plausible range 에 있고, 그 BPM 으로 흐른 시간이 차트 대부분을 차지한다.

#### 감지 규칙 (모두 만족 시)

1. duration-weighted mode BPM ∈ [30, 1500] (plausible)
2. note-weighted effective BPM 이 mode BPM 의 5배 이상 (diverge)
3. effective BPM 자체가 1000 이상 (implausibly high)

조건 만족 시 truth_bpm = duration-weighted mode BPM 으로 정의, **diverge 한 gimmick segment** 만 truth_bpm 으로 pin (정상 segment 는 그대로).

#### 예시: Alcubierre Drive [INSANE]

```
원본 BPM segment 들 (대략):
  base 174 BPM  + 일부 #BPMxx 가 1.74M
  + measure_scale (xxxNN02:0.001 류) 가 일부 마디에 적용
  + #STOP 26,000 개 (micro-stops)

note-weighted effective BPM 계산:
  effective_bpm ≈ 1.66M (gimmick segment 에 노트가 집중되어 압도)

duration-weighted mode BPM:
  174 (전체 차트 시간 중 가장 긴 시간 차지)

감지:
  mode=174 ∈ [30, 1500]  ✓
  effective/mode = 1.66M / 174 ≈ 9540 ≥ 5  ✓
  effective = 1.66M ≥ 1000  ✓

처리: 1.66M BPM segment 들을 174 로 pin (정상 174 segment 는 그대로)

결과:
  effective_bpm: 174 (recovered)
  Z4 nps_max: 33 (정상 sl9 수준)
  NPS_mean: 16.5 (코퍼스 median 근처)
```

차트 헤더에 적힌 BPM (174) 와 truth recovery 결과가 일치 — 이 차트의 진짜 의도가 정상 174 BPM 차트라는 것을 framework 가 *구조적으로* 복원했다 (헤더 의존 없이).

#### 예시: Aleph-0 [INSANE] (반례)

```
note-weighted effective BPM: 277.8
duration-weighted mode BPM: 250 정도

condition 1 (mode plausible):     250 ∈ [30, 1500]  ✓
condition 2 (5× divergence):      277.8 / 250 ≈ 1.11    ✗
condition 3 (effective ≥ 1000):   277.8 < 1000           ✗
```

Aleph-0 는 BPM trick 차트가 아니다 — 모든 BPM segment 가 plausible musical range 에 머물러 있고, effective vs mode 차이 (1.11×) 도 작은 음악적 변속 (dense section 이 약간 빠른 BPM 에 놓이는 정도) 에서 비롯된 정상 변동이다. truth recovery 가 요구하는 5× 이상의 divergence 와 1000+ effective BPM 두 조건 모두 미충족이므로 BPM 보정 없이 그대로 분석.

이 차트의 m204 가 일부 BMS 버전에서 BPM 9,990,400 같은 **단발 micro-second segment** 를 포함한다는 보고가 있지만, 본 코퍼스의 분포로는 전체 effective BPM 이 1000 을 넘지 않아 truth recovery 가 발화되지 않는다. 그런 단발 burst 가 있더라도 후속 Z4 (§5.5) 가 1초 felt-time 버킷으로 묶어 부풀려진 NPS 를 차단한다.

---

### 5.3 [C] Stage 2 — Class A H1 fallback (uniform trick)

#### 메커니즘

차트 전체가 비현실적 BPM 으로 흐르는 경우. Class B 와 달리 차트 안에 *진짜 BPM* 이 없다. 모든 signal 이 gimmick 이므로 truth recovery 가 발화되지 않는다.

#### 감지 규칙 (두 트리거 모두 발화 시)

1. note-weighted effective BPM > `trigger_eff_bpm` (현재 500)
2. declared `peak_local_max_density_per_sec` > `trigger_peak_per_sec` (현재 200)

#### 처리 (H1 heuristic)

declared peak NPS / target peak NPS 의 비율로 모든 BPM 을 균일하게 축소. target = 50 NPS (현실적 hard 차트의 peak 영역).

$$\text{scale} = \frac{\text{target peak per sec}}{\text{declared peak per sec}}$$

$$\text{felt_bpm} = \max(\text{declared_bpm} \times \text{scale}, \text{felt_bpm_floor})$$

floor = 30 BPM (이보다 낮추면 비현실적 slow 차트가 됨).

#### 예시: シャトルラン Hexagon (Stage 1 으로 처리되지 않을 시)

```
declared BPM after [A]: 60 ~ 573 (linear ramp, mean ~300)
declared peak NPS: 800 NPS (10M BPM 위에서)

만약 [A] BPM offset translation 이 실패했다면:
  effective BPM > 500 ✓
  peak per sec > 200 ✓
  → H1 발화
  scale = 50 / 800 = 0.0625
  felt_bpm = 10M × 0.0625 ≈ 625,000 → 여전히 비현실
  
[A] 가 우선 처리되어 BPM 이 60~573 으로 되돌아간 상태에서는:
  effective BPM = 101  
  peak per sec = 정상 범위
  → H1 발화 안 함 (조건 미충족)
```

이 처리 순서가 중요한 이유 — [A] 가 먼저 깨끗하게 정리되어야 [B], [C] 가 잘 작동한다.

#### 예시: ネグラドルナ류 [MODEL 8+]

```
header BPM: 2222
effective BPM: ~2200 (전체적으로 균일)
duration-weighted mode BPM: 2222 (정상 range 밖)

Stage 1 truth recovery 발화 안 함 (mode BPM out-of-plausible)
Stage 2 H1 발화:
  scale = 50 / declared_peak ≈ 0.1
  felt_bpm = 2222 × 0.1 ≈ 222 → floor 위, 채택

결과: 222 BPM 차트로 측정
```

#### 불확실성의 표면화 (time_base_reconstructed, 2026-06-13)

H1 fallback 은 단 하나의 자유 규약 — target peak = 50 NPS — 으로 time base 를 고정한다. 이 차트는 진짜 tempo 에 대한 *내부 증거가 전혀 없기* 때문이다 (Class B 의 embedded real BPM 이나 Stage [A] 의 복원 가능한 offset 과 달리). 따라서 그런 차트의 모든 real-time 유래 attribute 는 측정이 아니라 *선언된 연주 가능성 규약 위의 해석*이다. framework 는 이를 숨기지 않고 표면화한다: `felt_info.method == "h1_heuristic"` 인 차트는 `time_base_reconstructed = True` 로 플래그되고 `framework_signal_status` 도 그에 맞게 설정되어, 소비자가 absolute-scale attribute (초당 밀도, pace, intensity 색) 는 할인하면서 frame-invariant 한 tick-domain shape (chain 구조, lane 기하) 는 계속 신뢰할 수 있다.

historical roster 정정 (§5.1–5.3 기원, 2026-04-29 "Class A = 5 charts"): 그 cohort 는 완전히 superseded 됐다. シャトルラン / ZAKOTEMPO 는 이제 Stage [A] BPM-offset translation 으로 해소되고 (증거 기반 — 올바르게 플래그 *안 됨*), ネグラドルナ ×2 / 戦歌 オルグラリヤ 는 scale-troll 경로로 Class D 에 들어간다. 진짜 증거-부재 (h1_heuristic) cohort 는 이제 사실상 비어 있다; 플래그는 미래의 증거-부재 차트를 위한 안전망이지 그 다섯을 위한 패치가 아니다.

---

### 5.4 Class D — measure-scale trick (felt-BPM 보정 안 됨)

#### 메커니즘

`#xxxNN02:k` 명령으로 *마디 길이를* k 배. BPM 은 그대로지만, k=0.001 이면 그 마디는 실제로는 0.001 마디 길이 → 한 마디 노트가 micro-second 단위에 압축됨. 반대로 k=1000 이면 한 마디에 노트를 1000배 채워 넣어도 felt-time 안에 다 들어감.

#### 왜 felt-BPM 보정 안 되나

BPM 자체는 정상이다 (예: 155). felt-BPM heuristic 은 BPM 을 보고 보정하므로, BPM 이 정상인 measure-scale 트릭은 trigger 되지 않는다.

#### 추적: scale_exposure

각 마디의 measure scale 값을 노트 가중 평균하여 `scale_exposure` 메트릭에 기록. exposure 가 0.05 이상이면 measure-scale 트릭의 영향이 있다고 본다.

#### 예시: 幽雅に咲かせ、墨染の桜 [HYPER]

```
header BPM: 155
effective BPM: 155 (정상)
duration-weighted mode BPM: 155 (정상)
→ felt-BPM 보정 둘 다 발화 안 함

하지만:
  chart_seconds: 142.5 sec
  total_events: 4846
  Z4 nps_max: 449.0  ← 한 felt-second 안에 449 notes
  active buckets: 140
```

Z4 가 felt-time 위에서 측정하므로, 그 차트가 한 초 안에 진짜로 449 노트를 띄우면 449 NPS 로 기록된다. measure-scale trick 으로 마디 안에 5000개를 욱여넣어도, 그 마디가 felt-time 안에서 1초 동안 흐르면 그 1초의 NPS = 1초 안의 노트 수.

이 의미에서 Z4 는 measure-scale trick 을 **"올바르게 보고함"** — 449 NPS 가 차트의 실제 player-feel 강도다 (그 차트는 1초에 449번 키를 친다고 가정함). 다만 그게 *플레이 가능* 한지는 별개 — framework 는 측정만 한다.

---

### 5.5 [D] Z4 — 1초 felt-time 버킷

#### 정의

```
event 의 felt-second:  s_e = tick_to_sec(t(e), sec_table)
bucket index:          b_e = ⌊s_e - s_0⌋    (s_0 = min event sec)
bucket NPS:            그 bucket 의 event count (bucket 너비 = 1초)
```

#### 왜 이렇게?

이전 measure-level binning 은 각 마디 안의 노트 수를 마디 길이로 나눠 NPS 를 계산했다. measure-scale 트릭이나 BPM trick 미보정 분이 마디 길이를 0.015 초까지 줄이면, 한 마디에 5 노트 있어도 5/0.015 = 333 NPS 가 보고된다. アルスノヴァに喝采を [SUPERNOVA] 의 이전 측정은 8,000 NPS 였다 — 음악적 의미 없는 숫자.

1초 felt-time 버킷은 felt-time 위에 1초 윈도우를 깔아 그 안의 노트만 센다. micro-second 단위 burst 가 한 버킷에 다 들어가도 1초 내 노트 수는 player 가 1초 동안 친 횟수와 같다. **player-feel 단위로 정직.**

#### 효과 (SP 코퍼스)

| 통계 | before (measure) | after (1-sec bucket) |
|---|---:|---:|
| median NPS_max | 100.8 | 34.0 |
| p99 | 1,177.6 | 57.0 |
| max | 8,000.0 | 449.0 |

#### 잔존 case

- max = 449 (幽雅 [HYPER]) — Class D 한계 (§5.4).
- 일부 BPM offset 차트 (シャトルラン, ZAKOTEMPO) 의 bucket_count 가 millions — felt-time span 자체는 BPM offset translation 의 일부 잔존 artifact 로 왜곡되지만, **active bucket 만 보면** 정상 (シャトルラン active=1479, ZAKOTEMPO active=1192). NPS_max 값에는 영향 없음.

### 5.6 STOP dead-time 과 구조적 BPM ramp (2026-06-13)

#### STOP dead-time 주입 (L1, 부분 채택)

tick 을 felt-time 으로 변환하는 seconds table 은 BPM segment 만으로 만들어졌어서 `#STOP` 의 정지 시간이 time 축에서 사라졌다 — 5초 STOP 을 가로지르는 figure 가 연속으로 읽혀, 그 위의 real-time pace 나 density 가 부풀었다. 이제 table builder 는 각 STOP 을 정지 초를 담은 zero-tick-span entry 로 선택적 주입한다 (stop tick 정확히 위의 note 는 post-stop 쪽으로 매핑), 그래서 STOP 을 가로지르는 gap 이 정지 시간을 포함한다.

이는 **stair 경로와 shape_v2 candidate 검출기에서 먼저 채택**됐고, 선언 frame 이 곧 분석 frame 인 차트로 gate 된다 (`stop_cap_info is None and felt_info is None and bpm_offset_info is None`): trolled / reconstructed-frame 차트에서는 선언-frame STOP 초가 다른 time frame 에 섞이면 안 되며, §5.x stop-pathology guard (예: ニニ bga_haha 의 5.58시간 troll stop) 도 time 축에 들어가면 안 된다. 나머지 real-time consumer (stream window, LN, scratch, distraction, density bar, peak) 는 각자의 canary 와 함께 metric 별로 이주한다.

#### 구조적 BPM ramp (bpm_ramp 태그)

"어떤 BPM 이 참인가" 가 답할 수 없을 때 (§5.3) 에도, 차트는 BPM 이 *점진적으로* 상승한다는 frame-invariant 증거를 담을 수 있다. `detect_bpm_ramp` 는 note 보유 segment (playable note ≥4, 그래서 note 없는 visual-gimmick spike 가 ramp 를 끊지도 위조하지도 못함) 를 훑어, 각 step 이 ≤1.3× 로 유계인 ("점진적", 도약 아님) 단조 run 을 찾는다; run 은 ≥3 strict 상승에서 net ratio ≥1.25 일 때 자격을 얻는다. `bpm_ramp` 태그는 up-ramp 가 note 의 ≥25% 를 덮고 max run ratio ≥1.3 일 때 발화.

ramp 구조는 **Stage [A] 에 대해 frame-invariant 하다** — $10^k$ offset shift 는 segment 순서와 근사 step 비율을 보존 — 그래서 authored accelerando 는 absolute BPM 이 gimmick 인 차트에서도 측정 가능한 사실이다. 검증: ZAKOTEMPO (199→277, 18 step, note 의 99.4%), シャトルラン (69→556, 485 step, ratio 8.06, authored shuttle-run beep-test 가속); 컨트롤 (Skydive / stairway / JUMMER) zero. Down-ramp (ritardando) 는 태그 없이 sub-metric 으로 추적.

### 5.7 #RANDOM 재현성 (`randomized` 태그)

BMS `#RANDOM N` 지시자는 parse 시점에 1..N 을 굴리고 둘러싼 `#IF M` 분기는 일치할 때만 발화한다 — 설계상 플레이어는 *매 플레이 새 roll* 을 본다. 정적 분석 코퍼스에는 이게 결함이다: 파서가 원래 무시드 전역 RNG 를 굴려, #RANDOM 차트는 parse 마다 다른 분기를 골라 다른 이벤트를 냈다 — 런 간 (한 프로세스 내 연속 parse 두 번도, 고정 `PYTHONHASHSEED` 에서도) 재현 불가. 이제 파서는 차트별 RNG 를 `md5(data)` 로 시드하여 각 차트가 한 분기를 결정적으로 고르고(차트 간 무상관) 코퍼스가 재현 가능하다.

코퍼스의 #RANDOM 차트 조사 결과 세 클래스: **단일 변주** (`#RANDOM` 블록 1–2 개 — 한 분기가 정당한 한 플레이 버전; 대부분, 예: L9, Trancing, アニマのささやき), **곡 전체 매-플레이** (34–533 블록 — 차트가 진짜 매 플레이 다름; Wavetapper, Skydive, Unidentified Flying Scotsman, りくろ, 薄雲), **degenerate** (`#RANDOM 1`, no-op; 예: Aleph-0). 변주 크기는 블록 수와 무관하다 — L9 는 단일 `#RANDOM 6` 인데 6개 분기가 전혀 다른 차트(BPM 3390 / 6666 / 9888). 곡 전체 클래스의 경우 md5-고정 분기는 본질적으로 가변인 차트의 한 표본이므로, `randomized` 태그 (`#RANDOM N>1` 블록 ≥10 발화) 가 radar/density 가 고정 차트가 아닌 한 분기를 반영함을 표시한다. 단일 변주·degenerate 차트는 미표시.

---

## 6. 임계 calibration

### 6.1 코퍼스 통계

- SP: n = 6,703 (mode-active)
- DP: n = 1,852

각 mode 의 nonzero distribution 에서 p33, p67 를 계산.

### 6.2 임계 결정 절차

1. corpus regen → 각 차트의 axis raw 값 산출
2. mode 별로 nonzero distribution 정렬
3. p33, p67 를 corpus percentile 로 추출
4. `_AXIS_INTENSITY_THRESHOLDS_SP/DP` table 에 baking
5. 절대 floor (0.03 / 0.08) 와 합쳐 `_classify_axis_intensity` 가 final tier 결정:

$$
\text{tier}(v, p_{33}, p_{67}) = \begin{cases}
\text{red} & v \geq \max(p_{67}, 0.08) \\
\text{yellow} & v \geq \max(p_{33}, 0.03) \\
\text{green} & v > 0 \\
\text{null} & v = 0
\end{cases}
$$

### 6.3 임계 drift check

코퍼스가 갱신될 때마다 (메트릭 손대지 않더라도) fresh p33/p67 와 baked threshold 의 ∆ 를 확인. ∆ < 0.001 수준이면 stable, 그 이상이면 recalibration.

---

## 7. 검증 사례 (Case studies)

각 사례는 (차트 / 가족 / radar / 주요 tag / 시간축 모양 / 해설) 로 구성.

### 7.1 Aleph-0 [INSANE] — chord-stream 우세

- **가족**: ★★2
- **radar**: chord, stream 양쪽 모두 red. peak_uppercut = 1.00 (코퍼스 최대).
- **tag**: chord_heavy, stream_dense, dense_chart
- **density**: sec 60-65 의 burst cluster, 이후 sec 89-102 의 sustained 30-40 NPS plateau
- **해설**: chord-heavy stream 차트의 대표 사례. parallel-ownership 모델에서 chord 와 stream 이 동시에 red 로 잡힘. ★★ 가족 안에서도 sustained burst 의 시간축 분포가 시각적으로 두드러짐.

[TODO: 카드 캡처]

### 7.2 Alcubierre Drive [INSANE] — BPM trick recovery

- **가족**: sl9
- **radar**: stream red, chord yellow
- **tag**: visual_gimmick, soflan, fast_chart, dense_chart
- **density**: bucket_count 1082 (felt-time span, BPM trick 의 영향)
- **NPS_max**: 33.0 (sl 가족 p75 수준 — outlier 아님)
- **해설**: Class A BPM trick (BPM 1.74M warp) 차트. felt-BPM heuristic 이 BPM 을 174 로 보정한 뒤, Z4 1초 버킷이 실제 felt-time NPS 를 측정. 같은 가족 cohort 와 비교하면 평범한 sl9. 1초 felt-time bucket 이 BPM trick 의 micro-burst 영향 제거에 성공한 사례.

[TODO: 카드 캡처]

### 7.3 幽雅に咲かせ、墨染の桜 [HYPER] — measure-scale outlier

- **가족**: ★★8
- **NPS_max**: 449.0 (단일 1초 안에 449 노트)
- **해설**: Class D measure-scale trick. `#xxxNN02:1000` 류 마디 길이 배율로 한 마디 안에 수백 노트가 들어 있고, 그 마디가 felt-time 안에서 1초 정도. felt-BPM heuristic 으로 처리 불가 (BPM 자체는 정상, 마디 길이만 비정상). framework 의 한계 case.

[TODO: 카드 캡처]

### 7.4 Skydive (st4) vs FREEDOM DiVE [FOUR DIMENSIONS] (st8/★★5) — density-vs-difficulty divergence

> **[2026-06-06 수정]** 이 절의 원래 Skydive 수치는 `BMS.Tools/scripts/bms_parser.py` 결함에서 나왔다 — 파서가 BMS 사양 §11 `#RANDOM / #IF / #ENDIF` 제어 흐름을 무시해서, Skydive 소스의 모든 분기가 발동한 것처럼 합쳐졌다. Skydive 의 `.bms` 소스는 playable 채널에 138 × `#RANDOM 21` + 126 × `#RANDOM 35` sister-branch 블록을 쓴다 (여러 staff-roll "troll" 패턴 중 하나); 깨진 파서가 노트 수를 1,877 (실제 LR2 렌더링 값) 에서 2,891 로 부풀렸다.
>
> 아래 원래 예시는 기록용으로 취소선과 함께 보존하고, 정정 분석이 그 뒤를 따른다. 취소선 tier 비교 ("Skydive NPS > FD NPS") 는 파서 버그 artefact 였고 더 이상 성립하지 않는다.

~~framework 의 *"axes ≠ difficulty"* 원칙 (§2.4) 이 가장 직관적으로 드러나는 사례. 두 차트의 raw 표 값:~~

| | Skydive ~~(원본)~~ | Skydive **(정정)** | FREEDOM DiVE [FOUR DIMENSIONS] |
|---|---:|---:|---:|
| **curator family** | **st4** | **st4** | **st8 / ★25 / ★★5** |
| BPM | 120 | 120 | 222 |
| chart 길이 | 67 sec | 67 sec | 138 sec |
| NPS mean | ~~**44.5**~~ | **28.9** | 33.0 |
| NPS max | ~~57~~ | (하향 재계산) | 56 |
| **Pos/s** | ~~**7.0**~~ | **7.0** | **12.0** |
| avg chord size | ~~6.67~~ | **4.30** | 3.33 |
| x_chord | ~~0.99~~ | 0.985 (거의 그대로 — saturated) | 0.73 |
| x_stream | ~~0.96~~ | 0.96 (변화 없음) | 0.85 |
| x_peak | 0.31 | 0.31 | 0.64 |
| primary_character | ~~**chord-spam**~~ | **chord-shape** (재분류됨) | **chord-shape** |

#### ~~표만 보면 발생하는 함정~~

> ~~NPS mean 만 보면 Skydive (44.5) > FD (33.0). max 도 비슷. *user 가 NPS 를 어려움의 proxy 로 잘못 읽으면* "Skydive 가 더 어렵네!" 라는 perception 가능. 그러나 curator-tier 는 정 반대 (st4 vs ★★5, 약 4-5 단계 차이).~~

**정정**: 올바른 데이터로 보면 Skydive 의 NPS (28.9) 가 이제 FD (33.0) 보다 *낮다*. 원래의 "high-NPS-but-low-tier 역설" 은 차트의 실제 특성이 아니라 파서 버그 artefact 였다. §2.4 *"axes ≠ difficulty"* 원칙이 무효화되는 건 아니고 — 다른 예시가 필요할 뿐이다.

#### ~~분해해서 보면~~

~~`NPS = Pos/s × avg_chord_size` (§3.5) 로 분해:~~

- ~~**Skydive**: 7.0 위치/sec × 6.67 chord = 약 47 NPS. 120 BPM 16분음표 (8 pos/sec) 의 거의 모든 위치에 full 7-chord. 단일 패턴, endurance 차트.~~
- ~~**FD [FOUR DIMENSIONS]**: 12.0 위치/sec × 3.33 chord = 약 40 NPS. 222 BPM 의 빠른 위치 변화 위에 3-4 lane chord. pattern + speed 차트.~~

~~같은 ~50 NPS 수준이지만 mechanism 이 다르다.~~

**정정된 분해**: Skydive 는 이제 7.0 × 4.30 ≈ 30 NPS (원래 측정보다 작은 chord 의 chord-wall); FD 는 12.0 × 3.33 ≈ 40 NPS (위치 변화) 그대로. Pos/s 분해는 여전히 mechanism 차이 (endurance vs speed) 를 드러낸다 — §3.5 컬럼이 가르치려던 교훈. 단지 raw NPS 비교만 서사적 무게를 잃는다.

#### ~~radar 가 정확히 구분~~

~~framework 의 *radar* 는 이 두 mechanism 을 정확히 다르게 표현:~~

- ~~Skydive: chord 0.99 (saturated) + peak 0.31 (variety 없음) + tag `chord-spam`~~
- ~~FD: chord 0.73 + peak 0.64 (variety 있음) + tag `chord-shape`~~

**정정** — 깨끗한 데이터에서는 두 차트 모두 이제 `chord-shape` 로 분류된다 (chord 0.985 vs 0.73, peak 도 비슷). 따라서 원래의 "두 character 가 구별된다" 주장은 이 쌍에는 성립하지 않는다. `chord-spam` → `chord-shape` 카테고리 이동은 35 % phantom 노트 부풀림이 제거되면서 chord-shape-variety 서브메트릭이 임계를 넘었기 때문이다. 이는 데이터 정정 하의 축 시스템의 *예상된* 거동이지 framework 실패가 아니다.

#### meta-lesson — 데이터 무결성이 축 해석에 앞선다

이 절은 파서 버그가 축에 오염된 데이터를 먹였을 때 무슨 일이 일어나는지 보여주는 사례로 남긴다:

1. 외형상 부풀려진 NPS 가 *오해를 부르는 깔끔한* "axes ≠ difficulty" 예시 (high NPS, low tier) 를 만들었다.
2. chord 축은 어느 쪽이든 saturated (0.985 vs 0.99) — saturation 이 근본 차이를 가렸다.
3. primary-character 분류기가 정정 후 카테고리를 바꿨다 — *유용한 진단*: 파이프라인 재실행이 카테고리 flip 을 내면 데이터 계층 문제를 의심하라.

**§2.4 의 깨끗한 교체 예시는 데이터 검증 후에도 tier vs NPS 괴리가 유지되는 차트 쌍을 써야 한다.** 아래 교체본은 코퍼스 필터 (`SP, 둘 다 st scale, chord-wall vs varied-chord-shift, post-fix metrics`) 로 선정했다.

### 7.4a 교체 예시 — Sampling Satan (st3) vs κανων (st12)

데이터 무결성 수정 후, tier 라벨이 있는 SP 차트 (5,575개) 코퍼스 sweep 에서 파서 artefact 에 의존하지 않고 §2.4 역설을 보이는 쌍이 떠올랐다. 여기서의 mechanism 대비는 **chord-wall vs stream-pure** — 원래 Skydive vs FD 구도 (chord-wall vs varied chord-shift, 둘 다 `chord-shape` 카테고리 안) 와는 다른 질감이다. 새 쌍은 카테고리 경계를 넘는다: framework primary character 가 Satan 은 `chord-shape`, κανων 은 `stream-pure`. 두 차트 모두 `#RANDOM` 을 쓰지 않아 재실행에도 값이 결정적이다.

| | Sampling Satan | κανων |
|---|---:|---:|
| **curator family** | **st3** | **st12** |
| BPM | 200 | 175 |
| chart 길이 | 87 sec | 140 sec |
| 총 노트 | 2,835 | 3,422 |
| NPS mean | **33.57** | **26.95** |
| NPS max | 46 | 54 |
| **Pos/s** | **6.19** | **15.17** |
| avg chord size (chord window 내) | **5.61** | **2.58** |
| chord_rate (chord 인 위치 비율) | **0.944** | **0.396** |
| x_chord | 0.970 | 0.351 |
| x_stream | 0.852 | 0.927 |
| x_peak | 0.261 | **1.000** |
| primary_character | chord-shape | **stream-pure** |
| IRT (easy / hard) | 1.35 / 1.75 | — (low-confidence) |

#### 역설의 복원

NPS mean 만 보면 Sampling Satan (33.57) > κανων (26.95). 순진하게 "NPS = difficulty" 로 읽으면 Satan 이 더 어렵다고 예상한다. curator 라벨은 정반대다: Satan 은 st3 (low-intermediate satellite), κανων 은 st12 (satellite scale 최상단, 9 tier 위). 가용한 IRT 신호도 뒷받침한다: Satan 의 hard-clear 난이도는 ≈ 1.75, κανων 은 clear 데이터가 너무 희소해 안정적 IRT 가 안 나온다 — clear bar 에 도달하는 플레이어가 극소수라는 별도의 힌트.

#### 분해 — §3.5 의 일반형 사용

약식 `NPS ≈ Pos/s × avg_chord_size` 는 거의 모든 위치가 chord 일 때 (`chord_rate → 1`) 만 성립한다. mixed 차트의 정확형:

`NPS ≈ Pos/s × [chord_rate × avg_chord_size + (1 − chord_rate)]`

— 괄호 항은 *위치당 평균 노트 수* 로, chord 위치는 크기로, 단노트 위치는 1 로 가중한다.

- **Sampling Satan**: `chord_rate = 0.944`, `avg_chord = 5.61` → factor = 0.944 × 5.61 + 0.056 = **5.35**. NPS ≈ 6.19 × 5.35 = **33.1**, 측정값 33.6 과 일치. chord wall — 위치의 94 % 에 chord event, 평균 chord 크기 7키 중 5.6. 200 BPM 의 단일 리듬 벡터를 87초 동안 지속. *endurance-class chord mash*.
- **κανων**: `chord_rate = 0.396`, `avg_chord = 2.58` → factor = 0.396 × 2.58 + 0.604 = **1.63**. NPS ≈ 15.17 × 1.63 = **24.7**, 측정값 27.0 과 9 % 이내 일치. stream-pure 차트 — 위치의 60 % 가 *단노트*, 나머지 40 % 가 2-3 키 cluster, 모두 175 BPM 에서 15 위치/sec 로 발사되며 peak burst saturation. *sight-read / finger-discipline class*.

약식 `Pos/s × avg_chord_size` 는 모든 위치를 chord 로 취급해 κανων 에 **39.1** (45 % 과대) 을 줬을 것이다 — `chord_rate < ~0.85` 일 때 정확형이 중요한 이유.

#### radar 가 정확히 구분

- **Sampling Satan**: x_chord 0.97 + x_peak 0.26 + primary `chord-shape` + tag `big_chord_burst` — saturated, non-bursty chord wall.
- **κανων**: x_chord 0.35 + x_peak 1.00 + primary `stream-pure` + tag `jack_present` — sparse mid-size chord 구두점이 있는 stream, max burst saturation.

두 character 는 카테고리 경계를 넘고 (chord-shape vs stream-pure), x_chord 가 0.62, x_peak 가 0.74 차이 나는데 NPS 값은 tier 순위를 뒤집는다. 이것이 §2.4 원칙의 정직한 형태다: *어떤* event 가 density 를 만드는지 — chord 깊이냐 위치 빈도냐 — 가 event 가 *몇 개* 인지보다 중요하다.

이 쌍이 원래 Skydive vs FD 구도 (두 `chord-shape` 질감 비교) 보다 더 강한 mechanism 대비임에 유의. 단점은 §3.5 의 chord-stream 행과의 차트-쌍 연결이 이 절 안에서는 끊긴다는 것; κανων 은 §3.5 의 다른 행 (*varied chord-stream* 이 아니라 *stream* archetype) 에 속한다.

#### lesson

이 차트들의 진짜 difficulty 차이는 framework 가 측정하지 *않는* 차원 (pattern recognition, sight-reading, finger discipline; §9.1 의 미반영 9 차원) 에 있다. NPS density 만으로 difficulty 를 추론하면 같은 density 라도 *어떤 mechanism* 인지 무시한다. difficulty 평가의 정직한 형태는 character snapshot, curator tier 라벨, 그리고 사용자 자신의 리듬게임 경험을 결합한다.

---

## 8. Sound-aware metrics — 두 레벨

본 프레임워크에서 "음원 정보" 는 두 다른 수준에서 사용되거나 시도되었다. 비용과 한계가 다르므로 명확히 구분한다.

| 레벨 | 메커니즘 | 비용 | 본 framework 에서의 상태 |
|---|---|---|---|
| **L1 — keysound id matching** | `#WAV` 슬롯 id 비교 (같은 샘플 트리거 여부) | 텍스트 파싱만 (무료) | ✅ 채택 — jack 의 `double_tab` / `triple_tab` 태그 (§8.1) |
| **L2 — audio FFT pitch** | WAV 디코드 + pyin pitch 추출 | CPU / 메모리 / 사전 캐시 필요 | ❌ stair 정의에서 거부 (§8.2) |

L1 은 채택되어 production 에 있다. L2 는 conceptual 하게 흥미로웠으나 empirical audit 에서 가설이 깨졌다. 두 case 모두 BMS community 에서 토론 가치가 있어 기록한다.

### 8.1 L1 — Keysound id matching (jack, 채택)

#### 가설

같은 lane 의 인접 노트가 *같은 `#WAV` 슬롯 id* 를 참조하면 — 즉 정확히 같은 음원 샘플을 다시 트리거하면 — 그 chain 은 *keysound-anchored repetition* 이다. 작가가 의도적으로 "같은 소리 연타" 를 만든 형태이며, player 입장에서 perceptual jack 의 정직한 신호.

#### 구현

각 노트 $e$ 에 대해 `token(e)` = 그 노트가 트리거할 `#WAV` 슬롯 id 를 추출. 같은 lane 의 인접 두 노트 $(e_i, e_{i+1})$ 가 다음 조건을 만족하면 keysound-matched pair:

$$\text{matched}(e_i, e_{i+1}) = \mathbb{1}\left[ \text{lane}(e_i) = \text{lane}(e_{i+1}) \,\wedge\, \text{token}(e_i) = \text{token}(e_{i+1}) \,\wedge\, \text{gap}_{\text{tick}}(e_i, e_{i+1}) \leq 12 \right]$$

연속된 matched pair 들의 chain 길이 $\geq 2$ → `double_tab` 태그, $\geq 3$ → `triple_tab` 태그.

#### 비용

오디오 파일을 디코드하지 않는다. BMS 텍스트의 `#WAV` 슬롯 reference 만 보면 된다. corpus regen 의 비용 증가 없음.

#### 한계

- 작가가 같은 lane 연타에 *다른* `#WAV` id 를 줘서 음원 노이즈를 다양하게 만들면 (예: 02, 03, 02, 03, ...) keysound-matched 가 발화 안 함. 이런 chain 은 *비-anchored jack* 으로 lane-only 검출 (`jack_present` 태그) 이 담당.
- 같은 `#WAV` id 라도 실제 음원이 다른 BMS 패키지를 합쳐 만든 경우 false-match. 드물지만 가능.

### 8.2 L2 — Audio FFT pitch detection (stair, 탐색 후 거부) — 동기

stair axis (§4.6) 는 키 순서가 ±1 lane 으로 흐르는 chain 을 탐지한다. 이 정의는 **차트 lane 패턴** 만 본다 — keysound (`#WAV`) 가 진짜로 음계로 진행하는지는 측정에서 빠져 있다.

사용자의 통찰: *"진짜 계단 (perceptual stair) 은 lane 만이 아니라 음계 (audio pitch) 도 같이 흐른다"*. 같은 lane 진행이라도 keysound 가 무작위면 perceptual stair 가 약하다. 반대로 keysound 가 진짜로 do-re-mi-fa 로 흐르면 그 진행이 player 의 expectation 을 만들어 정직한 계단으로 인식된다.

**가설**: lane-진행 + audio-진행 이 둘 다 맞는 chain 만 진짜 stair 로 카운트하면, framework 의 stair axis 가 player perception 과 더 일치할 것이다.

### 8.3 L2 — 구현 시도 (Phase 1V 인프라)

#### 단계 1 — keysound pitch 추정

각 `#WAV` slot 의 음원 파일에 대해 base pitch f₀ 를 추정. 도구는 **librosa.pyin** (probabilistic YIN, Hz 단위 fundamental frequency 추정). 결과를 chart-level cache 로 저장.

```
keysound 01.wav → f₀ = 440.0 Hz  (A4)
keysound 02.wav → f₀ = 466.2 Hz  (A#4)
keysound 03.wav → f₀ = 493.9 Hz  (B4)
...
```

#### 단계 2 — chart 별 baseline 정규화

차트 안의 모든 keysound f₀ 의 p95 값을 baseline 으로 잡고, 각 노트의 pitch 를 그 baseline 의 비율로 표현. 이는 chart 마다 음역대가 달라서 (synth bass vs piano 등) 절대 Hz 로 비교 못 함 때문.

#### 단계 3 — sequence score

stair lane chain (§4.6 의 정의) 안의 인접 노트 두 개에 대해, **lane 차이** 와 **pitch 차이** 의 부호가 일치하는지 검사. 일치율을 chain 별로 집계, 가중 평균을 chart-level audio sequence coverage 로.

수식 개념도:

$$\text{audio_seq_score}(c) = \frac{\sum_{(e_i, e_{i+1}) \in c} \mathbb{1}\left[ \text{sign}(\text{lane}(e_{i+1}) - \text{lane}(e_i)) = \text{sign}(f_0(e_{i+1}) - f_0(e_i)) \right]}{|c| - 1}$$

여기서 $c$ 는 chain, $f_0$ 는 keysound pitch.

#### 단계 4 — coverage gate

chart 의 keysound 중 pyin 이 신뢰성 있게 pitch 를 잡은 비율이 임계 (β 후보 = 40%) 이상이어야 audio score 채택. 그 미만이면 (드럼, FX, noisy keysound 비중 높음) lane-only 정의로 fallback.

### 8.4 L2 — Empirical audit (가설 부분 실패)

#### 사례 1 — 熊蜂의 飛行 (Flight of the Bumblebee), 마디 4

전형적인 클래식 계단 진행. lane 으로는 1→2→3→4→5→6→7 로 깔끔하게 흐름. **audio pitch 는 sequential 하지 않음** — 작가가 음원으로 chromatic 진행을 못 살리거나, lane 진행과 음악적 진행을 분리.

#### 사례 2 — Terminal Strike, 마디 50-57

lane 으로는 zig-zag 가 아닌 clean stair, 명백한 perceptual stair 차트. audio pitch 가 lane 진행과 *역방향* 인 구간이 발견됨.

#### 결론

> "진짜 stair 는 audio-sequential 하지 않다."

사용자의 case-by-case audit 으로 가설이 부분적으로 깨졌다. lane 진행이 stair 차트의 충분조건이지 (audio 가 sequential 한지는 별개), audio 가 sequential 한가가 stair 의 필요조건은 아니다.

### 8.5 L2 — 채택 결정과 대체

Phase 1V audio FFT 는 **거부**. lane-only stair detection 으로 회귀. 대신 다음 두 보완책을 채택:

- **K=3 chord-size filter** (Phase 1U) — 동시 lane 수 ≥3 인 chain segment 는 stair 가 아닌 chord 로 (§4.6).
- **p99 burden normalization** (Phase 1U) — chain note 수 / chart length 의 raw burden 을 p99 로 나눠 stair raw 값 0-1 범위로.

이 두 조치만으로 stair axis 의 user perception 일치도가 *당시엔* 충분히 개선되었다 (case audit: Empress / Complex vs Icyxis / 覚醒 분리 성공). 둘 다 이후 v3 검출기 (§4.6) 로 superseded 됐다: K=3 재분류는 WALL rule 이 됐고, p99-burden + purity factor 는 pace-weighted shape_v2 ratio 로 대체되며 radar 값에서 빠졌다. 이 절의 교훈 — audio pitch 가 아니라 lane 진행이 stair character 를 규정한다 — 은 재설계 후에도 그대로 유지된다.

### 8.6 L2 — 인프라 보존

audio FFT 코드는 거부 후에도 **삭제하지 않고 보존**. 향후 재시도 가능성:

- 다른 axis (예: ln transition, soft) 에 audio 신호가 의미 있을 수 있음
- librosa.pyin 외 다른 pitch detection 방법 (CREPE 등) 으로 audit 사례 재검증
- audio-based feature 가 chart character 의 다른 측면 (예: melodic vs percussive) 을 잡을 가능성

본 거부는 *audio FFT 자체* 가 아니라 *audio FFT 를 stair 정의에 필수로 만드는 가설* 의 거부.

### 8.7 Lesson (L1/L2 모두) — conceptual sound 가 empirical adoption 을 보장하지 않음

stair = scale progression 은 perceptual 으로 매우 그럴듯하다. 하지만 BMS 작가의 작곡-편곡 관행이 그 perceptual model 을 따라가지 않는다는 것이 audit 으로 드러났다. 메트릭의 가설은 **차트 분포** 에서 empirical 하게 검증되어야 한다.

이 case 는 perceptual vs empirical 의 trade matrix 를 명시적으로 보여줄 것 — 즉, framework metric 과 user perception 사이에 불일치가 나타날 때 (a) 메트릭이 잘못된 것일 가능성, (b) user perception 이 잘못된 것일 가능성, (c) 둘 다의 가능성 — 을 비대칭적으로 판단하지 말 것.

---

## 9. 한계와 향후 (Limitations & future)

### 9.1 framework coverage

22개로 식별된 difficulty 차원 중 13개를 측정한다 (≈ 60%). 측정되지 않는 9개:

- **memorization** — 처음 보고 칠 수 있는가 vs 외워야 칠 수 있는가
- **endurance** — 차트 길이와 sustained 부담의 누적
- **lane-pattern asymmetry** — 같은 NPS 라도 lane 분포 (예: 1234 vs 2345) 가 다르면 부담 다름
- **audio cue** — keysound 가 chart 진행과 일치하는가
- **sight-reading** — 시각적 layout 의 readability
- **gimmick fatigue** — soflan / stop 의 누적 인지 부담
- **chord pattern entropy** — 같은 chord rate 라도 패턴 random 도가 다름
- **pattern repetition** — 동일 패턴 반복 빈도
- **scratch chain difficulty** — scratch run 의 패턴 (zigzag vs straight)

향후 작업 후보:
- **M1** chord sequence entropy
- **M2** chart duration metric
- **M5** anchor jack detection
- **M6** pattern repetition
- audio FFT 의 다른 활용 (§8 참조)

### 9.2 측정 한계

- Class D measure-scale trick 의 partial coverage
- DP 가족 통계의 작은 sample size (n=1,852)
- IRT 와의 unification 미수행 (의도적 decoupling)

### 9.3 Felt-time / BPM-aware 한계 (audit 2026-06-13)

pace · density 기반 metric 의 기반인 real-time 축에는 알려진 한계 4개가 있고, 이번 세션에 둘이 처리됐다:

- **L1 — STOP dead-time (부분 처리).** seconds table 이 이제 STOP 정지 시간을 주입하지만, 아직 stair 경로와 shape_v2 만 이를 소비한다 (§5.6); stream / LN / scratch / distraction / density / peak metric 은 여전히 STOP 없이 table 을 만들며 metric 별로 이주한다.
- **L2 — time-base reconstruction (보정 아닌 표면화).** Class A (h1_heuristic) 차트는 복원 가능한 tempo 가 없다; real-time attribute 는 선언된 연주 가능성 규약 위에서 계산되어 측정이 아닌 해석으로 `time_base_reconstructed` 플래그된다 (§5.3). tick-domain shape 는 영향 없음; 이 차트들의 absolute-scale 비교는 신뢰 불가.
- **L3 — pace ceiling (의도됨).** BPM ~900 초과에서 12-tick step 이 16.67ms chord window 안에 들어가 wall 로 병합되므로, stair 검출기는 사실상 ~60 steps/sec ceiling 을 가진다. 올바른 동작으로 판단 (그보다 빠르면 이산 step 이 아닌 glissando), 수정 대신 문서화.
- **L4 — mid-chain BPM change (미해결).** chain pace 균일성을 tick 으로 검사하므로, 한 figure 내부의 soflan break 가 평균 pace 의 단일 chain 으로 남는다. per-step real-time-interval split 이 fix 이며, L1 이 stair 경로에 들어왔으므로 이제 unblock 됨.

---

## 부록 (Appendix)

### A. 전체 metric 공식 reference

본문 §4 / §5 의 공식을 한 표로 정리. 모든 ratio metric 의 분모는 차트의 playable event 수 $|E|$.

| 축 | candidate 조건 | ratio 정의 | 비고 |
|---|---|---|---|
| **chord** | $\|\{ e' : \|t(e') - t(e)\| < 16.67 \text{ms} \}\| \geq 3$ | $r_\text{chord} = \sum_e \text{cand}(e) / \|E\|$ | 16.67ms ≈ 1/60 sec. ≥ 3-lane 동시 (§4.1) |
| **stream** | $\text{nps}_W(e) \geq 8.0 \wedge e \notin \text{SCR}$, $\text{nps}_W = N_W / (2W)$, $W = 45/b$ sec | $r_\text{stream} = \sum_e \text{cand}(e) / \|E\|$ | ±0.75 beat window, single=1.0 / chord=0.6 / scratch=0 가중 (§4.2) |
| **scratch** | $\text{lane}(e) \in \text{SCR}$ | $r_\text{scratch} = \|\{e : \text{lane}(e) \in \text{SCR}\}\| / \|E\|$ | turntable lane 비율 (§4.3) |
| **soft** | $\text{bpm}_s \neq \text{bpm}_\text{base}$ (felt frame) | $x_\text{soft} = \mathrm{clip}_{01}\!\big(\tfrac{\log_2(1+B/T)}{\log_2(1+\text{ref})}\big)$, $B = \sum_s \log_2(\text{bpm}_s/\text{bpm}_\text{base})^2 n_s \tfrac{\rho_s}{\rho_\text{base}}$ | felt-frame 누적 log² burden, p97 ref 에서 log 정규화 (§4.4) |
| **ln** | $\text{type}(e) = \text{LN}$ | $r_\text{ln} = \|\{e : \text{type}(e) = \text{LN}\}\| / \|E\|$ | start + end 각각 카운트 (§4.5) |
| **stair** | length ≥ 3 chain, lane Δ = ±1, lookback ≤ 24 tick, WALL rule (>3 lane), pace floor 없음 (v3) | $r_\text{stair} = \sum_{e} w(e) / \|E\|$, $w = \mathrm{clip}_{01}((v-5)/5)$, $v$ = real-time steps/sec | pace-weighted participation (§4.6) |
| **distraction** | stream interval $S$ 안의 scratch event | $r_\text{distract} = \text{scratch}(S)/\|S\| \times \text{intensity}$ | v3_score, intensity = scratch run length 반영 (§4.7) |

**radar-out (drill-down 전용)**

| metric | 정의 | 비고 |
|---|---|---|
| **peak** | peak_jab + peak_uppercut (≤ 2초 window 의 L2 burden) | burst severity (§4.8) |
| **jack** | same-lane gap ≤ 12 tick pair count / sec | jack_present tag 의 base (§4.8) |

**임계 분류 함수**

$$
\text{tier}(v, p_{33}, p_{67}) = \begin{cases}
\text{red} & v \geq \max(p_{67}, 0.08) \\
\text{yellow} & v \geq \max(p_{33}, 0.03) \\
\text{green} & v > 0 \\
\text{null} & v = 0
\end{cases}
$$

**Z4 (felt-time bucket NPS)**

$$
s_e = \text{tick_to_sec}(t(e), \text{sec_table}), \quad b_e = \lfloor s_e - s_0 \rfloor, \quad s_0 = \min_e s_e
$$

$$
\text{NPS}(b) = \|\{e : b_e = b\}\|
$$

**felt-BPM 보정 트리거** (Stage 1 — Class B truth recovery)

다음 세 조건 모두 만족 시 발화:
1. $\text{mode_bpm} \in [30, 1500]$
2. $\text{effective_bpm} / \text{mode_bpm} \geq 5$
3. $\text{effective_bpm} \geq 1000$

발화 시 gimmick segment 만 $\text{truth_bpm} = \text{mode_bpm}$ 으로 pin.

**Stage 2 — Class A H1 fallback**

다음 두 트리거 모두 발화 시:
1. $\text{effective_bpm} > 500$
2. $\text{declared peak NPS} > 200$

발화 시 모든 BPM 을 $\text{scale} = 50 / \text{declared peak NPS}$ 로 균일 축소. $\text{felt_bpm} = \max(\text{declared_bpm} \times \text{scale}, 30)$.

### B. Threshold 테이블

```
                SP                       DP
chord:          (0.430, 0.638)           (0.395, 0.563)
stream:         (0.736, 0.851)           (0.813, 0.899)
scratch:        (0.020, 0.041)           (0.008, 0.022)
soft:           (0.013, 0.153)           (0.009, 0.152)
ln:             (0.004, 0.013)           (0.009, 0.020)
stair:          (0.120, 0.237)           (0.054, 0.120)
distraction:    (0.032, 0.084)           (0.086, 0.290)
peak:           (0.441, 0.608)           (0.525, 0.672)
jack:           (0.223, 0.369)           (0.265, 0.436)
absolute floors: yellow ≥ 0.03, red ≥ 0.08
```

### C. Tag 정의 (18종)

각 tag 의 fire 조건과 SP 코퍼스 (n = 6,703) 의 발화 차트 수. 0 발화 tag (`advanced_ln`, `peak_outlier`) 는 정의는 존재하지만 현재 코퍼스에서 트리거되지 않음 (사용자 입장에서 *드물게 의미 있는 패턴* 의 예약된 슬롯).

| Tag | 카테고리 | 발화 조건 | SP fire | % |
|---|---|---|---:|---:|
| `burst_focused` | peak | peak burden 이 좁은 구간에 집중 (peak_concentration high) | 2,835 | 42.3% |
| `dense_chart` | density | 차트 평균 NPS 가 임계 초과 | 2,119 | 31.6% |
| `big_chord_burst` | chord | peak chord size 가 큼 (max 시점의 동시 lane 수 많음) | 1,697 | 25.3% |
| `sustained` | peak | peak burden 이 차트 전체에 분산 (peak_concentration low) | 1,335 | 19.9% |
| `jack_present` | jack | same-lane rapid pair 수가 floor 초과 (keysound-agnostic) | 1,226 | 18.3% |
| `scratch_burst` | scratch | 1초 윈도우 안의 scratch 빈도 임계 초과 | 845 | 12.6% |
| `last_killing` | structural | 차트 후반 NPS spike (escalating finale 또는 back-spike + calm coda) | 543 | 8.1% |
| `scratch_chord` | cross-mech | (SP) scratch 와 chord-tier 노트가 동시 (cross-domain pressure) | 425 | 6.3% |
| `impossible_scratch` | cross-mech | (DP) same-side $S$ + far 키 (1P KEY4-7 / 2P KEY1-4) chord-tier exact 동시 (못 칠 것처럼 보이나 판정 폭 내 한 손 어긋내기로 처리) | 130 | 7.0% DP |
| `adjacent_scratch` | cross-mech | (DP) same-side $S$ + near 키 (1P KEY1-3 / 2P KEY5-7) chord-tier exact 동시 (불편한 한 손) | 103 | 5.6% DP |
| `bilateral_scratch` | cross-mech | (DP) 한 마디에 양쪽 사이드 모두 ≥3 scratch, 그런 마디 ≥5 | 39 | 2.1% DP |
| `long_scratch` | scratch | sustained Long-Scratch (wheel-hold) 존재 임계 초과 | 385 | 5.7% |
| `flow_break` | jack | running stream 안에 jack 끼어드는 비율 임계 초과 | 348 | 5.2% |
| `extreme_burst` | density | off-base BPM 위의 burst severity 매우 높음 (BPM-scaled) | 160 | 2.4% |
| `double_tab` | jack (keysound) | same `#WAV` id 의 2-chain 반복 존재 (§8.1) | 92 | 1.4% |
| `jack_chart` | jack | pure-jack rate per second 임계 초과 (isolated jack, stream 밖) | 83 | 1.2% |
| `complex_long_scratch` | scratch | Long Scratch 가 다른 scratch context 안 embedded (isolated 아님) | 61 | 0.9% |
| `triple_tab` | jack (keysound) | same `#WAV` id 의 3+ chain 반복 존재 (§8.1) | 57 | 0.9% |
| `visual_gimmick` | gimmick | high soflan max-intensity ≥ 5.0 AND off_base_note_count ≥ 4 | 54 | 0.8% |
| `advanced_ln` | ln | LN technical composite (short-hold transition, stacked LN chord, irregular scatter) | 0 | 0.0% |
| `peak_outlier` | peak | peak axis red AND sustained — high peak 가 cluster 안 됨 | 0 | 0.0% |

### D. 코퍼스 통계

**총 차트**: 8,555 (SP 6,703 / DP 1,852)

**가족 분포** (family-labeled charts only — 가족 라벨이 없는 차트도 분석에는 포함되지만 이 분포에선 제외)

SP (n = 5,738 with family / 965 no family / total 6,703):

| family | n | % of SP | class (§2.5.2) |
|---|---:|---:|---|
| `sl` | 2,131 | 31.8% | linear-rank |
| `st` | 2,033 | 30.3% | body-linear-top-break |
| `★` | 952 | 14.2% | linear-rank |
| `★★` | 347 | 5.2% | body-linear-top-break |
| `so` | 201 | 3.0% | mean-tracking |
| `sn` | 74 | 1.1% | mean-tracking |

DP (n = 1,735 with family / 117 no family / total 1,852):

| family | n | % of DP | class |
|---|---:|---:|---|
| `DPsl` | 634 | 34.2% | linear-rank |
| `★` | 623 | 33.6% | linear-rank |
| `★★` | 343 | 18.5% | body-linear-top-break |
| `DPst` | 135 | 7.3% | body-linear-top-break |

가족 라벨 없는 차트 (no-family) 는 큐레이션 분류에서 빠진 차트 (개인 변형, 미발표, 라벨 미정 등) 로 framework 분석 자체에는 포함되지만 family-relative 비교에는 제외된다.

**IRT 데이터**: PL3 의 SP IRT result (6,103 차트) 중 `Low-sample low-confidence flag = False` 인 차트만 사용 — joined 결과 5,371 차트가 §2.5 분석 대상.

**Mode 분리**: 모든 metric calibration / threshold 계산은 SP / DP 분리. cross-mode 비교는 의도되지 않음 (SP 8-key 와 DP 16-key 의 lane 메커니즘이 다르기 때문).
