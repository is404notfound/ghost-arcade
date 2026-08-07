# 인앱 광고 도입 계획 — 이어뛰기(보상형) + 전면광고

작성: 2026-08-07 · 상태: `/plan-eng-review` 통과 (결정 13건, 외부 검증 1회 반영)

---

## 0. 한 줄 요약

앱인토스에서만 광고를 붙인다. 죽으면 **광고를 보고 그 자리에서 이어뛰기**(보상형).
전면광고는 **코드를 다 넣되 원격 플래그로 꺼둔 채** 출시하고 iOS fps 정리 후 켠다.
웹 배포판에는 광고가 뜨지 않는다. `SIM_VERSION`**은 올리지 않는다 — 리더보드 리셋 없음.**

---

## 1. 배경과 목표

`ghost-arcade`(고스트대시)는 토스 미니앱과 웹(Vercel)에 동시 배포된다.

`launch-log.md` 2026-08-07 엔트리가 수익화 착수를 확정했다:

> "Ghost Dash는 챌린지 이후 성장 목표보다 경험 수집 모드로 전환. 리텐션 기준을 기다릴 이유 없음."

같은 엔트리가 광고 종류별 시점을 나눴고 **이 계획은 그 구분을 따른다**:


| 광고          | 시점           | 이유(원문)                                 |
| ----------- | ------------ | -------------------------------------- |
| 부활 리워드 광고   | 지금 바로        | 선택형 — 유저 이탈 영향 낮음                      |
| 게임 오버 인터스티셜 | iOS fps 해결 후 | 강제 광고라 이탈 가속 가능. fps 버그가 있는 상태에선 복합 원인 |


부활 기능은 현재 없으므로 신규 개발이다.

---



## 2. 확정된 의사결정


| #       | 결정                                                                                | 근거                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**   | 부활 기록도 랭킹에 **그대로 인정**. 횟수 **무제한**.                                                | 광고는 누구에게나 열려 있어 공정성 문제로 보지 않는다. 랭킹에서 빼면 재화가 없는 이 게임에서 광고를 볼 유인이 0이 된다.                                                                       |
| **A-2** | `revive` 이벤트를 로그에 남기고, `revive_count`**를 서버 컬럼으로도 올린다**.                          | 로그(JSONB) 안에만 있으면 순수 랭킹을 SQL로 만들 때 행마다 수천 개 배열을 스캔해야 해 사실상 불가능. 컬럼이면 `WHERE revive_count = 0` 한 줄.                                           |
| **B**   | `SIM_VERSION`**을 올리지 않는다 (1.16.0 유지).**                                           | 올릴 기술적 이유가 없다 — `revive` 추가는 가법적·후방 안전이고 기존 로그의 재생 궤적이 1비트도 안 바뀐다. 올리면 이유 없는 리더보드 리셋이 `launch-log.md:58`의 "챌린지 창(8/1~26) 리셋 금지" 원칙 안에서 발생한다. |
| **C**   | 부활 시: **HP 풀 / 무적 3초 / 속도 리셋 / 눈앞 장애물 유지 / 콤보·피버 0**.                             | 부활은 "피격의 큰 버전"이라 규칙이 갈리면 유저가 둘 외워야 하고 코드 분기도 둘로 늘어난다.                                                                                        |
| **D**   | 이어뛰기 팝업 = **버튼 + 5초 카운트다운**, 등장 후 **0.4초 입력 무시**, 무반응이면 광고 없이 게임오버.               | 타이머는 전환율을 올리면서 거절자에겐 마찰 0. 버튼은 명시적 동의라 정책 리스크를 없앤다. 0.4초 유예는 연타 중 사망 시 오탭을 막는다.                                                              |
| **E**   | 전면광고 = **재시도 5회 주기**, `localStorage` 누적 + 일간 리셋, 직전 판에 이어뛰기 광고를 봤으면 건너뛰고 카운터만 올림. | "5판 이후 매번"이면 하루 20판 유저가 15번을 본다. 광고 두 개 연속 노출의 이탈 손실이 전면광고 1회 수익보다 크다.                                                                       |
| **E-2** | 전면광고는 `ads_interstitial_enabled` **기본값** `false`**로 출시**.                         | iOS 40fps 상태에서 같이 내면 이탈 원인이 fps인지 광고인지 가릴 수 없다. 광고는 킬스위치로 끄지만 fps는 재배포가 필요하다. 켤 때 재배포·재검수 불필요.                                               |
| **F**   | 웹 차단 = **빌드 플래그 + 런타임 이중 체크**.                                                    | 런타임 조건문만으론 한 줄 실수로 웹에 광고가 뜬다.                                                                                                                |
| **G**   | 게이트는 **두 재시도 경로 모두** 통과 (`startRun("death")`, `startRun("pause")`).               | 한쪽만 막으면 일시정지→다시하기로 전면광고를 영구 회피할 수 있고 주기 튜닝 데이터도 오염된다.                                                                                        |
| **H**   | 광고 preload는 **부트 완료 지점**에서. dismiss 직후 재-preload.                                 | 판의 22%가 19초 내에 끝나는데 AdMob 로드는 5~20초. 판 시작 시 로드하면 짧은 판·첫 판에서 팝업이 안 뜬다.                                                                        |
| **I**   | 계측은 **매 사망마다**, 서버 제출·로컬 저장은 **최종 사망에만**.                                         | 유실 방지(`instant: true` sendBeacon)와 중복 행 방지를 동시에 달성하는 유일한 조합.                                                                                 |
| **J**   | 로그 상한 **8,000 이벤트**. 초과 시 **로컬 저장만 스킵, 원격 제출은 진행**.                               | 병목은 서버가 아니라 `localStorage`(5MB ÷ `GHOST_TOP_N` 8). 랭킹 기록은 유저의 가장 중요한 생산물이다.                                                                  |
| **K**   | 거리 이상치 상한을 `CEILING × (revive_count + 1)` 로 확장.                                   | 무제한 부활이면 기존 상한(19,800m)이 달성 가능해져 헤비유저 기록이 조용히 폐기된다. 치트 방지는 유지.                                                                               |
| **L**   | 원격 주기 값은 **게이트에서 정규화** (`Math.max(1, Math.round(v))` + 상한 50).                    | `remoteConfig`는 타입만 검사한다. `0`이면 광고 영구 미노출, `0.5`면 재시도마다 노출.                                                                                  |
| **M**   | 광고 파사드에 **주입 가능한** `AdSdk` **인터페이스**.                                             | 실패·미준비·중도이탈 분기는 실기기 QR로 재현하기 가장 어렵다. SDK 3.x는 롤백 불가라 방패가 필요하다.                                                                               |




### 채택하지 않은 것 — 무반응 시 자동 재생

정책 위반이다. 앱인토스는 보상형 광고를 *"사용자가 직접 '광고 보기'를 선택하면 재생되는 광고"* 로
정의한다. 자발적 선택이 형식의 정의에 포함되어 있다. 제재는 *"한 번의 위반만으로도 즉시 30일
이용 제한이나 영구 이용 제한"* 이 가능하고 부당 수익은 환수된다.

실리적으로도 손해다. 보상형 단가는 시청 완료율에 좌우되는데, 누른 적 없는 광고가 뜬 유저는 즉시
닫는다. `userEarnedReward`가 안 와서 이어뛰기는 안 줘도 되지만 완료율이 떨어져 단가가 같이 내려간다.

### 알고 감수하는 리스크 — 무적 종료 시점 즉사

부활 무적이 끝나는 순간 장애물과 겹쳐 즉사할 확률이 계산상 **약 10%** 다.

