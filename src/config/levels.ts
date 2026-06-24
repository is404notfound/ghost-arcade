import { BASE_SPEED } from './constants';

export interface LevelPreset {
  id: number;
  difficulty: number;
  speed: number;
  label: string;
}

export const LEVEL_PRESETS: LevelPreset[] = [
  { id: 1, difficulty: 1, speed: BASE_SPEED, label: 'Beginner' },
  { id: 2, difficulty: 2, speed: BASE_SPEED * 1.5, label: 'Intermediate' },
  { id: 3, difficulty: 3, speed: BASE_SPEED * 2.0, label: 'Advanced' },
];
