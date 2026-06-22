// 계측 격리 테스트 (T6 핵심 요건: "계측 실패 ≠ 게임 크래시")
//
// 테스트 전략:
//   vi.resetModules() — _enabled 모듈 상태를 테스트마다 리셋
//   vi.stubEnv()      — import.meta.env.VITE_POSTHOG_KEY 제어
//   vi.mock()         — posthog-js 실제 네트워크 호출 차단
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
  },
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();   // 모듈 인스턴스 초기화 → _enabled=false로 리셋
    vi.unstubAllEnvs();  // 환경변수 원상복구
    vi.clearAllMocks();  // 호출 기록 초기화
  });

  it('키 없으면 initAnalytics() + track()이 posthog.capture를 호출하지 않는다', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const ph = await import('posthog-js');
    const { initAnalytics, track } = await import('../index');

    initAnalytics();
    track('game_start', { seed: 1, ghost_count: 0 });

    expect(ph.default.init).not.toHaveBeenCalled();
    expect(ph.default.capture).not.toHaveBeenCalled();
  });

  it('키 있으면 track()이 posthog.init + capture를 올바른 인자로 호출한다', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    const ph = await import('posthog-js');
    const { initAnalytics, track } = await import('../index');

    initAnalytics();
    track('game_start', { seed: 42, ghost_count: 3 });

    expect(ph.default.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({ api_host: expect.any(String) }),
    );
    expect(ph.default.capture).toHaveBeenCalledWith('game_start', {
      seed: 42,
      ghost_count: 3,
    });
  });

  it('posthog.capture가 throw해도 track()이 에러를 전파하지 않는다', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    const ph = await import('posthog-js');
    vi.mocked(ph.default.capture).mockImplementation(() => {
      throw new Error('네트워크 차단');
    });
    const { initAnalytics, track } = await import('../index');

    initAnalytics();

    expect(() => track('game_over', { distance: 150 })).not.toThrow();
  });

  it('posthog.init이 throw해도 initAnalytics()가 에러를 전파하지 않고 이후 track은 no-op', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    const ph = await import('posthog-js');
    vi.mocked(ph.default.init).mockImplementation(() => {
      throw new Error('초기화 실패');
    });
    const { initAnalytics, track } = await import('../index');

    expect(() => initAnalytics()).not.toThrow();

    // _enabled=false 상태이므로 capture 미호출
    track('game_start', {});
    expect(ph.default.capture).not.toHaveBeenCalled();
  });

  it('initAnalytics() 없이 track()을 호출해도 에러가 없다', async () => {
    const { track } = await import('../index');
    expect(() => track('orphan_event')).not.toThrow();
  });

  it('VITE_POSTHOG_HOST 미설정 시 us.i.posthog.com을 기본값으로 쓴다', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    // VITE_POSTHOG_HOST는 stubEnv하지 않음 → undefined
    const ph = await import('posthog-js');
    const { initAnalytics } = await import('../index');

    initAnalytics();

    expect(ph.default.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({ api_host: 'https://us.i.posthog.com' }),
    );
  });
});
