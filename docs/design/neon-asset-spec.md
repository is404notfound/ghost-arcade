# Ghost Arcade — 네온 세기말 에셋 생산 명세 & 생성 프롬프트

> 방향 **A · 세기말 노을 (Synthwave Apocalypse)** 확정본.
> 외부 AI 에셋 생성 플랫폼에 그대로 붙여 쓰는 프롬프트 + Phaser 통합 제약을 한 문서에 묶었다.
> 비교 시안: `docs/design/neon-board.html` (브라우저로 열기)

---

## 0. 한 줄 컨셉

> 마젠타 노을이 타오르는 무너진 도시. 붉은 행성 같은 메테오가 떨어지고, 일본어 네온 간판(시티팝)이 명멸하는 거리를 **시안 네온의 후드 라이더가 오토바이로 질주**한다. 발로 뛰는 **죽은 라이벌(헤일로 고스트)**을 추월하며, 배경 속도선과 빛 트레일이 **속도감**을 만든다. **도형+파티클 미니멀**, 어둡고 고대비, 절제된 블룸.

**디자인 북극성: "한 판 더" — 모든 비주얼은 추월·신기록·피버의 쾌감을 증폭해 재시도를 유도한다(§7 참조).**

---

## 1. 전역 규칙 (모든 에셋 공통 — 위반하면 게임에 못 씀)

| 규칙 | 값 | 왜 |
|---|---|---|
| 논리 해상도 | **1040 × 480 (19.5:9 가로)** | Phaser `Scale.FIT` 기준 좌표계. 모든 게임 풋프린트는 이 px. |
| 소스 제작 배율 | **@3x 권장(@2x 최소)** | 레티나 폰 선명도. 30×42 캐릭터 → 소스 90×126로 그린 뒤 축소. |
| 배경 | **투명 PNG (RGBA-32)** | 스프라이트 합성·글로우 오버랩 때문에 흰/검 배경 불가. |
| 색 공간 | sRGB | WebView 색 일관성. |
| 좌표 원점(anchor) | 캐릭터·건물 = **하단 중앙**, 연료통 = **정중앙** | 바닥(y=432)에 발이 닿게 정렬. 명세에 origin 표기. |
| 히트박스 = 게임 풋프린트 | 아래 표의 "풋프린트 px" | **글로우/안테나/연기는 풋프린트 밖으로 넘쳐도 됨. 단 충돌은 직사각형 풋프린트로만 판정.** 즉 장식은 자유, 게임 박스는 고정. |
| 결정론 분리 | "장식" 표기 에셋은 **렌더 전용** | 메테오·패럴랙스·창문 점멸은 sim에 절대 닿으면 안 됨(고스트 리플레이 결정론). |
| 성능 예산 | 저사양 폰 60fps | 장애물 풀 16개·포션 8개 동시. 에셋은 가볍게, 블룸은 절제. |

추천 제작 파이프라인: **투명 PNG @3x 생성 → 여백 트림 → TexturePacker로 아틀라스(.png + .json) 묶기 → Phaser `load.atlas`**. 기하학적 조각(태양/건물/그리드)은 가능하면 **SVG**로 받으면 무손실·초경량.

---

## 2. 컬러 토큰 (이 hex로 통일 — 프롬프트에 그대로 사용)

| 토큰 | hex | 용도 |
|---|---|---|
| `sky.top` | `#170a2e` | 하늘 상단(딥 인디고) |
| `sky.mid` | `#3a0f44` | 하늘 중단(퍼플) |
| `sky.low` | `#6b1248` | 지평선(마젠타-퍼플) |
| `sun.hot` | `#ffd36e → #ff5fa2 → #b3247e` | 레트로 선(상→하 그라데이션) |
| `neon.cyan` | `#36f9f6` | 건물 외곽선 / 바닥 그리드 / 시안 네온 |
| `player.fill` | `#5efce8` (하이라이트 `#cafff8`) | 플레이어 |
| `ghost.violet` | `#b39ddb` (alpha 0.22) | 고스트(발로 뛰는 죽은 라이벌) |
| `halo.gold` | `#ffe9a8` / `#ffd700` | 고스트 머리 위 천사 헤일로(죽음 표식) |
| `fuel.blue` | `#4dabf7` (하이라이트 `#9fd4ff`) | 연료통(회복=주유, 보상) — **색은 일부러 쿨 블루 유지**(위험 마젠타와 반대축) |
| `danger.magenta` | `#ff5fa2` / `#ff6fb0` | 건물 창문 / 위험 신호 |
| `meteor` | `#ffe9a8` 코어 → `#ff7a3c` → `#d62828` | 붉은 행성/운석 + 화염 꼬리 |
| `trail.cyan` | `#5efce8` (alpha 0.4~0.6) | 오토바이 빛 트레일 / 속도선 |
| `hp.green/warn/low` | `#2ecc71 / #f1c40f / #ff4757` | 체력바(현행 유지) |
| `fever.gold` | `#ffd700` | 피버 연출(현행 유지) |

