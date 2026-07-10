# 마일스톤 응원 토스트 에셋 (1000 / 2000 / 3000m…)

Generated: 2026-07-09  
Updated: 2026-07-10  
Status: **✅ 적용** — `milestone-cheer.png` prep + `GameScene` 로드.

## 왜 필요한가

1000m마다 우측 하단에서 **주인공 상반신 + 굿(👍) 제스처**와 말풍선
(`{N}m, 대단한데?` / `{N}m, 계속 가보자구!`)이 슬라이드 업→다운된다.

## 파이프라인

| 단계 | 경로 |
|------|------|
| 소스 | `assets/images/ui/milestone-cheer-src.png` |
| prep | `scripts/prep-ui.py` → `prep_milestone_cheer()` |
| 런타임 | `assets/game/milestone-cheer.png` (≈317×420) |
| 텍스처 키 | `milestone-cheer` |

재생성: `python3 scripts/prep-ui.py` (또는 `prep_milestone_cheer()`만)

## 코드 연동

| 항목 | 값 |
|------|-----|
| 표시 위치 | 우측 하단 (`DESIGN_W - 88`, `DESIGN_H - 18`) |
| 표시 높이 | ≈110px (종횡비 보존) |
| 폴백 | 키 없으면 `player-ride` frame 0 |
| 말풍선 | 코드 렌더 (에셋에 글자 없음) |

## 비주얼 스펙

- **캐릭터:** 네온 시안 후드 바이커 소녀, 상반신, 굿(엄지 척)
- **배경:** RGBA 투명 (prep이 체커 제거)
- **글자:** 없음

## 프롬프트 (재생성용)

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

## 참고

- 인게임: `GameScene.showMilestoneCheer()`
- 고스트 상반신 변형은 아직 미작성 (필요 시 이 문서에 추가)
