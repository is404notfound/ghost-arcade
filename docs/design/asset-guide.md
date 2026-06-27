# Ghost Arcade — 에셋 & 비주얼 마스터 가이드 (통합본)

> **이 문서가 단일 소스(Single Source of Truth)다.** 이전의 `neon-asset-spec.md` /
> `asset-prompts-gptimage.md` / `rework-2026-visual.md` 3종을 하나로 통합·최신화했다.
> 시각 시안(브라우저 미리보기)만 `docs/design/neon-board.html`에 남는다.
>
> 방향: **A · 세기말 노을 (Synthwave Apocalypse).**
> 외부 AI 생성 프롬프트 + Phaser 통합 제약 + 현재 구현 상태를 한 곳에 묶었다.

---

## 0. 한 줄 컨셉 & 북극성

> 마젠타 노을이 타오르는 무너진 도시. 붉은 화염 메테오가 떨어지고, 일본어 네온 간판(시티팝)이
> 명멸하는 거리를 **시안 네온의 후드 라이더가 오토바이로 질주**한다. 발로 뛰는 **죽은 라이벌
> (헤일로 고스트)**을 추월하며 배경 속도선·빛 트레일이 속도감을 만든다. **도형+파티클 미니멀**,
> 어둡고 고대비, 절제된 블룸.

**디자인 북극성: "한 판 더".** 모든 비주얼은 추월·신기록·피버의 쾌감을 증폭해 재시도를 유도한다(§7).

---

## 1. sim ↔ 렌더 경계 — "무엇을 언제 고쳐도 되는가"

| 레이어                | 위치                         | 성격                                               | 고치면?                                                   |
| --------------------- | ---------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| **sim (결정론 코어)** | `src/sim/`                   | 같은 입력 → 같은 결과. 고스트 재생/리더보드의 토대 | **`SIM_VERSION`이 올라 기존 고스트·리더보드 전부 무효화** |
| **렌더 레이어**       | `src/render/GameScene.ts` 등 | `sim.state`를 **읽기만** 함. 게임 로직 없음        | **버전 무관 → 고스트 안 깨짐, 언제든 자유**               |

**핵심:** 에셋/연출/UI는 거의 전부 렌더라 자유롭게 작업해도 고스트가 안 깨진다.
딱 하나 — **장애물 충돌 폭 `OBS_W=32`, 높이 50~120(`constants.ts`)은 sim.** 외형(텍스처)만
바꾸고 히트박스는 그대로 두면 버전 무관으로 안전하다. 물리 폭까지 바꾸면 SIM_VERSION 업(피한다).

---

## 2. 전역 규칙 (모든 에셋 공통 — 위반하면 게임에 못 씀)

| 규칙                | 값                                               | 왜                                                                              |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| 논리 해상도         | **1040 × 480 (19.5:9 가로)**                     | Phaser `Scale.FIT` 기준 좌표계. 모든 풋프린트는 이 px.                          |
| 바닥선              | **y = 432 (`GROUND_Y_PX`)**                      | 캐릭터·건물 발이 닿는 baseline.                                                 |
| 소스 제작 배율      | **@3x 권장(@2x 최소)**                           | 레티나 폰 선명도. 30×42 캐릭터 → 소스 90×126로 그린 뒤 축소.                    |
| 배경                | **투명 PNG (RGBA-32)**                           | 글로우 오버랩 합성 때문에 흰/검 배경 불가.                                      |
| 원점(anchor)        | 캐릭터·건물 = **하단 중앙**, 연료통 = **정중앙** | 바닥에 발이 닿게 정렬.                                                          |
| 히트박스 = 풋프린트 | 아래 표 px                                       | **글로우/안테나/불꽃/연기는 풋프린트 밖으로 넘쳐도 됨. 충돌은 직사각형으로만.** |
| 결정론 분리         | "장식" 표기 = **렌더 전용**                      | 메테오·패럴랙스·창문 점멸은 sim에 절대 닿지 않음.                               |
| 성능 예산           | 저사양 폰 60fps                                  | 장애물 풀 16·포션 8 동시. 에셋 가볍게, 블룸 절제.                               |

추천 파이프라인: **투명 PNG @3x 생성 → 여백 트림 → (애니는) 균일 프레임 시트 → Phaser 로드.**
기하학 조각(태양·그리드 등)은 가능하면 **코드 드로우**가 무손실·초경량.

---

## 3. 컬러 토큰 (이 hex로 통일 — 프롬프트에 그대로 사용)

