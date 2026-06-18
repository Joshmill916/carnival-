// Claw Machine: tap where you want to drop the claw. It slides over, then
// descends. If you lined up with a prize it grabs it; otherwise it misses.
// 3 attempts. Prizes worth 5, 8 and 10 points.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

export class ClawMachine extends MiniGame {
  static key = 'claw';
  static label = 'Claw Machine';

  init() {
    this.attemptsLeft = 3;
    this.hint = 'Tap where to drop the claw! 🦾';
    const W = this.view.w, H = this.view.h;
    this.cx = W / 2;
    this.cabTop = H * 0.08;
    this.cabH = H * 0.78;
    this.floorY = this.cabTop + this.cabH - 28;

    // Three prizes spread across the bottom of the cabinet.
    this.prizes = [
      { x: W * 0.28, y: this.floorY - 22, pts: 5,  color: '#ff5d8f', emoji: '🧸', grabbed: false },
      { x: W * 0.50, y: this.floorY - 22, pts: 8,  color: '#5b8cff', emoji: '🎁', grabbed: false },
      { x: W * 0.72, y: this.floorY - 22, pts: 10, color: '#ffd14d', emoji: '🌟', grabbed: false },
    ];

    this.claw = {
      x: this.cx,
      targetX: this.cx,
      y: this.cabTop + 30,   // hangs from top
      phase: 'idle',         // idle | sliding | dropping | grabbing | retracting
      grabbed: null,
      t: 0,
      dropY: this.floorY - 10,
      restY: this.cabTop + 30,
    };
  }

  handleInput(input) {
    if (this.phase !== 'aim' || this.claw.phase !== 'idle') return;
    const g = input.consumeGesture();
    // Also accept a tap (very short flick or tap at a location).
    if (g && (g.type === 'tap' || g.type === 'flick')) {
      const tapX = clamp(g.x ?? (this.view.w / 2), 24, this.view.w - 24);
      this._startDrop(tapX);
    }
  }

  _startDrop(targetX) {
    this.claw.targetX = clamp(targetX, this.view.w * 0.12, this.view.w * 0.88);
    this.claw.phase = 'sliding';
    this.claw.t = 0;
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    const c = this.claw;
    c.t += dt;

    if (c.phase === 'sliding') {
      // Slide claw to target x.
      const dx = c.targetX - c.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), 340 * dt);
      c.x += step;
      if (Math.abs(c.x - c.targetX) < 2) {
        c.x = c.targetX;
        c.phase = 'dropping';
        c.t = 0;
      }
    } else if (c.phase === 'dropping') {
      // Lower the claw.
      c.y = Math.min(c.y + 260 * dt, c.dropY);
      if (c.y >= c.dropY) {
        c.phase = 'grabbing';
        c.t = 0;
        this._tryGrab();
      }
    } else if (c.phase === 'grabbing') {
      // Brief pause while claw closes.
      if (c.t >= 0.35) {
        c.phase = 'retracting';
        c.t = 0;
      }
    } else if (c.phase === 'retracting') {
      // Raise claw back to top.
      c.y = Math.max(c.y - 280 * dt, c.restY);
      if (c.grabbed) c.grabbed.y = c.y + 18;
      if (c.y <= c.restY) {
        this._finishAttempt();
      }
    }
  }

  _tryGrab() {
    const GRAB_R = 30;
    let best = null, bestDist = Infinity;
    for (const p of this.prizes) {
      if (p.grabbed) continue;
      const d = Math.abs(p.x - this.claw.x);
      if (d < GRAB_R && d < bestDist) { best = p; bestDist = d; }
    }
    if (best) {
      best.grabbed = true;
      this.claw.grabbed = best;
      Audio.hit();
    } else {
      Audio.fail();
    }
  }

  _finishAttempt() {
    const c = this.claw;
    if (c.grabbed) {
      const pts = c.grabbed.pts;
      this.score += pts;
      this.hits++;
      this.particles.text(this.cx, this.claw.restY + 20, `+${pts}`, c.grabbed.color, 22);
      this.particles.burst(this.cx, this.claw.restY + 20, c.grabbed.color, 14);
      if (pts >= 10) Audio.win(); else Audio.hit();
    }
    c.grabbed = null;
    c.phase = 'idle';
    c.t = 0;
    this.attempts++;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      this.hint = 'Tap where to drop the claw! 🦾';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    // Background.
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(0, 0, W, H);

    const left = this.cx - W * 0.44;
    const right = this.cx + W * 0.44;
    const cabW = right - left;

    // Cabinet glass body.
    ctx.fillStyle = '#0d2040';
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(left, this.cabTop, cabW, this.cabH, 12);
    ctx.fill();
    ctx.stroke();

    // Glass shine.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.roundRect(left + 8, this.cabTop + 8, cabW * 0.3, this.cabH - 16, 8);
    ctx.fill();

    // Floor inside.
    ctx.fillStyle = '#1a2a40';
    ctx.fillRect(left + 4, this.floorY, cabW - 8, 24);

    // Prizes (not-yet-grabbed).
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.prizes) {
      if (p.grabbed && this.claw.grabbed !== p) continue; // fully gone
      if (this.claw.grabbed === p) continue; // drawn with claw
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(p.emoji, p.x, p.y);
    }

    // Prize being held by claw.
    if (this.claw.grabbed) {
      const p = this.claw.grabbed;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, this.claw.y + 18, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(p.emoji, p.x, this.claw.y + 18);
    }

    // Claw rail (top bar).
    ctx.fillStyle = '#8893a7';
    ctx.fillRect(left + 4, this.cabTop + 10, cabW - 8, 10);

    // Claw cable.
    const c = this.claw;
    ctx.strokeStyle = '#ccd0da';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, this.cabTop + 15);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();

    // Claw head (3 prongs).
    const open = c.phase !== 'grabbing' && c.phase !== 'retracting';
    const spread = open ? 14 : 6;
    ctx.strokeStyle = '#e0e4f0';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(c.x + i * spread, c.y);
      ctx.lineTo(c.x + i * spread * 0.6, c.y + 18);
      ctx.stroke();
    }
    ctx.fillStyle = '#9aa3b2';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
    ctx.fill();

    // Top marquee.
    ctx.fillStyle = '#b07cff';
    ctx.beginPath();
    ctx.roundRect(left, this.cabTop - 26, cabW, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ CLAW MACHINE ★', this.cx, this.cabTop - 11);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  getResult() {
    return {
      gameKey: 'claw',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: this.score >= 20,
      coinBonus: this.score >= 20 ? 15 : 0,
    };
  }
}
