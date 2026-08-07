// 이어뛰기 팝업 — 피버 튜토리얼과 동일 panel-tutorial 프레임 + 0.4초 유예·5초 카운트다운.
// GameScene은 띄워달라/결과만 받는다. 광고 호출은 Scene 쪽.
import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from '../render/viewport';
import { RENDER_DPR } from '../render/dpr';

const INPUT_GRACE_MS = 400;
const COUNTDOWN_SEC = 5;
const TXT_RES = Math.max(RENDER_DPR, 2);
const FONT_IMPACT = "'Bangers', 'Black Han Sans', cursive";
const FONT_KR = "'Mulmaru', 'Fredoka', 'Apple SD Gothic Neo', sans-serif";
const NEON_YELLOW_HEX = '#f0f838';
const PANEL_TEX = 'panel-tutorial';

export type RevivePromptCloseReason = 'timeout' | 'user' | 'accepted';

export interface RevivePromptCallbacks {
  onAccepted: () => void;
  onClosed: (reason: RevivePromptCloseReason) => void;
}

export class RevivePrompt {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly countdownText: Phaser.GameObjects.Text;
  private readonly reviveBtn: Phaser.GameObjects.Text;
  private readonly declineBtn: Phaser.GameObjects.Text;
  private timer: Phaser.Time.TimerEvent | null = null;
  private graceTimer: Phaser.Time.TimerEvent | null = null;
  private secondsLeft = COUNTDOWN_SEC;
  private inputEnabled = false;
  private active = false;
  private cbs: RevivePromptCallbacks | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const tex = scene.textures.get(PANEL_TEX);
    const src = tex.getSourceImage() as { width: number; height: number };
    const FH = 300;
    const FW = Math.round((FH * src.width) / src.height);
    const cx = DESIGN_W / 2;
    const cy = DESIGN_H / 2;

    const veil = scene.add
      .rectangle(cx, cy, DESIGN_W, DESIGN_H, 0x000000, 0.72)
      .setInteractive(); // 뒤 탭이 점프로 새지 않게 흡수

    const matte = scene.add
      .image(cx, cy, PANEL_TEX)
      .setDisplaySize(FW + 12, FH + 12)
      .setTint(0x050010);
    const rim = scene.add
      .image(cx, cy, PANEL_TEX)
      .setDisplaySize(FW + 6, FH + 6)
      .setTint(0x36f9f6);
    const bg = scene.add.image(cx, cy, PANEL_TEX).setDisplaySize(FW, FH);

    const title = scene.add
      .text(cx, cy - FH / 2 + 22, '이어뛰기', {
        fontSize: '20px',
        fontFamily: FONT_IMPACT,
        color: NEON_YELLOW_HEX,
        fontStyle: 'bold',
        resolution: TXT_RES,
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 4);

    const desc = scene.add
      .text(cx, cy - 36, '광고를 보면 이어서 달릴 수 있어요', {
        fontSize: '17px',
        fontFamily: FONT_KR,
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8,
        wordWrap: { width: FW - 48 },
        resolution: TXT_RES,
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 3);

    this.countdownText = scene.add
      .text(cx, cy + 8, String(COUNTDOWN_SEC), {
        fontSize: '40px',
        fontFamily: FONT_IMPACT,
        color: '#36f9f6',
        resolution: TXT_RES,
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 5);

    this.reviveBtn = scene.add
      .text(cx, cy + FH / 2 - 78, '광고 보고 이어뛰기', {
        fontSize: '22px',
        fontFamily: FONT_KR,
        color: NEON_YELLOW_HEX,
        resolution: TXT_RES,
      })
      .setOrigin(0.5)
      .setPadding(18, 12, 18, 12)
      .setInteractive({ useHandCursor: true });

    this.declineBtn = scene.add
      .text(cx, cy + FH / 2 - 24, '그만하기', {
        fontSize: '15px',
        fontFamily: FONT_KR,
        color: '#aaaaaa',
        resolution: TXT_RES,
      })
      .setOrigin(0.5, 1)
      .setPadding(12, 8, 12, 8)
      .setInteractive({ useHandCursor: true });

    this.reviveBtn.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        pointer.event?.stopPropagation?.();
        if (!this.active || !this.inputEnabled) return;
        this.finish('accepted');
      },
    );
    this.declineBtn.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        pointer.event?.stopPropagation?.();
        if (!this.active || !this.inputEnabled) return;
        this.finish('user');
      },
    );

    this.root = scene.add
      .container(0, 0, [
        veil,
        matte,
        rim,
        bg,
        title,
        desc,
        this.countdownText,
        this.reviveBtn,
        this.declineBtn,
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
    this.root.setAlpha(0);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      duration: 180,
      ease: 'Sine.easeOut',
    });

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
    this.scene.tweens.killTweensOf(this.root);
    this.active = false;
    this.inputEnabled = false;
    this.root.setVisible(false);
    this.root.setAlpha(1);
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
