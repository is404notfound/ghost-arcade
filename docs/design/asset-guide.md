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


| 레이어              | 위치                          | 성격                               | 고치면?                                     |
| ---------------- | --------------------------- | -------------------------------- | ---------------------------------------- |
| **sim (결정론 코어)** | `src/sim/`                  | 같은 입력 → 같은 결과. 고스트 재생/리더보드의 토대   | `**SIM_VERSION`이 올라 기존 고스트·리더보드 전부 무효화** |
| **렌더 레이어**       | `src/render/GameScene.ts` 등 | `sim.state`를 **읽기만** 함. 게임 로직 없음 | **버전 무관 → 고스트 안 깨짐, 언제든 자유**             |


**핵심:** 에셋/연출/UI는 거의 전부 렌더라 자유롭게 작업해도 고스트가 안 깨진다.
딱 하나 — **장애물 충돌 폭 `OBS_W=32`, 높이 50~120(`constants.ts`)은 sim.** 외형(텍스처)만
바꾸고 히트박스는 그대로 두면 버전 무관으로 안전하다. 물리 폭까지 바꾸면 SIM_VERSION 업(피한다).

---

## 2. 전역 규칙 (모든 에셋 공통 — 위반하면 게임에 못 씀)


| 규칙          | 값                                 | 왜                                               |
| ----------- | --------------------------------- | ----------------------------------------------- |
| 논리 해상도      | **1040 × 480 (19.5:9 가로)**        | Phaser `Scale.FIT` 기준 좌표계. 모든 풋프린트는 이 px.       |
| 바닥선         | **y = 432 (`GROUND_Y_PX`)**       | 캐릭터·건물 발이 닿는 baseline.                          |
| 소스 제작 배율    | **@3x 권장(@2x 최소)**                | 레티나 폰 선명도. 30×42 캐릭터 → 소스 90×126로 그린 뒤 축소.      |
| 배경          | **투명 PNG (RGBA-32)**              | 글로우 오버랩 합성 때문에 흰/검 배경 불가.                       |
| 원점(anchor)  | 캐릭터·건물 = **하단 중앙**, 연료통 = **정중앙** | 바닥에 발이 닿게 정렬.                                   |
| 히트박스 = 풋프린트 | 아래 표 px                           | **글로우/안테나/불꽃/연기는 풋프린트 밖으로 넘쳐도 됨. 충돌은 직사각형으로만.** |
| 결정론 분리      | "장식" 표기 = **렌더 전용**               | 메테오·패럴랙스·창문 점멸은 sim에 절대 닿지 않음.                  |
| 성능 예산       | 저사양 폰 60fps                       | 장애물 풀 16·포션 8 동시. 에셋 가볍게, 블룸 절제.                |


추천 파이프라인: **투명 PNG @3x 생성 → 여백 트림 → (애니는) 균일 프레임 시트 → Phaser 로드.**
기하학 조각(태양·그리드 등)은 가능하면 **코드 드로우**가 무손실·초경량.

---

## 3. 컬러 토큰 (이 hex로 통일 — 프롬프트에 그대로 사용)


| 토큰                  | hex                                                     | 용도                                   |
| ------------------- | ------------------------------------------------------- | ------------------------------------ |
| `sky.top`           | `#170a2e`                                               | 하늘 상단(딥 인디고)                         |
| `sky.mid`           | `#3a0f44`                                               | 하늘 중단(퍼플)                            |
| `sky.low`           | `#6b1248`                                               | 지평선(마젠타-퍼플)                          |
| `sun.hot`           | `#ffd36e → #ff5fa2 → #b3247e`                           | 레트로 선(상→하 그라데이션)                     |
| `neon.cyan`         | `#36f9f6`                                               | 건물 외곽선 / 바닥 그리드 / 시안 네온              |
| `player.fill`       | `#5efce8` (하이라이트 `#cafff8`)                             | 플레이어                                 |
| `ghost.violet`      | `#b39ddb` (alpha ~0.5 표시)                               | 고스트(발로 뛰는 죽은 라이벌)                    |
| `halo.gold`         | `#ffe9a8` / `#ffd700`                                   | 고스트 머리 위 천사 헤일로(죽음 표식)               |
| `fuel.blue`         | `#4dabf7` (하이라이트 `#9fd4ff`)                             | 연료통(회복=주유). **쿨 블루 유지**(위험 마젠타와 반대축) |
| `danger.magenta`    | `#ff5fa2` / `#ff6fb0`                                   | 창문 / 위험 신호                           |
| `fire.hot`          | `#ffe9a8` 코어 → `#ff7a3c` → `#d62828` (어두운 엣지 `#7a0f12`) | 메테오·불꽃 장애물                           |
| `laser.red`         | `#ff4757` / `#ff6b81`                                   | 배경 경고 레이저                            |
| `hp.green/warn/low` | `#2ecc71 / #f1c40f / #ff4757`                           | 체력바                                  |
| `fever.gold`        | `#f0f838` (네온 옐로, Fever 아이콘 샘플)                         | 피버·HUD 강조 노랑 통일                      |


> **게임플레이 4색**(플레이어 시안 / 고스트 바이올렛 / 연료 블루 / 위험 마젠타)은 **절대 닮게
> 만들지 말 것.** 색이 곧 "피할 것 vs 먹을 것" 정보다. 위험·불은 따뜻한 축(주황·마젠타),
> 보상(연료)은 차가운 축(블루)으로 고정.

---

## 4. 마스터 에셋 리스트 + 현재 구현 상태

> ✅구현완료 / 🟡에셋대기(코드 스톱갭 있음) / ⬜미착수 / 💠코드드로우(이미지 불필요)


| ID                                                      | 무엇                          | 풋프린트(게임 px)                  | 상태  | 비고                                                                                              |
| ------------------------------------------------------- | --------------------------- | ---------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| `player-rider`                                          | 후드 라이더+네온 오토바이              | 히트박스 30×42 (아트 ~56 overhang) | ✅   | ride/jump/hit/dead 컷. 글로우=코드 postFX                                                             |
| `player-jump1` / `player-jump2`                         | 1단/2단 점프 정지 컷(2단=직각+네온 부스트) | 30×42 (히트박스 동일)              | 🟡  | **아트 확보(첨부 1024×512 2컷) → 분할·적용 스펙** §5.1. jumpsUsed로 분기                                        |
| `ghost-runner`                                          | 발로 뛰는 헤일로 고스트               | 30×42                        | ✅🟡 | **6프레임 시트**(`ghost-run.png`), 런타임 랜덤 위상·속도. (2026-06-28: **후드 유령 컨셉으로 재생성 대기** → §5.2A)         |
| `ghost-collapse` (3프레임)                                 | **기록 종료 시 엎어지는 고스트**        | 420×320×3                    | ✅   | 전용 3프레임 적용(비틀→무릎→엎어짐). prep-ghost-collapse.py → §5.2B                                           |
| `fuel-can`                                              | 연료통(회복=주유)                  | 26×26                        | ✅   | 쿨 블루. 빨간 주유통 ❌                                                                                  |
| `building-kit`                                          | 네온 건물                       | 폭 32, 높이 50–120              | ⚠️  | **장애물 폐기**(아래 5종으로 전환). 스카이라인 참고용만                                                              |
| `obs-car` / `obs-debris`                                | **부서진 차 / 잔해더미**(낮고넓음)      | 높이=히트박스, 폭 클램프 40–150        | ✅   | `obstacles.png` 3분할 → prep-obstacles2.py. 높이 ≤80 출현                                             |
| `obs-barrel`                                            | **불타는 드럼통**(중간)             | 높이=히트박스, 종횡비 유지              | ✅   | `obstacles.png` 3분할. 높이 80–120 출현                                                               |
| `flame-pilar-1` / `flame-pilar-2`                       | **불기둥**(높음, 2종)             | 높이=히트박스, 폭 클램프 ≥40           | ✅   | 흰배경 제거 → prep-obstacles2.py. TALL(>120) 출현                                                      |
| `wreck-vending`                                         | **부서진 자판기**(중간)             | 높이=히트박스, 종횡비 유지              | ⬜   | 프롬프트 §5.3(9). 일본 거리감, 깨진 화면 글리치                                                                 |
| `tire-pile`                                             | **쌓인 폐타이어**(낮음~중간)          | 높이=히트박스, 종횡비 유지              | ⬜   | 프롬프트 §5.3(10). 낮고 둥근 더미                                                                         |
| `manhole-steam` (6프레임)                                  | **맨홀+증기 분출**(낮음, 애니)        | 높이=히트박스(맨홀 융기부)              | ⬜   | 프롬프트 §5.3(11). 증기 6프레임 루프, 충돌박스는 정지                                                             |
| `hp-bar` (frame/fill/icon)                              | 체력바 HUD                     | 272×24 외                     | ⬜   | **프롬프트 작성됨** → §5.7 (현재 코드 사각형)                                                                 |
| `bg-sun`                                                | 레트로 선(노을 태양)                | ~360×220                     | 💠  | **코드 드로우**(`updateCodeSun`) — 일렁임 애니 포함, 이미지 제거됨                                                |
| `fx-meteor`                                             | 화염 메테오                      | —                            | 💠  | **코드 드로우**(`drawCodeMeteor`) — 동시 1개로 제한                                                        |
| `fx-obstacle-smoke`                                     | 장애물 연기/불빛(타입별)              | —                            | 💠  | **코드 드로우**(`drawObstacleSmoke`) — 웨이브 연기 선 + 맥동 베이스 글로우. (2026-06-28: 불 타입 **상단 원형 코어 글로우 제거**) |
| `fx-laser`                                              | 배경 경고 레이저                   | —                            | 💠  | **코드 드로우**(`drawLasers`) — 태양 뒤 사선 스윕                                                           |
| `signage-jp`                                            | 일본어 네온 간판 세트                | 가변                           | ✅   | 배경 패럴랙스 데코                                                                                      |
| `bg-skyline-far`                                        | 먼 도시 실루엣                    | 가로 심리스                       | 💠  | 코드 드로우(`drawSkyline`)                                                                           |
| `bg-sky` / `ground-grid` / `fx-speedlines` / `fx-trail` | 하늘·바닥그리드·속도선·트레일            | —                            | 💠  | 코드 권장(이미지 X)                                                                                    |
| `fx-particles`                                          | 스파크/+HP/제침 파티클              | ~16×16                       | ⬜   | 흰색 1종 → 코드 틴트                                                                                   |
| `intro-slide`                                           | 인트로 스토리 이미지(세로 슬라이드)        | 오버레이                         | ✅   | §6.3. 매 판·Start→바로 플레이. 고화질 재생성 권장(≥1536w)                                                      |
| `bgm-main`                                              | 메인 플레이 BGM (루프)               | —                            | ✅   | §6.1 (A). `assets/audio/bgm-main.mp3` · Midnight Motorway. 인트로/howto 후 재생, vol 1.0 · 페이드 전환 |
| `bgm-intro`                                             | 타이틀/인트로 BGM (루프)             | —                            | ✅   | §6.1 (C). `assets/audio/bgm-intro.mp3` · Last Light of the World. 인트로(+howto) 중, vol 0.16 · 페이드 전환 |
| `bgm-fever`                                             | 피버 타임 BGM (루프)                | —                            | ✅   | §6.1 (B). `assets/audio/bgm-fever.mp3` · Combo Multiplier. 피버 중 메인 덕킹(0.42)+레이어 vol 0.55 · 페이드 220ms |
| `bgm-gameover`                                          | 게임오버/결과 BGM (루프)             | —                            | ✅   | §6.1 (E). `assets/audio/bgm-gameover.mp3` · The Final Quarter. 사망→결과 패널, vol 0.42 · 메인/피버와 페이드 전환 |
| `sfx-jump` / `sfx-hit` / `sfx-potion` / `sfx-fever`     | 핵심 이벤트 SFX                    | —                            | ✅/🔄 | §6.2. jump/hit/potion=무료 실샘플([CREDITS-sfx.md](../../assets/audio/CREDITS-sfx.md)). fever=합성→프롬프트 A |
| `sfx-tick` / `sfx-overtake` / `sfx-death` / `sfx-siren` | UI틱·제침·사망·정전사이렌 SFX       | —                            | ✅/🔄 | §6.2. siren=Mixkit police(warn 루프). tick/overtake/death=합성 |


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

