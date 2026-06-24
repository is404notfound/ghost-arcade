import { LEVEL_PRESETS } from './levels';

export interface GameConfigData {
  baseSpeed: number;
  startLevel: { id: number; difficulty: number; speed: number; label: string } | undefined;
  totalLevels: number;
}

export const GAME_CONFIG: GameConfigData = {
  baseSpeed: 300,
  startLevel: LEVEL_PRESETS[0],
  totalLevels: LEVEL_PRESETS.length,
};

export function getGameConfig(): GameConfigData {
  return GAME_CONFIG;
}
