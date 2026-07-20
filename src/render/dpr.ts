// 렌더 백킹 해상도 배율 (레티나 대응) — main.ts(게임 크기)와 GameScene(카메라 줌)이
// 반드시 같은 값을 써야 해서 단일 모듈로 분리한다.
//
// 배경: Phaser Scale(FIT/ENVELOP)의 zoom 설정은 CSS 표시 크기만 바꾸고 캔버스 백킹
// 픽셀은 그대로다("the canvas pixel size remains untouched" — ScaleManager 소스).
// 즉 zoom: DPR 방식은 효과가 없었고, 게임 전체가 1040×480으로 렌더된 뒤
// 폰에서 2~3배 확대되어 텍스트가 뭉개졌다.
//
// 해법(표준 레시피): 게임(백킹) 크기 = 논리 크기 × DPR, 메인 카메라 zoom = DPR.
// 좌표계는 논리(1040×480) 그대로 유지되고, 렌더만 물리 해상도로 이뤄진다.
//
// 상한 2 (3→2): DPR 3 기기에서 백킹 픽셀이 논리 대비 9배가 되어 전반적인 프레임
// 드랍이 보고됨. 상한 2면 4배 수준 — 텍스트 선명도는 충분히 유지하면서 GPU
// 필레이트를 절반 이하로 줄인다. (DPR 3 폰에서는 1.5배 업스케일이 남지만
// LINEAR 필터로 완만하게 보간됨.)
export const RENDER_DPR =
  typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