#### ★ player-hit — 피격 컷 (여성 바이커 소녀 신규, ⬜ 이전 남성 에셋 교체)

지금 `player-hit.png`는 **구세대 아트(남성 라이더)**가 그대로 굽혀 있어 현행 여성 바이커 소녀
시트(§5.1 `player-ride`)와 스타일이 어긋난다. 아래로 **여성 라이더 1컷**을 새로 뽑아 교체한다.
장애물에 부딪힌 순간의 **반동/움찔** 리액션 — 깜빡임(무적)은 코드가 처리하니 **정지 1프레임**이면
충분하다. 기존 `ride`와 **동일 displaySize·동일 baseline**(사망 컷처럼 확대 금지). 히트박스 30×42 불변.

```
A single "HIT" reaction cut of the SAME neon hooded BIKER GIRL on the SAME cyan motorcycle as
player-rider (identical palette: #5efce8 body with #cafff8 highlights, same bike shape, glow and
line weight, long ponytail hair streaming) — the exact moment she is struck by an obstacle. Side
view facing right, the rider and bike jolted and recoiling BACKWARD from a frontal impact, front
wheel knocked slightly up, upper body snapped back, long ponytail and scarf whipping violently,
a sharp burst of impact sparks and a brief clash flash in cyan (#36f9f6) and danger magenta
(#ff5fa2) at the FRONT of the bike, a couple of short spark/debris streaks. Clearly a FEMALE
rider (slim build, long ponytail, no facial detail). Restrained outer glow, synthwave city-pop
apocalypse, flat vector-like, strong readable silhouette, isolated on a transparent background,
no scene, no ground, no shadow, no text, side profile, single frame, game asset, wheels on a
common ground baseline.
```

```
NEGATIVE: male rider, short hair, bald, bare head, detailed realistic face, calm riding pose,
upright neutral, standing off the bike, gore, blood, 3D, realistic, photo, text, watermark,
white or black background, ground shadow, car, three wheels, different palette, multiple frames,
enlarged out of scale
```

> **일관성:** 현행 `assets/game/player-ride.png`(또는 첨부 점프 아트)를 **참조 이미지로 업로드**하고
> `match the exact biker girl, hair, bike shape, line weight, glow and palette of this reference, just the hit-reaction pose`로 지시 → 세계관/체형/바이크가 어긋나지 않게 뽑는다.
>
> **구현 노트(렌더 전용):** 새 원본 → `player-rider-hit.png`(또는 전용 파일)로 넣고
> `scripts/prep-assets.py`의 player 그룹에서 함께 굽는다(공통 bbox·배율 → `player-hit.png`).
> `GameScene`는 `s.invincibleFrames > 0`일 때 이미 `player-hit`로 전환하므로 **텍스처만 교체**하면
> 끝(§4대로 히트박스 sim 불변 → 버전 업 없음).

#### ★ player-dead — 사망→고스트화 컷 (여성 라이더 신규, ⬜ 이전 남성 에셋 교체)

지금 `player-dead.png`도 **구세대 아트(남성 라이더)**라 현행 여성 바이커 소녀와 어긋난다. 이 컷은
단순 "죽음"이 아니라 **"죽으면 나도 고스트가 된다"는 정체성 루프의 핵심**(§7)이다 — 그래서 현행
플레이어(**시안 바이커 소녀** §5.1)가 튕겨 나가면서 **§5.2 고스트로 변해가는 순간**(골드 헤일로 생성 +
몸이 보라 반투명으로 페이드)을 한 컷에 담아 두 에셋을 시각적으로 잇는다. `EV_GAME_OVER` 시 1회
전환 후 코드가 페이드아웃하므로 **드라마틱한 정지 1컷**이면 된다(§4대로 히트박스 무관 → 버전 업 없음).

```
A single dramatic "DEATH → GHOST" transition cut of the SAME neon BIKER GIRL as player-rider
(same slim build, long ponytail, line weight and style) at the instant she is thrown off her
motorcycle. Side view facing right: her body is EJECTED and tumbling backward through the air,
arms and long ponytail flailing, the cyan (#5efce8) motorcycle tumbling away separately below
her. A LARGE bright glowing GOLDEN angel halo ring (#ffd700 / #ffe9a8) is appearing just above
her head (the death mark). Her body is mid-TRANSFORMATION from the player into a ghost: the
cyan (#5efce8) body is bleeding/fading into soft VIOLET (#b39ddb) translucent neon, the trailing
edges and ponytail dissolving into a wispy semi-transparent spirit. Clearly a FEMALE figure,
no facial detail. Restrained outer glow, synthwave city-pop apocalypse, flat vector-like, strong
readable silhouette, isolated on a transparent background, no scene, no ground, no shadow,
no text, side profile, single frame, game asset.
```

```
NEGATIVE: male rider, short hair, bald, bare head, detailed realistic face, calm riding pose,
upright neutral, still sitting firmly on the bike, gore, blood, dismemberment, 3D, realistic,
photo, text, watermark, white or black background, ground shadow, car, three wheels, no halo,
fully opaque solid body, different palette, multiple frames
```

> **일관성(중요):** 이 컷은 §5.1 `player-ride`(시안 바이커 소녀)와 §5.2 `ghost-runner`(보라 후드
> 유령 + 골드 헤일로) **둘 다의 브리지**다. 두 참조 이미지를 함께 올려 `keep the biker girl's body/hair, but blend her cyan color and silhouette toward this violet halo ghost — the moment of turning into it`로 지시하면 팔레트 전환(시안→보라)과 헤일로가 두 에셋과 어긋나지 않는다.
>
> **구현 노트(렌더 전용):** 새 원본 → `player-rider-dead.png`(또는 전용 파일) → `prep-assets.py`
> player 처리 → `player-dead.png`. `GameScene`는 `s.gameOver` 시 이미 `player-dead`로 전환하고
> `**PLAYER_ART_H * 1.25`로 살짝 크게** 표시한 뒤 트윈 페이드아웃(≈780ms, 결과 패널 전 소멸)한다 —
> **텍스처만 교체**하면 끝. 튕겨 나감 방향상 아트는 위로 overhang 여유를 두고, baseline은 다른 컷과
> 크게 안 어긋나게(페이드아웃되므로 접지 엄밀성은 낮음).

#### ★ player-jump1 / player-jump2 — 점프 컷 2프레임 (첨부 아트 분할·적용, ✅ 아트 확보)

> **방향 전환(2026-07-06):** 아래 "6프레임 애니" 계획은 **폐기**. 완성 아트 1장(가로 2컷)을 확보해서
> **정지 2프레임(1단/2단)** 으로 간다. 지금은 공중에서도 주행 시트(`player-ride`)를 코드 기울기
> (0°/−22°/−40°)로만 굴리는 **스톱갭 상태** → 전용 점프 컷으로 승격한다.

**소스 아트:** `1024×512` RGB(흰 배경), **좌우 512씩 2컷**. 왼쪽 = **1단 점프**(뒷바퀴 근처 짧은
시안 분사), 오른쪽 = **2단 점프**(앞바퀴가 거의 수직으로 들리고 **시안 네온 부스트가 뒤·아래로 길게
분사**). 저장 위치: `assets/images/player/player-jump-src.png`.

> **★ 분할의 함정(가장 중요):** 2단 컷의 **시안 부스트가 뒷바퀴 접지점보다 훨씬 아래까지** 흘러내린다.
> "가장 낮은 불투명 픽셀"로 하단정렬하면 부스트 끝이 바닥에 붙어 **캐릭터가 붕 뜬다.** 반드시
> **뒷바퀴 하단(접지점)** 을 baseline 앵커로 잡고, 부스트는 글로우처럼 **풋프린트 밖으로 넘치게(장식)**
> 둔다. (§2 "글로우/불꽃은 풋프린트 밖으로 넘쳐도 됨" 규칙과 동일.)

**아래는 코딩 에이전트에 그대로 넘기는 작업 지시 프롬프트다:**

```
목표: 첨부한 점프 아트(assets/images/player/player-jump-src.png, 1024×512 RGB 흰배경, 좌우 2컷)를
      분할·정렬해 전용 점프 컷 2장을 만들고, GameScene에서 1단/2단 점프에 각각 적용한다.
      렌더 전용 작업 — sim(src/sim/) 절대 금지, 히트박스 30×42 불변 → SIM_VERSION 업 없음.

1) 전처리 스크립트 신규: scripts/prep-player-jump.py
   - prep-player-sheet.py / prep-ghost-collapse.py를 참고(같은 soft_alpha 배경제거 재사용:
     채도·어두움 기반 → 네이비 차체 + 시안 부스트는 보존, 흰 배경만 알파 0).
   - x=512에서 좌(=jump1)·우(=jump2)로 분할.
   - ★ baseline 앵커 = "뒷바퀴 하단". 최하단 불투명 픽셀이 아님(부스트 꼬리 무시).
     robust 방법: 아래에서 위로 스캔해 '가로 연속 불투명 폭 ≥ 임계'인 첫 행(바퀴는 넓은 원반,
     부스트 물방울은 얇고 흩어짐) = 바퀴 하단. 안 되면 prep-player-sheet의 POSES처럼 프레임별
     wheel-bottom y를 측정해 하드코딩(2컷뿐이라 허용).
   - 두 컷을 동일 배율로(= player-ride의 화면 크기와 일치하게) 리사이즈. 출력 캔버스에서
     두 컷의 '뒷바퀴 하단'을 동일한 y(= 캔버스 높이의 wheel-baseline fraction)에 맞춰 배치.
     부스트는 그 아래로 넘쳐도 됨(필요하면 캔버스 하단 여유를 넉넉히).
   - 산출: assets/game/player-jump1.png, assets/game/player-jump2.png (RGBA).
   - 마지막에 wheel-baseline fraction(예: 0.xx)을 print → GameScene originY에 사용.

2) GameScene.ts 배선(렌더 전용):
   - import/preload: player-jump1, player-jump2 (기존 player-jump 임포트 대체·확장).
   - 텍스처 선택 블록(현 ~2422, "상태별 컷 전환")에서 dead/hit 다음, ride 앞에 점프 분기 복원:
       공중 판정(!gameOver && invincibleFrames===0 && s.player.y > 2)일 때
         jumpsUsed >= 2  → "player-jump2"
         그 외          → "player-jump1"
   - 컷 전환 시: stop()(정지 컷) + setDisplaySize는 ride와 동일 PLAYER_ART_H(확대 금지, dead만 1.25).
     origin은 점프 컷 전용 originY(1)의 print값)로, ride 복귀 시 0.96으로 원복.
   - ★ 코드 기울기 중복 방지: 점프 컷은 각도가 이미 아트에 구워져 있으니 이 컷을 쓰는 동안
     targetAngle = 0으로(현 2446~2452 스톱갭 로직을 점프 컷 사용 시 무력화). 피버 무한점프도
     jump2 아트로 통일 → 각도 0.
   - 착지(y<=2) → "player-ride" + play("player-ride-anim") + origin 0.96 원복.

3) 검증: 점프 시 바퀴가 바닥선(GROUND_Y_PX)에 물리고 부스트만 아래로 흐르는지, 1단↔2단 전환이
   즉시 읽히는지, 착지 시 주행 시트로 매끄럽게 복귀하는지. 기존 player-jump.png(구세대)는 미사용→정리.
```

