/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node', // 시뮬 코어는 DOM 의존 0 — node 환경으로 충분
  },
});
