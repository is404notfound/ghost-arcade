// 전체화면 토글 + 방향 전환 DOM 버튼
//
//  - pointerdown/click stopPropagation으로 게임 점프(window pointerdown)와 분리
//  - 방향 전환은 Screen Orientation API feature-detect: 미지원 기기에선 버튼 숨김

type OrLockFn = (orientation: string) => Promise<void>;

const hasOrientationLock: boolean =
  typeof screen !== 'undefined' &&
  'orientation' in screen &&
  typeof (screen.orientation as unknown as Record<string, unknown>).lock === 'function';

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

  // ─── 방향 전환 버튼 ─────────────────────────────────────────
  const orientBtn = document.createElement('button');
  orientBtn.id = 'orient-btn';
  orientBtn.setAttribute('aria-label', '방향 전환');
  orientBtn.textContent = '↻';
  wrap.appendChild(orientBtn);

  if (!hasOrientationLock) {
    // feature-detect 단계에서 이미 미지원 확인 → 버튼 숨김
    orientBtn.style.display = 'none';
  }

  orientBtn.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); });
  orientBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const toLandscape = window.innerHeight > window.innerWidth; // 현재 세로 → 가로로
    void (async () => {
      try {
        await (screen.orientation as unknown as { lock: OrLockFn }).lock(
          toLandscape ? 'landscape' : 'portrait',
        );
      } catch {
        // 런타임에서 미지원 확인 → 이후 표시 불필요
        orientBtn.style.display = 'none';
      }
    })();
  });
}