> **일관성 체크:** 첨부 아트는 이미 현행 바이커 소녀·시안 팔레트라 새 생성 불필요. `prep-player-jump.py`
> 결과가 `player-ride`와 **동일 화면 배율·동일 바닥선**인지만 맞추면 된다(§9 baseline 체크).

---

### 5.2 ghost-runner — 발로 뛰는 헤일로 고스트 + ★엎어짐(신규)

**(A) 달리기 run-cycle** — 현재 `ghost-run.png`(6프레임) 사용 중.
**★2026-06-28 컨셉 갱신:** 맨몸 러너 → **후드 쓴 유령**으로 교체. 주인공(후드 라이더)과
세계관을 통일하되, 주인공은 오토바이·시안 / 고스트는 **맨발 달리기·보라 반투명·골드 헤일로**로
실루엣이 즉시 구분되게. 펄럭이는 후드 자락이 유령 느낌(반투명 끝단 페이드)을 강화. 발 공통 baseline.

```
A minimal neon HOODED GHOST runner for a side-view endless runner, full body mid-run facing right,
a hooded figure (hood up, face in shadow / no facial detail) running on foot (no vehicle),
glowing soft violet (#b39ddb) translucent neon body, the lower edge of the hooded cloak fading to
transparent like a wisp/spirit, a LARGE bright glowing golden angel halo ring (#ffd700) floating
clearly above the hood (roughly shoulder-width, unmistakable), ethereal and semi-transparent,
restrained glow, synthwave apocalypse, flat vector-like, feet on a single common ground baseline,
isolated on a transparent background, no scene, no ground, no shadow, no text, side profile,
single character game asset.
```

```
NEGATIVE: motorcycle, vehicle, wheels, bare head, helmet, visible face, gore, realistic, 3D,
different palette, opaque solid body, text, watermark, white or black background.
```

> **일관성:** 주인공 후드 라이더(§5.1)를 참조 이미지로 올려 `match the hood shape, line weight, glow and palette` 지시 → 같은 세계관의 "달리는 유령 버전"으로 뽑는다.

> 멀티프레임: 포즈별 1장씩 6장 권장 — foot-strike → mid-flight → toe-off → recovery 등 위상 변화.
> 한 장 시트로 받을 땐 `as a horizontal strip of 6 run-cycle frames, evenly spaced with clear gaps, all frames identical scale and lighting`. 시트는 `scripts/prep-ghost-sheet.py`로
> 포즈별 분할·배경제거·상체정렬(프레임 섞임/흔들림 제거) 후 사용.

**(B) ★ 엎어짐(collapse) — 🔄 현재 run 시트와 컨셉 재통일 필요.**

현재 `ghost-collapse.png`는 **옛 맨몸 반투명 러너**(티셔츠·반바지·운동화) 버전이라,
`ghost-run.png`(후드 업 · 노란 눈 · 골드 헤일로 · 다크 퍼플 후디)와 실루엣이 어긋난다.
아래 프롬프트로 **지금 run과 동일 캐릭터**의 3프레임 collapse를 다시 뽑는다.
원본 `assets/images/ghost/ghost-collapse-1~3.png` → `scripts/prep-ghost-collapse.py` →
`assets/game/ghost-collapse.png` 시트. 렌더 훅(`ghost-collapse` 애니)은 그대로.

```
EXACT SAME character as the current ghost-run reference sheet (match hood shape, line weight,
cel-shading, and palette exactly): a dark purple/indigo HOODED figure with the hood UP, face
hidden in shadow except TWO glowing yellow eyes, slim dark pants, running shoes, and a LARGE
bright golden-yellow angel halo ring floating above the hood — but COLLAPSING forward and falling
face-down. Short 3-frame sequence facing right:
(1) stumbling — upper body pitched forward, arms flailing, halo still above the hood;
(2) hands hitting the ground, body folding over onto knees, halo tilting;
(3) lying face-down flat on the ground, hood still up, yellow eyes dimming, the golden halo
slipped off beside the head and fading.
Side view, feet/baseline consistent with the run frames, flat vector-like game sprite, isolated
on a transparent background, no scene, no ground plate, no shadow, no text. Single character.
```

```
NEGATIVE: old athletic t-shirt ghost, shorts-only silhouette, bare head, visible full face,
motorcycle, vehicle, wheels, standing, running, getting up, gore, blood, translucent neon-only
body without hoodie, different colors, different style, no halo, no yellow eyes, text, watermark,
white or black background, realistic, 3D, checkerboard
```

> **일관성:** `ghost-run.png`(또는 run 시트 원본)를 참조 이미지로 반드시 올리고
> `match this exact hooded ghost — same hoodie, yellow eyes, golden halo, proportions` 지시.
> 파일명 예: `ghost-collapse-1/2/3.png`. 적용 후 prep → 인게임에서 run→collapse 전환 시
> 같은 캐릭터로 읽히는지 확인.

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

**(9) wreck-vending — 부서진 자판기 (중간 높이, 일본 거리감) ⬜신규**

> 사용자 요구(2026-06-29). 깨진 화면이 글리치로 명멸(연출은 코드 글로우 보강 가능).

```
A single smashed Japanese street vending machine as a side-view obstacle, strict flat side
elevation (no perspective), medium-tall box silhouette tipped slightly, cracked display glass and
a dented coin panel, dark charred body (#0d0618) with a flickering broken screen glowing magenta
(#ff5fa2) and cyan (#36f9f6), a few spilled cans and dying spark glints, thin smoke wisp,
synthwave city-pop apocalypse, minimal flat vector shapes, clean readable silhouette on a common
ground baseline, isolated on a transparent background, no ground, no scene, no text, single
object, game asset.
```

```
NEGATIVE: perspective, 3D, isometric, intact working vending machine, bright full display, people,
road, ground shadow, text, real brand logos, watermark, white background, realistic photo
```

**(10) tire-pile — 쌓인 폐타이어 더미 (낮음~중간) ⬜신규**

> 사용자 요구(2026-06-29). 낮고 둥글게 쌓인 실루엣 — 1단 점프 단서.

```
A single pile of stacked worn-out tires as a side-view obstacle, strict flat side elevation
(no perspective), low rounded heap of 4-6 dark rubber tires (#0d0618) stacked unevenly, faint
magenta (#ff5fa2) hazard underglow and a dim cyan (#36f9f6) edge light, a little dust, synthwave
apocalypse, minimal flat vector shapes, clean readable silhouette on a common ground baseline,
isolated on a transparent background, no ground, no scene, no text, single object, game asset.
```

```
NEGATIVE: perspective, 3D, isometric, single tire, rolling tire, car, people, road, ground shadow,
text, watermark, white background, realistic photo, scattered spread
```

**(11) manhole-steam — 균열에서 솟은 맨홀 + 증기 (6프레임 애니, 낮음) ⬜신규**

> 사용자 요구(2026-06-29): 증기 분출을 **6프레임**으로 움직이게. ★주의: 바닥 평면이 아니라
> **솟아오른 맨홀**로 읽혀야 점프 단서가 명확(crater-fissure와 동일 원칙). 충돌 박스는 맨홀 융기부.

```
A 6-frame side-view animation strip of a broken manhole erupting from a cracked street as a
side-view obstacle. A heavy round manhole cover popped up and tilted on a raised broken concrete
rim (dark #0d0618 with rusty edges), and a column of pressurized STEAM bursting upward. Across the
6 frames the steam plume grows and curls: (1) thin first jet, (2-4) billowing taller with swirling
volume, (5) full plume with faint magenta (#ff5fa2) and cyan (#36f9f6) neon tint catching the
city light, (6) starting to dissipate. The manhole/rim stays consistent; only the steam animates.
Raised readable vertical mass (NOT a flat floor hole), strict flat side elevation, synthwave
apocalypse, minimal flat vector shapes, strong silhouette, base on a common ground baseline,
horizontal strip of 6 evenly spaced frames, identical scale and lighting, isolated on a
transparent background, no ground plane, no scene, no text, single object, game asset.
```

```
NEGATIVE: top-down hole, flat floor crack, perspective, 3D, isometric, water flood, people, road,
ground shadow, text, watermark, white background, realistic photo, frames at different scales,
steam only with no manhole
```

> **구현 노트:** 위 전부 `building-kit`과 같은 장애물 슬롯의 **텍스처 교체**다. sim 충돌은
> 직사각형(`OBS_W`×`h`) 그대로 — 에셋은 그 박스를 "덮는 그림". 패턴/높이에 따라 어떤 텍스처를
> 쓸지는 `GameScene` 렌더에서 분기(결정론 무관). WIDE_LOW(부서진 차)만 폭 64.
> **애니 장애물(manhole-steam 6프레임)**: 텍스처만 6프레임 시트로 받아 렌더에서 루프 재생 —
> 충돌 박스는 정지 직사각형 그대로(증기는 박스 밖 장식). 결정론 무관.

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
**입체감 고도화**: 완전 플랫이 아니라 셀셰이딩 볼륨(위쪽 하이라이트·아래쪽 그림자면),
비스듬한 3/4 앵글, 모서리 베벨, 상단 림라이트로 "떠 있는 에너지 캔" 느낌. 단, 실사 금속·사진은 금지.

```
A small glowing neon fuel/energy canister power-up for a side-view synthwave game, shown at a
slight 3/4 angle so its front and top faces both read, compact rounded-rectangular jerrycan with a
top handle and short spout, dark teal body (#0a2740) with a bright cool-blue (#4dabf7) neon rim
light and lighter cyan (#9fd4ff) top highlight, soft cel-shaded volume: brighter top face, darker
lower-side shadow face and a subtle inner core glow, beveled glossy edges giving a sense of depth
and mass, a small glowing energy fuel-drop / lightning symbol embossed on the front, soft radial
glow halo underneath, clean stylized game-icon look (semi-flat with dimensional shading), centered,
isolated on a transparent background, no text, floating game item asset, gentle pulse.
```

