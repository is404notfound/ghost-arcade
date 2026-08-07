// 전면광고 5회 주기 게이트 (순수 함수 + localStorage). 결정 E / L / G.

export const INTERSTITIAL_STORAGE_KEY = 'ga:ads:interstitial';

export interface InterstitialState {
  /** UTC YYYY-MM-DD */
  date: string;
  count: number;
}

export interface ShouldShowInterstitialInput {
  enabled: boolean;
  /** 직전 판에서 이어뛰기(보상형) 광고를 시청 완료했는지 */
  skippedBecauseReviveAd: boolean;
  period: number;
  now?: Date;
  stored?: InterstitialState | null;
}

export interface ShouldShowInterstitialResult {
  show: boolean;
  next: InterstitialState;
}

/** 원격 period 정규화 — 0/NaN이면 영구 미노출·매번 노출 방지 (결정 L). */
export function normalizeInterstitialPeriod(v: number): number {
  if (!Number.isFinite(v)) return 5;
  return Math.min(50, Math.max(1, Math.round(v)));
}

export function utcDateKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function readInterstitialState(store: Storage | null): InterstitialState | null {
  if (!store) return null;
  try {
    const raw = store.getItem(INTERSTITIAL_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<InterstitialState>;
    if (typeof obj.date !== 'string' || typeof obj.count !== 'number' || !Number.isFinite(obj.count)) {
      return null;
    }
    return { date: obj.date, count: obj.count };
  } catch {
    return null;
  }
}

export function writeInterstitialState(store: Storage | null, state: InterstitialState): void {
  if (!store) return;
  try {
    store.setItem(INTERSTITIAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* QuotaExceeded 등 — 게이트만 리셋될 뿐 게임 계속 */
  }
}

/**
 * 재시도마다 호출. count를 +1 한 뒤 period 배수일 때 show.
 * 이어뛰기 직후·플래그 off면 show=false 이되 count는 올린다(결정 E).
 */
export function shouldShowInterstitial(
  input: ShouldShowInterstitialInput,
): ShouldShowInterstitialResult {
  const now = input.now ?? new Date();
  const today = utcDateKey(now);
  const period = normalizeInterstitialPeriod(input.period);
  const prev = input.stored;
  const baseCount = prev && prev.date === today ? prev.count : 0;
  const count = baseCount + 1;
  const next: InterstitialState = { date: today, count };

  if (!input.enabled || input.skippedBecauseReviveAd) {
    return { show: false, next };
  }
  return { show: count % period === 0, next };
}
