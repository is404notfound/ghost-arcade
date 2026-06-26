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

  // 화살표 함수로 변경하여 this 컨텍스트를 InputHandler 인스턴스로 고정
  handleKey = (event: Event): void => {
    // 강제 타입 단언(as) 대신 instanceof를 사용한 안전한 타입 가드 적용
    if (event instanceof KeyboardEvent) {
      this.buffer.push(event.key);
    }
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