```
NEGATIVE: flat sticker, fully flat 2D, red canister, realistic gas can, oil drum, bottle, liquid
splash, label text, words, magenta, white background, realistic metal, photorealistic, photo,
harsh shadow, clutter
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

화면 **하단 중앙**의 가로 게이지. `hp-frame` 프레임 1장(우측 하트 아이콘 포함) + 코드 그라데이션 fill.

> **구현 현황(2026-07):** `hp-frame`은 **9-slice가 아니라 종횡비 보존 이미지**로 표시한다.
> 원본 바가 ≈6.19:1이라 `260×20`(=13:1)으로 강제 리사이즈하면 가로로 눌려 비율이 깨지고 저해상이
> 됐던 버그가 있었다. → `prep-ui.py`가 **종횡비 보존 고해상(780×126 @3x)** 으로 굽고, `GameScene`은
> `barH = round(barW·126/780) ≈ 42`로 왜곡 없이 표시. **하트 아이콘은 프레임에 포함**(별도 `hp-icon` 불요).
> fill은 이미지가 아니라 **Canvas 2D 세로 그라데이션 텍스처**(무채색) + `setTint`(색)로 코드 생성한다.
> (`Graphics.fillGradientStyle → generateTexture`는 일부 환경에서 투명 텍스처가 돼 "점만" 보이는 버그.)
> 시트 소스: `assets/images/ui/hp-bar-sheet-src.png`(프레임/fill/하트 3단) → 프레임만 슬라이스해
> `hp-frame-src.png`로 저장 후 prep. fringe 컷은 완화해 네온 글로우를 보존.
> **2026-07-09:** 하트 상단 까만/짙은 청록 띠는 `prep-ui.py`의 `_clear_heart_top_black`으로 제거.
> 만땅 fill은 `HP_R_FRAC≈0.965`(캐비티 우측까지). 하트 꼭대기가 소스에서 잘려 보이면
> `hp-frame-src`를 프롬프트(하트 아웃라인만, 상단 검정 매트 금지)로 재생성.


| 파트            | 용도            | 권장 크기(@3x)          | 비고                              |
| ------------- | ------------- | ------------------- | ------------------------------- |
| `hp-frame`    | 프레임(내부 투명)+하트 | **780×126**(종횡비 보존) | 트림 후 폭 780으로 비례 리사이즈. 하트 우측 포함  |
| ~~`hp-fill`~~ | 채워지는 막대       | (에셋 불요)             | 코드 Canvas 그라데이션 + `setTint`로 대체 |
| ~~`hp-icon`~~ | 좌측 아이콘        | (에셋 불요)             | 하트가 `hp-frame`에 포함됨             |


색은 코드에서 틴트(>50% `#2ecc71`, >25% `#f1c40f`, 이하 `#ff4757`). fill은 밝은 무채색 세로
그라데이션(상단 흰 스펙큘러 → 하단 회색)이라 어느 색으로 틴트해도 자연스럽다.

```
PROMPT (hp-frame — 빈 게이지 프레임):
A horizontal HUD health-bar FRAME (empty gauge container) for a neon synthwave cyberpunk runner,
long thin horizontal capsule with a glowing cyan (#36f9f6) thin outline and faint outer glow.
CRITICAL ALPHA: export as true RGBA PNG with a fully transparent canvas — NO white matte, NO black
matte, NO purple/checker baked into pixels, NO solid backdrop plate behind the bar. Outside the
neon outline must be alpha=0. CRITICAL CAVITY: the inner gauge cavity MUST be a PERFECT HORIZONTAL
RECTANGLE — flat straight top and bottom edges exactly parallel (no slope, no taper, no trapezoid),
only tiny uniform corner rounding, so a plain rectangular fill sits inside with no gaps. The gauge
cavity MUST be empty and FULLY TRANSPARENT (alpha=0) end-to-end — no dark fill, no black plate, no
green/colored fill, no diagonal gloss streak, no glare line, no notch ticks. CRITICAL HEART: a small
cyan neon heart icon at the far right, divided by a thin vertical neon separator; around the heart
the compartment interior is ALSO fully transparent (alpha=0) — the heart is outline+glow only, NO
opaque dark rectangle / black box / solid plate behind or around the heart. Heart must NOT overlap
the gauge rectangle. Minimal flat vector UI, strictly front-facing flat (no perspective), no text,
no numbers.
```

```
PROMPT (hp-fill — 채워지는 막대, 무채색):
A horizontal HUD bar FILL strip, bright neutral light-grey glossy gradient (white highlight along
the top third, soft falloff to mid grey at the bottom) so it can be tinted any color in-engine,
clean rounded ends, faint inner glow, seamless left-right so it tiles/stretches, minimal flat
vector UI, front-facing flat, true RGBA transparent background (alpha=0 outside the strip; no white
or black matte), no text, no outline color, no icons.
```

```
PROMPT (hp-icon — 우측 하트, 선택·분리 생성 시):
A tiny glowing cyan (#36f9f6) neon heart HUD icon only — outline and soft inner glow, NO opaque
dark fill plate, NO black rectangle behind it. True RGBA transparent background (alpha=0 everywhere
except the heart), minimal flat vector, centered, no text, single small icon.
```

```
NEGATIVE: text, numbers, percentage, vertical bar, 3D, perspective, realistic, photo, gradient
background, white background, black background, purple backdrop, checkerboard baked into image,
opaque dark fill inside gauge, black box behind heart, solid plate under heart, green health fill
baked into frame, matte fringe, drop shadow on ground, multiple bars, game character
```

---

### 5.7B UI 패널 — 랭킹 / 튜토리얼 / 게임오버 ★신규 (현재 코드 Rectangle → 에셋 교체)

> 공통: 전부 **9-slice 가능한 프레임**으로 받아 폭/높이 가변 합성. 글자·숫자는 게임에서 코드 렌더
> (Fredoka/Bangers + 물마루/Black Han Sans). 팔레트는 HUD 통일 — 시안 `#36f9f6`/`#00e5ff`, 위험 마젠타 `#ff2d55`,
> 다크 바디 `#060010`~`#10081f`. 정면 플랫(원근 금지), 투명 배경, 글자 없이.

**(1) rank-panel — 상단 거리 랭킹 칩 (가로 4칸, 슬롯형)**

현재: 코드 Rectangle(플레이어=시안 테두리, 고스트=회색). 에셋은 **단일 칩 프레임 1개**를 받아
4벌 복제·틴트. 플레이어 칩은 더 밝은 시안, 고스트 칩은 무채색 틴트(코드).

```
A single horizontal HUD rank chip/badge frame for a neon synthwave runner leaderboard, small
rounded-rectangle plate, dark semi-transparent body (#060010) with a thin glowing cyan (#00e5ff)
neon outline and a brighter accent line along the top edge, subtle beveled ends for 9-slice,
faint outer glow, minimal flat vector UI, front-facing flat. CRITICAL ALPHA: true RGBA PNG —
fully transparent canvas outside the chip (alpha=0); NO white matte, NO black matte, NO purple
backdrop, NO checkerboard baked into pixels, NO bright fringe halo around the glow. Empty inside,
no text, no numbers, no icons.
```

**(2) tutorial-overlay — 시작/튜토리얼 안내 프레임 (중앙 카드)**

현재: 반투명 풀스크린 + 코드 텍스트. 에셋은 **중앙 카드 프레임**(조작 힌트/카피를 코드로 얹음).

```
A centered HUD instruction card panel for a neon synthwave apocalypse runner, rounded rectangle
with a dark glassy semi-transparent body (#10081f, ~70% opacity) and a glowing cyan (#36f9f6)
neon border with soft bloom, a slightly brighter top header strip area (for a title), clean inner
padding area left empty for text, corner notch accents, minimal flat vector UI, front-facing flat.
CRITICAL ALPHA: true RGBA PNG — fully transparent outside the panel (alpha=0); no white/black/
purple matte, no baked checkerboard, no bright fringe. No text, no letters, no icons.
```

**(3) gameover-panel — 결과 패널 프레임 (붉은 네온)**

현재: 코드 Rectangle(`#060010` + `#ff2d55` 테두리 + 상/하 장식선). 에셋은 동일 톤의 프레임.

```
A centered HUD result/game-over panel frame for a neon synthwave apocalypse runner, rounded
rectangle with a very dark body (#060010) and a glowing danger-red/magenta (#ff2d55) neon border,
a bright thin accent line near the top and a faint one near the bottom, ominous soft red bloom,
empty inner area for stats text, minimal flat vector UI, front-facing flat. CRITICAL ALPHA: true
RGBA PNG — fully transparent outside the panel (alpha=0); no white/black/purple matte, no baked
checkerboard, no bright fringe. No text, no letters, no numbers, no icons.
```

```
NEGATIVE: text, letters, numbers, 3D, perspective, realistic, photo, drop shadow on ground,
white background, black background, purple backdrop, checkerboard baked into image, bright fringe,
matte halo, busy ornaments, characters, mascots
```

> **구현:** 셋 다 9-slice. `rank-panel`은 §updateRankPanel의 slot tween 위치에 그대로 깔고,
> `tutorial-overlay`/`gameover-panel`은 기존 컨테이너 배경 Rectangle을 Image(9-slice)로 교체.
> 글자는 지금처럼 코드 텍스트(`resolution: TXT_RES`)로 위에 얹는다 — 버전/언어 무관.

---

### 5.7C 랭킹 전용 패널 — 상단 즉석랭킹 / 최종 주간랭킹 ★신규

> §5.7B (1)/(3)의 범용 프레임을 이 두 용도에 맞춰 **구체화**한 프롬프트. 실제 인게임 화면
> (상단 4칸 실시간 거리 순위 + 게임오버 시 중앙 "주간 랭킹 · 7일 누적" 결과 박스)에 맞춘다.
> 공통: 정면 플랫(원근 금지), 투명 배경, **글자·숫자 없이**, 9-slice 가능한 프레임만.
> 팔레트: 시안 `#36f9f6`/`#00e5ff`, 위험 마젠타 `#ff2d55`, 다크 바디 `#060010`~`#10081f`, 1등 강조 골드` #ffd35c`.

**(A) rank-hud-instant — 상단 즉석 랭킹 칩 (실시간 거리 순위, 가로 슬롯)**

현재 코드 Rectangle. 에셋은 **단일 칩 프레임 1장**을 받아 4벌 복제 후 코드 틴트
(슬롯0=플레이어=밝은 시안, 슬롯1~3=고스트=무채색). 필요하면 1등 전용 골드 림 변형 1장 추가.

```
A single horizontal HUD rank chip for a neon synthwave endless-runner live leaderboard, a small
wide rounded-rectangle plate with a dark semi-transparent body (#060010, ~90% opacity), a thin
glowing cyan (#00e5ff) neon outline, a brighter 1px specular line along the top edge, a small
notch/bevel at both left and right ends for clean 9-slice stretching, a faint outer cyan bloom,
compact flat vector HUD style, front-facing flat elevation. CRITICAL ALPHA: true RGBA PNG with a
fully transparent canvas — alpha=0 everywhere outside the chip; NO white matte, NO black matte,
NO purple/solid backdrop, NO checkerboard baked into pixels, NO bright/white fringe around the
glow, NO opaque dark rectangle stuck to corners. Empty inside, no text, no numbers, no icons,
no portrait.
```

