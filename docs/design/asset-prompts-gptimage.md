# Ghost Arcade — ChatGPT image2(gpt-image) 에셋 프롬프트 팩

> 이 문서는 **ChatGPT 이미지 생성(image2 / gpt-image)** 에 그대로 붙여 쓰는 프롬프트 모음이다.
> 게임 엔지니어링 제약(히트박스·결정론·좌표)의 "원본"은 `docs/design/neon-asset-spec.md`,
> 시각 시안은 `docs/design/neon-board.html`. 이 팩은 **생성에 최적화된 실전 프롬프트**만 추린다.

---

## 0. 먼저 읽기 — ChatGPT image2로 게임 에셋 잘 뽑는 6원칙

ChatGPT 이미지 생성기는 "그림"엔 강하지만 **게임 에셋 규격**(투명·무텍스트·균일 프레임)엔 약하다. 아래를 지켜야 재작업이 준다.

1. **투명 배경을 명시 + 검증.** 프롬프트에 `isolated on a transparent background, no scene, no ground, no shadow` 를 항상 넣는다. 결과가 흰/검 배경이면 "remove the background, output transparent PNG" 로 후속 요청. (왜: 글로우가 배경과 겹치면 합성 시 사각 테두리가 남는다.)
2. **글자 금지.** 모델이 멋대로 영문/워터마크를 그린다. `no text, no letters, no watermark, no UI` 를 negative로. (예외: 일본어 간판은 글자가 목적 → §3.6에서 별도 처리.)
3. **종횡비를 용도에 맞춰 지정.** gpt-image는 `1024×1024 / 1536×1024(가로) / 1024×1536(세로)` 를 지원. 배경=가로, 캐릭터=세로, 아이템/파티클=정사각.
4. **"하나만" 그리게.** 한 컷엔 한 오브젝트. `a single ___, centered` 로. 한 장에 여러 개 그리면 크기·스타일이 흔들려 못 쓴다. (간판 세트처럼 의도적 묶음만 예외.)
5. **일관성은 "참조 이미지"로 잡는다.** 첫 컷이 마음에 들면 **그 이미지를 업로드**하고 `match the exact art style, line weight, glow and palette of this reference` 를 붙여 나머지를 뽑는다. 같은 대화창에서 연속 생성하면 스타일이 잘 유지된다.
6. **스프라이트 시트는 기대 낮추기.** gpt-image는 프레임 간격·일관성을 정확히 못 맞춘다. 권장: **포즈를 한 장씩** 투명 PNG로 뽑아 → TexturePacker로 직접 합본. 굳이 시트로 받을 땐 `a horizontal strip of N identical poses, evenly spaced, same scale and lighting` 로 받고 수동 정리 각오.

**공통 스타일 앵커(모든 프롬프트에 이미 녹여 둠 / 참조 이미지 없을 때 앞에 붙여 강화):**

```
Style anchor: synthwave city-pop apocalypse, minimal neon, dark high-contrast,
restrained bloom glow, flat vector-like shapes, clean readable silhouette,
isolated on a transparent background, no scene, no ground, no shadow, no text, game asset.
```

색은 항상 hex로 못박는다(아래 토큰). 플레이용 4색은 **절대 닮게** 만들지 않는다:
플레이어 시안 `#5efce8` · 고스트 바이올렛 `#b39ddb` · 연료 블루 `#4dabf7` · 위험 마젠타 `#ff5fa2`.

---

## 1. 마스터 에셋 리스트 (생성 우선순위)

| # | ID | 무엇 | 종횡비 권장 | 비고 |
|---|---|---|---|---|
| 1 | `player-rider` | 후드 라이더 + 네온 오토바이 (주인공) | 1024×1536 세로/정사각 | 포즈별 1장씩: ride · jump · hit · **dead(고스트화)** |
| 2 | `ghost-runner` | 발로 뛰는 헤일로 고스트 (죽은 라이벌) | 1024×1536 | run 포즈 + 골드 헤일로. 라이더와 실루엣 확연히 구분 |
| 3 | `fuel-can` | 연료통(회복=주유) ★힐팩 대체 | 1024×1024 | 쿨 블루 캔 (빨간 주유통 ❌) |
| 4 | `building-kit` | 도시 건물 장애물 (가변 높이) | 1024×1536 | cap/floor/base 타일 또는 고정 4종 |
| 5 | `fx-meteor` | 붉은 행성/운석 + 화염 꼬리 | 1024×1024 | 대·중·소 3장 |
| 6 | `signage-jp` | 일본어 네온 간판 세트 (시티팝) | 1536×1024 | 가공어만(실상호 ❌) |
| 7 | `bg-sun` | 레트로 선(노을 태양) | 1024×1024 | 스캔라인 갭 |
| 8 | `bg-skyline-far` | 먼 도시 실루엣 (가로 심리스) | 1536×1024 | 좌우 이음매 |
| 9 | `fx-particles` | 스파크/+HP/제침 파티클 | 1024×1024 | 흰색 1종 → 코드 틴트 |
| — | `bg-sky` · `ground-grid` · `fx-speedlines` · `fx-trail` | 하늘 그라데이션·바닥 그리드·속도선·빛 트레일 | — | **코드로 구현 권장**(이미지 X) |

