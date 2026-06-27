// High Striker (strongman): swipe UP hard to drive the puck up the tower. A
// stronger swipe sends it higher; reach the very top to RING THE BELL for the
// max score. 3 swings. The harder the flick, the higher the puck flies.
import { MiniGame } from './MiniGame.js';
import { drawSpace } from '../ui/Backdrop.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

// Colored zones up the tower, low → high, with the score you get for reaching them.
const ZONES = [
  { color: '#5b8cff', label: 'Try Again' },
  { color: '#3ddc97', label: 'Not Bad' },
  { color: '#ffd14d', label: 'Strong!' },
  { color: '#ff8f4d', label: 'Mighty!' },
  { color: '#ff5d8f', label: 'RING IT!' },
];

export class HighStriker extends MiniGame {
  static key = 'striker';
  static label = 'High Striker';

  init() {
    this.attemptsLeft = 3;
    this.hint = 'Swipe UP hard to ring the bell! 🔔';
    const W = this.view.w, H = this.view.h;
    this.cx = W / 2;
    this.top = H * 0.14;        // bell sits here
    this.bottom = H * 0.82;     // puck rests here
    this.towerH = this.bottom - this.top;
    this.g = 2600;              // px/s^2
    // A touch of headroom so a near-max swipe reliably clears the bell despite
    // the fixed-timestep integration (you still need ~95%+ power to ring it).
    this.maxV = Math.sqrt(2 * this.g * this.towerH * 1.1);
    this.puck = null;
    this.puckY = this.bottom;   // resting puck height (also the marker after a swing)
    this.peakFrac = 0;          // best fraction reached this round (for the marker)
    this.rang = false;          // rang the bell at least once
    this.bellT = 0;             // bell flash timer
  }

  handleInput(input) {
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -150) {
      const power = clamp((Math.abs(g.vy) - 250) / 2000, 0.06, 1);
      this._swing(power);
    }
  }

  _swing(power) {
    this.puck = { y: this.bottom, vy: -power * this.maxV, peakY: this.bottom };
    this.phase = 'fly';
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    if (this.bellT > 0) this.bellT -= dt;
    if (this.phase !== 'fly' || !this.puck) return;
    const p = this.puck;
    p.vy += this.g * dt;
    p.y += p.vy * dt;
    if (p.y < p.peakY) p.peakY = p.y;

    if (p.y <= this.top) {
      // Reached the top — RING THE BELL.
      p.y = this.top;
      this.rang = true;
      this.bellT = 0.7;
      this._scoreSwing(1);
    } else if (p.vy > 0 && p.y >= this.bottom) {
      // Fell back without ringing.
      this._scoreSwing(clamp((this.bottom - p.peakY) / this.towerH, 0, 1));
    }
  }

  _scoreSwing(frac) {
    this.puckY = this.top + (1 - frac) * this.towerH; // leave the marker at peak
    this.peakFrac = Math.max(this.peakFrac, frac);
    const rang = frac >= 0.985;
    const points = rang ? 10 : Math.round(frac * 9);
    this.score += points;
    if (points > 0) this.hits++;

    const color = ZONES[Math.min(ZONES.length - 1, Math.floor(frac * ZONES.length))].color;
    if (rang) {
      this.particles.text(this.cx, this.top - 10, 'DING! +10', '#ffd14d', 26);
      this.particles.burst(this.cx, this.top, '#ffd14d', 22, 220);
      Audio.win();
    } else if (points > 0) {
      this.particles.text(this.cx, this.puckY, `+${points}`, color, 22);
      this.particles.burst(this.cx, this.puckY, color, 12);
      Audio.hit();
    } else {
      Audio.fail();
    }

    this.puck = null;
    this.attempts++;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      this.hint = 'Swipe UP hard to ring the bell! 🔔';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    drawSpace(ctx, W, H, this.t);

    const towerW = 52;
    const left = this.cx - towerW / 2;

    // Tower zones, low (bottom) to high (top).
    for (let i = 0; i < ZONES.length; i++) {
      const zTop = this.bottom - ((i + 1) / ZONES.length) * this.towerH;
      const zh = this.towerH / ZONES.length;
      ctx.fillStyle = ZONES[i].color;
      ctx.fillRect(left, zTop, towerW, zh);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(left, zTop, towerW, 2);
    }
    // Tower rails.
    ctx.fillStyle = '#cdd3e0';
    ctx.fillRect(left - 6, this.top - 6, 6, this.towerH + 12);
    ctx.fillRect(left + towerW, this.top - 6, 6, this.towerH + 12);

    // Bell at the top — glows when freshly rung.
    const lit = this.bellT > 0;
    if (lit) {
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(this.bellT * 30);
      ctx.fillStyle = '#ffd14d';
      ctx.beginPath();
      ctx.arc(this.cx, this.top - 16, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔔', this.cx, this.top - 16);

    // Peak marker from the last swing.
    if (this.peakFrac > 0) {
      const my = this.top + (1 - this.peakFrac) * this.towerH;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left - 18, my);
      ctx.lineTo(left + towerW + 18, my);
      ctx.stroke();
    }

    // The puck: flying, or resting on the base.
    const py = this.puck ? this.puck.y : this.bottom;
    ctx.fillStyle = '#e8e8f0';
    ctx.strokeStyle = '#9aa3b2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(this.cx, py, towerW / 2 + 4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Strongman base / mallet pad.
    ctx.fillStyle = '#7a4416';
    ctx.fillRect(this.cx - 50, this.bottom + 6, 100, 16);
    ctx.font = '28px serif';
    ctx.fillText('🔨', this.cx - 76, this.bottom + 8);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  getResult() {
    return {
      gameKey: 'striker',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: this.rang,
      coinBonus: this.rang ? 20 : 0,
    };
  }
}
