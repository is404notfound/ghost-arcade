import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// D10 — 시뮬 코어 교차 엔진 결정론 (iOS JSC + Android V8):
// 초월함수(sin/cos/pow/exp/log 등)는 엔진별 구현 정밀도가 달라 리플레이가 깨진다.
// IEEE754가 결과를 정확히 규정하는 사칙연산·sqrt·floor류·비트연산만 허용.
const NONDETERMINISTIC_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'pow', 'cbrt', 'hypot',
];

export default tseslint.config(
  { ignores: ['dist/', 'prototypes/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node 실행 스크립트 (GitHub Actions 등) — 브라우저가 아닌 Node 전역 사용
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...NONDETERMINISTIC_MATH.map((p) => ({
          object: 'Math',
          property: p,
          message: `D10 위반: Math.${p}는 JSC/V8 간 결과가 달라 결정론을 깬다. 사칙연산+sqrt로 재구성할 것.`,
        })),
        {
          object: 'Math',
          property: 'random',
          message: 'D10 위반: Math.random 금지. src/sim/rng.ts의 시드 RNG를 사용할 것.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'D10 위반: 벽시계는 결정론을 깬다. 프레임 인덱스 기반으로 계산할 것.',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'D10 위반: 벽시계는 결정론을 깬다. 프레임 인덱스 기반으로 계산할 것.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message: 'D10 위반: ** 연산자는 Math.pow와 동일하게 엔진별 정밀도가 다르다. 곱셈으로 풀어 쓸 것.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'D10 위반: **= 연산자 금지 (Math.pow와 동일한 비결정론).',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'D10 위반: 시뮬 코어에서 Date 사용 금지.',
        },
      ],
    },
  },
);