> 영상(움직이는 배경/메테오 루프)은 §4 참조 — 기본은 코드 패럴랙스, 굳이 사전렌더면 Sora.

---

## 2. 게임 규격 한눈에 (생성 시 머리에 두기)

- 논리 해상도 **1040×480**, 바닥선 **y=432**, 소스는 **@3x**로 크게 뽑아 축소.
- 충돌 박스(게임 px): 라이더/고스트 **30×42**, 건물 폭 **32**(높이 50–120), 연료통 **26×26**.
- **글로우·트레일·헤일로·안테나는 박스 밖으로 넘쳐도 됨**(장식). 충돌은 직사각형으로만.
- origin: 캐릭터·건물 = **하단 중앙(발/바닥 접지)**, 연료통 = **정중앙**.
- 결정론: 메테오·간판·속도선·창문 점멸은 **렌더 전용**(sim에 영향 0).

---

## 3. 에셋별 프롬프트 (영문 그대로 붙여넣기)

각 블록: **지켜야 할 것(KR) → PROMPT(EN) → NEGATIVE(EN)**.

### 3.1 player-rider — 후드 라이더 + 네온 오토바이 (주인공)

지켜야 할 것: 측면(우향) 뷰. 오토바이는 가로로 길지만 **충돌 박스는 30×42 세로형** → 아트는 ~56px까지 overhang 허용하되 박스는 라이더 몸통+앞바퀴에 정렬, 꼬리(뒷바퀴·트레일)는 박스 왼쪽 밖. 바퀴가 공통 바닥선에 접지. 얼굴 디테일 없음(원거리). **포즈별로 1장씩** 뽑아 동일 baseline 유지.

```
A minimal neon hooded rider on a sleek futuristic motorcycle, side view facing right, the rider
leaning forward low over the bike for maximum speed, hood up with a scarf streaming backward,
glowing cyan (#5efce8) neon edge light on the motorcycle and lighter cyan (#cafff8) highlights
on the rider, a short cyan light trail dragging behind the rear wheel, wheels with a subtle
motion-blur glow, no facial detail, strong readable silhouette, restrained outer bloom,
synthwave city-pop apocalypse, flat vector-like, both wheels resting on a single common ground
baseline, isolated on a transparent background, no scene, no ground, no shadow, no text, single
character game asset, side profile.
```
```
NEGATIVE: text, letters, watermark, white or black background, ground, drop shadow, realistic,
3D render, photo, busy detail, multiple colors, chrome overload, face close-up, rider standing,
car, three wheels, scene, street
```

---

> **추가 포즈 공통 규칙**: ride 프레임을 참조 이미지로 업로드한 뒤 아래 프롬프트를 붙여넣어 포즈별로 1장씩 생성.
> 스타일·색상·글로우·바닥 baseline을 ride와 반드시 일치시킨다. 차이는 자세·상황만.

---

#### pose: `jump` — 버니홉 (앞바퀴 들림)

```
EXACT SAME rider and motorcycle as the reference image — identical neon style, glowing cyan
(#5efce8) outline, scarf, and light trail — but mid bunny-hop: the front wheel is lifted clearly
off the ground, rear wheel still touching the baseline, the rider's torso rising slightly, leaning
back just enough to show the hop. The scarf streams upward with the lift. Same transparent
background, same canvas size and ground baseline position as the reference.
Match the exact art style, line weight, glow intensity, and color palette of the reference.
No text, no ground, no shadow.
```
```
NEGATIVE: both wheels on ground, rider standing upright, wheelie (rear wheel off ground), text,
watermark, white or black background, ground shadow, realistic, 3D render, different art style,
different colors, scene
```

#### pose: `hit` — 피격 리코일

