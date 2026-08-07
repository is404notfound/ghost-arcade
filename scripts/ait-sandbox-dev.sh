#!/usr/bin/env bash
# 앱인토스 샌드박스용 개발 서버.
# SDK 3.x: vite --host 로 LAN 바인딩. (구 granite.config web.host 는 제거됨)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "${IP}" ]]; then
  echo "LAN IP를 못 찾았습니다. Wi‑Fi 연결 후 다시 시도하세요." >&2
  exit 1
fi

echo "LAN IP: ${IP}"
echo "실기기에서 http://${IP}:5173 으로 접속 가능한지 확인하세요 (방화벽/동일 Wi-Fi)."
echo "스킴: intoss://ghost-runner"
echo "Android USB: adb reverse tcp:5173 tcp:5173"
echo ""

exec npm run ait:dev
