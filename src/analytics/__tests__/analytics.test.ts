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
    setPersonProperties: vi.fn(),
  },
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();   // 모듈 인스턴스 초기화 → _enabled=false로 리셋
    vi.unstubAllEnvs();  // 환경변수 원상복구
    vi.unstubAllGlobals(); // location 등 stub한 전역 원상복구
    // clearAllMocks는 호출기록만 지우고 mockImplementation은 남긴다 — 이전 테스트가
    // posthog.init/capture를 throw하도록 설정한 경우 이후 테스트로 새어나가 _enabled가
    // 계속 false로 남는 버그가 있었다. resetAllMocks로 구현까지 초기화해 테스트 격리.
    vi.resetAllMocks();
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

  describe('track() — instant(sendBeacon) 옵션 (T8)', () => {
    it('options 없이 호출하면 기본 transport(2-인자 capture)로 호출한다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      const { initAnalytics, track } = await import('../index');

      initAnalytics();
      track('game_start', { seed: 1 });

      expect(ph.default.capture).toHaveBeenCalledWith('game_start', { seed: 1 });
    });

    it('{ instant: true }면 capture를 sendBeacon transport 옵션과 함께 호출한다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      const { initAnalytics, track } = await import('../index');

      initAnalytics();
      track('game_over', { distance: 150 }, { instant: true });

      expect(ph.default.capture).toHaveBeenCalledWith(
        'game_over',
        { distance: 150 },
        { transport: 'sendBeacon' },
      );
    });

    it('키 없으면 { instant: true }를 줘도 capture를 호출하지 않는다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', '');
      const ph = await import('posthog-js');
      const { initAnalytics, track } = await import('../index');

      initAnalytics();
      track('game_over', { distance: 150 }, { instant: true });

      expect(ph.default.capture).not.toHaveBeenCalled();
    });

    it('instant 경로에서 posthog.capture가 throw해도 에러를 전파하지 않는다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      vi.mocked(ph.default.capture).mockImplementation(() => {
        throw new Error('sendBeacon 실패');
      });
      const { initAnalytics, track } = await import('../index');

      initAnalytics();

      expect(() =>
        track('game_over', { distance: 150 }, { instant: true }),
      ).not.toThrow();
    });
  });

  describe('setPersonOnce() / setPerson() — person property ($set / $set_once, T8)', () => {
    it('키 없으면 setPersonOnce()가 setPersonProperties를 호출하지 않는다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', '');
      const ph = await import('posthog-js');
      const { initAnalytics, setPersonOnce } = await import('../index');

      initAnalytics();
      setPersonOnce({ first_played_at: '2026-07-13' });

      expect(ph.default.setPersonProperties).not.toHaveBeenCalled();
    });

    it('키 있으면 setPersonOnce()가 setPersonProperties(undefined, props)를 호출한다($set_once)', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      const { initAnalytics, setPersonOnce } = await import('../index');

      initAnalytics();
      setPersonOnce({ first_played_at: '2026-07-13' });

      expect(ph.default.setPersonProperties).toHaveBeenCalledWith(undefined, {
        first_played_at: '2026-07-13',
      });
    });

    it('setPersonOnce()에서 posthog.setPersonProperties가 throw해도 에러를 전파하지 않는다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      vi.mocked(ph.default.setPersonProperties).mockImplementation(() => {
        throw new Error('네트워크 차단');
      });
      const { initAnalytics, setPersonOnce } = await import('../index');

      initAnalytics();

      expect(() =>
        setPersonOnce({ first_played_at: '2026-07-13' }),
      ).not.toThrow();
    });

    it('키 없으면 setPerson()이 setPersonProperties를 호출하지 않는다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', '');
      const ph = await import('posthog-js');
      const { initAnalytics, setPerson } = await import('../index');

      initAnalytics();
      setPerson({ lifetime_runs: 3 });

      expect(ph.default.setPersonProperties).not.toHaveBeenCalled();
    });

    it('키 있으면 setPerson()이 setPersonProperties(props)를 호출한다($set)', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      const { initAnalytics, setPerson } = await import('../index');

      initAnalytics();
      setPerson({ lifetime_runs: 3, lifetime_max_distance: 999, platform: 'vercel' });

      expect(ph.default.setPersonProperties).toHaveBeenCalledWith({
        lifetime_runs: 3,
        lifetime_max_distance: 999,
        platform: 'vercel',
      });
    });

    it('setPerson()에서 posthog.setPersonProperties가 throw해도 에러를 전파하지 않는다', async () => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
      const ph = await import('posthog-js');
      vi.mocked(ph.default.setPersonProperties).mockImplementation(() => {
        throw new Error('네트워크 차단');
      });
      const { initAnalytics, setPerson } = await import('../index');

      initAnalytics();

      expect(() => setPerson({ lifetime_runs: 3 })).not.toThrow();
    });
  });

  describe('detectPlatform() — 플랫폼 판별 (T8)', () => {
    it('URL에 toss 쿼리 파라미터가 있으면 "toss"를 반환한다', async () => {
      vi.stubGlobal('location', { search: '?toss=1' } as unknown as Location);
      const { detectPlatform } = await import('../index');

      expect(detectPlatform()).toBe('toss');
    });

    it('toss 시그널이 없으면 기본값 "vercel"을 반환한다', async () => {
      vi.stubGlobal('location', { search: '' } as unknown as Location);
      const { detectPlatform } = await import('../index');

      expect(detectPlatform()).toBe('vercel');
    });

    it('location 자체가 없어도(node 환경) throw하지 않고 "vercel"을 반환한다', async () => {
      const { detectPlatform } = await import('../index');

      expect(() => detectPlatform()).not.toThrow();
      expect(detectPlatform()).toBe('vercel');
    });
  });
});