| 토큰                | hex                                                            | 용도                                                      |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `sky.top`           | `#170a2e`                                                      | 하늘 상단(딥 인디고)                                      |
| `sky.mid`           | `#3a0f44`                                                      | 하늘 중단(퍼플)                                           |
| `sky.low`           | `#6b1248`                                                      | 지평선(마젠타-퍼플)                                       |
| `sun.hot`           | `#ffd36e → #ff5fa2 → #b3247e`                                  | 레트로 선(상→하 그라데이션)                               |
| `neon.cyan`         | `#36f9f6`                                                      | 건물 외곽선 / 바닥 그리드 / 시안 네온                     |
| `player.fill`       | `#5efce8` (하이라이트 `#cafff8`)                               | 플레이어                                                  |
| `ghost.violet`      | `#b39ddb` (alpha ~0.5 표시)                                    | 고스트(발로 뛰는 죽은 라이벌)                             |
| `halo.gold`         | `#ffe9a8` / `#ffd700`                                          | 고스트 머리 위 천사 헤일로(죽음 표식)                     |
| `fuel.blue`         | `#4dabf7` (하이라이트 `#9fd4ff`)                               | 연료통(회복=주유). **쿨 블루 유지**(위험 마젠타와 반대축) |
| `danger.magenta`    | `#ff5fa2` / `#ff6fb0`                                          | 창문 / 위험 신호                                          |
| `fire.hot`          | `#ffe9a8` 코어 → `#ff7a3c` → `#d62828` (어두운 엣지 `#7a0f12`) | 메테오·불꽃 장애물                                        |
| `laser.red`         | `#ff4757` / `#ff6b81`                                          | 배경 경고 레이저                                          |
| `hp.green/warn/low` | `#2ecc71 / #f1c40f / #ff4757`                                  | 체력바                                                    |
| `fever.gold`        | `#ffd700`                                                      | 피버 연출                                                 |

> **게임플레이 4색**(플레이어 시안 / 고스트 바이올렛 / 연료 블루 / 위험 마젠타)은 **절대 닮게
> 만들지 말 것.** 색이 곧 "피할 것 vs 먹을 것" 정보다. 위험·불은 따뜻한 축(주황·마젠타),
> 보상(연료)은 차가운 축(블루)으로 고정.

---

## 4. 마스터 에셋 리스트 + 현재 구현 상태

> ✅구현완료 / 🟡에셋대기(코드 스톱갭 있음) / ⬜미착수 / 💠코드드로우(이미지 불필요)

| ID                                                      | 무엇                             | 풋프린트(게임 px)                  | 상태 | 비고                                                                 |
| ------------------------------------------------------- | -------------------------------- | ---------------------------------- | ---- | -------------------------------------------------------------------- |
| `player-rider`                                          | 후드 라이더+네온 오토바이        | 히트박스 30×42 (아트 ~56 overhang) | ✅   | ride/jump/hit/dead 컷. 글로우=코드 postFX                            |
| `ghost-runner`                                          | 발로 뛰는 헤일로 고스트          | 30×42                              | ✅   | **6프레임 시트**(`ghost-run.png`), 런타임 랜덤 위상·속도             |
| `ghost-collapse` (3프레임)                              | **기록 종료 시 엎어지는 고스트** | 420×320×3                          | ✅   | 전용 3프레임 적용(비틀→무릎→엎어짐). prep-ghost-collapse.py → §5.2B |
| `fuel-can`                                              | 연료통(회복=주유)                | 26×26                              | ✅   | 쿨 블루. 빨간 주유통 ❌                                              |
| `building-kit`                                          | 네온 건물                        | 폭 32, 높이 50–120                 | ⚠️   | **장애물 폐기**(아래 5종으로 전환). 스카이라인 참고용만             |
| `obs-car` / `obs-debris`                                | **부서진 차 / 잔해더미**(낮고넓음) | 높이=히트박스, 폭 클램프 40–150  | ✅   | `obstacles.png` 3분할 → prep-obstacles2.py. 높이 ≤80 출현            |
| `obs-barrel`                                            | **불타는 드럼통**(중간)          | 높이=히트박스, 종횡비 유지         | ✅   | `obstacles.png` 3분할. 높이 80–120 출현                              |
| `flame-pilar-1` / `flame-pilar-2`                       | **불기둥**(높음, 2종)            | 높이=히트박스, 폭 클램프 ≥40       | ✅   | 흰배경 제거 → prep-obstacles2.py. TALL(>120) 출현                    |
| `hp-bar` (frame/fill/icon)                              | 체력바 HUD                       | 272×24 외                          | ⬜   | **프롬프트 작성됨** → §5.7 (현재 코드 사각형)                        |
| `bg-sun`                                                | 레트로 선(노을 태양)             | ~360×220                           | 💠   | **코드 드로우**(`updateCodeSun`) — 일렁임 애니 포함, 이미지 제거됨   |
| `fx-meteor`                                             | 화염 메테오                      | —                                  | 💠   | **코드 드로우**(`drawCodeMeteor`) — 동시 1개로 제한                  |
| `fx-obstacle-smoke`                                     | 장애물 연기/불빛(타입별)         | —                                  | 💠   | **코드 드로우**(`drawObstacleSmoke`) — 웨이브 연기 선 + 맥동 베이스 글로우 + 불 타입 깜빡이는 코어/스프라이트 흔들림 |
| `fx-laser`                                              | 배경 경고 레이저                 | —                                  | 💠   | **코드 드로우**(`drawLasers`) — 태양 뒤 사선 스윕                    |
| `signage-jp`                                            | 일본어 네온 간판 세트            | 가변                               | ✅   | 배경 패럴랙스 데코                                                   |
| `bg-skyline-far`                                        | 먼 도시 실루엣                   | 가로 심리스                        | 💠   | 코드 드로우(`drawSkyline`)                                           |
| `bg-sky` / `ground-grid` / `fx-speedlines` / `fx-trail` | 하늘·바닥그리드·속도선·트레일    | —                                  | 💠   | 코드 권장(이미지 X)                                                  |
| `fx-particles`                                          | 스파크/+HP/제침 파티클           | ~16×16                             | ⬜   | 흰색 1종 → 코드 틴트                                                 |
| `intro-video`                                           | 인트로 스토리 영상               | 오버레이                           | ⬜   | 최후 폴리시 → §6                                                     |

