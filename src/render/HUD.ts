const DIFFICULTY_LABELS: string[] = ['EASY', 'NORMAL', 'HARD'];

export function getDifficultyLabel(level: number): string {
  const label = DIFFICULTY_LABELS[level - 1];
  return label ? label.toUpperCase() : 'UNKNOWN';
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.floor(meters)}m`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
