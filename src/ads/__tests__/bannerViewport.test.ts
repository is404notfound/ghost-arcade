import { describe, expect, it } from 'vitest';
import {
  BANNER_HEIGHT_PX,
  DEFAULT_BANNER_MIN_VIEWPORT_H,
  shouldMountBannerForViewport,
} from '../banner';

describe('shouldMountBannerForViewport', () => {
  it('폰 가로 높이(390)에서는 기본 임계값으로 미부착', () => {
    expect(shouldMountBannerForViewport(DEFAULT_BANNER_MIN_VIEWPORT_H, 390)).toBe(
      false,
    );
    expect(shouldMountBannerForViewport(DEFAULT_BANNER_MIN_VIEWPORT_H, 430)).toBe(
      false,
    );
  });

  it('태블릿급 높이(500+)에서는 부착', () => {
    expect(shouldMountBannerForViewport(DEFAULT_BANNER_MIN_VIEWPORT_H, 500)).toBe(
      true,
    );
    expect(shouldMountBannerForViewport(DEFAULT_BANNER_MIN_VIEWPORT_H, 768)).toBe(
      true,
    );
  });

  it('원격 임계값을 낮추면 폰에도 부착 가능', () => {
    expect(shouldMountBannerForViewport(380, 390)).toBe(true);
  });

  it('임계값은 배너 높이+200 미만으로 내려가지 않음', () => {
    const floor = BANNER_HEIGHT_PX + 200;
    expect(shouldMountBannerForViewport(100, floor - 1)).toBe(false);
    expect(shouldMountBannerForViewport(100, floor)).toBe(true);
  });
});
