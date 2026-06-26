export interface LevelPreset {
  id: number;
  difficulty: number;
  speed: number;
  label: string;
}

// 순환 참조(Circular Dependency) 및 TDZ 에러를 근본적으로 해결하기 위해
// GameConfig.ts에 대한 의존성을 제거하고 기본 속도 상수를 내부에서 직접 정의합니다.
// 이를 통해 의존성 방향을 단방향(GameConfig -> levels)으로 단순화합니다.
export const BASE_SPEED = 10; 

export const LEVEL_PRESETS: LevelPreset[] = [
  { id: 1, difficulty: 1, speed: BASE_SPEED, label: 'Beginner' },
  { id: 2, difficulty: 2, speed: BASE_SPEED * 1.5, label: 'Intermediate' },
  { id: 3, difficulty: 3, speed: BASE_SPEED * 2.0, label: 'Advanced' },
];
