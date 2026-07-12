# 앱인토스(토스 미니앱) 출시 계획 — Ghost Arcade

작성일: 2026-07-12  
대상: Ghost Battle Arcade (Phaser + Vite 웹 게임)  
근거: [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/) 공식 문서 (온보딩·배포·FAQ·WebView 튜토리얼)

> 정책·콘솔 UI는 수시로 바뀝니다. 실행 직전에 개발자센터 최신 가이드를 다시 확인하세요.

---

## 1. 한줄 요약

Ghost Arcade는 **이미 Vite 웹으로 동작**하므로, 앱인토스에는 **WebView SDK(`@apps-in-toss/web-framework`)로 래핑**하는 경로가 가장 맞습니다.  
게임 카테고리로 출시하려면 **게임 등급분류(심의)** + **출시 검수(영업일 3~5일)** 가 필수이고, 공식 FAQ 기준 **게임 서비스는 대략 2~4주**를 잡습니다.

---

## 2. 왜 WebView 경로인가

| 옵션 | 적합도 | 이유 |
|------|--------|------|
| **WebView SDK** | ★ 권장 | 기존 Phaser/Vite 코드를 거의 유지. `ait init` + `granite.config.ts`로 번들. |
| React Native SDK | 비권장 | 게임을 RN으로 재작성해야 함. |
| Unity / Cocos | 비해당 | 엔진이 Phaser가 아님. |

