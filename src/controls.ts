// 게임 컨트롤 DOM — 우측 고정 + 세로 화면 중앙 정렬
//
//  - 일시정지: 항상 (플레이 중)
//  - 음소거·다시하기: 일시정지 중에만 같은 열에 이어서 표시
//  - 1개/3개 모두 그룹 중심이 세로 중앙 (CSS top:50% + translateY(-50%))
//  - 아이콘은 단색 SVG (토스 크롬·중앙 || 오버레이와 톤 맞춤)
//  - pointerdown/click stopPropagation으로 게임 점프와 분리

import { isAppsInTossHost } from './aitHost';

let _onPauseToggle: (() => void) | null = null;
let _onRestart: (() => void) | null = null;
let _onMuteToggle: (() => void) | null = null;
let _pauseBtn: HTMLButtonElement | null = null;
let _muteBtn: HTMLButtonElement | null = null;
let _pausedExtras: HTMLElement[] = [];
let _dock: HTMLDivElement | null = null;

const ICON_PAUSE = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>`;
const ICON_PLAY = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5L8 5.5z"/></svg>`;
const ICON_VOLUME = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>`;
const ICON_VOLUME_OFF = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 12c0-1.8-1-3.3-2.5-4v2.2l2.5 2.5V12zm2.5 0c0 .9-.2 1.8-.5 2.6l1.5 1.5c.6-1.2 1-2.6 1-4.1 0-3.7-2.2-6.6-5.5-7.7v2.1c2.1 1 3.5 3.1 3.5 5.6zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3 1.3-1.3L4.3 3zM12 4l-1.9 1.9L12 7.8V4z"/></svg>`;
const ICON_RESTART = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7.5 6.5 12 11V8c2.8 0 5 2.2 5 5a5 5 0 1 1-9.9-1H5a7 7 0 1 0 7-7z"/></svg>`;
const ICON_FS = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9V4h5v2H6v3H4zm10-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm16 5h-5v-2h3v-3h2v5z"/></svg>`;
const ICON_FS_EXIT = `<svg class="ctrl-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4H4v5h2V6h3V4zm6 0v2h3v3h2V4h-5zM6 15H4v5h5v-2H6v-3zm14 0h-2v3h-3v2h5v-5z"/></svg>`;

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
  if (!_pauseBtn || !_dock) return;
  _pauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
  _pauseBtn.setAttribute('aria-label', paused ? '계속하기' : '일시정지');
  _dock.style.display = visible ? 'flex' : 'none';
}

/**
 * 일시정지 전용 버튼(음소거·다시하기) — 우상단 세로 열에서 pause 아래에만 노출.
 */
export function setPausedMenuVisible(visible: boolean): void {
  for (const el of _pausedExtras) {
    el.style.display = visible ? 'flex' : 'none';
  }
}

/** @deprecated setPausedMenuVisible 호환 래퍼 */
export function setRestartButtonVisible(visible: boolean): void {
  setPausedMenuVisible(visible);
}

/** 음소거 버튼 아이콘 갱신 */
export function setMuteButtonState(muted: boolean): void {
  if (!_muteBtn) return;
  _muteBtn.innerHTML = muted ? ICON_VOLUME_OFF : ICON_VOLUME;
  _muteBtn.setAttribute('aria-label', muted ? '소리 켜기' : '음소거');
}

function bindTap(btn: HTMLButtonElement, onClick: () => void): void {
  btn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  btn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    onClick();
  });
}

export function initGameControls(): void {
  const dock = document.createElement('div');
  dock.id = 'game-controls';
  dock.style.display = 'flex';
  document.body.appendChild(dock);
  _dock = dock;
  _pausedExtras = [];

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.setAttribute('aria-label', '일시정지');
  pauseBtn.innerHTML = ICON_PAUSE;
  dock.appendChild(pauseBtn);
  _pauseBtn = pauseBtn;
  bindTap(pauseBtn, () => _onPauseToggle?.());

  // 전체화면: 토스 WebView에선 숨김 — 일시정지 열에만 노출
  const canUseHtmlFullscreen =
    !isAppsInTossHost() &&
    typeof document.documentElement.requestFullscreen === 'function';

  if (canUseHtmlFullscreen) {
    const fsBtn = document.createElement('button');
    fsBtn.id = 'fs-btn';
    fsBtn.setAttribute('aria-label', '전체화면 토글');
    fsBtn.style.display = 'none';
    fsBtn.innerHTML = ICON_FS;
    dock.appendChild(fsBtn);
    _pausedExtras.push(fsBtn);

    const updateFsIcon = (): void => {
      fsBtn.innerHTML = document.fullscreenElement ? ICON_FS_EXIT : ICON_FS;
    };
    updateFsIcon();

    bindTap(fsBtn, () => {
      void (async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else {
            await document.documentElement.requestFullscreen();
          }
        } catch { /* 미지원 또는 권한 거부 */ }
      })();
    });
    document.addEventListener('fullscreenchange', updateFsIcon);
  }

  const muteBtn = document.createElement('button');
  muteBtn.id = 'mute-btn';
  muteBtn.setAttribute('aria-label', '음소거');
  muteBtn.style.display = 'none';
  muteBtn.innerHTML = ICON_VOLUME;
  dock.appendChild(muteBtn);
  _muteBtn = muteBtn;
  _pausedExtras.push(muteBtn);
  bindTap(muteBtn, () => _onMuteToggle?.());

  const restartBtn = document.createElement('button');
  restartBtn.id = 'restart-btn';
  restartBtn.setAttribute('aria-label', '처음부터 다시하기');
  restartBtn.style.display = 'none';
  restartBtn.innerHTML = ICON_RESTART;
  dock.appendChild(restartBtn);
  _pausedExtras.push(restartBtn);
  bindTap(restartBtn, () => _onRestart?.());
}
