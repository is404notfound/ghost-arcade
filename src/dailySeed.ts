// 데일리 시드 — "오늘의 코스".
// UTC 날짜(YYYYMMDD)에서 시드를 유도한다: 같은 날 = 전 세계 같은 코스.
// 셀프 고스트(직전 최고 기록)가 같은 장애물 배치 위에서 정렬되는 전제이자,
// 나중에 크로스유저 리더보드의 "오늘의 코스"로 그대로 확장된다 (TODOS 시드 공유 결정).
//
// 주의: 이 파일은 Date를 쓰므로 src/sim/ 밖에 있다 — 시뮬 코어의 결정론(D10)은
// "시드를 받은 이후"부터 시작하고, 시드를 정하는 일은 결정론 바깥의 일이다.

export function dailySeed(now: Date = new Date()): number {
  const ymd =
    now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  // 단순 증가값을 그대로 쓰면 인접한 날의 코스가 비슷해질 수 있어 한 번 뒤섞는다
  // (Knuth 곱셈 해시 — 32비트 정수 연산이라 어디서나 동일)
  let h = Math.imul(ymd, 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
