async function triggerBug01(): Promise<void> {
  window.localStorage.removeItem('user_settings');
  const { loadUserSettings } = await import('../data/UserSettings');
  loadUserSettings();
}

async function triggerBug02(): Promise<void> {
  const { getDifficultyLabel } = await import('../render/HUD');
  getDifficultyLabel(4);
}

async function triggerBug03(): Promise<void> {
  const { onPowerUp } = await import('../events/PowerUpEvent');
  onPowerUp(undefined);
}

async function triggerBug04(): Promise<void> {
  const { renderRecentScores } = await import('../ui/Leaderboard');
  renderRecentScores([100, 90, 80]);
}

async function triggerBug05(): Promise<void> {
  const { checkAlive } = await import('../state/PlayerState');
  checkAlive(0);
}

async function triggerBug06(): Promise<void> {
  const { loadHighScores } = await import('../network/ScoreService');
  loadHighScores();
}

async function triggerBug07(): Promise<void> {
  const { createTimer } = await import('../scenes/TimerScene');
  const timer = createTimer({ setText: (v: string) => console.log('[timer]', v) });
  timer.start();
}

async function triggerBug08(): Promise<void> {
  await import('../config/GameConfig');
}

async function triggerBug09(): Promise<void> {
  const { refreshScore } = await import('../render/ScorePanel');
  refreshScore(5);
}

async function triggerBug10(): Promise<void> {
  const { InputHandler } = await import('../input/InputHandler');
  const handler = new InputHandler();
  handler.attachTo(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
}

export function maybeTriggerBug(): void {
  const params = new URLSearchParams(window.location.search);
  const bugId = params.get('bug');
  if (!bugId) return;

  switch (bugId) {
    case '01': void triggerBug01(); break;
    case '02': void triggerBug02(); break;
    case '03': void triggerBug03(); break;
    case '04': void triggerBug04(); break;
    case '05': void triggerBug05(); break;
    case '06': void triggerBug06(); break;
    case '07': void triggerBug07(); break;
    case '08': void triggerBug08(); break;
    case '09': void triggerBug09(); break;
    case '10': void triggerBug10(); break;
    default:
      console.warn('[experiment] 알 수 없는 실험 ID:', bugId);
  }
}