> **코드로 두는 게 이득**: 하늘·그리드·속도선·트레일·**태양·메테오·레이저**(이미 코드화 완료).
> **외부 생성 집중 대상**: 라이더·고스트(+엎어짐)·건물/아포칼립스 장애물·간판·파티클.

---

## 5. 에셋별 생성 프롬프트 (영문 그대로 붙여넣기)

### 5.0 생성 6원칙 (먼저 읽기)

1. **투명 배경 명시+검증.** 항상 `isolated on a transparent background, no scene, no ground, no shadow`.
   흰/검 배경이면 "remove the background, output transparent PNG"로 후속 요청.
2. **글자 금지.** `no text, no letters, no watermark, no UI`를 negative로. (예외: 일본어 간판 §5.7)
3. **종횡비를 용도에 맞춰.** gpt-image는 `1024²/1536×1024(가로)/1024×1536(세로)`. 배경=가로, 캐릭터=세로, 아이템=정사각.
4. **"하나만" 그리게.** 한 컷 한 오브젝트. `a single ___, centered`.
5. **일관성은 참조 이미지로.** 첫 컷이 좋으면 업로드 후 `match the exact art style, line weight, glow and palette of this reference`.
6. **스프라이트 시트는 기대 낮추기.** 포즈 1장씩 받아 직접 합본 권장. (현 `ghost-run`은 한 장 시트를 `scripts/prep-ghost-sheet.py`로 분할·정렬.)

**공통 스타일 앵커(참조 없을 때 앞에 붙여 강화):**

```
Style anchor: synthwave city-pop apocalypse, minimal neon, dark high-contrast,
restrained bloom glow, flat vector-like shapes, clean readable silhouette,
isolated on a transparent background, no scene, no ground, no shadow, no text, game asset.
```

---

### 5.1 player-rider — 후드 라이더 + 네온 오토바이 (주인공)

지켜야 할 것: 후드 라이더가 시안 오토바이로 앞으로 숙여 질주, 스카프 뒤로 휘날림, 뒷바퀴 빛 트레일.
**히트박스 30×42 고정** — 오토바이는 가로로 기니 아트는 ~56px overhang 허용하되 충돌 박스를 라이더
몸통+앞바퀴에 정렬. origin = 하단 중앙(앞바퀴 접지). 컷: `ride · jump · hit · dead`.

```
A minimal neon hooded rider on a sleek futuristic motorcycle, side view facing right, rider
leaning forward low over the bike for speed, hood up and a scarf streaming backward, glowing
cyan (#5efce8) neon outline with lighter cyan (#cafff8) highlights, a short light trail behind
the rear wheel, wheels with subtle motion-blur glow, no facial detail, strong readable
silhouette, restrained outer glow, synthwave city-pop apocalypse, flat vector-like, isolated on
a transparent background, no scene, no ground, no shadow, no text, side profile, game asset,
wheels resting on a common ground baseline.
```

```
NEGATIVE: text, watermark, white background, ground shadow, realistic, 3D, busy detail, chrome
overload, photo, face close-up, rider standing, car, three wheels
```

> 추가 컷(동일 스타일·baseline·글로우): `jump`(앞바퀴 들린 버니홉), `hit`(1컷, 깜빡임은 코드),
> `dead`(라이더가 튕겨 나가 머리 위 골드 헤일로가 생기는 컷 — "죽으면 나도 고스트가 된다" 루프 핵심).

#### ★ player-jump2 — 2단 점프 컷 (신규 에셋 필요)

2단 점프 시(`player.jumpCount === 2`) 현재 `player-jump`와 다른 별도 컷으로 교체 → 더 강하게 꺾인 느낌.

```
SAME neon hooded rider and cyan motorcycle as player-rider (identical palette, glow, scarf, style)
— but captured at the peak of a SECOND mid-air jump: the front wheel kicked up sharply about
80 degrees above horizontal, rear wheel angled down, rider body thrown backward with the scarf
lashing forward dramatically, strong tilt and air, the whole bike reads as "punched upward" with
an urgent reckless energy. Side view facing right, full side profile, same baseline anchor (bottom
of rear wheel), isolated on a transparent background, no scene, no ground, no shadow, no text,
game asset.
```

```
NEGATIVE: front wheel down, casual hover, flat angle, 3D, realistic, photo, text, watermark,
white background, ground shadow, standing rider, car, three wheels
```

> **구현 노트(렌더 전용):** `src/sim/sim.ts`에서 `s.player.jumpCount`가 `2`이면 `player-jump2`
> 텍스처로 전환. `player-jump`와 동일 `displaySize` 사용. sim 히트박스는 동일 → 버전 업 없음.

---

### 5.2 ghost-runner — 발로 뛰는 헤일로 고스트 + ★엎어짐(신규)

**(A) 달리기 run-cycle** — 현재 `ghost-run.png`(6프레임) 사용 중. 재생성 시:
머리 위 **크고 선명한 골드 헤일로**(죽은 기록 표식), 보라 `#b39ddb` 반투명, 맨몸 달리기(오토바이 ❌),
라이더와 실루엣이 즉시 구분. 발 공통 baseline.