```
SPAWN_X 1070 - PLAYER_X 187 = 883유닛,  부활 시 speed = SPEED_BASE 340
겹침 판정 |o.x - 187| < (PLAYER_W 30 + OBS_W 32)/2 = 31 → 창 62유닛 ÷ 360 ≈ 0.17초
부활 시 speedT = 0 → intervalMs = 1800
확률 ≈ 0.17 / 1.8 ≈ 9~10%
```

**그대로 출시한다** (결정 D5). 유저가 무적 깜빡임을 보고 미리 점프해 회피할 여지가 있어 실측이
계산보다 낮을 수 있고, `revive_used`의 `final_distance`로 사후 확인 가능하다.

주의: 이 문제는 무적을 늘려도 해결되지 않는다. 무적이 보장하는 건 "3초 동안 안전"이고 문제는
"3초가 끝나는 순간"이라, 무적 길이와 무관하게 종료 순간 겹침 확률은 같다. 속도 리셋도 완화하지
않는다(느릴수록 겹침 통과 시간이 길어져 확률이 상쇄된다). **고치려면** `sim` **변경이 필요하고,
그 시점엔** `SIM_VERSION`**을 올려야 해서 리더보드 리셋이 따라온다** — 이게 지금 감수하는 대가다.

---



## 3. 제약과 리스크



### R1. SDK 3.x는 롤백 불가 — 최대 리스크

광고 API(`loadFullScreenAd` / `showFullScreenAd`)는 `@apps-in-toss/web-framework` **3.x부터**
존재한다. 현재 2.10.5이고 2.10.8까지 확인했으나 광고 함수가 없다. 우회로가 없다.

> "SDK 3.x 이상이 적용된 앱 번들을 출시하면 SDK 2.x로 롤백할 수 없어요."

**완화**: 마이그레이션과 광고 기능을 별도 릴리스로 분리한다(Phase 1 / Phase 2~4).
광고 코드가 0인 3.x 번들을 먼저 QR로 검증하고, 통과한 뒤에 광고를 얹는다. 문제 발생 지점을
"마이그레이션 탓 / 광고 탓"으로 분리해 진단하기 위함이다.

### R2. CORS 허용 오리진 변경 — 2026-07-21 사고와 동종

3.x는 미니앱이 아래 오리진에서 뜬다.

- 실제: `https://ghost-runner.web.tossmini.com`
- QR 테스트: `https://ghost-runner.private-web.tossmini.com`

**Supabase와 PostHog 양쪽 허용 목록에 등록**해야 한다. 누락하면 리더보드·고스트·계측이 죽는다.
빌드는 성공하는데 런타임에 백엔드만 사라지는 형태라 `vite.config.ts`의 env-guard로도 안 잡힌다.

**추가 위험**: `remoteConfig`는 Supabase 읽기에 의존한다(`remoteConfig.ts:31-56`). R2가 터지면
**킬스위치도 같이 죽고, 기본값이** `true`**라 fail-open으로 광고가 켜진 상태로 남는다.**
→ 대응: `ads_revive_enabled` 기본값을 `false`로 두고 원격에서 `true`로 켠다(fail-closed).
Phase 3 출시 직후 원격 값 적용을 확인하는 절차를 D-0 체크리스트에 넣는다.

### R3. `webViewProps` → `webView` 축소로 게임 크롬이 회귀할 수 있다


| 항목      | 2.x (현재)                                          | 3.x                             |
| ------- | ------------------------------------------------- | ------------------------------- |
| 설정 파일   | `granite.config.ts`                               | `apps-in-toss.config.ts`        |
| 출력 디렉터리 | `outdir`                                          | `webBundleDir`                  |
| 웹뷰      | `webViewProps: { type: 'game', orientationLock }` | `webView: {}` — `type` **삭제**   |
| 브랜드     | `displayName`, `icon`, `primaryColor`             | `primaryColor`**만** (나머지 콘솔 관리) |
| 웹 커맨드   | config의 `web.commands`                            | `package.json` 스크립트             |


가로 잠금은 런타임 `setDeviceOrientation`이 실질 보증한다(`src/aitHost.ts:21`).
**게임 내비 크롬과 투명 내비바(**`navigationBar`**)는 QR 실기기로 직접 확인해야 한다.**

### R4. GRAC 내용수정신고 · 개인정보처리방침 — 미해결 선행조건

```
docs/LAUNCH-PLAYBOOK.md:26  (아직 미체크)
- [ ] GRAC 내용수정신고 범위 확인: 밸런스 패치/보상형 광고 추가가 신고·재분류 대상인지
      — W2 직전에 발견하면 타임라인 전체가 밀린다
```

```
docs/session-slides.md:527
"…수집하는 개인정보가 0이라서 개인정보처리방침도, 동의 플로우도, 관련 심사 항목도 같이
 사라졌습니다. 광고 SDK도 안 붙였고요."
```

**광고 SDK 탑재는 이 전제를 되돌린다** (광고 식별자 = 개인정보 취급, 맞춤형 광고 동의).
Phase 0에서 반드시 확인할 것:

- GRAC 내용수정신고 대상 여부 (해당 시 재분류 소요 기간)
- 개인정보처리방침 필요 여부 + URL 등록 위치
- 앱정보 심사가 빌드 심사와 별개 큐인지 (영업일 3~5일)

**Phase 1(롤백 불가)을 내보낸 뒤 여기서 막히면 되돌릴 수 없는 상태로 대기하게 된다.**
→ R4는 Phase 1 **이전에** 해소한다.

### R5. 일정은 통제 변수가 아니다

```
docs/session-slides.md:475-481
"빌드를 올린다고 라이브에 반영되지 않는다 / 심사를 직접 신청 / 영업일 3~5일"
```

Phase 1과 Phase 2~4가 각각 별도 심사 큐이므로 실제 리드타임은 **최소 2주 + Phase 1 관찰 기간**이다.
콘솔에 *승인 후 수동 배포* 게이트가 있는지 Phase 0에서 확인해 여기 기록할 것: `______`

결정 B로 `SIM_VERSION`을 올리지 않으므로 **"코스 경계에 맞춰 배포"라는 타이밍 제약은 사라졌다.**

### R6. 광고 정책 준수 체크리스트

- 인트로/로딩/컷신에 광고 배치 금지 → 사망 후 지점만 사용
- 광고 **클릭**을 보상 조건으로 걸지 않기 → `userEarnedReward`(시청 완료)만 조건
- 동일 화면 동일 포맷 광고 2개 이상 금지 → 해당 없음
- 광고 UI 임의 변경·은닉 금지 → SDK가 전체 화면을 그림



### R7. 저사양 기기 OOM

`c5bcbb9`가 iOS를 FX 저사양 티어에 편입한 상태다. 네이티브 광고 플레이어와 Phaser WebGL이
동시 상주하면 저사양 웹뷰 OOM 위험이 있다. `heartbeat.ts`의 `abnormal_exit`으로 탐지하되,
광고 표시 중 Phaser 렌더러를 일시 정지(`game.loop.sleep()`)해 자원 경합을 줄인다.

---



## 4. 아키텍처



### 4.1 모듈 경계

```
src/ads/
  index.ts            광고 파사드 + adGroupId 상수. 웹/미지원 환경에선 전부 no-op
  adSdk.ts            AdSdk 인터페이스 + 실제 SDK 어댑터(동적 import)
  interstitialGate.ts 5회 주기 게이트 (순수 함수 — 테스트 대상)
src/ui/
  RevivePrompt.ts     이어뛰기 팝업 (Phaser 컨테이너)
src/sim/
  sim.ts              GameSim.revive() + pendingRevive
  ghost.ts            GhostDriver.finished 재정의 + revive 소비  ← 블로커 대응
  inputLog.ts         InputEvent.type 에 'revive' 추가 (SIM_VERSION 불변)
  constants.ts        REVIVE_* 상수, EV_REVIVE
sql/migrations/
  004_revive_count.sql  revive_count 컬럼 + 킬스위치 3키 시딩
```

