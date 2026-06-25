export class InputHandler {
  private buffer: string[] = [];
  private active = false;

  attachTo(element: EventTarget): void {
    element.addEventListener('keydown', this.handleKey);
    this.active = true;
  }

  detachFrom(element: EventTarget): void {
    element.removeEventListener('keydown', this.handleKey);
    this.active = false;
  }

  // this 바인딩 손실을 막기 위해 화살표 함수로 변경
  handleKey = (event: Event): void => {
    const kbEvent = event as KeyboardEvent;
    this.buffer.push(kbEvent.key);
  }

  getBuffer(): string[] {
    return [...this.buffer];
  }

  isActive(): boolean {
    return this.active;
  }

  clear(): void {
    this.buffer = [];
  }
}