1등 강조 변형(선택):

```
Same wide rounded-rectangle HUD rank chip but for the #1 leader: a warm gold (#ffd35c) neon outline
with a soft gold outer glow and a subtle laurel/crown-less gold accent along the top edge, dark
semi-transparent body, flat vector, front-facing flat. CRITICAL ALPHA: true RGBA transparent
canvas (alpha=0 outside the chip; no white/black/purple matte, no bright fringe). Empty inside,
no text.
```

**(B) weekly-ranking-panel — 최종 주간 랭킹 결과 패널 (게임오버 중앙 카드)**

현재 코드 Rectangle 컨테이너. 에셋은 **중앙 결과 카드 프레임 1장**. 안쪽은 위→아래로
① 헤더 리본("주간 랭킹 · 7일 누적" 자리) → ② 큰 수치 배지("거리 1573M" 자리) →
③ 3~4행 순위 리스트 영역(행 구분선) → ④ 하단 CTA("ONE MORE RUN?") 영역. 전부 **글자는 코드로** 얹음.

```
A centered vertical result panel frame for a neon synthwave apocalypse runner weekly-leaderboard
screen, tall rounded rectangle with a very dark glassy body (#0a0018, ~92% opacity) and a glowing
cyan (#36f9f6) neon border with soft bloom; inside, purely as empty decorative zones with no text:
a highlighted header ribbon strip across the top, a large emphasized number-badge area just below
it, a middle list area subdivided by three or four faint horizontal divider lines for ranking rows,
and a slim call-to-action button slot at the bottom edge; thin gold (#ffd35c) accent reserved near
the top for the #1 row; front-facing flat elevation, minimal flat vector UI, subtle inner vignette.
CRITICAL ALPHA: true RGBA PNG — fully transparent canvas outside the panel (alpha=0); NO white
matte, NO black matte, NO purple backdrop, NO checkerboard baked into pixels, NO bright/white
fringe or jagged halo around the cyan glow, NO opaque dark corner plates. No text, no letters,
no numbers, no icons, no characters.
```

```
NEGATIVE: text, letters, numbers, kanji, 3D, perspective, realistic, photo, drop shadow on ground,
white background, black background, purple backdrop, checkerboard baked into image, bright fringe,
matte halo, jagged glow edge, opaque corner fill plates, busy ornaments, characters, mascots,
portraits, tiny illegible details
```

> **구현:** 둘 다 9-slice. `rank-hud-instant`는 `updateRankPanel`의 slot tween 좌표에 배경으로
> 깔고 슬롯별 `setTint`(플레이어 시안 / 고스트 회색 / 1등 골드). `weekly-ranking-panel`은 게임오버
> 컨테이너의 배경 Rectangle을 Image(9-slice)로 교체하고, 리본·수치·순위행·CTA 문구는 기존 코드
> 텍스트를 각 영역 위에 배치. 색·레이아웃 상수는 HUD와 공유 → 언어/버전 무관.

---

### 5.7F btn-replay — 게임오버 중앙 Replay CTA ★신규

> 게임오버 3분할 UI(일간 | Replay | 주간)의 **가운데 버튼**. 글자는 코드로 `REPLAY` /
> `다시하기`를 얹으므로 에셋은 **빈 프레임만**. 세로로 약간 긴 네온 CTA.
> 상세 레이아웃·의존성: `docs/design/ux-polish-2026-07.md` §3.


| 파트           | 용도            | 권장 크기(@3x)     | 비고                       |
| ------------ | ------------- | -------------- | ------------------------ |
| `btn-replay` | 중앙 재시작 버튼 프레임 | **360×420** 전후 | 9-slice 가능하면 더 좋음. 내부 비움 |


```
PROMPT (btn-replay):
A vertical neon CTA button frame for a synthwave cyberpunk endless-runner game-over screen,
tall rounded hexagon or capsule plate (slightly taller than wide), very dark glassy body
(#0a0018, ~90% opacity), thick glowing cyan (#36f9f6) neon outline with soft outer bloom and a
brighter 1px inner specular edge, empty center for code-rendered "REPLAY" text, minimal flat
vector HUD, front-facing flat elevation. CRITICAL ALPHA: true RGBA PNG — fully transparent
canvas outside the button (alpha=0); NO white matte, NO black matte, NO purple backdrop,
NO checkerboard baked into pixels, NO bright fringe around the glow. No text, no letters,
no icons, no arrows baked in (optional tiny chevron accent OK if empty of glyphs).
```

```
NEGATIVE: text, letters, REPLAY word baked in, numbers, 3D, perspective, realistic, photo,
white background, black background, purple backdrop, checkerboard, bright fringe, matte halo,
busy ornaments, characters
```

> **구현(✅):** `GameScene` 게임오버 3열(`panel-daily` | `btn-replay` | `panel-weekly`).
> 가운데 Image에 코드 텍스트 `REPLAY` 오버레이, 탭 히트영역만 `startRun(true)`.
> 전체 화면 탭 재시작은 제거. prep: `scripts/prep-panels.py`.

---

### 5.7G warn-bubble — 암전 예고 WARNING 말풍선 ✅적용

> 정전(blackout) warn 페이즈에 띄우는 **뾰족(스파이크) 뱃지**. **WARNING baked** 에셋 적용
> (`blackoutWarnBubble` Image). 알파 사인 점멸은 코드 유지.
> 상세: `docs/design/ux-polish-2026-07.md` §4.
> prep: `warn-bubble-src.png` → `prep-ui.py` → `assets/game/warn-bubble.png` (**≈1024×334 + 흰 스트로크 pad**).
> 인게임: **우측 하단**, 표시 폭 **≈360px**. 흰 외곽 스트로크는 prep에서 합성.


| 파트            | 용도              | 권장 크기(@3x)  | 비고                                        |
| ------------- | --------------- | ----------- | ----------------------------------------- |
| `warn-bubble` | 스파이크 WARNING 뱃지 | **504×164** | WARNING baked. 위험 마젠타 `#ff2d55`/`#ff5fa2` |


```
PROMPT (warn-bubble — 빈 프레임, 글자는 코드):
A spiky warning speech-bubble HUD frame for a neon synthwave cyberpunk runner blackout alert,
horizontal rounded rectangle body with 6–8 sharp triangular spikes jutting outward from the
edges (hazard / danger vibe, not cute), dark fill (#1a0010, ~92% opacity), thick glowing
magenta/danger-pink (#ff2d55) neon outline with soft outer bloom, empty center for code-rendered
"WARNING" text, minimal flat vector UI, front-facing flat, no perspective. CRITICAL ALPHA: true
RGBA PNG — fully transparent canvas outside the bubble (alpha=0); NO white matte, NO black matte,
NO purple backdrop, NO checkerboard baked into pixels, NO bright fringe around the glow. No text,
no letters, no icons, no exclamation mark baked in.
```

```
PROMPT (warn-bubble-baked — 선택, WARNING 글자 포함):
Same spiky magenta neon warning speech-bubble as above, but with the word WARNING centered in
bold futuristic all-caps (Orbitron-like), color #ff5fa2 with dark stroke, still true RGBA
transparent outside the bubble, no other text, no icons.
```

```
NEGATIVE: cute soft bubble, cloud shape, 3D, perspective, realistic, photo, white background,
black background, purple backdrop, checkerboard, bright fringe, cyan outline (use magenta/danger
only), busy ornaments, characters, skulls, multiple bubbles
```

> **구현(완료):** warn 페이즈에 baked Image 표시, 알파 `0.25↔1.0` 사인 점멸. Graphics 스톱갭 제거.

---

### 5.7H icon-warning / icon-fever — 사이렌·피버 아이콘 ✅적용

> 코드 스파이크 뱃지 → **아이콘 PNG**. 상세: `docs/design/fever-warning-icon-asset.md`
>
>
> | 키              | 모티프           | 색               | 런타임                            |
> | -------------- | ------------- | --------------- | ------------------------------ |
> | `icon-warning` | 사이렌 + WARNING | 네온 핑크           | `assets/game/icon-warning.png` |
> | `icon-fever`   | 번개+링          | 형광 노랑 `#f0f838` | `assets/game/icon-fever.png`   |
>
>
> 우측 하단 112px, 상호배제·호흡 점멸(`sin(t*0.006)`). prep: `prep_icon_warning` / `prep_icon_fever`.

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

### 5.7E bg-city — 배경 스카이라인 고도화 ★신규 (현재 코드 드로우 `drawSkyline` → 에셋 교체)

> 현재 배경은 `drawSkyline`/`drawSky` **코드 드로우 실루엣**(단색 사각형 빌딩). 이를 **가로 심리스
> 패럴랙스 PNG 2종**으로 교체해 왕복 전환한다(바이옴 `BIOMES[0]`↔`BIOMES[1]`와 연동). 둘 다:
> **가로로 이어붙여도 이음매가 안 보이게(seamless/tileable), 정면 측면도(원근 금지), 투명 PNG,
> 상단·하단 여백은 투명**(하늘은 `drawSky`가 그리므로 건물/구조물만). 팔레트는 기존 톤 유지 —
> 다크 실루엣 `#0a0a18`~`#1a1330`, 창문/네온 시안` #36f9f6`·마젠타` #ff2d55`·앰버` #ffb347`, 연기 회보라` #3a3350`. **폭은 화면 주기(≈1040px)의 정수배**로 받아` drawSkyline`처럼 2벌 배치.
>
> **창문 질문 답:** 넣는 게 좋다 — 단, **드문드문·저광량**으로. 대부분 어두운 창 + 소수만 점등
> (시안/앰버)하면 "종말 후 드문 생존 불빛" 무드가 살고, 과밀하면 미니멀 톤이 깨진다.

**(1) bg-buildings-far — 부서진·연기 나는 아파트 스카이라인**

```
A seamless horizontally-tileable background layer of a post-apocalyptic synthwave city skyline:
a row of tall dark apartment/office towers in flat silhouette (deep indigo #12102a to #1a1330),
some buildings partially collapsed or broken at the top with jagged rubble edges, thin plumes of
dark smoke rising from a few rooftops, sparse scattered lit windows (most windows dark, only a few
glowing faint cyan #36f9f6 and amber #ffb347) suggesting rare survivors, subtle restrained neon
rim light, strict front-facing side elevation (no perspective, no vanishing point), the top and
bottom edges left empty/transparent (sky drawn separately), clean minimal flat vector style,
isolated on a transparent background, the left and right edges must match so it tiles seamlessly,
no ground, no text, no characters, no foreground objects.
```

**(2) bg-bridges-far — 고가 다리·고가도로 실루엣**

```
A seamless horizontally-tileable background layer of elevated highway overpasses and bridges in a
post-apocalyptic synthwave city: several layered flat silhouettes of raised roadways on tall
support pillars crossing at different heights (deep indigo #12102a to #1a1330), a few broken deck
sections with dangling cables and thin rising smoke, sparse faint neon strip lights along the
guardrails (cyan #36f9f6 and magenta #ff2d55, most unlit), restrained glow, strict front-facing
side elevation (no perspective), top and bottom edges left empty/transparent, clean minimal flat
vector style, isolated on a transparent background, left and right edges must match for seamless
tiling, no ground, no text, no vehicles, no characters.
```

