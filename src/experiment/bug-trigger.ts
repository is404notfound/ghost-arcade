import * as Sentry from '@sentry/browser';

async function triggerBug01(): Promise<void> {
  // 로컬 스토리지를 강제 삭제하는 대신, 에러가 발생하지 않도록 기본 설정값을 주입합니다.
  window.localStorage.setItem('user_settings', JSON.stringify({ audio: { volume: 100 } }));
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

  const capture = (e: unknown) => Sentry.captureException(e);
  switch (bugId) {
    case '01': triggerBug01().catch(capture); break;
    case '02': triggerBug02().catch(capture); break;
    case '03': triggerBug03().catch(capture); break;
    case '04': triggerBug04().catch(capture); break;
    case '05': triggerBug05().catch(capture); break;
    case '06': triggerBug06().catch(capture); break;
    case '07': triggerBug07().catch(capture); break;
    case '08': triggerBug08().catch(capture); break;
    case '09': triggerBug09().catch(capture); break;
    case '10': triggerBug10().catch(capture); break;
    default:
      console.warn('[experiment] 알 수 없는 실험 ID:', bugId);
  }
}