```
EXACT SAME rider and motorcycle as the reference image — identical neon style, glowing cyan
(#5efce8) outline, scarf, and color palette — but in a brief recoil pose: the rider's body
lurches slightly backward and the bike tilts a few degrees clockwise (nose dips), as if just
struck by an impact. Posture is tense and defensive, not falling off. The scarf is blown
forward by the sudden deceleration. Same transparent background, same canvas size,
same ground baseline. Match art style, line weight, and glow exactly.
No text, no ground, no shadow.
```
```
NEGATIVE: rider falling off, motorcycle tumbling, explosion, fire, text, watermark, white or
black background, drop shadow, realistic, 3D, different neon color, different style, scene
```

> 깜빡임(invincible frames)은 코드에서 alpha 토글로 처리 — 이 컷은 1장만 필요.

#### pose: `dead` ★ — 고스트화 (핵심 리텐션 컷)

```
EXACT SAME rider as the reference image — identical neon style and color — but the rider has
been thrown off the motorcycle in mid-air: the body is airborne and slightly tumbling, arms
spread, the motorcycle falling away behind them. A glowing golden angel halo ring (#ffd700)
is appearing above the rider's head, and the body is just beginning to turn translucent and
ghostly (violet-tinted, semi-transparent silhouette, like the ghost runners in the game).
The halo glows warmly. This is the "death to ghost" transformation moment.
Same transparent background, same canvas size. Match the base art style and cyan neon palette
for the motorcycle remnant; the rider body shifts toward violet ghost tones.
No text, no ground, no shadow.
```
```
NEGATIVE: rider still on motorcycle, alive and healthy pose, no halo, solid opaque body,
realistic, 3D render, photo, text, watermark, white or black background, scary horror ghost,
wings, blood, explosion, different art style, scene
```

> "죽으면 나도 남들의 고스트가 된다" 루프의 핵심 컷 — §7 리텐션 비주얼. 결과 패널 연출에 사용.

### 3.2 ghost-runner — 발로 뛰는 헤일로 고스트 (죽은 라이벌)

지켜야 할 것: **오토바이 아님, 맨몸 달리기.** 머리 위 골드 천사 헤일로 = "이미 죽은 기록" 표식. 보라 `#b39ddb` 반투명(alpha 0.22 느낌). 라이더(탈것)와 **실루엣이 즉시 구분**돼야 함. 발이 공통 baseline. 헤일로는 박스 위로 떠도 됨(별도 레이어로 받으면 코드에서 점멸/부유 가능).

```
A minimal neon ghost runner for a side-view endless runner, full body mid-run facing right,
plain athletic human silhouette running on foot (no vehicle), glowing soft violet (#b39ddb)
translucent neon body, a small glowing golden angel halo ring (#ffd700) floating above the head,
no facial detail, ethereal and semi-transparent, restrained glow, synthwave apocalypse, flat
vector-like, feet on a single common ground baseline, isolated on a transparent background,
no scene, no ground, no shadow, no text, single character game asset, side profile.
```
```
NEGATIVE: motorcycle, vehicle, bike, wheels, text, watermark, white background, ground shadow,
solid opaque body, realistic, 3D, photo, scary bedsheet ghost, wings, face detail, scene
```

> run-cycle을 한 장 시트로 원하면 끝에 추가: `as a horizontal strip of 6 identical run poses, evenly spaced, same scale and lighting.` (간격 수동 정리 전제.)

### 3.3 fuel-can — 연료통 (회복 = 주유) ★ 힐팩 대체

지켜야 할 것: 오토바이 테마라 회복도 **연료통(제리캔)**. **색은 쿨 블루 유지**(`#4dabf7`/하이라이트 `#9fd4ff`) — 현실의 빨간 주유통으로 그리면 위험 마젠타와 헷갈림. 정사각 26×26 풋프린트, 정중앙. 옆면에 작은 연료 방울/번개 픽토그램으로 "에너지" 암시.

```
A single neon fuel jerrycan power-up for a side-view game, compact rectangular fuel canister
with a top carry handle and a short spout, dark navy body (#0a2740) with a glowing cool blue
(#4dabf7) neon outline and lighter cyan (#9fd4ff) highlights, a small glowing fuel-drop energy
symbol on the side panel, soft round glow halo around it, minimal flat vector style, centered,
isolated on a transparent background, no scene, no ground, no shadow, no text, game item asset.
```
```
NEGATIVE: red canister, realistic gas can, oil drum, bottle, potion, liquid splash, label,
words, letters, magenta, white background, realistic metal, rust, 3D render, photo
```

