// Unified input: keyboard + Pointer Events (touch and mouse share one path).
// Two modes the active scene selects:
//   'move'    → a floating virtual joystick (plus WASD/arrows) producing `move`.
//   'gesture' → a single-pointer drag/flick/tap recognizer for the mini-games.
import { clamp } from './util.js';

const JOY_RADIUS = 60; // px from base to full deflection
const JOY_DEADZONE = 0.18;
const TAP_MAX_DIST = 14; // px
const TAP_MAX_MS = 260;
const FLICK_WINDOW_MS = 90; // velocity sampled over the last ~90ms

export class Input {
  constructor(renderer) {
    this.renderer = renderer;
    this.mode = 'none';
    this.keys = new Set();

    // Movement output (read by the map): normalized vector, magnitude ≤ 1.
    this.move = { x: 0, y: 0 };

    // Joystick visual state (for rendering the on-screen stick).
    this.joy = { active: false, baseX: 0, baseY: 0, curX: 0, curY: 0 };
    this._joyId = null;

    // Gesture state.
    this.drag = { active: false, startX: 0, startY: 0, x: 0, y: 0, dx: 0, dy: 0 };
    this._gestureId = null;
    this._samples = []; // {x,y,t} for flick velocity
    this._downTime = 0;
    this._pendingGesture = null;

    this._bind();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    // Reset transient state on a mode switch.
    this.move.x = this.move.y = 0;
    this.joy.active = false;
    this._joyId = null;
    this.drag.active = false;
    this._gestureId = null;
    this._pendingGesture = null;
  }

  _bind() {
    const c = this.renderer.canvas;
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    c.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    c.addEventListener('pointermove', (e) => this._moveEvt(e), { passive: false });
    c.addEventListener('pointerup', (e) => this._up(e), { passive: false });
    c.addEventListener('pointercancel', (e) => this._up(e), { passive: false });
  }

  _down(e) {
    e.preventDefault();
    const p = this.renderer.toCanvas(e.clientX, e.clientY);
    if (this.mode === 'move' && this._joyId === null) {
      this._joyId = e.pointerId;
      this.joy.active = true;
      this.joy.baseX = p.x;
      this.joy.baseY = p.y;
      this.joy.curX = p.x;
      this.joy.curY = p.y;
    } else if (this.mode === 'gesture' && this._gestureId === null) {
      this._gestureId = e.pointerId;
      this.drag.active = true;
      this.drag.startX = this.drag.x = p.x;
      this.drag.startY = this.drag.y = p.y;
      this.drag.dx = this.drag.dy = 0;
      this._samples = [{ x: p.x, y: p.y, t: performance.now() }];
      this._downTime = performance.now();
    }
  }

  _moveEvt(e) {
    const p = this.renderer.toCanvas(e.clientX, e.clientY);
    if (e.pointerId === this._joyId) {
      e.preventDefault();
      this.joy.curX = p.x;
      this.joy.curY = p.y;
    } else if (e.pointerId === this._gestureId) {
      e.preventDefault();
      this.drag.x = p.x;
      this.drag.y = p.y;
      this.drag.dx = p.x - this.drag.startX;
      this.drag.dy = p.y - this.drag.startY;
      this._samples.push({ x: p.x, y: p.y, t: performance.now() });
      if (this._samples.length > 12) this._samples.shift();
    }
  }

  _up(e) {
    if (e.pointerId === this._joyId) {
      this._joyId = null;
      this.joy.active = false;
    } else if (e.pointerId === this._gestureId) {
      this._gestureId = null;
      this.drag.active = false;
      this._pendingGesture = this._classify();
    }
  }

  _classify() {
    const now = performance.now();
    const startX = this.drag.startX, startY = this.drag.startY;
    const endX = this.drag.x, endY = this.drag.y;
    const totalDist = Math.hypot(endX - startX, endY - startY);
    const heldMs = now - this._downTime;
    if (totalDist <= TAP_MAX_DIST && heldMs <= TAP_MAX_MS) {
      return { type: 'tap', x: endX, y: endY };
    }
    // Flick velocity from samples within the recent window.
    const recent = this._samples.filter((s) => now - s.t <= FLICK_WINDOW_MS);
    const a = recent[0] || this._samples[0];
    const b = recent[recent.length - 1] || this._samples[this._samples.length - 1];
    const dtSec = Math.max(0.001, (b.t - a.t) / 1000);
    const vx = (b.x - a.x) / dtSec;
    const vy = (b.y - a.y) / dtSec;
    return {
      type: 'flick',
      x: endX,
      y: endY,
      startX,
      startY,
      dx: endX - startX,
      dy: endY - startY,
      vx,
      vy,
      speed: Math.hypot(vx, vy),
      angle: Math.atan2(vy, vx),
    };
  }

  // Read-and-clear the last completed gesture (tap or flick).
  consumeGesture() {
    const g = this._pendingGesture;
    this._pendingGesture = null;
    return g;
  }

  // Called once per fixed update by the loop to compute the movement vector.
  sample() {
    if (this.mode !== 'move') {
      this.move.x = this.move.y = 0;
      return;
    }
    let x = 0, y = 0;
    if (this.joy.active) {
      let dx = (this.joy.curX - this.joy.baseX) / JOY_RADIUS;
      let dy = (this.joy.curY - this.joy.baseY) / JOY_RADIUS;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
      if (Math.hypot(dx, dy) < JOY_DEADZONE) {
        dx = dy = 0;
      }
      x = dx;
      y = dy;
    } else {
      // Keyboard fallback.
      if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
      if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
      if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
      if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;
      const mag = Math.hypot(x, y);
      if (mag > 1) {
        x /= mag;
        y /= mag;
      }
    }
    this.move.x = clamp(x, -1, 1);
    this.move.y = clamp(y, -1, 1);
  }
}
