// 전체화면 토글 버튼 — DOM 오버레이. 유저 제스처(pointerdown→click)가 있어야 작동.
// iPhone Safari는 전체화면 미지원 → try/catch 후 버튼 숨김.
export function initFullscreenButton(): void {
  const btn = document.createElement('button');
  btn.id = 'fs-btn';
  btn.setAttribute('aria-label', '전체화면 토글');
  btn.textContent = '⛶';
  document.body.appendChild(btn);

  function updateIcon(): void {
    btn.textContent = document.fullscreenElement ? '⊠' : '⛶';
  }

  // 점프 핸들러(window pointerdown)로 버블 차단 — 버튼 탭은 점프 금지
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  btn.addEventListener('click', (): void => {
    void (async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Safari 등 미지원 환경 — 버튼 숨김
        btn.style.display = 'none';
      }
    })();
  });

  document.addEventListener('fullscreenchange', updateIcon);
  updateIcon();
}
