// 이어뛰기 팝업 — 0.4초 입력 유예 + 5초 카운트다운 (결정 D).
// GameScene은 띄워달라/결과만 받는다. 광고 호출은 Scene 쪽.
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from '../render/viewport';

const FONT = "'Fredoka', 'Mulmaru', sans-serif";
const INPUT_GRACE_MS = 400;
const COUNTDOWN_SEC = 5;

export type RevivePromptCloseReason = 'timeout' | 'user' | 'accepted';

export interface RevivePromptCallbacks {
  onAccepted: () => void;
  onClosed: (reason: RevivePromptCloseReason) => void;
}

export class RevivePrompt {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly countdownText: Phaser.GameObjects.Text;
  private readonly reviveHit: Phaser.GameObjects.Rectangle;
  private readonly declineHit: Phaser.GameObjects.Rectangle;
  private timer: Phaser.Time.TimerEvent | null = null;
  private graceTimer: Phaser.Time.TimerEvent | null = null;
  private secondsLeft = COUNTDOWN_SEC;
  private inputEnabled = false;
  private active = false;
  private cbs: RevivePromptCallbacks | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const veil = scene.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x000000, 0.55);
    const panel = scene.add.rectangle(0, 0, 420, 220, 0x12081f, 0.92);
    panel.setStrokeStyle(2, 0x36f9f6, 0.7);

    const title = scene.add
      .text(0, -70, '이어뛸까요?', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.countdownText = scene.add
      .text(0, -28, String(COUNTDOWN_SEC), {
        fontFamily: FONT,
        fontSize: '42px',
        color: '#36f9f6',
      })
      .setOrigin(0.5);

    const reviveLabel = scene.add
      .text(0, 40, '광고 보고 이어뛰기', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#0a0612',
      })
      .setOrigin(0.5);
    const reviveBg = scene.add.rectangle(0, 40, 260, 44, 0x36f9f6, 1);
    this.reviveHit = scene.add
      .rectangle(0, 40, 280, 56, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });

    const declineLabel = scene.add
      .text(0, 92, '그만하기', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#c8b8d8',
      })
      .setOrigin(0.5);
    this.declineHit = scene.add
      .rectangle(0, 92, 160, 36, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });

    this.reviveHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation?.();
      if (!this.active || !this.inputEnabled) return;
      this.finish('accepted');
    });
    this.declineHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation?.();
      if (!this.active || !this.inputEnabled) return;
      this.finish('user');
    });

    this.root = scene.add
      .container(DESIGN_W / 2, DESIGN_H / 2, [
        veil,
        panel,
        title,
        this.countdownText,
        reviveBg,
        reviveLabel,
        this.reviveHit,
        declineLabel,
        this.declineHit,
      ])
      .setDepth(95)
      .setVisible(false);
  }

  show(cbs: RevivePromptCallbacks): void {
    this.hide();
    this.cbs = cbs;
    this.active = true;
    this.inputEnabled = false;
    this.secondsLeft = COUNTDOWN_SEC;
    this.countdownText.setText(String(this.secondsLeft));
    this.root.setVisible(true);

    this.graceTimer = this.scene.time.delayedCall(INPUT_GRACE_MS, () => {
      this.graceTimer = null;
      this.inputEnabled = true;
    });

    this.timer = this.scene.time.addEvent({
      delay: 1000,
      repeat: COUNTDOWN_SEC - 1,
      callback: () => {
        this.secondsLeft -= 1;
        this.countdownText.setText(String(Math.max(0, this.secondsLeft)));
        if (this.secondsLeft <= 0) this.finish('timeout');
      },
    });
  }

  isActive(): boolean {
    return this.active;
  }

  hide(): void {
    if (this.timer) {
      this.timer.remove(false);
      this.timer = null;
    }
    if (this.graceTimer) {
      this.graceTimer.remove(false);
      this.graceTimer = null;
    }
    this.active = false;
    this.inputEnabled = false;
    this.root.setVisible(false);
  }

  destroy(): void {
    this.hide();
    this.root.destroy(true);
  }

  private finish(reason: RevivePromptCloseReason): void {
    if (!this.active) return;
    const cbs = this.cbs;
    this.hide();
    this.cbs = null;
    if (reason === 'accepted') cbs?.onAccepted();
    else cbs?.onClosed(reason);
  }
}
