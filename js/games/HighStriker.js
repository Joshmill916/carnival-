// High Striker (strongman) — a TIMING game, like the real thing where it's
// technique, not muscle. A marker sweeps back and forth across the swing
// meter; tap (or swipe) to bring the mallet down. Hit the narrow gold zone and
// the puck rings the bell; the further off you are, the weaker the strike.
// 3 swings, and the marker gets faster each time.
import { MiniGame } from './MiniGame.js';
import { drawDusk, rr, contactShadow } from '../ui/BoothStage.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

// Colored zones up the tower, low → high, with the score you get for reaching them.
// Swing meter tuning.
const SWEEP_SPEEDS = [0.9, 1.25, 1.65]; // full sweeps of the bar per second, per swing
const PERFECT = 0.035;                  // half-width of the gold zone (fraction of the bar)
const GOOD = 0.12;                      // half-width of the green zone
const SWING_TIME = 0.14;                // mallet travel time from tap to impact
const HINT = 'Tap when the marker hits GOLD! 🔨';

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
    this.hint = HINT;
    const W = this.view.w, H = this.view.h;
    this.cx = W / 2;
    this.top = H * 0.2;         // bell sits here
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
    // Swing meter: marker position 0..1, sweeping back and forth.
    this.meter = 0;
    this.meterDir = 1;
    this.sweet = 0.5;           // centre of the gold zone (moves each swing)
    this.malletT = 0;           // 0 = raised, 1 = struck
    this.strike = null;         // { power, label } while the mallet is coming down
  }

  handleInput(input) {
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (g && (g.type === 'tap' || g.type === 'flick')) this._startSwing();
  }

  // How good was the timing? Gold = full power (rings the bell); otherwise
  // power falls off with distance from the gold zone, capped below a ring.
  _timingPower(d) {
    if (d <= PERFECT) return { power: 1, label: 'PERFECT!', color: '#ffd14d' };
    const power = clamp(0.92 - (d - PERFECT) * 2.1, 0.12, 0.92);
    if (d <= GOOD) return { power, label: 'GREAT!', color: '#3ddc97' };
    if (d <= 0.25) return { power, label: 'OK', color: '#ffffff' };
    return { power, label: 'WEAK…', color: '#ff8f8f' };
  }

  _startSwing() {
    this.strike = this._timingPower(Math.abs(this.meter - this.sweet));
    this.phase = 'swing';
    this.malletT = 0;
    this.hint = '';
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

    if (this.phase === 'aim') {
      // Ping-pong the marker across the meter.
      const speed = SWEEP_SPEEDS[Math.min(this.attempts, SWEEP_SPEEDS.length - 1)];
      this.meter += this.meterDir * speed * dt;
      if (this.meter >= 1) { this.meter = 2 - this.meter; this.meterDir = -1; }
      if (this.meter <= 0) { this.meter = -this.meter; this.meterDir = 1; }
      this.malletT = Math.max(0, this.malletT - dt * 4);
      return;
    }
    if (this.phase === 'swing') {
      this.malletT = Math.min(1, this.malletT + dt / SWING_TIME);
      if (this.malletT >= 1) {
        const s = this.strike;
        this.particles.text(this.cx, this.bottom - 30, s.label, s.color, s.power >= 1 ? 28 : 22);
        this.particles.burst(this.cx, this.bottom + 18, '#ffe9a8', s.power >= 1 ? 20 : 10, 200);
        Audio.thud();
        this._swing(s.power);
      }
      return;
    }
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
      this.hint = HINT;
      // New swing: the gold zone moves and the marker restarts from the left.
      this.sweet = 0.3 + this.rng() * 0.4;
      this.meter = 0;
      this.meterDir = 1;
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    const cx = this.cx;
    drawDusk(ctx, W, H, this.bottom + 34, t);

    // Tall painted backboard.
    const boardW = 112, trackW = 40;
    const bTop = this.top - 34, bBot = this.bottom + 22;
    contactShadow(ctx, cx + 6, bBot + 12, boardW * 0.75, 12, 0.35);
    ctx.fillStyle = '#7a1c2c';
    rr(ctx, cx - boardW / 2 - 6, bTop, boardW + 12, bBot - bTop, 8);
    ctx.fill();
    const wood = ctx.createLinearGradient(cx - boardW / 2, 0, cx + boardW / 2, 0);
    wood.addColorStop(0, '#f7e3c0');
    wood.addColorStop(0.5, '#fff6e4');
    wood.addColorStop(1, '#e6c99a');
    ctx.fillStyle = wood;
    rr(ctx, cx - boardW / 2, bTop + 6, boardW, bBot - bTop - 12, 6);
    ctx.fill();

    // Colour scale up the track: 20 bands blending through the zones.
    const left = cx - trackW / 2;
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const zi = Math.min(ZONES.length - 1, Math.floor((i / bands) * ZONES.length));
      const y0 = this.bottom - ((i + 1) / bands) * this.towerH;
      ctx.fillStyle = ZONES[zi].color;
      ctx.fillRect(left, y0, trackW, this.towerH / bands + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(left, y0, trackW, 1.5);
    }
    // Tick marks + zone labels on the backboard.
    ctx.textBaseline = 'middle';
    for (let i = 0; i < ZONES.length; i++) {
      const zMid = this.bottom - ((i + 0.5) / ZONES.length) * this.towerH;
      const zTop = this.bottom - ((i + 1) / ZONES.length) * this.towerH;
      ctx.fillStyle = '#5a1a2a';
      ctx.fillRect(left - 12, zTop - 1, 8, 2.5);
      ctx.fillRect(left + trackW + 4, zTop - 1, 8, 2.5);
      ctx.save();
      ctx.translate(i % 2 ? cx - boardW / 2 + 13 : cx + boardW / 2 - 13, zMid);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = ZONES[i].color === '#ffd14d' ? '#b07b00' : ZONES[i].color;
      ctx.font = '900 12px "Outfit", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ZONES[i].label.toUpperCase(), 0, 0);
      ctx.restore();
    }
    // Chrome guide rails.
    for (const rx of [left - 4, left + trackW + 4]) {
      const g = ctx.createLinearGradient(rx - 3, 0, rx + 3, 0);
      g.addColorStop(0, '#7b8494');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, '#6b7382');
      ctx.fillStyle = g;
      ctx.fillRect(rx - 3, this.top - 8, 6, this.towerH + 18);
    }

    // Peak marker from the best swing so far.
    if (this.peakFrac > 0) {
      const my = this.top + (1 - this.peakFrac) * this.towerH;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx + boardW / 2 + 4, my);
      ctx.lineTo(cx + boardW / 2 + 18, my - 8);
      ctx.lineTo(cx + boardW / 2 + 18, my + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(left - 10, my);
      ctx.lineTo(left + trackW + 10, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The bell, shaking + flashing when rung.
    this._drawBell(ctx, cx, this.top - 20, t);

    // Puck (with speed streaks while flying).
    const py = this.puck ? this.puck.y : this.bottom;
    if (this.puck && Math.abs(this.puck.vy) > 300) {
      for (let k = 1; k <= 3; k++) {
        ctx.globalAlpha = 0.18 / k;
        this._drawPuck(ctx, cx, py - this.puck.vy * 0.012 * k, trackW);
      }
      ctx.globalAlpha = 1;
    }
    this._drawPuck(ctx, cx, py, trackW);

    // Strike pad (lever) + mallet at the base.
    const baseY = this.bottom + 22;
    ctx.fillStyle = '#4a2410';
    rr(ctx, cx - 70, baseY, 140, 20, 5);
    ctx.fill();
    ctx.fillStyle = '#e0303e';
    rr(ctx, cx - 30, baseY - 8, 60, 12, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(cx - 26, baseY - 7, 52, 2);
    // Mallet: held up overhead while you time it, then slammed onto the pad.
    const raised = -0.55 + Math.sin(t * 3) * 0.04;
    const struck = 1.43;
    const k = this.malletT;
    this._drawMallet(ctx, cx - 95, baseY + 14, raised + (struck - raised) * k * k);

    this._drawMeter(ctx, W, baseY + 40);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawPuck(ctx, x, y, trackW) {
    const w = trackW + 16, h = 16;
    ctx.fillStyle = '#2b2f3a';
    rr(ctx, x - w / 2, y - h / 2 + 2, w, h, 6);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, '#ff7a7a');
    g.addColorStop(1, '#b3121f');
    ctx.fillStyle = g;
    rr(ctx, x - w / 2, y - h / 2, w, h - 2, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x - w / 2 + 6, y - h / 2 + 2, w - 12, 2);
  }

  _drawBell(ctx, x, y, t) {
    const lit = this.bellT > 0;
    const shake = lit ? Math.sin(this.bellT * 60) * 0.18 : 0;
    if (lit) {
      // Burst rays (flat strokes, no blur).
      ctx.strokeStyle = 'rgba(255,230,120,0.9)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 2;
        const r0 = 36, r1 = 52 + 10 * Math.sin(this.bellT * 30 + i);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(x, y - 22);
    ctx.rotate(shake);
    // Mount.
    ctx.fillStyle = '#5a2c0c';
    ctx.fillRect(-4, -10, 8, 12);
    // Dome.
    const g = ctx.createLinearGradient(-28, 0, 28, 0);
    g.addColorStop(0, '#b07b00');
    g.addColorStop(0.35, lit ? '#fffbe0' : '#ffe27a');
    g.addColorStop(1, '#9a6400');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-30, 40);
    ctx.quadraticCurveTo(-26, 34, -22, 14);
    ctx.quadraticCurveTo(-18, 0, 0, 0);
    ctx.quadraticCurveTo(18, 0, 22, 14);
    ctx.quadraticCurveTo(26, 34, 30, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9a6400';
    rr(ctx, -32, 37, 64, 7, 3);
    ctx.fill();
    // Clapper.
    ctx.fillStyle = '#5a3a00';
    ctx.beginPath();
    ctx.arc(Math.sin(t * 3) * (lit ? 6 : 0), 46, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The swing meter: red ends, green zone, narrow gold zone, sliding marker.
  _drawMeter(ctx, W, y) {
    const x0 = 40, x1 = W - 40, w = x1 - x0, h = 18;
    ctx.save();
    ctx.fillStyle = 'rgba(20,8,30,0.8)';
    rr(ctx, x0 - 8, y - 8, w + 16, h + 16, 12);
    ctx.fill();
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, '#ff5d5d');
    grad.addColorStop(0.5, '#ffb04d');
    grad.addColorStop(1, '#ff5d5d');
    ctx.fillStyle = grad;
    rr(ctx, x0, y, w, h, 9);
    ctx.fill();
    ctx.fillStyle = '#3ddc97';
    ctx.fillRect(x0 + (this.sweet - GOOD) * w, y, GOOD * 2 * w, h);
    ctx.fillStyle = '#ffd14d';
    ctx.fillRect(x0 + (this.sweet - PERFECT) * w, y - 3, PERFECT * 2 * w, h + 6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + (this.sweet - PERFECT) * w, y - 3, PERFECT * 2 * w, h + 6);
    // Marker.
    const mx = x0 + this.meter * w;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(mx, y - 2);
    ctx.lineTo(mx - 9, y - 14);
    ctx.lineTo(mx + 9, y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(mx - 2, y - 2, 4, h + 4);
    ctx.restore();
  }

  _drawMallet(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#c98e4a';
    rr(ctx, -4, -86, 8, 86, 3);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -110, 0, -82);
    g.addColorStop(0, '#9a5a24');
    g.addColorStop(1, '#5a2c0c');
    ctx.fillStyle = g;
    rr(ctx, -24, -110, 48, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ffcf3f';
    ctx.fillRect(-24, -100, 48, 4);
    ctx.restore();
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
