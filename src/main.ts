import './global.css';
import setupStyles from './setup.module.css';
import timerStyles from './timer.module.css';
import {
  ensureAudio,
  playAlarm,
  stopAlarm,
  SOUNDS,
  getSoundId,
  setSoundId,
  previewSound,
  type SoundId,
} from './audio.ts';
import { Timer, formatTime, parseQueryMs, type TimerState } from './timer.ts';

type View = 'setup' | 'timer';

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app not found');
const app: HTMLDivElement = appEl;

// Install background layers once
(() => {
  const aurora = document.createElement('div');
  aurora.className = 'aurora';
  aurora.append(document.createElement('span'));
  const grid = document.createElement('div');
  grid.className = 'grid';
  const vignette = document.createElement('div');
  vignette.className = 'vignette';
  document.body.prepend(aurora, grid, vignette);
})();

let currentView: View = 'setup';
let hideControlsTimer: number | null = null;

const timer = new Timer({
  onTick: renderTimerState,
  onFinish: () => {
    playAlarm();
  },
});

function renderSetup(): void {
  currentView = 'setup';
  app.innerHTML = '';

  const root = document.createElement('div');
  root.className = setupStyles.root;

  const title = document.createElement('h1');
  title.className = setupStyles.title;
  title.textContent = 'FULLSCREEN TIMER';

  const inputs = document.createElement('div');
  inputs.className = setupStyles.inputs;

  const minField = makeField('25', 'MIN', 999);
  const sep = document.createElement('span');
  sep.className = setupStyles.separator;
  sep.textContent = ':';
  const secField = makeField('00', 'SEC', 59);

  inputs.append(minField.field, sep, secField.field);

  const startBtn = document.createElement('button');
  startBtn.className = setupStyles.start;
  startBtn.textContent = 'Start';
  startBtn.addEventListener('click', () => {
    const m = Math.max(0, Number.parseInt(minField.input.value, 10) || 0);
    const s = Math.max(0, Math.min(59, Number.parseInt(secField.input.value, 10) || 0));
    const ms = m * 60_000 + s * 1000;
    if (ms <= 0) {
      minField.input.focus();
      return;
    }
    ensureAudio();
    enterTimer(ms);
  });

  const soundPicker = makeSoundPicker();

  const hint = document.createElement('div');
  hint.className = setupStyles.hint;
  hint.innerHTML = 'Tip — try <kbd>?m=25</kbd> in the URL';

  root.append(title, inputs, soundPicker, startBtn, hint);
  app.append(root);

  minField.input.focus();
  minField.input.select();
}

