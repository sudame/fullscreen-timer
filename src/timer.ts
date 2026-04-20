export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerState {
  status: TimerStatus;
  remainingMs: number;
  totalMs: number;
}

export interface TimerCallbacks {
  onTick: (state: TimerState) => void;
  onFinish: () => void;
}

export class Timer {
  private totalMs = 0;
  private remainingMs = 0;
  private targetEndTime = 0;
  private status: TimerStatus = 'idle';
  private rafId: number | null = null;

  constructor(private callbacks: TimerCallbacks) {}

  load(ms: number): void {
    this.stopRaf();
    this.totalMs = ms;
    this.remainingMs = ms;
    this.status = 'paused';
    this.emit();
  }

  start(): void {
    if (this.status === 'running' || this.status === 'finished') return;
    if (this.remainingMs <= 0) return;
    this.targetEndTime = Date.now() + this.remainingMs;
    this.status = 'running';
    this.tick();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.stopRaf();
    this.remainingMs = Math.max(0, this.targetEndTime - Date.now());
    this.status = 'paused';
    this.emit();
  }

  toggle(): void {
    if (this.status === 'running') this.pause();
    else if (this.status === 'paused') this.start();
  }

  reset(): void {
    this.stopRaf();
    this.remainingMs = this.totalMs;
    this.status = this.totalMs > 0 ? 'paused' : 'idle';
    this.emit();
  }

  private tick = (): void => {
    if (this.status !== 'running') return;
    this.remainingMs = this.targetEndTime - Date.now();
    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.status = 'finished';
      this.stopRaf();
      this.emit();
      this.callbacks.onFinish();
      return;
    }
    this.emit();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private emit(): void {
    this.callbacks.onTick({
      status: this.status,
      remainingMs: this.remainingMs,
      totalMs: this.totalMs,
    });
  }
}

export function formatTime(ms: number): { text: string; hasHour: boolean } {
  const clamped = Math.max(0, ms);
  const total = Math.ceil(clamped / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return { text: `${h}:${pad(m)}:${pad(s)}`, hasHour: true };
  return { text: `${pad(m)}:${pad(s)}`, hasHour: false };
}

export function parseQueryMs(search: string): number | null {
  const q = new URLSearchParams(search);
  const m = Number.parseInt(q.get('m') ?? '', 10);
  const s = Number.parseInt(q.get('s') ?? '', 10);
  const mm = Number.isFinite(m) && m >= 0 ? m : 0;
  const ss = Number.isFinite(s) && s >= 0 && s < 60 ? s : 0;
  const total = mm * 60_000 + ss * 1000;
  return total > 0 ? total : null;
}