```
A minimal neon ghost runner for a side-view endless runner, full body mid-run facing right,
plain athletic human silhouette running on foot (no vehicle), glowing soft violet (#b39ddb)
translucent neon body, a LARGE bright glowing golden angel halo ring (#ffd700) floating clearly
above the head (roughly shoulder-width, unmistakable), no facial detail, ethereal and
semi-transparent, restrained glow, synthwave apocalypse, flat vector-like, feet on a single
common ground baseline, isolated on a transparent background, no scene, no ground, no shadow,
no text, side profile, single character game asset.
```

> 멀티프레임: 포즈별 1장씩 6장 권장 — foot-strike → mid-flight → toe-off → recovery 등 위상 변화.
> 한 장 시트로 받을 땐 `as a horizontal strip of 6 run-cycle frames, evenly spaced with clear
gaps, all frames identical scale and lighting`. 시트는 `scripts/prep-ghost-sheet.py`로
> 포즈별 분할·배경제거·상체정렬(프레임 섞임/흔들림 제거) 후 사용.

**(B) ★ 엎어짐(collapse) — ✅ 적용됨.** 고스트가 **자기 최고기록 거리에 도달해 기록이 끝나는 순간**
앞으로 고꾸라져 엎어지는 연출용. 전용 3프레임(비틀→무릎→완전히 엎어짐)을 받아 적용했다.
원본 `assets/images/ghost/ghost-collapse-1~3.png` → `scripts/prep-ghost-collapse.py`로
배경제거·동일배율(높이300, run과 동일)·하단정렬 후 `assets/game/ghost-collapse.png`(420×320×3) 시트로
묶고, `ghost-collapse` 애니(6fps, 1회)로 재생 후 페이드 아웃.

```
EXACT SAME ghost runner as the reference (identical soft violet #b39ddb translucent neon body,
the LARGE golden angel halo #ffd700, same scale and style) — but COLLAPSING forward and falling
face-down to the ground, as a short 3-frame sequence: (1) stumbling, upper body pitched forward
with arms flailing, (2) hands hitting the ground, body folding over, (3) lying face-down flat on
the ground, the golden halo slipping off and fading. Side view facing right, feet/baseline
consistent with the run frames, isolated on a transparent background, no scene, no ground,
no shadow, no text. Match line weight, glow and palette exactly.
```

```
NEGATIVE: motorcycle, vehicle, wheels, standing, running, getting up, gore, blood, different
colors, different style, no halo, text, watermark, white or black background, realistic, 3D
```

> 파일명 예: `ghost-fall-0/1/2.png`. 렌더: 고스트 `finished` 전환 시 run 정지 → fall 3프레임
> 1회 재생 후 바닥에 누운 채 페이드아웃. (코드 훅은 `GameScene` 고스트 루프에 이미 존재 — 텍스처만 교체.)

---

### 5.3 obstacle-apoc — 아포칼립스 장애물 세트 (건물 외 다양화)

> **왜:** 장애물이 네온 빌딩 한 종류라 단조롭다. 세기말 도로 위 "달려 피하는 잔해"로 다양화.
> **공통 제약(전부):** 충돌 박스는 직사각형 1개 — 폭 ≈32px(WIDE류 64). 높이 50–120으로 읽히게.
> 불꽃·연기·철근은 박스 밖으로 넘쳐도 됨(장식). **정면 측면 뷰, 원근 금지.** origin 하단 중앙.
> 팔레트: 다크 바디 `#0d0618` + 위험 마젠타 `#ff5fa2` / 화염 `#ff7a3c` / 시안 엣지 `#36f9f6`.

**(1) wreck-car — 부서진 자동차 (낮고 넓음, WIDE_LOW용 64px)**

```
A single wrecked abandoned car in strict flat side elevation (no perspective), low and wide
silhouette, crushed roof and shattered windows, one door hanging off, flat deflated tires, dark
charred body (#0d0618) with rusted edges, faint magenta (#ff5fa2) neon underglow and a few dying
cyan (#36f9f6) spark glints, thin wisps of smoke from the hood, synthwave apocalypse, minimal
flat vector shapes, clean readable silhouette, isolated on a transparent background, no ground,
no scene, no text, single object, game asset.
```

```
NEGATIVE: perspective, 3D, isometric, intact shiny car, driving, rolling wheels, people, road,
ground shadow, text, watermark, white background, realistic photo, heavy clutter
```

**(2) flame-barrel — 활활 타는 드럼통 불꽃 (낮은 단일)**

```
A single rusted steel oil drum barrel with tall roaring flames bursting from the top, strict
flat side elevation, dark dented body (#0d0618) with rusty streaks, vivid fire gradient from
white-yellow core (#ffe9a8) through orange (#ff7a3c) to deep red (#d62828), flickering ember
sparks, soft heat-haze glow, synthwave apocalypse, minimal flat shapes, clean silhouette,
isolated on a transparent background, no ground, no scene, no text, single object.
```

```
NEGATIVE: perspective, 3D, campfire on ground, fireplace, candle, people, smoke only, realistic
photo, text, watermark, white or black background, wide spread fire
```

**(3) debris-barricade — 콘크리트+철근 바리케이드 (중간 높이)**

```
A makeshift street barricade of broken concrete slabs and twisted steel rebar piled up, strict
flat side elevation, jagged broken edges, dark concrete (#0d0618) with exposed rusty rebar
sticking out, a strip of tattered magenta (#ff5fa2) hazard tape and a dim flashing cyan
(#36f9f6) warning glow, fine dust, synthwave apocalypse, minimal flat vector shapes, clean
silhouette, isolated on a transparent background, no ground, no scene, no text, single object.
```