function makeSoundPicker(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = setupStyles.soundPicker;

  const label = document.createElement('span');
  label.className = setupStyles.soundLabel;
  label.textContent = 'Alarm';

  const chips = document.createElement('div');
  chips.className = setupStyles.soundChips;

  const buttons: HTMLButtonElement[] = [];

  const sync = (activeId: SoundId) => {
    buttons.forEach((btn) => {
      const isActive = btn.dataset.soundId === activeId;
      btn.classList.toggle(setupStyles.active, isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  };

  for (const opt of SOUNDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = setupStyles.soundChip;
    btn.dataset.soundId = opt.id;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      ensureAudio();
      setSoundId(opt.id);
      sync(opt.id);
      previewSound(opt.id);
    });
    buttons.push(btn);
    chips.append(btn);
  }

  sync(getSoundId());

  wrap.append(label, chips);
  return wrap;
}

function makeField(defaultValue: string, unit: string, max: number): { field: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = setupStyles.field;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = String(max);
  input.value = defaultValue;
  input.inputMode = 'numeric';
  input.className = setupStyles.input;

  const unitEl = document.createElement('span');
  unitEl.className = setupStyles.unit;
  unitEl.textContent = unit;

  field.append(input, unitEl);
  return { field, input };
}

let displayEl: HTMLDivElement | null = null;
let controlsEl: HTMLDivElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;
let statusDotEl: HTMLSpanElement | null = null;
let statusLabelEl: HTMLSpanElement | null = null;
let progressFillEl: HTMLDivElement | null = null;

function renderTimer(): void {
  currentView = 'timer';
  app.innerHTML = '';

  const root = document.createElement('div');
  root.className = timerStyles.root;

  const status = document.createElement('div');
  status.className = timerStyles.statusBar;
  const statusDot = document.createElement('span');
  statusDot.className = timerStyles.statusDot;
  const statusLabel = document.createElement('span');
  statusLabel.textContent = 'READY';
  status.append(statusDot, statusLabel);
  statusDotEl = statusDot;
  statusLabelEl = statusLabel;

  const display = document.createElement('div');
  display.className = timerStyles.display;
  displayEl = display;

  const controls = document.createElement('div');
  controls.className = timerStyles.controls;
  controlsEl = controls;

  const toggle = makeCtrlButton('Pause', () => {
    timer.toggle();
    showControls();
  });
  toggle.classList.add(timerStyles.primary);
  toggleBtn = toggle;

  const reset = makeCtrlButton('Reset', () => {
    stopAlarm();
    timer.reset();
    showControls();
  });

  const back = makeCtrlButton('Back', () => {
    stopAlarm();
    timer.reset();
    renderSetup();
  });

  controls.append(toggle, reset, back);

  const progressTrack = document.createElement('div');
  progressTrack.className = timerStyles.progressTrack;
  const progressFill = document.createElement('div');
  progressFill.className = timerStyles.progressFill;
  progressTrack.append(progressFill);
  progressFillEl = progressFill;

  root.append(status, display, controls, progressTrack);
  app.append(root);
}

function makeCtrlButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = timerStyles.ctrlBtn;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderTimerState(state: TimerState): void {
  if (!displayEl || !toggleBtn || !statusDotEl || !statusLabelEl || !progressFillEl) return;

  const { text, hasHour } = formatTime(state.remainingMs);
  displayEl.textContent = text;
  displayEl.classList.toggle(timerStyles.hasHour, hasHour);
  displayEl.classList.toggle(timerStyles.finished, state.status === 'finished');
  displayEl.classList.toggle(timerStyles.paused, state.status === 'paused');

  // Status dot + label
  statusDotEl.classList.toggle(timerStyles.running, state.status === 'running');
  statusDotEl.classList.toggle(timerStyles.finished, state.status === 'finished');
  statusLabelEl.textContent =
    state.status === 'running' ? 'RUNNING' :
    state.status === 'paused' ? 'PAUSED' :
    state.status === 'finished' ? 'TIME\u2019S UP' :
    'READY';

  // Progress
  const ratio = state.totalMs > 0 ? state.remainingMs / state.totalMs : 0;
  progressFillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  progressFillEl.classList.toggle(timerStyles.finished, state.status === 'finished');

  // Button label
  toggleBtn.textContent = state.status === 'running' ? 'Pause' : 'Start';
  toggleBtn.disabled = state.status === 'finished';
}

function enterTimer(ms: number): void {
  renderTimer();
  timer.load(ms);
  timer.start();
}

function showControls(): void {
  if (!controlsEl) return;
  controlsEl.classList.add(timerStyles.visible);
  if (hideControlsTimer !== null) clearTimeout(hideControlsTimer);
  hideControlsTimer = window.setTimeout(() => {
    controlsEl?.classList.remove(timerStyles.visible);
  }, 2500);
}

document.addEventListener('mousemove', () => {
  if (currentView === 'timer') showControls();
});
document.addEventListener('touchstart', () => {
  if (currentView === 'timer') showControls();
}, { passive: true });

document.addEventListener('keydown', (e) => {
  if (currentView !== 'timer') return;
  if (e.code === 'Space') {
    e.preventDefault();
    timer.toggle();
    showControls();
  } else if (e.key === 'r' || e.key === 'R') {
    stopAlarm();
    timer.reset();
    showControls();
  } else if (e.key === 'Escape') {
    stopAlarm();
    timer.reset();
    renderSetup();
  }
});

// Bootstrap
const queryMs = parseQueryMs(window.location.search);
if (queryMs !== null) {
  ensureAudio();
  enterTimer(queryMs);
} else {
  renderSetup();
}
