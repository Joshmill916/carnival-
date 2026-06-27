// Claw Machine — soft pastel, kid-friendly cabinet. Steer the claw left/right
// with the floating joystick (or A/D / arrows), tap GRAB to scoop. It ALWAYS
// catches a prize, wherever you drop it — pure feel-good. 5 grabs; the bin is
// packed with cute prizes.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const CLAW_SPEED = 330;
const DROP_TIME = 0.55;
const LIFT_TIME = 0.55;
const CLOSE_TIME = 0.35;
const DROPS = 5;

// Soft pastel palette.
const SKY_TOP = '#bfe8fb';
const SKY_BOT = '#fdeedf';
const PLAY_BG = '#fff8ec';
const FRAME = '#ffd6e8';
const FRAME_DK = '#f4a9c8';
const CLAW_PINK = '#f7aacd';
const CLAW_PINK_DK = '#e07ba8';
const GRAB_TOP = '#ff9ec7';
const GRAB_BOT = '#ff6fae';

const PRIZE_POOL = [
  { emoji: '🧸', color: '#f3d2b3', pts: 2, w: 5 },
  { emoji: '🦆', color: '#ffe9a8', pts: 2, w: 5 },
  { emoji: '🍬', color: '#ffd0a8', pts: 2, w: 5 },
  { emoji: '🐥', color: '#fff0a8', pts: 3, w: 4 },
  { emoji: '🎁', color: '#ffc2d8', pts: 3, w: 4 },
  { emoji: '🐶', color: '#e8cdb0', pts: 3, w: 4 },
  { emoji: '🍩', color: '#ffd5e6', pts: 5, w: 3 },
  { emoji: '⭐', color: '#fff0b0', pts: 5, w: 3 },
  { emoji: '🎈', color: '#bcd6ff', pts: 5, w: 2 },
  { emoji: '🐰', color: '#f0e6ff', pts: 7, w: 2 },
  { emoji: '🏆', color: '#ffe6a0', pts: 9, w: 1 },
  { emoji: '👑', color: '#fff0c0', pts: 9, w: 1 },
  { emoji: '💎', color: '#c8f0ff', pts: 9, w: 1 },
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
    this.hint = 'Steer left/right, tap GRAB — you always win!';

    const btnW = 150, btnH = 60;
    this.dropBtn = { x: W / 2 - btnW / 2, y: H - btnH - 38, w: btnW, h: btnH };

    const cabPad = 12;
    this.cab = { x: cabPad, y: 84, w: W - cabPad * 2, h: this.dropBtn.y - 84 - 10 };

    const topH = 40;
    this.railY = this.cab.y + topH;

    this.prizeArea = {
      x: this.cab.x + 8,
      y: this.cab.y + topH + 6,
      w: this.cab.w - 16,
      h: this.cab.h - topH - 14,
    };

    this.clawTopY = this.railY + 4;
    this.clawBottomY = this.prizeArea.y + this.prizeArea.h - 34;

    this.clawX = this.cab.x + this.cab.w / 2;
    this._clawMinX = this.cab.x + 30;
    this._clawMaxX = this.cab.x + this.cab.w - 30;

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

    this._scatterPrizes();
  }

  _scatterPrizes() {
    const pool = [];
    for (const p of PRIZE_POOL) for (let i = 0; i < p.w; i++) pool.push(p);

    const pa = this.prizeArea;
    const count = 24 + Math.floor(this.rng() * 7); // 24–30, packed
    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      this.prizes.push({
        emoji: tmpl.emoji,
        color: tmpl.color,
        pts: tmpl.pts,
        size: 30 + Math.floor(this.rng() * 8), // 30–38
        x: pa.x + 24 + this.rng() * (pa.w - 48),
        y: pa.y + 26 + this.rng() * (pa.h - 44),
        grabbed: false,
      });
    }
    // Draw top-to-bottom for a packed, overlapping look.
    this.prizes.sort((a, b) => a.y - b.y);
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

    this.clawT += dt;
    if (this.clawPhase === 'dropping') {
      this.dropProgress = Math.min(this.clawT / DROP_TIME, 1);
      if (this.clawT >= DROP_TIME) { this.clawPhase = 'grabbing'; this.clawT = 0; this._grab(); }
    } else if (this.clawPhase === 'grabbing') {
      if (this.clawT >= CLOSE_TIME) { this.clawPhase = 'lifting'; this.clawT = 0; }
    } else if (this.clawPhase === 'lifting') {
      this.dropProgress = Math.max(1 - this.clawT / LIFT_TIME, 0);
      if (this.heldPrize) { this.heldPrize.x = this.clawX; this.heldPrize.y = this._clawHeadY() + 30; }
      if (this.clawT >= LIFT_TIME) this._finishAttempt();
    }
  }

  // Always catches the nearest remaining prize — wherever the claw is.
  _grab() {
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      const d = Math.abs(p.x - this.clawX) + Math.abs(p.y - this.clawBottomY) * 0.25;
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      this.heldPrize = best;
      best.grabbed = true;
      Audio.hit();
    }
  }

  _finishAttempt() {
    if (this.heldPrize) {
      const pts = this.heldPrize.pts;
      this.score += pts;
      this.hits++;
      this.particles.burst(this.clawX, this.clawTopY + 18, this.heldPrize.color, 16, 200);
      this.particles.text(this.clawX, this.clawTopY, `+${pts}`, '#ff6fae', 24);
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
    const cab = this.cab, pa = this.prizeArea;

    // Soft pastel sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_BOT);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Cabinet body (white, rounded, soft pink frame).
    ctx.fillStyle = '#ffffff';
    rr(ctx, cab.x, cab.y, cab.w, cab.h, 22);
    ctx.fill();
    ctx.strokeStyle = FRAME_DK;
    ctx.lineWidth = 6;
    rr(ctx, cab.x, cab.y, cab.w, cab.h, 22);
    ctx.stroke();
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 2;
    rr(ctx, cab.x + 3, cab.y + 3, cab.w - 6, cab.h - 6, 19);
    ctx.stroke();

    // Rail bar.
    ctx.fillStyle = '#f4c6dc';
    rr(ctx, cab.x + 14, this.railY - 5, cab.w - 28, 8, 4);
    ctx.fill();

    // Play area (cream).
    ctx.fillStyle = PLAY_BG;
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 16);
    ctx.fill();

    // Clip prizes to the play area so the packed pile stays tidy.
    ctx.save();
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 16);
    ctx.clip();
    this._drawPrizes(ctx);
    ctx.restore();

    // Aim guide.
    if (this.clawPhase === 'idle') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,127,180,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(this.clawX, this.clawTopY + 14);
      ctx.lineTo(this.clawX, this.clawBottomY + 26);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    this._drawClaw(ctx);
    this._drawGrabBtn(ctx);
    this._drawJoystick(ctx);

    this.particles.render(ctx);
    this._drawHudPanels(ctx);
    this._drawHud(ctx);
  }

  _drawPrizes(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.prizes) {
      if (p.grabbed && p !== this.heldPrize) continue;
      if (p === this.heldPrize) continue;
      // Soft rounded backing blob.
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.62, 0, Math.PI * 2);
      ctx.fill();
      // Emoji.
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.emoji, p.x, p.y + 1);
    }
  }

  _clawHeadY() {
    return this.clawTopY + this.dropProgress * (this.clawBottomY - this.clawTopY);
  }

  _drawClaw(ctx) {
    const cx = this.clawX;
    const headY = this._clawHeadY();
    const open = this.clawPhase === 'idle' || this.clawPhase === 'dropping';

    // Cable.
    ctx.strokeStyle = '#d9a7c2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, this.railY);
    ctx.lineTo(cx, headY - 6);
    ctx.stroke();

    // Held prize (drawn first so the closed claw overlaps it a touch).
    if (this.heldPrize) {
      const hp = this.heldPrize;
      ctx.fillStyle = hp.color;
      ctx.beginPath();
      ctx.arc(cx, headY + 26, hp.size * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${hp.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hp.emoji, cx, headY + 27);
    }

    // Two big soft rounded arms (a friendly pincer). Drawn with a darker
    // outline pass under a pink fill pass.
    const spread = open ? 26 : 10;
    const armLen = 34;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [{ c: CLAW_PINK_DK, w: 16 }, { c: CLAW_PINK, w: 11 }]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, headY - 2);
        ctx.quadraticCurveTo(cx + dir * spread, headY + armLen * 0.55, cx + dir * (spread * 0.55), headY + armLen);
        ctx.stroke();
      }
    }
    // Rounded hub.
    ctx.fillStyle = CLAW_PINK;
    ctx.strokeStyle = CLAW_PINK_DK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, headY - 4, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }

  _drawGrabBtn(ctx) {
    const b = this.dropBtn;
    const r = b.h / 2;
    const active = this.clawPhase === 'idle' && !this.done;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.5;
    const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    grad.addColorStop(0, GRAB_TOP);
    grad.addColorStop(1, GRAB_BOT);
    ctx.fillStyle = grad;
    rr(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    rr(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, r - 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 24px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GRAB', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  _drawJoystick(ctx) {
    if (!this._joyBase) return;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this._joyBase.x, this._joyBase.y, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#ff8fbf';
    ctx.beginPath();
    ctx.arc(this._joyKnob.x, this._joyKnob.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Translucent panels so the shared white HUD text reads on the light bg.
  _drawHudPanels(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(90,40,80,0.55)';
    rr(ctx, 10, 46, this.view.w - 20, 30, 10);
    ctx.fill();
    if (this.hint) {
      ctx.fillStyle = 'rgba(90,40,80,0.5)';
      const w = Math.min(this.view.w - 24, 300);
      rr(ctx, this.view.w / 2 - w / 2, this.view.h - 42, w, 26, 12);
      ctx.fill();
    }
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
