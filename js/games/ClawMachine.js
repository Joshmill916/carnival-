// Claw Machine: top-down joystick-steered claw. Steer with the floating stick,
// tap DROP to descend. 5 attempts; grab prizes from a bin of 16–20 items.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const CLAW_SPEED = 330;
const GRAB_R = 48;
const DROP_TIME = 0.55;
const LIFT_TIME = 0.55;
const CLOSE_TIME = 0.35;
const DROPS = 5;

const PRIZE_POOL = [
  { emoji: '🧸', color: '#c98e63', pts: 2, w: 5, diff: 1.0 },
  { emoji: '🦆', color: '#ffd14d', pts: 2, w: 5, diff: 1.0 },
  { emoji: '🍬', color: '#ff8f4d', pts: 2, w: 5, diff: 1.0 },
  { emoji: '🐥', color: '#ffe14d', pts: 3, w: 4, diff: 1.0 },
  { emoji: '🎁', color: '#ff5d8f', pts: 3, w: 4, diff: 0.95 },
  { emoji: '🐶', color: '#b08868', pts: 3, w: 4, diff: 0.95 },
  { emoji: '🍩', color: '#ff9ec7', pts: 5, w: 3, diff: 0.9 },
  { emoji: '⭐', color: '#ffd14d', pts: 5, w: 3, diff: 0.85 },
  { emoji: '🎈', color: '#5b8cff', pts: 5, w: 2, diff: 0.85 },
  { emoji: '🤖', color: '#9aa3b2', pts: 7, w: 2, diff: 0.78 },
  { emoji: '🏆', color: '#ffcf3f', pts: 9, w: 1, diff: 0.66 },
  { emoji: '👑', color: '#ffe066', pts: 9, w: 1, diff: 0.62 },
  { emoji: '💎', color: '#7ce0ff', pts: 9, w: 1, diff: 0.6 },
];

export class ClawMachine extends MiniGame {
  static key = 'claw';
  static label = 'Claw Machine';

  init() {
    const W = this.view.w, H = this.view.h;
    this.attemptsLeft = DROPS;
    this.hint = 'Steer with the stick, tap DROP';

    // DROP button sits below the bin. Leave 36 px below it for the hint text.
    const btnW = 130, btnH = 58;
    this.dropBtn = {
      x: W / 2 - btnW / 2,
      y: H - btnH - 40,
      w: btnW,
      h: btnH,
    };

    // Bin fills the space above the button.
    const binPad = 14;
    this.bin = {
      x: binPad,
      y: 84,
      w: W - binPad * 2,
      h: this.dropBtn.y - 84 - 8,
    };

    // Claw starts at the center of the bin.
    this.clawX = this.bin.x + this.bin.w / 2;
    this.clawZ = this.bin.y + this.bin.h / 2;

    // Claw state machine: 'idle' | 'dropping' | 'grabbing' | 'lifting'
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.dropProgress = 0; // 0 = high up, 1 = at floor
    this.heldPrize = null;

    // Steering vector set each frame by handleInput and consumed in update.
    this._steerX = 0;
    this._steerY = 0;

    // Floating joystick visuals.
    this._joyBase = null;   // { x, y } or null
    this._joyKnob = { x: 0, y: 0 };

    // Drag tracking: did this drag start on the DROP button?
    this._dragOnBtn = false;
    this._wasDragging = false;

    // Drop-key debounce (space / enter).
    this._dropKeyWasDown = false;

    this._scatterPrizes();
  }

