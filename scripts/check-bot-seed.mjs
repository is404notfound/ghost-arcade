// 봇 시드 커버리지 감시 — GitHub Actions에서 매일 실행 (플레이북 §7 자동 알림).
//
// "빈 시드 = 신규 유저 경쟁 필드 증발" (TODOS 봇 커버리지 정책). 봇 시딩은 클라이언트
// 주도(그날 첫 플레이어가 생성)라 이른 아침의 빈 시드는 정상이다 — 그래서 트래픽이
// 쌓인 시각(KST 22시)에 "오늘 시드에 기록이 하나라도 있는가"를 확인한다.
//
//   총 기록 0  → 실패(exit 1) = 시딩/백엔드 고장 또는 트래픽 0 — 어느 쪽이든 알림 가치
//   봇 기록 0  → 경고 로그만 (유저 기록이 채웠다면 정상 동작)
//
// 필요 env: SUPABASE_URL, SUPABASE_ANON_KEY (repo secrets)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── 데일리 시드 (src/dailySeed.ts와 동일 산식 — UTC 날짜 기반) ──
function dailySeed(now = new Date()) {
  const ymd =
    now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  let h = Math.imul(ymd, 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// SIM_VERSION은 소스에서 직접 읽어 드리프트 방지
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inputLogSrc = readFileSync(join(root, 'src/sim/inputLog.ts'), 'utf8');
const simVersion = inputLogSrc.match(/SIM_VERSION = '([^']+)'/)?.[1];
if (!simVersion) throw new Error('SIM_VERSION 파싱 실패 — src/sim/inputLog.ts 확인');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY env 필요');

async function countRows(filter) {
  const res = await fetch(
    `${url}/rest/v1/ghost_runs?select=id&seed=eq.${dailySeed()}&sim_version=eq.${simVersion}${filter}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    },
  );
  if (!res.ok && res.status !== 206 && res.status !== 416) {
    throw new Error(`Supabase 응답 ${res.status}: ${await res.text()}`);
  }
  // content-range: "0-0/N" — N이 총 개수
  const range = res.headers.get('content-range') ?? '/0';
  return parseInt(range.split('/')[1], 10) || 0;
}

const seed = dailySeed();
const total = await countRows('');
const bots = await countRows('&is_bot=eq.true');
console.log(
  `seed=${seed} sim=${simVersion} → 총 ${total}건 (봇 ${bots}, 유저 ${total - bots})`,
);

if (total === 0) {
  console.error(
    '❌ 오늘 시드에 기록이 0건 — 봇 시딩/백엔드 고장 또는 트래픽 0. 확인 필요.',
  );
  process.exit(1);
}
if (bots === 0) {
  console.warn('⚠️ 봇 기록 0건 — 유저 기록만 존재. 콜드스타트 경로 점검 권장.');
}
console.log('✅ 경쟁 필드 정상');