```
NEGATIVE: perspective, 3D, isometric, intact wall, neat fence, people, road, ground shadow,
text, watermark, white background, realistic photo
```

**(4) flame-pillar — 네온 불꽃 기둥 (세로형, 32px용)**

```
A single tall vertical pillar of roaring neon fire as a side-view obstacle, narrow vertical
proportion (about 1:3 width to height), flames rising from a small glowing base, gradient from a
hot pale-yellow core (#ffe9a8) through orange (#ff7a3c) to deep red (#d62828), restrained outer
glow, stylized flat flame shapes (not realistic), synthwave apocalypse, minimal, strong
silhouette, bottom edge on a common ground baseline, isolated on a transparent background,
no scene, no ground, no shadow, no text, single object.
```

```
NEGATIVE: wide fire, campfire, realistic flames, photo, smoke cloud, building, text, watermark,
white or black background, ground shadow, 3D, multiple flames spread horizontally, scene
```

**(5) broken-streetlight — 부러져 쓰러진 네온 가로등 (중간 높이)**

> 부러져 비스듬히 기울어진 가로등, 깜빡이는 등(연출은 코드 글로우로 보강). 점프로 넘는 중간 높이.

```
A single broken neon street lamp post snapped and leaning diagonally as a side-view obstacle,
medium height, strict flat side elevation (no perspective), dark bent metal pole (#0d0618) with
a cracked dangling lamp head, the lamp flickering a dim magenta (#ff5fa2) and cyan (#36f9f6)
glow, sparking wires, faint smoke wisp, synthwave apocalypse, minimal flat vector shapes, clean
readable silhouette, bottom of the pole on a common ground baseline, isolated on a transparent
background, no ground, no scene, no text, single object, game asset.
```

```
NEGATIVE: perspective, 3D, isometric, upright intact lamp, working bright light, people, road,
ground shadow, text, watermark, white background, realistic photo
```

**(6) fallen-sign — 쓰러진 일본어 네온 간판 잔해 (낮음~중간)**

```
A toppled wrecked Japanese neon shop signboard lying as a side-view obstacle, low-to-medium
profile, strict flat side elevation, twisted steel frame with shattered glass neon tubes, a few
broken katakana/kanji-like neon strokes still flickering in magenta (#ff5fa2) and cyan
(#36f9f6), dark charred frame (#0d0618), sparks and thin smoke, synthwave apocalypse, minimal
flat vector shapes, clean readable silhouette on a common ground baseline, isolated on a
transparent background, no ground, no scene, single object, game asset.
```

```
NEGATIVE: perspective, 3D, isometric, upright readable sign, intact storefront, real Japanese
text, people, road, ground shadow, watermark, white background, realistic photo
```

**(7) crater-fissure — 솟아오른 붉은 광맥 균열 (세로로 읽히게)**

> ★주의: 바닥 평면 균열은 점프 단서가 모호 → **"위로 솟은 장애물"로** 읽히게(융기/돌출 형태).

```
A jagged ground fissure erupting upward as a side-view obstacle, a raised cracked rock spire
splitting open with a glowing red-orange magma vein leaking out, vertical readable mass (not a
flat floor crack), dark broken rock (#0d0618) with bright lava gradient from orange (#ff7a3c) to
deep red (#d62828), rising heat shimmer and embers, synthwave apocalypse, minimal flat vector
shapes, strong vertical silhouette, base on a common ground baseline, isolated on a transparent
background, no ground plane, no scene, no text, single object, game asset.
```

```
NEGATIVE: flat floor crack, top-down hole, perspective, 3D, isometric, water, people, road,
ground shadow, text, watermark, white background, realistic photo, horizontal spread
```

**(8) wreck-bike — 쓰러진 라이더의 부서진 오토바이 잔해 (낮음~중간, 서사 연결)**

```
A single wrecked motorcycle of another fallen rider lying on its side as a side-view obstacle,
low-to-medium profile, strict flat side elevation, twisted frame and bent wheel, a dying fading
cyan (#36f9f6) underglow flickering out, dark charred body (#0d0618) with faint magenta
(#ff5fa2) accents, a thin wisp of smoke, synthwave apocalypse, minimal flat vector shapes, clean
readable silhouette on a common ground baseline, isolated on a transparent background, no ground,
no scene, no text, single object, game asset.
```

```
NEGATIVE: perspective, 3D, isometric, upright drivable motorcycle, rider on it, bright glow,
people, road, ground shadow, text, watermark, white background, realistic photo
```

> **구현 노트:** 위 전부 `building-kit`과 같은 장애물 슬롯의 **텍스처 교체**다. sim 충돌은
> 직사각형(`OBS_W`×`h`) 그대로 — 에셋은 그 박스를 "덮는 그림". 패턴/높이에 따라 어떤 텍스처를
> 쓸지는 `GameScene` 렌더에서 분기(결정론 무관). WIDE_LOW(부서진 차)만 폭 64.

---

### 5.4 building-kit — 네온 건물 ⚠️ 장애물로는 폐기(deprecated)

> **2026-06 업데이트:** 건물은 더 이상 장애물로 쓰지 않는다. 장애물은 아포칼립스 5종
> (`obs-car`/`obs-debris`/`obs-barrel`/`flame-pilar-1`/`flame-pilar-2`)으로 전환됨(§5.3).
> 아래 건물 프롬프트는 배경 스카이라인 참고용으로만 남긴다.

