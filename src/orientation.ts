// 시작 게이트 + 세로 가드
//
//  1. 첫 탭 → requestFullscreen() + screen.orientation.lock('landscape')
//     둘 다 try/catch (iOS Safari 등 미지원 시 조용히 무시)
//  2. 세로 회전 감지 → "가로로 돌려주세요" 오버레이 + 게임 일시정지
//     가로 복귀 → 오버레이 제거 + 재개

export interface OrientationCallbacks {
  pauseGame: () => void;
  resumeGame: () => void;
}

export function initOrientationGate(cb: OrientationCallbacks): void {
  // ─── 오버레이 생성 ──────────────────────────────────────────
  const startEl = document.createElement('div');
  startEl.id = 'start-overlay';
  const startSpan = document.createElement('span');
  startSpan.textContent = '탭하여 시작';
  startEl.appendChild(startSpan);
  document.body.appendChild(startEl);

  const portraitEl = document.createElement('div');
  portraitEl.id = 'portrait-overlay';
  const portraitSpan = document.createElement('span');
  portraitSpan.textContent = '가로로 돌려주세요';
  portraitEl.appendChild(portraitSpan);
  portraitEl.style.display = 'none';
  document.body.appendChild(portraitEl);

  // ─── 상태 ─────────────────────────────────────────────────
  let startDismissed = false;
  let portraitPaused = false;

  // ─── 가로/세로 감지 ─────────────────────────────────────────
  function checkOrientation(): void {
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait) {
      if (portraitEl.style.display === 'none') {
        portraitEl.style.display = 'flex';
        if (startDismissed && !portraitPaused) {
          try { cb.pauseGame(); } catch { /* 씬 미준비 시 무시 */ }
          portraitPaused = true;
        }
      }
    } else {
      if (portraitEl.style.display !== 'none') {
        portraitEl.style.display = 'none';
        if (portraitPaused) {
          try { cb.resumeGame(); } catch { /* 씬 미준비 시 무시 */ }
          portraitPaused = false;
        }
      }
    }
  }

  window.addEventListener('orientationchange', checkOrientation);
  window.addEventListener('resize', checkOrientation);
  checkOrientation(); // 초기 상태 체크

  // ─── 시작 탭 ──────────────────────────────────────────────
  startEl.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation(); // window pointerdown (점프 핸들러) 전파 차단
    startDismissed = true;
    startEl.style.display = 'none';

    void (async () => {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // 미지원 환경 — 무시하고 게임 진행
      }
      try {
        // Screen Orientation API — TS DOM 타입에 누락됨, 런타임 미지원 시 예외 발생
        await (screen.orientation as unknown as { lock(o: string): Promise<void> }).lock('landscape');
      } catch {
        // iOS Safari 등 미지원 — 무시
      }
    })();
  });

  // 세로 오버레이 탭이 점프로 전파되지 않도록
  portraitEl.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
  });
}
