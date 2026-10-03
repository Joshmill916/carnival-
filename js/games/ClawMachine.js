// Claw Machine — a big, bright arcade cabinet stuffed wall-to-wall with prizes.
// A floating joystick flies the claw freely in 2D (left/right + up/down); drive
// it down into the heap, then tap GRAB to close and lift. Win it and the claw
// carries the prize over to the chute and drops it in, like the real thing.
// Grabbing is NOT a sure thing: you must centre on a prize, the rare
// high-value ones are slippery, and a weak grip slips on the way up — the fun
// of "barely grabbing one". 5 grabs. WASD/arrows + Space/Enter on desktop.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp, lerp } from '../core/util.js';
import { rr, drawBulbRow, safeTop } from '../ui/BoothStage.js';

const JOY_RADIUS = 60;
const JOY_DEADZONE = 0.18;
const CLAW_SPEED = 320;     // px/s
const CLOSE_TIME = 0.32;    // prongs close
const LIFT_TIME = 0.75;     // rise back to the top
const RETURN_SPEED = 420;   // px/s carrying a prize to the chute
const RELEASE_TIME = 0.25;  // prongs open over the chute
const GRAB_R = 46;          // how near a prize must be to catch it
const PRONG_REACH = 44;     // how far a held prize hangs below the hub
const GRAB_OFFSET = 30;     // grab point: between the prong tips, below the hub
const DROPS = 5;

