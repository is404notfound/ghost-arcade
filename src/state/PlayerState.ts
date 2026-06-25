let cleanup: { kill: () => void } | null = null;

function showGameOver(): void {
  const overlay = document.getElementById('game-over-overlay');
  if (overlay) overlay.style.display = 'flex';
}

export function registerCleanup(handler: { kill: () => void }): void {
  cleanup = handler;
}

export function checkAlive(lives: number | null): void {
  // 느슨한 비교(== false)를 제거하고 명시적인 숫자 비교(<= 0)로 변경
  if (lives !== null && lives <= 0) {
    showGameOver();
    // Non-null assertion(!) 대신 Optional Chaining(?.)을 사용하여 안전하게 호출
    cleanup?.kill();
  }
}

export function resetState(): void {
  cleanup = null;
}
