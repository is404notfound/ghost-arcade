# FEVER / WARNING 아이콘 에셋

Generated: 2026-07-10  
Status: **✅ 적용** — `icon-warning` / `icon-fever` PNG + 우측 하단 점멸.

## 파이프라인

| 키 | 소스 | 런타임 |
|----|------|--------|
| `icon-warning` | `assets/images/ui/icon-warning-src.png` | `assets/game/icon-warning.png` (336²) |
| `icon-fever` | `assets/images/ui/icon-fever-src.png` | `assets/game/icon-fever.png` (336²) |

prep: `scripts/prep-ui.py` → `prep_icon_warning()` / `prep_icon_fever()`

## 인게임

- 표시: 우측 하단 112×112, origin 우하단
- 점멸: 호흡형 `0.6 + 0.4*(0.5+0.5*sin(t*0.006))`
- 상호배제: 피버 중이면 WARNING 숨김

## 네온 노랑 통일

Fever 아이콘에서 샘플한 **`#f0f838`** (`NEON_YELLOW`)를 HUD/피버 강조 노랑에 통일.
(태양·메테오·불꽃 등 따뜻한 주황 계열은 유지.)

## 프롬프트 (재생성용)

문서 하단 원본 프롬프트는 초기 초안과 동일 — 현재 적용본은 baked WARNING 라벨 + 번개 링.