### 3.4 building-kit — 도시 건물 장애물 (가변 높이)

지켜야 할 것: 폭 **정확히 32px 비율**, 높이 50–120 가변. 단순 세로 스트레치는 창문이 늘어나 깨짐 → **수직 타일(9-slice)**: `cap`(옥상+안테나) + `floor`(반복 1층, 창문 2열) + `base`(접지). 다크 필 `#0d0618` + 시안 외곽 `#36f9f6` + 창문 마젠타/시안. 정면 측면 뷰(원근 금지).

```
PROMPT (cap, 옥상):
The top section of a narrow neon skyscraper, tall vertical proportion (about 1:3 width to height),
rooftop with a thin antenna and a small glowing beacon, dark fill (#0d0618), a glowing cyan
(#36f9f6) thin outline, synthwave apocalypse, minimal flat shapes, strict flat side elevation
(no perspective), seamless flat bottom edge to stack onto floor tiles, isolated on a transparent
background, no ground, no sky, no text.
```
```
PROMPT (floor, 세로 반복 타일):
A single repeatable floor segment of a narrow neon skyscraper, tall thin vertical proportion,
dark body (#0d0618), a glowing cyan (#36f9f6) thin outline only on the left and right edges,
two columns of small lit windows alternating magenta (#ff5fa2) and cyan (#36f9f6), top and
bottom edges perfectly seamless for vertical tiling, strict flat side elevation, minimal flat,
isolated on a transparent background, no rooftop, no ground, no text.
```
```
NEGATIVE: perspective, 3D, isometric, wide building, ground, street, sky, clouds, text,
watermark, white background, realistic bricks, heavy detail, people, cars
```

> 타일이 어려우면 대안: 고정 높이 4종(50/75/100/120) 통짜 PNG → `...complete narrow neon skyscraper, full height, rooftop antenna and stacked lit windows...` 로 4번. 다양성은 4단계로 제한.

### 3.5 fx-meteor — 붉은 행성/운석 메테오 (★ 별똥별 ❌)

지켜야 할 것: 가는 스트릭이 아니라 **묵직한 붉은 행성 덩어리** + 가열 림 + 미세 크레이터 + 사선 화염 꼬리. **대/중/소 3장**(깊이감). 렌더 전용 장식.

```
A falling meteor that looks like a small molten red planet, spherical and chunky, glowing hot
rim, radial gradient from a pale-yellow core highlight (#ffe9a8) through orange (#ff7a3c) to
deep red (#d62828) with a dark edge (#7a0f12), a few subtle dark craters, a fiery orange tail
streaking behind it on a diagonal, synthwave apocalypse, minimal, soft outer glow, isolated on a
transparent background, no scene, no ground, no text, single object, game asset.
```
```
NEGATIVE: thin shooting star, hairline streak, tiny spark, white core, cartoon star, text,
watermark, white or black background, photo, smoke only, asteroid field, multiple meteors
```
> 크기 변주: 같은 컷 뒤에 `large size / medium size / small size` 만 바꿔 3장.

### 3.6 signage-jp — 일본어 네온 간판 세트 (시티팝)

지켜야 할 것: 쇼와 레트로 시티팝. **세로 + 가로 간판** 혼합. 마젠타/시안/앰버 네온 튜브. **실제 상호·브랜드·로고 금지 → 일반 가공어만**(예: `夜光酒場` `電脳ホテル` `ナイトシティ` `終末` `ネオン` `音楽` `バー` `酒`). 글자가 목적이므로 **무텍스트 규칙 예외**지만, gpt-image가 글리프를 자주 틀리니 **출력 후 글자 검수 필수**.

```
A set of separate vintage Japanese neon shop signs, Showa-era city-pop aesthetic, a mix of
vertical and horizontal signs arranged with spacing on one sheet, glowing neon tube letters in
katakana and kanji, colors magenta (#ff5fa2), cyan (#36f9f6) and amber (#ffd36e) on small dark
mounting plates, soft neon glow, minimal, retro Tokyo night, isolated on a transparent
background, no scene, no people. Use only generic invented words such as 夜光酒場 / 電脳ホテル /
ナイトシティ / ネオン / 音楽, never real brand names or logos.
```
```
NEGATIVE: real brand names, real logos, english text, latin letters, garbled glyphs, watermark,
people, photo, white background, daytime, cluttered street, 3D
```
> 글자 정확도가 안 나오면: 간판 **틀(빈 네온 박스)**만 생성하고, 일본어는 게임에서 웹폰트로 코드 렌더(보드 방식)가 가장 안전.