**(3) bg-bridges-curved-far — 곡선형(아치·현수) 다리 실루엣**

> (2)는 직선 고가도로. 이건 **곡선 다리 변형** — 아치교/현수교의 부드러운 커브로 실루엣에 리듬을 준다.
> (2)와 왔다갔다 쓰거나 바이옴별로 나눠 쓸 수 있게 **같은 톤·같은 심리스 규칙**으로 뽑는다.

```
A seamless horizontally-tileable background layer of large CURVED bridges in a post-apocalyptic
synthwave city: flat silhouettes of arched and suspension bridges with smooth sweeping curved
spans and gently curving cables/arches (deep indigo #12102a to #1a1330), tall slender towers,
a few broken or sagging deck sections with dangling cables and thin rising smoke, sparse faint
neon strip lights following the curves of the arches and cables (cyan #36f9f6 and magenta #ff2d55,
most unlit), restrained glow, strict front-facing side elevation (no perspective, no vanishing
point), top and bottom edges left empty/transparent, clean minimal flat vector style, isolated on
a transparent background, left and right edges must match for seamless tiling, no ground, no text,
no vehicles, no characters.
```

```
NEGATIVE: perspective, vanishing point, 3D, realistic, photo, ground, street level, foreground
objects, characters, vehicles, text, watermark, white or black background, dense bright windows,
seams at edges, drop shadow, straight-only flat overpass
```

> **구현:** `drawSkyline`가 그리던 자리에 `bg-buildings-far`/`bg-bridges-far`/`bg-bridges-curved-far`
> 중 택일한 Image 2벌을 `SKYLINE_PARALLAX` 속도로 배치(1040px 주기 심리스), 바이옴 전환 시 크로스페이드로 교체.
> (직선 다리 ↔ 곡선 다리 ↔ 빌딩을 바이옴/구간별로 번갈아 쓰면 장거리에서 배경 단조로움이 준다.)
> 연기는 (a) 에셋에 옅게 베이크 + (b) 필요하면 굴뚝 위 코드 파티클(렌더 전용)로 애니메이션 보강.
> 창 점등 깜빡임도 코드로 소수만 랜덤 알파 펄스 → 정적 실루엣에 미세한 생동감.

---

### 5.8 코드 드로우로 대체된 것 (이미지 생성 불필요)


| 요소                   | 함수                   | 메모                                           |
| -------------------- | -------------------- | -------------------------------------------- |
| 노을 태양                | `updateCodeSun()`    | 그라데이션 원 + 스캔라인 + 줄무늬 일렁임 + 맥동 글로우 링          |
| 화염 메테오               | `drawCodeMeteor()`   | 난류 불혀 다발 + 깜빡이는 코어 + 튀는 불티(이글이글), 점→원 성장·페이드 |
| 경고 레이저               | `drawLasers()`       | 태양 뒤 사선 스윕, yMid를 태양 세로 범위 내 고정, 속도 연동       |
| 하늘/스카이라인/그리드/속도선/트레일 | `createBackground` 외 | 패럴랙스·점프 연동 포함                                |


> 이들은 정지 이미지보다 가볍고 60fps에 유리하며 `sim.state`에 읽기 전용 연동된다.
> 굳이 이미지로 되살릴 이유가 생기면 이 표를 갱신하고 프롬프트를 §5에 추가한다.

---

## 6. 오디오 (BGM / SFX) & 인트로 영상

> 이미지 생성기로는 음원·영상 못 뽑음. **BGM/SFX = Suno·Udio·ElevenLabs·freesound**,
> **영상 = Sora·Runway·Veo**.

### 6.1 BGM — 시티팝 × 픽셀·카툰 레트로 (게임용)

> **왜 이 믹스인가:** 순수 시티팝은 분위기(무드)는 좋지만 “아케이드 한 판” 느낌이 약하다.
> 픽셀/카툰 레트로(치ptune·FM·스퀘어 리드)를 **멜로디 레이어에만** 얹으면 시티팝 하모니는
> 유지하면서 게임 정체성이 살아난다. 보컬·오케스트라는 SFX·UI 틱과 주파수 충돌이 나서 금지.

**게임 BGM 공통 제약 (모든 프롬프트에 붙일 것):**

| 제약 | 값 | 왜 |
| --- | --- | --- |
| 루프 | 60–90s, seamless, no fade-in/out | Phaser `loop: true` — 이음매 클릭 = 몰입 파괴 |
| BPM | 메인 108–116 / 피버 128–136 | 러너 탭 리듬과 맞추되 너무 빠르면 피로 |
| 밀도 | mid 비우기, lead는 짧게·띄엄띄엄 | 점프·피격·연료 SFX가 들어갈 자리 |
| 보컬 | **instrumental only** | 가사 = 주의 분산 + 루프 어색 |
| 사이렌 | distant, periodic, low in mix | 세계관 힌트만 — 멜로디를 덮지 말 것 |
| 볼륨 가정 | 최종 인게임 ~0.30–0.40 | 생성 단계에서 이미 “배경”으로 뽑을 것 |

> MP3/OGG 128–192kbps. 메인 `bgm-main` **1.0** / 인트로 `bgm-intro` **0.16** / 피버 `bgm-fever` **0.07**,
> 인트로↔메인 **900ms** / 피버 전환 **220ms** 크로스페이드. 피버 종료·사망 시 메인 복귀.

---

#### (A) 메인 플레이 — 시티팝 뼈대 + 16-bit 카툰 리드 ★적용

> **적용 음원:** `assets/audio/bgm-main.mp3` (`Midnight_Motorway`) —
> Phaser 키 `bgm-main`, 루프·볼륨 1.0. 인트로/howto 종료 후 페이드인, 일시정지 시 pause.

```
Suno / Udio:
[genre] city pop, synthwave, 16-bit game soundtrack, cartoon retro arcade
[feel] nostalgic late-night neon highway, playful but tense apocalypse, endless runner energy,
       cute-danger contrast like a cartoon racing through a ruined city
[instrumentation]
  - warm city-pop electric guitar chord stabs (short, rhythmic, not shredding)
  - round slap/synth bass with slight FM bite
  - 80s drum machine + light chiptune percussion ticks (not full 8-bit drums)
  - bright square/triangle wave melody lead, simple catchy 4-bar hook, cartoonish bounce
  - soft pad under the chords for neon atmosphere
  - distant emergency siren wailing occasionally far in the background (very low, not intrusive)
  - light cassette/lo-fi warmth, restrained reverb (keep midrange clear for game SFX)
[structure] seamless 60-90s instrumental loop, clear downbeat every bar, no vocals, no fade-out,
            loop-ready, leave space between melody phrases
[BPM] 110-114
NEGATIVE: modern EDM drop, heavy dubstep bass, orchestral strings, choir, full vocal pop,
          acoustic folk guitar, loud siren drowning melody, busy wall-of-sound, trap hi-hats,
          photoreal cinematic trailer music, sad piano ballad
```

---

#### (B) 피버 스팅 — 짧은·빠른 호흡 루프 ★적용

> **왜 긴 곡이 안 맞나:** 피버는 sim상 **`FEVER_SEC = 2.5초`** 뿐이고 자주 재발동된다.
> 45–60초 시티팝 레이어는 훅이 나오기 전에 끝나고, 같은 도입부만 반복되어 피로하다.
> → **8–12초 심리스 루프**, 첫 박부터 풀 에너지, BPM 빠르게, 카툰/치ptune 펀치.

> **적용 음원:** `assets/audio/bgm-fever.mp3` (`Combo_Multiplier`) —
> Phaser 키 `bgm-fever`, 루프·볼륨 0.07. **메인 BGM은 끄지 않고** 위에 레이어로 얹음.
> 인게임 페이드 **220ms** (`BGM_FEVER_FADE_MS`) — 긴 페이드면 피버 내내 볼륨만 오르내림.

```
Suno / Udio:
[genre] 16-bit fever jingle, chiptune power-up loop, cartoon retro arcade stinger
[feel] instant rush, neon boost, 2-3 second gameplay burst that may re-trigger often,
       playful hype not dark boss metal — like a cartoon motorcycle nitro flash
[use case] endless-runner FEVER mode lasting only ~2.5 seconds; player will hear the SAME
           opening many times per session — must stay fresh and not fatiguing
[instrumentation]
  - cold-start: NO ambient intro, NO riser buildup — energy from beat 1
  - tight square/pulse lead hook (2-bar earworm max), cartoon bounce
  - punchy chip bass ostinato + fast 16-bit drums (noise snare, short kick)
  - tiny FM sparkle / arpeggio glitter every bar (power-up candy)
  - optional one-shot "whoosh" accent on bar 1 only (very short)
  - leave a little midrange space for jump/hit SFX
[structure] seamless **8–12 second** instrumental loop ONLY (not 45s+),
            loop point must be invisible, no fade-in/out, no vocals,
            designed so any 2.5s window still sounds exciting
[BPM] 148-160
NEGATIVE: long cinematic intro, slow city-pop groove, soft pads, ballad, orchestra, choir,
          vocals, 45-90s song form, brostep drop, metal, horror drone, continuous siren,
          sleepy lo-fi, trap hi-hat wash, anything that needs 10+ seconds to "get good"
```

---

#### (C) 타이틀 / 인트로 — 아포칼립스 × 픽셀 레트로 × 장엄한 “지구를 구하라” ★적용

> **적용 음원:** `assets/audio/bgm-intro.mp3` (`Last_Light_of_the_World`) —
> Phaser 키 `bgm-intro`, 루프·볼륨 0.16. 인트로 슬라이드(+howto) 중 재생 → 플레이 시작 시 main과 크로스페이드.

> **왜 (A)와 다른가:** 메인 BGM은 “달리는 쾌감”, 인트로는 “왜 달리느냐”의 스테이크.
> 시티팝 감성 라디오가 아니라 **멸망 직전의 지구를 구하러 떠나는 마지막 라이더** —
> 장엄하되 실오케스트라가 아니라 **16-bit/카툰 레트로로 번역된 서사**여야 비주얼(픽셀·네온)과 맞는다.
> 인트로 구간은 SFX가 거의 없어 mid를 조금 더 채워도 된다.

