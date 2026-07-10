# SFX 출처 / 라이선스

게임 원샷 효과음. BGM(`bgm-*.mp3`)과 별도.

| 파일 | 용도 | 출처 | 라이선스 | 원본 / 가공 |
|------|------|------|----------|-------------|
| `sfx-jump.wav` | 점프 부르릉 | [Mixkit — Motorcycle changing gears](https://mixkit.co/free-sound-effects/motorcycle/) (id 2730 preview) | [Mixkit License](https://mixkit.co/license/#sfxFree) | ~0.4s 트림·정규화. (구 engine-working / racing speedup 교체) |
| `sfx-hit.wav` | 피격 드리프트/스키드 | [Freesound — Sonic Skid (plasterbrain #464910)](https://freesound.org/people/plasterbrain/sounds/464910/) | CC0 | ~0.46s, 게인 보정 |
| `sfx-potion.wav` | 연료 획득 | [Mixkit — Video game health recharge](https://mixkit.co/free-sound-effects/drink/) (id 2837 preview) | [Mixkit License](https://mixkit.co/license/#sfxFree) | ~0.45s, 피크 정규화. (구 Freesound gulp는 BGM에 완전 묻혀 교체) |
| `sfx-siren.wav` | 정전 WARNING | [Mixkit — Police siren US](https://mixkit.co/free-sound-effects/siren/) (id 1643 preview) | [Mixkit License](https://mixkit.co/license/#sfxFree) | ~1.4s 루프, warn 페이즈만 |
| `sfx-fever.wav` | 피버 시작 | `scripts/gen-sfx.mjs` 합성 | 자체 | 실샘플 교체 시 §6.2 프롬프트 |
| `sfx-tick.wav` | 콤보/UI | 합성 | 자체 | 〃 |
| `sfx-overtake.wav` | 고스트 제침(사망) 푸쉬시 | [Mixkit — Ghostly whoosh passing](https://mixkit.co/free-sound-effects/whoosh/) (id 2623 preview) | [Mixkit License](https://mixkit.co/license/#sfxFree) | 피크 ~0.38s 트림. 고스트 finished 시 재생 |
| `sfx-death.wav` | 사망 | 합성 | 자체 | 〃 |

> Mixkit preview CDN(`assets.mixkit.co/.../preview.mp3`)은 Mixkit 무료 SFX와 동일 라이선스 범위로 사용.
> Freesound는 **CC0만** 사용. 비 CC0 샘플은 넣지 말 것.
