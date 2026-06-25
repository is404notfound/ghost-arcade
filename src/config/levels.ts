export interface LevelPreset {
  id: number;
  difficulty: number;
  speedMultiplier: number;
  label: string;
}

export const LEVEL_PRESETS: LevelPreset[] = [
  { id: 1, difficulty: 1, speedMultiplier: 1.0, label: 'Beginner' },
  { id: 2, difficulty: 2, speedMultiplier: 1.5, label: 'Intermediate' },
  { id: 3, difficulty: 3, speedMultiplier: 2.0, label: 'Advanced' },
];