게임플레이 4색(플레이어 시안 / 고스트 바이올렛 / 연료 블루 / 위험 마젠타)은 **절대 서로 닮게 만들지 말 것.** 색이 곧 "피할 것 vs 먹을 것" 정보다. **연료통을 "주유 = 회복"으로 바꿔도 색은 블루 유지** — 빨간 주유통(현실)으로 그리면 위험 마젠타와 헷갈려 가독성이 무너진다(보상은 쿨, 위험은 따뜻 축).

---

## 3. 필요한 에셋 목록

| ID | 용도 | 풋프린트(게임 px) | 권장 소스(@3x) | 포맷 | 레이어/스크롤 | 결정론 | 애니 | 코드 대체 |
|---|---|---|---|---|---|---|---|---|
| `bg-sky` | 하늘 그라데이션 | 1040×480 | — | (코드 권장) | L0 / 고정 | 장식 | 없음 | ✅ 코드 그라데이션 추천 |
| `bg-sun` | 레트로 선(노을 태양) | ~360×220 | 1080×660 | PNG/SVG | L1 / 미세 | 장식 | 없음 | 부분 |
| `bg-skyline-far` | 먼 도시 실루엣(데코 타워) | 1040×200, **가로 심리스** | 3120×600 | PNG | L2 / 느림 | 장식 | 창문 점멸은 코드 | 부분 |
| `bg-skyline-mid` | 중경 스카이라인(선택) | 1040×240, **가로 심리스** | 3120×720 | PNG | L3 / 중간 | 장식 | — | 선택 |
| `fx-meteor` | 붉은 행성/운석 덩어리(대·중·소) + 화염 꼬리 | 대~36 / 중~20 / 소~13 | 3배 | PNG | L1.5 / 렌더 | **장식** | 낙하 트윈/에미터 | 부분 |
| `signage-jp` | 일본어 네온 간판(세로·가로) 세트 | 가변 | 3배 | PNG/SVG | L2~L3 / 패럴랙스 | **장식** | 점멸=코드 | 부분 |
| `ground-grid` | 바닥 네온 그리드/지평선 | 1040×48, 가로 심리스 | 3120×144 | PNG/SVG | L4 / 월드속도 | 장식 | — | ✅ 코드 추천 |
| `player-rider` | 후드 라이더 + 네온 오토바이 | **히트박스 30×42**(아트 ~56폭 overhang) | 168×126 | PNG 아틀라스 | 게임 | sim | ride/jump/hit/dead | 부분 |
| `fx-trail` | 오토바이 빛 트레일/배기 잔상 | ~60×24 | 3배 | PNG | 게임 뒤/렌더 | **장식** | 깜빡임=코드 | ✅ 코드 가능 |
| `ghost-runner` | 발로 뛰는 고스트(+헤일로) | **30×42** (origin 하단중앙) | 90×126 | PNG 아틀라스 | 게임 | sim | run 6프레임 | 부분 |
| `building-kit` | 건물 장애물(가변 높이) | 폭 **32**, 높이 50–120 | 폭 96, 타일 단위 | PNG/SVG 9-slice | 게임 | sim | 창문 점멸=코드 | 부분 |
| `fuel-can` | 연료통(회복=주유) | **26×26** | 78×78 | PNG | 게임 | sim | 2프레임 점멸 | 부분 |
| `fx-speedlines` | 배경/전경 속도선(움직이는 배경) | 가로 심리스 | — | (코드 권장) | L1.5·L4 / 렌더 | **장식** | 좌측 스크롤 | ✅ 코드 추천 |
| `fx-particles` | +HP·제침·콤보·니어미스 스파크 | ~16×16 | 48×48 | PNG | FX | 장식 | 에미터 | 부분 |
| `hud-font` | HUD/콤보 디스플레이 폰트 | — | — | 웹폰트(woff2) | UI | — | — | 폰트 선택 |

> **코드로 두는 게 이득인 것**: `bg-sky`(그라데이션), `ground-grid`·`fx-speedlines`(라인 스크롤), `fx-trail`. 이미지로 만들면 용량·관리만 늘고 60fps에 불리. **외부 생성은 라이더+오토바이·고스트 러너·건물·태양·메테오·간판·파티클에 집중.**
> **고스트는 더 이상 플레이어 재사용 불가** — 플레이어는 오토바이, 고스트는 발로 뛰므로 별도 러너 에셋이 필요. 대신 고스트 러너 1종으로 모든 고스트(보라 틴트+헤일로)를 커버.