`GameScene.ts`가 이미 6,287줄이라 팝업 UI와 광고 호출을 그 안에 더 넣지 않는다.
`GameScene`은 "팝업을 띄워달라 / 부활시켜달라"만 호출한다.

### 4.2 광고 파사드 계약

```ts
// src/ads/adSdk.ts — 주입 가능한 경계 (결정 M)
export interface AdSdk {
  isSupported(): boolean;
  load(adGroupId: string, onEvent: (t: 'loaded') => void, onError: (e: Error) => void): () => void;
  show(adGroupId: string, onEvent: (e: ShowEvent) => void, onError: (e: Error) => void): () => void;
}

// src/ads/index.ts
export function isAdsAvailable(): boolean;
export function preload(kind: 'revive' | 'interstitial'): void;
export function show(kind: 'revive' | 'interstitial'): Promise<AdResult>;

export type AdResult =
  | { type: 'rewarded' }                      // userEarnedReward — 보상 지급
  | { type: 'dismissed' }                     // 중도 이탈 — 보상 없음
  | { type: 'unavailable'; reason: string };  // 미지원·로드 실패·미준비
```

- `isAdsAvailable()` = 빌드 플래그 && `isAppsInTossHost()` && `sdk.isSupported()`
- 테스트는 가짜 `AdSdk`를 주입해 6분기를 node 환경에서 전부 커버



### 4.3 웹/토스 빌드 분기

```json
{
  "scripts": {
    "build":     "tsc --noEmit && vite build",
    "build:ait": "tsc --noEmit && VITE_ADS_ENABLED=true vite build && ait build"
  }
}
```

```ts
// vite.config.ts — define으로 상수를 박아 DCE를 보장한다
define: {
  __ADS_ENABLED__: JSON.stringify(process.env.VITE_ADS_ENABLED === 'true'),
}
```

`import.meta.env.VITE_ADS_ENABLED`**를 직접 쓰지 않는다.** 미설정 시 define 치환 대상이 아니라
트리셰이킹이 보장되지 않는다. `define`으로 리터럴 `false`를 박아야 `if (__ADS_ENABLED__)` 블록이
확실히 제거된다.

**중요 — 웹 번들 검증 방법 정정**: `src/aitHost.ts:24`가 웹에서도 실행되는 부트 경로에서
`await import('@apps-in-toss/web-framework')`를 하고 있다. 이 동적 import 문이 모듈 그래프에
남아 **SDK 배럴 청크는 웹** `dist`**에 이미 존재한다.** 3.x에서 그 배럴에는 `loadFullScreenAd`/
`showFullScreenAd`가 포함되므로 **"웹 번들에 광고 문자열이 없는지 grep"은 반드시 실패한다.**

→ 검증은 이렇게 한다:

1. **우리 모듈**(`src/ads/`)의 심볼이 웹 번들에 없는지 확인 (`grep 'interstitialGate\|isAdsAvailable'`)
2. 웹에서 `isAdsAvailable()`이 상수 `false`로 접히는지 번들 코드로 확인
3. 실제 웹 브라우저에서 사망 → 광고 관련 UI가 전혀 없는지 수동 확인

결정 F의 "코드가 번들에 없어 실수가 불가능"은 **우리 모듈에만 참**이다. SDK 배럴은 이미 들어있고,
방어선은 "호출하지 않음"이다.

### 4.4 원격 킬스위치

```ts
// src/remoteConfig.ts DEFAULTS 에 추가
  /** 이어뛰기(보상형) 광고 on/off. R2 fail-closed를 위해 기본 false */
  ads_revive_enabled: false,
  /** 전면광고 on/off. iOS fps 정리까지 false 유지 (결정 E-2) */
  ads_interstitial_enabled: false,
  /** 전면광고 주기. 게이트에서 정규화됨 (결정 L) */
  ads_interstitial_period: 5,
```

`remoteConfig.ts`의 **"sim 값은 절대 원격화하지 않는다"** 원칙은 지켜진다. 위 셋은 기능 on/off와
노출 빈도이지 시뮬 파라미터가 아니다. **부활 규칙(HP·무적·속도)은 원격화하지 않는다** —
결정론이 깨진다.

`sql/migrations/004`에 세 키의 시딩 행을 넣는다(`003`이 만든 선례를 따름).

**부트 경합**: `loadRemoteConfig()`는 fire-and-forget에 3초 타임아웃이고, 결정 H의 preload는
부트 완료 시점이다. preload는 `loadRemoteConfig()` 완료(또는 타임아웃) **이후**에 건다 —
꺼진 광고를 미리 받아오는 낭비를 막기 위함이다.

---



## 5. 시뮬레이션 변경



### 5.1 왜 로그에 남겨야 하는가

이 게임은 `seed + 탭 로그`만 저장하고 `replay()`로 재생해 고스트를 만든다.
**저장된 기록 = 로그를 재생하면 반드시 같은 결과**라는 게 불변식이다.

부활을 로그 밖에서 처리하면, 부활로 1,200m를 찍은 기록을 다른 유저가 고스트로 재생할 때
**400m에서 죽어 사라진다.**

### 5.2 결정론이 유지되는 이유

`GameSim.step()`은 `gameOver`면 즉시 return하며 `frame`을 올리지 않는다(`sim.ts:162`).
따라서 사망 후 팝업 5초 + 광고 30초가 흘러도 **시뮬 프레임은 정지**해 있다.

> **부활 이벤트의 frame = 사망이 판정된 프레임 + 1.**
> `sim.ts:302-307`이 사망 스텝에서 `s.frame++` 후 return하므로, 부활 시점의 `state.frame`은
> 사망 판정 프레임보다 1 크다. 기록·재생 모두 `state.frame`을 기준으로 하므로 일치한다.
> 대기 시간은 시뮬에 전혀 반영되지 않아 벽시계 의존이 생기지 않는다.



### 5.3 스키마 변경 — `SIM_VERSION`은 올리지 않는다

```ts
// src/sim/inputLog.ts
export interface InputEvent {
  frame: number;
  type: 'tap' | 'revive';   // 'revive' 추가
}
export const SIM_VERSION = '1.16.0';   // 변경 없음 (결정 B)
```

`parseLog`의 검증(`e.type !== 'tap'`)을 두 타입 허용으로 넓히고, `recordRevive`를 추가한다
(프레임 역행 검사는 `recordTap`과 공유).

버전을 올리지 않아도 안전한 이유:


| 방향                       | 결과                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| 신버전 클라 → 구 로그(`'tap'`만)  | 그대로 유효. `revive()` 추가는 기존 step 경로를 안 건드리고 RNG를 소비하지 않는다                                     |
| 구버전 클라 → 신 로그(revive 포함) | `inputLog.ts:141`에서 스키마 위반 throw → `remoteStore.ts:90` / `ghostStore.ts:102`가 **레코드 단위 스킵** |


**감수하는 열화**: 구버전 클라를 쓰는 토스 유저는 심사 통과 전까지 부활 포함 기록을 일간 보드·
고스트에서 못 본다. 주간 랭킹은 뷰가 `distance`만 읽으므로 정상 표시된다.
이 열화는 `SIM_VERSION`을 올려도 버전 파티션(`remoteStore.ts:62`) 때문에 동일하게 발생한다.

