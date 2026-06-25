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
  if (!payload) return; // payload가 undefined일 경우 안전하게 종료
  
  const { type, duration } = payload;
  applyPowerUp(type, duration);
}

export function onPowerUpExpired(type: PowerUpType): void {
  console.debug('[power-up] expired', type);
}