```
Suno / Udio:
[genre] 16-bit apocalyptic game title theme, cartoon retro RPG overture, synthwave, pixel epic
[feel] majestic but hopeful last stand, "save the dying earth", lone hero before the run,
       ruined neon city under a burning sunset, solemn cartoon-epic (not horror, not comedy)
[story cue] the final rider sets out to uncover why the meteors fell and to save what's left
            of the world — weighty, heroic, bittersweet resolve
[instrumentation]
  - slow rising FM / chip-brass fanfare motif (short heroic call, 4–8 notes) — the "save the earth" hook
  - deep synth choir pads voiced like 16-bit RPG title screens (synthetic, not real human choir)
  - warm analog bass drone + soft timpani-like chip percussion (sparse, ceremonial)
  - distant thunderous low boom every 8–16 bars (meteor / world-stakes pulse), very low in mix
  - faint square-wave countermelody with cartoon-pixel clarity (keeps it game-like, not trailer)
  - restrained neon synth shimmer; optional very distant muffled siren as texture only
  - NO busy city-pop guitar groove, NO dance drums — this is overture, not highway cruise
[structure] 8–15s majestic opening swell → seamless 60–90s instrumental loop body,
            no vocals, no fade-out, loop-ready; dynamics wide but peak below "trailer loud"
[BPM] 84-92 (half-time feel ok; keep a clear pulse for the slide timing)
NEGATIVE: happy city pop, upbeat disco, acoustic folk, real orchestral Hollywood trailer,
          loud choir vocals, metal, horror drones, jump-scare stingers, trap hi-hats,
          EDM drop, comedy cartoon SFX spam, lyrics, continuous loud siren
```

---

#### (D) 치ptune 비중↑ 변형 — “더 픽셀/카툰”이 필요할 때

> (A)가 너무 시티팝·성인 라디오 같으면 이걸로 재생성. 시티팝 코드는 남기고 **리드·퍼커션만**
> 8-bit/카툰으로 밀어 게임다움을 올린다.

```
Suno / Udio:
[genre] 8-bit / 16-bit video game music, city pop harmony, cartoon retro arcade runner
[feel] pixel-art motorcycle chase through neon ruins, cute but urgent, Saturday-morning cartoon
       energy mixed with 80s Japanese city night
[instrumentation]
  - chord progression and groove inspired by city pop (major7 / sus colors), but voiced on
    chip-style pulse and FM electric-piano patches
  - punchy square-wave bassline (simple, looping ostinato)
  - classic video-game drum kit (noise snare, short kick) + light cowbell/clave cartoon ticks
  - memorable chiptune lead melody with call-and-response, short rests between phrases
  - optional tiny sample-like “cartoon boing” accent every 8 bars (subtle, not comedy sketch)
  - distant muffled siren as texture only
[structure] seamless 60-90s instrumental loop, strong downbeats for runner sync, no vocals,
            no fade-out, midrange not overcrowded
[BPM] 112-116
NEGATIVE: pure modern city pop with live band only, realistic orchestra, vocal hooks,
          phonk, hyperpop, heavy metal, long ambient pads with no rhythm, loud continuous siren
```

---

#### (E) 게임오버 / 결과 — 짧은 스팅 + 루프 바디 ★적용

> **적용 음원:** `assets/audio/bgm-gameover.mp3` (`The_Final_Quarter`) —
> Phaser 키 `bgm-gameover`, 루프·볼륨 0.42. `EV_GAME_OVER` 시 메인/피버와 크로스페이드,
> 재시도(인트로) 시 인트로 BGM으로 페이드 전환.

```
Suno / Udio:
[genre] city pop, soft synthwave, 16-bit game over jingle
[feel] bittersweet neon afterglow, “one more run”, not depressing funeral
[instrumentation]
  - 3-5s descending chiptune sting (cartoon “fail but charming”), then soft city-pop pad loop
  - clean guitar or electric piano, minimal drums or none
  - tiny square-wave echo of the main theme motif (recognition)
[structure] short sting + 30-45s quiet instrumental loop, no vocals
[BPM] 88-96
NEGATIVE: horror stinger, scream, heavy impact boom, sad solo violin, choir, long silence
```

---

**생성 후 체크리스트**

1. 헤드폰으로 **루프 이음매** 2회 이상 청취 — 클릭/키 점프 있으면 재생성 또는 DAW에서 크로스페이드.
2. 인게임 볼륨 0.35에서 **점프 SFX**와 동시에 들어보기 — 멜로디가 가리면 (A)→(D) 또는 mid 비운 재생성.
3. 피버는 (B)를 (A)와 **같은 키**로 맞출수록 전환이 자연스럽다 (안 맞으면 피치±2로 보정 가능).

### 6.2 SFX 목록 (전부 기존 sim 이벤트에 얹음 — 렌더 전용)

> **출처 요약:** 점프/피격/연료 = 무료 실샘플 ([`CREDITS-sfx.md`](../../assets/audio/CREDITS-sfx.md)).
> 피버·틱·제침·사망 = 합성 임시 → 아래 프롬프트로 교체 가능.

| 트리거                    | 파일 / 톤                                                          | 길이                            | 상태  |
| ---------------------- | -------------------------------------------------------------- | ----------------------------- | --- |
| 점프 (EV_JUMP)           | `sfx-jump.wav` — 기어 변속 부르릉 (Mixkit changing gears)              | ~0.4s (2단 `detune:200`) · vol 0.7 | ✅   |
| 피격 (EV_HIT)            | `sfx-hit.wav` — **드리프트/스키드** (Freesound Sonic Skid CC0)         | ~0.46s                        | ✅   |
| 연료 획득 (EV_POTION)      | `sfx-potion.wav` — 게임 픽업/리필 톤 (Mixkit health recharge; gulp는 무음급이라 교체) | ~0.45s · vol 0.35             | ✅   |
| 피버 시작 (EV_FEVER_START) | `sfx-fever.wav` — 신스 파워 서지 (합성) → 프롬프트 A                      | ≤0.8s                         | 🔄  |
| 정전 WARNING             | `sfx-siren.wav` — 폴리스 사이렌 루프 (Mixkit Police siren US)           | warn ~2.2s 동안 루프 · vol 0.45 | ✅   |
| 제침 (고스트 finished)      | `sfx-overtake.wav` — **푸쉬시** (Mixkit Ghostly whoosh)               | ~0.38s · vol 0.65             | ✅   |
| 콤보틱 / UI탭              | `sfx-tick.wav` — 시안 블립 (합성) → 프롬프트 C                           | ≤0.1s                         | 🔄  |
| 사망 (EV_GAME_OVER)      | `sfx-death.wav` — 하강 톤 (합성) → 프롬프트 D                           | ≤0.4s                         | 🔄  |
| 니어미스                   | — (코어에서 `EV_NEAR_MISS` 제거됨)                                    | —                             | ❌   |


> **구현 (2026-07-10):** `preload()` → `load.audio` → `handleStepEvents()`(및 제침/콤보/CTA)에서 재생.
> 합성 재생성: `npm run gen:sfx` (점프/피격/연료 WAV는 **덮어쓰지 말 것** — 실샘플).
> WebView 자동재생: 첫 제스처 후 `unlockAudio()`. 우상단 🔊 음소거 토글 (`UserSettings.audio.muted`).
>
> **왜 `syncVisuals`가 아니라 `handleStepEvents`인가:** 이벤트 비트는 스텝당 1회만 살아 있고,
> 비주얼 동기화 루프는 매 렌더 프레임이라 같은 비트를 여러 번 읽어 소리가 중복될 수 있다.

#### 6.2.1 AI SFX 가드레일 (Gemini / Suno / ElevenLabs 공통 — 필수)

> **문제:** Gemini 등이 “효과음” 요청을 **1분+ 배경음악(BGM)** 으로 만들어 버리는 경우가 많다.
> SFX는 **원샷·초단위**다. 아래를 프롬프트 **맨 앞·맨 뒤**에 반복해서 붙일 것.

**하드 가드레일 (복붙 블록):**

```
HARD CONSTRAINTS — GAME SOUND EFFECT (NOT MUSIC):
- Output ONE short one-shot SFX only. Total length MUST be under 1.0 second (prefer 0.2–0.8s).
- DO NOT create background music, BGM, loop, song, melody bed, beat, or ambient pad.
- DO NOT make anything longer than 1 second. If you tend to make 60s tracks, STOP — that is wrong.
- No intro, no outro, no fade-in longer than 20ms, no silence padding over 50ms.
- Mono or stereo OK. Dry, punchy, game-ready. Leave headroom (no clipping).
- Single event only — not a sequence of many events over time.
```

**네거티브 (같이 붙이기):**

```
NEGATIVE: background music, BGM, soundtrack, 1 minute, 60 seconds, long loop, full song,
verse chorus, drums beat groove, cinematic trailer score, ambient drone bed, podcast,
voiceover narration, silence padding, repeated loop cycle
```

**길이 체크:** 받은 파일이 **1초 초과**면 폐기하고 재생성. DAW/스크립트로 트림해도 되지만,
모델이 BGM을 뽑으면 트림해도 “곡 조각”이라 게임 톤이 안 맞는다 → **프롬프트부터 다시**.

#### 6.2.2 교체용 에셋 프롬프트 (합성 → 실샘플/AI)

**A — 피버 시작 (`sfx-fever`, ≤0.8s)**

```
(HARD CONSTRAINTS block above)

Retro synthwave power-up one-shot for a neon endless-runner fever mode.
Ascending synth sweep + sparkle glitter, triumphant but tiny, arcade UI stinger.
Duration 0.6–0.8 seconds ONLY. Not a song. Not a loop.

NEGATIVE: (negative block above)
```

**B — 제침 (`sfx-overtake`, ≤0.25s)**

```
(HARD CONSTRAINTS block above)

Short rising synth blip/sweep for overtaking a rival ghost in a racing game.
Bright cyan neon UI success tick. Duration 0.12–0.22 seconds ONLY.

NEGATIVE: (negative block above)
```

**C — 콤보/UI 틱 (`sfx-tick`, ≤0.1s)**

```
(HARD CONSTRAINTS block above)

Tiny cyan UI click/blip for combo increment and button tap. Soft, clean, not harsh.
Duration 0.05–0.09 seconds ONLY.

NEGATIVE: (negative block above), glass shatter, explosion, long whoosh
```

**D — 사망 (`sfx-death`, ≤0.4s)**

```
(HARD CONSTRAINTS block above)

Short descending tone + light grit for player crash/game-over sting.
Melancholy but punchy, not dramatic orchestra. Duration 0.25–0.4 seconds ONLY.

NEGATIVE: (negative block above), long sad piano piece, vocal choir
```

**E — (선택) 점프 부르릉 재생성** — 현 Mixkit 트림이 마음에 안 들 때

```
(HARD CONSTRAINTS block above)

Quick motorcycle engine rev burst / aggressive exhaust pop for a jump action.
High-rev "vroom" one-shot, dirty exhaust, no idle loop. Duration 0.3–0.5 seconds ONLY.

NEGATIVE: (negative block above), long ride-by, 10 second engine idle
```

**F — (선택) 피격 드리프트 재생성**

```
(HARD CONSTRAINTS block above)

Short car/bike tire drift skid screech for hitting an obstacle.
Sharp rubber squeal, one skid only. Duration 0.25–0.45 seconds ONLY.

NEGATIVE: (negative block above), long burnout, 10 second drift sequence, crash explosion bed
```

**G — (선택) 연료 꿀꺽 재생성**

```
(HARD CONSTRAINTS block above)

Cute double gulp / glug-glug liquid swallow for picking up a fuel can.
Wet throat gulp, satisfying, cartoonish but not silly. Duration 0.35–0.6 seconds ONLY.

NEGATIVE: (negative block above), pouring faucet 5 seconds, soda fizz bed, voice saying "ahhh"
```

#### 6.2.3 무료 소스 재다운로드 메모

