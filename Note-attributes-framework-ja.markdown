---
layout: scale_analyzer
title: "Framework paper (日本語)"
permalink: /Note-attributes/Framework-paper-ja
parent: "Note attributes"
nav_order: 2
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

*Live tool: [Chart comparison](/Note-attributes)*  ・ *English: [Framework paper](/Note-attributes/Framework-paper)*

# BMS チャートキャラクターフレームワーク — 7軸レーダー、タグ、そして時間軸正規化

**Subtitle**: BMS チャートが「どんな種類で難しいのか」を1次元の難易度スコアではなく、*どういうチャートか* を可視化する分析フレームワークの設計と検証。

**Version**: Phase 1Z + soft v2 / stair v3 (2026-06-14)

> 本ドキュメントは BMS コミュニティを対象とした技術レポートである。チャート分析やリズムゲームの難易度評価に関する基本的な知識を前提とするが、導入する用語や数式はすべてその場で説明する。

---

## Abstract

従来の BMS 難易度ラベル (★, sl, st, insane-BMS, 難易度表) は、チャートの *要求される実力の強度* を1次元のスカラーに圧縮している。しかしチャートが難しい *理由* は実に様々である — あるチャートは同時押しでプレイヤーに圧力をかけ、あるチャートは同レーンの高速連打で、あるチャートは知覚を乱すテンポ操作で圧力をかける。

本フレームワークは、チャートの *難易度 (difficulty)* ではなく *キャラクター (character)* — 「どんな種類で難しいのか」 — に焦点を当てる。主な貢献は以下のとおりである。

1. 7つの独立した軸 (chord / stream / scratch / soft / ln / stair / distraction) にまたがる **parallel-ownership** モデル。1つのイベントが複数の軸に同時に寄与でき、その合計は1に制約されない。
2. BPM トリックチャートの NPS 過大測定問題を打破する **felt-time 1秒バケット** による時間軸正規化。
3. family 相対パーセンタイル (p33 / p67) と絶対下限 (0.03 / 0.08) を組み合わせた **dual-threshold** 方式。raw 値だけでまばらな軸が誤って red 判定されるのを防ぐ。
4. スカラー可視化の不変条件を備えた **3層のカードベース比較 UI** (radar + tags + density bar)。

calibration と検証は 8,555 個の BMS チャート (SP 6,703 / DP 1,852) のコーパスに対して行った。

---

## 1. Introduction

### 1.1 問題定義

BMS チャートの難易度は伝統的に **単一スコア** または **単一ラベル** で表現されてきた。

- family / scale (sl1–sl12, st0–st10, ★1–★10, ★★1–★★10, …)
- Insane / 難易度表の星評価
- IRT (Item Response Theory) による推定チャート θ

しかしチャートが与える *圧力の種類* は次のように様々である。

| 圧力の種類 | 例 |
|---|---|
| 同時押し (chord) | 3+ キー同時入力比率が高いチャート |
| 持続的な流れ (stream) | 一定 NPS が長く持続するチャート |
| ターンテーブル (scratch) | lane 8 を多用するチャート |
| テンポ変化 (soft / soflan) | BPM 変調が頻繁なチャート |
| ロングノート (LN) | hold が支配的なチャート |
| 音階進行 (stair) | キーが階段状に歩くパターンのチャート |
| 機構横断の妨害 (distraction) | stream に scratch が割り込むチャート |

同一の sl10 cohort の中でも、チャート A は chord-heavy でチャート B は scratch-heavy ということがある。1次元のスカラーはこれを消し去ってしまう。

### 1.2 目的

**character snapshot** — どの種類の圧力がどれだけ強く存在するか — を可視化する。本フレームワークのチャート単位の output は以下から成る。

- **レーダーチャート** — 7軸の強度を hex polygon で表示
- **タグ (boolean flags)** — レーダーが担えない sub-pattern (例: visual_gimmick, last_killing, double_tab)
- **density bar** — チャートの felt-time にわたる秒単位の NPS

### 1.3 貢献 (Contributions)

- **C1** Parallel-ownership 7-axis モデル — 1つのイベントが複数の軸に寄与でき、比率の合計は1にならない
- **C2** felt-time 1秒バケット (Z4) — BPM トリックの NPS インフレを打破 (最悪ケースで 8,000 NPS → 449 NPS)
- **C3** family 相対 + 絶対下限の dual threshold — まばらな軸の false-red を防ぐ
- **C4** 比較 UI におけるスカラー ↔ 可視化の不変条件 — 表の column 値が、ユーザーがカード単位の可視化から検証できる内容と一致する

---

## 2. Background

### 2.1 BMS チャート構造

BMS はテキストベースのチャートフォーマットである。本節では後で使う用語を定義する。

- **Lane (line / channel)** — キー位置。7-key SP は lane 1–7 にスクラッチ (turntable) lane、通常は lane 8 または "S" を加える。DP は14キーに2つのスクラッチを加える。
- **Note** — (lane, time) 位置における入力キュー。
  - **Tap** — 瞬間的なキー押下
  - **Long Note (LN)** — start と end のイベントを持つ hold キー
- **Tick** — 時間単位。`#PLAYLEVEL` とは独立で、`#xxxNN` ライン (小節 N、チャンネル) 内のスロットインデックスとして表現される。
- **Measure (小節)** — 音楽的な小節。デフォルトは `4/4 = 192 ticks`。
- **`#xxxNN02`** — 小節ごとの長さ倍率。例: `#xxx02:0.5` はその小節を半分にする。**measure-scale trick** の中核メカニズム。
- **BPM** — beats per minute。`#BPM xxx` (グローバル) または `#BPMxx` (小節単位の変化)。
- **`#STOP`** — 一時停止小節。通常は短い stutter 用。
- **`#WAV` keysound** — 各 note がトリガーする音源サンプルのスロット id。
- **Chord** — 同じ tick に複数の lane note が存在する状態。

### 2.2 測定の難しさ

素朴な NPS 計算は BMS では次の理由で破綻する。

**Class A — uniform BPM trick**: チャート全体の BPM が非現実的に高い (例: 9,999,999)。時間が圧縮され NPS が数千に膨れ上がる。

**Class B — segment BPM trick**: チャートの一部の区間だけが非現実的な BPM を持つ。その圧縮された区間に多くのノートが詰め込まれる。

**Class D — measure-scale trick**: `#xxxNN02:1000` などで小節を 1,000 倍に引き伸ばし、その中にノートを詰め込む。BPM は正常のままだが *小節単位の NPS* が膨れ上がる。

**`#STOP`**: 頻繁な短い停止が平均 NPS を歪める。

本フレームワークはこれらのメカニズムを認識し、felt-time 補正 (§5) を適用する。

### 2.3 既存の metric

- **NPS (Notes Per Second)** — チャート総ノート数 ÷ チャート長。平均値。Class A で膨れ上がる。
- **IRT-based θ** — プレイヤーの clear/fail 統計からのベイズ推定。*clearable かどうか* を推定するもので、character ではない。
- **family / scale** — キュレーションされたラベルの束。2つの別々の family がある: sl < st (satellite scale) と ★ < ★★ (overjoy scale)。おおよそ sl ≈ ★、st ≈ ★★ であり、★20 以降は ★★1 の開始と重なる。

### 2.4 フレームワークの立場: difficulty ≠ character

本フレームワークは IRT clear-difficulty と意図的に **decouple** されている。同じ family cohort 内では、sum-of-axes と IRT EASY-clear difficulty の Spearman 相関は ~ 0.105 と非常に弱い。具体的には:

- **Axes** = 「このチャートはどんな種類の圧力を持っているか」 (attribute strength)
- **IRT** = 「このチャートはクリア可能か」 (clear difficulty)

両者は異なる問いに答える。axes が IRT と整合するよう強制することはしない。

### 2.5 family × tier の単調性 (経験的な IRT vs NPS)

§2.4 の decoupling の主張 (cohort 内での弱い相関) だけを見ると、IRT と NPS が無関係であるかのように聞こえるかもしれない。**そうではない** — 両 metric は **family × tier 平均** のレベルでは強く一緒に動く。無相関なのは *同一 tier 内での chart-by-chart のランキング* のみである。

本節は、フレームワークの calibration (family 相対パーセンタイル) と設計哲学 (axes ≠ difficulty だが両者とも family/tier とともに増大する) の経験的根拠を提供する。

#### 2.5.1 測定方法

コーパス 8,555 チャートのうち、**low-confidence ではない** IRT 統計を持つ SP チャート 5,371 個を分析する。各チャートの family ラベル (例: `sl12`) を base (`sl`) と tier (`12`) に分解する。family ごとに、IRT EASY-clear difficulty と NPS_mean / NPS_max の tier-by-tier 平均を計算する。

理想的なパターン: tier が上がると両 metric が monotonically に増加する。

#### 2.5.2 3つの family class — 異なる単調性の期待値

BMS コミュニティのキュレーション慣行により、各 family は *tier 単調性がどれだけ強く成立するか* について異なる期待を持つ。これを3つの class として識別する。

| Class | 意味 | 該当 family |
|---|---|---|
| **linear-rank** | tier-mean 単調 + tier 内ランキングも安定 | SP: `sl`, `★` / DP: `DPsl`, `★` |
| **body-linear-top-break** | body (下位 ~3/4) は単調、top tier は specialist の散らばりを許容 | SP: `st`, `★★` / DP: `DPst`, `★★` |
| **mean-tracking** | tier 平均のみ単調、tier 内ランキングは noisy と仮定 | SP: `so`, `sn` |

#### 2.5.3 経験データ

**[Figure 1]** SP family × tier 単調性。左 → 右: tier 別の mean IRT EASY-clear · NPS_mean · NPS_max。色は family を、線スタイルは class を表す (linear-rank solid bold / body-linear solid / mean-tracking dotted)。

![SP family × tier monotonicity](/Resource/Framework/figures/family_tier_monotonicity_SP.png)

→ インタラクティブ HTML: [`figures/family_tier_monotonicity_SP.html`](/Resource/Framework/figures/family_tier_monotonicity_SP.html) (hover で tier 別の n と値を表示)

**[Figure 2]** DP family × tier 単調性。同じレイアウト。DP コーパスはより小さい (n = 1,852) ため tier 範囲は短いが、同じ単調パターンが成立する。

![DP family × tier monotonicity](/Resource/Framework/figures/family_tier_monotonicity_DP.png)

→ HTML: [`figures/family_tier_monotonicity_DP.html`](/Resource/Framework/figures/family_tier_monotonicity_DP.html)

再生成: `python paper/plot_family_tier.py --mode both --png`

**linear-rank — `sl`** (tier 0–12, n = 1,965)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 238 | −2.64 | 11.88 | 21.08 |
| 3 | 167 | −1.68 | 15.21 | 27.03 |
| 6 | 132 | −0.96 | 17.47 | 30.94 |
| 9 | 109 | −0.42 | 19.37 | 33.62 |
| 12 | 160 | +0.28 | 21.05 | 36.31 |

IRT と NPS の両方が strict monotonic。tier-by-tier の差分も一貫している。

**linear-rank — `★`** (tier 1–24, n = 952)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 1 | 47 | −2.48 | 13.15 | 25.55 |
| 6 | 47 | −1.38 | 15.86 | 28.30 |
| 12 | 57 | −0.43 | 18.25 | 33.26 |
| 18 | 28 | +0.39 | 20.26 | 38.61 |
| 24 | 7 | +1.70 | 25.13 | 47.71 |

24 段階すべてにわたって monotonic。最も長い dynamic range。

**body-linear-top-break — `st`** (tier 0–11, n = 1,921)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 202 | +0.53 | 21.53 | 37.66 |
| 3 | 283 | +1.36 | 24.35 | 40.88 |
| 6 | 136 | +2.14 | 26.71 | 45.24 |
| 9 | 67 | +2.72 | 28.34 | 49.75 |
| **11** | **3** | **+3.38** | **31.28** | **52.67** |

body (tier 0–9) はクリーン。top (tier 10, 11) は n = 20 と 3 に崩れ落ちる — 安定した単調性チェックには不十分。キュレーション慣行は top tier を specialist の外れ値のために確保しているので、ここでの metric 評価は「body 単調、top 散らばり許容」基準を用いる。

**body-linear-top-break — `★★`** (tier 0–6, n = 264)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 1 | 45 | +1.19 | 21.03 | 40.78 |
| 3 | 61 | +1.75 | 22.61 | 43.56 |
| 5 | 29 | +2.53 | 25.88 | 49.10 |
| 6 | 5 | +2.83 | 28.32 | 51.40 |

`st` と同じパターン — body は単調、top の n が落ちる。

**mean-tracking — `so`** (tier 0–12, n = 128)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 16 | −2.32 | 10.50 | 20.38 |
| 2 | 15 | −1.48 | 13.48 | 27.27 |
| 4 | 10 | −0.74 | 13.66 | 28.80 |
| 5 | 6 | −0.97 | 15.71 | 29.50 |
| 8 | 16 | +0.25 | 17.06 | 31.19 |
| 11 | 5 | +0.28 | 17.34 | 37.20 |
| 12 | 3 | +1.02 | 19.46 | 35.67 |

全体的なトレンドは上昇だが、tier 4 → 5 で IRT が一時的に dip し (−0.74 → −0.97)、NPS-mean は tier 3 (14.25) が tier 4 (13.66) を上回る。tier 内ノイズが大きい。**mean-tracking** の期待値は「全体トレンドに従う; 弱い tier 内ランキングは許容」と述べる。

**mean-tracking — `sn`** (tier 0–9, n = 41)

| tier | n | IRT EASY | NPS-mean | NPS-max |
|---:|---:|---:|---:|---:|
| 0 | 9 | +1.14 | 19.20 | 38.44 |
| 2 | 6 | +1.57 | 20.59 | 40.33 |
| 4 | 6 | +2.00 | 23.71 | 44.67 |
| 5 | 4 | +2.12 | 26.25 | 45.25 |
| 6 | 2 | +2.21 | 10.52 | 23.50 |
| 9 | 1 | +3.39 | 25.91 | 55.00 |

小さいサンプル (tier 6 n = 2) が明らかな NPS 外れ値を生む。IRT は単調を保つ。典型的な mean-tracking パターン。

