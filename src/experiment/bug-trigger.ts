13: export function loadHighScores(): number[] {
14:   const response = fetchHighScores() as unknown as { scores: number[] };
15:   return response.scores.slice(0, 10);
16: }
