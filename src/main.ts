import Phaser from 'phaser';
import { GameScene } from './render/GameScene';
import { DESIGN_W, DESIGN_H } from './render/viewport';

new Phaser.Game({
  type: Phaser.AUTO,
  width: DESIGN_W,
  height: DESIGN_H,
  backgroundColor: '#1a1a2e',
  scene: GameScene,
  // Phaser 물리는 안 쓴다 — 충돌/중력은 전부 src/sim/ 안 (D1)
  scale: {
    mode: Phaser.Scale.FIT, // 논리 해상도 고정 → viewport 매핑이 어느 화면에서나 유효
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
