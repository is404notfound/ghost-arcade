// 고정 타임스텝 어큐뮬레이터.
//
//   렌더 프레임(가변) ──update(elapsedMs)──► [누적기] ──dt 단위로──► step() × N
//
// 렌더 fps가 흔들려도 시뮬은 항상 dt 간격으로 진행 → 입력로그의 프레임 인덱스가
// 어느 기기에서나 같은 시뮬 시각을 가리킨다 (리플레이 전제 조건).
export class FixedTimestep {
  private acc = 0;

  constructor(
    private readonly dtMs: number,
    private readonly maxSteps = 8, // 탭 전환 복귀 등 큰 elapsed가 와도 한 번에 이만큼만
  ) {}

  /** 경과 시간을 누적하고, dt를 채운 만큼 step 콜백을 실행한다. 실행한 스텝 수를 반환. */
  update(elapsedMs: number, step: () => void): number {
    this.acc += elapsedMs;
    let n = 0;
    while (this.acc >= this.dtMs && n < this.maxSteps) {
      step();
      this.acc -= this.dtMs;
      n++;
    }
    // maxSteps에 걸렸다면 남은 빚은 버린다 — 다음 프레임에 몰아치면
    // 한 번 느려진 기기가 영원히 따라잡지 못하는 나선에 빠진다.
    if (n === this.maxSteps && this.acc >= this.dtMs) {
      this.acc = 0;
    }
    return n;
  }
}
