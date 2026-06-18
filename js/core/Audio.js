// Synthesized WebAudio blips — no asset files. Lazily creates the AudioContext on
// the first user gesture (required by mobile browsers) and respects the mute flag.
import { State } from '../data/State.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
  }
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  // Unlock audio from the first tap (call from a pointer handler).
  unlock() {
    this._ensure();
  }
  _tone(freq, durMs, type = 'square', gain = 0.06) {
    if (State.s.settings.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000);
  }
  throw_() {
    this._tone(220, 90, 'sawtooth', 0.05);
  }
  hit() {
    this._tone(440, 70, 'square');
  }
  win() {
    this._tone(660, 90, 'square');
    setTimeout(() => this._tone(880, 120, 'square'), 90);
  }
  coin() {
    this._tone(990, 60, 'triangle', 0.05);
  }
  ui() {
    this._tone(520, 40, 'square', 0.04);
  }
  fail() {
    this._tone(160, 180, 'sawtooth', 0.05);
  }
  // Ascending arpeggio for a big win / level up.
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 160, 'square', 0.06), i * 110));
  }
  // Rising "wheee" as a ride spins up.
  spinUp() {
    const notes = [330, 392, 494, 587, 698];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 90, 'triangle', 0.04), i * 80));
  }
  // Airy descending swoosh when flung off a ride.
  whoosh() {
    this._tone(740, 220, 'sawtooth', 0.05);
    setTimeout(() => this._tone(420, 200, 'sawtooth', 0.04), 80);
  }
  // Low thud on landing.
  thud() {
    this._tone(120, 160, 'square', 0.07);
  }
  // Wet "splat" for a food-stall eruption.
  splat() {
    this._tone(200, 120, 'sawtooth', 0.06);
    setTimeout(() => this._tone(140, 120, 'square', 0.05), 50);
  }
  // Short high pop.
  pop() {
    this._tone(880, 60, 'triangle', 0.05);
  }
}

export const Audio = new AudioEngine();
