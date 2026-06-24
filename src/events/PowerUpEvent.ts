export type PowerUpType = 'shield' | 'speedBoost' | 'scoreMultiplier';

export interface PowerUpPayload {
  type: PowerUpType;
  duration: number;
}

function applyPowerUp(type: string, duration: number): void {
  const entry = { type, expiresAt: Date.now() + duration };
  console.debug('[power-up] activated', entry);
}

export function onPowerUp(payload?: PowerUpPayload): void {
  if (!payload) {
    console.warn('[power-up] ignoring onPowerUp call with missing payload', payload);
    return;
  }
  const { type, duration } = payload;
  applyPowerUp(type, duration);
}

export function onPowerUpExpired(type: PowerUpType): void {
  console.debug('[power-up] expired', type);
}