#### 2.5.4 含意

このデータは本フレームワーク設計の2つの柱を裏付ける。

**(a) IRT と NPS は family-tier レベルで一緒に動く。** コーパス全体として扱うと、両者は強い Spearman 相関 (> 0.85) を持つ。「axes ≠ difficulty」が指すのは **tier 内 cohort** での弱い相関であり、tier をまたいだ弱い相関ではない。

この区別は重要である: キュレーションされたラベル (family/tier) そのものが既に強い difficulty 情報を担っている。本フレームワークはそのラベルを置き換えようとするものではない — *チャートが自身の family/tier 内でどんな種類の character を持つか* を示そうとするものである。

**(b) family 相対 calibration の正当化。** フレームワークの軸 threshold (p33/p67) は family 層別なしに mode 別 (SP/DP) で calibrate される。family 層別でない cohort からパーセンタイルを引くことは、family 分布が tier 単調であると仮定している。上記のデータがその仮定を確認する。

具体的に、同じ raw 軸値 0.5 が sl0 (NPS-mean 12) と sl12 (NPS-mean 21) の両方に現れたとき、それを同じ視覚強度で表示するのは意図的である — 「chord が *このチャート内で* どれだけ強いか」は、それ自体が単調に増加する family レベルの NPS スケールの上に乗った比率である。

**(c) 評価における期待される単調性の一致。** 任意の軸 metric の family-tier 挙動を評価する際は、正しい単調性が family の class (linear-rank / body-linear-top-break / mean-tracking) に一致していなければならない。linear-rank family における tier 内ランキング Spearman < 0.5 は metric の欠陥だが、mean-tracking family における同じ結果は正常である。

#### 2.5.5 軸の種類に応じた検証

第二の区別は、軸が *どの* gold standard に対して検証されるかを規定する。これは軸が density に結合しているか、それと直交しているかで決まる。

- **density 結合軸** (chord / stream / peak) は difficulty と共変動するので、PL2 tier に対する **family cohort-mean trend** (§2.5.3 の単調性、family class に一致させて) で検証する。
- **直交 character 軸** (scratch / ln / stair) は tier と共変動しない — チャートは *どの* tier でも scratch-heavy、LN-heavy、stair-heavy になりうる。これらには tier 単調性は **間違った** 基準である。これらはキュレーターリストに対する **membership discrimination** (リストメンバーをコーパスの残りから分離する軸の rank AUC: x_scratch vs SC.json 0.9996, x_ln vs LN.json 0.9993) と、**known-verdict canary チャート** (§4.6.3) で検証する。

これが x_scratch vs SC-tier Spearman が +0.007 にすぎないのに軸が正しい理由である: scratch 難易度は tier に対して単調ではないので、ほぼゼロの tier 相関は欠陥ではなく *モデルと整合する*。character 軸に tier 単調性テストを適用すると、機能している metric を棄却してしまう。

---

## 3. Architecture

### 3.1 3層の character snapshot

チャート単位の output は3つの層から成る。

```
┌─────────────────────────────────────────┐
│  Radar (7 independent axes)             │
│  ─ chord, stream, scratch,              │
│    soft, ln, stair, distraction         │
├─────────────────────────────────────────┤
│  Tags (boolean flags, ~18)              │
│  ─ sub-patterns axes can't carry        │
│    (visual_gimmick, last_killing, ...)  │
├─────────────────────────────────────────┤
│  Density bar (per-second NPS timeline)  │
│  ─ time-axis intensity over chart       │
└─────────────────────────────────────────┘
```

### 3.2 Radar — parallel ownership

7つの軸は **独立した detector** である。1つのイベントが複数の軸の候補になりうる (例: scratch lane 上の chord-tier イベントは chord と scratch の両方に +1)。したがって:

$$\sum_{a \in \text{axes}} r_a \neq 1$$

ここで $r_a$ = 軸 $a$ の候補イベント数 / 総イベント数。

**なぜ?** 以前の partition モデル (各イベントがちょうど1つの軸に割り当てられ、$\sum r_a = 1$) は、優先度の低い任意の軸を構造的に圧縮していた。例えば stream が最も優先度の低い detector だったとき、stream-heavy なチャートでも常に小さな stream レーダーしか表示されなかった (Aleph-0 [INSANE] がこれに苦しんだ)。独立検出はその圧縮を解放する。

### 3.3 Tags

タグは **レーダーが担えない、あるいは担うべきでない** boolean sub-pattern を露出させる。例:

- `visual_gimmick` — soflan max intensity ≥ 5.0 かつ off_base_note_count ≥ 4。BPM トリックチャートを示す
- `last_killing` — チャート後半の NPS スパイク
- `double_tab` / `triple_tab` — keysound-id がマッチした chain (jack のサブクラス)
- `jack_present` — 同レーンの rapid pair count が下限を超える
- `bpm_ramp` — 漸進的な accelerando (単調かつステップが有界な BPM 上昇が、相当な割合のノートにわたる); §5.6 参照
- `randomized` — チャート全体の per-play #RANDOM (≥ 10 個の `#RANDOM N>1` ブロック); レーダー/density は per-play 可変チャートの md5 固定された1つの branch を反映する; §5.7 参照

タグは **軸横断の組み合わせは表面化しない** (それはレーダーが既に示している)。タグのスコープは sub-metric と composite のみである。

### 3.4 Density bar

felt-time にわたる秒単位の NPS を示す jet-colormap のストリップ。色は絶対スケール (cap = 60 NPS ≈ コーパス p99) を、高さはチャート単位で正規化 (chart_max) する。したがって:

- **Color** = チャート間で比較可能 (絶対 NPS レベル)
- **Height** = チャート内部のプロファイル (時間軸の形状)

hover すると `sec N · V NPS` のツールチップが即座に表示される。

### 3.5 比較表の metric — NPS, Pos/s, そして compositeness

比較ツールの表はカード (radar + density bar) の下に位置し、チャート単位の raw スカラーを並べて提示する。Column:

| Column | 意味 | 単位 |
|---|---|---|
| **BPM** | ヘッダー BPM、または felt-BPM 補正された effective BPM | beats/min |
| **NPS min / mean / max** | 整列された 1秒 felt-time バケット内の **raw ノート数** (§5.5 Z4) | events / sec |
| **Pos/s** | 秒あたりの **distinct なタイミング位置** (chord = 1 position) | positions / sec |
| **chord / stream / scratch / soft / ln / stair / distraction** | 7軸の shape_v2 比率 (§4) | 0–1 |
| **Peak** | x_peak (peak_jab + peak_uppercut の composite) | 0–1 |

#### NPS = Pos/s × avg_chord_size

`NPS` は composite な測定値である — 1秒内の **レーン押下の raw count**。分解すると:

$$\text{NPS} = \text{Pos/s} \times \overline{\text{chord_size}}$$

この略式は、ほぼすべての position が chord であること (`chord_rate ≈ 1`) を仮定している。一部の position が単ノートである混在チャートの正確な形は:

$$\text{NPS} = \text{Pos/s} \times \left[ r_{\text{chord}} \cdot \overline{\text{chord_size}} + (1 - r_{\text{chord}}) \right]$$

ここで `r_chord` (`chord_rate`) は position のうち chord イベントの割合である。括弧内の係数は position あたりの平均ノート数である。略式と正確な形は `chord_rate > ~0.85` で一致する; stream-heavy なチャートには完全な式が必要 (略式が 45 % 過大評価する κανων の実例については §7.4a 参照)。

同じ NPS が非常に異なるメカニズムから生じうる:

> **[2026-06-06 revision]** 下記の Skydive の数値は、BMS §11 `#RANDOM/#IF`
> ブロックを無視していた `BMS.Tools/scripts/bms_parser.py` の bug
> (すべての代替 branch がまとめて flatten されていた) に基づいていた。
> 取り消し線の行はその膨らんだデータを反映している; 修正された行が続く。
> 完全な meta-discussion については §7.4 を参照。

| Pattern | Pos/s | avg chord | NPS | Burden type |
|---|---:|---:|---:|---|
| ~~Chord wall (e.g. Skydive st4, 120 BPM, 7-key chords on every 16th)~~ | ~~7~~ | ~~6.7~~ | ~~47~~ | ~~endurance (same pattern repeating)~~ |
| Chord wall (Skydive st4, **修正後**: 120 BPM, 混在 4-chord patterns) | 7 | 4.3 | 29 | endurance (same pattern repeating) |
| Varied chord-stream (e.g. FD [FOUR DIMENSIONS], 222 BPM, 3-4 chords with fast positional change) | 12 | 3.3 | 40 | pattern + speed (chasing positional shift) |

~~NPS だけを見ると両者は似ている (~50 NPS) — Skydive のほうがわずかに高いほどである。しかし基礎となるメカニズムは完全に異なり、体感難易度も異なる (Skydive st4 vs FD st8/★★5)。~~

**修正後 (bms_parser 修正後)**: 偽の `#RANDOM` branch を除去すると、Skydive の NPS は FD より下に落ちる (29 vs 40)。当初書かれていた例 — 「同じ NPS、逆の tier」 — は parser-bug の産物だった。基礎となる論点は依然として成立する: 任意の NPS において、メカニズム (chord-wall の endurance vs positional-shift の speed) が支配的な難易度ドライバーであり、Pos/s 分解がそれを表面化させる。

**Pos/s column の役割**: ユーザーは Pos/s を NPS と並べて読み、*「このチャートはゆっくり演奏される大きな chord (低 Pos/s + 高 NPS) なのか、小さな chord での速い positional shift (高 Pos/s + 中程度 NPS) なのか?」* を直接判断する。NPS だけでは失われるメカニズム情報が分解され、表面化される。

レーダーの `chord` 軸は同じ情報を別の形で露出する (~~Skydive chord 0.99~~ 修正後 ~0.985 — どちらにせよ飽和、vs FD 0.73) が、*NPS そのものの算術的分解* が欲しければ、Pos/s が最も直接的な読み取りである。

#### 限界 — チャート内一様性の仮定

`Pos/s` と `avg chord` の両方がチャート全体の平均である。チャートの前半と後半のメカニズム差 (例: chord wall で始まり、単一 stream で終わる) は各々1つの値に潰れる。density bar の時間軸可視化が、分布情報でこれを補完する。

---

## 4. 軸ごとの metric 設計

各サブセクションは次の構造に従う: 定義 / 数式 / threshold / 検証。

### 4.1 chord — 同時レーン (3+)

#### 4.1.1 レーダーの raw 値 (shape_v2 比率)

イベントは、それを中心とした 16.67 ms (≈ 1/60 秒、60 fps の1フレーム) のウィンドウ内に3つ以上の lane note が共存するとき chord candidate となる。

$$\text{cand}_{\text{chord}}(e) = \mathbb{1}\left[ |\{ e' : |t(e') - t(e)| < 16.67 \text{ ms} \}| \geq 3 \right]$$

$$r_{\text{chord}} = \frac{\sum_e \text{cand}_{\text{chord}}(e)}{|E|}$$

**なぜ ≥3 ?** 以前の ≥2 定義は dual-tap も chord に数え、コーパス中央値を 0.67 に押し上げた — ほぼすべてのチャートで chord がレーダーを支配した。≥3 に引き上げたことで中央値は 0.54 に下がり、レーダーのバランスが回復した。ユーザーが感じる「指が足りなくなる」圧力は3レーン以上から感じられる; これはその直感に一致する。

2-lane 同時率は drill-down 用の sub-metric (`chord_pair_rate`) として保存される。

**Thresholds**: SP (0.430, 0.638), DP (0.395, 0.563)。

#### 4.1.2 chord_burden_per_sec — shape-variety 補正 (v2.1)

単純な比率を超えて、難易度関連の sub-metric として **秒あたりの chord burden** が計算される。v2.1 (2026-05-01) の形:

$$\text{chord_pace_per_sec} = \frac{\text{chord_positions}}{\text{chart_seconds}}$$

$$\text{eff_avg_size} = 1 + (\text{avg_chord_size} - 1) \times (\alpha + (1 - \alpha) \times \text{variety})$$

$$\text{chord_burden_per_sec} = \text{chord_pace_per_sec} \times \text{eff_avg_size}$$

ここで:
- $\text{variety} \in [0, 1]$ — size class ごとの burden 加重 **chord-shape Shannon entropy**、正規化済み。0 = 単一形状の spam; 1 = すべての chord が異なる lane の組み合わせを使う
- $\alpha = 0.4$ — *削減不能な単一形状の負荷* の割合。variety = 0 でも、chord size は finger-count premium の 40 % を依然として担う

**なぜ shape-variety 補正?** UFS (Unidentified Flying Scotsman) のようなチャートは sl12 で、200 BPM の 8 分 stream の 62 % が full-7-chord である。単純な `pace × size` の式 (v2) は chord 0.945 + stream 0.975 を与えた — 両軸を同時に飽和させた。しかし SP の 7-key full-chord は **形状が1つしかない**: 覚えるパターンはなく、ただの endurance 負荷である。shape-variety 補正は単調な wall の size premium を削る。

α = 0.4 の意味: variety = 0 (spam) → size premium の 40 % のみ; variety = 1 (多様) → 100 %。Codex 推奨の floor。

#### 4.1.3 chord-size 分布 — big_to_mid

追加の sub-metric:

$$\text{big_to_mid} = \frac{|\{e : \text{chord_size}(e) \geq 5\}|}{|\{e : \text{chord_size}(e) \in \{3, 4\}\}|}$$

5-7 chord イベントと 3-4 chord イベントの比率。AEζηκ composite の chord 項で使われる (BM modulated)。直感: bimodal な chord 配置パターン (小さな chord に大きな chord が混ざる) を検出する。

`max_chord_size` も export される — `big_chord_burst` タグ (ピーク chord size が大きいときに発火) のベース。

### 4.2 stream — 持続的な密度

**定義**: イベントは、その ±0.75-beat (合計 1.5-beat) ウィンドウ内の加重 NPS が threshold を超えるとき stream candidate となる。

**数式**:

felt-time $t(e)$ で local BPM $b$ を持つ各イベント $e$ について、ウィンドウ長 (秒) は:

$$W(e) = \frac{0.75 \text{ beat}}{b / 60} = \frac{45}{b} \text{ sec}$$

