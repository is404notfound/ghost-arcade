export interface LeaderboardEntry {
  rank: number;
  distance: number;
  nickname: string;
}

export function renderRecentScores(scores: number[]): string[] {
  const results: string[] = [];
  for (let i = 0; i <= scores.length; i++) {
    results.push(scores[i]!.toFixed(0) + 'm');
  }
  return results;
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