### 5.4 `GameSim.revive()`

```ts
// src/sim/constants.ts
export const REVIVE_INVINCIBLE_SEC = 3;
export const EV_REVIVE = 256;   // 기존 비트: 1,2,8,16,32,64,128

// src/sim/sim.ts
private pendingRevive = false;

revive(): void {
  const s = this.state;
  if (!s.gameOver) return;              // 살아있는데 부활 = 계약 위반, 무시
  s.gameOver = false;
  s.hp = C.HP_MAX;
  s.invincibleFrames = Math.round(C.REVIVE_INVINCIBLE_SEC * C.SIM_FPS);
  s.combo = 0;
  s.feverTimerFrames = 0;
  s.feverFramesLeft = 0;
  s.feverGraceFramesLeft = 0;
  s.player.jumpsUsed = 0;               // 공중 사망 후 부활 시 점프 불가 방지
  s.player.vy = 0;                      //   낙하 속도 초기화 (y는 유지)
  this.speedResetFrame = s.frame;
  this.pendingTaps = 0;                 // 팝업 중 눌린 탭이 새지 않게
  this.pendingRevive = true;            // events는 step()이 발화 — 직접 쓰면 지워진다
}

// step() 안, s.events = 0 직후
if (this.pendingRevive) {
  s.events |= C.EV_REVIVE;
  this.pendingRevive = false;
}
```

`revive()`**에서** `s.events`**를 직접 쓰면 안 된다.** `step()`이 진입부에서 `s.events = 0`으로
초기화하므로(`sim.ts:167`) 렌더가 읽기 전에 지워진다. 플래그를 두고 `step()` 안에서
`|=` 로 누적하는 것이 이 파일의 기존 이벤트 관례다.

- **장애물은 그대로 둔다.** 3초 무적이라 밀어낼 필요가 없다.
- `speedResetFrame` 갱신은 피격 처리(`sim.ts:281`)와 같은 장치를 재사용한다. 속도가 리셋되면
스폰 간격도 같은 시계(`speedT`)로 함께 리셋되어 통과 불가 구간이 안 생긴다(1.11.0에서 확인된 성질).
- 무적 3초 동안 HP 자연 감소는 계속된다(`HP_DRAIN_PER_SEC = 4` → 3초에 12). 100 → 88.
- **알려진 미세 불일치**: 사망 당시 겹쳐 있던 장애물은 `scored` 미처리라 통과 시 `combo++`가 된다
(`sim.ts:246-255`). 결정 C의 "콤보 0"과 어긋나지만 콤보는 표시 전용이라 영향은 무시 가능.



### 5.5 고스트 재생 — 블로커 대응

**계획 초안의 "별도 처리가 필요 없다"는 오류였다.**

```ts
// src/sim/ghost.ts:23-29 (현재)
get finished(): boolean { return this.sim.state.gameOver; }
step(): void {
  if (this.finished) return;          // ← 로그 커서를 돌리기 전에 return
```

`gameOver`가 되는 순간 커서가 전진하지 않으므로 **revive 이벤트가 영원히 소비되지 않는다.**
§5.1이 막겠다던 증상이 그대로 재현된다. 파급:

- `GameScene.ts:3246-3251`이 고스트의 `finished` 전환을 "제침"으로 카운트한다 →
**하지도 않은 제침이 유저에게 주어진다** (`overtakes` → `rank` → 주간 지표 오염)
- `applyGhostField`는 DB의 `distance`(1,200)로 이름표를 그리는데 스프라이트는 400m에서 쓰러진다

**수정**:

```ts
export class GhostDriver {
  private revivesLeft: number;

  constructor(log: InputLog) {
    this.sim = new GameSim(log.seed);
    this.log = log;
    this.revivesLeft = log.events.reduce((n, e) => n + (e.type === 'revive' ? 1 : 0), 0);
  }

  /** 남은 부활이 있으면 아직 끝난 게 아니다 */
  get finished(): boolean {
    return this.sim.state.gameOver && this.revivesLeft === 0;
  }

  step(): void {
    if (this.finished) return;
    const events = this.log.events;
    while (this.cursor < events.length && events[this.cursor]!.frame === this.sim.state.frame) {
      if (events[this.cursor]!.type === 'revive') {
        this.sim.revive();
        this.revivesLeft--;
      } else {
        this.sim.queueTap();
      }
      this.cursor++;
    }
    this.sim.step();
  }
}
```

`revivesLeft`를 생성자에서 한 번 세어 매 프레임 스캔을 피한다.
`replay()`도 같은 계약(`'revive'` → `sim.revive()`)으로 갱신한다 — `replay()`의 while 루프는
`sim.step()` 앞에 있어 `gameOver`여도 커서가 전진하므로 early-return 문제는 없다.

### 5.6 라이브 lockstep 1프레임 밀림

```ts
// GameScene.ts:3242 (현재) — 사망 스텝에 고스트가 step하지 않는다
if (!this.sim.state.gameOver) {
  for (...) g.step();
}
```

라이브가 사망 프레임 F에서 `frame++` → F+1이 되고 `gameOver`가 서므로, 그 스텝의 고스트 step이
가드에 걸린다. 고스트는 F에 머문다. 부활하면 **라이브 F+1 / 고스트 F로 영구히 1프레임 어긋난다**
(부활 횟수만큼 누적). 제침 판정과 거리 비교가 그만큼 틀어진다.

**수정**: 가드를 `step()` **호출 전**의 상태로 판정한다.

```ts
const liveWasOver = this.sim.state.gameOver;   // step 전 스냅샷
this.sim.step();
...
if (!liveWasOver) {          // 사망 스텝에도 고스트가 한 번 더 전진
  for (...) g.step();
}
```

---



## 6. 게임플레이 흐름



### 6.1 이어뛰기

```
사망 (EV_GAME_OVER)
  │  · game_over 계측 즉시 전송 (instant, revive_pending 필드 포함)   ← 결정 I
  │  · resultPanelTimer(delayedCall 900) 예약을 보류               ← GameScene.ts:3457
  │  · 서버 제출 / 로컬 저장 / prevRunSnapshot 은 아직 하지 않음
  │
  ├─ isAdsAvailable() == false ─────────► 판 종료 확정 (웹은 항상 이 경로)
  ├─ ads_revive_enabled == false ───────► 판 종료 확정
  ├─ 광고 미준비 ───────────────────────► 판 종료 확정 (팝업 자체를 안 띄움)
  │
  └─ 준비됨 → 이어뛰기 팝업
      │  · 등장 후 0.4초 입력 무시
      │  · 5초 카운트다운
      │
      ├─ 무반응 5초 / '그만하기' ────────► 판 종료 확정
      └─ '이어뛰기' 탭 → show('revive')
          ├─ { type: 'rewarded' }   ─► 부활 시퀀스 (§6.2)
          ├─ { type: 'dismissed' }  ─► 판 종료 확정 (보상 없음)
          └─ { type: 'unavailable' }─► 판 종료 확정 + 안내 토스트

판 종료 확정 = submitRunRemote + saveRun + writePrevRunSnapshot + 결과 패널
             (최종 사망에만 1회 — 결정 I)
```

**입력 유예 0.4초가 필수인 이유**: 이 게임은 탭 하나로 점프한다. 유저는 죽는 순간에도 연타 중일
확률이 높다. 팝업이 즉시 뜨면 연타 중이던 손가락이 이어뛰기 버튼을 눌러 *"누른 적 없는데 광고가
떴다"*가 되고, 토스 정책의 **"의도치 않은 클릭 유도"** 에 걸릴 소지가 있다.

