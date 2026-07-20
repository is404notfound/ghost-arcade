// 일시정지 / 음소거 / 다시하기 DOM 버튼
//
//  - 일시정지(#pause-dock): 일일 랭킹 칩 열 우측에 붙임 — GameScene이 캔버스 좌표로 위치 동기화
//  - 음소거·다시하기(#pause-menu): 일시정지 중에만, 중앙 || 아이콘 아래
//  - pointerdown/click stopPropagation으로 게임 점프(window pointerdown)와 분리
//  - 전체화면: 앱인토스 WebView / Fullscreen API 미지원 환경에선 숨김

import { isAppsInTossHost } from './aitHost';

let _onPauseToggle: (() => void) | null = null;
let _onRestart: (() => void) | null = null;
let _onMuteToggle: (() => void) | null = null;
let _pauseBtn: HTMLButtonElement | null = null;
let _muteBtn: HTMLButtonElement | null = null;
let _pauseDock: HTMLDivElement | null = null;
let _pauseMenu: HTMLDivElement | null = null;

const PAUSE_BTN_CSS = 40; // #pause-btn 한 변(px) — 도크 위치 계산과 공유

/** GameScene.create() 시 등록 — 일시정지 토글 핸들러 */
export function registerPauseToggle(cb: () => void): void {
  _onPauseToggle = cb;
}

/** GameScene.create() 시 등록 — 다시하기(startRun) 핸들러 */
export function registerRestart(cb: () => void): void {
  _onRestart = cb;
}

/** GameScene.create() 시 등록 — 음소거 토글 핸들러 */
export function registerMuteToggle(cb: () => void): void {
  _onMuteToggle = cb;
}

/** 일시정지 버튼 상태 갱신 (GameScene에서 호출) */
export function setPauseButtonState(paused: boolean, visible: boolean): void {
  if (!_pauseBtn || !_pauseDock) return;
  _pauseBtn.textContent = paused ? '▶' : '⏸';
  _pauseBtn.setAttribute('aria-label', paused ? '계속하기' : '일시정지');
  _pauseDock.style.display = visible ? 'flex' : 'none';
}

/**
 * 일시정지 전용 메뉴(음소거·다시하기) 표시.
 * 플레이 중에는 숨기고, 일시정지 오버레이(||) 아래에서만 노출한다.
 */
export function setPausedMenuVisible(visible: boolean): void {
  if (!_pauseMenu) return;
  _pauseMenu.style.display = visible ? 'flex' : 'none';
}

/** @deprecated setPausedMenuVisible 사용 — 호환 래퍼 */
export function setRestartButtonVisible(visible: boolean): void {
  setPausedMenuVisible(visible);
}

/** 음소거 버튼 아이콘 갱신 */
export function setMuteButtonState(muted: boolean): void {
  if (!_muteBtn) return;
  _muteBtn.textContent = muted ? '🔇' : '🔊';
  _muteBtn.setAttribute('aria-label', muted ? '소리 켜기' : '음소거');
}

/**
 * 일시정지 도크를 화면 CSS 좌표(버튼 중심)에 둔다.
 * GameScene이 랭킹 칩 우측 논리 좌표 → 캔버스 bounds로 변환해 호출.
 */
export function setPauseDockScreenPos(cssCenterX: number, cssCenterY: number): void {
  if (!_pauseDock) return;
  _pauseDock.style.left = `${Math.round(cssCenterX)}px`;
  _pauseDock.style.top = `${Math.round(cssCenterY)}px`;
}

export function getPauseButtonCssSize(): number {
  return PAUSE_BTN_CSS;
}

export function initGameControls(): void {
  // ─── 랭킹 우측 일시정지 도크 ─────────────────────────────────
  const dock = document.createElement('div');
  dock.id = 'pause-dock';
  dock.style.display = 'flex';
  document.body.appendChild(dock);
  _pauseDock = dock;

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.setAttribute('aria-label', '일시정지');
  pauseBtn.textContent = '⏸';
  dock.appendChild(pauseBtn);
  _pauseBtn = pauseBtn;

  pauseBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  pauseBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    _onPauseToggle?.();
  });

  // ─── 일시정지 메뉴: 중앙 || 아이콘 아래 (음소거·다시하기[+전체화면]) ───
  const menu = document.createElement('div');
  menu.id = 'pause-menu';
  menu.style.display = 'none';
  document.body.appendChild(menu);
  _pauseMenu = menu;

  // 전체화면: 토스 WebView에선 숨김
  const canUseHtmlFullscreen =
    !isAppsInTossHost() &&
    typeof document.documentElement.requestFullscreen === 'function';

  if (canUseHtmlFullscreen) {
    const fsBtn = document.createElement('button');
    fsBtn.id = 'fs-btn';
    fsBtn.setAttribute('aria-label', '전체화면 토글');
    menu.appendChild(fsBtn);

    function updateFsIcon(): void {
      fsBtn.textContent = document.fullscreenElement ? '⊠' : '⛶';
    }
    updateFsIcon();

    fsBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
    fsBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      void (async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else {
            await document.documentElement.requestFullscreen();
          }
        } catch { /* 미지원 또는 권한 거부 — 무시 */ }
      })();
    });
    document.addEventListener('fullscreenchange', updateFsIcon);
  }

  const muteBtn = document.createElement('button');
  muteBtn.id = 'mute-btn';
  muteBtn.setAttribute('aria-label', '음소거');
  muteBtn.textContent = '🔊';
  menu.appendChild(muteBtn);
  _muteBtn = muteBtn;

  muteBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  muteBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    _onMuteToggle?.();
  });

  const restartBtn = document.createElement('button');
  restartBtn.id = 'restart-btn';
  restartBtn.setAttribute('aria-label', '처음부터 다시하기');
  restartBtn.textContent = '↺';
  menu.appendChild(restartBtn);

  restartBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  restartBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    _onRestart?.();
  });
}
