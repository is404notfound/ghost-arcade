// 전체화면 토글 + 일시정지 + 다시하기 DOM 버튼
//
//  - pointerdown/click stopPropagation으로 게임 점프(window pointerdown)와 분리
//  - 일시정지 콜백은 GameScene.create()에서 registerPauseToggle로 등록
//  - 다시하기 버튼은 일시정지 중에만 노출, 클릭 시 startRun(true) 트리거

let _onPauseToggle: (() => void) | null = null;
let _onRestart: (() => void) | null = null;
let _pauseBtn: HTMLButtonElement | null = null;
let _restartBtn: HTMLButtonElement | null = null;

/** GameScene.create() 시 등록 — 일시정지 토글 핸들러 */
export function registerPauseToggle(cb: () => void): void {
  _onPauseToggle = cb;
}

/** GameScene.create() 시 등록 — 다시하기(startRun) 핸들러 */
export function registerRestart(cb: () => void): void {
  _onRestart = cb;
}

/** 일시정지 버튼 상태 갱신 (GameScene에서 호출) */
export function setPauseButtonState(paused: boolean, visible: boolean): void {
  if (!_pauseBtn) return;
  _pauseBtn.textContent = paused ? '▶' : '⏸';
  _pauseBtn.style.display = visible ? '' : 'none';
}

/** 다시하기 버튼 표시/숨김 — 일시정지 진입/해제 시 GameScene에서 호출 */
export function setRestartButtonVisible(visible: boolean): void {
  if (!_restartBtn) return;
  _restartBtn.style.display = visible ? '' : 'none';
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

  // ─── 다시하기 버튼 — 일시정지 중에만 표시 ──────────────────────────
  const restartBtn = document.createElement('button');
  restartBtn.id = 'restart-btn';
  restartBtn.setAttribute('aria-label', '처음부터 다시하기');
  restartBtn.textContent = '↺';
  restartBtn.style.display = 'none'; // 기본 숨김 — 일시정지 진입 시 표시
  wrap.appendChild(restartBtn);
  _restartBtn = restartBtn;

  restartBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  restartBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    _onRestart?.();
  });
}
