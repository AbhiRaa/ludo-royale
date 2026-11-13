"use client";

/**
 * The score. Generated live, never looped: a tanpura-style drone on D, with
 * bells wandering a D-major pentatonic over it. A single `tension` number,
 * fed from the board, decides how busy and how urgent it gets.
 *
 * Everything is tuned to one root and one five-note scale, so no combination
 * of voices can clash — the music is consonant by construction.
 */
import { audioGraph } from "./sound";

const D3 = 146.832;
const PENTATONIC = [0, 2, 4, 7, 9];
const semis = (n: number) => D3 * Math.pow(2, n / 12);

/** tanpura's four-pluck cycle: fifth, octave, octave, low tonic */
const DRONE = [-5, 0, 0, -12];

let enabled = true;
let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
let bus: GainNode | null = null;
let pad: { stop: () => void } | null = null;
let buzzWave: PeriodicWave | null = null;

let nextTime = 0;
let step = 0;
let tension = 0.15;
let target = 0.15;
let degree = 4;

export function isMusicOn() {
  return enabled;
}

export function loadMusicPreference(): boolean {
  try {
    enabled = localStorage.getItem("ludo.music") !== "0";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function setMusicOn(next: boolean) {
  enabled = next;
  try {
    localStorage.setItem("ludo.music", next ? "1" : "0");
  } catch {
    /* preference simply will not persist */
  }
  if (next) startMusic();
  else stopMusic();
}

/** 0 = a quiet table, 1 = everything on the line. Smoothed internally. */
export function setTension(value: number) {
  target = Math.min(1, Math.max(0, value));
}

function pluck(g: NonNullable<ReturnType<typeof audioGraph>>, time: number, freq: number, gain: number) {
  if (!bus) return;
  const { ctx } = g;
  if (!buzzWave) {
    // a bright, slightly nasal spectrum — the tanpura's "jawari" buzz
    const n = 14;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) imag[k] = (1 / k) * (k % 3 === 0 ? 0.55 : 1) * (1 + 0.5 * Math.sin(k * 1.7));
    buzzWave = ctx.createPeriodicWave(real, imag);
  }
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(buzzWave);
  osc.frequency.value = freq;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = 0.8;
  filt.frequency.setValueAtTime(3200, time);
  filt.frequency.exponentialRampToValueAtTime(420, time + 2.6);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(gain, time + 0.03);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + 3.4);
  osc.connect(filt);
  filt.connect(amp);
  amp.connect(bus);
  osc.start(time);
  osc.stop(time + 3.5);
}

function bell(g: NonNullable<ReturnType<typeof audioGraph>>, time: number, freq: number, gain: number) {
  if (!bus) return;
  const { ctx } = g;
  [1, 2.01, 3.02].forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const amp = ctx.createGain();
    const peak = gain / (1 + i * 2.2);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(peak, time + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 1.5 - i * 0.35);
    osc.connect(amp);
    amp.connect(bus!);
    osc.start(time);
    osc.stop(time + 1.6);
  });
}

function thump(g: NonNullable<ReturnType<typeof audioGraph>>, time: number, gain: number) {
  if (!bus) return;
  const { ctx } = g;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(96, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.2);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(gain, time + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
  osc.connect(amp);
  amp.connect(bus);
  osc.start(time);
  osc.stop(time + 0.3);
}

function tick(g: NonNullable<ReturnType<typeof audioGraph>>, time: number, gain: number) {
  if (!bus) return;
  const { ctx, noise } = g;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 5200;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
  src.connect(filt);
  filt.connect(amp);
  amp.connect(bus);
  src.start(time, Math.random(), 0.05);
}

function schedule() {
  const g = audioGraph();
  if (!g || !bus) return;
  const now = g.ctx.currentTime;
  // a throttled background tab must not come back with a pile-up of late notes
  if (nextTime < now) nextTime = now + 0.06;

  while (nextTime < now + 0.4) {
    tension += (target - tension) * 0.07;
    const eighth = 60 / (62 + tension * 30) / 2;

    if (step % 2 === 0) pluck(g, nextTime, semis(DRONE[(step / 2) % 4]), 0.085);

    if (Math.random() < 0.1 + tension * 0.42) {
      degree = Math.min(9, Math.max(0, degree + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      const note = PENTATONIC[degree % 5] + 12 * Math.floor(degree / 5) + 12;
      bell(g, nextTime, semis(note), 0.05 + tension * 0.03);
    }
    if (tension > 0.5) {
      const drive = (tension - 0.5) * 2;
      if (step % 4 === 0) thump(g, nextTime, 0.1 + drive * 0.16);
      if (tension > 0.72 && step % 2 === 1) tick(g, nextTime, 0.03 + drive * 0.03);
    }
    step++;
    nextTime += eighth;
  }
}

export function startMusic() {
  const g = audioGraph();
  if (!g || running || !enabled) return;
  const { ctx } = g;
  running = true;

  bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 2.5);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.ratio.value = 6;
  bus.connect(limiter);
  limiter.connect(g.out);
  const send = ctx.createGain();
  send.gain.value = 0.3;
  bus.connect(send);
  send.connect(g.reverb);

  // a held open fifth under everything, breathing slowly
  const voices = [0, 7].map((n, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = semis(n);
    const amp = ctx.createGain();
    amp.gain.value = 0.028;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + i * 0.03;
    const depth = ctx.createGain();
    depth.gain.value = 0.014;
    lfo.connect(depth);
    depth.connect(amp.gain);
    osc.connect(amp);
    amp.connect(bus!);
    osc.start();
    lfo.start();
    return { osc, lfo };
  });
  pad = { stop: () => voices.forEach((v) => { v.osc.stop(); v.lfo.stop(); }) };

  nextTime = ctx.currentTime + 0.15;
  step = 0;
  timer = setInterval(schedule, 90);
}

export function stopMusic() {
  if (!running) return;
  running = false;
  clearInterval(timer);
  const g = audioGraph();
  const oldBus = bus;
  const oldPad = pad;
  bus = null;
  pad = null;
  if (g && oldBus) {
    const t = g.ctx.currentTime;
    oldBus.gain.cancelScheduledValues(t);
    oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value), t);
    oldBus.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    setTimeout(() => {
      oldPad?.stop();
      oldBus.disconnect();
    }, 900);
  }
}