폭 **정확히 32px 비율**, 높이 50–120 가변. 세로 스트레치는 창문이 늘어나 깨짐 → **수직 9-slice**:
`cap`(옥상+안테나) + `floor`(반복 1층, 창문 2열). 다크 `#0d0618` + 시안 외곽 `#36f9f6` + 창문 마젠타/시안.

```
PROMPT (cap, 옥상):
The top section of a narrow neon skyscraper, tall vertical proportion (about 1:3), rooftop with
a thin antenna and a small glowing beacon, dark fill (#0d0618), a glowing cyan (#36f9f6) thin
outline, synthwave apocalypse, minimal flat shapes, strict flat side elevation (no perspective),
seamless flat bottom edge to stack onto floor tiles, isolated on a transparent background,
no ground, no sky, no text.
```

```
PROMPT (floor, 세로 반복 타일):
A single repeatable floor segment of a narrow neon skyscraper, tall thin vertical proportion,
dark body (#0d0618), a glowing cyan (#36f9f6) thin outline only on left and right edges, two
columns of small lit windows alternating magenta (#ff5fa2) and cyan (#36f9f6), top and bottom
edges perfectly seamless for vertical tiling, strict flat side elevation, minimal flat, isolated
on a transparent background, no rooftop, no ground, no text.
```

```
NEGATIVE: perspective, 3D, isometric, wide building, ground, street, sky, clouds, text,
watermark, white background, realistic bricks, heavy detail, people, cars
```

---

### 5.5 fuel-can — 연료통 (회복 = 주유) ★ 힐팩 대체

풋프린트 26×26, 정중앙 origin. **쿨 블루 글로우(`#4dabf7`/`#9fd4ff`) 유지** — 빨간 주유통 ❌
(위험 마젠타와 헷갈림). 옆면에 연료 방울/번개 픽토그램.

```
A small neon fuel jerrycan power-up for a side-view game, compact rectangular fuel canister with
a top handle and a short spout, dark body (#0a2740) with a glowing cool blue (#4dabf7) neon
outline and lighter cyan (#9fd4ff) highlight, a small glowing fuel-drop / energy symbol on the
side, soft radial glow halo, minimal flat vector style, centered, isolated on a transparent
background, no text, game item asset, slight pulse.
```

```
NEGATIVE: red canister, realistic gas can, oil drum, bottle, liquid splash, label text, words,
magenta, white background, realistic metal, 3D, photo
```

---

### 5.6 fx-particles — 스파크/파티클 (흰색 1종, 코드 틴트)

16×16 내외 소프트 점. 색은 코드 틴트(연료=블루, 제침=바이올렛, 콤보=골드).

```
A small soft round spark particle, white center with soft falloff, simple bokeh dot, isolated on
a transparent background, for tinting in-engine, minimal, game particle.
```

```
NEGATIVE: colored, text, shape detail, white or black background, star outline
```

---

### 5.7 hp-bar — 체력바 HUD ★신규 (현재 코드 사각형 → 에셋 교체)

화면 **하단 중앙**의 가로 게이지. 현재는 코드 사각형(프레임 260×14 + 초록→노랑→빨강 fill).
에셋으로 교체할 땐 **3개 파트**로 받아 9-slice/스케일 합성한다(폭 가변, 높이 고정):

| 파트            | 용도                  | 권장 크기(@3x)  | 비고                                          |
| --------------- | --------------------- | --------------- | --------------------------------------------- |
| `hp-frame`      | 빈 게이지 프레임/그릇 | 816×72 (272×24) | 양끝 캡 + 가운데 반복 → 가로 9-slice          |
| `hp-fill`       | 채워지는 막대(가로 타일) | 768×48 (256×16) | `scaleX`로 깎아 비율 표시. 무채색→코드 틴트   |
| `hp-icon`(선택) | 좌측 하트/배터리 아이콘 | 72×72 (24×24)  | 깜빡임은 코드                                  |

색은 코드에서 틴트(>50% `#2ecc71`, >25% `#f1c40f`, 이하 `#ff4757` + 점멸). 그래서 `hp-fill`은
**밝은 무채색 그라데이션 + 약한 내부 광택**으로 받아 어느 색으로 틴트해도 자연스럽게.

```
PROMPT (hp-frame — 빈 게이지 프레임):
A horizontal HUD health-bar FRAME (empty gauge container) for a neon synthwave cyberpunk runner,
long thin horizontal capsule, dark semi-transparent inset track (#10081f) with a glowing cyan
(#36f9f6) thin outline and small notch ticks along the inside, subtle beveled end caps on left and
right so it can be 9-sliced horizontally, faint outer glow, minimal flat vector UI, strictly
front-facing flat (no perspective), isolated on a transparent background, empty inside (no fill),
no text, no numbers.
```

```
PROMPT (hp-fill — 채워지는 막대, 무채색):
A horizontal HUD bar FILL strip, bright neutral light-grey glossy gradient (white highlight along
the top third, soft falloff to mid grey at the bottom) so it can be tinted any color in-engine,
clean rounded ends, faint inner glow, seamless left-right so it tiles/stretches, minimal flat
vector UI, front-facing flat, isolated on a transparent background, no text, no outline color,
no icons.
```