공식: [기존 웹 프로젝트에 SDK 연동하기](https://developers-apps-in-toss.toss.im/tutorials/webview.html)

설정 시 게임 내비게이션을 쓰려면:

```ts
webViewProps: { type: 'game' }
```

---

## 3. 전체 프로세스 (공식 흐름)

```
콘솔 가입 → 워크스페이스 → (선택) 사업자 등록 → 앱 등록
    → WebView SDK 연동·개발 → 샌드박스/토스앱 테스트
    → 게임 등급 심의 서류 준비 → 검토 요청 → 승인 → 출시하기
```

참고: [서비스 오픈 프로세스](https://developers-apps-in-toss.toss.im/intro/onboarding-process.html), [미니앱 출시](https://developers-apps-in-toss.toss.im/development/deploy.html)

### 단계별 소요 (공식 FAQ 기준)

| 단계 | 소요 | 비고 |
|------|------|------|
| 콘솔·앱 등록 검수 | 영업일 1~2일 | 로고·이름·카테고리·고객센터 등 |
| 사업자 등록 검수 | 영업일 1~2일 | **출시 자체는 사업자 없어도 가능** |
| 개발·연동·QA | 팀 일정 | 게임 FAQ: 전체 2~4주 가이드 |
| 출시 검수 | 영업일 3~5일 | 주말·공휴일 미진행 |
| 승인 후 배포 | 즉시 | 콘솔 「출시하기」 |

---

## 4. 게이트·필수 조건 (Ghost Arcade 관점)

### 4.1 게임 등급분류 (블로커)

게임 미니앱은 **등급 심의 없이 런칭 불가**합니다. ([온보딩](https://developers-apps-in-toss.toss.im/intro/onboarding-process.html))

둘 중 하나:

1. **게임물관리위원회** 심의 → 등급분류증명서 첨부  
2. **자체등급분류사업자** 경로 — 앱스토어 / 플레이스토어 / 원스토어 / Microsoft Store에 올린 뒤 **스토어 링크** 첨부

**계획 함의:** 스토어에 이미(또는 곧) 올리는 빌드가 있으면 2번이 빠를 수 있음. 토스만 단독이면 1번(게관위) 일정을 별도 트랙으로 잡아야 함.

### 4.2 사업자 등록 (선택 → 수익화 시 필수)

- 사업자 **없이** 미니앱 출시 가능.  
- 다만 **인앱 광고·인앱결제·토스페이·토스 로그인·비즈월렛·프로모션** 등은 사업자 + 약관 동의 필요.  
- 부가가치세 **면세 사업자는** 앱인토스 사업자 등록 불가.  
- 업종과 서비스 업종이 일치해야 함.

참고: [사업자 등록하기](https://developers-apps-in-toss.toss.im/prepare/register-business.html)

**Ghost Arcade MVP 제안:** 1차는 사업자 없이 **무료 플레이 + 기존 Supabase 랭킹**으로 출시 가능 여부 확인 → 수익화는 2차.

### 4.3 SDK·번들

- **SDK 2.x 필수** (2026-03-23 이후 1.x 번들 업로드 불가).  
- 산출물 `.ait` 번들, **압축 해제 기준 100MB 이하**.  
- 대용량 에셋은 번들과 분리해 **CDN/외부 스토리지 + 지연 로딩** 권장.  
- 검토 요청 전 **샌드박스(또는 토스앱 QR) 테스트 1회 이상** 필수.

### 4.4 가로(랜드스케이프) 게임

샌드박스 FAQ상 **「가로 버전 게임」테스트 불가** 항목이 있습니다.  
Ghost Arcade는 **1040×480 가로**이므로:

- 샌드박스만으로 QA가 불완전할 수 있음  
- **토스앱 QR 실기기 테스트**를 검수 전 필수 게이트로 둘 것  
- 콘솔/채널톡에 가로 게임 검수·노출 정책 재확인 권장

---

## 5. Ghost Arcade 작업 계획 (실행 체크리스트)

### Phase A — 조사·계정 (1~3일)

- [ ] [앱인토스 콘솔](https://developers-apps-in-toss.toss.im/) 회원가입·워크스페이스 생성  
- [ ] 앱 정보 초안: `appName`, 표시 이름, 아이콘, 카테고리(게임), 고객문의 이메일, 검색 키워드  
- [ ] 게임 등급 경로 결정 (게관위 vs 스토어 링크)  
- [ ] 수익화 여부 결정 → 사업자 등록 여부  
- [ ] 게임/비게임 [검수 체크리스트](https://developers-apps-in-toss.toss.im/intro/onboarding-process.html) 인쇄·갭 분석  

### Phase B — 기술 연동 (3~7일)

- [ ] `npm install @apps-in-toss/web-framework` + `npx ait init`  
- [ ] `granite.config.ts`  
  - `appName` / `brand` = 콘솔과 동일  
  - `web.commands`: 기존 `vite` / `vite build`  
  - `webViewProps.type: 'game'`  
  - `outdir` = 현재 Vite `dist`와 정합  
- [ ] CORS / Origin:  
  - 라이브 `https://*.apps.tossmini.com`  
  - QR 테스트 `https://*.private-apps.tossmini.com`  
  - Supabase·Sentry·폰트 CDN 허용 목록 점검  
- [ ] 번들 용량: `dist` + 에셋 unzip ≤ 100MB, 초과 시 CDN 분리  
- [ ] 부트 로딩 UX 유지 (저사양 WebView에서 10초+ 가능)  
- [ ] 쿠키 의존 제거 확인 (iOS 서드파티 쿠키 차단 → 토큰/localStorage 유지)  

### Phase C — QA (3~5일)

- [ ] 샌드박스 앱 설치 (`intoss://{appName}`)  
- [ ] **실기기 토스앱 QR**로 가로·오디오·터치·랭킹·일시정지 검증  
- [ ] 네트워크 실패 시 localStorage 폴백  
- [ ] 메모리/프레임 (저사양 안드로이드)  
- [ ] 허용 로깅: Sentry 등 공식 허용 도구만 사용  

### Phase D — 심의·검수·출시 (1~2주, 병렬 가능)

- [ ] 등급 서류/스토어 링크 콘솔 등록  
- [ ] 번들 업로드 → 검토 요청 (영업일 3~5일)  
- [ ] 4단계 검수: 운영 / 기능 / 디자인 / 보안  
- [ ] 승인 메일 → 「출시하기」  
- [ ] 출시 직후: 크래시·API·신고 내역 모니터링  

### Phase E — 출시 후 (지속)

- [ ] 버전 업데이트 = 새 `.ait` → 재검수 → 출시  
- [ ] 롤백 절차 숙지  
- [ ] 수익화 시 사업자·약관·결제 연동 별도 스프린트  

---

## 6. Ghost Arcade 리스크·대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 게임 등급 지연 | 출시 블로커 | 심의 트랙을 개발과 **병렬** 시작 |
| 가로 모드 샌드박스 미지원 | QA 공백 | 토스앱 QR·실기기 필수 |
| 번들 100MB 초과 | 업로드 불가 | 에셋 CDN + lazy load (공식 권장) |
| Supabase CORS | 랭킹/고스트 실패 | tossmini Origin 화이트리스트 |
| WebView 성능 | 로딩 10초+ | 부트 로딩 UI + 에셋 경량화 |
| 수익화 없이 사업자 없음 | 로그인·결제 불가 | MVP는 무료·익명 ID 유지 |

---

## 7. 권장 일정 (초안)

가정: 사업자 없이 무료 출시, 등급은 스토어 링크 또는 게관위 병행.

| 주차 | 내용 |
|------|------|
| W0 | 콘솔·앱 등록, 등급 경로 확정, 체크리스트 갭 |
| W1 | WebView SDK 연동, CORS·용량, 샌드박스 스모크 |
| W2 | 실기기 QA, 검수 체크리스트 수정, 번들 업로드·검토 요청 |
| W3 | 검수 대응·승인·출시, 모니터링 |

공식 FAQ: 게임 **약 2~4주** — 심의 서류가 이미 있으면 하한, 없으면 상한+.

---

## 8. 바로 쓸 명령·설정 스케치

```sh
npm install @apps-in-toss/web-framework
npx ait init
# 이후 granite.config.ts 수정 → 샌드박스에서 intoss://{appName}
```

```ts
// granite.config.ts (스케치 — 콘솔 값으로 채울 것)
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'ghost-arcade', // 콘솔 appName과 동일
  brand: {
    displayName: 'Ghost Arcade',
    primaryColor: '#36f9f6',
    icon: '', // 콘솔 업로드 이미지 URL
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host',
      build: 'tsc -b && vite build', // 실제 스크립트에 맞게
    },
  },
  permissions: [],
  outdir: 'dist',
  webViewProps: { type: 'game' },
});
```

빌드·업로드는 콘솔의 `.ait` 산출 가이드를 따릅니다 (`ait build` 등 — SDK 버전 문서 확인).

---

## 9. 참고 링크

| 문서 | URL |
|------|-----|
| 서비스 오픈 프로세스 | https://developers-apps-in-toss.toss.im/intro/onboarding-process.html |
| 미니앱 출시 | https://developers-apps-in-toss.toss.im/development/deploy.html |
| WebView SDK 연동 | https://developers-apps-in-toss.toss.im/tutorials/webview.html |
| 샌드박스 | https://developers-apps-in-toss.toss.im/development/test/sandbox.html |
| 사업자 등록 | https://developers-apps-in-toss.toss.im/prepare/register-business.html |
| FAQ | https://developers-apps-in-toss.toss.im/faq.html |
| Config (`webViewProps`) | https://developers-apps-in-toss.toss.im/bedrock/reference/framework/UI/Config.html |

---

## 10. 다음 액션 (우선순위)

1. **등급 경로 결정** (게관위 vs 스토어) — 일정 상 최우선 블로커  
2. **콘솔 앱 등록** + 아이콘/메타  
3. **WebView SDK spike** (반나절): `ait init` → 샌드박스에서 인트로까지  
4. **용량·CORS 측정** 후 Phase B 본작업  
5. 수익화 필요 시에만 사업자 등록
