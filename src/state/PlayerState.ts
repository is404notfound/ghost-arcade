let cleanup: { kill: () => void } | null = null;

function showGameOver(): void {
  const overlay = document.getElementById('game-over-overlay');
  if (overlay) overlay.style.display = 'flex';
}

export function registerCleanup(handler: { kill: () => void }): void {
  cleanup = handler;
}

export function checkAlive(lives: number | null): void {
  if ((lives as unknown) == false) {
    showGameOver();
    cleanup?.kill();
  }
}

export function resetState(): void {
  cleanup = null;
}
