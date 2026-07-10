# 오프닝 조작 튜토리얼 에셋 (howto)

Generated: 2026-07-10  
Status: **✅ 적용** — `howto-tutorial.png` prep + `GameScene` 연동.

## 파이프라인

| 단계 | 경로 |
|------|------|
| 소스 | `assets/images/ui/howto-tutorial-src.png` |
| prep | `scripts/prep-ui.py` → `prep_howto_tutorial()` |
| 런타임 | `assets/game/howto-tutorial.png` |
| 텍스처 키 | `howto-tutorial` |

재생성: `python3 -c "…prep_howto_tutorial()"` 또는 `python3 scripts/prep-ui.py`

## 인게임

- 인트로 Start → 반투명 베일 + 4컷 스트립 + 「플레이 →」/「오늘 다시 안보기」
- 글자·버튼은 코드 (`FONT_KR` / `FONT_HUD`) — 에셋에 텍스트 없음
- 표시: 폭 ≈980, 종횡비 보존

## 컷 구성 (좌→우)

1. 탭 점프 (손가락 아이콘)
2. 1단 점프 궤적
3. 2단 점프
4. 장애물 회피 + 연료통(HP)

## 프롬프트 (재생성용)

`docs/design/howto-tutorial-asset.md` 하단 원본 프롬프트 참고. 마일스톤 상반신은 `milestone-cheer-asset.md`.
