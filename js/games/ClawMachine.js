// Claw Machine: side-view glass cabinet. Steer the claw left/right with the
// floating joystick, tap DROP to descend. 5 attempts; grab from 16–20 prizes.
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
    this.hint = 'Steer left/right, tap DROP';

    // DROP button at the bottom, leaving room for the hint text.
    const btnW = 130, btnH = 58;
    this.dropBtn = {
      x: W / 2 - btnW / 2,
      y: H - btnH - 40,
      w: btnW,
      h: btnH,
    };

    // Outer cabinet frame (silver/chrome surround).
    const cabPad = 10;
    this.cab = {
      x: cabPad,
      y: 46,
      w: W - cabPad * 2,
      h: this.dropBtn.y - 46 - 8,
    };

    // Top mechanism section (dark, houses the rail).
    const topH = Math.round(this.cab.h * 0.17);
    this.railY = this.cab.y + topH - 6;

    // Glass prize area (everything below the rail).
    this.prizeArea = {
      x: this.cab.x + 5,
      y: this.cab.y + topH,
      w: this.cab.w - 10,
      h: this.cab.h - topH,
    };

    // Claw Y travel: starts just below the rail, drops to the prize floor.
    this.clawTopY = this.railY + 2;
    this.clawBottomY = this.prizeArea.y + this.prizeArea.h - 28;

    // Claw starts at the horizontal centre.
    this.clawX = this.cab.x + this.cab.w / 2;
    const clawMinX = this.cab.x + 22;
    const clawMaxX = this.cab.x + this.cab.w - 22;
    this._clawMinX = clawMinX;
    this._clawMaxX = clawMaxX;

    // Phase state machine: 'idle' | 'dropping' | 'grabbing' | 'lifting'
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.dropProgress = 0; // 0 = top, 1 = bottom
    this.heldPrize = null;

    this._steerX = 0;
    this._joyBase = null;
    this._joyKnob = { x: 0, y: 0 };
    this._dragOnBtn = false;
    this._wasDragging = false;
    this._dropKeyWasDown = false;

    // Slip animation: prize briefly rises with the claw then falls back.
    this._slipPrize = null; // { emoji, x, startY }
    this._slipT = 0;
    this._slipDur = 0.75;

    this._scatterPrizes();
  }

  _scatterPrizes() {
    const pool = [];
    for (const p of PRIZE_POOL) {
      for (let i = 0; i < p.w; i++) pool.push(p);
    }
    const count = 16 + Math.floor(this.rng() * 5);
    const pa = this.prizeArea;
    const mX = 18;
    // Pile at the bottom: floor is the very bottom of the glass area.
    const floor = pa.y + pa.h - 14;
    const pileH = pa.h * 0.42; // pile fills the bottom 42 % of the cabinet

    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      const x = pa.x + mX + this.rng() * (pa.w - mX * 2);
      // Squared distribution: most prizes sit near the floor, a few on top.
      const t = this.rng();
      const y = floor - t * t * pileH;
      this.prizes.push({
        emoji: tmpl.emoji,
        color: tmpl.color,
        pts: tmpl.pts,
        diff: tmpl.diff,
        x,
        y,
        grabbed: false,
      });
    }
    // Draw from back of pile to front: higher-Y prizes (floor level) drawn first,
    // lower-Y prizes (top of pile) drawn on top.
    this.prizes.sort((a, b) => b.y - a.y);
  }

  handleInput(input) {
    if (this.done) return;

    this._steerX = 0;

    const drag = input.drag;
    const drop = this.dropBtn;

    // --- Floating joystick (drag that didn't start on the DROP button) ---
    if (drag.active) {
      if (!this._wasDragging) {
        this._wasDragging = true;
        this._dragOnBtn =
          drag.startX >= drop.x && drag.startX <= drop.x + drop.w &&
          drag.startY >= drop.y && drag.startY <= drop.y + drop.h;
        this._joyBase = this._dragOnBtn ? null : { x: drag.startX, y: drag.startY };
      }
      if (!this._dragOnBtn && this._joyBase) {
        // Normalize X component to JOY_RADIUS, clamp, apply deadzone.
        let dx = (drag.x - drag.startX) / JOY_RADIUS;
        const dy = (drag.y - drag.startY) / JOY_RADIUS;
        const mag = Math.hypot(dx, dy);
        if (mag > 1) dx /= mag;
        if (Math.abs(dx) < JOY_DEADZONE) dx = 0;
        this._steerX = clamp(dx, -1, 1);

        // Knob visual (full 2-D, clamped to JOY_RADIUS).
        const rawMag = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
        const cMag = Math.min(rawMag, JOY_RADIUS);
        const angle = rawMag > 0 ? Math.atan2(drag.y - drag.startY, drag.x - drag.startX) : 0;
        this._joyKnob = {
          x: this._joyBase.x + Math.cos(angle) * cMag,
          y: this._joyBase.y + Math.sin(angle) * cMag,
        };
      }
    } else {
      if (this._wasDragging) {
        this._wasDragging = false;
        this._dragOnBtn = false;
        this._joyBase = null;
      }
    }

    // --- Keyboard steering ---
    if (input.keys.has('arrowleft') || input.keys.has('a')) this._steerX = -1;
    if (input.keys.has('arrowright') || input.keys.has('d')) this._steerX = 1;

    // --- Tap DROP button ---
    const g = input.consumeGesture();
    if (g && g.type === 'tap' && this.clawPhase === 'idle') {
      const inDrop =
        g.x >= drop.x && g.x <= drop.x + drop.w &&
        g.y >= drop.y && g.y <= drop.y + drop.h;
      if (inDrop) this._startDrop();
    }

    // --- Keyboard drop (space / enter) ---
    const dropKey = input.keys.has(' ') || input.keys.has('enter');
    if (dropKey && !this._dropKeyWasDown && this.clawPhase === 'idle') this._startDrop();
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

    // Move claw horizontally only while idle.
    if (this.clawPhase === 'idle') {
      this.clawX = clamp(
        this.clawX + this._steerX * CLAW_SPEED * dt,
        this._clawMinX, this._clawMaxX,
      );
    }

    // Slip animation runs independently of the claw phase.
    if (this._slipPrize) {
      this._slipT += dt;
      if (this._slipT >= this._slipDur) this._slipPrize = null;
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
      if (this.clawT >= LIFT_TIME) this._finishAttempt();
    }
  }

  _tryGrab() {
    // Side-view: grab is based on horizontal proximity at the floor.
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      const d = Math.abs(p.x - this.clawX);
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
      // Near-miss: prize slips out — animate it rising then falling.
      this._slipPrize = { emoji: best.emoji, x: best.x, startY: this.clawBottomY };
      this._slipT = 0;
    }
    Audio.fail();
  }

  _finishAttempt() {
    if (this.heldPrize) {
      const pts = this.heldPrize.pts;
      this.score += pts;
      this.hits++;
      this.particles.burst(this.clawX, this.clawTopY + 20, this.heldPrize.color, 14);
      this.particles.text(this.clawX, this.clawTopY, `+${pts}`, this.heldPrize.color, 22);
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
    const cab = this.cab;
    const pa = this.prizeArea;

    // Background.
    ctx.fillStyle = '#0e0c1e';
    ctx.fillRect(0, 0, W, H);

    // Marquee sign above cabinet.
    ctx.fillStyle = '#b07cff';
    ctx.beginPath();
    ctx.roundRect(cab.x, 8, cab.w, 32, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ CLAW MACHINE ★', W / 2, 24);

    // Outer silver/chrome frame.
    const grad = ctx.createLinearGradient(cab.x, 0, cab.x + cab.w, 0);
    grad.addColorStop(0, '#b0b8cc');
    grad.addColorStop(0.05, '#dde3f0');
    grad.addColorStop(0.95, '#dde3f0');
    grad.addColorStop(1, '#8890a4');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#7880a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cab.x, cab.y, cab.w, cab.h, 8);
    ctx.fill();
    ctx.stroke();

    // Top mechanism section (dark interior).
    ctx.fillStyle = '#12203a';
    ctx.beginPath();
    ctx.roundRect(cab.x + 5, cab.y + 4, cab.w - 10, pa.y - cab.y - 2, 5);
    ctx.fill();

    // LED strip along bottom of mechanism section.
    ctx.fillStyle = '#3355ff';
    ctx.fillRect(cab.x + 8, pa.y - 5, cab.w - 16, 3);

    // Horizontal rail bar.
    const railGrad = ctx.createLinearGradient(0, this.railY, 0, this.railY + 9);
    railGrad.addColorStop(0, '#dde3f0');
    railGrad.addColorStop(0.4, '#9aa3b2');
    railGrad.addColorStop(1, '#6670a0');
    ctx.fillStyle = railGrad;
    ctx.beginPath();
    ctx.roundRect(cab.x + 8, this.railY, cab.w - 16, 9, 3);
    ctx.fill();

    // Glass prize area — blue-tinted window.
    ctx.fillStyle = 'rgba(18, 40, 90, 0.92)';
    ctx.strokeStyle = '#3355aa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pa.x, pa.y, pa.w, pa.h, 4);
    ctx.fill();
    ctx.stroke();

    // Glass shine (left edge reflection).
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pa.x, pa.y, pa.w, pa.h, 4);
    ctx.clip();
    const shineGrad = ctx.createLinearGradient(pa.x, 0, pa.x + pa.w * 0.18, 0);
    shineGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
    shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shineGrad;
    ctx.fillRect(pa.x, pa.y, pa.w * 0.18, pa.h);
    ctx.restore();

    // Aim guide: faint vertical line showing where claw will land.
    if (this.clawPhase === 'idle') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,80,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(this.clawX, this.clawTopY + 16);
      ctx.lineTo(this.clawX, this.clawBottomY + 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Prizes piled at the bottom (sorted back-to-front by Y).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '22px serif';
    for (const p of this.prizes) {
      if (p.grabbed && p !== this.heldPrize) continue;
      if (p === this.heldPrize) continue;
      ctx.fillText(p.emoji, p.x, p.y);
    }

    // Slipped prize: rises briefly then falls back into the bin.
    if (this._slipPrize) {
      const t = this._slipT, dur = this._slipDur;
      const sp = this._slipPrize;
      const peakY = sp.startY - 55;
      const endY = sp.startY + 30;
      const pivot = dur * 0.32;
      let sy;
      if (t < pivot) {
        sy = sp.startY + (peakY - sp.startY) * (t / pivot);
      } else {
        const fall = (t - pivot) / (dur - pivot);
        sy = peakY + (endY - peakY) * fall * fall;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / dur);
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sp.emoji, sp.x, sy);
      ctx.restore();
    }

    // Claw (cable + rail block + head + held prize).
    this._drawClaw(ctx);

    // Cabinet frame corners / bolts for realism.
    this._drawFrameDetails(ctx);

    // DROP button.
    this._drawDropBtn(ctx);

    // Floating joystick.
    this._drawJoystick(ctx);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _clawHeadY() {
    return this.clawTopY + this.dropProgress * (this.clawBottomY - this.clawTopY);
  }

  _drawClaw(ctx) {
    const cx = this.clawX;
    const headY = this._clawHeadY();
    const isOpen = this.clawPhase === 'idle' || this.clawPhase === 'dropping';

    ctx.save();

    // Rail sliding block.
    ctx.fillStyle = '#6670a0';
    ctx.strokeStyle = '#aab4cc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - 13, this.railY - 1, 26, 13, 3);
    ctx.fill();
    ctx.stroke();

    // Cable (solid line from block down to hub).
    ctx.strokeStyle = '#c8cee0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, this.railY + 12);
    ctx.lineTo(cx, headY);
    ctx.stroke();

    // Claw hub.
    const hubR = 9;
    ctx.fillStyle = '#8893a7';
    ctx.beginPath();
    ctx.arc(cx, headY, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dde3f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Three prongs hanging down (front view).
    const spread = isOpen ? 20 : 5;
    const prongLen = 26;
    ctx.strokeStyle = '#dde3f0';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';

    // Left prong — curves outward then hooks inward.
    ctx.beginPath();
    ctx.moveTo(cx - hubR * 0.5, headY + hubR);
    ctx.bezierCurveTo(
      cx - spread, headY + hubR + prongLen * 0.5,
      cx - spread * 0.8, headY + hubR + prongLen * 0.85,
      cx - spread * 0.4, headY + hubR + prongLen,
    );
    ctx.stroke();

    // Centre prong — straight down.
    ctx.beginPath();
    ctx.moveTo(cx, headY + hubR);
    ctx.lineTo(cx, headY + hubR + prongLen);
    ctx.stroke();

    // Right prong — mirrors left.
    ctx.beginPath();
    ctx.moveTo(cx + hubR * 0.5, headY + hubR);
    ctx.bezierCurveTo(
      cx + spread, headY + hubR + prongLen * 0.5,
      cx + spread * 0.8, headY + hubR + prongLen * 0.85,
      cx + spread * 0.4, headY + hubR + prongLen,
    );
    ctx.stroke();

    ctx.lineCap = 'butt';

    // Held prize dangles below the claw.
    if (this.heldPrize) {
      ctx.font = '24px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.heldPrize.emoji, cx, headY + hubR + prongLen + 4);
    }

    ctx.restore();
  }

  _drawFrameDetails(ctx) {
    const cab = this.cab;
    // Corner bolt dots for a machine-panel look.
    const bolts = [
      [cab.x + 10, cab.y + 10],
      [cab.x + cab.w - 10, cab.y + 10],
      [cab.x + 10, cab.y + cab.h - 10],
      [cab.x + cab.w - 10, cab.y + cab.h - 10],
    ];
    ctx.fillStyle = '#7880a0';
    for (const [bx, by] of bolts) {
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bottom trim strip.
    ctx.fillStyle = '#5b8cff';
    ctx.fillRect(cab.x + 5, cab.y + cab.h - 6, cab.w - 10, 4);
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
