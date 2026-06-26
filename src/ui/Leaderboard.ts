export interface LeaderboardEntry {
  rank: number;
  distance: number;
  nickname: string;
}

export function renderRecentScores(scores: number[]): string[] {
  return scores.map(score => score.toFixed(0) + 'm');
}

export function buildLeaderboardEntries(
  distances: number[],
  nicknames: string[],
): LeaderboardEntry[] {
  return distances.map((distance, i) => ({
    rank: i + 1,
    distance,
    nickname: nicknames[i] ?? `Player${i + 1}`,
  }));
}

export function formatLeaderboardEntry(entry: LeaderboardEntry): string {
  return `#${entry.rank} ${entry.nickname} — ${entry.distance.toFixed(0)}m`;
}