### 6.2 부활 시 복구해야 하는 씬 상태

`revive()`는 sim만 되돌린다. 렌더/씬 상태 복구는 지금까지 `startRun()`에만 있었으므로
**부활 경로에서 같은 복구를 해야 한다.** 누락하면 부활 후 화면이 망가진다.


| 항목            | 현재 위치                                                                                          | 부활 시 필요한 것                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 플레이어 사망 페이드   | `GameScene.ts:4946-4962` alpha 0 → `setVisible(false)`                                         | 복구 (`startRun` 2280-2292 참조)                                                 |
| **고스트 전원 붕괴** | `4979` `shouldCollapse = g.finished || s.gameOver` → `4993` `ghostTumbleState[i] = "tumbling"` | `"run"` 복귀 (`2456`가 유일한 복구 지점). **누락하면 부활 후 텅 빈 트랙을 혼자 달린다** — 경쟁이 이 게임의 코어다 |
| 일시정지 버튼       | `3342` `setPauseButtonState(false, false)`                                                     | 다시 표시                                                                        |
| 게임오버 BGM      | `3341` `startGameoverBgm()`                                                                    | 메인/피버 BGM 복귀                                                                 |
| 결과 패널 타이머     | `3457` `delayedCall(900, …)`                                                                   | 취소 (`startRun`의 취소 패턴 재사용)                                                   |
| 타임스텝          | `3158` 선례                                                                                      | `timestep.reset()` — 광고 30초 동안 누적된 delta 방지                                  |




### 6.3 전면광고

```
재시도 탭 (death 또는 pause — 둘 다)
  │
  └─ interstitialGate.shouldShow()
      ├─ ads_interstitial_enabled == false ─► 건너뜀 (출시 시 기본값)
      ├─ 직전 판에서 이어뛰기 광고 시청 ────► 건너뜀 (카운터만 +1)
      ├─ count % period != 0 ──────────────► 건너뜀 (카운터 +1)
      └─ count % period == 0 ──────────────► show('interstitial') → 결과 무관하게 재시작
```

카운터는 `localStorage`에 `{ date, count }`로 저장하고 **UTC 날짜가 바뀌면 리셋**한다
(`dailySeed.ts`가 UTC 기준이므로 같은 축).

`period`는 게이트에서 `Math.min(50, Math.max(1, Math.round(v)))`로 정규화한다(결정 L).

전면광고는 결과와 무관하게 재시작을 진행한다. 광고 실패로 게임을 못 하게 만들면 안 된다.

---



## 7. 계측



### 7.1 새 이벤트


| 이벤트                 | 속성                                                              | 목적                            |
| ------------------- | --------------------------------------------------------------- | ----------------------------- |
| `ad_prompt_shown`   | `distance`, `near_record`, `revive_index`, `lifetime_run_index` | 팝업 노출. 조건부 노출 판단 기준           |
| `ad_prompt_closed`  | `reason: 'timeout' | 'user' | 'accepted'`                       | 5초 타이머 작동 확인, 거절 방식 분포        |
| `ad_show_result`    | `kind`, `result`, `reason`, `latency_ms`                        | 시청 완료율(단가 직결)과 로드 실패율         |
| `revive_used`       | `revive_index`, `distance_at_death`, `final_distance`           | 부활 기여도 + 무적 종료 즉사 발생률(§2 리스크) |
| `run_log_truncated` | `event_count`                                                   | 상한 8,000에 실제로 걸리는지            |


기존 이벤트 확장:

- `game_over`에 `revive_pending: boolean` 과 `revive_count` 추가 → 중간 사망과 최종 사망 구분
- `game_start`에 `interstitial_shown` 추가

`ad_show_result`는 광고 후 WebView 상태가 불안정할 수 있어 `{ instant: true }`(sendBeacon)로 보낸다.
`eventMirror.ts`가 §0 근거로 만든 미러 경로에 `ad_show_result`와 `revive_used`도 태운다 —
검수에서 PostHog 키가 빠질 가능성이 수익 직결 지표에 그대로 적용된다.

### 7.2 광고가 깨뜨리는 기존 지표 3종

전체 화면 광고는 `visibilitychange`/`pagehide`를 유발한다. 이미 그 신호를 쓰는 코드가 셋 있다.


| 지표                 | 코드                                           | 광고가 하는 일                                                                                      | 대응                                                      |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `retry_latency_ms` | `derive.ts:236-241` + `GameScene.ts:947-958` | `wentBackgroundSinceLastGameOver = true` → **광고를 본 재시도는 전부** `null`                           | 광고 표시 구간에 억제 플래그를 걸어 백그라운드 전환을 계측용으로 무시                 |
| `abnormal_exit`    | `heartbeat.ts:38-44`                         | `pagehide`에서 `HB_KEY` 삭제 → 광고 중 OOM 탐지 불가 / 안 쏘면 30초 정지로 오탐                                   | 광고 시작 시 하트비트를 명시적으로 일시 정지, 종료 시 재개                      |
| `death_cause`      | `GameScene.ts:3345`                          | 사망마다 계산되지만 **판당 마지막만 살아남음** → `prev_run_death_cause`(`derive.ts:183`)의 의미가 "돈 내고 취소한 사망"으로 바뀜 | `game_over`에 `revive_pending`을 넣어 중간 사망을 구분 가능하게 (§7.1) |




### 7.3 `near_record` 기준선이 광고로 오염된다

`ga:best-dist`는 부활 포함 거리로 갱신된다(`GameScene.ts:3496-3501`). 이후
`bestDistAtRunStart`(2319) → `is_personal_best` / `near_record`(3352-3356)가 모두
**"광고 없이는 도달 불가한 기준선"** 이 된다.

Phase 5의 "`near_record`별 전환율로 조건부 노출 판단"은 자기가 만든 편향을 측정하게 된다.
→ **부활 없는 PB를 별도 키(**`ga:best-dist-norevive`**)로 병행 보관**하고, Phase 5 분석은 그 축으로 한다.

---



## 8. 실행 단계



### Phase 0 — 사전 준비 (코드 변경 없음, **Phase 1보다 먼저 완료**)

> **운영자 클릭 필요 (코드는 테스트 ID·fail-closed로 진행 가능):**
> - Supabase / PostHog 허용 오리진에 아래 두 URL **추가**(기존 Vercel 도메인 삭제 금지)
>   - `https://ghost-runner.web.tossmini.com`
>   - `https://ghost-runner.private-web.tossmini.com`
> - 콘솔 **광고 그룹** 메뉴에서 운영 adGroupId 발급(「연동 키」= 토스페이, 광고 아님)
> - GRAC·개인정보처리방침 확인 전에는 **3.x 라이브 배포 보류**

- [ ] **GRAC 내용수정신고 대상 여부 확인** (R4) — 해당 시 재분류 소요 기간 파악
- [ ] **개인정보처리방침 필요 여부 + URL 등록 위치 확인** (R4)
- [ ] 앱정보 심사가 빌드 심사와 별개 큐인지 확인 (R4)
- [ ] **콘솔에 "승인 후 수동 배포" 게이트가 있는지 확인** → 결과 기록: `______` (R5)
- [ ] 보상형 / 전면형 `adGroupId` 각각 발급
- [ ] Supabase CORS에 `ghost-runner.web.tossmini.com`, `ghost-runner.private-web.tossmini.com` 등록
- [ ] PostHog 허용 오리진에 동일 도메인 등록
- [x] 개발용 테스트 ID 확보: `ait-ad-test-interstitial-id`, `ait-ad-test-rewarded-id` (코드 상수)
- [ ] 토스 앱 최소 버전 확인 (광고 2.0 5.227.0+, 통합 5.247.0+)
- [ ] **L1 검증**: 보상형과 전면형을 **동시에** preload 유지할 수 있는지. SDK가 "load 1개 → show 1개"
  ```
  싱글톤이면 전면광고 로드가 보상형 로드를 덮어써 사망 시점에 항상 미준비가 된다 — 결정 H의 전제
  ```