---

## 4. 에셋별 상세 + 생성 프롬프트 (영문 그대로 붙여넣기)

각 항목: ① 게임 제약 ② 생성 프롬프트(영문) ③ 네거티브 프롬프트.
모든 프롬프트 공통 접두 스타일 키워드:
`synthwave apocalypse, minimal neon, dark high-contrast, restrained bloom glow, flat vector-like shapes, transparent background, game asset`

### 4.1 `player-rider` — 후드 라이더 + 네온 오토바이 (단일 캐릭터, 확정)

- **컨셉**: 후드 쓴 라이더가 시안 네온 오토바이를 타고 앞으로 숙여 질주. 스카프가 뒤로 흩날리고 뒤꽁무니에 빛 트레일이 끌린다. 측면(side) 뷰. 오토바이 = 발로 뛰는 고스트보다 **빠르다는 우월감**을 시각적으로 전달 → "추월의 쾌감" 강화.
- **★ 히트박스 주의(중요)**: sim 충돌 박스는 여전히 **30×42(세로형) 고정**. 그런데 오토바이는 가로로 길다. → **아트는 박스보다 넓게(약 56px) overhang 허용하되, 충돌 박스를 라이더 몸통+앞바퀴 쪽(앞쪽)에 정렬**한다. 꼬리(뒷바퀴·트레일)는 박스 왼쪽 밖으로 빼서, "보이는데 안 맞는" 불공정 충돌을 피한다. origin은 **하단 중앙(앞바퀴 접지 기준)**, 바퀴가 바닥선(y=432)에 닿게.
- **색**: 오토바이 본체 시안 `#5efce8`, 라이더 하이라이트 `#cafff8`. 얼굴 디테일 없음(원거리 30px).
- **필요 프레임/컷**: `ride`(기본 주행 1~2, 바퀴 모션블러 글로우), `jump-up`·`jump-down`(버니홉 — 앞바퀴 들림), `hit`(1, 깜빡임은 코드), `dead`(라이더가 오토바이에서 이탈해 헤일로 다는 컷 — §7 죽음 루프). 균일 프레임, 바퀴 접지 baseline 일치.

```
Prompt:
A minimal neon hooded rider on a sleek futuristic motorcycle, side view facing right, rider
leaning forward low over the bike for speed, hood up and a scarf streaming backward, glowing
cyan (#5efce8) neon outline with lighter cyan (#cafff8) highlights on the rider, a short light
trail behind the rear wheel, wheels with subtle motion-blur glow, no facial detail, strong
readable silhouette, restrained outer glow, synthwave city-pop apocalypse, flat vector-like,
transparent background, side profile, game character asset, wheels resting on a common ground
baseline.
```
```
Negative: text, watermark, white background, ground shadow, realistic, 3D render, busy detail,
multiple bright colors, chrome reflections overload, photo, gradient background, face close-up,
rider standing, car, three wheels
```

> 추가 컷(동일 스타일·동일 baseline·동일 글로우): `jump`(앞바퀴 들린 버니홉), `dead`(라이더가 튕겨 나가 머리 위 골드 헤일로가 생기는 1컷 — 죽으면 "나도 고스트가 된다"는 루프의 핵심 비주얼).

### 4.1.1 `ghost-runner` — 발로 뛰는 헤일로 고스트 (죽은 라이벌)

- **컨셉**: 오토바이가 아니라 **맨몸으로 달리는** 러너. 머리 위 **골드 천사 헤일로**가 "이미 죽은 기록"임을 한눈에 알린다. 보라 `#b39ddb` + 알파 0.22로 반투명. 같은 러너 1종으로 모든 고스트를 커버(틴트/알파로 다수 표현).
- **제약**: 풋프린트 30×42, origin 하단 중앙. 헤일로는 박스 위로 떠도 됨(장식). 실루엣은 라이더(오토바이)와 **확연히 달라야** 함 — 그래야 "나(탈것) vs 죽은 자들(도보)"이 즉시 구분된다.
- **필요 프레임**: `run`(6 루프) + 헤일로(별도 레이어로 두면 코드에서 점멸/상하 부유 가능).

```
Prompt:
A minimal neon ghost runner for a side-view endless runner, full body mid-run facing right,
plain athletic silhouette running on foot, glowing soft violet (#b39ddb) translucent neon, a
small glowing golden angel halo ring floating above the head, no facial detail, ethereal and
semi-transparent, restrained glow, synthwave apocalypse, flat vector-like, transparent
background, a horizontal 6-frame run-cycle sprite sheet, feet aligned to a common baseline,
side profile, game character asset.
```
```
Negative: text, watermark, white background, ground shadow, motorcycle, vehicle, solid opaque
body, realistic, 3D, photo, scary ghost sheet, wings, face detail
```

