#!/usr/bin/env node
/**
 * 짧은 게임 SFX WAV 합성기 (피버/틱/제침/사망 등).
 * 점프·피격·연료는 무료 실샘플이므로 이 스크립트가 덮어쓰지 않는다.
 * 실샘플 출처: assets/audio/CREDITS-sfx.md
 *
 * 사용: node scripts/gen-sfx.mjs
 * 출력: assets/audio/sfx-{fever,tick,overtake,death}.wav
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../assets/audio");
const SR = 44100;

function clamp(v, lo = -1, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function writeWav(filePath, samples) {
  const n = samples.length;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const s = clamp(samples[i]);
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function alloc(sec) {
  return new Float64Array(Math.max(1, Math.floor(SR * sec)));
}

function envADSR(i, n, a, d, s, r) {
  const at = Math.floor(n * a);
  const dt = Math.floor(n * d);
  const rt = Math.floor(n * r);
  const st = Math.max(0, n - at - dt - rt);
  if (i < at) return at ? i / at : 1;
  if (i < at + dt) return 1 - (1 - s) * ((i - at) / (dt || 1));
  if (i < at + dt + st) return s;
  const ri = i - (at + dt + st);
  return s * (1 - ri / (rt || 1));
}

function noise() {
  return Math.random() * 2 - 1;
}

function softClip(x) {
  return Math.tanh(x * 1.4);
}

/** 점프 — 고회전 엔진 버스트 + 배기 팝 */
function genJump() {
  const out = alloc(0.42);
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const e = envADSR(i, out.length, 0.02, 0.18, 0.35, 0.45);
    const freq = 90 + 420 * Math.exp(-t * 9) + 60 * Math.sin(t * 40);
    phase += (2 * Math.PI * freq) / SR;
    phase2 += (2 * Math.PI * freq * 1.5) / SR;
    const engine =
      Math.sin(phase) * 0.55 +
      Math.sin(phase2) * 0.25 +
      Math.sin(phase * 2.01) * 0.12;
    const exhaust = noise() * Math.exp(-t * 28) * 0.55;
    const pop = t < 0.035 ? Math.sin(2 * Math.PI * 55 * t) * (1 - t / 0.035) * 0.7 : 0;
    out[i] = softClip((engine * e + exhaust + pop) * 0.85);
  }
  return out;
}

/** 피격 — 전기 스파크 + 금속 스크래치 */
function genHit() {
  const out = alloc(0.2);
  let metalPhase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const e = Math.exp(-t * 22);
    const spark = noise() * Math.exp(-t * 55) * 0.9;
    const freq = 1800 - t * 4200;
    metalPhase += (2 * Math.PI * Math.max(120, freq)) / SR;
    const scrape = Math.sin(metalPhase) * 0.35 * e;
    const click = t < 0.012 ? noise() * (1 - t / 0.012) : 0;
    out[i] = softClip((spark + scrape + click) * 0.95);
  }
  return out;
}

/** 연료 — 짧은 액체 주입 + 클렁 */
function genPotion() {
  const out = alloc(0.3);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const pourEnv = t < 0.18 ? Math.sin((Math.PI * t) / 0.18) : 0;
    const bub = noise() * 0.35 + Math.sin(2 * Math.PI * (520 + 80 * Math.sin(t * 30)) * t) * 0.2;
    const pour = bub * pourEnv * 0.7;
    const clunkT = t - 0.2;
    let clunk = 0;
    if (clunkT >= 0 && clunkT < 0.08) {
      const ce = Math.exp(-clunkT * 40);
      phase += (2 * Math.PI * (140 + clunkT * -400)) / SR;
      clunk = (Math.sin(phase) * 0.55 + noise() * 0.15) * ce;
    }
    out[i] = softClip(pour + clunk);
  }
  return out;
}

/** 피버 시작 — 상승 신스 스윕 + 스파클 */
function genFever() {
  const out = alloc(0.8);
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const e = envADSR(i, out.length, 0.05, 0.2, 0.55, 0.35);
    const freq = 180 * Math.pow(2, t * 2.2); // ~2.2 octave rise
    phase += (2 * Math.PI * freq) / SR;
    phase2 += (2 * Math.PI * freq * 1.5) / SR;
    const lead = Math.sin(phase) * 0.45 + Math.sin(phase2) * 0.2;
    const sparkle =
      Math.sin(2 * Math.PI * (2400 + 900 * Math.sin(t * 18)) * t) *
      Math.exp(-((t - 0.45) ** 2) / 0.08) *
      0.25;
    const whoosh = noise() * Math.exp(-t * 3) * (1 - t) * 0.2;
    out[i] = softClip((lead * e + sparkle + whoosh) * 0.9);
  }
  return out;
}

/** UI/콤보 틱 — 짧은 시안 블립 */
function genTick() {
  const out = alloc(0.08);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const e = Math.exp(-t * 55);
    phase += (2 * Math.PI * (880 + t * 400)) / SR;
    out[i] = softClip(Math.sin(phase) * e * 0.7);
  }
  return out;
}

/** 제침/등수↑ — 짧은 상승 스윕 */
function genOvertake() {
  const out = alloc(0.18);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const e = envADSR(i, out.length, 0.02, 0.2, 0.4, 0.5);
    const freq = 420 * Math.pow(2, t * 2.5);
    phase += (2 * Math.PI * freq) / SR;
    out[i] = softClip((Math.sin(phase) + 0.3 * Math.sin(phase * 2)) * e * 0.65);
  }
  return out;
}

/** 사망 — 짧은 하강 톤 */
function genDeath() {
  const out = alloc(0.35);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const e = envADSR(i, out.length, 0.01, 0.25, 0.3, 0.5);
    const freq = 320 * Math.pow(2, -t * 2.8);
    phase += (2 * Math.PI * freq) / SR;
    const grit = noise() * Math.exp(-t * 8) * 0.2;
    out[i] = softClip((Math.sin(phase) * 0.7 + grit) * e);
  }
  return out;
}

const FILES = [
  // jump / hit / potion = 실샘플 (CREDITS-sfx.md) — 여기서 생성·덮어쓰기 금지
  ["sfx-fever.wav", genFever],
  ["sfx-tick.wav", genTick],
  ["sfx-overtake.wav", genOvertake],
  ["sfx-death.wav", genDeath],
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, gen] of FILES) {
  const samples = gen();
  const dest = path.join(OUT_DIR, name);
  writeWav(dest, samples);
  console.log(`wrote ${name} (${(samples.length / SR).toFixed(2)}s)`);
}