// pts → how easy the prize is to keep (higher = grippier). Rare high-value
// prizes are slippery, so they slip out of the claw more often.
const GRIP_BY_PTS = { 2: 0.95, 3: 0.85, 5: 0.70, 7: 0.55, 9: 0.42 };

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
    this.hint = 'Joystick to fly the claw • GRAB to grab';

    // Big round arcade button on the control deck (rect = tap target).
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
    this.railY = pa.y + 14;
    this.floorY = pa.y + pa.h - 16;

    // Prize chute in the front-left corner.
    this.chute = { x: pa.x + 6, y: this.floorY - 92, w: 78, h: pa.y + pa.h - (this.floorY - 92) };

    // The claw flies freely in this box.
    this._clawMinX = this.cab.x + 34;
    this._clawMaxX = this.cab.x + this.cab.w - 34;
    this.clawTopY = this.railY + 30;
    this._clawMinY = this.clawTopY;
    this._clawMaxY = this.floorY - GRAB_OFFSET + 6;
    this.clawX = (this._clawMinX + this._clawMaxX) / 2;
    this.clawY = this.clawTopY;

    this.clawPhase = 'idle'; // idle | grabbing | lifting | returning | releasing
    this.clawT = 0;
    this._liftStartY = this.clawTopY;
    this.heldPrize = null;
    this._willSlip = false;
    this.slipping = null;
    this.chuteDrop = null;   // won prize falling into the chute
    this._sway = 0;          // claw swing after moving/stopping

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
    const x0 = this.chute.x + this.chute.w + 22;   // keep the chute clear
    const x1 = pa.x + pa.w - 22;
    const pileH = pa.h * 0.56;
    const count = 42 + Math.floor(this.rng() * 6); // 42–47: stuffed full
    this.prizes = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pool[Math.floor(this.rng() * pool.length)];
      const u = this.rng();
      const x = x0 + u * (x1 - x0);
      // Mound: heap is highest in the middle, slumps at the walls.
      const hp = pileH * (0.5 + 0.5 * Math.sin(Math.PI * u));
      const y = this.floorY - this.rng() * hp;
      this.prizes.push({
        emoji: tmpl.emoji,
        color: tmpl.color,
        pts: tmpl.pts,
        grip: GRIP_BY_PTS[tmpl.pts] ?? 0.7,
        size: 44 + Math.floor(this.rng() * 14), // 44–57
        tilt: (this.rng() - 0.5) * 0.6,
        x,
        y,
        restY: y,
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

    // Claw sways a little as it moves, settling when it stops.
    this._sway += (-this._steerX * 0.22 - this._sway) * Math.min(1, dt * 5);

    // A slipped prize tumbling back into the pile (runs in any phase).
    if (this.slipping) {
      const s = this.slipping;
      s.vy += 1100 * dt;
      s.y += s.vy * dt;
      if (s.y >= s.restY) {
        s.y = s.restY;
        if (s.vy > 260) {
          s.vy = -s.vy * 0.28; // little bounce on the heap
        } else {
          s.vy = 0;
          s.grabbed = false;
          this.slipping = null;
        }
      }
    }

    // A won prize dropping into the chute.
    if (this.chuteDrop) {
      const c = this.chuteDrop;
      c.vy += 1300 * dt;
      c.y += c.vy * dt;
      if (c.y >= this.floorY + 4) {
        this.particles.burst(c.x, this.floorY - 10, c.p.color, 20, 240);
        this.chuteDrop = null;
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
          this.particles.text(this.clawX, this.clawY + 10, 'SO CLOSE!', '#ffffff', 18);
          Audio.fail();
        }
      }
      if (prog >= 1) {
        if (this.heldPrize) {
          this.clawPhase = 'returning';
          this.clawT = 0;
        } else {
          this._finishGrab();
        }
      }
    } else if (this.clawPhase === 'returning') {
      // Carry the prize over the chute.
      const tx = clamp(this.chute.x + this.chute.w / 2, this._clawMinX, this._clawMaxX);
      const step = RETURN_SPEED * dt;
      const d = tx - this.clawX;
      this.clawX += Math.abs(d) <= step ? d : Math.sign(d) * step;
      this._sway += -Math.sign(d) * dt * 0.8;
      this.heldPrize.x = this.clawX;
      this.heldPrize.y = this.clawY + PRONG_REACH;
      if (Math.abs(tx - this.clawX) < 0.5) {
        this.clawPhase = 'releasing';
        this.clawT = 0;
        this.chuteDrop = { p: this.heldPrize, x: this.clawX, y: this.heldPrize.y, vy: 60 };
        this._finishGrab();
        this.clawPhase = this.done ? 'idle' : 'releasing';
        this.clawT = 0;
      }
    } else if (this.clawPhase === 'releasing') {
      if (this.clawT >= RELEASE_TIME) {
        this.clawPhase = 'idle';
        this.clawT = 0;
      }
    }
  }

  _doGrab() {
    const gx = this.clawX, gy = this.clawY + GRAB_OFFSET;
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
      this.particles.text(this.clawX, this.chute.y - 10, `+${pts}`, '#ffe14d', 28);
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

    // Glass case interior.
    ctx.save();
    rr(ctx, pa.x, pa.y, pa.w, pa.h, 10);
    ctx.clip();
    const back = ctx.createLinearGradient(0, pa.y, 0, pa.y + pa.h);
    back.addColorStop(0, '#2a1f6e');
    back.addColorStop(0.55, '#4b3bb0');
    back.addColorStop(1, '#7a5bd6');
    ctx.fillStyle = back;
    ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
    // Back-wall sparkle pattern.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 26; i++) {
      const sx = pa.x + ((i * 61.7) % pa.w);
      const sy = pa.y + 30 + ((i * 37.3) % (pa.h * 0.5));
      this._star(ctx, sx, sy, 3 + (i % 3) * 2);
    }
    // Interior side lights.
    for (const lx of [pa.x + 3, pa.x + pa.w - 7]) {
      ctx.fillStyle = 'rgba(255,240,180,0.85)';
      ctx.fillRect(lx, pa.y + 4, 4, pa.h - 8);
    }
    // Floor of the case.
    ctx.fillStyle = '#1b1240';
    ctx.fillRect(pa.x, this.floorY + 6, pa.w, pa.y + pa.h - this.floorY);

    this._drawGantry(ctx);
    this._drawPrizes(ctx);
    this._drawChute(ctx);
    this._drawClaw(ctx, t);

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
    this._drawJoystick(ctx);

    this.particles.render(ctx);
    this._drawHud(ctx);
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

  _drawGantry(ctx) {
    const pa = this.prizeArea;
    // Rail across the top of the case.
    const g = ctx.createLinearGradient(0, this.railY - 6, 0, this.railY + 6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#a9b2c1');
    g.addColorStop(1, '#5d6676');
    ctx.fillStyle = g;
    ctx.fillRect(pa.x, this.railY - 5, pa.w, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(pa.x, this.railY + 5, pa.w, 3);
  }

  _drawPrizes(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.prizes) {
      if (p === this.heldPrize) continue; // drawn with the claw
      this._drawOnePrize(ctx, p, p.y === p.restY);
    }
  }

  _drawOnePrize(ctx, p, resting) {
    if (resting) {
      ctx.fillStyle = 'rgba(10,4,30,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + p.size * 0.38, p.size * 0.42, p.size * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tilt || 0);
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000'; // opaque: emoji glyphs inherit fill alpha
    ctx.fillText(p.emoji, 0, 1);
    ctx.restore();
  }

  _drawChute(ctx) {
    const c = this.chute;
    // Falling prize goes behind the chute's front glass.
    if (this.chuteDrop) {
      const d = this.chuteDrop;
      this._drawOnePrize(ctx, { ...d.p, x: d.x, y: d.y, tilt: d.y * 0.02 }, false);
    }
    ctx.fillStyle = 'rgba(160,230,255,0.22)';
    rr(ctx, c.x, c.y, c.w, c.h + 12, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,245,255,0.85)';
    ctx.lineWidth = 2;
    rr(ctx, c.x, c.y, c.w, c.h + 12, 6);
    ctx.stroke();
    // Yellow hazard rim.
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(c.x - 2, c.y - 6, c.w + 4, 8);
    ctx.fillStyle = '#1b1240';
    for (let x = c.x; x < c.x + c.w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, c.y + 2);
      ctx.lineTo(x + 6, c.y - 6);
      ctx.lineTo(x + 10, c.y - 6);
      ctx.lineTo(x + 4, c.y + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 13px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PRIZE', c.x + c.w / 2, c.y + c.h * 0.55);
    ctx.fillText('▼', c.x + c.w / 2, c.y + c.h * 0.55 + 16);
  }

  _drawClaw(ctx, t) {
    const cx = this.clawX, cy = this.clawY;
    const pa = this.prizeArea;

    // Gantry carriage on the rail + cross-bar spanning the case.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - 3, pa.y, 6, this.railY - pa.y);
    const cg = ctx.createLinearGradient(0, this.railY - 10, 0, this.railY + 10);
    cg.addColorStop(0, '#ffe14d');
    cg.addColorStop(1, '#c98a00');
    ctx.fillStyle = cg;
    rr(ctx, cx - 22, this.railY - 10, 44, 20, 5);
    ctx.fill();
    ctx.fillStyle = '#3b3f4a';
    for (const wx of [cx - 13, cx + 13]) {
      ctx.beginPath();
      ctx.arc(wx, this.railY - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Swaying cable down to the claw.
    const sway = this._sway;
    const hubX = cx + Math.sin(sway) * 6;
    ctx.strokeStyle = '#2b2f3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, this.railY + 10);
    ctx.quadraticCurveTo(cx, (this.railY + cy) / 2, hubX, cy - 36);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.translate(hubX, cy);
    ctx.rotate(sway * 0.5);

    // How closed: open while flying, shut while holding, opening to release.
    let close = 0;
    if (this.clawPhase === 'grabbing') close = Math.min(1, this.clawT / CLOSE_TIME);
    else if (this.clawPhase === 'lifting' || this.clawPhase === 'returning') close = this.heldPrize ? 0.7 : 1;
    else if (this.clawPhase === 'releasing') close = Math.max(0, 0.7 - this.clawT / RELEASE_TIME);

    // Back prong (foreshortened, darker).
    this._prong(ctx, 0, lerp(0.15, 0.02, close), 36, '#6b7382', '#4a515e');
    // Held prize hangs between the prongs.
    if (this.heldPrize) {
      const hp = this.heldPrize;
      this._drawOnePrize(ctx, { ...hp, x: 0, y: PRONG_REACH - 2, tilt: Math.sin(t * 6) * 0.08 }, false);
    }

    // Side prongs.
    const spread = lerp(0.62, 0.12, close);
    this._prong(ctx, -1, spread, 52, '#c9d0db', '#7b8494');
    this._prong(ctx, 1, spread, 52, '#c9d0db', '#7b8494');

    // Motor housing.
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
