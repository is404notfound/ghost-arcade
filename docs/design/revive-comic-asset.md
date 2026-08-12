# 부활 만화 1컷 에셋 (이어뛰기 직후)

Generated: 2026-08-12  
Status: **✅ 적용** — `assets/game/revive-comic.png` + 닉네임 말풍선 코드 오버레이.

## 왜 필요한가

보상형 광고로 이어뛰기 직후, **풀스크린 만화 1컷(~2초, 탭 스킵)** 으로
“아직 안 끝났다” 태도를 박는다. 오프닝(`intro-slide`)과 **같은 시각 어휘**를 쓰되,
게임 뷰포트가 가로라 **가로 1컷**이다.

## 인게임 제약 (코드)

| 항목 | 값 |
|------|-----|
| 표시 | 광고 `rewarded` → 이 컷 → `applyReviveAfterAd` |
| 뷰포트 | `DESIGN_W × DESIGN_H` ≈ **1040×480** (가로) |
| 대사 | 코드 오버레이: `나는 아직 갈 수 있어!!!` — **이미지에 글자 금지** |
| 킬스위치 | `revive_fx_enabled` |
| 임시 폴백 | 현재 `milestone-cheer` |

## 파이프라인 (생성 후)

| 단계 | 경로 |
|------|------|
| 소스 | `assets/images/ui/revive-comic-src.png` (권장) |
| 런타임 | `assets/game/revive-comic.png` |
| 텍스처 키 | `revive-comic` |

참조: `assets/game/intro-slide.png`를 **스타일 레퍼런스**로 함께 업로드할 것.

## 비주얼 스펙

- **톤:** synthwave city-pop apocalypse — intro와 동일 팔레트·선·글로우
- **주인공:** 시안 네온 후드 라이더 + 오토바이 (intro·player와 동일 캐릭터)
- **순간:** 넘어진 직후가 아니라 **다시 일어나는 / 다시 올라타는** 한 컷  
  태도만 “하루 종일도 할 수 있어” — **마블 얼굴·방패·영어 카피·히어로 포즈 금지**
- **배경:** 깨진 고속도로 + 희미한 시안 그리드 + 멀리 스카이라인·줄무늬 태양·운석(절제)
- **글자:** 없음 (대사는 코드)
- **비율:** 가로 **16:9 또는 ≈2.16:1** (게임 캔버스에 풀블리드)

### 컬러 토큰 (프롬프트에 그대로)

| 용도 | hex |
|------|-----|
| 하늘 | `#170a2e` / `#3a0f44` / `#6b1248` |
| 태양 | `#ffd36e → #ff5fa2 → #b3247e` |
| 시안 네온 | `#36f9f6` / 플레이어 `#5efce8` |
| 운석/불 | `#ffe9a8 → #ff7a3c → #d62828` |
| (선택) 먼 헤일로 | `#ffd700` — 죽은 영웅 잔해, 작게만 |

---

## 프롬프트 (영문 그대로 붙여넣기)

**생성 시:** `intro-slide.png`를 참조 이미지로 올리고  
`match this exact palette, line weight, neon glow, and flat vector synthwave style` 를 함께 넣을 것.

```
PROMPT (revive-comic — landscape 1-cut, same world as intro-slide):

Ultra high-resolution landscape comic-panel illustration for a synthwave apocalypse endless
runner, output 2048x960 pixels PNG (or 1920x900), sharp crisp clean neon vector art, high
detail, no blur, no compression artifacts. SAME art direction as Ghost Dash intro-slide:
dark high-contrast dusk, restrained bloom, flat vector-like edges.

Scene (single beat — "I'm not done"): a lone hooded cyan-neon bike-girl hero (#5efce8 /
#cafff8 outline) mid-rise after a hard fall — one boot planting on cracked asphalt, body
leaning forward with defiant resolve as she swings back onto (or steadies) her intact
cyan-neon motorcycle. Attitude only: stubborn, "I can keep going" energy — NOT a Marvel
superhero pose, NO cape flourish, NO shield, NO comic-book onomatopoeia.

Background: cracked dark highway with faint cyan (#36f9f6) perspective grid, sparse wreckage
optional (one distant wrecked bike with a tiny dim golden halo #ffd700 max — do not dominate),
crumbling city skyline silhouettes with sparse magenta/cyan neon, massive retro striped sun
(#ffd36e → #ff5fa2 → #b3247e) low on horizon, a few molten meteors (#ffe9a8 → #ff7a3c →
#d62828) in deep indigo-purple sky (#170a2e / #3a0f44 / #6b1248). Cinematic side-to-3/4 view
filling the frame edge-to-edge (full-bleed), dark high-contrast, restrained outer glow on
rider and bike.

NO text, NO letters, NO speech bubble, NO Korean/English copy, NO logos, NO watermark,
NO UI chrome, NO ranking badge.
```

```
NEGATIVE:
portrait orientation, tall vertical poster, low resolution, blurry, soft, muddy, jpeg
artifacts, noise, grain, watermark, readable text, letters, speech bubble, Korean text,
English slogan, "I can do this all day", Marvel, Captain America, shield, stars and stripes,
cape hero landing pose, photoreal, 3D render, realistic skin pores, daytime, cheerful pastel,
crowd, multiple living riders, gore, blood, busy clutter, white matte, checkerboard,
mismatched palette from intro-slide, thick comic halftone dots, manga screentone overload
```

---

## 생성 체크리스트

- [ ] intro-slide과 나란히 놓고 팔레트·선 굵기·글로우가 같은 세계로 보이는가
- [ ] 가로 풀블리드이며 중요한 실루엣이 가장자리 잘림 없이 중앙~좌측에 있는가
- [ ] 이미지 안에 글자/말풍선이 없는가 (대사는 코드)
- [ ] “다시 일어남”이지 “승리 포즈/마블 랜딩”이 아닌가
- [ ] 파일 배치 후 `GameScene`의 `milestone-cheer` 임시키를 `revive-comic`으로 교체
