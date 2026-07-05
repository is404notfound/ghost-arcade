// 반드시 첫 import — 어떤 런타임 코드보다 먼저 Sentry.init이 실행되도록 한다.
import './instrument';
import './style.css';
import Phaser from 'phaser';
import * as Sentry from '@sentry/browser';
import { GameScene } from './render/GameScene';
import { DESIGN_W, DESIGN_H } from './render/viewport';
import { RENDER_DPR } from './render/dpr';
import { dailySeed } from './dailySeed';
import { initGameControls } from './controls';
import { initAnalytics } from './analytics';
import { runTestError } from './testErrors';
import { maybeTriggerBug } from './experiment/bug-trigger';

// 검증용 의도적 에러 — Sentry/Seer 테스트. (검증 후 제거 가능)
//   ?error=<type>  하나만 (type/range/reference/syntax/uri/custom/promise/async/manual/generic)
//   ?error=all     10종 한 번에
//   ?boom          generic 별칭(기존 호환)
{
  const params = new URLSearchParams(window.location.search);
  if (params.has('boom')) {
    runTestError('generic');
  } else if (params.has('error')) {
    runTestError(params.get('error') ?? '');
  }
}

// 에이전트 비교 실험: ?bug=NN 파라미터가 있을 때만 해당 시나리오 실행
maybeTriggerBug();

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

initAnalytics();
initGameControls();

// Google Fonts 로드 완료 후 게임 시작 — 폰트 미로드 상태로 첫 텍스트가 렌더되면
// fallback 폰트로 캐싱되어 게임 내내 깨진 폰트로 보인다.
// fonts.ready는 이미 로드된 환경에서 즉시 resolve하므로 딜레이 없음.
void document.fonts.ready.then(() => {

try {
  new Phaser.Game({
    type: Phaser.AUTO,
    // 레티나(DPR≥2) 대응: 백킹 캔버스를 물리 픽셀 크기로 확보하고, GameScene의
    // 메인 카메라 zoom = RENDER_DPR로 논리 좌표(1040×480)를 유지한다 (render/dpr.ts).
    // 과거 scale.zoom 방식은 CSS 크기만 바꿔 실제로는 저해상도 업스케일이었음.
    width: DESIGN_W * RENDER_DPR,
    height: DESIGN_H * RENDER_DPR,
    backgroundColor: '#1a1a2e',
    scene: GameScene,
    // 렌더러 품질 설정.
    // antialias: true → WebGL 텍스처를 NEAREST 대신 LINEAR 필터링.
    //   없으면 스프라이트 에지가 도트처럼 자글자글해 보임.
    antialias: true,
    roundPixels: false,
    // Phaser 물리는 안 쓴다 — 충돌/중력은 전부 src/sim/ 안 (D1)
    scale: {
      mode: Phaser.Scale.FIT, // CSS 표시는 FIT이 화면에 맞춤 (레터박스)
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
} catch (e) {
  // WebGL/Canvas 컨텍스트 생성 실패 등 부트 크래시 — 치명적이라 보고 후 그대로 노출
  Sentry.captureException(e);
  throw e;
}

}); // document.fonts.ready
