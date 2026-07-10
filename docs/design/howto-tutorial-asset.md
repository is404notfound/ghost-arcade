# 오프닝 조작 튜토리얼 에셋 (howto)

Generated: 2026-07-10  
Status: **에셋 대기** — 코드는 `panel-tutorial` + 텍스트로 임시 표시. 전용 일러스트가 오면 교체.

## 왜 필요한가

인트로 Start 직후 **게임 방법** 카드에 올릴 비주얼.
탭 점프 / 1·2단 점프 / 장애물 회피 / 연료통 HP 회복을 한눈에 보여준다.
글자·버튼(「플레이 →」「오늘 다시 안보기」)은 코드 텍스트 — 에셋에 굽지 말 것.

## 코드 연동 (예정)

| 항목 | 값 |
|------|-----|
| 텍스처 키 (후보) | `howto-tutorial` |
| 표시 위치 | 중앙 카드 (기존 `panel-tutorial` 위 또는 대체) |
| 폴백 | `panel-tutorial` + 코드 카피 |
| 글자 | 코드 (`FONT_KR`) |

## 비주얼 스펙

- **캐릭터:** 기존 네온 바이커 소녀(`player-ride` / `player-jump1` / `player-jump2`)와 **동일 얼굴·복장**
- **구성:** 1장 스토리보드 **또는** 가로 3~4컷. 권장 컷:
  1. 탭/손가락 힌트 + 점프 직전
  2. 1단 → 2단 점프 궤적
  3. 낮은 장애물 회피
  4. (선택) 연료통 획득 → HP 회복 암시(하트/게이지 아이콘은 코드로도 가능)
- **배경:** 완전 투명(RGBA α=0) 또는 아주 어두운 네온 매트(패널 안쪽만)
- **글자:** 없음 (한국어/영어 UI 텍스트 금지)
- **스타일:** 플랫 일러스트, 시안 림, 3D/포토 금지

## 프롬프트

```
PROMPT (howto-tutorial — 조작 안내 스토리보드):
Same neon cyan-hooded cyberpunk bike-girl hero from Ghost Arcade — match existing
player-ride / player-jump art identity (cyan hoodie, dark hair, synthwave neon outline).
Clean flat vector game illustration. One wide or tall instructional storyboard with
3 clear beats (or 3 separate panels on transparent canvas):
(1) character about to jump with a simple tap/finger cue near her (no letters),
(2) single-jump then double-jump arc (1단→2단) showing two jump heights,
(3) dodging a low roadside obstacle / barrier.
Optional 4th beat: collecting a small fuel-can item (match in-game fuel-can silhouette).
True RGBA PNG, fully transparent outside the art (alpha=0 — NO white/black/purple matte,
NO checkerboard). No baked Korean or English text, no speech-bubble letters, no UI buttons,
no watermark. Sharp crisp edges, high resolution (at least 1536px on the long side).
```

```
NEGATIVE:
text, letters, numbers, Korean hangul, English words, speech bubble with writing,
white background, black solid backdrop, purple matte, checkerboard, photo, 3D render,
realistic skin pores, multiple different characters, watermark, logo, ranking badge,
busy HUD chrome
```

## 참고

- 주행/점프: `assets/game/player-ride.png`, `player-jump1.png`, `player-jump2.png`
- 연료통: `assets/game/fuel-can.png`
- 인게임: `GameScene` — `howtoTutorial` (인트로 `endIntro` → 표시)
- 마일스톤 상반신 응원 컷은 별도: `docs/design/milestone-cheer-asset.md` (이미 프롬프트 있음)
