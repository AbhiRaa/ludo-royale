"use client";

/**
 * Everything is synthesised with the Web Audio API — no sample files, so the
 * whole soundtrack costs zero network bytes and stays perfectly in sync.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuffer: AudioBuffer | null = null;

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("ludo.muted", next ? "1" : "0");
    } catch {
      /* storage disabled; the preference just will not persist */
    }
  }
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.02);
}

export function loadMutePreference() {
  if (typeof window === "undefined") return false;
  try {
    muted = localStorage.getItem("ludo.muted") === "1";
  } catch {
    muted = false;
  }
  return muted;
}

/** Must be called from a user gesture the first time. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;

  // a touch of room so it doesn't sound like a spreadsheet
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 0.9);
  const imp = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = imp.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  conv.buffer = imp;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  master.connect(ctx.destination);
  master.connect(wet);
  wet.connect(conv);
  conv.connect(ctx.destination);

  const nlen = Math.floor(ctx.sampleRate * 1.2);
  noiseBuffer = ctx.createBuffer(1, nlen, ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

type ToneOpts = {
  freq: number;
  to?: number;
  at?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
};

function tone({ freq, to, at = 0, dur = 0.18, type = "sine", gain = 0.3, attack = 0.005 }: ToneOpts) {
  if (!ctx || !master) return;
  const t = now() + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass") {
  if (!ctx || !master || !noiseBuffer) return;
  const t = now() + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.1);
}

export type Sfx =
  | "rattle" | "land" | "hop" | "capture" | "home"
  | "six" | "turn" | "win" | "lose" | "msg" | "join" | "blocked";

export function sfx(name: Sfx, variant = 0) {
  if (!ctx || muted) return;
  switch (name) {
    case "rattle":
      for (let i = 0; i < 5; i++) noise(i * 0.075 + Math.random() * 0.02, 0.06, 1900 + Math.random() * 1400, 3, 0.16);
      break;
    case "land":
      noise(0, 0.12, 620, 1.4, 0.3, "lowpass");
      tone({ freq: 168, to: 74, dur: 0.16, type: "triangle", gain: 0.3 });
      break;
    case "hop":
      tone({ freq: 460 + variant * 46, to: 720 + variant * 60, dur: 0.09, type: "triangle", gain: 0.17 });
      break;
    case "capture":
      tone({ freq: 210, to: 46, dur: 0.42, type: "sawtooth", gain: 0.3 });
      noise(0, 0.3, 380, 0.9, 0.34, "lowpass");
      tone({ freq: 880, to: 210, dur: 0.22, type: "square", gain: 0.09 });
      break;
    case "home":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, at: i * 0.075, dur: 0.3, type: "triangle", gain: 0.2 }),
      );
      break;
    case "six":
      tone({ freq: 1174.66, dur: 0.34, type: "sine", gain: 0.22 });
      tone({ freq: 1567.98, at: 0.055, dur: 0.32, type: "sine", gain: 0.15 });
      break;
    case "turn":
      tone({ freq: 640, to: 880, dur: 0.09, type: "sine", gain: 0.13 });
      break;
    case "blocked":
      tone({ freq: 300, to: 150, dur: 0.24, type: "square", gain: 0.11 });
      break;
    case "win":
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone({ freq: f, at: i * 0.1, dur: 0.85, type: "triangle", gain: 0.22 }),
      );
      [261.63, 392, 523.25].forEach((f) => tone({ freq: f, at: 0.5, dur: 1.5, type: "sine", gain: 0.16 }));
      break;
    case "lose":
      [392, 349.23, 293.66, 261.63].forEach((f, i) =>
        tone({ freq: f, at: i * 0.16, dur: 0.5, type: "triangle", gain: 0.16 }),
      );
      break;
    case "msg":
      tone({ freq: 920, to: 1180, dur: 0.1, type: "sine", gain: 0.14 });
      break;
    case "join":
      tone({ freq: 587.33, dur: 0.16, type: "triangle", gain: 0.19 });
      tone({ freq: 880, at: 0.11, dur: 0.26, type: "triangle", gain: 0.19 });
      break;
  }
}
