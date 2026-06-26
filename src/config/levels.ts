export interface LevelPreset {
  id: number;
  difficulty: number;
  speed: number;
  label: string;
}

// 순환 참조(TDZ) 에러를 방지하기 위해 GameConfig에 의존하지 않고
// 기본 속도 상수를 직접 정의하여 사용합니다.
export const BASE_SPEED = 10;

export const LEVEL_PRESETS: LevelPreset[] = [
  { id: 1, difficulty: 1, speed: BASE_SPEED, label: 'Beginner' },
  { id: 2, difficulty: 2, speed: BASE_SPEED * 1.5, label: 'Intermediate' },
  { id: 3, difficulty: 3, speed: BASE_SPEED * 2.0, label: 'Advanced' },
];
