#!/usr/bin/env bash
# 앱인토스 샌드박스용 개발 서버.
# granite.config.ts 의 web.host 를 LAN IP와 맞춘 뒤 쓰세요.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "${IP}" ]]; then
  echo "LAN IP를 못 찾았습니다. Wi‑Fi 연결 후 다시 시도하세요." >&2
  exit 1
fi

echo "LAN IP: ${IP}"
echo "granite.config.ts → web.host 가 '${IP}' 인지 확인하세요 (localhost면 실기기 연결 실패)."
echo "스킴: intoss://ghost-runner"
echo "Android USB: adb reverse tcp:5173 tcp:5173"
echo ""

exec npm run ait:dev
