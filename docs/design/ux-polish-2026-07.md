# UX 폴리시 백로그 (2026-07-09)

> 인게임 가시성·결과 UI·연출 9건. **sim 무관(렌더 전용)** 이므로 `SIM_VERSION` 범프 없음.
> 상태: ✅ 당일 적용 / 🟡 부분·대기 / ⬜ 미착수 / 💬 결정 대기

---

## 요약 표


| # | 항목 | 상태 | 당장 실행? | 의존성 |
|---|------|------|-----------|--------|
| 1 | 상단 랭킹 칩에 「실시간 일간랭킹」 라벨 | ✅ | 코드 | 없음 |
| 2 | 고스트 불투명·크기·등수 라벨 가시성↑ | ✅ | 코드 | 없음 |
| 3 | 게임오버 3분할(일간 / Replay / 주간) | ✅ | 코드+에셋 | panel-daily / btn-replay prep |
| 4 | 암전 「WARNING」 뾰족 말풍선 점멸 | ✅ | 에셋+점멸 | warn-bubble baked |
| 5 | 콤보 → 우측 중상단 검정 띠지 + 우→좌 슬라이드 | ✅ | 코드 | 없음 |
| 6 | 1000m 마일스톤 연출 | 💬 | 추천만 | 연출 톤 선택 |
| 7 | 일본어 간판 y 살짝 하향 | ✅ | 코드 | 없음 |
| 8 | 스카이라인/원경 바이옴 전환 부드럽게 | ✅ | 코드 | 없음 |
| 9 | 피버·조작 튜토리얼 「오늘 다시 안보기」 | ✅ | 코드 | day-key |

---

## 1. 실시간 일간랭킹 라벨 ✅

- **What:** 플레이 중 상단 가로 랭킹 칩 리스트 **왼쪽 위**에 작은 안내 문구 `실시간 일간랭킹`.
- **Why:** 칩만 보면 “지금 뭐가 뜨는 건지”가 안 읽힘. 주간 결과 패널과 구분.
- **구현:** `GameScene` — `rankHudLabel` Text, `updateRankPanel`에서 칩과 함께 show/hide.
- **경계:** 렌더 전용.

---

## 2. 고스트 가시성 ✅

- **What:**
  - 스프라이트 알파 **1.0** (기존 ~0.78)
  - 표시 높이 `GHOST_ART_H` **90 → 104** (주인공 96보다 살짝 크게 — 배경에 묻히지 않게)
  - 머리 위 `1st/2nd/3rd` **12px → 16px**, 알파·스트로크 강화
- **Why:** 배경(스카이라인·네온)이 화려해서 반투명 고스트가 실루엣으로 안 읽힘.
- **경계:** 렌더 전용. 히트박스는 sim 그대로.

---

## 3. 게임오버 3분할 UI ✅

### 레이아웃

```
┌─────────────┐   ┌──────────┐   ┌─────────────┐
│  일간 랭킹   │   │  REPLAY  │   │ 주간 누적    │
│  (오늘 시드) │   │  버튼    │   │  랭킹       │
└─────────────┘   └──────────┘   └─────────────┘
```

- **왼쪽:** `panel-daily` + 오늘 시드 거리 순위 (`refreshDailyPanel`)
- **가운데:** `btn-replay` + 코드 `REPLAY` — 탭 시만 `startRun(true)`
- **오른쪽:** `panel-weekly` 축소·우열 (`refreshWeeklyPanel`)
- **입력:** 전체 화면 탭 재시작 제거. 좌/우·빈 영역 탭 무시.

### 결정 (적용)

- 일간 = **A. 새 세로 패널** (주간과 동일 프레임)
- Replay = **A. 에셋 버튼** (`prep-panels.py` → `btn-replay.png`)

### 구현

- `scripts/prep-panels.py` — `panel-daily`(검 매트 flood), `btn-replay`(흰 매트 soft_alpha)
- `GameScene` — `gameOverRoot` 3열, Replay 히트 + `ignoreNextWindowTap`

---

## 4. 암전 WARNING 말풍선 ✅ (에셋)

- **What:** `⚠ 정전 경고` 텍스트 → 뾰족(스파이크) `warn-bubble` 뱃지 + 알람형 점멸.
- **Why:** 위험 예고가 HUD 텍스트처럼 묻힘. 말풍선이 “이벤트”로 읽힘.
- **구현:** `warn-bubble.png`(WARNING baked) Image, warn 페이즈에서 알파 `0.25↔1.0` 사인 점멸(주기 `sin(now*0.022)`).
- **prep:** `assets/images/ui/warn-bubble-src.png` → `scripts/prep-ui.py` → `assets/game/warn-bubble.png` (504×164 @3x).