### 4.2 `building-kit` — 건물 장애물 (가변 높이의 핵심 난제)

- **제약**: 폭 **정확히 32px**, 높이 50–120 연속 가변. 단순 세로 스트레치는 창문이 늘어나 깨짐. → **수직 9-slice / 타일 구조**로 받는다: `cap`(옥상+안테나, 고정 높이) + `floor`(세로로 반복되는 1층 단위, 창문 2열) + `base`(바닥 접지). 스폰 때 floor를 N번 반복해 높이 맞춤.
- 다크 필 `#0d0618` + 시안 외곽선 `#36f9f6` + 창문 마젠타/시안. 창문 점멸은 코드(틴트 토글). 3~4개 아키타입(폭은 동일, 옥상 실루엣·창문 패턴만 변형)으로 다양성.

```
Prompt (building cap):
Top section of a narrow neon skyscraper, exactly 32 px wide game footprint, rooftop with a
thin antenna and a small blinking beacon, dark fill (#0d0618), glowing cyan (#36f9f6) outline,
synthwave apocalypse, minimal flat shapes, transparent background, vertical tile (top cap),
seamless bottom edge to stack onto floor tiles, side view.
```
```
Prompt (building floor tile, vertically repeatable):
A single repeatable floor segment of a narrow neon skyscraper, 32 px wide, dark body (#0d0618),
glowing cyan (#36f9f6) thin outline on left and right edges only, two columns of small lit
windows (magenta #ff5fa2 and cyan #36f9f6 alternating), top and bottom edges seamless for
vertical tiling, minimal flat, transparent background, side view, no rooftop, no ground.
```
```
Negative: perspective distortion, 3D, isometric, wide building, ground/street, sky, text,
white background, realistic bricks, heavy detail, people, cars
```

> 9-slice가 외부 툴에서 어려우면 대안: **고정 높이 건물 4종(50 / 75 / 100 / 120px)을 통짜 PNG로** 받고 스폰 시 그중 선택. 더 단순하지만 높이 다양성이 4단계로 제한됨.

### 4.3 `bg-sun` — 레트로 선(노을 태양)

- **제약**: 화면 중앙-후경, 지평선(y≈432)에 반쯤 잠긴 반원. 가로 스캔라인 갭(클래식 신스웨이브 선). 글로우 큼. L1 레이어, 거의 고정.

```
Prompt:
A retro synthwave sun, large circle, vertical gradient from warm yellow (#ffd36e) through hot
pink (#ff5fa2) to deep magenta (#b3247e), classic horizontal scanline gaps cutting the lower
half, soft outer glow, centered, transparent background, flat minimal, no landscape, no ground,
80s synthwave aesthetic.
```
```
Negative: realistic sun, lens flare photo, text, white background, clouds, faces, 3D
```

### 4.4 `bg-skyline-far` — 먼 도시 실루엣 (가로 심리스 타일)

- **제약**: **좌우 끝이 이어지는 심리스 타일**(루프 스크롤). 거의 단색 실루엣 `#1b0c33`, 드문 마젠타 창문 점. 디테일 최소(원경). 패럴랙스 느린 레이어. 메테오·플레이어 가독성을 해치지 않게 어둡게.

```
Prompt:
A distant city skyline silhouette for a horizontal parallax background, far away, very dark
indigo (#1b0c33) flat silhouette of varied skyscraper heights, a few faint magenta (#ff6fb0)
lit window dots, minimal, low detail, seamless tileable horizontally (left edge matches right
edge), wide panoramic strip, transparent background above the skyline, synthwave night,
no foreground, no ground.
```
```
Negative: detailed buildings, bright, daytime, text, watermark, foreground objects, people,
non-tileable, gradient sky baked in
```

### 4.4.1 `signage-jp` — 일본어 네온 간판 (시티팝 핵심 요소)

- **제약**: 시티팝/쇼와 레트로 네온 감성. **건물 측면 세로 간판 + 먼 배경 가로 간판** 세트. 카나/칸지. 마젠타·시안·앰버 네온 글로우. 장식(렌더 전용), 패럴랙스 레이어. **플레이 레인(하단)을 가리지 않게 상단/원경에 배치.** 점멸은 코드 틴트.
- **저작권 안전**: 실제 상호·브랜드·로고 금지. 일반 명사형 가공어 사용 — 예: `夜光酒場` `電脳ホテル` `ナイトシティ` `終末` `ネオン` `音楽` `バー` `酒`.
- 구현: 간판 5~8종을 **개별 PNG/SVG**로 받아 배경에 흩뿌리거나, 일본어 웹폰트 + 코드 렌더(보드처럼). 스프라이트가 글로우·튜브 질감 면에서 더 city-pop스러움.

