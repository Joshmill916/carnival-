// Claw Machine — a side-view glass cabinet rendered with real depth (a pseudo-3D
// interior: receding perspective floor, back/side walls, prizes that scale and
// sort back-to-front, a metallic claw). Controls stay side-view: steer the claw
// left/right with the floating joystick (or A/D / arrows), tap DROP (or Space)
// to plunge. 5 drops; 16–20 weighted prizes; a near-miss lets the prize slip.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp, lerp, setGlow, clearGlow } from '../core/util.js';
import { drawSpace } from '../ui/Backdrop.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const CLAW_SPEED = 330;
const GRAB_R = 48;
const DROP_TIME = 0.55;
const LIFT_TIME = 0.55;
const CLOSE_TIME = 0.35;
const DROPS = 5;

// Neon palette (local, keeps the file self-contained).
const NEON_PINK = '#ff2d78';
const NEON_CYAN = '#00e5ff';
const NEON_PURPLE = '#b44fff';

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

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export class ClawMachine extends MiniGame {
  static key = 'claw';
  static label = 'Claw Machine';

  init() {
    const W = this.view.w, H = this.view.h;
    this.attemptsLeft = DROPS;
    this.hint = 'Steer left/right, tap DROP';

    const btnW = 140, btnH = 58;
    this.dropBtn = { x: W / 2 - btnW / 2, y: H - btnH - 40, w: btnW, h: btnH };

    const cabPad = 10;
    this.cab = { x: cabPad, y: 46, w: W - cabPad * 2, h: this.dropBtn.y - 46 - 8 };

    const topH = Math.round(this.cab.h * 0.17);
    this.railY = this.cab.y + topH - 6;

    // Glass interior (front opening of the box).
    this.pa = {
      x: this.cab.x + 6,
      y: this.cab.y + topH,
      w: this.cab.w - 12,
      h: this.cab.h - topH - 6,
    };

    // Perspective depth: the box recedes inward + upward toward the back.
    this.backInsetX = this.pa.w * 0.14;
    this.backRiseY = this.pa.h * 0.34;
    this.yFrontFloor = this.pa.y + this.pa.h - 10;
    this.yBackFloor = this.yFrontFloor - this.backRiseY;

    // Claw vertical travel + horizontal range.
    this.clawTopY = this.railY + 2;
    this.clawBottomY = this.yFrontFloor - 16;
    this.clawX = this.cab.x + this.cab.w / 2;
    this._clawMinX = this.cab.x + 24;
    this._clawMaxX = this.cab.x + this.cab.w - 24;

    this.clawPhase = 'idle'; // idle | dropping | grabbing | lifting
    this.clawT = 0;
    this.dropProgress = 0;
    this.heldPrize = null;

    this._steerX = 0;
    this._joyBase = null;
    this._joyKnob = { x: 0, y: 0 };
    this._dragOnBtn = false;
    this._wasDragging = false;
    this._dropKeyWasDown = false;

    this._slipPrize = null;
    this._slipT = 0;
    this._slipDur = 0.75;

    this._scatterPrizes();
  }

  // Project a horizontal fraction fx (0..1) and depth d (0 front..1 back) to the
  // screen, returning {sx, floorY, scale}.
  _project(fx, d) {
    const frontL = this.pa.x + 16, frontR = this.pa.x + this.pa.w - 16;
    const backL = frontL + this.backInsetX, backR = frontR - this.backInsetX;
    const leftAtD = lerp(frontL, backL, d);
    const rightAtD = lerp(frontR, backR, d);
    return {
      sx: lerp(leftAtD, rightAtD, fx),
      floorY: lerp(this.yFrontFloor, this.yBackFloor, d),
      scale: lerp(1.0, 0.62, d),
    };
  }

  _scatterPrizes() {
    const pool = [];
    for (const p of PRIZE_POOL) for (let i = 0; i < p.w; i++) pool.push(p);

    const count = 16 + Math.floor(this.rng() * 5);
    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      const fx = this.rng();
      const d = this.rng();
      const pileT = this.rng();
      const pr = this._project(fx, d);
      const lift = pileT * pileT * (this.pa.h * 0.16) * pr.scale; // pile toward floor
      this.prizes.push({
        emoji: tmpl.emoji, color: tmpl.color, pts: tmpl.pts, diff: tmpl.diff,
        d, scale: pr.scale,
        sx: pr.sx,
        sy: pr.floorY - lift - 11 * pr.scale,
        grabbed: false,
      });
    }
    // Painter's order: back (larger depth) first.
    this.prizes.sort((a, b) => b.d - a.d);
  }

  handleInput(input) {
    if (this.done) return;
    this._steerX = 0;
    const drag = input.drag;
    const drop = this.dropBtn;

    if (drag && drag.active) {
      if (!this._wasDragging) {
        this._wasDragging = true;
        this._dragOnBtn =
          drag.startX >= drop.x && drag.startX <= drop.x + drop.w &&
          drag.startY >= drop.y && drag.startY <= drop.y + drop.h;
        this._joyBase = this._dragOnBtn ? null : { x: drag.startX, y: drag.startY };
      }
      if (!this._dragOnBtn && this._joyBase) {
        let dx = (drag.x - drag.startX) / JOY_RADIUS;
        const dy = (drag.y - drag.startY) / JOY_RADIUS;
        const mag = Math.hypot(dx, dy);
        if (mag > 1) dx /= mag;
        if (Math.abs(dx) < JOY_DEADZONE) dx = 0;
        this._steerX = clamp(dx, -1, 1);
        const rawMag = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
        const cMag = Math.min(rawMag, JOY_RADIUS);
        const angle = rawMag > 0 ? Math.atan2(drag.y - drag.startY, drag.x - drag.startX) : 0;
        this._joyKnob = {
          x: this._joyBase.x + Math.cos(angle) * cMag,
          y: this._joyBase.y + Math.sin(angle) * cMag,
        };
      }
    } else if (this._wasDragging) {
      this._wasDragging = false;
      this._dragOnBtn = false;
      this._joyBase = null;
    }

    if (input.keys) {
      if (input.keys.has('arrowleft') || input.keys.has('a')) this._steerX = -1;
      if (input.keys.has('arrowright') || input.keys.has('d')) this._steerX = 1;
      const dropKey = input.keys.has(' ') || input.keys.has('enter');
      if (dropKey && !this._dropKeyWasDown && this.clawPhase === 'idle') this._startDrop();
      this._dropKeyWasDown = dropKey;
    }

    const g = input.consumeGesture ? input.consumeGesture() : null;
    if (g && g.type === 'tap' && this.clawPhase === 'idle') {
      if (g.x >= drop.x && g.x <= drop.x + drop.w && g.y >= drop.y && g.y <= drop.y + drop.h) {
        this._startDrop();
      }
    }
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

    if (this.clawPhase === 'idle') {
      this.clawX = clamp(this.clawX + this._steerX * CLAW_SPEED * dt, this._clawMinX, this._clawMaxX);
    }
    if (this._slipPrize) {
      this._slipT += dt;
      if (this._slipT >= this._slipDur) this._slipPrize = null;
    }

    this.clawT += dt;
    if (this.clawPhase === 'dropping') {
      this.dropProgress = Math.min(this.clawT / DROP_TIME, 1);
      if (this.clawT >= DROP_TIME) { this.clawPhase = 'grabbing'; this.clawT = 0; this._tryGrab(); }
    } else if (this.clawPhase === 'grabbing') {
      if (this.clawT >= CLOSE_TIME) { this.clawPhase = 'lifting'; this.clawT = 0; }
    } else if (this.clawPhase === 'lifting') {
      this.dropProgress = Math.max(1 - this.clawT / LIFT_TIME, 0);
      if (this.clawT >= LIFT_TIME) this._finishAttempt();
    }
  }

  _tryGrab() {
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      const d = Math.abs(p.sx - this.clawX);
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
      this._slipPrize = { emoji: best.emoji, x: best.sx, startY: this.clawBottomY };
      this._slipT = 0;
    }
    Audio.fail();
  }

  _finishAttempt() {
    if (this.heldPrize) {
      const pts = this.heldPrize.pts;
      this.score += pts;
      this.hits++;
      this.particles.burst(this.clawX, this.clawTopY + 20, this.heldPrize.color, 16, 200);
      this.particles.text(this.clawX, this.clawTopY, `+${pts}`, NEON_CYAN, 24);
      if (pts >= 9) Audio.win(); else Audio.hit();
      this.heldPrize = null;
    }
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.dropProgress = 0;
    this.attempts++;
    this.attemptsLeft--;
    const allGrabbed = this.prizes.every((p) => p.grabbed);
    if (this.attemptsLeft <= 0 || allGrabbed) { this.done = true; this.phase = 'done'; }
    else this.phase = 'aim';
  }

  // ---- rendering ----------------------------------------------------------
  render(ctx) {
    const W = this.view.w, H = this.view.h;
    drawSpace(ctx, W, H, this.t);

    this._drawMarquee(ctx);
    this._drawCabinet(ctx);
    this._drawInterior(ctx);
    this._drawAimGuide(ctx);
    this._drawPrizes(ctx);
    this._drawSlip(ctx);
    this._drawClaw(ctx);
    this._drawFrameDetails(ctx);
    this._drawDropBtn(ctx);
    this._drawJoystick(ctx);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawMarquee(ctx) {
    const cab = this.cab;
    setGlow(ctx, NEON_PINK, 16);
    ctx.fillStyle = NEON_PINK;
    rr(ctx, cab.x, 8, cab.w, 32, 8);
    ctx.fill();
    clearGlow(ctx);
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ CLAW MACHINE ★', this.view.w / 2, 24);
  }

  _drawCabinet(ctx) {
    const cab = this.cab;
    // Chrome frame.
    const grad = ctx.createLinearGradient(cab.x, 0, cab.x + cab.w, 0);
    grad.addColorStop(0, '#3a4060');
    grad.addColorStop(0.5, '#6a7290');
    grad.addColorStop(1, '#2e3450');
    ctx.fillStyle = grad;
    rr(ctx, cab.x, cab.y, cab.w, cab.h, 10);
    ctx.fill();
    // Neon edge glow.
    setGlow(ctx, NEON_CYAN, 14);
    ctx.strokeStyle = NEON_CYAN;
    ctx.lineWidth = 2;
    rr(ctx, cab.x, cab.y, cab.w, cab.h, 10);
    ctx.stroke();
    clearGlow(ctx);

    // Top mechanism housing.
    ctx.fillStyle = '#0e1430';
    rr(ctx, cab.x + 6, cab.y + 4, cab.w - 12, this.pa.y - cab.y - 2, 6);
    ctx.fill();
    // LED strip under the mechanism.
    setGlow(ctx, NEON_CYAN, 8);
    ctx.fillStyle = NEON_CYAN;
    ctx.fillRect(cab.x + 10, this.pa.y - 5, cab.w - 20, 2.5);
    clearGlow(ctx);

    // Rail bar.
    const railGrad = ctx.createLinearGradient(0, this.railY, 0, this.railY + 9);
    railGrad.addColorStop(0, '#cfd6ea');
    railGrad.addColorStop(0.45, '#8a93b0');
    railGrad.addColorStop(1, '#555d85');
    ctx.fillStyle = railGrad;
    rr(ctx, cab.x + 10, this.railY, cab.w - 20, 9, 3);
    ctx.fill();
  }

  // The pseudo-3D box: floor + back + side walls in perspective.
  _drawInterior(ctx) {
    const pa = this.pa;
    const frontL = pa.x + 4, frontR = pa.x + pa.w - 4;
    const backL = frontL + this.backInsetX, backR = frontR - this.backInsetX;
    const yTop = pa.y;
    const yFF = this.yFrontFloor, yBF = this.yBackFloor;

    // Back wall.
    ctx.fillStyle = '#0c1838';
    ctx.beginPath();
    ctx.moveTo(backL, yTop); ctx.lineTo(backR, yTop);
    ctx.lineTo(backR, yBF); ctx.lineTo(backL, yBF); ctx.closePath();
    ctx.fill();

    // Left wall.
    ctx.fillStyle = '#0a1430';
    ctx.beginPath();
    ctx.moveTo(frontL, yTop); ctx.lineTo(backL, yTop);
    ctx.lineTo(backL, yBF); ctx.lineTo(frontL, yFF); ctx.closePath();
    ctx.fill();
    // Right wall.
    ctx.beginPath();
    ctx.moveTo(frontR, yTop); ctx.lineTo(backR, yTop);
    ctx.lineTo(backR, yBF); ctx.lineTo(frontR, yFF); ctx.closePath();
    ctx.fill();

    // Perspective floor (lighter at the front, darker toward the back).
    const fg = ctx.createLinearGradient(0, yBF, 0, yFF);
    fg.addColorStop(0, '#0f1d44'); // darker at the back
    fg.addColorStop(1, '#1b346e'); // lighter at the front
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(frontL, yFF); ctx.lineTo(frontR, yFF);
    ctx.lineTo(backR, yBF); ctx.lineTo(backL, yBF); ctx.closePath();
    ctx.fill();

    // Glass front overlay (tint + shine) over the whole opening.
    ctx.save();
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 4);
    ctx.clip();
    ctx.fillStyle = 'rgba(60,120,200,0.10)';
    ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
    const shine = ctx.createLinearGradient(pa.x, 0, pa.x + pa.w * 0.22, 0);
    shine.addColorStop(0, 'rgba(255,255,255,0.12)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(pa.x, pa.y, pa.w * 0.22, pa.h);
    ctx.restore();

    // Glass frame.
    ctx.strokeStyle = 'rgba(0,229,255,0.5)';
    ctx.lineWidth = 1.5;
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 4);
    ctx.stroke();
  }

  _drawAimGuide(ctx) {
    if (this.clawPhase !== 'idle') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,230,0,0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(this.clawX, this.clawTopY + 16);
    ctx.lineTo(this.clawX, this.clawBottomY + 24);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawPrizes(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      // Soft shadow on the floor.
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy + 12 * p.scale, 13 * p.scale, 5 * p.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Emoji scaled by depth.
      ctx.font = `${Math.round(22 * p.scale)}px serif`;
      ctx.fillText(p.emoji, p.sx, p.sy);
    }
  }

  _drawSlip(ctx) {
    if (!this._slipPrize) return;
    const t = this._slipT, dur = this._slipDur, sp = this._slipPrize;
    const peakY = sp.startY - 55, endY = sp.startY + 26, pivot = dur * 0.32;
    let sy;
    if (t < pivot) sy = sp.startY + (peakY - sp.startY) * (t / pivot);
    else { const f = (t - pivot) / (dur - pivot); sy = peakY + (endY - peakY) * f * f; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t / dur);
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sp.emoji, sp.x, sy);
    ctx.restore();
  }

  _clawHeadY() {
    return this.clawTopY + this.dropProgress * (this.clawBottomY - this.clawTopY);
  }

  _drawClaw(ctx) {
    const cx = this.clawX;
    const headY = this._clawHeadY();
    const isOpen = this.clawPhase === 'idle' || this.clawPhase === 'dropping';

    // Floor shadow under the claw, tighter as it descends.
    const shR = 20 - this.dropProgress * 8;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, this.yFrontFloor - 2, shR, shR * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rail sliding block (metallic).
    const bg = ctx.createLinearGradient(0, this.railY - 1, 0, this.railY + 12);
    bg.addColorStop(0, '#cfd6ea');
    bg.addColorStop(1, '#555d85');
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#aab4cc';
    ctx.lineWidth = 1.5;
    rr(ctx, cx - 14, this.railY - 1, 28, 13, 3);
    ctx.fill();
    ctx.stroke();

    // Cable.
    ctx.strokeStyle = '#c8cee0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, this.railY + 12);
    ctx.lineTo(cx, headY);
    ctx.stroke();

    // Hub (radial metallic).
    const hubR = 10;
    const hg = ctx.createLinearGradient(cx - hubR, headY - hubR, cx + hubR, headY + hubR);
    hg.addColorStop(0, '#eef2ff');
    hg.addColorStop(0.5, '#9aa3c0');
    hg.addColorStop(1, '#5a6390');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(cx, headY, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dde3f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Three thick metallic prongs.
    const spread = isOpen ? 20 : 6;
    const prongLen = 28;
    for (const dir of [-1, 0, 1]) {
      const tipX = cx + dir * spread * 0.5;
      const baseX = cx + dir * hubR * 0.5;
      ctx.fillStyle = '#c2c9e0';
      ctx.strokeStyle = '#7c84a8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX - 3, headY + hubR * 0.6);
      ctx.quadraticCurveTo(cx + dir * spread, headY + hubR + prongLen * 0.6, tipX, headY + hubR + prongLen);
      ctx.quadraticCurveTo(cx + dir * spread + 3, headY + hubR + prongLen * 0.6, baseX + 3, headY + hubR * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Held prize dangles below.
    if (this.heldPrize) {
      ctx.font = '24px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.heldPrize.emoji, cx, headY + hubR + prongLen + 2);
    }
  }

  _drawFrameDetails(ctx) {
    const cab = this.cab;
    ctx.fillStyle = '#9aa3c0';
    for (const [bx, by] of [
      [cab.x + 11, cab.y + 11], [cab.x + cab.w - 11, cab.y + 11],
      [cab.x + 11, cab.y + cab.h - 11], [cab.x + cab.w - 11, cab.y + cab.h - 11],
    ]) {
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawDropBtn(ctx) {
    const b = this.dropBtn;
    const r = b.h / 2;
    const active = this.clawPhase === 'idle' && !this.done;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.45;
    const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    grad.addColorStop(0, NEON_PINK);
    grad.addColorStop(1, NEON_PURPLE);
    setGlow(ctx, NEON_PINK, active ? 16 : 4);
    ctx.fillStyle = grad;
    rr(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    clearGlow(ctx);
    ctx.fillStyle = '#fff';
    ctx.font = '700 22px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  _drawJoystick(ctx) {
    if (!this._joyBase) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this._joyBase.x, this._joyBase.y, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    setGlow(ctx, NEON_CYAN, 12);
    ctx.fillStyle = NEON_CYAN;
    ctx.beginPath();
    ctx.arc(this._joyKnob.x, this._joyKnob.y, 26, 0, Math.PI * 2);
    ctx.fill();
    clearGlow(ctx);
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
