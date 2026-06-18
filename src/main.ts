// 반드시 첫 import — 어떤 런타임 코드보다 먼저 Sentry.init이 실행되도록 한다.
import './instrument';
import './style.css';
import Phaser from 'phaser';
import * as Sentry from '@sentry/browser';
import { GameScene } from './render/GameScene';
import { DESIGN_W, DESIGN_H } from './render/viewport';
import { dailySeed } from './dailySeed';
import { initGameControls } from './controls';

// 파이프라인 검증용 의도적 에러 — ?boom 진입 시 전역 핸들러 + 소스맵 + Seer Autofix를
// 확인하기 위한 실제 이슈를 만든다. (검증 후 제거 가능)
if (new URLSearchParams(window.location.search).has('boom')) {
  throw new Error('[ghost-arcade] 테스트 에러: ?boom 트리거됨 (Sentry 파이프라인 검증용)');
}

// DEV 전용: ?seedghosts 파라미터 or console의 window.__seedGhosts()로 고스트 필드 시딩.
// import.meta.env.DEV = false인 프로덕션 빌드에서 이 블록은 dead-code로 제거된다.
if (import.meta.env.DEV) {
  void import('./devTools')
    .then(({ seedGhosts }) => {
      const seed = dailySeed();
      if (new URLSearchParams(window.location.search).has('seedghosts')) {
        seedGhosts(window.localStorage, seed);
        console.log('[dev] 고스트 시딩 완료 — 새로고침으로 15기 적용');
        // 쿼리 파라미터 제거 후 리로드 → 다음 판에 15기 고스트가 바로 등장
        window.location.replace(window.location.pathname);
      }
      (window as unknown as Record<string, unknown>).__seedGhosts = () => {
        seedGhosts(window.localStorage, seed);
        console.log('[dev] 고스트 시딩 완료 — 새로고침으로 15기 적용');
      };
    })
    .catch((e: unknown) => Sentry.captureException(e));
}

initGameControls();

try {
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
} catch (e) {
  // WebGL/Canvas 컨텍스트 생성 실패 등 부트 크래시 — 치명적이라 보고 후 그대로 노출
  Sentry.captureException(e);
  throw e;
}