```
Prompt:
A set of vintage Japanese neon shop signs, Showa-era city-pop aesthetic, both vertical and
horizontal layouts, katakana and kanji glyphs, glowing neon tubes in magenta (#ff5fa2), cyan
(#36f9f6) and amber (#ffd36e), small dark mounting plates, separate individual sign elements
arranged on a sheet, soft glow, minimal, transparent background, retro Tokyo night,
game background decoration. Use generic words only (no real brands).
```
```
Negative: real brand names, real logos, English text, latin letters, watermark, people, photo,
white background, daytime, cluttered street
```

### 4.5 `fx-meteor` — 붉은 행성/운석 메테오 (★ 정정: 별똥별 ❌ → 행성 덩어리 ⭕)

- **제약**: **가는 별똥별 스트릭이 아니라 붉은 행성처럼 묵직한 운석 덩어리.** 구형 + 가열된 림(연노랑 코어 → 주황 → 적 → 어두운 가장자리) + 미세 크레이터 + 뒤로 끌리는 **화염 꼬리**. 사선 낙하, 렌더 전용. **대/중/소 3종**을 받아 깊이감(큰 건 가깝게·느리게, 작은 건 멀게·빠르게). 동시 노출 **2~3개**로 제한 — 너무 많으면 종말감↑이지만 플레이 가독성↓.

```
Prompt:
A falling meteor that looks like a small molten red planet, spherical and chunky, glowing hot
rim, radial gradient from pale-yellow core highlight (#ffe9a8) through orange (#ff7a3c) to deep
red (#d62828) and dark edge (#7a0f12), a few subtle dark craters, a fiery orange tail streak
trailing behind it on a diagonal, synthwave apocalypse, minimal, soft outer glow,
transparent background, game asset. Provide three sizes: large, medium, small.
```
```
Negative: thin shooting star, hairline streak, tiny spark, white core, cartoon star,
text, white/black background, photo, smoke-only, asteroid field
```

### 4.6 `fuel-can` — 연료통 (회복=주유, 보상) ★ 포션 대체

- **컨셉**: 오토바이가 주인공이니 회복 아이템도 **연료통(제리캔)**으로 통일 → "달리려면 기름이 필요하다"는 테마 일관성. 먹으면 HP 회복 = 주유.
- **제약**: 풋프린트 **26×26**, 정중앙 origin. **색은 쿨 블루 글로우(`#4dabf7` / 하이라이트 `#9fd4ff`) 유지** — 현실의 빨간 주유통이 아니라, 위험(마젠타)과 반대축인 시안-블루 네온 캔. 캔 옆면에 작은 연료 방울/번개 픽토그램으로 "에너지"임을 암시. 실루엣은 위에서 봐도 사각 캔으로 즉시 식별. 2프레임 점멸(코드 트윈으로도 충분).

```
Prompt:
A small neon fuel jerrycan power-up for a side-view game, compact rectangular fuel canister
with a top handle and a short spout, dark body (#0a2740) with a glowing cool blue (#4dabf7)
neon outline and lighter cyan (#9fd4ff) highlight, a small glowing fuel-drop / energy symbol
on the side panel, soft radial glow halo, minimal flat vector style, centered, transparent
background, game item asset, slight pulse.
```
```
Negative: red canister, realistic gas can, oil drum, bottle, liquid splash, label text, words,
magenta, white background, realistic metal, 3D render, photo
```

### 4.7 `fx-particles` — +HP / 제침 / 콤보 파티클

- **제약**: 16×16 내외 작은 점/스파클. 색은 코드 틴트(연료=블루, 제침=바이올렛, 콤보=골드). 단일 흰색/소프트 텍스처 1~2종이면 충분.

```
Prompt:
A small soft round spark particle, white center with soft falloff, simple bokeh dot,
transparent background, for tinting in-engine, minimal, game particle.
```
```
Negative: colored, text, shape detail, white/black background, star shape outline
```

### 4.8 `hud-font` — HUD/콤보 폰트 (생성 아님, 선택)

- 네온 모노/디스플레이 추천: **Orbitron, Rajdhani, Audiowave** 등(woff2). 한글 HUD("일시정지", "제침") 있으므로 **한글 글리프 포함 폰트** 별도 지정 필요(예: 본고딕/Pretendard) — 네온 디스플레이 폰트는 라틴/숫자만 적용, 한글은 가독 폰트로 폴백.

### 4.9 `fx-speedlines` + `fx-trail` — 속도감 / 움직이는 배경 (대부분 코드)

