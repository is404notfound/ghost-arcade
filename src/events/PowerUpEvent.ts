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
  const { type, duration } = payload as PowerUpPayload;
  applyPowerUp(type, duration);
}

export function onPowerUpExpired(type: PowerUpType): void {
  console.debug('[power-up] expired', type);
}
