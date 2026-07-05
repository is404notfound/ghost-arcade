// 렌더 백킹 해상도 배율 (레티나 대응) — main.ts(게임 크기)와 GameScene(카메라 줌)이
// 반드시 같은 값을 써야 해서 단일 모듈로 분리한다.
//
// 배경: Phaser Scale.FIT에서 zoom 설정은 CSS 표시 크기만 바꾸고 캔버스 백킹
// 픽셀은 그대로다("the canvas pixel size remains untouched" — ScaleManager 소스).
// 즉 zoom: DPR 방식은 효과가 없었고, 게임 전체가 1040×480으로 렌더된 뒤
// 폰에서 2~3배 확대되어 텍스트가 뭉개졌다.
//
// 해법(표준 레시피): 게임(백킹) 크기 = 논리 크기 × DPR, 메인 카메라 zoom = DPR.
// 좌표계는 논리(1040×480) 그대로 유지되고, 렌더만 물리 해상도로 이뤄진다.
//
// 상한 3: TXT_RES와 동일 — DPR 4+ 기기에서의 GPU 필레이트 폭주 방지.
export const RENDER_DPR =
  typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 3);
