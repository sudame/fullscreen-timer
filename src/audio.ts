import gongUrl from './assets/gong.mp3';

export type SoundId = 'chime' | 'gong' | 'bell';

export interface SoundOption {
  id: SoundId;
  label: string;
  repeats: number;
  gapSec: number;
  playOne: (ctx: AudioContext, startOffsetSec: number) => void;
}

const STORAGE_KEY = 'fst.soundId';

let ctx: AudioContext | null = null;
let scheduledNodes: { node: AudioScheduledSourceNode; gain: GainNode }[] = [];
let repeatTimers: number[] = [];

export function ensureAudio(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
  if (ctx) void loadGongBuffer(ctx);
}

let gongBuffer: AudioBuffer | null = null;
let gongLoading: Promise<AudioBuffer> | null = null;

function loadGongBuffer(c: AudioContext): Promise<AudioBuffer> {
  if (gongBuffer) return Promise.resolve(gongBuffer);
  if (!gongLoading) {
    gongLoading = fetch(gongUrl)
      .then((r) => r.arrayBuffer())
      .then((ab) => c.decodeAudioData(ab))
      .then((buf) => {
        gongBuffer = buf;
        return buf;
      });
  }
  return gongLoading;
}

function track(node: AudioScheduledSourceNode, gain: GainNode): void {
  scheduledNodes.push({ node, gain });
}

// ---- Chime: soft ascending triangle-wave arpeggio (C5 → E5 → G5) ----
function chimeNote(c: AudioContext, freq: number, startOffset: number, duration: number, peak: number): void {
  const start = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const attack = 0.04;
  const release = duration * 0.85;

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);

  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + attack + release + 0.05);
  track(osc, gain);
}

function playChime(c: AudioContext, t0: number): void {
  chimeNote(c, 523.25, t0 + 0.00, 0.9, 0.18);
  chimeNote(c, 659.25, t0 + 0.18, 0.9, 0.16);
  chimeNote(c, 783.99, t0 + 0.36, 1.4, 0.14);
}

// ---- Gong (銅鑼): plays the provided mp3 sample ----
function playGong(c: AudioContext, t0: number): void {
  const schedule = (buf: AudioBuffer) => {
    const start = c.currentTime + t0;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(1.0, start);
    src.connect(gain).connect(c.destination);
    src.start(start);
    src.stop(start + buf.duration + 0.05);
    track(src, gain);
  };
  if (gongBuffer) {
    schedule(gongBuffer);
  } else {
    // If not yet loaded, play as soon as decoding finishes
    loadGongBuffer(c).then(schedule).catch(() => { /* ignore */ });
  }
}

// ---- Bell: bright, harmonic with inharmonic "strike" partial ----
function playBell(c: AudioContext, t0: number): void {
  const start = c.currentTime + t0;
  const fundamental = 659.25; // E5
  const partials = [
    { ratio: 0.5,  gain: 0.08, decay: 2.6 },
    { ratio: 1.0,  gain: 0.22, decay: 2.4 },
    { ratio: 2.0,  gain: 0.11, decay: 1.8 },
    { ratio: 2.76, gain: 0.08, decay: 1.2 },
    { ratio: 5.4,  gain: 0.04, decay: 0.7 },
  ];
  for (const p of partials) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = fundamental * p.ratio;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(p.gain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + p.decay);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + p.decay + 0.05);
    track(osc, gain);
  }
}

export const SOUNDS: SoundOption[] = [
  { id: 'chime', label: 'Chime', repeats: 3, gapSec: 2.2, playOne: playChime },
  { id: 'gong',  label: 'Gong',  repeats: 1, gapSec: 0,   playOne: playGong  },
  { id: 'bell',  label: 'Bell',  repeats: 3, gapSec: 2.6, playOne: playBell  },
];

let currentId: SoundId = loadSoundId();

function loadSoundId(): SoundId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SOUNDS.some((s) => s.id === saved)) return saved as SoundId;
  } catch {
    // localStorage may be unavailable
  }
  return 'chime';
}

export function getSoundId(): SoundId {
  return currentId;
}

export function setSoundId(id: SoundId): void {
  if (!SOUNDS.some((s) => s.id === id)) return;
  currentId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function previewSound(id: SoundId): void {
  if (!ctx) return;
  stopAlarm();
  const opt = SOUNDS.find((s) => s.id === id);
  if (!opt) return;
  opt.playOne(ctx, 0);
}

export function playAlarm(): void {
  if (!ctx) return;
  stopAlarm();
  const opt = SOUNDS.find((s) => s.id === currentId) ?? SOUNDS[0];
  if (!opt) return;
  for (let i = 0; i < opt.repeats; i++) {
    opt.playOne(ctx, i * opt.gapSec);
  }
}

export function stopAlarm(): void {
  repeatTimers.forEach((id) => clearTimeout(id));
  repeatTimers = [];
  if (ctx) {
    const now = ctx.currentTime;
    for (const { node, gain } of scheduledNodes) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        node.stop(now + 0.08);
      } catch {
        // already stopped
      }
    }
  }
  scheduledNodes = [];
}