| 슬롯 | 추천 검색 | 라이선스 |
|------|-----------|----------|
| 점프 | Mixkit `motorcycle` / Freesound CC0 `motorcycle rev` | Mixkit Free / CC0 |
| 피격 | Freesound CC0 `skid` / `tire squeal` (짧을수록 좋음) | CC0 |
| 연료 | Freesound CC0 `gulp` / `drink swallow` | CC0 |

ZapSplat 등은 **계정·귀속 조건**이 갈리니, 이 프로젝트는 **Mixkit Free + Freesound CC0** 만 기본으로 쓴다.

### 6.3 인트로 / 튜토리얼 비주얼 (#최후 폴리시)

**배경 스토리 (2026-07-06 확정):** 어느 날 지구에 떨어지기 시작한 운석들로 멸종위기에 처한 인간들.
많은 영웅들이 비밀을 파헤치기 위해 동분서주했지만 모두 재해로 죽고 주인공만 남았다. 주인공은
이전 영웅들이 달렸던 그 길을 홀로 파헤치고 있다. 이 서사가 게임 내 **고스트(헤일로=죽음 표식)**·
**wreck-bike(부서진 라이더 잔해, §5.3(8))** 에셋의 존재 이유가 된다 — 인트로는 새 컨셉을 발명하지
않고 이 기존 시각 어휘를 재사용한다.

**카피(코드 오버레이, 이미지엔 굽지 말 것):**

```
종말이 다가오자, 수많은 이들이 그 비밀을 쫓다 쓰러졌다.
마지막 등불, 그 흔적을 밟으며 다시 달린다.
```

> **★2026-07-06 확정 — 매체 변경(AI 영상 → 정지 이미지 + 코드 세로 슬라이드):**
> 영상은 3초 내내 카메라·라이더 모션이 일관되게 뽑혀야 하는 도박이지만, 이미지는 한 장만 잘
> 나오면 끝. webm/mp4 폴백·실기기 디코드 스터터 걱정도 통째로 사라짐.
>
> **노출 정책(2026-07-09 개정):** **매 판** 인트로 표시. 우측 하단 **Start** 로만 종료 →
> **시작 안내 오버레이 없이 바로 플레이**. 화면 아무 곳 탭으로는 스킵하지 않음.
>
> **왜 이미지만으로도 "많은 영웅이 죽었다"까지 안 담나:** 이미지는 무드와 스테이크만 심고,
> 조사/미스터리 층은 위 카피가 담당.

**구성:** 세로로 긴 캔버스(권장 **1536×3072** 또는 **2048×4096**, 약 1:2). 천천히 **아래→위로
슬라이드**. 서사 축: "개인의 비극(땅)" → "재앙의 규모(하늘)".

- **하단(땅):** wreck-bike + 골드 헤일로(죽은 영웅) + 시안 후드 주인공·바이크. 위로 스카이라인.
- **상단(하늘):** 동일 스카이라인 연속 + 거대 노을 태양 + 운석 폭풍.

**화질 규칙 (필수 — 저해상 576px 금지):**

- 출력 **최소 1536px 폭**, 권장 **2048×4096** PNG. JPEG/압축 아티팩트·블러·노이즈 금지.
- sharp crisp vector-like edges, clean silhouettes, no muddy upscale look.
- 가능하면 **한 장(full canvas)** 로 뽑고, 안 되면 타일 2장 + 세로 심리스.

**타일 이어붙이기:** 하단 먼저 → 참조 업로드 후 "상단 건물 실루엣이 이 이미지 하단에서 그대로
이어지게"로 상단 생성. 스타일 어긋나면 이음매가 보임.

---

**프롬프트 A — 전체 1장 (권장, 이음매 0):**

```
Ultra high-resolution tall vertical game-intro illustration, output 2048x4096 pixels PNG,
synthwave apocalypse endless-runner, sharp crisp clean neon vector art, high detail, no blur,
no compression artifacts, no muddy upscale. Bottom third: cracked dark highway with faint cyan
(#36f9f6) neon grid, two or three wrecked motorcycles on the roadside each with a dim golden
angel-halo ring (#ffd700) hovering above (fallen heroes), a lone hooded rider beside an intact
cyan-neon motorcycle (#5efce8 / #cafff8) near the bottom, back to camera. Middle: crumbling
city skyline silhouettes with sparse magenta/cyan Japanese neon signs. Top third: massive retro
striped sun (#ffd36e → #ff5fa2 → #b3247e) and a storm of molten meteors (#ffe9a8 → #ff7a3c →
#d62828) streaking across deep indigo-purple dusk sky (#170a2e / #3a0f44 / #6b1248). Continuous
single scene from ground to sky, dark high-contrast, restrained bloom, front-facing elevation,
no text, no logos, no letters, no watermark.
```

```
NEGATIVE: low resolution, 512px, 576px, 768px, blurry, soft, muddy, jpeg artifacts, noise,
grain, watermark, readable text, letters, logos, photoreal, 3D render, daytime, cheerful,
crowd, multiple living riders, gore, blood, busy clutter, mismatched style
```

---

**프롬프트 B1 — 하단 타일만 (고해상):**

```
Ultra high-resolution tall vertical illustration, output 2048x2048 pixels PNG (or taller),
bottom half of a 2-part vertical composite for a synthwave apocalypse runner intro. Sharp crisp
clean neon vector art, high detail, no blur, no compression artifacts. Ground-level dusk:
cracked neon highway, faint cyan (#36f9f6) grid glow, two or three wrecked motorcycles with dim
golden angel-halo rings (#ffd700) above each wreck, lone hooded cyan rider (#5efce8) beside
intact motorcycle near bottom, crumbling apartment tower silhouettes rising toward the TOP edge
so a sky tile can continue seamlessly above. Deep indigo-purple sky (#170a2e–#3a0f44) in upper
portion. Dark high-contrast, restrained bloom, front-facing elevation, no text, no logos.
```

```
NEGATIVE: low resolution, blurry, soft, muddy, jpeg artifacts, watermark, text, letters,
photoreal, 3D, daytime, crowd, gore, mismatched neon colors
```

**프롬프트 B2 — 상단 타일 (하단을 참조 이미지로 업로드):**

```
Continue the SAME scene UPWARD from the reference image at matching ultra high resolution
(2048px wide PNG), identical palette, line weight, glow and sharpness. The BOTTOM edge of this
new image must seamlessly continue the crumbling tower silhouettes from the TOP edge of the
reference. Above: massive retro gradient sun (#ffd36e → #ff5fa2 → #b3247e) with scanline gaps,
storm of molten meteors (#ffe9a8 → #ff7a3c → #d62828) across indigo-purple dusk sky. Sharp crisp
clean neon vector art, no blur, no compression artifacts, no text, no logos.
```

```
NEGATIVE: low resolution, blurry, mismatched skyline, different palette from reference, jpeg
artifacts, watermark, text, daytime, calm clear sky, single meteor only, photoreal, 3D
```

> **구현 노트:** `prep-intro.py`로 `assets/game/intro-slide.png` 구움. **매 판** 8.5초 Linear
> 세로 슬라이드 → 우측 하단 **Start →** → **바로 플레이**(시작 안내 창 없음).
>
> **구현 현황(2026-07-09):** 현행 소스는 576폭(저해상) → 위 고화질 프롬프트로 **재생성 후**
> `assets/images/intro/intro-full-src.png` 교체 → `python3 scripts/prep-intro.py` 재실행.

---

## 7. "한 판 더"를 만드는 리텐션 비주얼 (북극성)

보상 토큰이 없으니 **쾌감만으로 재시도**를 만든다. 비주얼의 임무: 추월·신기록·피버의 쾌감을 과장.
전부 기존 sim 이벤트에 얹는 **렌더 전용** 트리거.


| 순간 (sim 트리거)               | 비주얼 훅                                               | 왜 재시도를 부르나                  |
| -------------------------- | --------------------------------------------------- | --------------------------- |
| **추월** (고스트 finished)      | 추월당한 고스트가 헤일로 번쩍 + **엎어짐 연출**(§5.2B) + `제침!` 보라 버스트 | "내가 이겼다" 도파민                |
| **등수 상승**                  | 랭킹 패널 슬라이드 + 1등 림 골드 글로우                            | 순위는 가장 강한 비교 동기             |
| **콤보 상승**                  | 중앙 콤보 숫자 성장 + 화면 따뜻해짐(피버 예고)                        | "조금만 더하면 피버"                |
| **피버** (EV_FEVER_START)    | 황금 플래시 + 속도선 폭발 + 무한점프 트레일, 메테오 더 붉게/잦게             | 최고 쾌감 구간                    |
| **니어미스**                   | 장애물 모서리 스파크 + 찰나 플래시                                | "방금 죽을 뻔"의 긴장 쾌감            |
| **연료통** (EV_POTION)        | 블루 주유 링 + `+FUEL` 부유                                | 작은 보상 리듬                    |
| **사망→고스트화** (EV_GAME_OVER) | 라이더가 튕겨 나가 골드 헤일로를 달고 고스트가 됨                        | "내 기록이 남들의 고스트로 남는다" 정체성 루프 |
| **결과 패널**                  | 박빙이면 `한 판 더?` + 신기록 시 도시 번쩍                         | 박빙·신기록 직후가 재시도 전환율 최고점      |


---

## 8. 통합 순서 & 작업 체크리스트

**파이프라인(값싼 코드부터 검증):** graybox → 코드 스킨 → 에셋 스왑 → 오디오 → (선택)영상.
코드로 룩/무빙을 먼저 입혀 실속도·가독성·60fps를 검증한 뒤 에셋을 텍스처만 드롭인 스왑한다.

**작업 전 체크:**

- sim(`src/sim/`)을 건드렸는가 → 건드리면 SIM_VERSION 업 = 고스트 무효화(의도된 경우만)
- 장애물 변종이 충돌 폭 32(WIDE 64)·높이 50–120 유지(텍스처만 교체)인가
- 새 연출이 전부 `sim.state` 읽기 전용인가
- 메테오·레이저·태양이 플레이 레인(하단) 가독성을 안 해치는가
- 고스트 흩뿌리기가 플레이어를 안 가리는가(뒤/옆 분포)
- 랭킹 패널 색 구분(고스트 회색 / 주인공 시안)이 명확한가
- 새 에셋이 투명 배경·무텍스트·컬러 토큰 hex 준수인가
- 엎어짐/달리기 프레임 baseline이 일치하는가
- 저사양 60fps 유지(postFX·메테오·영상 디코드)되는가

---

## 9. 외부 생성 일관성 체크리스트

- 투명 배경(흰/검 아님)으로 나왔는가
- 컬러 토큰(§3) hex를 벗어나지 않았는가(특히 게임플레이 4색)
- 라이더(오토바이) vs 고스트(도보+헤일로) 실루엣이 30px에서 즉시 구분되는가
- 건물/장애물이 폭 32 비율(WIDE 64)인가
- 연료통이 쿨 블루(빨간 주유통 아님)인가
- 일본어 간판이 가공어인가(실상호·로고·영문 아님), 플레이 레인을 안 가리는가
- 워터마크/영문/드롭섀도 등 불필요 요소가 없는가
- 프레임마다 baseline이 일치하는가