```
PROMPT (hp-icon — 좌측 아이콘, 선택):
A tiny glowing heart (or battery) HUD icon, dark fill (#10081f) with a glowing cyan (#36f9f6)
neon outline and soft inner light, minimal flat vector, centered, isolated on a transparent
background, no text, single small icon.
```

```
NEGATIVE: text, numbers, percentage, vertical bar, 3D, perspective, realistic, photo, gradient
background, white or black background, drop shadow on ground, multiple bars, game character
```

---

### 5.7 signage-jp — 일본어 네온 간판 세트 (시티팝)

쇼와 레트로 시티팝. 세로+가로 혼합. 마젠타/시안/앰버 네온 튜브. **실제 상호·브랜드·로고 금지 →
가공어만**(`夜光酒場` `電脳ホテル` `ナイトシティ` `終末` `ネオン` `音楽` `バー` `酒`). 출력 후 글자 검수 필수.

```
A set of separate vintage Japanese neon shop signs, Showa-era city-pop aesthetic, a mix of
vertical and horizontal signs spaced on one sheet, glowing neon tube letters in katakana and
kanji, colors magenta (#ff5fa2), cyan (#36f9f6) and amber (#ffd36e) on small dark mounting
plates, soft neon glow, minimal, retro Tokyo night, isolated on a transparent background,
no scene, no people. Use only generic invented words such as 夜光酒場 / 電脳ホテル / ナイトシティ /
ネオン / 音楽, never real brand names or logos.
```

```
NEGATIVE: real brand names, real logos, english text, latin letters, garbled glyphs, watermark,
people, photo, white background, daytime, cluttered street, 3D
```

> 글자 정확도가 안 나오면: 빈 네온 박스 틀만 생성하고 일본어는 게임에서 웹폰트로 코드 렌더.

---

### 5.8 코드 드로우로 대체된 것 (이미지 생성 불필요)

| 요소                                 | 함수                  | 메모                                                                    |
| ------------------------------------ | --------------------- | ----------------------------------------------------------------------- |
| 노을 태양                            | `updateCodeSun()`     | 그라데이션 원 + 스캔라인 + 줄무늬 일렁임 + 맥동 글로우 링               |
| 화염 메테오                          | `drawCodeMeteor()`    | 난류 불혀 다발 + 깜빡이는 코어 + 튀는 불티(이글이글), 점→원 성장·페이드 |
| 경고 레이저                          | `drawLasers()`        | 태양 뒤 사선 스윕, yMid를 태양 세로 범위 내 고정, 속도 연동             |
| 하늘/스카이라인/그리드/속도선/트레일 | `createBackground` 외 | 패럴랙스·점프 연동 포함                                                 |

> 이들은 정지 이미지보다 가볍고 60fps에 유리하며 `sim.state`에 읽기 전용 연동된다.
> 굳이 이미지로 되살릴 이유가 생기면 이 표를 갱신하고 프롬프트를 §5에 추가한다.

---

## 6. 오디오 (BGM / SFX) & 인트로 영상

> 이미지 생성기로는 음원·영상 못 뽑음. **BGM/SFX = Suno·Udio·ElevenLabs·freesound**,
> **영상 = Sora·Runway·Veo**.

### 6.1 BGM — 시티팝 × 사이렌 루프

```
Suno / Udio:
[genre] city pop, synthwave, apocalyptic city
[feel] nostalgic, tense, late-night highway, neon lights
[instrumentation] mellow electric guitar chord stabs, warm bass, 80s drum machine, a distant
emergency siren wailing periodically in the background (not intrusive), lush reverb, lo-fi
cassette warmth, BPM 105-115
[structure] seamless 60-120s loop, no lyrics, no fade-out (loop-ready)
NEGATIVE: happy upbeat pop, acoustic guitar, orchestral strings, choir, loud siren drowning melody
```

> MP3/OGG 128–192kbps, 루프 이음매 클릭 없게. `this.sound.add('bgm', { loop: true, volume: 0.35 })`.
> 피버용 레이어/템포업을 별도로 받아 컷 전환하면 §7 쾌감↑.

### 6.2 SFX 목록 (전부 기존 sim 이벤트에 얹음 — 렌더 전용)

| 트리거                               | 검색/프롬프트                                                    | 길이                             |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------- |
| 점프 (EV_JUMP)                       | "quick high-rev motorcycle engine burst, aggressive exhaust pop" | 0.3–0.5s (2단 점프 `detune:200`) |
| 피격 (EV_HIT)                        | "electric sparks and metal scrape collision, short sharp impact" | 0.2s                             |
| 연료 획득 (EV_POTION)                | "quick liquid refuel sound, small pour and clunk, satisfying"    | 0.3s                             |
| 피버 시작 (EV_FEVER_START)           | "retro synthwave power surge, ascending sweep and sparkle"       | 0.8s                             |
| 제침/등수↑/콤보틱/사망/UI탭/니어미스 | 짧은 신스 틱·스윕                                                | 짧게·프리로드                    |

> 구현: `preload()`에서 `load.audio` → `syncVisuals()`에서 이벤트 비트마스크 읽어 재생.
> WebView 자동재생 정책: 첫 탭(TAP TO START) 후 오디오 컨텍스트 언락. 음소거 토글 제공.

### 6.3 인트로 영상 (#최후 폴리시)

