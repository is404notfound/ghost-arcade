/** DOM 부트 로딩 오버레이 — index.html에 정적 삽입, Phaser create 완료 시 제거.
 *  JS 번들·폰트·에셋 로드 동안 빈 화면/컨트롤만 보이는 UX를 막기 위함. */

const ROOT_ID = "boot-loading";
const STATUS_ID = "boot-loading-status";

export function setBootLoadingStatus(message: string): void {
  const el = document.getElementById(STATUS_ID);
  if (el) el.textContent = message;
}

/** 페이드아웃 후 DOM 제거. 중복 호출 안전. */
export function dismissBootLoading(): void {
  const root = document.getElementById(ROOT_ID);
  if (!root || root.dataset.dismissed === "1") return;
  root.dataset.dismissed = "1";
  root.setAttribute("aria-busy", "false");
  root.classList.add("boot-loading--hide");
  window.setTimeout(() => root.remove(), 280);
}
