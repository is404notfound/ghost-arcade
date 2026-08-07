#!/usr/bin/env bash
# 앱인토스 샌드박스용 로컬 Vite 서버.
# QR은 여기서 안 나옴 — 샌드박스 앱에 스킴을 직접 입력하는 플로우.
# 인앱 광고·가로 게임은 샌드박스 미지원 → 광고 검증은 ait deploy 후 콘솔 QR(토스앱).
# SDK 3.x: vite --host 로 LAN 바인딩. (구 granite.config web.host 는 제거됨)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "${IP}" ]]; then
  echo "LAN IP를 못 찾았습니다. Wi‑Fi 연결 후 다시 시도하세요." >&2
  exit 1
fi

echo "=== 샌드박스 로컬 서버 (QR 없음) ==="
echo "LAN IP: ${IP}"
echo "1) 샌드박스 앱 설치·로그인·앱(ghost-runner) 선택"
echo "2) iOS: 같은 Wi‑Fi + 로컬 네트워크 허용 후 서버 주소 ${IP} 저장"
echo "3) Android: adb reverse tcp:5173 tcp:5173"
echo "4) 스킴 입력: intoss://ghost-runner"
echo ""
echo "※ 인앱 광고는 샌드박스에서 불가능(공식). 광고 보려면:"
echo "   npm run build:ait && npm run ait:deploy"
echo "   → 콘솔 '테스트하기' QR → 토스앱 스캔"
echo "   (+ Supabase ads_revive_enabled=true)"
echo ""

exec npm run ait:dev
