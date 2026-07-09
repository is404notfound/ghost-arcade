# 마일스톤 응원 토스트 에셋 (1000 / 2000 / 3000m…)

Generated: 2026-07-09  
Status: **에셋 대기** — 코드 연출은 적용됨 (`showMilestoneCheer`). 전용 PNG가 오면 교체.

## 왜 필요한가

1000m마다 우측 하단에서 **주인공 상반신 + 굿(👍) 제스처**와 말풍선
(`{N}m, 대단한데?` / `{N}m, 계속 가보자구!`)이 슬라이드 업→다운된다.
지금은 `player-ride` 1프레임으로 자리를 잡고 있어, **굿 제스처·상반신 크롭**이 들어간
전용 컷이 있어야 연출이 완성된다.

## 코드 연동

| 항목 | 값 |
|------|-----|
| 텍스처 키 | `milestone-cheer` |
| 표시 위치 | 우측 하단 (`DESIGN_W - 88`, `DESIGN_H - 18`) |
| 표시 높이 | ≈110px (종횡비 보존) |
| 폴백 | 키 없으면 `player-ride` frame 0 |
| 말풍선 | 코드 렌더 (에셋에 글자 굽지 말 것) |

### 적용 절차 (에셋 수령 후)

1. 소스: `assets/images/ui/milestone-cheer-src.png` (RGBA, 투명 배경)
2. 런타임: `assets/game/milestone-cheer.png` (권장 폭 **360~420px**, 높이 비례)
3. `GameScene.preload()`에 `this.load.image("milestone-cheer", …)` 추가
4. LINEAR 필터 목록에 키 추가

## 비주얼 스펙

- **캐릭터:** 기존 네온 바이커 소녀(시안 후드·바이크 라이더)와 **동일 스타일·동일 얼굴**
- **프레이밍:** 허리 위 **상반신** (또는 머리+어깨+올린 팔). 전신·바이크 전체 불필요
- **포즈:** 한 손으로 **굿(엄지 척)** 제스처. 시선은 카메라/살짝 옆
- **배경:** 완전 투명 (RGBA α=0). 검정/흰 매트·체커 금지
- **스타일:** 플랫 일러스트, 네온 시안 림 가능, 3D/포토/리얼 금지
- **글자:** 없음 (말풍선은 코드)

## 프롬프트

```
PROMPT (milestone-cheer — 상반신 + 굿 제스처):
Upper-body portrait of the same neon cyan-hooded cyberpunk bike-girl hero from Ghost Arcade,
waist-up crop, one hand raised in a clear thumbs-up (good) gesture toward the camera,
confident cheerful expression, matching existing character design (cyan hoodie, dark hair,
synthwave neon outline accents), front-facing to 3/4 view, clean flat vector game illustration,
true RGBA PNG with fully transparent background (alpha=0 outside the character — NO white matte,
NO black matte, NO checkerboard), no bike, no full body, no text, no speech bubble, no UI frame,
sharp crisp edges, high resolution (at least 1024px tall on the character).
```

```
NEGATIVE:
full body, motorcycle, bike wheels, text, letters, speech bubble, white background, black
background, purple backdrop, checkerboard, photo, 3D render, realistic skin pores, multiple
characters, watermark, logo, ranking badge
```

## 참고 레퍼런스

- 주행 시트: `assets/images/player/player-ride-sheet-src.png`
- 점프/히트 컷과 동일 캐릭터 아이덴티티 유지
- 인게임 연출: `src/render/GameScene.ts` → `showMilestoneCheer()`