- **움직이는 배경**: 패럴랙스 레이어를 **항상 좌측으로 스크롤**시키되 속도를 `sim` 스크롤 속도(거리/피버)에 **읽기 전용으로 연동**(렌더 전용, 결정론 무영향). 레이어별 속도 배수: 먼 스카이라인 0.2x, 간판 0.4x, 속도선 1.0x, 전경 러시 1.4x → 깊이감.
- **속도선(`fx-speedlines`)**: 얇은 수평 스트릭이 화면을 가로질러 흐른다. **간격=프레임당 이동량**으로 두면 무한 루프(보드의 `@keyframes rush` 참고). 배경은 은은하게(시안/마젠타 저투명), 지면 근처 전경은 더 굵고 빠르게(`#cafff8`). **코드로 구현 권장**(에셋 불필요).
- **빛 트레일(`fx-trail`)**: 오토바이 뒷바퀴에서 뻗는 잔상. 코드(가산 블렌드 라인 몇 개 + 깜빡임)로 충분. 굳이 에셋이면 ~60×24 소프트 스트릭 PNG.
- **피버 가속 연출**: 피버(2.5배속) 시 속도선 밀도·길이↑ + 화면 가장자리 모션 스트릭 비네트. 종말감과 속도감을 동시에 폭발.

> 속도감은 "에셋"보다 **코드 연출**의 비중이 큼. 외부 생성으로 만들 건 거의 없고, GameScene 통합 단계에서 구현. 단, 라이더 빛 트레일/바퀴 모션블러는 캐릭터 에셋에 일부 포함시키면 정합이 좋다.

### 4.10 UI 상태 & 카피 (대부분 코드/텍스트 — 이미지 에셋 아님)

요청 반영: 시작 전 "내 최고 등수" + 사망 시 "YOU LOSE".

| 상태 | 내용 | 비고 |
|---|---|---|
| **시작 화면** | 직전 플레이 이력(로컬 저장)이 있으면 **`BEST RANK #N`**(내 최고 등수)을 크게 표시, 없으면 숨김. 그 아래 `TAP TO START`. | 최고 등수는 "다음엔 더 위로"의 비교 동기 → 재시도 훅(§7). 저장은 `localStorage`/WebView 저장소, sim 무관. |
| **사망 패널** | 기존 "Game Over" → **`YOU LOSE`** 로 변경. 아래 이번 판 등수/거리, **신기록이면 `NEW BEST` 강조**, `한 판 더?`(재시작) 버튼. | "Game Over"는 종결감, "YOU LOSE"는 **패배=설욕 욕구**를 자극해 재도전을 부른다. §7 사망→고스트화 연출과 함께. |

- **카피/숫자는 텍스트(웹폰트, §4.8)로 렌더 → 이미지 에셋 불필요.** 단 `YOU LOSE` 글자에 네온 글로우 셰이더/틴트만 코드로 입힘.
- **등수 데이터 출처**: 최고 등수는 종료 시점 `rank`의 최솟값(=가장 좋은 순위)을 저장. 저장/표시는 **렌더·UI 레이어**에서만, `sim` 결정론에 영향 없음.

---

## 5. 추천 확장자 & 정리

| 종류 | 권장 포맷 | 이유 |
|---|---|---|
| 스프라이트(캐릭터·포션·파티클·건물) | **PNG-32(RGBA) + 아틀라스 JSON** | 투명도 필수, 드로콜 절감(아틀라스). |
| 기하학 조각(태양·건물·그리드) | **SVG**(가능 시) → 없으면 PNG | 무손실·초경량·무한 선명. 미니멀 도형과 궁합. |
| 패럴랙스 배경 | **PNG(가로 심리스)** | 루프 스크롤. 네온 그라데이션은 JPG에서 밴딩→PNG. |
| 애니메이션 | **균일 프레임 스프라이트시트 PNG** 또는 코드 트윈 | 에셋 수↓, 60fps 유리. |
| 폰트 | **woff2** | 웹 최적. |
| 사운드(요청 시) | (이번 범위 외) | — |

제작 배율: 모든 래스터는 **@3x로 생성 → 트림 → 축소 임포트**. 풋프린트(30×42, 32×H, 26×26)는 게임 좌표, 소스는 그 3배.

---

## 6. 외부 생성 시 스타일 일관성 체크리스트

