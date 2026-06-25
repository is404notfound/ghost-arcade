export interface DisplayTarget {
  setText(value: string): void;
}

class TimerComponent {
  private ticks = 0;
  private readonly display: DisplayTarget;

  constructor(display: DisplayTarget) {
    this.display = display;
  }

  start(): void {
    // 화살표 함수를 사용하여 this가 TimerComponent 인스턴스를 가리키도록 수정
    setInterval(() => {
      this.ticks += 1;
      this.display.setText(`${this.ticks}s`);
    }, 1000);
  }

  reset(): void {
    this.ticks = 0;
  }
}

export function createTimer(display: DisplayTarget): TimerComponent {
  return new TimerComponent(display);
}