- [ ] **L2 검증**: 3.x의 `ait build`가 `package.json` 빌드 스크립트를 호출하는지.
  ```
  호출한다면 `build:ait`(= `vite build && ait build`)가 재귀한다
  ```



### Phase 1 — SDK 3.x 마이그레이션 단독 릴리스 ★ 롤백 불가 지점

**광고 코드는 한 줄도 넣지 않는다.**

- [ ] `npx ait migrate v3` 실행
- [ ] `granite.config.ts` → `apps-in-toss.config.ts` 결과 검토 (`webBundleDir`, `webView`, `brand`)
- [ ] `package.json` 스크립트를 `build` / `build:ait`로 분리
- [ ] 콘솔에서 앱 이름·아이콘 재설정 (`brand.displayName`/`icon` 소멸분 보전)
- [ ] **QR 실기기 검증**: 가로 잠금 / 게임 내비 크롬 / 투명 내비바 / 리더보드 로드 / PostHog 수신
- [ ] 웹(Vercel) 빌드도 정상인지 동시 확인
- [ ] 출시 및 관찰



### Phase 2 — 부활 (광고 없이)

`SIM_VERSION`을 올리지 않으므로(결정 B) **리셋 없음, 배포 타이밍 제약 없음.**

- [ ] `constants.ts`: `REVIVE_INVINCIBLE_SEC`, `EV_REVIVE`
- [ ] `sim.ts`: `revive()` + `pendingRevive` (§5.4)
- [ ] `inputLog.ts`: `'revive'` 타입, `recordRevive`, `parseLog` 확장 (`SIM_VERSION` 불변)
- [ ] `ghost.ts`**:** `revivesLeft` **+** `finished` **재정의 + revive 소비 (§5.5) ← 블로커**
- [ ] `replay()` 재생 경로에 `'revive'` 분기
- [ ] `GameScene.ts:3242` **lockstep 가드를 step 전 스냅샷으로 (§5.6)**
- [ ] **부활 시 씬 상태 복구 6항목 (§6.2)**
- [ ] `devTools`에 부활 트리거 — **배선 경로부터 만들 것.** 현재 `devTools.ts`의 export는
  ```
  `seedGhosts` 하나뿐이고 `main.ts:23`의 `import.meta.env.DEV` 블록에서만 로드되며,
  실행 중인 `GameScene` 인스턴스가 `window`에 노출돼 있지 않다
  ```
- [ ] 테스트: §9의 sim/ghost 항목 전부



### Phase 3 — 광고 파사드 + 이어뛰기 팝업

- [ ] `src/ads/adSdk.ts` (주입 인터페이스) + `src/ads/index.ts` (파사드 + adGroupId)
- [ ] `vite.config.ts`에 `define: { __ADS_ENABLED__ }` (§4.3)
- [ ] `RevivePrompt` (0.4초 유예 + 5초 카운트다운)
- [ ] `GameScene`의 `EV_GAME_OVER` 분기 + **판 종료 확정 게이팅 (결정 I, §6.1)**
- [ ] 부트 완료 + `loadRemoteConfig` 이후 preload, 광고 종료 후 재-preload
- [ ] `remoteConfig`에 킬스위치 3종 (기본값 `false`/`false`/`5`)
- [ ] 계측 대응 3종 (§7.2) + `near_record` 병행 키 (§7.3)
- [ ] 광고 표시 중 Phaser 렌더러 일시 정지 (R7)
- [ ] `sql/migrations/004`: `revive_count` 컬럼 + 킬스위치 시딩
- [ ] `remoteStore`: `revive_count` 페이로드 + **이상치 상한 × (revive_count+1)** (결정 K)
- [ ] 로그 상한 8,000 + 초과 시 로컬만 스킵 (결정 J)
- [ ] **웹 번들 검증 (§4.3의 정정된 3단계)**



### Phase 4 — 전면광고 (코드 포함, 플래그 OFF)

- [ ] `interstitialGate` (순수 함수 + localStorage, UTC 일간 리셋, period 정규화)
- [ ] **두 재시도 경로 모두** 연결 (`GameScene.ts:1696`, `GameScene.ts:2109`) — 결정 G
- [ ] 이어뛰기 시청 직후 건너뛰기 규칙
- [ ] `ads_interstitial_enabled` 기본값 `false` 확인 — 결정 E-2



### Phase 5 — 관찰 및 튜닝

**사전 고정 가드레일** (이 중 하나라도 걸리면 해당 킬스위치를 당긴다):


| 지표                 | 임계              | 액션                           |
| ------------------ | --------------- | ---------------------------- |
| `abnormal_exit` 비율 | 광고 도입 전 대비 +50% | `ads_revive_enabled = false` |
| 세션당 판수             | 전 대비 -20%       | 전면광고 먼저 off                  |
| 재시도율               | 35% 미만으로 하락     | 전면광고 off, 주기 5→10            |
| 광고 시청 완료율          | 40% 미만          | 노출 위치·문구 재검토                 |


- [ ] 전/후 코호트 분리 (`LAUNCH-PLAYBOOK.md:170-171` 요구사항)
- [ ] `near_record`(부활 없는 축)별 전환율 → 조건부 노출 판단
- [ ] iOS fps 정리 후 `ads_interstitial_enabled = true` (재배포 불필요)
- [ ] 부활이 기록 분포·랭킹 상단을 어떻게 바꿨는지 확인

---



## 9. 테스트 전략



### 커버리지 목표

```
CODE PATHS                                          USER FLOWS
[+] sim.ts revive()                                 [+] 이어뛰기 저니
  ├── gameOver=true → 정상 부활                       ├── [→E2E] 죽음→팝업→광고→부활→계속
  ├── gameOver=false → early return                  ├── [→E2E] 죽음→무시 5초→게임오버
  ├── 필드 10개 초기화(hp/무적/콤보/피버×3/            ├── [수동] 광고 중 백그라운드→복귀
  │    speedResetFrame/pendingTaps/jumpsUsed/vy)     ├── [수동] 기내모드 → 로드 실패 → 게임 정상
  └── pendingRevive → step()이 EV_REVIVE 발화          └── [수동] 연타하며 죽을 때 0.4초 유예

[~] inputLog.ts                                     [+] 전면광고 저니
  ├── parseLog: 'revive' 허용                         ├── death 재시도 5회 → 광고
  ├── [★★ 기존] 미지 구조 거부 — :48                  ├── pause 다시하기 5회 → 광고
  ├── [★★ 기존] 버전 불일치 거부 — :42                ├── 이어뛰기 시청 직후 → 건너뜀
  └── recordRevive 프레임 역행                        └── 플래그 false → 항상 건너뜀

[~] ghost.ts GhostDriver                            [+] 웹 배포
  ├── [CRITICAL] finished가 false로 복귀                └── [수동] 광고 UI 전무 + 우리 모듈 grep
  │      ← :44 테스트의 전제를 깨는 회귀
  ├── revivesLeft 소진 후 finished=true               [+] 고스트 정합성
  └── revive 이벤트 소비                                ├── [→E2E] 부활 기록이 다음 판에서
                                                      │      끝까지 재생 (설계 핵심 검증)
[~] replay() 골든 리플레이                             └── 제침 카운트가 부활로 부풀지 않음
  ├── [★★★ 기존] lockstep == 일괄 — ghost:22
  ├── [★★ 기존] 같은 프레임 같은 상태 사망 — :32      [+] 판 종료 게이팅
  └── [CRITICAL] 부활 포함 로그의 골든값                 ├── 부활 2회 → ghost_runs 1행
                                                      └── 부활 2회 → game_over 3개(revive_pending)
[+] ads/interstitialGate.ts (순수 함수)
  ├── count % period === 0 → show
  ├── UTC 날짜 경계 리셋
  ├── 직전 이어뛰기 시청 → skip + count++
  ├── period 정규화 0 / 0.5 / -1 / NaN / 999
  └── localStorage 손상 → 기본값

[+] ads/index.ts 파사드 (가짜 AdSdk 주입)
  ├── 빌드 플래그 off → false
  ├── 웹 호스트 → false
  ├── sdk.isSupported() false → false
  ├── rewarded / dismissed / failedToShow
  ├── 미준비 상태에서 show → unavailable
  └── load onError → unavailable

[~] remoteStore.ts
  ├── revive_count 페이로드
  └── 이상치 상한 × (revive_count+1) 경계값
```