ウィンドウ内の加重ノート数:

$$N_W(e) = \sum_{e' : |t(e') - t(e)| \leq W(e)} w(e')$$

ここで重み $w(e')$ は:
- single (単独 lane note): 1.0
- chord の一部: 0.6
- scratch lane: 0.0

ウィンドウ NPS:

$$\text{nps}_W(e) = \frac{N_W(e)}{2 W(e)}$$

Stream candidate:

$$\text{cand}_{\text{stream}}(e) = \mathbb{1}\left[ \text{nps}_W(e) \geq 8.0 \,\wedge\, e \notin \text{scratch lane} \right]$$

**なぜこの形?** 以前の明示的な chain detector (連続する単一 lane、n≥6、purity≥70%、CV≤0.20) は、Aleph-0 [INSANE] のような chord 混在 stream チャートで失敗した (14 / 1686 candidates)。時間ウィンドウ加重 NPS に切り替えたことで、コーパスの nonzero coverage は 47.6% → 98.1% に、Aleph の raw stream は 0.0083 → 0.7248 に上昇した。2ラウンドの Codex cross-validation を経て採用。

**Thresholds**:
```
SP: (0.736, 0.851)
DP: (0.813, 0.899)
```

### 4.3 scratch — turntable lane

#### 4.3.1 レーダーの raw 値 (shape_v2 比率)

scratch lane (SP lane 8; DP lane 8 / 16) 上のイベントの割合。考えうる最も単純な定義:

$$r_{\text{scratch}} = \frac{|\{e : \text{lane}(e) \in \text{SCR}\}|}{|E|}$$

**Thresholds**: SP (0.020, 0.041), DP (0.008, 0.022)。

family 依存性が強い — sl / st チャートはほとんど scratch を含まない一方、sn / `★★` SC (scratch character) チャートは scratch で飽和している。絶対下限がまばらな family の false-red を防ぐ。

#### 4.3.2 隠れた sub-metric — 3-feature scratch character

単純な比率だけでは、同じ scratch 割合を持つチャート間の *異なる burden* を区別できない:

- **case A** — チャート全体に広がる一様な scratch メトロノーム
- **case B** — いくつかの区間での scratch バースト (毎秒 3+)
- **case C** — 持続的な scratch chain (例: ≥ 8 秒の連続 wheel work)

3つの sub-feature がこれらのメカニズムを別々に捉える。SC-tier 検証とタグ発火に供給される:

| Feature | 定義 | メカニズム |
|---|---|---|
| `scratch_per_sec` | scratch events / chart length (felt-sec) | 全体密度 (case A) |
| `scratch_burst_max_per_sec` | 1秒ウィンドウ内の最大 scratch count | ピーク強度 (case B) |
| `scratch_max_run_sec` | 最長の連続 scratch chain (秒) (gap ≤ 0.5 sec) | 持続的な run (case C) |

#### 4.3.3 Long-Scratch (LS) sub-metric

scratch lane 上の Long イベント = **wheel-hold**。素早い wheel turn とはメカニズム的に区別される (ディスクを物理的に保持しなければならない)。LS の存在と複雑さは別々に追跡される:

- `long_scratch` タグ — LS count が下限を超えると発火
- `complex_long_scratch` タグ — LS 周辺の [ts − W, te + W] ウィンドウ内で他の scratch が密なとき発火 (孤立ではなく周囲の scratch に埋め込まれた LS)

LS は SC-tier 検証 (SP n=128) で軸 composite に Spearman +0.013 ほどしか加えない — noise floor 以下なので、軸そのものではなく sub-metric / タグとして存在する。

#### 4.3.4 SP scratch 中心ポリシー

SP では、chord と一致する scratch (`scratch_chord` タグ) は **chord ドメイン** に属し、stream を中断する scratch は **distraction ドメイン** (§4.7) に属する。scratch 軸そのものは *scratch がどれだけ存在するか* のみを測る。

DP は2つの scratch (P1/P2) と異なる両手 burden メカニックを持つので、その distraction は別途定式化される (§4.7)。

### 4.4 soft — off-base BPM (テンポ変化)

#### 4.4.1 レーダーの raw 値 — cumulative log² burden

他の6軸 (shape_v2 candidate ratio) と異なり、soft は **定義的な軸** である: キュレーターの soflan リストは存在しないので、軸はその定義 *そのもの* である。レーダー値は off-base BPM 上に乗るノートにわたる秒あたりの累積 burden で、各ノートは (a) テンポ偏差の **octave-scale 大きさ** と (b) その off-base 区間の **相対的な local note density** で加重される:

$$\text{burden}/\text{sec} = \frac{1}{T}\sum_{s\,\in\,\text{off-base}} \log_2\!\left(\frac{\text{bpm}_s}{\text{bpm}_\text{base}}\right)^2 \cdot n_s \cdot \frac{\rho_s}{\rho_\text{base}}$$

ここで $s$ は off-base BPM 区間にわたり、$n_s$ は区間 $s$ 内のノート、$\rho_s$ はその note density、$\rho_\text{base}$ は on-base (home) の note density、$T$ はチャートの再生秒数である。

- **Octave-scale ($\log_2^2$)**: BPM 知覚は乗法的である — 半減は +1 octave、4分の1は +2。単一の squared-log 項が、急な jump (大きな per-note ratio) と緩やかな深い ramp (多数のノートが各々 base から漸進的に遠ざかる) の両方を捉える。
- **相対密度 ($\rho_s/\rho_\text{base}$)**: 密な off-base hold は疎なものより圧力が高い — 「변화는 변하는 순간만이 아니라 머무는 동안 노트가 많아도 압박」。この比率は単位不変なので、BPM トリックチャートが持つ abs_tick スケールのインフレに頑健である。
- **秒あたり累積** ($\div T$、chord/stair burden と同様)、per-note 平均では *ない* — 平均化すると「密な off-base hold = 圧力」というシグナルをちょうど割り消してしまう。

**正規化 (p97 の knee での log)。** raw な秒あたり burden は4桁にわたる — 単独の曲全体 ramp ([シャトルラン], per_sec ≈ 8634) は次のチャートの 60× 上に位置し、大半の nonzero チャートは 0.01–6 である。線形あるいは max-anchored な clip はその body をほぼゼロに押し潰す。そこで:

$$x_\text{soft} = \min\!\left(1,\; \frac{\log_2(1 + \text{burden}/\text{sec})}{\log_2(1 + \text{ref})}\right),\quad \text{ref} = \text{p97 of nonzero per\_sec (SP } 7.15,\ \text{DP } 6.14)$$

p97 の knee は知覚的に最大 soft な ~3 % のテールのみを 1.0 で飽和させ、強いが極端ではない cohort を区別可能なまま保つ。**Thresholds** (nonzero $x_\text{soft}$ の intensity p33/p67): SP (0.013, 0.153), DP (0.009, 0.152)。

#### 4.4.2 base BPM の決定と felt フレーム

**Base BPM。** **note-weighted mode** (最も多くのノートが実際に乗る BPM) として計算され、duration-weighted mode で tie-break される。BPM トリックチャートは、ノートをほとんど持たない長い wall-clock スパンに非現実的な BPM (例: 10^7) を駐車させる; note-weighting はそれらを base として棄却する。duration の tie-break は純粋な ramp (BPM 間でノート数が tie) でのみ作動し、そこでは最も長く保持された値 — ramp の floor — を選ぶので、偏差は floor から上に向かって測られる。ヘッダーの `#BASEBPM` は上書きする。

**Felt フレーム (visual gimmick ≠ soft)。** burden は **felt 補正された** BPM 区間上で計算される — offset-translation と Class A–D の felt-recovery パイプライン (§5) が gimmick BPM を回復された真値に固定した *後* に。これがこの軸の核心である: *Alcubierre Drive [INSANE]* のようなチャートは、実際の 174-BPM チャートの上に 10^7-BPM の visual trick を重ねる。raw な BPM を読めば最大 soft とスコアリングされる (false positive); felt フレーム上ではその gimmick 区間は on-base なので、$x_\text{soft} \approx 0$ となる。本物の漸進的 ramp ([シャトルラン], 60→573 で回復可能な単一真値なし) は偏差を保ち高いまま残る。帰属は abs_tick 軸上で行う — measure-number-trick チャートでノート位置と BPM 区間位置が整列したままになる唯一のフレーム。

#### 4.4.3 `soflan` および `visual_gimmick` タグとの責務分担

soft 軸とテンポ関連タグは異なるものを測る:

| 測定 | 何を見るか |
|---|---|
| **soft 軸** | ノートが担う *felt* なテンポ撹乱 burden (octave 偏差 × density、秒あたり) |
| **`soflan` タグ** | BPM 変化の *count* と *magnitude* (チャートの *構造的 soflan*) |
| **`visual_gimmick` タグ** | 大きな BPM トリック (`max_intensity ≥ 5.0`) + off_base_note_count ≥ 4 — *表示上の jumpscare の存在* |

soft 軸は felt フレーム上で走るので、純粋な visual gimmick は `visual_gimmick` を発火させても soft は低いままにする — 両者は今やきれいに分離されている。本物のテンポ変化チャレンジは soft で高くスコアリングされる; BPM 変化がノートを担わない (visual transition のみ) チャートは `soflan` を発火させるが soft は発火させない。

#### 4.4.4 限界

soft 軸は *方向* (加速 vs 減速) を区別しない。プレイヤーの知覚は speed-up と slow-down の区間で異なるが、metric は両者を同一に扱う。future-work 候補 (§9 参照)。

### 4.5 ln — Long Note

#### 4.5.1 レーダーの raw 値

レーダーの `x_ln` 自体は単純な比率である — 他の軸の *shape_v2 candidate count / total events* と同じ形:

$$r_{\text{ln}} = \frac{|\{e : \text{type}(e) = \text{LN} \,\wedge\, \text{lane}(e) \in \text{KEY}\}|}{|E|}$$

scratch lane 上の LN (= wheel-hold) はメカニズム的に異なるので除外される — wheel-hold は多指ロック burden ではなく scratch 軸 (§4.3) に属する。**Key-lane only** ポリシー (Phase 1Z, 「各軸は自身の lane メカニックを所有する」原則)。

LN の start と end イベントの両方をカウントするので、固定の LN count に対して、長い hold は比率をわずかに膨らませる (`r_ln` は LN の *count* ではなく LN の *event share* である)。

**Thresholds** (SP / DP):
```
SP: (0.004, 0.013)
DP: (0.009, 0.020)
```

まばらな軸 — 絶対下限 (0.03 / 0.08) が大半の分類を駆動する (§4.9)。

#### 4.5.2 隠れた sub-metric — M1 / M2 / M3 / m_concurrent

上記の単純な比率は LN の *play burden* を完全には記述できない。同じ LN share (例: 40%) に対して:

- **case A** — 長い hold が逐次的に配置される。hold して、release して、次を hold — 単純な LN。
- **case B** — 短い hold が stream として連鎖する。形は LN、体感は stream。
- **case C** — 長い hold がアクティブな間に別レーンの Tap が急速に到来する。複数の指がロック + 忙しいフリーハンド。
- **case D** — 「LN の wall」 — 複数の LN が同時に保持される; 指が足りなくなる。

これらのメカニズム差は単一の比率では表現できない。5つの *real-time* (felt-BPM 補正後) sub-feature が並行して計算され、§4.5.3 の advanced-LN 検出に供給される。

$h_e$ を long イベント $e$ の felt-time hold 長とする。Hold floor: 1 フレーム (≈ 16.67 ms)。Short/long 境界: 6 フレーム (≈ 100 ms)。

**M1 — short LN as stream** (hold $\in$ [1 frame, 6 frames))

$$M_1 = \frac{|\{e : 1f \leq h_e < 6f\}|}{|E|}$$

stream として流れる短い hold (case B)。release がすぐ来るほど短い。

**M2 — long LN + tap activity** (long LN がアクティブな間の Tap-on-other-lane burden)

$$M_2 = \frac{1}{T_{\text{long}}} \sum_{e \in \text{Tap}^*} n_{\text{locked}}(t_e) \times s_{\text{surround}}(t_e)$$

ここで:
- $T_{\text{long}}$ = long LN ($h_e \geq 6f$) にわたる総 hold 時間
- $\text{Tap}^*$ = いずれかの long LN がアクティブな間に発生する key Tap
- $n_{\text{locked}}(t)$ = 時刻 $t$ でロックされている long LN の数 (厳密な内部: $t_s < t < t_e$)
- $s_{\text{surround}}(t)$ = $t$ の ±1 秒以内の非 LN Tap の数

直感: 何本の指が拘束されているか ($n_{\text{locked}}$) × フリーハンドがどれだけ忙しいか ($s_{\text{surround}}$)、を累積 (case C)。

**M2 burst** — 任意の 1秒ウィンドウにわたる M2 burden の最大値:

$$M_2^\text{burst} = \max_{\text{1-sec window}} \sum_{e \in \text{Tap}^*} n_{\text{locked}}(t_e) \times s_{\text{surround}}(t_e)$$

M2 は平均 burden; M2 burst はピーク強度。

**M3 — M2 + short-LN-during-long** (case B と C の重なり)

$$M_3 = M_2 + \frac{1}{T_{\text{long}}} \sum_{e \in \text{ShortLN start}^*} n_{\text{locked}}(t_e) \times (s_{\text{surround}}(t_e) + 1)$$

short LN が long-LN-active 期間中にすら始まるという要求の高いパターン。

**m_concurrent — multi-LN wall** (case D)

$$m_{\text{concurrent}} = \frac{T_{\text{long}} - T_{\text{any-active}}}{T_{\text{any-active}}} = \mathbb{E}[n_{\text{active}}(t) - 1 \mid n_{\text{active}}(t) \geq 1]$$

ここで $T_{\text{any-active}}$ は少なくとも1つの long LN がアクティブな時間の *和集合* である。直感: いずれか1つの long LN が保持されている間、平均して何個の *追加の* long LN が同時にロックされているか。逐次のみ = 0、常に2保持 = 1、wall = 大。

case A は M2 ≈ 0、$m_{\text{concurrent}}$ ≈ 0 を残す。case B は $M_1$ を駆動する。case C は $M_2$ を駆動する。case D は $m_{\text{concurrent}}$ を駆動する。4つの case はそれぞれ異なる sub-feature に signature を残す。

#### 4.5.3 `advanced_ln` タグ — 5つの technical-pattern feature の midrank-percentile 平均

5つの RT feature に加えて、`advanced_ln` タグ (レーダーには表面化しない) を発火させるために、5つの *advanced pattern* feature が別途計算される:

| Feature | 定義 | 意図 |
|---|---|---|
| `adv_hand_imb` | $\frac{\|n_L - n_R\|}{n_{\text{long}}}$ | 左右 LN の不均衡 |
| `adv_rel_pressure_1beat` | ≤ 1 beat 以内に非 LN Tap が続く long LN の割合 | 「release-then-jab」圧力 |
| `adv_ln_hold_min_beats` | 譜面上の beat での最短 LN hold — *反転* | 極端に短い hold = より難しい |
| `adv_ln_chord_big_rate` | ≥3-LN 同時 start の一部である LN-start position の割合 | 積み重ねた LN chord (多指のコミットメント) |
| `adv_ln_scatter_cv` | LN の inter-event gap の変動係数 | 不規則な散らばり |

`advanced_ln` score = 5つの feature の mode 別 midrank percentile 平均。反転 feature (`hold_min_beats`) は平均前に $1 - p$ になる。

LN のないチャートは score = 0 に潰れる (no-LN → no advanced-LN consistency)。コーパス p95 を超えると `advanced_ln` タグが発火する。

#### 4.5.4 なぜ2層か

- **Radar `x_ln`** = 「このチャートはどれだけ LN があるか」 (ユーザーの最初の問い)
- **`advanced_ln` タグ** = 「ここの LN は単純な hold ではなく技術的に要求が高いか」 (めったに発火しない、audit に値する)

単純な比率だけをレーダーに載せて、他の6軸 (chord / stream / scratch / soft / stair / distraction) の *shape_v2 candidate ratio* の形に合わせた — ユーザーのメンタルモデルを保つため。より細かい LN-burden の次元はタグ層に存在する。

現在のコーパス (SP n = 6,703) では、`advanced_ln` は 0 チャートで発火する — p95 threshold が厳しすぎるか、コーパスに十分に極端なパターンがない。audit ケースが現れたとき threshold を再調整できるよう定義は保存されている。

### 4.6 stair — 音階進行の chain

stair = 異なるタイミング位置にわたって **隣接 lane (±1) を歩く** 連続ノートの chain。lane 1→2→3→4 のような do-re-mi-fa 形式の進行を捉える。detector は **v3 (2026-06-13)** で再設計された — コーパスマイニングのセッションで、旧 detector が embedded で fast な stair を系統的に取りこぼし、`st`-family の cohort-mean trend を反転させていた (ρ = −0.495) ことが示されたのを受け、両方の consumer で `_detect_stair_chains_v3` が前バージョン (`_detect_stair_chains_v2`) を置き換えた。

#### 4.6.1 Chain detection (v3)

ノートは有効なタイミング位置にグループ化される (16.67 ms の chord ウィンドウ内、KEY lane のみ、プレイヤー単位)。新しい lane が、最近見られた lane に隣接 (±1) するとき chain が伸びる。4つの設計選択が v3 を区別する:

1. **Lookback matching** — ステップは、per-lane の recency テーブルを介して直近 24 ticks 以内に見られた lane ±1 から伸びる。**直前の position だけではない**。旧 detector は直前の position だけをマッチさせたので、別の stream voice と交錯した stair が介在する各ノートで毎回切れていた (Another Day、アニマのささやき — 以前は ≈ 0 と読まれていたユーザー確認済みの positive)。
2. **No pace floor.** 旧 detector はステップ gap $\in [6, 12]$ ticks (16分–8分) を要求し、より速い figure を除外していた。v3 は floor を取り除く: trill と jack は単調な ±1 進行の要求によって **構造的に** 除外される (trill は length-2 の断片しか生まず、jack は決して連鎖しない) ので、pace gate は不要 — そして hard window では「16分音符の stair は stair ではないのか?」という問いに答えられない。検出は 24-tick (8分音符) の上限まで走り、これは chain の連続性のみを束縛する。
3. **WALL rule** — **3 lane より多い** 有効 position は、すべての開いた chain を閉じ recency テーブルをクリアする。大きな chord は知覚的に不透明である: 5-lane chord の両側の単ノートは1本の stair ライン としては読まれず、wall lane が chain ソースとして作用してはならない。これは個々のセグメントを再分類した v2 の「K = 3 chord-size filter」を置き換える。
4. **Pace-uniformity split** — chain の前回の gap から $\max(1\ \text{tick}, 25\%)$ より大きく異なるステップ gap は figure を閉じ、新しいものを始める (1 chain = 1 つの譜面上の pace)。length $\geq 3$ の chain が受理される。

#### 4.6.2 Pace は属性であって gate ではない

各 chain は **real-time** な pace $v$ (steps per second) と重み

$$w = \mathrm{clip}_{01}\!\left(\frac{v - 5}{5}\right)$$

を担う。したがって ~5 steps/sec 以下で $w = 0$、~10 以上で $w = 1$。pace は real-time であって **ticks ではない**: Death Opera (BPM 450) は tick-「8分音符」進行を ~15 steps/sec で歩く — ユーザー判定でフルストレングスの stair — 一方 R.I.P My Pudding (BPM 166) は同じ tick gap を 5.5 steps/sec で歩き、ユーザーはこれを stair では *ない* と判定した。tick ベースの gate は両者を混同するが、real-time な重みは形状検出を pace-agnostic に保ちながら両者を分離する。

レーダーの raw 値は pace 加重の参加比率である (他の6軸が共有する parallel-ownership の形):

$$r_{\text{stair}} = \frac{\sum_{e \in \text{stair\_cand}} w(e)}{|E|}$$

ここで $w(e)$ はイベント $e$ が参加する chain にわたる最大の chain 重みである。これは binary count ではなく **graded** である: 遅い進行は形状としては検出されるが ≈ 0 を寄与するので、「遅い stair は stair か?」には gate の判定ではなく graded な答えが返る。

**Thresholds**: SP (0.120, 0.237), DP (0.054, 0.120) — v3 コーパス再構築に対して再 calibrate; 他のすべての軸の p33/p67 は動かさなかった (変更の分離)。

#### 4.6.3 検証 (canary チャート、tier 単調性ではない)

stair は density 直交の **character** 軸である: チャートはどの tier でも強い stair チャートになりうるので、tier 単調性は正しい基準ではない (§2.5.5 参照)。v3 はユーザー判定の canary チャートに対して検証された。Embedded / fast な stair が回復し、chord-stream / denim の control は保持された:

| Chart | x_stair before | after | verdict |
|---|---:|---:|---|
| stairway to the universe | 0.000 | 0.612 | 48th sweeps, embedded |
| klimt_(:3 」∠ )_ | 0.000 | 0.537 | 48th rolls |
| Death Opera (Eclipse / Genocide / Luna) | 0.000 | 0.46 / 0.50 / 0.30 | BPM 450, tick-slow but fast in real time |
| Another Day (★★3) | 0.025 | 0.520 | stream-embedded stair |
| Skydive (control) | 0.003 | 0.003 | chord-stream, correctly ~0 |
| R.I.P My Pudding (control) | 0.003 | 0.011 | only its real m12/14/16 64th rolls |
| JUMMER (×3, control) | 0.40–0.56 | 0.40–0.56 | delay-stair, preserved |
| 幽雅に咲かせ (control) | — | ±0.01 | unchanged |

`st`-family の cohort-mean stair trend は ρ = −0.495 (系統的な反転) から +0.115 へ移動した; `★` −0.070 → +0.453; `★★` −0.893 → −0.536 (残余の負の傾きは正直な composition セマンティクスである — より密なチャートは比例的に少ない stair を担う、detector の欠陥ではない)。

#### 4.6.4 廃止: p99-burden と purity factor (AEζηκ 時代)

parallel-ownership レーダー (Phase 1Z-1H, 2026-05-25) 以前、export される `x_stair` は p99-正規化された chain burden $\min(\text{chain notes}/\text{chart\_seconds}\,/\,p_{99}, 1)$ を **purity factor** $\times \max(0, 1 - 0.5\,x_\text{chord})$ で deflate したものだった — つまり chord 混在の stair は純粋なものより低く読まれた (audit: Empress of Raizze / Complex path が 0.865 vs Icyxis / 覚醒 0.744 と読まれた)。Phase 1Z-1H 以降、レーダーは shape_v2 比率を直接読むので、この burden + purity の定式化は **もはやレーダー値には適用されない**; legacy の `_axes_r1_character` drill-down パスにのみ残存する。`shape × fast × count` の L² burden (`stair_l2 = √(Σ chain_burden²)`) は依然として drill-down sub-metric として計算される。

### 4.7 distraction — mode 分割の定式化

#### 4.7.1 ユーザー定義のセマンティクス

SP と DP は異なるメカニックを持つので、**別々の定式化** を用いる。

**SP** (片手が scratch + 全7キーを制御):
distraction = **stream の流れに scratch が入り込むことの定量化** — *stream 領域内でのみ*、scratch がどれだけ流れを乱すか。ユーザー直感: 「stream を演奏していると、scratch がパンチインして流れを壊す」。

**DP** (両手が分離、P1 / P2 が各々 scratch + 7キー):
SP の「stream 中断」の枠組みは転用できない。DP の強い hand independence により、ユーザーは distraction を3つのパターンとして定義する。

DP のキー配置は **`S 1 2 3 4 5 6 7 │ 1 2 3 4 5 6 7 S`** — 両 scratch が*外側*の端にあるため、各サイドの near/far はそのサイドの scratch を基準に**ミラー**される:
- **1P**（scratch は左）: near = KEY1-3、far（内側）= KEY4-7
- **2P**（scratch は右）: near = KEY5-7、far（内側）= KEY1-4

1. **Rapid hand-role transition** — LH scratch + RH keys ↔ LH keys + RH scratch、どちらの手が scratch の役割を持つかの高速な周期切り替え。
2. **Impossible scratch** — 同側 scratch + 同側 **遠いキー**（1P KEY4-7 / 2P KEY1-4）が同時またはわずかにずれて。片手では同時に押せない形に見えるが、判定幅があるため scratch をわずかに早く・キーをわずかに遅く（あるいはその逆に）**ずらして**入力すれば片手で両方を取れる。負担はこの精密なタイミング分割であって、**もう一方の手を強制するものではない**（名前は譜面の見た目を表すもので、文字どおり両手を要求する意味ではない）。
3. **Adjacent scratch** — 同側 scratch + 同側 **近いキー**（1P KEY1-3 / 2P KEY5-7）が同時またはわずかにずれて。片手で演奏可能だが、ぎこちない手の形を生む。

責務分担 (両 mode):
- チャート全体の scratch share → scratch 軸 (§4.3)
- 純粋な scratch chain (持続的な run、chord なし) → scratch 軸の `scratch_max_run_sec`
- SP scratch + chord の一致 → SP `scratch_chord` タグ、**chord ドメイン** (§4.1)
- DP chord-tier の厳密なパターン / 小節単位の両側レイアウト → DP 固有タグ (§4.7.3)

#### 4.7.2 SP の定式化 (v3 アルゴリズム)

250 ms bin 上の 4-step パイプライン:

1. **Bin** — チャート内の全イベントが 250 ms (`bin_sec = 0.25`) の felt-time バケットに割り当てられる。各バケットは `key_count[i]` と `scratch_count[i]` を記録する。

2. **Detect key-flow intervals** — `key_count[i] ≥ t_key` の連続 bin が interval を形成する。内部の最大 `gap_bins` (現在 1–2) 個の非アクティブ bin は許容される (gap-tolerant — 短い stream の小休止を許す)。

3. **Qualify intervals** — **少なくとも `min_scratches` 個の scratch** を含む key-flow interval だけを残す。*scratch のない純粋な key パッセージ* はゼロを寄与する (SP の「流れに挿入される scratch」の枠組み)。

4. **Compute v3 score**:

$$\text{v3_score} = \frac{1}{\text{chart_seconds}} \sum_{i \in \text{qualifying bins}} \text{scratch_count}[i] \times \text{key_count}[i]$$

**なぜ積の形?** 集中した 5×5 bin × 5 回の発生は、同じ総和を持つ散らばった 1×1 の 25 回の発生より多くの burden を担う。乗算は集中を直接報いる。

**なぜ chart_seconds で正規化?** Codex 推奨 (2026-04-26): qualifying_sec (qualifying interval の総時間) で割ると short-flow + dense-scratch の比率を膨らませる。chart_seconds 正規化は *チャート全体にわたる distraction 負荷* を反映する。

**SC-tier 検証** (`scripts/_distraction_overlap_probe_full.py`):
- Shipped legacy +0.642 → v3 +0.715 (SC-tier Spearman)
- partial | scratch_per_sec: +0.354 → +0.572 (scratch density から独立した cross-domain シグナルを担う)

#### 4.7.3 DP の定式化 (2-component 算術平均、Phase 1Z-1M)

DP `x_distraction` は §4.7.1 の3つのパターン (transition + impossible + adjacent) を2つの component に潰し、算術平均する:

$$x_\text{distraction}^{DP} = \frac{C_1 + C_2}{2}$$

**Component C1 — hand-role transition (alt_ratio):**

すべての scratch イベントを時間順に walk する。time-gap $\Delta t \in [0.05, 0.30]$ s を持つ各隣接ペア $(s_i, s_{i+1})$ について分類する:
- 異なる側 (P1 ↔ P2): `cross_count`
- 同じ側: `same_count`

$$C_1 = \begin{cases} \dfrac{\text{cross_count}}{\text{cross_count} + \text{same_count}} & \text{if total} > 0 \\ 0 & \text{otherwise} \end{cases}$$

**なぜ rate ではなく ratio?** Rate (`cross_count / chart_sec`) は、偶発的な cross-side フリップを持つ one-side-burst チャートを膨らませる。$trange Attraktor [DP ANOTHER] (n=546 scratches, cross 82 / same 380): alt_ratio = 0.18 (低い) だが alt rate = 0.61/s (false positive)。ratio はチャート全体の hand-role バランスを捉える。

**Window: 固定 0.30 s** (BPM アンカリングなし)。C1 は C2 のような「音楽的フレーズのグルーピング」ではなく *motor swap* の概念だからである。100 BPM では 1 beat は 0.6 s — swap と呼ぶには緩すぎる。`td < 0.05` (chord-tier のほぼ同時の両側 wheel) は transition では *なく* 両側 chord であり、C1 から除外され、代わりに `bilateral_scratch` タグで表面化される。

**Component C2 — same-side scratch + key proximity (merged):**

各 scratch $s$ について、BPM-anchored ウィンドウ内の同側 KEY1-7 イベントを列挙する。各ペアは次を寄与する:

$$\frac{1}{\max(\Delta t,\ \text{chord_threshold_sec})}$$

合計し、chart_seconds で正規化、コーパス p95 (= 7.66) で clip:

$$C_2 = \min\left(\frac{1}{\text{chart_sec}} \sum_{s \in \text{SCR}}\sum_{k \in K_s} \frac{1}{\max(\Delta t_{s,k},\ \text{chord_thresh})},\ 1.0\right)$$

ここで $K_s$ = $s$ のウィンドウ内の同側 KEY1-7 イベント。

**Window: local BPM での half-beat、[0.10, 0.40] s に clamp。** legacy の 1-beat ウィンドウは 130 BPM で 0.46 s だった — 知覚的に2つの別々のイベント。half-beat はユーザーの「同時またはわずかにずれて」の定義に一致する。

**なぜ近い / 遠いキーを merge する?** 複合 chord (S + KEY1 + KEY5) は両グループを活性化し、同じ scratch イベントが2つの component を発火させてスコアを膨らませる ($trange の発火 scratch の ~44% が近い・遠いの両方を活性化する)。近い/遠いの区別は軸ではなく *タグ* 層で保存される:

**DP 固有タグ** (chord-tier ≤ 16.67 ms 厳密、または小節単位パターン):

| tag | fire condition | meaning |
|---|---|---|
| `adjacent_scratch` | same-side $S$ + near keys chord-tier count ≥ 4 | One-hand chord, awkward hand shape |
| `impossible_scratch` | same-side $S$ + far keys chord-tier count ≥ 2 | Reads unplayable; cleared one-handed by staggering the inputs within the judgment window |
| `bilateral_scratch` | ≥3 scratches on each side in same measure, count ≥5 | P1/P2 wheels busy simultaneously |

#### 4.7.4 BPM-trick の扱い

`bpm_segments` は `analyze()` の felt-BPM 補正 (§5) の *後* に渡される。したがって BPM トリックチャート (Alcubierre Drive [INSANE], ZAKOTEMPO 等) は felt-time で正しく bin される。DP の `local_bpm` はさらに、stub が effective_bpm の ≥ 5× にヒットした場合 `effective_bpm` にフォールバックする (BPM stub trap 回避)。

#### 4.7.5 検証 — DP 5-chart 判定セット

ユーザーラベル付きの ground-truth セット (DP, 2026-05-26):

| Chart | curator | verdict | C1 | C2 | x_distraction | corpus rank |
|---|---|---|---:|---:|---:|---:|
| P.S: Plasma Strike [GALGALIM] | DP ★ | **true** | 0.75 | 1.00 | **0.874** | #14 |
| キマグレ☆ [DP ANOTHER] | DP ★ | **true** | 0.47 | 1.00 | **0.734** | (out of samples) |
| Forceful Beat [DP HYPER] | DP ★ | **true** | 0.36 | 1.00 | **0.679** | #74 |
| キマグレ☆ [DP HYPER] | DP ★ | neutral ref | 0.49 | 0.21 | 0.350 | #480 |
| $trange Attraktor [DP ANOTHER] | DP ★ | **false** | **0.18** | 0.94 | 0.559 | #198 |
| ファンキーホット [DP INSANE] | DP ★ | **false** | 0.07 | 0.37 | 0.218 | #727 |

C1 (alt_ratio) が決定的な discriminator である。$trange の C2 は飽和する (高い scratch density) が、その低い C1 (0.18) が *true* チャート (0.36-0.75) からきれいに分離する。5/5 のランキングがユーザー判定に一致する。

**Thresholds**: SP (0.032, 0.084), DP (0.086, 0.290)。

### 4.8 (Radar-out) peak, jack — drill-down のみ

2つの metric は raw に計算されるがレーダーからは外される:

- **peak** — short-window (≤ 2 sec) の burden 強度 (peak_jab + peak_uppercut)。チャート間の burst-severity シグナル。
- **jack** — 同レーンの rapid-press 頻度 (window = 12 ticks)。`jack_present` タグのベース metric。

peak は character ではなく burst severity に関するものであり、jack はタグとしてのほうが明瞭に表現されるので、レーダーからは除外される。

### 4.9 絶対下限と dual threshold

各軸は、family 相対パーセンタイルに加えて **絶対下限** を適用する:

- yellow ≥ max(p33, 0.03)
- red ≥ max(p67, 0.08)

**なぜ floor?** まばらな軸 (LN, soft) は非常に低い p33/p67 を持つ (例: LN p67 = 0.013)。floor がなければ、raw 値 0.015 (低い絶対 share) のチャートが red と読まれる。ユーザーの視点では、LN share が 1.5% のとき「このチャートは LN-heavy か?」に「yes」と答えるべきではない。floor がこれを防ぐ。

密な軸 (chord, stream, stair, distraction) は floor を十分上回る p67 を持つので、floor は不活性である。floor の実際的な効果はまばらな軸にのみ及ぶ。

---

## 5. Felt-time 正規化

本節は最も設計の労力を要した節である。BMS チャートの時間と密度を *正しく* 測定しようとする試みは、チャート作者が時間軸そのものを使って遊ぶ多くの方法と衝突する。我々はそのようなトリックを4つの class として識別し、それぞれに異なる扱いを適用する。

### 5.0 演算の順序

チャートの時間や密度を測定する前に、以下の補正が順に適用される:

```
Raw chart
    ↓
[A] BPM offset translation   (§5.1)
    — strip shared 10^k offset from all BPMs
    ↓
[B] Stage 1: Class B truth recovery   (§5.2)
    — pin only the gimmick segments to truth_bpm
    ↓
[C] Stage 2: Class A H1 fallback   (§5.3)
    — if Stage 1 didn't apply and triggers fire, scale all BPM down
    ↓
[D] Z4 1-sec felt-time buckets   (§5.5)
    — compute NPS on the corrected time axis
```

Class D (measure-scale trick) は felt-BPM 補正を **受けない** — そのメカニズムは異なる (§5.4)。

---

### 5.1 [A] BPM offset translation

#### メカニズム

`#BPM` ヘッダーや `#BPMxx` コマンドが、意味のある BPM に大きな offset を加えて書く。例えば実際の 60-BPM の区間を `#BPM 10000060` としてエンコードでき、BMS プレイヤーはこれを 1000 万 BPM と解釈してすべてのノートをマイクロ秒に圧縮する。

#### 検出ルール

チャートで使われるすべての BPM (base + すべての `#BPMxx`) が同じ 10^k offset を共有し、減算後の残差がもっともらしい範囲 (おおよそ 30 – 1500) に収まる場合、offset を減算する。

#### 例: シャトルラン [Hexagon]

```
Raw BPM sequence:
  10000060, 10000064, 10000069, ..., 10000573  (linear ramp 60 → 573)

Detection: every BPM shares 10^7 offset, residuals ∈ [60, 573] all plausible
Action: subtract offset → reinterpret as 60, 64, 69, ..., 573 BPM

Result:
  effective_bpm: 101 (note-weighted mean of the linear ramp)
  chart_seconds: 138.8 sec (normal song length)
  Z4 nps_max: 7.0 (normal sn-tier flow)
```

このステップがなければ、effective BPM は数百万単位で測定され、後続のすべての metric が無意味になる。

#### 例: ZAKOTEMPO

```
Raw: 10000199 ~ 10000277 (10^7 + [199, 277] variation)
After subtraction: 199 ~ 277 BPM, effective_bpm = 199
chart_seconds: 130.5 sec
```

#### 限界

BPM offset translation は `#BPMxx` ライン *の外* のメカニズム (`#xxxNN02` measure scale、層になった `#STOP`) を修正できない。上記の2つのチャートは felt-time バケット数に残留アーティファクトを示す (例: シャトルラン bucket_count = 8.8M — 大半のノートは補正された時間に収まるが、一部のマイクロ秒残差区間が felt-time スパンを支配する)。残差は NPS_max (1秒バケット粒度) には影響しないが、チャート長の統計を歪める。

---

### 5.2 [B] Stage 1 — Class B truth recovery (segment trick)

#### メカニズム

チャートの *一部* が非現実的な BPM で、残りは正常。例: チャートは 250 BPM で走るが、ただ1つの小節 m204 が BPM 9,990,400 に設定され、ノートを詰め込んだままマイクロ秒で通過する。

この形は、チャートに埋め込まれた *real BPM* (truth_bpm) を持つ。duration-weighted mode BPM はもっともらしい範囲にあり、チャートの大半がそれで走る。

#### 検出ルール (すべて成立する必要あり)

1. Duration-weighted mode BPM ∈ [30, 1500] (もっともらしい)
2. Note-weighted effective BPM が mode BPM の ≥ 5× (乖離)
3. Effective BPM 自体が ≥ 1000 (非現実的に高い)

3つすべてが成立するとき、truth_bpm = duration-weighted mode BPM。真値から乖離する **gimmick 区間のみ** が truth_bpm に固定される; 正常な区間はそのまま保たれる。

#### 例: Alcubierre Drive [INSANE]

```
Raw BPM segments (roughly):
  base 174 BPM + some #BPMxx at 1.74M
  + measure_scale (xxxNN02:0.001-class) on some measures
  + ~26,000 #STOP commands (micro-stops)

Note-weighted effective BPM:
  effective_bpm ≈ 1.66M (gimmick segments dominate because notes concentrate there)

Duration-weighted mode BPM:
  174 (occupies the longest aggregate time)

Detection:
  mode=174 ∈ [30, 1500]  ✓
  effective/mode = 1.66M / 174 ≈ 9540 ≥ 5  ✓
  effective = 1.66M ≥ 1000  ✓

Action: pin every 1.66M segment to 174 (normal 174 segments stay)

Result:
  effective_bpm: 174 (recovered)
  Z4 nps_max: 33 (normal sl9 level)
  NPS_mean: 16.5 (near corpus median)
```

チャートヘッダーの BPM (174) は回復された truth_bpm に一致する — フレームワークはヘッダーに依存せずに、チャートの実際の意図 (正直な 174 BPM チャート) を *構造的に* 回復した。

#### 反例: Aleph-0 [INSANE]

```
Note-weighted effective BPM: 277.8
Duration-weighted mode BPM: ~250

condition 1 (mode plausible):     250 ∈ [30, 1500]   ✓
condition 2 (5× divergence):      277.8 / 250 ≈ 1.11     ✗
condition 3 (effective ≥ 1000):   277.8 < 1000            ✗
```

Aleph-0 は BPM トリックチャートではない — すべての BPM 区間がもっともらしい音楽的範囲内に収まり、effective と mode の差 (1.11×) は構造的トリックではなく小さな音楽的分散 (より密な区間がチャート平均よりわずかに高い BPM に乗る) である。truth recovery は ≥5× 乖離と effective ≥ 1000 の両方を要求する; どちらも成立しないので、チャートは raw BPM で分析される。

このチャートの一部の BMS バージョンには単一小節のマイクロ秒区間 (例: m204 が BPM 9,990,400) が含まれると報告されているが、ここのコーパス分布では全体の effective BPM が 1000 未満にとどまるので、truth recovery は依然として発火しない。そのような単発のバーストは、1秒 felt-time バケットを介して下流の Z4 (§5.5) で吸収される。

---

### 5.3 [C] Stage 2 — Class A H1 fallback (uniform trick)

#### メカニズム

チャート *全体* が非現実的な BPM で走る。Class B と異なり、埋め込まれた real BPM はない。すべてのシグナルが gimmick なので、truth recovery は発火できない。

#### 検出 (両方の trigger が発火する必要あり)

1. Note-weighted effective BPM > `trigger_eff_bpm` (現在 500)
2. 宣言された `peak_local_max_density_per_sec` > `trigger_peak_per_sec` (現在 200)

#### 動作 (H1 heuristic)

すべての BPM を、宣言された peak NPS / target peak NPS の比率で一様に scale down する。Target = 50 NPS (難しいチャートの現実的な peak)。

$$\text{scale} = \frac{\text{target peak per sec}}{\text{declared peak per sec}}$$

$$\text{felt_bpm} = \max(\text{declared_bpm} \times \text{scale}, \text{felt_bpm_floor})$$

Floor = 30 BPM (これより低いと非現実的に遅いチャートを意味する)。

#### 例: シャトルラン Hexagon (反事実: もし [A] が失敗していたら)

```
Hypothesis: BPM offset translation did not apply
  declared BPM: 10000060 ~ 10000573
  declared peak NPS: 800 NPS (atop 10M BPM)

  effective BPM > 500 ✓
  peak per sec > 200 ✓
  → H1 fires
  scale = 50 / 800 = 0.0625
  felt_bpm = 10M × 0.0625 ≈ 625,000 → still unrealistic

After [A] applied first, BPM is back to 60-573:
  effective BPM = 101
  peak per sec in normal range
  → H1 does not fire (conditions not met)
```

順序が重要である — [A] がまず BPM 空間をクリーンにし、[B] と [C] が意味のある値の上で動作するようにしなければならない。

#### 例: ネグラドルナ-class [MODEL 8+]

```
header BPM: 2222
effective BPM: ~2200 (uniform)
duration-weighted mode BPM: 2222 (out of plausible range)

Stage 1 truth recovery does not fire (mode BPM out-of-plausible)
Stage 2 H1 fires:
  scale = 50 / declared_peak ≈ 0.1
  felt_bpm = 2222 × 0.1 ≈ 222 → above floor, adopted

Result: measured as a 222 BPM chart
```

#### 不確実性の表面化 (time_base_reconstructed, 2026-06-13)

H1 fallback は単一の自由な慣行 — target peak = 50 NPS — によって time base を固定する。これはチャートが真のテンポについて *いかなる* 内部証拠も持たない (Class B の埋め込まれた real BPM や Stage [A] の回復可能な offset と異なり) ために選ばれた。したがって、そのようなチャート上の real-time 由来のすべての属性は、測定ではなく *宣言された playability 仮定の下での解釈* である。これを隠すのではなく、フレームワークは表面化する: `felt_info.method == "h1_heuristic"` のチャートは `time_base_reconstructed = True` とフラグ付けされ、その `framework_signal_status` がそれに応じて設定されるので、consumer は絶対スケールの属性 (秒あたり密度、pace、intensity の色) を割り引きつつ、frame-invariant な tick-domain の形状 (chain 構造、lane geometry) は信頼できる。

歴史的なロスター (§5.1–5.3 の起源、2026-04-29 「Class A = 5 charts」) への訂正: その cohort は完全に置き換えられた。シャトルラン / ZAKOTEMPO は今や Stage [A] BPM-offset translation で解決される (証拠ベース — 正しく *フラグ付けされない*)、ネグラドルナ ×2 / 戦歌 オルグラリヤ は scale-troll パスを通じて Class D へ。真の証拠なし (h1_heuristic) cohort は今や空である可能性が高い; フラグはその5つへのパッチではなく、将来を見据えた安全網である。

---

### 5.4 Class D — measure-scale trick (felt-BPM 補正なし)

#### メカニズム

`#xxxNN02:k` は *小節の長さ* を k 倍する。BPM は正常だが、k=0.001 はその小節がフル小節の 0.001 にすぎないことを意味する → そのノートはマイクロ秒に圧縮される。逆に k=1000 は、実時間スロットを占めたままの小節に 1,000× 多くのノートを詰め込むことを許す。

#### なぜ felt-BPM 補正が役に立たないか

BPM 自体は正常である (例: 155)。felt-BPM heuristic は BPM を見るので、正常 BPM の measure-scale trick は決してそれをトリガーしない。

#### 追跡: scale_exposure

measure scale 値の note-weighted 平均が `scale_exposure` として記録される。Exposure ≥ 0.05 は、そのチャートが有意な measure-scale-trick の影響を持つとフラグ付けする。

#### 例: 幽雅に咲かせ、墨染の桜 [HYPER]

```
header BPM: 155
effective BPM: 155 (normal)
duration-weighted mode BPM: 155 (normal)
→ Neither felt-BPM correction fires

But:
  chart_seconds: 142.5 sec
  total_events: 4846
  Z4 nps_max: 449.0  ← 449 notes inside a single felt-second
  active buckets: 140
```

Z4 は felt-time で測定するので、チャートが本当に 449 ノートを実際の1秒ウィンドウに詰め込んだとき、449 NPS を報告する。たとえ measure-scale trick が 5,000 イベントを1つの小節に詰め込んだとしても、その小節のうち felt-time の1秒を占める部分が、その1秒の NPS に寄与する。

この意味で Z4 は measure-scale trick を **「正しく報告している」** — 449 NPS はチャートの実際の player-feel 強度である (プレイヤーに1秒で 449 キーを叩くよう求めている)。それが *playable* かどうかは別問題である; フレームワークは測定するだけである。

---

### 5.5 [D] Z4 — 1秒 felt-time バケット

#### 定義

```
event felt-second:  s_e = tick_to_sec(t(e), sec_table)
bucket index:       b_e = ⌊s_e - s_0⌋    (s_0 = min event sec)
bucket NPS:         event count in that bucket (bucket width = 1 sec)
```

#### なぜこの形?

以前の小節レベルの binning は、各小節のノート数をその長さで割っていた。measure-scale trick や未修正の BPM トリックが小節を 0.015 秒に押し縮めると、その中の5ノートは 5/0.015 = 333 NPS を生む。アルスノヴァに喝采を [SUPERNOVA] は以前 8,000 NPS を報告した — 音楽的な意味のない数字。

1秒 felt-time バケットは felt-time 軸に1秒ウィンドウを敷き、その中のノートを数える。バケット内のマイクロ秒バーストは、その1秒の実際の幅で束縛される — その数字は、プレイヤーがその実際の1秒で押すキーの数に等しい。**player-feel 単位で正直。**

#### 効果 (SP コーパス)

| Statistic | Before (measure) | After (1-sec bucket) |
|---|---:|---:|
| median NPS_max | 100.8 | 34.0 |
| p99 | 1,177.6 | 57.0 |
| max | 8,000.0 | 449.0 |

#### 残留ケース

- max = 449 (幽雅 [HYPER]) — Class D カバレッジの限界 (§5.4)。
- 一部の BPM-offset チャート (シャトルラン, ZAKOTEMPO) は bucket_count が数百万 — felt-time スパンが残留 BPM-offset アーティファクトで歪んでいるが、**active バケットだけを見る** ことで問題ない (シャトルラン active=1479, ZAKOTEMPO active=1192)。NPS_max は影響を受けない。

### 5.6 STOP dead-time と構造的 BPM ramp (2026-06-13)

#### STOP dead-time の注入 (L1, 部分採用)

ticks を felt-time に変換する seconds table は BPM 区間のみから構築されていたので、`#STOP` の dead time が時間軸から消えていた — 5秒の STOP にまたがる figure が連続として読まれ、それをまたぐ real-time の pace や density を膨らませていた。table builder は今やオプションで各 STOP を、その dead seconds を担う zero-tick-span エントリとして注入できる (stop tick のちょうど上にあるノートは post-stop 側にマップされる) ので、STOP をまたぐ gap には凍結された時間が含まれる。

これは **stair パスと shape_v2 candidate detector でまず採用** され、宣言フレームが分析フレーム *である* チャート (`stop_cap_info is None and felt_info is None and bpm_offset_info is None`) に限定されている: troll されたあるいは再構築されたフレームのチャートでは、宣言フレームの STOP seconds が異なる時間フレームに混入してはならず、§5.x の stop-pathology ガード (例: ニニ bga_haha の 5.58 時間の troll stops) が時間軸に入ってはならない。残りの real-time consumer (stream window, LN, scratch, distraction, density bar, peak) は metric ごとに移行し、各々が独自の canary を持つ。

#### 構造的 BPM ramp (bpm_ramp タグ)

「どの BPM が真か」が答えられない場合 (§5.3) でも、チャートは BPM が *漸進的に* 上昇するという frame-invariant な証拠を担いうる。`detect_bpm_ramp` は note-bearing 区間 (≥ 4 playable notes、ゼロノートの visual-gimmick スパイクが ramp を壊すことも偽装することもできないように) を walk し、各ステップが ≤ 1.3× に有界 (「漸進的」、jump ではない) で単調な run を見つける; net ratio ≥ 1.25 が ≥ 3 の strict rise にわたるとき run が qualify する。`bpm_ramp` タグは、up-ramp がノートの ≥ 25 % を max run ratio ≥ 1.3 でカバーするとき発火する。

ramp 構造は **Stage [A] の下で frame-invariant** である — $10^k$ offset シフトは区間順序とおおよそのステップ比率を保つ — ので、譜面上の accelerando は、絶対 BPM が gimmick であるチャート上でも測定可能な事実である。検証: ZAKOTEMPO (199→277, 18 steps, ノートの 99.4 %)、シャトルラン (69→556, 485 steps, ratio 8.06、譜面上の shuttle-run beep-test の加速); control (Skydive / stairway / JUMMER) はゼロ。Down-ramp (ritardando) はタグなしの sub-metric として追跡される。

### 5.7 #RANDOM の再現性 (`randomized` タグ)

BMS の `#RANDOM N` 指示子は parse 時に 1..N を振り、囲んでいる `#IF M` branch がマッチしたときのみ発火する — 設計上、プレイヤーは *プレイごとに新鮮な振り直し* を見る。静的分析コーパスにとってこれは欠陥である: parser は元々 unseeded なグローバル RNG を振っていたので、#RANDOM チャートの parse ごとに異なる branch を選び、異なるイベントを生んだ — run をまたいで非再現的だった (1プロセス内の2回の連続 parse でも、固定された `PYTHONHASHSEED` の下でも)。parser は今や `md5(data)` から per-chart RNG を seed するので、各チャートは決定論的に1つの branch を選び (異なるチャートは無相関のまま)、コーパスは再現可能になる。

コーパスの #RANDOM チャートの調査で3つの class が見つかった: **single-variant** (1–2 個の `#RANDOM` ブロック — 1つの branch が正当な playable バージョン; 大半のチャート、例: L9, Trancing, アニマのささやき)、**whole-chart per-play** (34–533 ブロック — チャートはプレイごとに本当に異なる; Wavetapper, Skydive, Unidentified Flying Scotsman, りくろ, 薄雲)、そして **degenerate** (`#RANDOM 1`、no-op; 例: Aleph-0)。Variation の大きさはブロック数とは独立である — L9 はその6つの branch が完全に異なるチャート (BPM 3390 / 6666 / 9888) である単一の `#RANDOM 6` を持つ。whole-chart class については、md5 固定された branch は本質的に可変なチャートの1サンプルなので、`randomized` タグ (≥ 10 個の `#RANDOM N>1` ブロックで発火) が、レーダーと density bar が固定チャートではなく1つの branch を反映していることをフラグする。Single-variant と degenerate のチャートはフラグされない。

---

## 6. Threshold calibration

### 6.1 コーパス統計

- SP: n = 6,703 (mode-active)
- DP: n = 1,852

mode 別の nonzero 分布をソートし、p33 と p67 をコーパスパーセンタイルとして抽出する。

### 6.2 Threshold の導出

1. corpus regen → 各チャートの軸 raw 値
2. mode 別 nonzero 分布をソート
3. p33, p67 を抽出
4. `_AXIS_INTENSITY_THRESHOLDS_SP/DP` に焼き込む
5. `_classify_axis_intensity` で絶対下限 (0.03 / 0.08) と組み合わせて最終 tier を生成:

$$
\text{tier}(v, p_{33}, p_{67}) = \begin{cases}
\text{red} & v \geq \max(p_{67}, 0.08) \\
\text{yellow} & v \geq \max(p_{33}, 0.03) \\
\text{green} & v > 0 \\
\text{null} & v = 0
\end{cases}
$$

### 6.3 Drift チェック

任意のコーパス regen (metric 変更がなくても) で、新鮮な p33/p67 が焼き込まれた threshold と比較される。∆ < 0.001 なら安定; そうでなければ再 calibrate。

---

## 7. Case studies

各 case: (chart / family / radar / key tags / time-axis shape / commentary)。

### 7.1 Aleph-0 [INSANE] — chord-stream dominance

- **Family**: ★★2
- **Radar**: chord と stream の両方が red。peak_uppercut = 1.00 (コーパス max)。
- **Tags**: chord_heavy, stream_dense, dense_chart
- **Density**: sec 60–65 でバーストクラスター、その後 sec 89–102 で持続的な 30–40 NPS のプラトー
- **Commentary**: 典型的な chord-heavy stream チャート。parallel-ownership モデルが chord と stream の両方を red に発火させる。★★ family の中でも、持続的バーストの時間軸分布が目に見えて際立つ。

[TODO: card screenshot]

### 7.2 Alcubierre Drive [INSANE] — BPM trick recovery

- **Family**: sl9
- **Radar**: stream red, chord yellow
- **Tags**: visual_gimmick, soflan, fast_chart, dense_chart
- **Density**: bucket_count = 1,082 (felt-time スパン、BPM-trick アーティファクト)
- **NPS_max**: 33.0 (sl-family p75 — 外れ値ではない)
- **Commentary**: Class A BPM-trick チャート (BPM 1.74M warp)。felt-BPM heuristic が BPM を 174 に回復した後、Z4 1秒バケットが実際の felt-time NPS を測定する。family cohort 内では普通の sl9 と読まれる。1秒 felt-time バケットが BPM-trick の micro-burst インフレを打破した成功例。

[TODO: card screenshot]

### 7.3 幽雅に咲かせ、墨染の桜 [HYPER] — measure-scale outlier

- **Family**: ★★8
- **NPS_max**: 449.0 (単一 felt-second 内に 449 ノート)
- **Commentary**: Class D measure-scale trick。`#xxxNN02:1000`-class の小節倍率が、felt-time でわずか ~1 秒のスパンの小節に数百のノートを収める。felt-BPM heuristic では扱われない (BPM 自体は正常; 小節長だけが異常)。フレームワークの限界ケース。

[TODO: card screenshot]

### 7.4 Skydive (st4) vs FREEDOM DiVE [FOUR DIMENSIONS] (st8/★★5) — density-vs-difficulty divergence

> **[2026-06-06 revision]** 本節の当初の Skydive の数値は、`BMS.Tools/scripts/bms_parser.py`
> の欠陥に由来していた — parser が BMS spec §11 `#RANDOM / #IF / #ENDIF`
> の制御フローを無視したので、Skydive ソース内のすべての代替 branch が、
> あたかも発火したかのように含まれていた。
> Skydive の `.bms` ソースは playable channel 上で 138 × `#RANDOM 21` + 126 × `#RANDOM 35`
> の sister-branch ブロックを使う (多くの staff-roll
> 「troll」パターンの1つ); 壊れた parser はそのノート数を
> 1,877 (実際の LR2-rendered の数値) から 2,891 に膨らませた。
>
> 下記の当初の例は記録として取り消し線付きで保存する;
> 修正された分析が続く。取り消し線の tier 比較
> (「Skydive NPS > FD NPS」) は parser-bug の産物であり、もはや成立しない。

~~フレームワークの *「axes ≠ difficulty」* 原則 (§2.4) の最も直感的な例示。2つのチャートの raw 表値:~~

| | Skydive ~~(original)~~ | Skydive **(corrected)** | FREEDOM DiVE [FOUR DIMENSIONS] |
|---|---:|---:|---:|
| **Curator family** | **st4** | **st4** | **st8 / ★25 / ★★5** |
| BPM | 120 | 120 | 222 |
| Chart length | 67 sec | 67 sec | 138 sec |
| NPS mean | ~~**44.5**~~ | **28.9** | 33.0 |
| NPS max | ~~57~~ | (recomputed downward) | 56 |
| **Pos/s** | ~~**7.0**~~ | **7.0** | **12.0** |
| avg chord size | ~~6.67~~ | **4.30** | 3.33 |
| x_chord | ~~0.99~~ | 0.985 (basically unchanged — saturated) | 0.73 |
| x_stream | ~~0.96~~ | 0.96 (unchanged) | 0.85 |
| x_peak | 0.31 | 0.31 | 0.64 |
| primary_character | ~~**chord-spam**~~ | **chord-shape** (re-categorised) | **chord-shape** |

#### ~~表だけを読む罠~~

> ~~NPS mean だけを見ると: Skydive (44.5) > FD (33.0)。Max は似ている。*ユーザーが NPS を difficulty proxy として扱う* と、「Skydive のほうが難しい!」という知覚が生じる。しかしキュレーターの tier は逆を言う (st4 vs ★★5、~4–5 tier の差)。~~

**修正後**: 適切なデータでは、Skydive の NPS (28.9) は今や FD (33.0) より *低い*。当初の「high-NPS-but-low-tier パラドックス」は parser bug のアーティファクトであり、チャートの実際の特性ではなかった。§2.4 の *「axes ≠ difficulty」* 原則は無効化されない — ただ別の例示が必要なだけである。

#### ~~分解すると差が見える~~

~~`NPS = Pos/s × avg_chord_size` (§3.5) を用いて:~~

- ~~**Skydive**: 7.0 positions/sec × 6.67 chord ≈ 47 NPS。*chord wall* — 120 BPM (8 pos/sec) でほぼすべての 16 分にフル 7-chord。単一パターン、endurance チャート。~~
- ~~**FD [FOUR DIMENSIONS]**: 12.0 positions/sec × 3.33 chord ≈ 40 NPS。222 BPM での速い positional shift、多様な 3–4 lane chord 付き。pattern + speed チャート。~~

~~同じ ~50-NPS class、完全に異なるメカニクス。~~

**修正された分解**: Skydive は今や 7.0 × 4.30 ≈ 30 NPS (当初の測定より小さい chord での chord-wall); FD は 12.0 × 3.33 ≈ 40 NPS のまま (positional shift)。Pos/s の分割は依然としてメカニズム差 (endurance vs speed) を明らかにする — §3.5 column が教えるために設計された教訓。raw NPS 比較だけがその物語上の重みを失う。

#### ~~レーダーは両者を正しく区別する~~

~~フレームワークの *radar* は2つのメカニズムを明確に表現する:~~

- ~~Skydive: chord 0.99 (飽和) + peak 0.31 (variety なし) + タグ `chord-spam`~~
- ~~FD: chord 0.73 + peak 0.64 (variety) + タグ `chord-shape`~~

~~したがってフレームワークの character snapshot は両者を *異なる character* として正確に記述するが、*raw NPS だけ* ではメカニズム差が隠れる。Pos/s column (Phase 1Z-1L で追加) が表内に NPS 分解を表面化させ、ユーザーが compositeness を直接見られるようにする。~~

**修正後** — クリーンなデータの下で両チャートは今や `chord-shape` に分類される (chord 0.985 vs 0.73、両方とも似た peak) ので、当初の「2つの character は明確に異なる」という主張はこのペアには成立しない。`chord-spam` → `chord-shape` のカテゴリードリフトは、35 % の幻のノートインフレを除去したことで chord-shape-variety sub-metric がその threshold を越えて移動したために起きた。これはデータ修正の下での軸システムの *期待される* 挙動であり、フレームワークの失敗ではない。

#### Meta-lesson — データ整合性は軸の解釈に先立つ

本節は、parser bug が軸に破損したデータを供給したときに何が起きるかの worked example として保持される:

1. 見かけ上膨らんだ NPS が「axes ≠ difficulty」の *誤解を招くほどクリーンな* 例 (高 NPS、低 tier) を生んだ。
2. chord 軸はどちらにせよ飽和した (0.985 vs 0.99) — 飽和が基礎となる差を隠した。
3. primary-character classifier は修正後にカテゴリーを変えた — *有用な診断*: パイプラインを再実行してカテゴリーフリップが生じたら、データ層の問題を疑え。

**§2.4 のクリーンな代替例示は、データ検証後も tier vs NPS の乖離が持続するチャートペアを使うべきである。** 下記の代替は corpus filter (`SP, both within `st` scale, chord-wall vs varied-chord-shift, post-fix metrics`) で選ばれた。

### 7.4a Replacement illustration — Sampling Satan (st3) vs κανων (st12)

データ整合性の修正後、SP チャート (tier ラベル付き 5,575) のコーパススイープが、parser アーティファクトに依存せずに §2.4 のパラドックスを示すペアを浮かび上がらせた。ここでのメカニズム対比は **chord-wall vs stream-pure** — 当初の Skydive vs FD の枠組み (chord-wall vs varied chord-shift、両方とも `chord-shape` カテゴリー内) とは異なるテクスチャである。新しいペアはカテゴリー境界をまたぐ: フレームワークの primary character は Satan で `chord-shape`、κανων で `stream-pure`。どちらのチャートも `#RANDOM` を使わないので、値は再実行をまたいで決定論的である。

| | Sampling Satan | κανων |
|---|---:|---:|
| **Curator family** | **st3** | **st12** |
| BPM | 200 | 175 |
| Chart length | 87 sec | 140 sec |
| Total notes | 2,835 | 3,422 |
| NPS mean | **33.57** | **26.95** |
| NPS max | 46 | 54 |
| **Pos/s** | **6.19** | **15.17** |
| avg chord size (within chord windows) | **5.61** | **2.58** |
| chord_rate (fraction of positions that are chords) | **0.944** | **0.396** |
| x_chord | 0.970 | 0.351 |
| x_stream | 0.852 | 0.927 |
| x_peak | 0.261 | **1.000** |
| primary_character | chord-shape | **stream-pure** |
| IRT (easy / hard) | 1.35 / 1.75 | — (low-confidence) |

#### パラドックスの復元

NPS mean だけを読むと、Sampling Satan (33.57) > κανων (26.95)。素朴な「NPS = difficulty」の読者は Satan のほうが難しいと予想するだろう。キュレーターラベルは逆を言う: Satan は st3 (low-intermediate satellite) に、κανων は st12 (satellite scale の頂点、9 tier レベル上) に位置する。利用可能な IRT シグナルも裏付ける: Satan の hard-clear difficulty は ≈ 1.75 だが、κανων の clear データは安定した IRT には疎すぎる — ごく少数のプレイヤーしかその clear バーに到達していないという別のヒント。

#### 分解 — §3.5 の一般形を用いて

略式 `NPS ≈ Pos/s × avg_chord_size` は、ほぼすべての position が chord であるとき (すなわち `chord_rate → 1`) のみ成立する。混在チャートの正確な形は:

`NPS ≈ Pos/s × [chord_rate × avg_chord_size + (1 − chord_rate)]`

— 括弧内の係数は *position あたりの平均ノート数* であり、chord position をそのサイズで、単ノート position を 1 で加重する。

- **Sampling Satan**: `chord_rate = 0.944`, `avg_chord = 5.61` → factor = 0.944 × 5.61 + 0.056 = **5.35**。NPS ≈ 6.19 × 5.35 = **33.1**、測定値 33.6 に一致。chord wall — position の 94% が chord イベント、平均 chord サイズは 7 キー中 5.6。200 BPM での単一のリズミックベクトル、87 秒にわたって持続。*Endurance-class chord mash*。
- **κανων**: `chord_rate = 0.396`, `avg_chord = 2.58` → factor = 0.396 × 2.58 + 0.604 = **1.63**。NPS ≈ 15.17 × 1.63 = **24.7**、測定値 27.0 に 9 % 以内で一致。stream-pure チャート — position の 60 % が *単ノート*、残りの 40 % が 2-3 キークラスター、すべて 175 BPM で 15 positions/sec で発火、peak burst 飽和付き。*Sight-read / finger-discipline class*。

短形式 `Pos/s × avg_chord_size` は、すべての position を chord として扱うことで κανων に **39.1** を与えた (45 % 過大評価) — §3.5 の row order への有用な警告ケースであり、`chord_rate < ~0.85` のとき完全な式が重要である理由である。

#### レーダーは両者を正しく区別する

- **Sampling Satan**: x_chord 0.97 + x_peak 0.26 + primary `chord-shape` + タグ `big_chord_burst` — 飽和した、bursty でない chord wall。
- **κανων**: x_chord 0.35 + x_peak 1.00 + primary `stream-pure` + タグ `jack_present` — まばらな中サイズの chord 句読点を持つ stream、max burst 飽和。

2つの character はカテゴリー境界 (chord-shape vs stream-pure) をまたぎ、x_chord は 0.62、x_peak は 0.74 異なる一方、その NPS 値は tier rank を反転させる。これは §2.4 原則の正直な形である: *どの* イベントが density を生んでいるか — chord の深さか positional 頻度か — が、*いくつ* イベントがあるかよりも重要である。

このペアは当初の Skydive vs FD の枠組み (2つの `chord-shape` テクスチャを比較) よりも強いメカニズム対比であることに注意。欠点は、§3.5 の chord-stream row が本節内でチャートペアの結び付きを持たなくなることである; κανων は §3.5 の異なる row (*varied chord-stream* ではなく *stream* アーキタイプ) に位置する。

#### 教訓

これらのチャート間の真の difficulty 差は、フレームワークが *測定しない* 次元 (パターン認識、sight-reading、finger discipline; §9.1 の9つの未測定次元) に存在する。NPS density だけから difficulty を推論することは、*どのメカニズム* がその density を生むかを無視する。正直な difficulty 評価の形は、character snapshot、キュレーター tier ラベル、そしてユーザー自身のリズムゲーム経験を組み合わせる。

---

## 8. Sound-aware metrics — 2つのレベル

フレームワークは「音声情報」を、コストと限界が大きく異なる2つの明確なレベルで使う、あるいは探求してきた。両者を明示的に分離する。

| Level | Mechanism | Cost | Status in framework |
|---|---|---|---|
| **L1 — keysound id matching** | Compare `#WAV` slot ids (do two notes trigger the same sample?) | Text parsing only (free) | ✅ Adopted — jack `double_tab` / `triple_tab` tags (§8.1) |
| **L2 — audio FFT pitch** | Decode WAV + pyin pitch estimation | CPU / memory / pre-cache | ❌ Rejected for stair definition (§8.2) |

L1 はプロダクションにある。L2 は概念的には興味深かったが、その仮説は経験的 audit の下で破綻した。両方とも BMS コミュニティの議論のためにここに文書化する。

### 8.1 L1 — Keysound id matching (jack, adopted)

#### 仮説

同じ lane の隣接ノートが *同じ `#WAV` slot id* を参照する — すなわちまったく同じ音声サンプルをトリガーする — とき、その chain は **keysound-anchored repetition** である。作者は意図的に「同じ音の反復」を設計しており、プレイヤーはそれを正直な知覚的 jack として感じる。

#### 実装

各ノート $e$ について、`token(e)` をそれがトリガーする `#WAV` slot id とする。隣接する同 lane ノート $(e_i, e_{i+1})$ は次のとき keysound-matched pair を形成する:

$$\text{matched}(e_i, e_{i+1}) = \mathbb{1}\left[ \text{lane}(e_i) = \text{lane}(e_{i+1}) \,\wedge\, \text{token}(e_i) = \text{token}(e_{i+1}) \,\wedge\, \text{gap}_{\text{tick}}(e_i, e_{i+1}) \leq 12 \right]$$

length $\geq 2$ の chain を形成する連続 matched pair → `double_tab` タグ; length $\geq 3$ → `triple_tab` タグ。

#### コスト

音声デコードなし。BMS テキストから `#WAV` slot 参照を読むだけ。コーパス regen 中の追加コストはゼロ。

#### 限界

- 作者が同 lane の反復で `#WAV` id を変える (例: 02, 03, 02, 03, ...) と音の単調さを破る場合、keysound-matched は発火しない。そのような chain は代わりに lane-only の `jack_present` タグで捕捉される。
- 同じ `#WAV` id だが実際のサンプルが異なる (merged BMS パッケージから) と false match を生む。稀だが起こりうる。

### 8.2 L2 — Audio FFT pitch detection (stair, explored and rejected) — motivation

stair 軸 (§4.6) は lane 進行が ±1 で歩く chain を検出する。その定義は **チャートの lane パターンだけ** を見る — keysound (`#WAV`) が実際に音階を歩くかどうかは無視する。

ユーザーの洞察: *「本物の知覚的 stair は lane だけでなく音声 pitch でも歩く。」* ランダムな keysound での同じ lane walk はより弱い知覚的 stair を与える。逆に、lane walk に一致する do-re-mi-fa 進行は、リスナーがアンカーする期待を生み、真の stair として登録される。

**仮説**: lane 進行 *と* 音声進行が一致する chain だけを数えれば、stair 軸がプレイヤー知覚により良く整合する。

### 8.3 L2 — Implementation (Phase 1V infrastructure)

#### Step 1 — keysound pitch 推定

各 `#WAV` slot について、音声サンプルの base pitch f₀ を推定する。ツール: **librosa.pyin** (probabilistic YIN、Hz 基本周波数推定)。結果はチャートごとにキャッシュされる。

```
keysound 01.wav → f₀ = 440.0 Hz  (A4)
keysound 02.wav → f₀ = 466.2 Hz  (A#4)
keysound 03.wav → f₀ = 493.9 Hz  (B4)
...
```

#### Step 2 — per-chart pitch baseline

チャート内のすべての keysound f₀ 値の p95 が baseline として機能する; 各ノートの pitch はそれに対する相対で表現される。チャートは tonal register が異なる (synth bass vs piano) ので、絶対 Hz 比較が失敗するため必要。

#### Step 3 — sequence score

stair lane chain (§4.6 の定義) 内の各隣接ノートペア $(e_i, e_{i+1})$ について、**lane delta の符号** が **pitch delta の符号** に一致するかをチェックする。chain ごとの match ratio が計算され、それを weight-average してチャートレベルの audio sequence coverage にする。

数式スケッチ:

$$\text{audio_seq_score}(c) = \frac{\sum_{(e_i, e_{i+1}) \in c} \mathbb{1}\left[ \text{sign}(\text{lane}(e_{i+1}) - \text{lane}(e_i)) = \text{sign}(f_0(e_{i+1}) - f_0(e_i)) \right]}{|c| - 1}$$

ここで $c$ は chain、$f_0$ は keysound pitch。

#### Step 4 — coverage gate

audio score は、pyin が信頼性をもって pitch 検出できた keysound の割合が threshold (candidate β = 40%) を超える場合のみ採用される。それ未満 (drum-heavy、FX-heavy、または noisy な keysound に典型的) では lane-only の定義にフォールバックする。

### 8.4 L2 — Empirical audit (hypothesis partially failed)

#### Case 1 — Flight of the Bumblebee (熊蜂の飛行), measure 4

典型的なクラシックの音階 walk パッセージ。Lane 的には: クリーンな 1→2→3→4→5→6→7。**音声 pitch は sequential ではない** — チャート作者が keysound を介して半音階進行を保てなかったか、意図的に lane walk と音楽的 walk を分離したかのどちらか。

#### Case 2 — Terminal Strike, measures 50–57

Lane 的に zigzag ではなくクリーンな stair — 明らかに知覚的な stair チャート。音声 pitch はいくつかの区間で lane walk の *逆方向* に進むことが見つかった。

#### 結論

> 「本物の stair は必ずしも audio-sequential ではない。」

ユーザーの case-by-case audit が仮説を破った。Lane 進行は stair character の十分条件である (音声方向は独立); audio-sequential な整合は必要条件では *ない*。

### 8.5 L2 — Decision and replacement

Phase 1V audio FFT は **棄却された**。lane-only の stair 検出に戻した。代わりに2つの補償措置が採用された:

- **K=3 chord-size filter** (Phase 1U) — ≥3 lane が同時発火する chain セグメントは stair ではなく chord として再分類される (§4.6)。
- **p99 burden normalization** (Phase 1U) — raw burden (chain notes / chart length) を p99 で割って stair raw 値を 0–1 に正規化する。

この2つの措置だけで、*当時* stair 軸で十分なユーザー知覚の一致を生んだ (case audit: Empress / Complex vs Icyxis / 覚醒 が正しく分離)。両方とも後に v3 detector (§4.6) で置き換えられた: K=3 再分類は WALL rule になり、p99-burden + purity factor は pace 加重 shape_v2 比率に有利になるようレーダー値から外された。本節の教訓 — 音声 pitch ではなく lane 進行が stair character を定義する — は再設計を無傷で生き延びる。

### 8.6 L2 — Infrastructure preserved

audio FFT コードは棄却後も **削除されない**。将来の再探求の可能性:

- 他の軸 (LN transitions, soft) が音声シグナルから利益を得るかもしれない
- 代替の pitch detector (CREPE 等) が audit ケースを再検証できるかもしれない
- 音声ベースの feature が、lane-only モデルが見逃す他の character 側面 (melodic vs percussive) を捉えるかもしれない

棄却されたのは *audio FFT が stair 定義に不可欠であるという仮説* であって、*audio FFT そのもの* ではない。

### 8.7 教訓 (L1 と L2 の両方) — 概念的な健全さは経験的採用を保証しない

「Stair = scale progression」は知覚的に非常にもっともらしい。しかし audit は、BMS 作者の作曲/編曲の実践がその知覚モデルに従わないことを明らかにした。**Metric 仮説はチャート分布に対して経験的に検証されなければならない。**

このケースは、フレームワーク metric がユーザー知覚と不一致するとき、perceptual-vs-empirical のトレードマトリックスを明示的に表示することを論じる。3つの可能性 — (a) metric が間違っている、(b) 知覚が間違っている、(c) 両方 — を証拠の前に非対称に判断すべきではない。

---

## 9. Limitations and future work

### 9.1 フレームワークのカバレッジ

識別された 22 の difficulty 次元のうち、13 が測定されている (≈ 60%)。未測定の9つ:

- **Memorization** — 初見で playable か、記憶を要するか
- **Endurance** — チャート長 × 持続負荷の蓄積
- **Lane-pattern asymmetry** — 同じ NPS、異なる lane 分布 (例: 1234 vs 2345) は異なる圧力を持つ
- **Audio cue** — keysound がチャート進行を追うかどうか
- **Sight-reading** — 視覚的レイアウトの読みやすさ
- **Gimmick fatigue** — soflan / stop による累積的な認知負荷
- **Chord pattern entropy** — 同じ chord rate、異なるパターンのランダムさ
- **Pattern repetition** — 同一パターン再現の頻度
- **Scratch chain difficulty** — scratch-run パターン (zigzag vs straight)

将来の候補:
- **M1** chord-sequence entropy
- **M2** chart duration metric
- **M5** anchor jack detection
- **M6** pattern repetition
- audio FFT の他の用途 (§8 参照)

### 9.2 測定の限界

- Class D measure-scale trick の部分的なカバレッジ
- 小さな DP family サンプル (n = 1,852)
- IRT との統合なし (意図的な decoupling)

### 9.3 Felt-time / BPM-aware の限界 (audit 2026-06-13)

pace- と density-ベースの metric の基礎となる real-time 軸には4つの既知の限界があり、そのうち2つは本セッションで対処された:

- **L1 — STOP dead-time (部分的にカバー)。** seconds table は今や STOP dead time を注入するが、これまでのところ stair パスと shape_v2 だけがそれを消費する (§5.6); stream / LN / scratch / distraction / density / peak の metric は依然としてそれなしで table を構築し、metric ごとに移行する。
- **L2 — time-base reconstruction (表面化、未修正)。** Class A (h1_heuristic) チャートは回復可能なテンポを持たない; その real-time 属性は宣言された playability 慣行の下で計算され、測定として提示されるのではなく `time_base_reconstructed` とフラグされる (§5.3)。tick-domain の形状は影響を受けない; これらのチャートでは絶対スケール比較は信頼できない。
- **L3 — pace ceiling (意図的)。** BPM ~900 を超えると、12-tick ステップが 16.67 ms の chord ウィンドウ内に収まり wall に merge するので、stair detector は事実上 ~60 steps/sec の ceiling を持つ。正しいと判断 (それより速いのは離散ステップではなく glissando)、修正ではなく文書化。
- **L4 — mid-chain BPM change (保留)。** Chain の pace uniformity は ticks でチェックされるので、単一 figure 内の soflan break は、平均された pace を持つ1つの chain としてそれを残す。per-step real-time-interval split が修正である; L1 が stair パスに着地したので今やブロック解除済み。

---

## Appendix

### A. Full metric formula reference

§4 / §5 の数式を統合。すべての ratio metric はチャートの playable event count $|E|$ を分母として使う。

| Axis | Candidate condition | Ratio | Notes |
|---|---|---|---|
| **chord** | $\|\{ e' : \|t(e') - t(e)\| < 16.67 \text{ms} \}\| \geq 3$ | $r_\text{chord} = \sum_e \text{cand}(e) / \|E\|$ | 16.67 ms ≈ 1/60 sec, 3+ simultaneous lanes (§4.1) |
| **stream** | $\text{nps}_W(e) \geq 8.0 \wedge e \notin \text{SCR}$, $\text{nps}_W = N_W / (2W)$, $W = 45/b$ sec | $r_\text{stream} = \sum_e \text{cand}(e) / \|E\|$ | ±0.75 beat window, weights single=1.0 / chord=0.6 / scratch=0 (§4.2) |
| **scratch** | $\text{lane}(e) \in \text{SCR}$ | $r_\text{scratch} = \|\{e : \text{lane}(e) \in \text{SCR}\}\| / \|E\|$ | Turntable lane share (§4.3) |
| **soft** | $\text{bpm}_s \neq \text{bpm}_\text{base}$ (felt frame) | $x_\text{soft} = \mathrm{clip}_{01}\!\big(\tfrac{\log_2(1+B/T)}{\log_2(1+\text{ref})}\big)$, $B = \sum_s \log_2(\text{bpm}_s/\text{bpm}_\text{base})^2 n_s \tfrac{\rho_s}{\rho_\text{base}}$ | felt-frame cumulative log² burden, log-norm @ p97 ref (§4.4) |
| **ln** | $\text{type}(e) = \text{LN}$ | $r_\text{ln} = \|\{e : \text{type}(e) = \text{LN}\}\| / \|E\|$ | Both start + end counted (§4.5) |
| **stair** | Length ≥ 3 chain, lane Δ = ±1, lookback ≤ 24 ticks, WALL rule (>3 lanes), no pace floor (v3) | $r_\text{stair} = \sum_{e} w(e) / \|E\|$, $w = \mathrm{clip}_{01}((v-5)/5)$, $v$ = real-time steps/sec | pace-weighted participation (§4.6) |
| **distraction** | Scratch events inside stream interval $S$ | $r_\text{distract} = \text{scratch}(S)/\|S\| \times \text{intensity}$ | v3_score, intensity reflects scratch-run length (§4.7) |

**Radar-out (drill-down only)**

| Metric | Definition | Notes |
|---|---|---|
| **peak** | peak_jab + peak_uppercut (L2 burden over ≤ 2 sec window) | Burst severity (§4.8) |
| **jack** | Same-lane gap ≤ 12 tick pair count / sec | Base for jack_present tag (§4.8) |

**Threshold classification function**

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

**Felt-BPM correction triggers** (Stage 1 — Class B truth recovery)

発火するには3条件すべてが成立する必要あり:
1. $\text{mode_bpm} \in [30, 1500]$
2. $\text{effective_bpm} / \text{mode_bpm} \geq 5$
3. $\text{effective_bpm} \geq 1000$

発火時、gimmick 区間のみが $\text{truth_bpm} = \text{mode_bpm}$ に固定される。

**Stage 2 — Class A H1 fallback**

両方の trigger が発火する必要あり:
1. $\text{effective_bpm} > 500$
2. $\text{declared peak NPS} > 200$

発火時、すべての BPM が $\text{scale} = 50 / \text{declared peak NPS}$ で一様に scale される。$\text{felt_bpm} = \max(\text{declared_bpm} \times \text{scale}, 30)$。

### B. Threshold table

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

### C. Tag definitions (18)

各タグの fire condition と SP コーパス (n = 6,703) の fire count。2つの zero-fire タグ (`advanced_ln`, `peak_outlier`) はコードで *定義* されているが現在のコーパスでは決して発火しない — 現れたときユーザーが意味があると考える稀なパターンのための予約スロット。

| Tag | Category | Fire condition | SP fire | % |
|---|---|---|---:|---:|
| `burst_focused` | peak | Peak burden concentrated in a small region (peak_concentration high) | 2,835 | 42.3% |
| `dense_chart` | density | Whole-chart average NPS exceeds threshold | 2,119 | 31.6% |
| `big_chord_burst` | chord | Peak chord size is large (many simultaneous lanes at the maximum moment) | 1,697 | 25.3% |
| `sustained` | peak | Peak burden spread across the chart (peak_concentration low) | 1,335 | 19.9% |
| `jack_present` | jack | Same-lane rapid pair count exceeds floor (keysound-agnostic) | 1,226 | 18.3% |
| `scratch_burst` | scratch | Scratch flurry within a 1-sec window exceeds threshold | 845 | 12.6% |
| `last_killing` | structural | Late-chart NPS spike (escalating finale or back-spike + calm coda) | 543 | 8.1% |
| `scratch_chord` | cross-mech | (SP) Scratch coincides with chord-tier notes (cross-domain pressure) | 425 | 6.3% |
| `impossible_scratch` | cross-mech | (DP) Same-side $S$ + far keys (1P KEY4-7 / 2P KEY1-4) chord-tier exact (reads unplayable; cleared one-handed by a staggered timing-split within the judgment window) | 130 | 7.0% DP |
| `adjacent_scratch` | cross-mech | (DP) Same-side $S$ + near keys (1P KEY1-3 / 2P KEY5-7) chord-tier exact (awkward one-hand chord) | 103 | 5.6% DP |
| `bilateral_scratch` | cross-mech | (DP) ≥3 scratches per side in same measure, count ≥ 5 | 39 | 2.1% DP |
| `long_scratch` | scratch | Sustained Long-Scratch (wheel-hold) presence above floor | 385 | 5.7% |
| `flow_break` | jack | Jacks interrupt running streams at a high rate | 348 | 5.2% |
| `extreme_burst` | density | Off-base BPM burst severity very high (BPM-scaled) | 160 | 2.4% |
| `double_tab` | jack (keysound) | Same `#WAV` id 2-chain repetition present (§8.1) | 92 | 1.4% |
| `jack_chart` | jack | Pure-jack rate per second exceeds threshold (isolated jack, outside streams) | 83 | 1.2% |
| `complex_long_scratch` | scratch | Long Scratch embedded in other scratch context (not isolated) | 61 | 0.9% |
| `triple_tab` | jack (keysound) | Same `#WAV` id 3+ chain repetition present (§8.1) | 57 | 0.9% |
| `visual_gimmick` | gimmick | High soflan max-intensity ≥ 5.0 AND off_base_note_count ≥ 4 | 54 | 0.8% |
| `advanced_ln` | ln | LN technical composite (short-hold transition, stacked LN chord, irregular scatter) | 0 | 0.0% |
| `peak_outlier` | peak | Peak axis red AND sustained — high peak that doesn't cluster | 0 | 0.0% |

### D. Corpus statistics

**Total charts**: 8,555 (SP 6,703 / DP 1,852)

**Family distribution** (family ラベル付きチャートのみ — ラベルなしチャートも依然としてフレームワークで分析されるが、この分布からは除外される)

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

family ラベルのないチャート (no-family) は、キュレーションされた分類から除外されたチャート (個人 mod、未リリース、未割り当て) である。これらはフレームワーク分析には残るが、family 相対比較からは除外される。

**IRT data**: PL3 SP IRT 結果 (6,103 charts) から、`Low-sample low-confidence flag = False` の行のみが使われる — チャートサマリーと join した後、5,371 charts が §2.5 の分析を裏付ける。

**Mode separation**: すべての metric calibration と threshold は mode 別 (SP / DP) で計算される。Cross-mode 比較は意図されていない (SP 8-key と DP 16-key は異なる lane メカニックを持つ)。
