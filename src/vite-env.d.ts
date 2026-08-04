/// <reference types="vite/client" />

interface ImportMetaEnv {
  // VITE_* 클라이언트 환경변수는 import.meta.env로 노출된다.
  // 구체 키는 필요 시 여기에 추가.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
