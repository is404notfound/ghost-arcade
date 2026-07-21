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
import { initAnalytics, identifyUser } from './analytics';
import { getUserId } from './identity';
import { initHeartbeat } from './heartbeat';
import { loadRemoteConfig } from './remoteConfig';
import { runTestError } from './testErrors';
import { maybeTriggerBug } from './experiment/bug-trigger';
import { setBootLoadingStatus } from './bootLoading';
import { lockLandscapeIfPossible } from './aitHost';
import { initSafeArea } from './safeArea';

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
// PostHog distinct_id를 우리 영속 UUID로 고정 — Supabase·토스와 같은 키로 조인/리텐션 측정.
// initAnalytics 직후여야 이후 모든 capture가 이 신원으로 귀속된다.
identifyUser(getUserId(window.localStorage));
// 비정상 종료 탐지 — initAnalytics 직후여야 직전 세션의 abnormal_exit을 놓치지 않는다
initHeartbeat();
// 원격 킬스위치 — 비차단 로드, 실패 시 코드 기본값 (플레이북 §0)
void loadRemoteConfig();
initGameControls();

// Google Fonts + 물마루가 실제로 로드된 뒤에만 Phaser 시작.
// fonts.ready만으로는 @font-face(물마루)처럼 "아직 DOM에서 안 쓴" 폰트를
// 안 기다릴 수 있고, Phaser Text는 생성 순간 캔버스에 구워버려 fallback이 고정된다.
// 부트 로딩 오버레이(index.html)는 GameScene.create 완료 시 dismissBootLoading().
void (async () => {
  // 앱인토스: 폰트보다 먼저 가로 잠금 — 첫 레이아웃이 세로로 잡히면 FIT 레터박스가 꼬임.
  setBootLoadingStatus('화면 준비 중…');
  await lockLandscapeIfPossible();
  // landscape 확정 뒤 Safe Area 구독 — CSS --safe-* + Phaser HUD 패드에 반영
  await initSafeArea();

  try {
    setBootLoadingStatus('폰트 준비 중…');
    // 한글 샘플을 넘겨 서브셋 폰트(Black Han Sans)가 실제 음절을 받도록 함.
    // 인자 없이 load하면 라틴만 받아 '어' 같은 글자가 시스템 폰트로 떨어질 수 있음.
    const krSample = "가나다라마바사아자차카타파하이어하기제침고스트계속";
    await Promise.all([
      document.fonts.load("600 16px Fredoka"),
      document.fonts.load("400 16px Bangers"),
      document.fonts.load("400 16px Mulmaru", krSample),
      document.fonts.load("400 16px 'Black Han Sans'", krSample),
    ]);
    await document.fonts.ready;
  } catch (e) {
    // 폰트 로드 실패해도 게임은 띄운다 — fallback으로라도 플레이 가능해야 함
    Sentry.captureException(e);
  }

try {
  setBootLoadingStatus('게임 엔진 시작…');
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
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
      // FIT: 논리 해상도 전체를 보여 Today's Rank·HP바·랭킹이 잘리지 않게 함.
      // ENVELOP(cover)는 상·하를 잘라 인게임 HUD가 사라졌음.
      // 남는 여백은 #game-root 하늘 톤 배경으로 채워 검은 레터박스를 피함.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
  setBootLoadingStatus('에셋 불러오는 중…');
} catch (e) {
  // WebGL/Canvas 컨텍스트 생성 실패 등 부트 크래시 — 치명적이라 보고 후 그대로 노출
  Sentry.captureException(e);
  setBootLoadingStatus('시작에 실패했습니다. 새로고침 해 주세요.');
  throw e;
}

})();
