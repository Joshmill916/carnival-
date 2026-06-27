// Claw Machine — a real top-down, joystick-steered grabber. Drag anywhere (off
// the DROP button) to raise a floating joystick that steers the claw in x and
// depth (screen y); tap DROP to plunge. WASD/arrows steer and Space/Enter drops
// on desktop. You get DROPS plunges; grabbing odds rise the better you line up
// and fall for the rarer, higher-value prizes. Extends MiniGame, key 'claw'.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const CLAW_SPEED = 330;   // px/s
const GRAB_R = 48;        // px reach around the claw
const DROP_TIME = 0.55;   // plunge down
const LIFT_TIME = 0.55;   // pull back up
const CLOSE_TIME = 0.35;  // prongs close
const DROPS = 5;

const CLAW_PAD = 26;      // keep the claw inside the bin walls

// Neon palette (kept local so the file stays self-contained).
const NEON_PINK = '#ff2d78';
const NEON_CYAN = '#00e5ff';
const NEON_YELLOW = '#ffe600';
const NEON_PURPLE = '#b44fff';

// Prize pool: emoji, color, points, spawn weight, grab difficulty (0–1; lower
// is harder, so the crown/diamond slip more often).
const POOL = [
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

function weightedPick(rng, pool) {
  let total = 0;
  for (const p of pool) total += p.w;
  let r = rng() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}
function noGlow(ctx) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

export class ClawMachine extends MiniGame {
  static key = 'claw';
  static label = 'Claw Machine';

  init() {
    this.attemptsLeft = DROPS;
    this.hint = 'Steer with the stick, tap DROP';
    this.t = 0;

    const W = this.view.w, H = this.view.h;

    // Top-down play bin.
    const margin = Math.min(40, W * 0.07);
    this.bin = {
      x: margin,
      y: H * 0.14,
      w: W - margin * 2,
      h: H * 0.58,
    };

    // DROP button (pill at the bottom center).
    const bw = 170, bh = 58;
    this.dropBtn = { x: W / 2 - bw / 2, y: H - bh - 26, w: bw, h: bh };

    // Claw starts at the bin center; h is plunge depth 0 (up) → 1 (down).
    this.claw = { x: this.bin.x + this.bin.w / 2, z: this.bin.y + this.bin.h / 2 };
    this.h = 0;
    this.state = 'idle'; // idle → dropping → grabbing → lifting
    this.stateT = 0;
    this.dropT = 0;
    this.grabbed = null;

    // Scatter prizes (depth-sorted by z for top-down overlap).
    const count = this.rng.int(16, 20);
    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const def = weightedPick(this.rng, POOL);
      this.prizes.push({
        emoji: def.emoji, color: def.color, pts: def.pts, diff: def.diff,
        x: this.rng.range(this.bin.x + 20, this.bin.x + this.bin.w - 20),
        z: this.rng.range(this.bin.y + 24, this.bin.y + this.bin.h - 16),
      });
    }
    this.prizes.sort((a, b) => a.z - b.z);

    // Transient input state.
    this.steerX = 0;
    this.steerZ = 0;
    this.joy = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 };
    this._wasDragging = false;
    this._dragOnButton = false;
    this._dropKeyDown = false;
  }

  _inDropBtn(x, y) {
    const b = this.dropBtn;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  handleInput(input) {
    this.steerX = 0;
    this.steerZ = 0;
    const steerable = this.state === 'idle' && !this.done;

    // Floating-joystick drag (only when we can steer and the drag did not start
    // on the DROP button).
    const drag = input.drag;
    if (steerable && drag && drag.active) {
      if (!this._wasDragging) {
        this._wasDragging = true;
        this._dragOnButton = this._inDropBtn(drag.startX, drag.startY);
      }
      if (!this._dragOnButton) {
        const vx = drag.x - drag.startX;
        const vy = drag.y - drag.startY;
        const mag = Math.hypot(vx, vy);
        const cm = Math.min(mag, JOY_RADIUS);
        const ux = mag > 0 ? vx / mag : 0;
        const uy = mag > 0 ? vy / mag : 0;
        this.joy = {
          active: true, baseX: drag.startX, baseY: drag.startY,
          knobX: drag.startX + ux * cm, knobY: drag.startY + uy * cm,
        };
        let nx = vx / JOY_RADIUS, ny = vy / JOY_RADIUS;
        const nmag = Math.hypot(nx, ny);
        if (nmag > 1) { nx /= nmag; ny /= nmag; }
        if (Math.hypot(nx, ny) < JOY_DEADZONE) { nx = 0; ny = 0; }
        this.steerX = nx;
        this.steerZ = ny;
      }
    } else {
      if (!(drag && drag.active)) { this._wasDragging = false; this._dragOnButton = false; }
      this.joy.active = false;
    }

    // Keyboard steering + drop.
    const k = input.keys;
    if (k) {
      if (steerable) {
        let kx = 0, kz = 0;
        if (k.has('arrowleft') || k.has('a')) kx -= 1;
        if (k.has('arrowright') || k.has('d')) kx += 1;
        if (k.has('arrowup') || k.has('w')) kz -= 1;
        if (k.has('arrowdown') || k.has('s')) kz += 1;
        if (kx || kz) {
          const m = Math.hypot(kx, kz);
          this.steerX = kx / m;
          this.steerZ = kz / m;
        }
      }
      const dropKey = k.has(' ') || k.has('enter') || k.has('spacebar');
      if (dropKey && !this._dropKeyDown) { this._dropKeyDown = true; this._startDrop(); }
      if (!dropKey) this._dropKeyDown = false;
    }

    // Tap on the DROP button.
    const g = input.consumeGesture ? input.consumeGesture() : null;
    if (g && g.type === 'tap' && this._inDropBtn(g.x, g.y)) this._startDrop();
  }

  _startDrop() {
    if (this.state !== 'idle' || this.done) return;
    this.state = 'dropping';
    this.dropT = 0;
    this.h = 0;
    this.joy.active = false;
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    this.t += dt;

    if (this.state === 'idle') {
      if (!this.done) {
        this.claw.x = clamp(
          this.claw.x + this.steerX * CLAW_SPEED * dt,
          this.bin.x + CLAW_PAD, this.bin.x + this.bin.w - CLAW_PAD);
        this.claw.z = clamp(
          this.claw.z + this.steerZ * CLAW_SPEED * dt,
          this.bin.y + CLAW_PAD, this.bin.y + this.bin.h - CLAW_PAD);
      }
    } else if (this.state === 'dropping') {
      this.dropT += dt;
      this.h = clamp(this.dropT / DROP_TIME, 0, 1);
      if (this.dropT >= DROP_TIME) {
        this.h = 1;
        this._evaluateGrab();
        this.state = 'grabbing';
        this.stateT = 0;
      }
    } else if (this.state === 'grabbing') {
      this.stateT += dt;
      if (this.stateT >= CLOSE_TIME) { this.state = 'lifting'; this.stateT = 0; }
    } else if (this.state === 'lifting') {
      this.stateT += dt;
      this.h = clamp(1 - this.stateT / LIFT_TIME, 0, 1);
      if (this.grabbed) { this.grabbed.x = this.claw.x; this.grabbed.z = this.claw.z; }
      if (this.stateT >= LIFT_TIME) { this.h = 0; this._finishDrop(); }
    }
  }

  _evaluateGrab() {
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      const d = Math.hypot(p.x - this.claw.x, p.z - this.claw.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.grabbed = null;
    if (best && bestD <= GRAB_R) {
      const closeness = 1 - bestD / GRAB_R;
      const prob = (0.30 + 0.70 * closeness) * best.diff;
      if (this.rng() < prob) this.grabbed = best;
    }
  }

  _finishDrop() {
    if (this.grabbed) {
      this.score += this.grabbed.pts;
      this.hits++;
      this.particles.burst(this.claw.x, this.claw.z, this.grabbed.color, 16, 200);
      this.particles.text(this.claw.x, this.claw.z - 30, `+${this.grabbed.pts}`, NEON_CYAN, 24);
      this.prizes = this.prizes.filter((p) => p !== this.grabbed);
      Audio.win();
    } else {
      Audio.fail();
    }
    this.grabbed = null;
    this.attempts++;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0 || this.prizes.length === 0) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.state = 'idle';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;

    // Deep-space backdrop.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0918');
    bg.addColorStop(1, '#13112a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const bin = this.bin;

    // Bin floor.
    ctx.fillStyle = '#0d0b1f';
    roundRect(ctx, bin.x, bin.y, bin.w, bin.h, 16);
    ctx.fill();

    // Neon bin walls.
    glow(ctx, NEON_CYAN, 14);
    ctx.strokeStyle = NEON_CYAN;
    ctx.lineWidth = 3;
    roundRect(ctx, bin.x, bin.y, bin.w, bin.h, 16);
    ctx.stroke();
    noGlow(ctx);

    // Marquee header.
    glow(ctx, NEON_PINK, 16);
    ctx.fillStyle = NEON_PINK;
    roundRect(ctx, bin.x, bin.y - 30, bin.w, 30, 8);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ CLAW MACHINE ★', bin.x + bin.w / 2, bin.y - 15);

    // Prizes (already z-sorted; draw shadow then body then emoji).
    for (const p of this.prizes) {
      if (p === this.grabbed) continue; // drawn with the claw
      this._drawPrize(ctx, p, p.x, p.z, 1);
    }

    // Claw + (optional) held prize.
    this._drawClaw(ctx);

    // DROP button.
    this._drawDropBtn(ctx);

    // Floating joystick.
    if (this.joy.active) this._drawJoystick(ctx);

    // Score / tries banner + hint.
    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawPrize(ctx, p, x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // Drop shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 14, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    glow(ctx, p.color, 10);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill();
    noGlow(ctx);
    // Emoji.
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, x, y + 1);
    ctx.restore();
  }

  _drawClaw(ctx) {
    const cx = this.claw.x, cz = this.claw.z;

    // Shadow on the bin floor — tighter as the claw plunges.
    const shadowR = 22 - this.h * 8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cz + 6, shadowR, shadowR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Held prize rides up with the claw.
    if (this.grabbed) this._drawPrize(ctx, this.grabbed, cx, cz, 1);

    // Cable.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, this.bin.y - 4);
    ctx.lineTo(cx, cz - 14);
    ctx.stroke();

    // Prongs: open while hovering, closed once grabbing/lifting.
    const closed = this.state === 'grabbing' || this.state === 'lifting';
    const spread = closed ? 6 : 16 - this.h * 6;
    glow(ctx, NEON_YELLOW, 12);
    ctx.strokeStyle = NEON_YELLOW;
    ctx.lineWidth = 3.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * spread * 0.4, cz - 14);
      ctx.lineTo(cx + i * spread, cz + 8);
      ctx.stroke();
    }
    // Hub.
    ctx.fillStyle = NEON_YELLOW;
    ctx.beginPath();
    ctx.arc(cx, cz - 14, 6, 0, Math.PI * 2);
    ctx.fill();
    noGlow(ctx);
  }

  _drawDropBtn(ctx) {
    const b = this.dropBtn;
    const r = b.h / 2;
    const enabled = this.state === 'idle' && !this.done;
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.45;
    const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    grad.addColorStop(0, NEON_PINK);
    grad.addColorStop(1, NEON_PURPLE);
    glow(ctx, NEON_PINK, enabled ? 16 : 4);
    ctx.fillStyle = grad;
    roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  _drawJoystick(ctx) {
    const j = this.joy;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    glow(ctx, NEON_CYAN, 12);
    ctx.fillStyle = NEON_CYAN;
    ctx.beginPath();
    ctx.arc(j.knobX, j.knobY, 26, 0, Math.PI * 2);
    ctx.fill();
    noGlow(ctx);
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
