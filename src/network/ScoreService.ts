export interface ScoreRecord {
  rank: number;
  distance: number;
  seed: number;
}

async function fetchHighScores(): Promise<{ scores: number[] }> {
  return new Promise((resolve) =>
    setTimeout(() => resolve({ scores: [980, 870, 760, 650, 540] }), 80),
  );
}

export async function loadHighScores(): Promise<number[]> {
  const response = await fetchHighScores();
  return response.scores.slice(0, 10);
}

export async function submitScore(record: ScoreRecord): Promise<void> {
  console.debug('[score-service] submit', record);
}

