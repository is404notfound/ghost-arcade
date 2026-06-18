// 전체화면 토글 + 일시정지 DOM 버튼
//
//  - pointerdown/click stopPropagation으로 게임 점프(window pointerdown)와 분리
//  - 일시정지 콜백은 GameScene.create()에서 registerPauseToggle로 등록

let _onPauseToggle: (() => void) | null = null;
let _pauseBtn: HTMLButtonElement | null = null;

/** GameScene.create() 시 등록 — 일시정지 토글 핸들러 */
export function registerPauseToggle(cb: () => void): void {
  _onPauseToggle = cb;
}

/** 일시정지 버튼 상태 갱신 (GameScene에서 호출) */
export function setPauseButtonState(paused: boolean, visible: boolean): void {
  if (!_pauseBtn) return;
  _pauseBtn.textContent = paused ? '▶' : '⏸';
  _pauseBtn.style.display = visible ? '' : 'none';
}

export function initGameControls(): void {
  const wrap = document.createElement('div');
  wrap.id = 'game-controls';
  document.body.appendChild(wrap);

  // ─── 전체화면 버튼 ───────────────────────────────────────────
  const fsBtn = document.createElement('button');
  fsBtn.id = 'fs-btn';
  fsBtn.setAttribute('aria-label', '전체화면 토글');
  wrap.appendChild(fsBtn);

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

  // ─── 일시정지 버튼 ───────────────────────────────────────────
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.setAttribute('aria-label', '일시정지');
  pauseBtn.textContent = '⏸';
  wrap.appendChild(pauseBtn);
  _pauseBtn = pauseBtn;

  pauseBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  pauseBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    _onPauseToggle?.();
  });
}