- [ ] 투명 배경(흰/검 배경 아님)으로 나왔는가
- [ ] 컬러 토큰(§2) hex를 벗어나지 않았는가 (특히 게임플레이 4색)
- [ ] 라이더(오토바이)와 고스트(도보+헤일로) 실루엣이 30px에서 확연히 구분되는가
- [ ] 건물이 폭 32 비율 + 수직 타일 이음매가 자연스러운가
- [ ] 메테오가 "붉은 행성/운석 덩어리(+화염 꼬리)"이지 가는 별똥별이 아닌가
- [ ] 연료통이 쿨 블루(빨간 주유통 아님)이고 위험 마젠타와 안 헷갈리는가
- [ ] 일본어 간판이 가공어인가(실제 상호·로고·영문 아님), 플레이 레인을 안 가리는가
- [ ] (워터마크/영문/드롭섀도 등) 불필요 요소가 끼지 않았는가
- [ ] 발/바닥 정렬용 baseline이 프레임마다 일치하는가

---

## 7. "한 판 더"를 만드는 리텐션 비주얼 (북극성)

보상(토큰)이 없으니 **재미와 쾌감만으로 재시도**를 만들어야 한다(`DESIGN.md` 전제 3). 비주얼의 임무는 단 하나: **추월·신기록·피버의 쾌감을 과장해서 손가락이 다시 화면을 두드리게 만드는 것.** 모두 기존 `sim` 이벤트(렌더 전용 트리거)에 얹는다.

| 순간 (sim 트리거) | 비주얼 훅 | 왜 재시도를 부르나 |
|---|---|---|
| **추월** (고스트 finished 전환) | 추월당한 고스트가 헤일로 번쩍 + 뒤로 빨려 사라짐, `제침!` 보라 버스트, 라이더 순간 가속 트레일 | "내가 이겼다"의 즉각적 도파민. 남은 고스트가 보이면 "하나 더" |
| **등수 상승** (rank↑) | 등수 텍스트 골드로 펀치 스케일, 1등 도달 시 화면 림 골드 글로우 | 순위는 가장 강한 비교 동기. 1등 직전이 가장 끈적함 |
| **콤보 상승** (combo↑) | 중앙 콤보 숫자 성장 + 화면 점점 따뜻해짐(피버 예고) | "조금만 더하면 피버" 기대감 누적 |
| **피버** (EV_FEVER_START) | 황금 플래시 + 속도선 폭발 + 무한점프 트레일, 메테오 더 붉게 | 게임 최고 쾌감 구간. 이걸 또 보고 싶게 |
| **니어미스** (건물 아슬 통과) | 건물 모서리 스파크 + 찰나 슬로우 플래시 | "방금 죽을 뻔" → 긴장의 쾌감, 손에 땀 |
| **연료통** (EV_POTION) | 블루 주유 링 + `+FUEL`/+HP 부유 | 작은 보상 리듬 |
| **사망→고스트화** (EV_GAME_OVER) | 라이더가 튕겨 나가 **골드 헤일로**를 달고 고스트가 됨 → "내 기록이 남들의 고스트가 된다" | **정체성 루프**: 죽음이 끝이 아니라 "다음 사람에게 남는 흔적". 다시 달릴 이유 |
| **결과 패널** | 박빙이면 `한 판 더?` 카피 + 신기록 시 도시가 번쩍, 직전 베스트 고스트가 부서지는 연출 | 박빙·신기록 직후가 재시도 전환율 최고점 |
| **데일리 시드** | 오늘의 시드 = 오늘의 하늘색/노을 톤 변주 | 매일 "오늘 코스"가 새로 보여 복귀 동기 |

**구현 원칙**: 위 전부 렌더 전용. `sim`은 손대지 않는다(결정론·고스트 리플레이 보존). 대부분 코드 연출 + `fx-particles` 텍스처 1~2종으로 커버. 사망→고스트화의 `dead` 컷만 캐릭터 에셋에 포함.

---

## 8. 통합 순서 (권장 파이프라인) — "값싼 것부터 검증"

> 핵심 원칙: **비싼 이미지 에셋을 만들기 전에, 코드로 그릴 수 있는 "룩+무빙"을 실게임에 먼저 입혀 감/가독성/60fps를 검증한다.** (graybox → 코드 스킨 → 에셋 스왑)

1. **[지금] 코드 스킨 패스** — `neon-board.html`에서 **코드로 구현 가능한 것**(하늘 그라데이션, 노을 선, 패럴랙스 스카이라인, 바닥 그리드, 속도선, 네온 외곽선, 메테오 낙하, 피버 틴트)을 `GameScene.ts`에 Phaser `Graphics`/파티클/트윈으로 이식. **이미지 에셋 0개.** 플레이어/고스트/건물/연료통은 지금처럼 도형이되 네온 외곽만 입힌다.
   - 왜: 이 레이어는 버려지는 프로토타입이 아니라 **실제 출고 렌더 레이어**(§4.9)다. 정지 보드로는 절대 안 보이는 것 — 실제 속도에서 가독성, 혼잡할 때 4색 구분, 저사양 60fps — 을 여기서만 검증할 수 있다. 결정론 경계(`sim.state` 읽기 전용)는 현행 코드와 동일하게 유지.
