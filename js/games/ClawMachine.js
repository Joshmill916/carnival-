// Claw Machine — plays like the real thing. The claw hangs at the top of a
// cabinet stuffed with prizes. The joystick moves it left/right and
// front/back (push UP to send it toward the back); its shadow on the pile
// shows where it will land. Tap GRAB (or let the 15-second timer run out) and
// it drops on its own, closes, lifts with a jolt at the top, and carries
// whatever it holds back to the chute in the front corner — then returns home.
// Like a real machine the grip is iffy: the claw's strength varies from try to
// try, off-centre grabs are weak, rare prizes are slippery, and a loose prize
// can slip at the top or drop on the way to the chute (if it drops over the
// chute, you still win it!). 5 tries. WASD/arrows + Space/Enter on desktop.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp, lerp } from '../core/util.js';
import { rr, drawBulbRow, safeTop } from '../ui/BoothStage.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const MOVE_X = 230;         // px/s left/right
const MOVE_D = 0.85;        // depth units/s front/back (0 = front glass, 1 = back wall)
const DEPTH_PX = 120;       // how much higher on screen the back of the floor is
const DEPTH_W = 170;        // depth units → "plan" px when measuring grab distance
const DROP_SPEED = 260;     // px/s down
const LIFT_SPEED = 220;     // px/s up
const CLOSE_TIME = 0.45;    // prongs close
const JOLT_TIME = 0.3;      // the pause + jolt when the lift stops at the top
const RETURN_SPEED = 260;   // px/s back to the chute
const RELEASE_TIME = 0.35;  // prongs open over the chute
const TIP = 50;             // prong tips below the hub
const PRONG_REACH = 44;     // how far a held prize hangs below the hub
const GRAB_R = 34;          // plan distance within which the claw can catch a prize
const TIME_PER_TRY = 15;    // seconds to line up before it drops by itself
const DROPS = 5;

// pts → how easy the prize is to keep (higher = grippier). Rare high-value
// prizes are slippery, so they slip out of the claw more often.
const GRIP_BY_PTS = { 2: 0.95, 3: 0.88, 5: 0.75, 7: 0.6, 9: 0.48 };

const PRIZE_POOL = [
  { emoji: '🧸', color: '#f3a86b', pts: 2, w: 5 },
  { emoji: '🦆', color: '#ffd84a', pts: 2, w: 6 },
  { emoji: '🍬', color: '#ff9f5a', pts: 2, w: 4 },
  { emoji: '🐥', color: '#ffe14d', pts: 3, w: 4 },
  { emoji: '🎁', color: '#ff6fae', pts: 3, w: 4 },
  { emoji: '🐶', color: '#d9a47a', pts: 3, w: 4 },
  { emoji: '🐸', color: '#6ee06e', pts: 3, w: 3 },
  { emoji: '🍩', color: '#ff9ec7', pts: 5, w: 3 },
  { emoji: '⭐', color: '#ffd84a', pts: 5, w: 3 },
  { emoji: '🦄', color: '#e9b8ff', pts: 5, w: 2 },
  { emoji: '🐰', color: '#f0e6ff', pts: 7, w: 2 },
  { emoji: '🐼', color: '#ffffff', pts: 7, w: 2 },
  { emoji: '🏆', color: '#ffcf3f', pts: 9, w: 1 },
  { emoji: '👑', color: '#ffe066', pts: 9, w: 1 },
  { emoji: '💎', color: '#7ce0ff', pts: 9, w: 1 },
];

export class ClawMachine extends MiniGame {
  static key = 'claw';
  static label = 'Claw Machine';

