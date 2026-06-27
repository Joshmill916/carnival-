// Claw Machine — front-view pastel cabinet with a real challenge. A floating
// joystick flies the claw freely in 2D (left/right + up/down); drive it down
// into the pile of prizes heaped at the bottom, then tap GRAB to close and
// lift. Grabbing is NOT a sure thing: you must centre on a prize, the rare
// high-value ones are slippery, and a weak grip slips on the way up — the fun
// of "barely grabbing one". 5 grabs. WASD/arrows + Space/Enter on desktop.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp, lerp } from '../core/util.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const CLAW_SPEED = 320;     // px/s
const CLOSE_TIME = 0.32;    // prongs close
const LIFT_TIME = 0.75;     // rise back to the top
const GRAB_R = 46;          // how near a prize must be to catch it
const PRONG_REACH = 30;     // how far a held prize hangs below the hub
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

// pts → how easy the prize is to keep (higher = grippier). Rare high-value
// prizes are slippery, so they slip out of the claw more often.
const GRIP_BY_PTS = { 2: 0.95, 3: 0.85, 5: 0.70, 7: 0.55, 9: 0.42 };

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
    this.hint = 'Joystick to fly the claw • GRAB to grab';

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
    this.floorY = this.prizeArea.y + this.prizeArea.h - 16;

    // The claw flies freely in this box.
    this._clawMinX = this.cab.x + 34;
    this._clawMaxX = this.cab.x + this.cab.w - 34;
    this.clawTopY = this.railY + 18;
    this._clawMinY = this.clawTopY;
    this._clawMaxY = this.floorY - 8;
    this.clawX = (this._clawMinX + this._clawMaxX) / 2;
    this.clawY = this.clawTopY;

    this.clawPhase = 'idle'; // idle | grabbing | lifting
    this.clawT = 0;
    this._liftStartY = this.clawTopY;
    this.heldPrize = null;
    this._willSlip = false;
    this.slipping = null;

    this._steerX = 0;
    this._steerY = 0;
    this._joyBase = null;
    this._joyKnob = { x: 0, y: 0 };
    this._dragOnBtn = false;
    this._wasDragging = false;
    this._grabKeyWasDown = false;

    this._scatterPrizes();
  }

  _scatterPrizes() {
    const pool = [];
    for (const p of PRIZE_POOL) for (let i = 0; i < p.w; i++) pool.push(p);

    const pa = this.prizeArea;
    const count = 13 + Math.floor(this.rng() * 5); // 13–17 big prizes
    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      // Heap toward the floor (t² bias) and toward the centre (avg of 3 → mound).
      const t = this.rng();
      const cxBias = (this.rng() + this.rng() + this.rng()) / 3;
      this.prizes.push({
        emoji: tmpl.emoji,
        color: tmpl.color,
        pts: tmpl.pts,
        grip: GRIP_BY_PTS[tmpl.pts] ?? 0.7,
        size: 44 + Math.floor(this.rng() * 14), // 44–58, big
        x: pa.x + 34 + cxBias * (pa.w - 68),
        y: this.floorY - t * t * (pa.h * 0.5),
        grabbed: false,
        vy: 0,
      });
    }
    // Lower prizes (nearer the floor/front) drawn last, on top.
    this.prizes.sort((a, b) => a.y - b.y);
  }

  handleInput(input) {
    if (this.done) return;
    this._steerX = 0;
    this._steerY = 0;
    const drag = input.drag;
    const drop = this.dropBtn;
    const canMove = this.clawPhase === 'idle';

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
        let dy = (drag.y - drag.startY) / JOY_RADIUS;
        const mag = Math.hypot(dx, dy);
        if (mag > 1) { dx /= mag; dy /= mag; }
        if (Math.hypot(dx, dy) < JOY_DEADZONE) { dx = 0; dy = 0; }
        if (canMove) { this._steerX = clamp(dx, -1, 1); this._steerY = clamp(dy, -1, 1); }
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
      if (canMove) {
        if (input.keys.has('arrowleft') || input.keys.has('a')) this._steerX = -1;
        if (input.keys.has('arrowright') || input.keys.has('d')) this._steerX = 1;
        if (input.keys.has('arrowup') || input.keys.has('w')) this._steerY = -1;
        if (input.keys.has('arrowdown') || input.keys.has('s')) this._steerY = 1;
      }
      const grabKey = input.keys.has(' ') || input.keys.has('enter');
      if (grabKey && !this._grabKeyWasDown) this._startGrab();
      this._grabKeyWasDown = grabKey;
    }

    const g = input.consumeGesture ? input.consumeGesture() : null;
    if (g && g.type === 'tap' && this.clawPhase === 'idle') {
      if (g.x >= drop.x && g.x <= drop.x + drop.w && g.y >= drop.y && g.y <= drop.y + drop.h) {
        this._startGrab();
      }
    }
  }

  _startGrab() {
    if (this.attemptsLeft <= 0 || this.clawPhase !== 'idle') return;
    this.clawPhase = 'grabbing';
    this.clawT = 0;
    this._joyBase = null;
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);

    // A slipped prize tumbling back into the pile (runs in any phase).
    if (this.slipping) {
      const s = this.slipping;
      s.vy += 1100 * dt;
      s.y += s.vy * dt;
      if (s.y >= this.floorY - 6) {
        s.y = this.floorY - 6;
        s.vy = 0;
        s.grabbed = false;
        this.slipping = null;
      }
    }

    if (this.clawPhase === 'idle') {
      this.clawX = clamp(this.clawX + this._steerX * CLAW_SPEED * dt, this._clawMinX, this._clawMaxX);
      this.clawY = clamp(this.clawY + this._steerY * CLAW_SPEED * dt, this._clawMinY, this._clawMaxY);
      return;
    }

    this.clawT += dt;
    if (this.clawPhase === 'grabbing') {
      if (this.clawT >= CLOSE_TIME) {
        this._doGrab();
        this._liftStartY = this.clawY;
        this.clawPhase = 'lifting';
        this.clawT = 0;
      }
    } else if (this.clawPhase === 'lifting') {
      const prog = Math.min(1, this.clawT / LIFT_TIME);
      this.clawY = lerp(this._liftStartY, this.clawTopY, prog);
      if (this.heldPrize) {
        this.heldPrize.x = this.clawX;
        this.heldPrize.y = this.clawY + PRONG_REACH;
        // Weak grip: the prize slips out partway up — the heartbreak near-miss.
        if (this._willSlip && prog >= 0.55) {
          this.slipping = this.heldPrize;
          this.slipping.vy = 30;
          this.heldPrize = null;
          this._willSlip = false;
          Audio.fail();
        }
      }
      if (prog >= 1) this._finishGrab();
    }
  }

  _doGrab() {
    const gx = this.clawX, gy = this.clawY + 10;
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      const d = Math.hypot(p.x - gx, p.y - gy);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.heldPrize = null;
    this._willSlip = false;
    if (best && bestD <= GRAB_R) {
      const centering = clamp(1 - bestD / GRAB_R, 0, 1);
      const grip = centering * best.grip;
      best.grabbed = true;
      this.heldPrize = best;
      this._willSlip = this.rng() >= grip; // keep when rng() < grip
      Audio.hit();
    } else {
      Audio.fail();
    }
  }

  _finishGrab() {
    if (this.heldPrize) {
      const pts = this.heldPrize.pts;
      this.score += pts;
      this.hits++;
      this.particles.burst(this.clawX, this.clawTopY + 16, this.heldPrize.color, 18, 220);
      this.particles.text(this.clawX, this.clawTopY, `+${pts}`, '#ff5fa6', 26);
      this.prizes = this.prizes.filter((p) => p !== this.heldPrize);
      if (pts >= 9) Audio.win(); else Audio.hit();
      this.heldPrize = null;
    }
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.attempts++;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0 || this.prizes.length === 0) {
      this.done = true;
      this.phase = 'done';
    }
  }

  // ---- rendering ----------------------------------------------------------
  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const cab = this.cab, pa = this.prizeArea;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_BOT);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Cabinet body.
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

    // Top rail.
    ctx.fillStyle = '#f4c6dc';
    rr(ctx, cab.x + 14, this.railY - 5, cab.w - 28, 8, 4);
    ctx.fill();

    // Glass play area + piled prizes (clipped).
    ctx.fillStyle = PLAY_BG;
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 16);
    ctx.fill();
    ctx.save();
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 16);
    ctx.clip();
    this._drawPrizes(ctx);
    this._drawClaw(ctx);
    ctx.restore();

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
      if (p === this.heldPrize) continue; // drawn with the claw
      // soft backing blob + big emoji
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.emoji, p.x, p.y + 1);
    }
    if (this.heldPrize) this._drawOnePrize(ctx, this.heldPrize);
  }

  _drawOnePrize(ctx, p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, p.x, p.y + 1);
  }

  _drawClaw(ctx) {
    const cx = this.clawX, cy = this.clawY;
    // Trolley on the rail tracks X; cable drops to the claw.
    ctx.fillStyle = '#e79ec0';
    rr(ctx, cx - 16, this.railY - 6, 32, 12, 4);
    ctx.fill();
    ctx.strokeStyle = '#d9a7c2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, this.railY + 6);
    ctx.lineTo(cx, cy - 12);
    ctx.stroke();

    // Held prize hangs below.
    if (this.heldPrize) this._drawOnePrize(ctx, this.heldPrize);

    // Close amount: open while flying, shut once grabbing/lifting.
    let close = 0;
    if (this.clawPhase === 'grabbing') close = Math.min(1, this.clawT / CLOSE_TIME);
    else if (this.clawPhase === 'lifting') close = 1;
    const spread = lerp(26, 9, close);
    const armLen = 34;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [{ c: CLAW_PINK_DK, w: 16 }, { c: CLAW_PINK, w: 11 }]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10);
        ctx.quadraticCurveTo(cx + dir * spread, cy + armLen * 0.55, cx + dir * (spread * 0.55), cy + armLen);
        ctx.stroke();
      }
    }
    // Hub.
    ctx.fillStyle = CLAW_PINK;
    ctx.strokeStyle = CLAW_PINK_DK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 13, 0, Math.PI * 2);
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
      const w = Math.min(this.view.w - 24, 320);
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