### 3.7 bg-sun — 레트로 선(노을 태양)

```
A retro synthwave sun, one large circle, vertical gradient from warm yellow (#ffd36e) through
hot pink (#ff5fa2) to deep magenta (#b3247e), classic horizontal scanline gaps cutting the
lower half, soft outer glow, centered, flat minimal, 80s synthwave aesthetic, isolated on a
transparent background, no landscape, no ground, no text.
```
```
NEGATIVE: realistic sun, lens flare photo, text, watermark, white background, clouds, faces, 3D
```

### 3.8 bg-skyline-far — 먼 도시 실루엣 (가로 심리스)

지켜야 할 것: **좌우 끝이 이어지는** 루프 타일. 거의 단색 실루엣 `#1b0c33` + 드문 마젠타 창문 점. 원경이라 디테일 최소, 플레이 가독성 해치지 않게 어둡게.

```
A distant city skyline silhouette for a horizontal parallax background, far away, a very dark
indigo (#1b0c33) flat silhouette of skyscrapers with varied heights, only a few faint magenta
(#ff6fb0) lit window dots, minimal low detail, a wide panoramic strip whose left edge exactly
matches the right edge for seamless horizontal tiling, isolated on a transparent background
above the skyline, synthwave night, no foreground, no ground, no text.
```
```
NEGATIVE: detailed buildings, bright, daytime, text, watermark, foreground objects, people,
non-tileable seam, baked-in gradient sky, 3D
```

### 3.9 fx-particles — 스파크/파티클 (흰색 1종, 코드 틴트)

```
A single small soft round spark particle, a white glowing center with a soft radial falloff,
simple clean bokeh dot, isolated on a transparent background, minimal, for in-engine tinting,
game particle, no text.
```
```
NEGATIVE: color, text, hard edges, star outline shape, multiple particles, white background
```

---

## 4. 영상/애니메이션 에셋 (선택)

ChatGPT image2는 정지 이미지 전용이다. 움직임은 두 갈래:

1. **코드 패럴랙스(권장).** 움직이는 배경·속도선·빛 트레일·창문 점멸은 위 스틸 레이어를 **좌측 스크롤**시켜 만든다. 속도를 sim 스크롤 속도에 **읽기 전용**으로 연동(결정론 무영향). 가장 가볍고 60fps 안전. → `neon-asset-spec.md` §4.9.
2. **사전렌더 루프가 꼭 필요하면 Sora**(텍스트→비디오)로 짧은 seamless loop. 예:

```
Sora (배경 루프):
A seamless looping side-scrolling synthwave apocalypse city background, dark magenta sunset sky,
distant indigo skyline drifting left, faint Japanese neon signs flickering, a couple of molten
red planet-like meteors falling diagonally, subtle cyan speed lines, minimal flat neon, no text,
no characters, loopable, 3 seconds.
```
```
Sora (메테오 루프):
A single molten red planet-like meteor with a fiery orange tail falling diagonally across a
transparent/dark frame, glowing hot rim, looping, minimal synthwave, no text.
```

> 주의: 사전렌더 영상은 용량·발열↑, 결정론과도 무관해야 함(배경 장식으로만). **기본은 코드 패럴랙스, Sora는 인트로/타이틀용 정도로.**

---

## 5. 생성 후 일관성 체크리스트

- [ ] 투명 배경인가(흰/검·바닥·드롭섀도 없음)
- [ ] 워터마크·영문·잡텍스트가 안 끼었나(간판 제외)
- [ ] 컬러 토큰 hex를 벗어나지 않았나 — **플레이 4색**(시안/바이올렛/블루/마젠타) 서로 안 닮았나
- [ ] 라이더(오토바이) vs 고스트(도보+골드 헤일로) 실루엣이 30px에서 즉시 구분되나
- [ ] **연료통이 쿨 블루**인가(빨간 주유통 ❌, 위험 마젠타와 구분)
- [ ] 건물이 폭 32 비율·수직 타일 이음매가 자연스럽나(원근 없음)
- [ ] 메테오가 "붉은 행성 덩어리+화염 꼬리"이지 가는 별똥별 아님
- [ ] 간판이 가공어인가(실상호·로고·영문 아님), 글리프가 안 깨졌나
- [ ] 캐릭터/건물 baseline(접지선)이 프레임마다 일치하나
- [ ] 같은 스타일 묶음은 **참조 이미지**로 통일했나(라인 두께·글로우·팔레트)