**카피(코드 오버레이, 영상엔 굽지 말 것):** "종말이 다가오는 지구. 마지막 인류가 된 당신 — 지구 끝까지 달려 살아남아라."

```
A cinematic 8-second intro for a synthwave apocalypse endless-runner. A dark crumbling city at
dusk under a huge retro magenta-pink gradient sun with scanline gaps. Molten red meteors fall
diagonally with fiery tails, distant indigo skyscraper silhouettes and flickering Japanese neon
signs. A lone hooded rider glowing cyan (#5efce8), leaning low on a sleek motorcycle with a
streaming scarf and a cyan light trail, races right along a neon grid toward the horizon. Camera
tracks alongside, speed lines rushing. Minimal flat neon vector, dark high-contrast, restrained
bloom, ominous end-of-the-world mood, ending on the rider speeding into the distance. No text, no logos.
```

```
NEGATIVE: realistic 3D, photoreal, gore, blood, readable text, watermark, logos, daytime,
bright cheerful colors, cluttered detail, camera shake overload
```

> 첫 진입 1회만(`localStorage` 플래그) + **스킵 버튼** 필수. webm(VP9)+mp4(H.264) 폴백, 프리로드.
> 실기기 디코드 스터터·용량 실측 후 채택. 배경엔 영상 금지(코드 패럴랙스). 부담되면 코드 연출 인트로로 폴백.

---

## 7. "한 판 더"를 만드는 리텐션 비주얼 (북극성)

보상 토큰이 없으니 **쾌감만으로 재시도**를 만든다. 비주얼의 임무: 추월·신기록·피버의 쾌감을 과장.
전부 기존 sim 이벤트에 얹는 **렌더 전용** 트리거.

| 순간 (sim 트리거)                | 비주얼 훅                                                                    | 왜 재시도를 부르나                             |
| -------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| **추월** (고스트 finished)       | 추월당한 고스트가 헤일로 번쩍 + **엎어짐 연출**(§5.2B) + `제침!` 보라 버스트 | "내가 이겼다" 도파민                           |
| **등수 상승**                    | 랭킹 패널 슬라이드 + 1등 림 골드 글로우                                      | 순위는 가장 강한 비교 동기                     |
| **콤보 상승**                    | 중앙 콤보 숫자 성장 + 화면 따뜻해짐(피버 예고)                               | "조금만 더하면 피버"                           |
| **피버** (EV_FEVER_START)        | 황금 플래시 + 속도선 폭발 + 무한점프 트레일, 메테오 더 붉게/잦게             | 최고 쾌감 구간                                 |
| **니어미스**                     | 장애물 모서리 스파크 + 찰나 플래시                                           | "방금 죽을 뻔"의 긴장 쾌감                     |
| **연료통** (EV_POTION)           | 블루 주유 링 + `+FUEL` 부유                                                  | 작은 보상 리듬                                 |
| **사망→고스트화** (EV_GAME_OVER) | 라이더가 튕겨 나가 골드 헤일로를 달고 고스트가 됨                            | "내 기록이 남들의 고스트로 남는다" 정체성 루프 |
| **결과 패널**                    | 박빙이면 `한 판 더?` + 신기록 시 도시 번쩍                                   | 박빙·신기록 직후가 재시도 전환율 최고점        |

---

## 8. 통합 순서 & 작업 체크리스트

**파이프라인(값싼 코드부터 검증):** graybox → 코드 스킨 → 에셋 스왑 → 오디오 → (선택)영상.
코드로 룩/무빙을 먼저 입혀 실속도·가독성·60fps를 검증한 뒤 에셋을 텍스처만 드롭인 스왑한다.

**작업 전 체크:**

- [ ] sim(`src/sim/`)을 건드렸는가 → 건드리면 SIM_VERSION 업 = 고스트 무효화(의도된 경우만)
- [ ] 장애물 변종이 충돌 폭 32(WIDE 64)·높이 50–120 유지(텍스처만 교체)인가
- [ ] 새 연출이 전부 `sim.state` 읽기 전용인가
- [ ] 메테오·레이저·태양이 플레이 레인(하단) 가독성을 안 해치는가
- [ ] 고스트 흩뿌리기가 플레이어를 안 가리는가(뒤/옆 분포)
- [ ] 랭킹 패널 색 구분(고스트 회색 / 주인공 시안)이 명확한가
- [ ] 새 에셋이 투명 배경·무텍스트·컬러 토큰 hex 준수인가
- [ ] 엎어짐/달리기 프레임 baseline이 일치하는가
- [ ] 저사양 60fps 유지(postFX·메테오·영상 디코드)되는가

---

## 9. 외부 생성 일관성 체크리스트

- [ ] 투명 배경(흰/검 아님)으로 나왔는가
- [ ] 컬러 토큰(§3) hex를 벗어나지 않았는가(특히 게임플레이 4색)
- [ ] 라이더(오토바이) vs 고스트(도보+헤일로) 실루엣이 30px에서 즉시 구분되는가
- [ ] 건물/장애물이 폭 32 비율(WIDE 64)인가
- [ ] 연료통이 쿨 블루(빨간 주유통 아님)인가
- [ ] 일본어 간판이 가공어인가(실상호·로고·영문 아님), 플레이 레인을 안 가리는가
- [ ] 워터마크/영문/드롭섀도 등 불필요 요소가 없는가
- [ ] 프레임마다 baseline이 일치하는가