  init() {
    const W = this.view.w, H = this.view.h;
    this.attemptsLeft = DROPS;
    this.hint = 'Steer the claw • GRAB to drop';

    const btnW = 150, btnH = 62;
    this.dropBtn = { x: W / 2 - btnW / 2, y: H - btnH - 56, w: btnW, h: btnH };

    const top = safeTop() + 54;
    this.cab = { x: 8, y: top, w: W - 16, h: this.dropBtn.y - top - 22 };
    this.marqueeH = 46;
    this.prizeArea = {
      x: this.cab.x + 12,
      y: this.cab.y + this.marqueeH + 8,
      w: this.cab.w - 24,
      h: this.cab.h - this.marqueeH - 20,
    };
    const pa = this.prizeArea;
    this.mid = pa.x + pa.w / 2;
    this.floorFront = pa.y + pa.h - 18;     // screen y of the floor at the front glass
    this.topH = this.floorFront - pa.y - 74; // claw hub height when parked up top

    // Claw's travel limits (world x at the front-glass scale, depth 0..1).
    this.minX = pa.x + 40;
    this.maxX = pa.x + pa.w - 40;
    this.minD = 0.05;
    this.maxD = 0.95;

    // Prize chute in the front-left corner; the claw's home is right above it.
    this.chute = { x0: pa.x + 6, x1: pa.x + 96, d1: 0.32 };
    this.home = { x: (this.chute.x0 + this.chute.x1) / 2 + 4, d: 0.14 };

    this.clawX = this.home.x;
    this.clawD = this.home.d;
    this.clawH = this.topH;
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.timeLeft = TIME_PER_TRY;
    this.heldPrize = null;
    this.falling = [];        // prizes dropping back into the pile / chute
    this.strength = 1;
    this._outcome = null;     // what this grip will do: 'keep' | 'slip' | 'drop'
    this._sway = 0;           // claw swing
    this._swayV = 0;

    this._steerX = 0;
    this._steerD = 0;
    this._joyBase = null;
    this._joyKnob = { x: 0, y: 0 };
    this._dragOnBtn = false;
    this._wasDragging = false;
    this._grabKeyWasDown = false;

    this._scatterPrizes();
  }

  // --- projection: world (x, depth, height) → screen --------------------------
  _scale(d) { return 1 - 0.3 * d; }
  _sx(x, d) { return this.mid + (x - this.mid) * this._scale(d); }
  _sy(h, d) { return this.floorFront - d * DEPTH_PX - h * this._scale(d); }

  _inChute(x, d) {
    return x < this.chute.x1 + 6 && d < this.chute.d1;
  }