### 필수 회귀 테스트 (REGRESSION RULE — 질문 없이 추가)

1. `ghost.test.ts:44` **갱신** — "finished 후 step()은 no-op"이라는 전제가 부활로 바뀐다.
  `revivesLeft > 0`이면 `finished`가 `false`이고 step이 진행됨을 고정한다.
2. **부활 포함 골든 리플레이** — revive 이벤트가 든 로그의 lockstep 재생 결과가 `replay()` 일괄
  재생과 일치하고, 최종 거리가 고정값과 같음을 고정한다.
3. **제침 카운트 불변** — 부활 고스트가 첫 사망에서 `finished` 전환되지 않아 `overtakes`가
  부풀지 않음을 고정한다.



### 수동 검증 (QR 실기기)

- 웹 번들에 `src/ads/` 심볼이 없는지 (§4.3의 정정된 방법)
- 연타하며 죽었을 때 0.4초 유예가 오작동을 막는지
- 광고 중 백그라운드 전환 → 복귀 시 게임 상태 + 하트비트
- 기내모드에서 광고 로드 실패 시 게임이 정상 진행되는지
- **부활 후 고스트들이 다시 달리는지** (§6.2 — 누락하면 혼자 달림)
- **부활한 기록이 다음 판에서 고스트로 끝까지 재생되는지** ← 이번 설계의 핵심 검증

---



## 10. 실패 모드


| 코드패스                 | 실패 시나리오                               | 테스트           | 에러 처리                        | 유저가 보는 것                   |
| -------------------- | ------------------------------------- | ------------- | ---------------------------- | -------------------------- |
| `ads.show('revive')` | 광고 서버 타임아웃                            | ✅ 주입 SDK      | ✅ `unavailable`              | 안내 토스트 + 게임오버              |
| `ads.show('revive')` | `dismissed`만 오고 `userEarnedReward` 없음 | ✅             | ✅ 보상 없음                      | 게임오버 (정책 준수)               |
| `GhostDriver`        | revive 이벤트 미소비                        | ✅ CRITICAL 회귀 | —                            | **고스트 증발 + 허위 제침** (수정 전)  |
| `revive()`           | 공중 사망 후 부활                            | ✅             | ✅ `jumpsUsed=0`              | 정상 조작                      |
| 판 종료 게이팅             | 팝업 중 앱 종료                             | ⚠️ 수동         | ✅ `game_over` instant는 이미 전송 | 서버 행 없음(중간 사망), 계측은 남음     |
| `interstitialGate`   | `localStorage` 손상                     | ✅             | ✅ 기본값                        | 광고 정상 주기                   |
| `remoteConfig`       | R2로 Supabase 접근 불가                    | ✅             | ✅ fail-closed(`false`)       | 광고 없음 (안전)                 |
| 로그 상한                | 8,000 초과                              | ✅             | ✅ 로컬만 스킵                     | 랭킹 정상, 셀프 고스트만 없음          |
| 이상치 상한               | 부활로 19,800m 초과                        | ✅ 경계값         | ✅ × (revive_count+1)         | 기록 정상 반영                   |
| 광고 중 OOM             | 저사양 iOS                               | ⚠️ 수동         | ⚠️ 렌더러 sleep으로 완화            | 앱 재시작 → `abnormal_exit` 탐지 |


**critical gap 0** — 모든 실패 모드에 테스트 또는 에러 처리가 있고, 조용히 실패하는 경로는 없다.

---



## 11. 병렬화 전략


| 레인                   | 모듈                                   | 의존             |
| -------------------- | ------------------------------------ | -------------- |
| **A** SDK 3.x 마이그레이션 | 루트 설정                                | — (선행, 별도 릴리스) |
| **B** sim 부활         | `src/sim/`                           | A              |
| **C** 광고 파사드         | `src/ads/`                           | A              |
| **D** 서버 스키마         | `sql/`, `src/remoteStore.ts`         | A              |
| **E** 팝업 + 통합        | `src/ui/`, `src/render/GameScene.ts` | B, C           |


```
[릴리스 1]  Lane A ── QR 검증 ── 출시 ── 관찰
                                          │
[릴리스 2]              ┌── Lane B ──┐
                        ├── Lane C ──┼── Lane E ── 배포
                        └── Lane D ──┘
```

B·C·D는 겹치는 디렉터리가 없어 병렬 워크트리로 돌려도 충돌하지 않는다.
E만 `GameScene.ts`를 건드리고 B의 `constants.ts`·C의 파사드 타입을 참조하므로 마지막에 붙인다.

---



## 12. 이미 존재해서 재사용하는 것


| 기존 자산                    | 위치                                       | 재사용 방식                            |
| ------------------------ | ---------------------------------------- | --------------------------------- |
| 호스트 감지 + 동적 import       | `aitHost.ts:10,24`                       | 웹 차단 패턴 그대로                       |
| 피격 시 속도 리셋               | `sim.ts:281` `speedResetFrame`           | `revive()`에서 동일 장치                |
| 원격 킬스위치 인프라              | `remoteConfig.ts`                        | 키 3개 추가                           |
| `nearRecord` 판정          | `GameScene.ts:3353`                      | 조건부 노출 분석 축                       |
| `sim_version` **서버 파티션** | `remoteStore.ts:62`                      | 이미 구현됨 — `TODOS.md:33`의 P1은 완료 상태 |
| 레코드 단위 파싱 스킵             | `remoteStore.ts:90`, `ghostStore.ts:102` | 버전 유지의 안전 근거                      |
| `QuotaExceeded` 방어       | `ghostStore.ts:79`                       | 로그 상한의 2차 방어선                     |
| 이벤트 미러                   | `eventMirror.ts`                         | 광고 이벤트도 태움                        |
| 결과 패널 타이머 취소             | `startRun`의 `resultPanelTimer` 패턴        | 부활 경로에서 재사용                       |


---



## 13. NOT in scope


