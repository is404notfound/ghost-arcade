// 파이프라인 검증용 의도적 에러 — ?boom 진입 시 전역 핸들러 + 소스맵 + Seer Autofix를
// 확인하기 위한 실제 이슈를 만든다. (검증 후 제거 가능)
if (new URLSearchParams(window.location.search).has('boom')) {
  throw new Error('[ghost-arcade] 테스트 에러: ?boom 트리거됨 (Sentry 파이프라인 검증용)');
}
