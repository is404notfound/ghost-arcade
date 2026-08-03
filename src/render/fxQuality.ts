// 렌더 FX 품질 티어 — 시각은 유지하되 CPU/GPU 예산을 줄인다 (sim·결정론 무관).
//
// ⚠️ 2026-08-03 실측이 최초 가정을 뒤집음.
//   기존 설계: "Android WebView가 약하다" → Android만 완화, iOS는 풀옵션.
//   실측 결과: **iOS ~40fps vs Android ~70fps.** 느린 쪽은 iOS였다.
//   원인 추정: iOS만 무거운 설정으로 돌고 있었음.
//     - DPR 상한 2 (Android 1.5) → 백킹 픽셀 수가 ~78% 많음. iPhone은 DPR 3 기기가 다수
//     - postFX 글로우 ON (Android는 OFF) → 저사양 WebGL에서 프레임 드롭 주원인
//     - 토스 미니앱은 WKWebView라 Safari보다 WebGL 제약이 있음
//
// 그래서 티어를 **플랫폼 이름이 아니라 "필레이트가 빠듯한 환경"** 기준으로 재정의한다.
// 지금 조정하는 건 큰 레버 2개(DPR·postFX) + 체감 없는 재드로우 주기뿐이다.
// 메테오/화염 개수는 iOS에서 일단 유지 — 눈에 보이는 변화라, 이번 변경의 효과를
// 먼저 확인한 뒤 다음 레버로 남겨둔다.

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

/** Android WebView/Chrome — 필레이트·Graphics 드로우에 특히 약함 */
export const IS_ANDROID = /Android/i.test(ua);

/**
 * iOS/iPadOS — 토스 미니앱은 WKWebView.
 * iPadOS 13+는 UA가 Macintosh로 위장되므로 터치 포인트로 보정한다.
 */
export const IS_IOS =
  /iPad|iPhone|iPod/i.test(ua) ||
  (/Macintosh/i.test(ua) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1);

/** 필레이트가 빠듯한 모바일 WebView 티어 (Android + iOS 실측 기반) */
export const IS_LOW_FILLRATE = IS_ANDROID || IS_IOS;

/**
 * 백킹 캔버스 DPR 상한.
 * 데스크톱은 2, 모바일 WebView는 1.5 — 픽셀 수가 ~44% 줄어 필레이트 여유가 크다.
 * (텍스트는 LINEAR 업스케일로 충분, 레티나 선명도 손실은 작음)
 *
 * 되돌리기: iOS 선명도가 눈에 띄게 나빠졌다면 이 값만 되돌리면 된다.
 */
export const RENDER_DPR_CAP = IS_LOW_FILLRATE ? 1.5 : 2;

/** 동시 메테오 상한 — 드로우 비용의 큰 축 */
export const FX_MAX_METEORS = IS_ANDROID ? 2 : 3;

/** 화염 레이어 tongues 배율 (원본 대비). ≥2가닥 보장은 호출측에서 Math.max(2, …) */
export const FX_FLAME_TONGUE_SCALE = IS_ANDROID ? 0.65 : 0.85;

/** 화염 불씨·스파크 개수 */
export const FX_FLAME_EMBERS = IS_ANDROID ? 4 : 6;
export const FX_FLAME_SPARKS = IS_ANDROID ? 6 : 9;

/** 메테오 꼬리/불티/스파크 */
export const FX_METEOR_TONGUES = IS_ANDROID ? 4 : 5;
export const FX_METEOR_EMBERS = IS_ANDROID ? 6 : 8;
export const FX_METEOR_SPARKS = IS_ANDROID ? 3 : 4;

/** 태양 블룸 겹수·재드로우 주기(ms) */
export const FX_SUN_BLOOM_LAYERS = IS_ANDROID ? 4 : 5;
export const FX_SUN_REDRAW_MS = IS_LOW_FILLRATE ? 140 : 120;

/** 메테오·트레일·연기 재드로우 주기(ms) — 화염은 스크롤 동기 위해 매 프레임 유지 */
export const FX_REDRAW_MS = IS_LOW_FILLRATE ? 100 : 90;

/**
 * 바이크 postFX 소프트 글로우 — 모바일 WebView에선 끈다.
 * 이유: postFX는 별도 렌더 타깃 + 셰이더 패스라 저사양 WebGL에서 프레임 드롭 주원인.
 * 외곽 시안/피버 노랑 스트로크는 GameScene의 tintFill 레이어가 전 기기에서 담당하므로
 * 캐릭터 실루엣·색 정보는 유지된다.
 */
export const FX_PLAYER_GLOW = !IS_LOW_FILLRATE;