| 항목                       | 제외 이유                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| 배너 광고                    | 가로 풀스크린 게임에 상시 배너는 화면을 잡아먹는다. 별도 검토.                              |
| 주간 랭킹 뷰 수정               | `revive_count` 컬럼만 추가하고 뷰는 안 건드림 — `002` 주석의 "유저 자산 보호" 설계 의도 존중. |
| `remoteConfig` 전체 범위 스키마 | 기존 키의 적정 범위 결정이 필요해 이 PR 밖 (TODO 후보).                             |
| 부활 횟수 제한                 | 무제한으로 결정 (A).                                                     |
| 무적 종료 즉사 방어              | 그대로 감수 (§2). 고치려면 `SIM_VERSION` 업 → 리셋.                           |
| 시즌제 리더보드 운영              | `TODOS.md:28`의 방향 결정 자체는 이 PR 밖 (TODO 후보).                        |
| IAP로 이어뛰기 판매             | 광고 수익화만.                                                          |
| `scored` 미처리 콤보 보정       | 표시 전용이라 영향 무시 가능 (§5.4).                                          |


---



## 참고

- [앱인토스 전면형/보상형 광고](https://developers-apps-in-toss.toss.im/documentation/common/monetization/iaa/interstitial-rewarded-ad.md)
- [앱인토스 인앱 광고 가이드](https://developers-apps-in-toss.toss.im/guide/monetization/in-app-ad.md)
- [SDK 3.x 마이그레이션](https://developers-apps-in-toss.toss.im/documentation/integration/sdk-3.x.md)

---



## Implementation Tasks

이 리뷰의 발견에서 도출된 작업 목록. 체크박스로 진행 관리.

- [ ] **T1 (P1, human: ~1d / CC: ~30min)** — Phase 0 — GRAC·개인정보처리방침·심사 큐 확인
  - Surfaced by: 외부 검증 B3 — `LAUNCH-PLAYBOOK.md:26` 미체크 항목
  - Files: 없음 (외부 절차)
  - Verify: 플레이북 체크박스 완료 + 결과를 R4/R5에 기록
- [ ] **T2 (P1, human: ~2h / CC: ~20min)** — `src/sim/ghost.ts` — `revivesLeft` + `finished` 재정의
  - Surfaced by: 외부 검증 B1 — `ghost.ts:26` early return이 revive를 영원히 소비 안 함
  - Files: `src/sim/ghost.ts`, `src/sim/__tests__/ghost.test.ts`
  - Verify: `npm test` — 부활 포함 골든 리플레이 + `:44` 갱신 통과
- [ ] **T3 (P1, human: ~4h / CC: ~40min)** — `GameScene.ts` — 판 종료 확정 게이팅
  - Surfaced by: 외부 검증 B2 — 부활 1회당 `ghost_runs` 2행, `game_over` 2개
  - Files: `src/render/GameScene.ts`
  - Verify: 부활 2회 후 서버 행 1개 / `game_over` 3개(`revive_pending` 구분)
- [ ] **T4 (P1, human: ~3h / CC: ~30min)** — `GameScene.ts` — 부활 시 씬 상태 복구 6항목
  - Surfaced by: 외부 검증 M1 — 고스트 전원 붕괴 후 복구 지점이 `startRun`에만 있음
  - Files: `src/render/GameScene.ts`
  - Verify: QR 실기기 — 부활 후 고스트들이 다시 달리는지
- [ ] **T5 (P1, human: ~2h / CC: ~20min)** — `src/sim/` — `revive()` + `pendingRevive` + 상수
  - Surfaced by: Section 2 이슈 5 — `sim.ts:167`이 `events`를 지움
  - Files: `src/sim/sim.ts`, `src/sim/constants.ts`, `src/sim/inputLog.ts`
  - Verify: `npm test` — `EV_REVIVE` 발화 + 필드 10개 초기화
- [ ] **T6 (P2, human: ~1h / CC: ~10min)** — `GameScene.ts:3242` — lockstep 가드 스냅샷
  - Surfaced by: 외부 검증 M3 — 사망 스텝에 고스트가 step하지 않아 1프레임 밀림
  - Files: `src/render/GameScene.ts`
  - Verify: 부활 후 라이브·고스트 `frame` 동일
- [ ] **T7 (P2, human: ~3h / CC: ~30min)** — `src/ads/` — 파사드 + 주입 `AdSdk`
  - Surfaced by: Section 3 이슈 7 — 실패 분기가 QR로 재현 불가
  - Files: `src/ads/index.ts`, `src/ads/adSdk.ts`, `src/ads/__tests__/`
  - Verify: `npm test` — 6분기 커버
- [ ] **T8 (P2, human: ~2h / CC: ~20min)** — `src/ads/interstitialGate.ts` — 게이트 + 정규화
  - Surfaced by: Section 2 이슈 6 + Section 1 이슈 2
  - Files: `src/ads/interstitialGate.ts`, 테스트
  - Verify: `npm test` — period `0/0.5/-1/NaN` + UTC 경계
- [ ] **T9 (P2, human: ~1h / CC: ~15min)** — `sql/migrations/004` + `remoteStore` — `revive_count`
  - Surfaced by: Section 1 이슈 1 + 외부 검증 M2
  - Files: `sql/migrations/004_revive_count.sql`, `src/remoteStore.ts`
  - Verify: 이상치 상한 경계값 테스트 + Supabase 적용
- [ ] **T10 (P2, human: ~3h / CC: ~30min)** — 계측 오염 3종 + `near_record` 병행 키
  - Surfaced by: 외부 검증 M5, M6
  - Files: `src/heartbeat.ts`, `src/render/GameScene.ts`, `src/analytics/`
  - Verify: 광고 전후 `retry_latency_ms`가 `null`이 아닌지
- [ ] **T11 (P2, human: ~2h / CC: ~20min)** — `RevivePrompt` (0.4초 유예 + 5초 카운트다운)
  - Surfaced by: 결정 D
  - Files: `src/ui/RevivePrompt.ts`
  - Verify: QR 실기기 — 연타하며 죽어도 오탭 없음
- [ ] **T12 (P3, human: ~1h / CC: ~10min)** — `devTools` 부활 트리거 배선
  - Surfaced by: 외부 검증 L4 — `GameScene` 인스턴스가 `window`에 없음
  - Files: `src/devTools.ts`, `src/main.ts`
  - Verify: 콘솔에서 부활 트리거 동작
- [ ] **T13 (P3, human: ~30min / CC: ~5min)** — `eventMirror`에 광고 이벤트 태우기
  - Surfaced by: 외부 검증 M8
  - Files: `src/eventMirror.ts`
  - Verify: 미러 경로에 `ad_show_result` 수신

---



## GSTACK REVIEW REPORT


| Review        | Trigger               | Why                             | Runs | Status | Findings                                |
| ------------- | --------------------- | ------------------------------- | ---- | ------ | --------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 0    | —      | —                                       |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 0    | —      | codex not installed                     |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | clean  | 8 issues + 13 external, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 0    | —      | —                                       |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | —      | —                                       |


**OUTSIDE VOICE (Claude subagent):** 블로커 2건(고스트 revive 미소비, 판 종료 파이프라인 중복),
상 5건(리셋 금지 창·`SIM_VERSION` 불필요·코호트 분리·일정 통제 불가·웹 번들 전제 오류),
중 8건, 하 6건. 검증 결과 대부분 사실로 확인되어 전량 반영. 이 리뷰의 자체 서술 오류 1건
(§5.2 부활 frame 계산)도 외부 검증이 잡아 정정.

**CROSS-MODEL:** 두 긴장점 모두 외부 voice 채택 — (T1) 전면광고를 원격 플래그 OFF로 출시,
(T2) `SIM_VERSION` 1.16.0 유지. 두 결정 모두 이 저장소의 기존 운영 문서
(`launch-log.md` 8/7 엔트리, `launch-log.md:58` 리셋 금지 원칙)를 근거로 한다.

**VERDICT:** ENG CLEARED — 결정 13건 확정, critical gap 0, 구현 착수 가능.

NO UNRESOLVED DECISIONS