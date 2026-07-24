// 렌더 FX 품질 티어 — 시각은 유지하되 CPU/GPU 예산을 줄인다 (sim·결정론 무관).
//
// C(전역 미세): 전 기기에서 살짝 절감 — 체감은 거의 없고 프레임 여유만 확보.
// A(Android): UA로만 추가 완화 — iOS/데스크톱 비주얼은 그대로 두고 저사양 WebView만 가볍게.

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

/** Android WebView/Chrome — 필레이트·Graphics 드로우에 특히 약함 */
export const IS_ANDROID = /Android/i.test(ua);

/**
 * 백킹 캔버스 DPR 상한.
 * 전역은 기존처럼 2. Android만 1.5 — 픽셀 수가 ~44% 줄어 필레이트 여유가 큼.
 * (텍스트는 LINEAR 업스케일로 충분, 레티나 선명도 손실은 작음)
 */
export const RENDER_DPR_CAP = IS_ANDROID ? 1.5 : 2;

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
export const FX_SUN_REDRAW_MS = IS_ANDROID ? 140 : 120;

/** 메테오·트레일·연기 재드로우 주기(ms) — 화염은 스크롤 동기 위해 매 프레임 유지 */
export const FX_REDRAW_MS = IS_ANDROID ? 100 : 90;

/**
 * 바이크 postFX 글로우 — Android에선 끄기.
 * 이유: postFX는 저사양 WebGL에서 프레임 드롭 주원인으로 이미 코멘트됨.
 * 스프라이트·틴트는 유지되므로 실루엣 손실은 작고, GPU 여유는 큼.
 */
export const FX_PLAYER_GLOW = !IS_ANDROID;