---

## 5. 콤보 띠지 (우→좌 슬라이드) ✅

- **What:** 중앙 대문짝 콤보 제거 → **우측 중상단** 검정 띠지 위 `N combo`.
- **등장:** 콤보 ≥2가 되는 순간 화면 밖(우측) → 좌로 슬라이드 인. 사라질 때 우로 슬라이드 아웃.
- **Why:** 중앙은 플레이 시야·장애물과 겹침. 우측 띠지는 “상태 HUD”로 읽히기 좋음.
- **경계:** 렌더 전용.

---

## 6. 1000m 마일스톤 — 추천 💬

현재: 중앙 `⚡ 1,000M` 팝업 + 바이옴 팔레트 전환.

| 옵션 | 연출 | 장점 | 단점 |
|------|------|------|------|
| **A. Zone Toast (추천)** | 상단 얇은 배너 `ZONE 2 · 1000M` 가 위에서 내려왔다가 사라짐 | 시야 방해 적음, 구역 전환과 의미 연결 | 임팩트 약함 |
| **B. Punch Title** | 현재처럼 큰 숫자 + 짧은 화면 펀치줌 | “달성감” 큼 | 장애물 타이밍과 겹치면 짜증 |
| **C. Silent Crossfade** | 숫자 없이 배경만 부드럽게 바뀜 + 작은 코너 칩 | 몰입 유지 | 유저가 놓치기 쉬움 |

**추천:** **A**. 1000m는 “점수 자랑”보다 “구역이 바뀌었다” 신호라서, 큰 중앙 팝업(B)보다 상단 토스트가 콤보 띠지·암전 경고와 HUD 위계가 맞음.  
원하면 B를 3000/5000m 같은 **큰 구간만** 섞는 하이브리드도 가능.

---

## 7. 간판 위치 하향 ✅

- **What:** `makeSignageDecor`의 바닥 y를 약 **+24px** (화면 아래로).
- **Why:** 원경인데 너무 높이 떠 있어 스카이라인·태양과 겹쳐 보임.
- **경계:** 렌더 전용.

---

## 8. 원경 바이옴 전환 부드럽게 ✅

- **문제:** `biomeTo` 바뀌는 순간 타일 알파가 0↔0.4로 **하드 스왑** → “휙” 바뀜. 하늘만 2s 크로스페이드.
- **조치:**
  - 원경 3타일을 `biomeMix`로 **크로스페이드**
  - `BIOME_FADE_MS` **2000 → 3500**
- **경계:** 렌더 전용.

---

## 9. 피버·조작 튜토리얼 — 「오늘 다시 안보기」 ✅

### 정책 (2026-07-10)

- **영구 `ga:fever-tutorial` 제거** → day-key `ga:howto-hide:YYYYMMDD` / `ga:fever-hide:YYYYMMDD`
- **조작 튜토리얼 (옵션 A):** 인트로 Start → 게임 방법 카드 → 플레이
  - 카피: 탭 점프 · 1/2단 · 장애물 · 연료통 HP 회복
  - 「플레이 →」 / 「오늘 다시 안보기」
- **피버 튜토리얼:** 세션·오늘 미숨김이면 첫 `EV_FEVER_START`에 일시정지 1회
  - 리플레이여도 오늘 안 숨겼으면 뜸 (예전 isRetry 스킵 제거)
- 에셋 프롬프트: `docs/design/howto-tutorial-asset.md`  
  마일스톤 상반신: `docs/design/milestone-cheer-asset.md` (기존, 스킵)

### 뱃지

- FEVER/WARNING 같은 슬롯 · **피버 우선** 상호배제
- 점멸: `sin(t*0.006)`, 알파 ≈0.55~1.0 (호흡형)
- FEVER = 형광 노랑(`#dfff00`), WARNING = 샘플 마젠타 톤


---

## 에셋 추가 메모

- Replay 버튼: `asset-guide.md` **§5.7F btn-replay**
- WARNING 말풍선: `asset-guide.md` **§5.7G warn-bubble**
- HP/랭킹 패널 재생성 프롬프트의 CRITICAL ALPHA는 기존 §5.7 개정분 유지

---

## 적용 파일 (당일)

- `src/render/GameScene.ts` — 1,2,3,4,5,7,8
- `scripts/prep-panels.py` — panel-daily / btn-replay / 검매트 flood
- `assets/game/panel-daily.png`, `btn-replay.png`, `panel-weekly.png` (재생성)
- `docs/design/asset-guide.md` — §5.7F
- `docs/design/ux-polish-2026-07.md` — 본 문서