  _scatterPrizes() {
    const pool = [];
    for (const p of PRIZE_POOL) {
      for (let i = 0; i < p.w; i++) pool.push(p);
    }
    const count = 16 + Math.floor(this.rng() * 5); // 16–20
    const margin = 30;
    const b = this.bin;
    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      this.prizes.push({
        emoji: tmpl.emoji,
        color: tmpl.color,
        pts: tmpl.pts,
        diff: tmpl.diff,
        x: b.x + margin + this.rng() * (b.w - margin * 2),
        z: b.y + margin + this.rng() * (b.h - margin * 2),
        grabbed: false,
      });
    }
    // Larger z = closer to the viewer (bottom of bin). Sort ascending so nearer
    // prizes are drawn last (on top) for fake depth.
    this.prizes.sort((a, b2) => a.z - b2.z);
  }

  handleInput(input) {
    if (this.done) return;

    // Reset steering every frame; only set it when input is active.
    this._steerX = 0;
    this._steerY = 0;

    const drag = input.drag;
    const drop = this.dropBtn;

    // --- Floating joystick from drag state ---
    if (drag.active) {
      if (!this._wasDragging) {
        this._wasDragging = true;
        this._dragOnBtn =
          drag.startX >= drop.x && drag.startX <= drop.x + drop.w &&
          drag.startY >= drop.y && drag.startY <= drop.y + drop.h;
        this._joyBase = this._dragOnBtn ? null : { x: drag.startX, y: drag.startY };
      }
      if (!this._dragOnBtn && this._joyBase) {
        // Normalize to JOY_RADIUS, clamp magnitude to 1, apply deadzone.
        let dx = (drag.x - drag.startX) / JOY_RADIUS;
        let dy = (drag.y - drag.startY) / JOY_RADIUS;
        const mag = Math.hypot(dx, dy);
        if (mag > 1) { dx /= mag; dy /= mag; }
        if (Math.hypot(dx, dy) < JOY_DEADZONE) { dx = dy = 0; }
        this._steerX = dx;
        this._steerY = dy;

        // Knob visual position (clamped to JOY_RADIUS).
        const rawMag = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
        const clampedMag = Math.min(rawMag, JOY_RADIUS);
        const angle = rawMag > 0 ? Math.atan2(drag.y - drag.startY, drag.x - drag.startX) : 0;
        this._joyKnob = {
          x: this._joyBase.x + Math.cos(angle) * clampedMag,
          y: this._joyBase.y + Math.sin(angle) * clampedMag,
        };
      }
    } else {
      if (this._wasDragging) {
        this._wasDragging = false;
        this._dragOnBtn = false;
        this._joyBase = null;
      }
    }

    // --- Keyboard steering (overrides joystick when held) ---
    let kx = 0, ky = 0;
    if (input.keys.has('arrowleft') || input.keys.has('a')) kx -= 1;
    if (input.keys.has('arrowright') || input.keys.has('d')) kx += 1;
    if (input.keys.has('arrowup') || input.keys.has('w')) ky -= 1;
    if (input.keys.has('arrowdown') || input.keys.has('s')) ky += 1;
    const kmag = Math.hypot(kx, ky);
    if (kmag > 0) {
      if (kmag > 1) { kx /= kmag; ky /= kmag; }
      this._steerX = kx;
      this._steerY = ky;
    }

    // --- Tap on DROP button triggers a drop ---
    const g = input.consumeGesture();
    if (g && g.type === 'tap' && this.clawPhase === 'idle') {
      const inDrop =
        g.x >= drop.x && g.x <= drop.x + drop.w &&
        g.y >= drop.y && g.y <= drop.y + drop.h;
      if (inDrop) this._startDrop();
    }

    // --- Keyboard drop (space / enter) ---
    const dropKey = input.keys.has(' ') || input.keys.has('enter');
    if (dropKey && !this._dropKeyWasDown && this.clawPhase === 'idle') {
      this._startDrop();
    }
    this._dropKeyWasDown = dropKey;
  }

  _startDrop() {
    if (this.attemptsLeft <= 0 || this.clawPhase !== 'idle') return;
    this.clawPhase = 'dropping';
    this.clawT = 0;
    this.dropProgress = 0;
    this.heldPrize = null;
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);

    // Steer the claw horizontally only while idle.
    if (this.clawPhase === 'idle') {
      const b = this.bin;
      this.clawX = clamp(this.clawX + this._steerX * CLAW_SPEED * dt, b.x + 6, b.x + b.w - 6);
      this.clawZ = clamp(this.clawZ + this._steerY * CLAW_SPEED * dt, b.y + 6, b.y + b.h - 6);
    }

    this.clawT += dt;

    if (this.clawPhase === 'dropping') {
      this.dropProgress = Math.min(this.clawT / DROP_TIME, 1);
      if (this.clawT >= DROP_TIME) {
        this.clawPhase = 'grabbing';
        this.clawT = 0;
        this._tryGrab();
      }
    } else if (this.clawPhase === 'grabbing') {
      if (this.clawT >= CLOSE_TIME) {
        this.clawPhase = 'lifting';
        this.clawT = 0;
      }
    } else if (this.clawPhase === 'lifting') {
      this.dropProgress = Math.max(1 - this.clawT / LIFT_TIME, 0);
      if (this.clawT >= LIFT_TIME) {
        this._finishAttempt();
      }
    }
  }

  _tryGrab() {
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      const d = Math.hypot(p.x - this.clawX, p.z - this.clawZ);
      if (d < GRAB_R && d < bestD) { best = p; bestD = d; }
    }
    if (best) {
      const closeness = 1 - bestD / GRAB_R;
      const prob = (0.30 + 0.70 * closeness) * best.diff;
      if (this.rng() < prob) {
        this.heldPrize = best;
        best.grabbed = true;
        Audio.hit();
        return;
      }
    }
    Audio.fail();
  }

  _finishAttempt() {
    if (this.heldPrize) {
      const pts = this.heldPrize.pts;
      this.score += pts;
      this.hits++;
      this.particles.burst(this.clawX, this.clawZ, this.heldPrize.color, 14);
      this.particles.text(this.clawX, this.clawZ - 32, `+${pts}`, this.heldPrize.color, 22);
      if (pts >= 9) Audio.win(); else Audio.hit();
      this.heldPrize = null;
    }
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.dropProgress = 0;
    this.attempts++;
    this.attemptsLeft--;

    const allGrabbed = this.prizes.every((p) => p.grabbed);
    if (this.attemptsLeft <= 0 || allGrabbed) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const b = this.bin;

    // Background.
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(0, 0, W, H);

    // Marquee above the bin.
    const mqH = 28;
    ctx.fillStyle = '#b07cff';
    ctx.beginPath();
    ctx.roundRect(b.x, b.y - mqH - 2, b.w, mqH, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ CLAW MACHINE ★', b.x + b.w / 2, b.y - mqH / 2 - 2);

    // Bin outer wall.
    ctx.fillStyle = '#0d2040';
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.stroke();

    // Bin inner floor.
    ctx.fillStyle = '#111c34';
    ctx.beginPath();
    ctx.roundRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12, 7);
    ctx.fill();

    // Subtle grid for depth cue.
    ctx.strokeStyle = 'rgba(91,140,255,0.07)';
    ctx.lineWidth = 1;
    const rows = 5;
    for (let i = 1; i < rows; i++) {
      const rowY = b.y + 6 + ((b.h - 12) / rows) * i;
      ctx.beginPath();
      ctx.moveTo(b.x + 6, rowY);
      ctx.lineTo(b.x + b.w - 6, rowY);
      ctx.stroke();
    }

    // Drop shadow — shows where the claw will land. Shrinks as claw descends.
    const shadowR = 22 + (1 - this.dropProgress) * 12;
    ctx.save();
    ctx.globalAlpha = 0.22 + this.dropProgress * 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.clawX, this.clawZ, shadowR, shadowR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Prizes (sorted by z ascending; nearer/larger-z drawn last = on top).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.prizes) {
      if (p.grabbed && p !== this.heldPrize) continue;
      if (p === this.heldPrize) continue; // drawn with claw below
      const depth = (p.z - b.y) / b.h;
      const sz = Math.round(16 + depth * 8); // nearer prizes slightly larger
      ctx.save();
      ctx.globalAlpha = 0.65 + depth * 0.35;
      ctx.font = `${sz}px serif`;
      ctx.fillText(p.emoji, p.x, p.z);
      ctx.restore();
    }

    // Claw and (optionally) held prize.
    this._drawClaw(ctx);

    // DROP button.
    this._drawDropBtn(ctx);

    // Floating joystick (only when finger is down and not on the button).
    this._drawJoystick(ctx);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawClaw(ctx) {
    const x = this.clawX, z = this.clawZ;
    const isOpen = this.clawPhase === 'idle' || this.clawPhase === 'dropping';
    // Hub grows slightly as the claw descends (fake 3-D depth).
    const hub = 10 + this.dropProgress * 7;
    const prong = hub + (isOpen ? 14 : 5);

    ctx.save();
    ctx.strokeStyle = '#ccd0da';
    ctx.lineWidth = 3;
    // Three prongs at 120° angles (top prong points up).
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * hub * 0.55, z + Math.sin(angle) * hub * 0.55);
      ctx.lineTo(x + Math.cos(angle) * prong, z + Math.sin(angle) * prong);
      ctx.stroke();
    }
    // Central hub.
    ctx.fillStyle = '#9aa3b2';
    ctx.beginPath();
    ctx.arc(x, z, hub, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0e4f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Held prize floats below the claw prongs.
    if (this.heldPrize) {
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.heldPrize.emoji, x, z + prong + 14);
    }
    ctx.restore();
  }

  _drawDropBtn(ctx) {
    const btn = this.dropBtn;
    const active = this.clawPhase === 'idle' && !this.done;
    ctx.save();
    ctx.fillStyle = active ? '#ff5d8f' : '#2e2e52';
    ctx.strokeStyle = active ? '#ff9ec7' : '#44447a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#fff' : '#666';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP', btn.x + btn.w / 2, btn.y + btn.h / 2);
    ctx.restore();
  }

  _drawJoystick(ctx) {
    if (!this._joyBase) return;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this._joyBase.x, this._joyBase.y, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffd14d';
    ctx.beginPath();
    ctx.arc(this._joyKnob.x, this._joyKnob.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  getResult() {
    return {
      gameKey: 'claw',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: this.score >= 24,
      coinBonus: this.score >= 24 ? 15 : 0,
    };
  }
}
