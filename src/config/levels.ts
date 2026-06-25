import { GAME_CONFIG } from './GameConfig';

export interface LevelPreset {
  id: number;
  difficulty: number;
  speed: number;
  label: string;
}

export const LEVEL_PRESETS: LevelPreset[] = [
  { id: 1, difficulty: 1, get speed() { return GAME_CONFIG.baseSpeed; }, label: 'Beginner' },
  { id: 2, difficulty: 2, get speed() { return GAME_CONFIG.baseSpeed * 1.5; }, label: 'Intermediate' },
  { id: 3, difficulty: 3, get speed() { return GAME_CONFIG.baseSpeed * 2.0; }, label: 'Advanced' },
];