2. **[검증 후] 에셋 규격 확정** — 위에서 라이더 overhang 폭, baseline, 건물 타일 높이, 연료통 크기를 실측으로 못박는다. (지금 ChatGPT로 뽑으면 스케일/가독성 틀릴 때 재생성 비용↑)
3. **[그다음] 이미지 에셋 드롭인 스왑** — 도형 → PNG 아틀라스로 텍스처만 교체. 좌표/히트박스/연출 코드는 그대로.
4. **[마지막] 오디오 → (선택)인게임 영상 → 피버 폴리시** — §8.1~8.4.

> 결론: **에셋 본격 적용 전에 보드를 GameScene에 통합 테스트 — 강력 권장.** 단 "이미지 통합"이 아니라 "코드 스킨 통합"이다. 같은 노력이 곧 출고 코드가 된다.

### 8.1 오디오 — BGM / 효과음 (추적: 아직 미제작)

- **BGM**: 신스웨이브 루프 1곡(평시) + **피버용 레이어/템포업**(같은 곡 위에 얹거나 컷 전환). 짧은 seamless loop, 용량 최소.
- **SFX 목록**: 점프, 피격(EV_HIT), 연료통 획득(EV_POTION), 고스트 제침, 등수 상승, 콤보 틱, 콤보 브레이크, 피버 시작(EV_FEVER_START), 사망(EV_GAME_OVER), UI 탭, 니어미스. **전부 기존 sim 이벤트에 얹음**(렌더 전용).
- **포맷/제약**: `.webm/.ogg` + `.mp3` 폴백, 짧게·프리로드. **WebView 자동재생 정책**: 첫 사용자 제스처(탭) 후에만 오디오 컨텍스트 언락 → "TAP TO START" 시점에 unlock. 동시 재생/풀링으로 끊김 방지, 음소거 토글 제공.

### 8.2 카피 / 문구 (추적: 중앙화 필요)

- 현재 문구가 `GameScene.ts`에 하드코딩 분산(예: `GAME OVER`, `탭하여 재시작`, `FEVER!`, `클릭시 무한 회복!`). **한 곳(strings 모듈)으로 모아** i18n/톤 일관성 확보.
- 신규/변경: `GAME OVER → YOU LOSE`, 시작화면 `BEST RANK #N` / `TAP TO START`, 박빙 `한 판 더?`(기존). 전부 텍스트(웹폰트) → 이미지 에셋 불필요.

### 8.3 인게임 영상 — "언제 넣나" (답변)

- **정의**: 풀스크린/오버레이 동영상 클립(인트로, 피버 버스트, 사망→고스트화 시네마틱, 또는 동영상 배경).
- **타이밍 = 가장 마지막 폴리시, 그리고 "코드로 못 만드는 것"에만.** 순서상 1~3(코드 스킨→에셋 스왑)과 오디오가 끝나고 **성능 여유를 실측한 뒤** 얹는다.
- **배경엔 쓰지 말 것**: 스크롤 배경은 코드 패럴랙스가 동영상보다 가볍고, sim 속도(거리/피버)에 **읽기 전용 연동**돼 자연스럽다. 동영상 배경은 발열·디코드 부담·동기화 문제만 키운다(`DESIGN.md` 저사양 60fps 전제 위반 위험).
- **쓸 만한 후보**: 타이틀/어트랙트 루프, 사망→고스트화 1회성 컷. 단 이것도 **코드 연출 먼저** 시도하고 한계일 때만 영상.
- **제약**: 반드시 렌더 전용(결정론 무관), 번들 용량·메모리 주의, 실기기에서 디코드 스터터 테스트 필수.

### 8.4 피버타임 에셋 (추적: 대부분 코드, 일부 에셋)

- 피버는 게임 최고 쾌감 구간(§7) → **과장의 핵심.** 현재 코드: 황금 플래시 + warm 틴트 오버레이 + `FEVER!` 텍스트 + 무한점프 안내.
- **추가 연출(코드)**: 속도선 밀도·길이↑, 화면 가장자리 모션 비네트, 메테오 더 붉게/잦게, 1등 림 골드 글로우, 무한점프 트레일 강화, 콤보 숫자 발광.
- **에셋으로 뽑을 만한 것**: `FEVER` 로고타입 1종(또는 디스플레이 웹폰트로 대체), 골드 파티클(=`fx-particles` 틴트 재사용), 가장자리 비네트(코드 라디얼 그라데이션으로 대체 가능). → **신규 이미지 에셋은 최소 1종(로고타입) 정도**, 나머지는 코드.
