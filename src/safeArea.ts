// 앱인토스 Safe Area — CSS 변수 + Phaser 논리좌표 패드로 반영.
//
// 공식: SafeAreaInsets.get / subscribe (@apps-in-toss/web-framework)
// X 버튼: right = inset.right + 10, top = inset.top + 5|10
//   → 우측 콘텐츠 여백에 +10px(CSS)를 더해 겹침·검수 리스크를 줄인다.
//
// Phaser는 Scale.FIT로 캔버스가 뷰포트 안에 레터박스될 수 있으므로,
// inset은 "뷰포트 기준" → "캔버스와 겹치는 분량"만 논리(DESIGN) 좌표로 환산한다.

import { isAppsInTossHost } from './aitHost';
import { DESIGN_H, DESIGN_W } from './render/viewport';

export type SafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** 문서상 프레임워크 X 버튼 가로 오프셋 (CSS px) */
export const SAFE_X_BUTTON_GAP_PX = 10;

const ZERO: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

let current: SafeInsets = { ...ZERO };
const listeners = new Set<(insets: SafeInsets) => void>();

function normalize(raw: Partial<SafeInsets> | null | undefined): SafeInsets {
  return {
    top: Math.max(0, Number(raw?.top) || 0),
    right: Math.max(0, Number(raw?.right) || 0),
    bottom: Math.max(0, Number(raw?.bottom) || 0),
    left: Math.max(0, Number(raw?.left) || 0),
  };
}

function applyCssVars(insets: SafeInsets): void {
  const root = document.documentElement;
  root.style.setProperty('--safe-top', `${insets.top}px`);
  root.style.setProperty('--safe-right', `${insets.right}px`);
  root.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  root.style.setProperty('--safe-left', `${insets.left}px`);
}

function setInsets(insets: SafeInsets): void {
  current = insets;
  applyCssVars(insets);
  for (const cb of listeners) cb(insets);
}

/** 브라우저 env(safe-area-inset-*) 폴백 — AIT 밖 로컬/Safari용 */
function readCssEnvInsets(): SafeInsets {
  if (typeof document === 'undefined') return { ...ZERO };
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';');
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const insets = normalize({
    top: parseFloat(cs.paddingTop),
    right: parseFloat(cs.paddingRight),
    bottom: parseFloat(cs.paddingBottom),
    left: parseFloat(cs.paddingLeft),
  });
  el.remove();
  return insets;
}

export function getSafeInsets(): SafeInsets {
  return current;
}

export function onSafeInsetsChange(cb: (insets: SafeInsets) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** CSS px → 디자인 X (캔버스 표시 폭 기준) */
export function cssPxToDesignX(
  canvas: HTMLCanvasElement | null | undefined,
  cssPx: number,
): number {
  if (!canvas || cssPx <= 0) return 0;
  const w = canvas.getBoundingClientRect().width;
  if (w <= 0) return 0;
  return (cssPx * DESIGN_W) / w;
}

/**
 * 뷰포트 Safe Area가 캔버스와 겹치는 분량을 DESIGN_W×DESIGN_H 패드로 환산.
 * 레터박스 밖 inset은 0 — 이미 캔버스 밖에 있으므로 HUD를 더 밀 필요 없음.
 * top은 반환하되 HUD 랭킹에는 쓰지 않음(과도한 하향). right/bottom만 레이아웃에 사용.
 */
export function getDesignSafePads(
  canvas: HTMLCanvasElement | null | undefined,
  insets: SafeInsets = current,
): { top: number; right: number; bottom: number } {
  if (!canvas) {
    return { top: 0, right: 0, bottom: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { top: 0, right: 0, bottom: 0 };
  }
  const sx = DESIGN_W / rect.width;
  const sy = DESIGN_H / rect.height;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const topOverlap = Math.max(0, insets.top - rect.top);
  const bottomOverlap = Math.max(0, rect.bottom - (vh - insets.bottom));
  const rightOverlap = Math.max(0, rect.right - (vw - insets.right));

  return {
    top: topOverlap * sy,
    bottom: bottomOverlap * sy,
    // X 버튼 가로 오프셋(+10)까지 우측 예약
    right: rightOverlap * sx + SAFE_X_BUTTON_GAP_PX * sx,
  };
}

/**
 * Safe Area 구독 시작. 가로 잠금 직후에 호출하는 것이 좋다(landscape inset).
 * @returns unsubscribe
 */
export async function initSafeArea(): Promise<() => void> {
  // 즉시 CSS 변수 확보 — 컨트롤 DOM이 var(--safe-*)를 쓸 수 있게
  setInsets(readCssEnvInsets());

  if (!isAppsInTossHost()) {
    return () => {};
  }

  try {
    const { SafeAreaInsets } = await import('@apps-in-toss/web-framework');
    setInsets(normalize(SafeAreaInsets.get()));
    return SafeAreaInsets.subscribe({
      onEvent: (next) => setInsets(normalize(next)),
    });
  } catch (e) {
    console.warn('[ait] SafeAreaInsets 초기화 실패 — CSS env 폴백 유지', e);
    return () => {};
  }
}