  // Heap the prizes into a mound: columns on a grid, stacked as they land.
  _scatterPrizes() {
    const pool = [];
    for (const p of PRIZE_POOL) for (let i = 0; i < p.w; i++) pool.push(p);
    const NX = 8, ND = 4;
    const x0 = this.minX - 10, x1 = this.maxX + 10;
    const cols = [];
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < ND; j++) {
        const x = x0 + ((i + 0.5) / NX) * (x1 - x0);
        const d = (j + 0.5) / ND;
        if (this._inChute(x, d)) continue;
        // Mound: the middle columns take more prizes.
        const wgt = 0.5 + Math.sin(((i + 0.5) / NX) * Math.PI) * (1.2 - d * 0.4);
        cols.push({ x, d, h: 0, wgt });
      }
    }
    const total = cols.reduce((a, c) => a + c.wgt, 0);
    const count = 64 + Math.floor(this.rng() * 8); // stuffed full
    this.prizes = [];
    for (let n = 0; n < count; n++) {
      let r = this.rng() * total, col = cols[0];
      for (const c of cols) { r -= c.wgt; if (r <= 0) { col = c; break; } }
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      const size = 48 + Math.floor(this.rng() * 12);
      const p = {
        emoji: tmpl.emoji, color: tmpl.color, pts: tmpl.pts,
        grip: GRIP_BY_PTS[tmpl.pts] ?? 0.7,
        size,
        x: col.x + (this.rng() - 0.5) * 22,
        d: clamp(col.d + (this.rng() - 0.5) * 0.12, 0.04, 0.96),
        h: col.h,
        tilt: (this.rng() - 0.5) * 0.6,
        grabbed: false,
      };
      col.h += size * 0.62;
      this.prizes.push(p);
    }
    this._sortPrizes();
  }

  _sortPrizes() {
    // Back to front, then bottom to top, so nearer / higher prizes draw over.
    this.prizes.sort((a, b) => (b.d - a.d) || (a.h - b.h));
  }

  // Height of the pile's surface under a point (ignores the held prize).
  _surfaceAt(x, d) {
    let top = 0;
    for (const p of this.prizes) {
      if (p === this.heldPrize || p.falling) continue;
      const dist = Math.hypot(p.x - x, (p.d - d) * DEPTH_W);
      if (dist < p.size * 0.5) top = Math.max(top, p.h + p.size * 0.85);
    }
    return top;
  }

  handleInput(input) {
    if (this.done) return;
    this._steerX = 0;
    this._steerD = 0;
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
        // Stick up = push the claw toward the back of the cabinet.
        if (canMove) { this._steerX = dx; this._steerD = -dy; }
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
        if (input.keys.has('arrowup') || input.keys.has('w')) this._steerD = 1;
        if (input.keys.has('arrowdown') || input.keys.has('s')) this._steerD = -1;
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
    this.clawPhase = 'dropping';
    this.clawT = 0;
    this._joyBase = null;
    // Every play the claw's strength is a little different — just like the
    // real machines.
    this.strength = 0.7 + this.rng() * 0.3;
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);

    // Pendulum swing of the claw on its cable.
    this._swayV += (-this._sway * 40 - this._swayV * 3) * dt;
    this._sway += this._swayV * dt;

    this._updateFalling(dt);

    const ph = this.clawPhase;
    if (ph === 'idle') {
      const vx = this._steerX * MOVE_X, vd = this._steerD * MOVE_D;
      this.clawX = clamp(this.clawX + vx * dt, this.minX, this.maxX);
      this.clawD = clamp(this.clawD + vd * dt, this.minD, this.maxD);
      this._swayV -= vx * dt * 0.02;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this._startGrab(); }
      return;
    }

    this.clawT += dt;
    if (ph === 'dropping') {
      // Down until the prong tips meet the pile (or the floor).
      const stop = this._surfaceAt(this.clawX, this.clawD) + TIP - 18;
      this.clawH -= DROP_SPEED * dt;
      if (this.clawH <= stop) {
        this.clawH = stop;
        this.clawPhase = 'closing';
        this.clawT = 0;
      }
    } else if (ph === 'closing') {
      if (this.clawT >= CLOSE_TIME) {
        this._doGrab();
        this.clawPhase = 'lifting';
        this.clawT = 0;
      }
    } else if (ph === 'lifting') {
      this.clawH = Math.min(this.topH, this.clawH + LIFT_SPEED * dt);
      if (this.clawH >= this.topH) {
        this.clawPhase = 'jolt';
        this.clawT = 0;
        this._swayV += 3; // the jerk when the lift motor stops
        // A weak grip lets go right here, at the top — the classic heartbreak.
        if (this.heldPrize && this._outcome === 'slip') this._loseHeld('SO CLOSE!');
      }
    } else if (ph === 'jolt') {
      if (this.clawT >= JOLT_TIME) {
        this.clawPhase = 'returning';
        this.clawT = 0;
      }
    } else if (ph === 'returning') {
      // Back over the chute, carrying whatever it has (or nothing).
      const dx = this.home.x - this.clawX, dd = (this.home.d - this.clawD) * DEPTH_W;
      const dist = Math.hypot(dx, dd);
      const step = RETURN_SPEED * dt;
      if (dist <= step) {
        this.clawX = this.home.x;
        this.clawD = this.home.d;
        this.clawPhase = 'releasing';
        this.clawT = 0;
        if (this.heldPrize) this._dropHeldIntoChute();
      } else {
        this.clawX += (dx / dist) * step;
        this.clawD += (dd / dist / DEPTH_W) * step;
        this._swayV -= (dx / dist) * dt * 4;
        // A loose prize can work free on the way over.
        if (this.heldPrize && this._outcome === 'drop' && this.clawT > 0.35) this._loseHeld('Dropped it!');
      }
    } else if (ph === 'releasing') {
      if (this.clawT >= RELEASE_TIME) this._finishTry();
    }

    if (this.heldPrize) {
      this.heldPrize.x = this.clawX;
      this.heldPrize.d = this.clawD;
    }
  }

  _doGrab() {
    // The prize the prongs closed on: nearest in plan, from the top layer.
    const surf = this._surfaceAt(this.clawX, this.clawD);
    let best = null, bestD = Infinity;
    for (const p of this.prizes) {
      if (p.falling) continue;
      if (p.h + p.size * 0.85 < surf - 26) continue; // buried under others
      const dist = Math.hypot(p.x - this.clawX, (p.d - this.clawD) * DEPTH_W);
      if (dist < GRAB_R && dist < bestD) { bestD = dist; best = p; }
    }
    this.heldPrize = null;
    this._outcome = null;
    if (!best) { Audio.fail(); return; }
    const centering = 1 - bestD / GRAB_R;
    const hold = this.strength * best.grip * (0.45 + 0.55 * centering);
    const r = this.rng();
    this._outcome = r > hold ? 'slip' : this.rng() < (1 - hold) * 0.6 ? 'drop' : 'keep';
    this.heldPrize = best;
    best.grabbed = true;
    Audio.hit();
  }

  // The held prize falls out of the claw back into the machine.
  _loseHeld(msg) {
    const p = this.heldPrize;
    this.heldPrize = null;
    p.grabbed = false;
    p.falling = true;
    p.h = this.clawH - PRONG_REACH - p.size * 0.45;
    p.vh = 0;
    this.falling.push(p);
    this.particles.text(this._sx(this.clawX, this.clawD), this._sy(this.clawH, this.clawD) + 30, msg, '#ffffff', 18);
    Audio.fail();
  }

  _dropHeldIntoChute() {
    const p = this.heldPrize;
    this.heldPrize = null;
    p.falling = true;
    p.h = this.clawH - PRONG_REACH - p.size * 0.45;
    p.vh = 0;
    this.falling.push(p);
  }

  // Prizes dropping: into the chute (win) or back onto the pile.
  _updateFalling(dt) {
    for (const p of this.falling) {
      p.vh -= 1300 * dt;
      p.h += p.vh * dt;
      p.tilt += dt * 4;
      const inChute = this._inChute(p.x, p.d);
      const floor = inChute ? -60 : this._surfaceAt(p.x, p.d);
      if (p.h <= floor) {
        p.h = floor;
        if (!inChute && p.vh < -250) { p.vh = -p.vh * 0.25; continue; } // bounce on the heap
        p.falling = false;
        p.vh = 0;
        p.done = true;
        if (inChute) this._win(p);
      }
    }
    this.falling = this.falling.filter((p) => !p.done);
    for (const p of this.prizes) p.done = false;
    if (this.falling.length === 0) this._sortPrizes();
  }

  _win(p) {
    this.score += p.pts;
    this.hits++;
    const sx = this._sx(this.home.x, 0.1), sy = this._sy(40, 0.1);
    this.particles.burst(sx, sy, p.color, 20, 240);
    this.particles.text(sx + 30, sy - 50, `+${p.pts}`, '#ffe14d', 28);
    this.prizes = this.prizes.filter((q) => q !== p);
    if (p.pts >= 9) Audio.win(); else Audio.hit();
  }

  _finishTry() {
    this.clawPhase = 'idle';
    this.clawT = 0;
    this.clawH = this.topH;
    this.timeLeft = TIME_PER_TRY;
    this.attempts++;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0 || this.prizes.length === 0) {
      this.done = true;
      this.phase = 'done';
    }
  }

  // Finish only once nothing is still falling (so a last-second win counts).
  isDone() {
    return this.done && this.falling.length === 0;
  }

  // ---- rendering ----------------------------------------------------------
  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    const cab = this.cab, pa = this.prizeArea;

    this._drawCarpet(ctx, W, H);

    // Cabinet shell: candy-red body with chrome edging.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, cab.x + 4, cab.y + 8, cab.w, H - cab.y, 20);
    ctx.fill();
    const body = ctx.createLinearGradient(cab.x, 0, cab.x + cab.w, 0);
    body.addColorStop(0, '#b3122e');
    body.addColorStop(0.5, '#ff3b5c');
    body.addColorStop(1, '#b3122e');
    ctx.fillStyle = body;
    rr(ctx, cab.x, cab.y, cab.w, H - cab.y + 20, 20);
    ctx.fill();
    ctx.strokeStyle = '#dfe4ec';
    ctx.lineWidth = 3;
    rr(ctx, cab.x + 1.5, cab.y + 1.5, cab.w - 3, H - cab.y + 20, 19);
    ctx.stroke();

    this._drawMarquee(ctx, t);

    // Glass case interior, in perspective: back wall, side walls, floor.
    ctx.save();
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 10);
    ctx.clip();
    const back = ctx.createLinearGradient(0, pa.y, 0, pa.y + pa.h);
    back.addColorStop(0, '#2a1f6e');
    back.addColorStop(0.55, '#4b3bb0');
    back.addColorStop(1, '#7a5bd6');
    ctx.fillStyle = back;
    ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 26; i++) {
      const sx = pa.x + ((i * 61.7) % pa.w);
      const sy = pa.y + 30 + ((i * 37.3) % (pa.h * 0.5));
      this._star(ctx, sx, sy, 3 + (i % 3) * 2);
    }
    // Floor trapezoid (front edge wide, back edge narrower and higher).
    const fl = this._sx(pa.x, 1), fr = this._sx(pa.x + pa.w, 1), fb = this._sy(0, 1);
    ctx.fillStyle = '#1b1240';
    ctx.beginPath();
    ctx.moveTo(pa.x, this.floorFront);
    ctx.lineTo(fl, fb);
    ctx.lineTo(fr, fb);
    ctx.lineTo(pa.x + pa.w, this.floorFront);
    ctx.lineTo(pa.x + pa.w, pa.y + pa.h);
    ctx.lineTo(pa.x, pa.y + pa.h);
    ctx.closePath();
    ctx.fill();
    // Side-wall edges + interior lights.
    ctx.strokeStyle = 'rgba(255,240,180,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pa.x + 3, this.floorFront);
    ctx.lineTo(fl + 3, fb);
    ctx.lineTo(fl + 3, this._sy(this.topH + 30, 1));
    ctx.moveTo(pa.x + pa.w - 3, this.floorFront);
    ctx.lineTo(fr - 3, fb);
    ctx.lineTo(fr - 3, this._sy(this.topH + 30, 1));
    ctx.stroke();

    this._drawGantry(ctx);

    // Prizes behind the claw, the claw (with its shadow), then those in front.
    const cd = this.clawD;
    this._drawShadow(ctx);
    for (const p of this.prizes) if (p !== this.heldPrize && p.d > cd + 0.04) this._drawPrize(ctx, p);
    this._drawClaw(ctx, t);
    for (const p of this.prizes) if (p !== this.heldPrize && p.d <= cd + 0.04) this._drawPrize(ctx, p);
    this._drawChute(ctx);

    // Glass reflections over everything inside.
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(pa.x + pa.w * 0.55, pa.y);
    ctx.lineTo(pa.x + pa.w * 0.75, pa.y);
    ctx.lineTo(pa.x + pa.w * 0.35, pa.y + pa.h);
    ctx.lineTo(pa.x + pa.w * 0.15, pa.y + pa.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(pa.x + pa.w * 0.8, pa.y);
    ctx.lineTo(pa.x + pa.w * 0.85, pa.y);
    ctx.lineTo(pa.x + pa.w * 0.45, pa.y + pa.h);
    ctx.lineTo(pa.x + pa.w * 0.4, pa.y + pa.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Chrome window frame.
    ctx.strokeStyle = '#eef1f6';
    ctx.lineWidth = 5;
    rr(ctx, pa.x - 2, pa.y - 2, pa.w + 4, pa.h + 4, 12);
    ctx.stroke();
    ctx.strokeStyle = '#8a93a3';
    ctx.lineWidth = 1.5;
    rr(ctx, pa.x - 4.5, pa.y - 4.5, pa.w + 9, pa.h + 9, 14);
    ctx.stroke();

    this._drawControlDeck(ctx, W, H, t);
    this._drawTimer(ctx);
    this._drawJoystick(ctx);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawPrize(ctx, p) {
    const sc = this._scale(p.d);
    const x = this._sx(p.x, p.d), y = this._sy(p.h + p.size * 0.45, p.d);
    const sz = p.size * sc;
    if (!p.falling) {
      ctx.fillStyle = 'rgba(10,4,30,0.3)';
      ctx.beginPath();
      ctx.ellipse(x + 3, y + sz * 0.38, sz * 0.42, sz * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.tilt || 0);
    ctx.font = `${Math.round(sz)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000'; // opaque: emoji glyphs inherit fill alpha
    ctx.fillText(p.emoji, 0, 1);
    ctx.restore();
  }

  // Overhead light: the claw casts a shadow straight down onto the pile, so
  // you can see where it will land.
  _drawShadow(ctx) {
    if (this.clawPhase === 'returning' || this.clawPhase === 'releasing') return;
    const d = this.clawD, sc = this._scale(d);
    const h = this._surfaceAt(this.clawX, d);
    const x = this._sx(this.clawX, d), y = this._sy(h, d);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * sc, 9 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(x, y, GRAB_R * sc, GRAB_R * 0.34 * sc, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Two rails along the side walls, and the cross-bar at the claw's depth.
  _drawGantry(ctx) {
    const pa = this.prizeArea;
    const yF = this._sy(this.topH + 34, 0), yB = this._sy(this.topH + 34, 1);
    ctx.strokeStyle = '#a9b2c1';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pa.x + 6, yF);
    ctx.lineTo(this._sx(pa.x + 6, 1), yB);
    ctx.moveTo(pa.x + pa.w - 6, yF);
    ctx.lineTo(this._sx(pa.x + pa.w - 6, 1), yB);
    ctx.stroke();
    const d = this.clawD, y = this._sy(this.topH + 34, d);
    const g = ctx.createLinearGradient(0, y - 5, 0, y + 5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#a9b2c1');
    g.addColorStop(1, '#5d6676');
    ctx.fillStyle = g;
    ctx.fillRect(this._sx(pa.x + 6, d), y - 4, this._sx(pa.x + pa.w - 6, d) - this._sx(pa.x + 6, d), 8);
  }

  _drawChute(ctx) {
    const c = this.chute;
    const x0 = this._sx(c.x0, 0), x1 = this._sx(c.x1, 0);
    const xb0 = this._sx(c.x0, c.d1), xb1 = this._sx(c.x1, c.d1);
    const yTop = this._sy(70, 0), yBack = this._sy(70, c.d1);
    // Acrylic walls.
    ctx.fillStyle = 'rgba(160,230,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.lineTo(xb0, yBack);
    ctx.lineTo(xb1, yBack);
    ctx.lineTo(x1, yTop);
    ctx.lineTo(x1, this.floorFront + 20);
    ctx.lineTo(x0, this.floorFront + 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,245,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Hazard-striped rim.
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x0 - 2, yTop - 6, x1 - x0 + 4, 8);
    ctx.fillStyle = '#1b1240';
    for (let x = x0; x < x1; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, yTop + 2);
      ctx.lineTo(x + 6, yTop - 6);
      ctx.lineTo(x + 10, yTop - 6);
      ctx.lineTo(x + 4, yTop + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 13px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PRIZE', (x0 + x1) / 2, yTop + 34);
    ctx.fillText('▼', (x0 + x1) / 2, yTop + 50);
  }

  _drawClaw(ctx, t) {
    const d = this.clawD, sc = this._scale(d);
    const cx = this._sx(this.clawX, d);
    const railY = this._sy(this.topH + 34, d);
    const cy = this._sy(this.clawH, d);

    // Carriage on the cross-bar.
    const cg = ctx.createLinearGradient(0, railY - 10, 0, railY + 10);
    cg.addColorStop(0, '#ffe14d');
    cg.addColorStop(1, '#c98a00');
    ctx.fillStyle = cg;
    rr(ctx, cx - 22 * sc, railY - 10 * sc, 44 * sc, 20 * sc, 5);
    ctx.fill();

    // Cable down to the claw, swinging.
    const hubX = cx + Math.sin(this._sway) * 14 * sc;
    ctx.strokeStyle = '#2b2f3a';
    ctx.lineWidth = 3 * sc;
    ctx.beginPath();
    ctx.moveTo(cx, railY + 8 * sc);
    ctx.lineTo(hubX, cy - 36 * sc);
    ctx.stroke();

    ctx.save();
    ctx.translate(hubX, cy);
    ctx.rotate(this._sway * 0.6);
    ctx.scale(sc, sc);

    let close = 0;
    const ph = this.clawPhase;
    if (ph === 'closing') close = Math.min(1, this.clawT / CLOSE_TIME);
    else if (ph === 'lifting' || ph === 'jolt' || ph === 'returning') close = this.heldPrize ? 0.72 : 1;
    else if (ph === 'releasing') close = Math.max(0, 0.72 - this.clawT / RELEASE_TIME);
    else if (ph === 'idle') close = 0.35; // hangs half-open while you steer

    this._prong(ctx, 0, lerp(0.15, 0.02, close), 36, '#6b7382', '#4a515e');
    if (this.heldPrize) {
      const hp = this.heldPrize;
      ctx.save();
      ctx.translate(0, PRONG_REACH - 2);
      ctx.rotate(Math.sin(t * 6) * 0.1);
      ctx.font = `${hp.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000000';
      ctx.fillText(hp.emoji, 0, 1);
      ctx.restore();
    }
    const spread = lerp(0.62, 0.12, close);
    this._prong(ctx, -1, spread, 52, '#c9d0db', '#7b8494');
    this._prong(ctx, 1, spread, 52, '#c9d0db', '#7b8494');

    const hg = ctx.createLinearGradient(-23, 0, 23, 0);
    hg.addColorStop(0, '#7b8494');
    hg.addColorStop(0.4, '#ffffff');
    hg.addColorStop(1, '#5d6676');
    ctx.fillStyle = hg;
    rr(ctx, -23, -40, 46, 30, 9);
    ctx.fill();
    ctx.fillStyle = '#ff3b5c';
    ctx.fillRect(-23, -22, 46, 5);
    ctx.fillStyle = '#3b3f4a';
    ctx.beginPath();
    ctx.arc(0, -10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // LED countdown on the control deck.
  _drawTimer(ctx) {
    const cab = this.cab;
    const x = cab.x + cab.w - 96, y = cab.y + cab.h + 52, w = 74, h = 28;
    ctx.fillStyle = '#0b0d12';
    rr(ctx, x, y, w, h, 6);
    ctx.fill();
    const s = Math.ceil(this.timeLeft);
    ctx.fillStyle = this.clawPhase === 'idle' && s <= 5 ? '#ff4d5d' : '#3dff8a';
    ctx.font = '900 18px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0:${String(s).padStart(2, '0')}`, x + w / 2, y + h / 2 + 1);
  }

  // Classic arcade carpet: dark with bright confetti shapes.
  _drawCarpet(ctx, W, H) {
    ctx.fillStyle = '#140b2e';
    ctx.fillRect(0, 0, W, H);
    const cols = ['#ff3b8d', '#2ee6d6', '#ffd23f', '#8a5cff'];
    for (let i = 0; i < 70; i++) {
      const x = (i * 83.3) % W;
      const y = (i * 47.9 + (i % 5) * 31) % H;
      ctx.fillStyle = cols[i % 4];
      ctx.globalAlpha = 0.55;
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (i % 3 === 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(i);
        ctx.fillRect(-7, -1.5, 14, 3);
        ctx.restore();
      } else {
        this._star(ctx, x, y, 5);
      }
    }
    ctx.globalAlpha = 1;
  }

  _star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  _drawMarquee(ctx, t) {
    const cab = this.cab;
    const x = cab.x + 10, y = cab.y + 6, w = cab.w - 20, h = this.marqueeH - 8;
    ctx.fillStyle = '#ffd23f';
    rr(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.fillStyle = '#ffe98a';
    rr(ctx, x + 3, y + 3, w - 6, h / 2 - 3, 9);
    ctx.fill();
    // Title with a chunky outline.
    ctx.font = '900 24px "Outfit", "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#7a0f22';
    ctx.strokeText('PRIZE GRABBER', cab.x + cab.w / 2, y + h / 2 + 1);
    ctx.fillStyle = '#ff3b5c';
    ctx.fillText('PRIZE GRABBER', cab.x + cab.w / 2, y + h / 2 + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('PRIZE GRABBER', cab.x + cab.w / 2, y + h / 2 - 0.5);
    ctx.fillStyle = '#ff3b5c';
    ctx.fillText('PRIZE GRABBER', cab.x + cab.w / 2, y + h / 2 + 0.5);
    ctx.lineJoin = 'miter';
    // Chasing bulbs top and bottom edge.
    drawBulbRow(ctx, x + 10, x + w - 10, y + 3, Math.round(w / 20), t, 2.6);
    drawBulbRow(ctx, x + 10, x + w - 10, y + h - 3, Math.round(w / 20), t + 0.17, 2.6);
  }

  // One curved claw finger hanging from the hub. dir: -1 left, 1 right, 0 back.
  _prong(ctx, dir, spread, len, light, dark) {
    const sx = dir * 8;
    const elbowX = sx + dir * len * spread + (dir === 0 ? 0 : dir * 6);
    const elbowY = len * 0.55;
    const tipX = elbowX - dir * (10 + 14 * (1 - spread));
    const tipY = len;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [c, w] of [[dark, 11], [light, 6]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(sx, -10);
      ctx.quadraticCurveTo(elbowX, elbowY * 0.4, elbowX, elbowY);
      ctx.quadraticCurveTo(elbowX, tipY, tipX, tipY);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }

  _drawControlDeck(ctx, W, H, t) {
    const cab = this.cab;
    const deckY = cab.y + cab.h + 4;
    // Sloped control panel.
    const g = ctx.createLinearGradient(0, deckY, 0, H);
    g.addColorStop(0, '#2b2f3a');
    g.addColorStop(1, '#14161c');
    ctx.fillStyle = g;
    rr(ctx, cab.x + 10, deckY, cab.w - 20, H - deckY + 20, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cab.x + 20, deckY + 2, cab.w - 40, 2);

    // Coin slot (decor).
    const csx = cab.x + 44, csy = deckY + 34;
    ctx.fillStyle = '#c98a00';
    rr(ctx, csx - 18, csy - 16, 36, 32, 6);
    ctx.fill();
    ctx.fillStyle = '#14161c';
    ctx.fillRect(csx - 2, csy - 10, 4, 20);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '800 9px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('25¢', csx, csy + 24);

    // Tries as lit lamps on the right.
    for (let i = 0; i < DROPS; i++) {
      const lx = cab.x + cab.w - 34 - i * 14, ly = deckY + 34;
      const on = i < this.attemptsLeft;
      ctx.fillStyle = on ? '#3dff8a' : '#2f3a33';
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fill();
      if (on) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(lx - 1.5, ly - 1.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this._drawGrabBtn(ctx, t);
  }

  _drawGrabBtn(ctx, t) {
    const b = this.dropBtn;
    const active = this.clawPhase === 'idle' && !this.done;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const r = b.h / 2 + 2;
    const press = active ? 0 : 4;
    // Bezel.
    ctx.fillStyle = '#c9d0db';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, r + 10, r * 0.8 + 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d6676';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, r + 5, r * 0.8 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Button skirt + dome.
    ctx.fillStyle = active ? '#a10d24' : '#5a2a33';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, r, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    const pulse = active ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
    const dg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    dg.addColorStop(0, active ? '#ff8a9d' : '#8a5a63');
    dg.addColorStop(1, active ? '#e0153a' : '#6a3a43');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(cx, cy + press, r - 2, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.32 + press, r * 0.4, r * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '900 22px "Outfit", "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = active ? '#8a0b1f' : '#4a2a33';
    ctx.strokeText('GRAB', cx, cy + 3 + press);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GRAB', cx, cy + 3 + press);
  }

  // Floating arcade stick: base plate + red ball-top that follows the thumb.
  _drawJoystick(ctx) {
    if (!this._joyBase) return;
    const b = this._joyBase, k = this._joyKnob;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#14161c';
    ctx.beginPath();
    ctx.arc(b.x, b.y, JOY_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#c9d0db';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, JOY_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#c9d0db';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(k.x, k.y);
    ctx.stroke();
    ctx.lineCap = 'butt';
    const g = ctx.createLinearGradient(k.x - 24, k.y - 24, k.x + 24, k.y + 24);
    g.addColorStop(0, '#ff8a9d');
    g.addColorStop(1, '#c0102e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(k.x, k.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(k.x - 8, k.y - 9, 8, 5, -0.5, 0, Math.PI * 2);
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
