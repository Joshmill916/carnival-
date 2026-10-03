// Balloon Darts: tap a balloon (or flick toward it) to throw a dart. Balloons
// drift side to side; colour = point value. 5 darts.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawCounter, drawSign, rr } from '../ui/BoothStage.js';
import { circleHit } from '../core/util.js';
import { Audio } from '../core/Audio.js';

const TIERS = [
  { color: '#5b8cff', points: 1 },
  { color: '#3ddc97', points: 2 },
  { color: '#ffd14d', points: 3 },
  { color: '#ff5d8f', points: 5 },
];

export class BalloonDarts extends MiniGame {
  static key = 'darts';
  static label = 'Balloon Darts';

  init() {
    this.attemptsLeft = 5;
    this.hint = 'Tap a balloon to throw a dart';
    const W = this.view.w, H = this.view.h;
    this.launch = { x: W / 2, y: H - 70 };
    this.dart = null;

    this.balloons = [];
    const cols = 4, rows = 3;
    const r = 27;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tier = this.rng.pick(TIERS);
        const x = (W * (col + 1)) / (cols + 1);
        const y = H * 0.23 + row * (H * 0.125);
        this.balloons.push({
          x, hx: x, y, r,
          color: tier.color,
          points: tier.points,
          popped: false,
          drift: this.rng.range(20, 55),
          phase: this.rng.range(0, Math.PI * 2),
        });
      }
    }
    this.t = 0;
  }

  handleInput(input) {
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (!g) return;
    if (g.type === 'tap') {
      this._throwToward(g.x, g.y);
    } else if (g.type === 'flick' && g.vy < -40) {
      // Aim along the flick direction.
      this._throwToward(this.launch.x + g.dx * 3, this.launch.y + g.dy * 3);
    }
  }

  _throwToward(tx, ty) {
    const dx = tx - this.launch.x;
    const dy = ty - this.launch.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 900;
    this.dart = {
      x: this.launch.x,
      y: this.launch.y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      angle: Math.atan2(dy, dx),
    };
    this.phase = 'fly';
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    this.t += dt;
    // Balloon drift.
    for (const b of this.balloons) {
      if (b.popped) continue;
      b.x = b.hx + Math.sin(this.t + b.phase) * b.drift;
    }
    if (this.phase !== 'fly' || !this.dart) return;
    const d = this.dart;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 240 * dt; // slight drop
    d.angle = Math.atan2(d.vy, d.vx);

    for (const b of this.balloons) {
      if (b.popped) continue;
      if (circleHit(d.x, d.y, 4, b.x, b.y, b.r)) {
        b.popped = true;
        this.score += b.points;
        this.hits++;
        this.particles.burst(b.x, b.y, b.color, 16);
        Audio.win();
        return this._endThrow();
      }
    }
    if (d.y > this.view.h + 40 || d.x < -40 || d.x > this.view.w + 40) {
      Audio.fail();
      this._endThrow();
    }
  }

  _endThrow() {
    this.dart = null;
    this.attempts++;
    this.attemptsLeft--;
    const allPopped = this.balloons.every((b) => b.popped);
    if (this.attemptsLeft <= 0 || allPopped) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      this.hint = 'Tap a balloon to throw a dart';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    drawBoothBack(ctx, W, H, 'purple', t);

    // Framed cork board behind the balloons.
    const bx = 22, by = H * 0.23 - 54, bw = W - 44, bh = H * 0.25 + 130;
    ctx.fillStyle = '#5a2c0c';
    rr(ctx, bx - 8, by - 8, bw + 16, bh + 16, 10);
    ctx.fill();
    ctx.fillStyle = '#ffcf3f';
    rr(ctx, bx - 3, by - 3, bw + 6, bh + 6, 7);
    ctx.fill();
    const cork = ctx.createLinearGradient(0, by, 0, by + bh);
    cork.addColorStop(0, '#d9a463');
    cork.addColorStop(1, '#b67d3d');
    ctx.fillStyle = cork;
    ctx.fillRect(bx, by, bw, bh);
    // Cork speckle (fixed pattern).
    ctx.fillStyle = 'rgba(90,45,10,0.28)';
    for (let i = 0; i < 160; i++) {
      const px = bx + ((i * 73.7) % bw);
      const py = by + ((i * 41.3 + (i % 7) * 13) % bh);
      ctx.fillRect(px, py, 2, 2);
    }
    for (const b of this.balloons) this._drawBalloon(ctx, b, t);

    drawSign(ctx, W / 2, by - 50, 'POP-A-BALLOON', '#ffcf3f', '#4f2287', 16);

    if (this.dart) this._drawDart(ctx, this.dart.x, this.dart.y, this.dart.angle, 1, false);

    const counterY = H - 122;
    drawCounter(ctx, W, H, counterY, 'purple');
    // Darts waiting on the counter.
    const left = this.attemptsLeft - (this.dart ? 1 : 0);
    for (let i = 0; i < left; i++) {
      const dx = W / 2 + (i - (left - 1) / 2) * 36;
      this._drawDart(ctx, dx, counterY - 6, -Math.PI / 2 + 0.12, 1.25, false);
    }

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawBalloon(ctx, b, t) {
    const r = b.r;
    if (b.popped) {
      // Rubber scrap left on the pin.
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(b.hx - 6, b.y + r * 1.15);
      ctx.lineTo(b.hx + 2, b.y + r * 0.9);
      ctx.lineTo(b.hx + 7, b.y + r * 1.2);
      ctx.lineTo(b.hx, b.y + r * 1.3);
      ctx.closePath();
      ctx.fill();
      this._pin(ctx, b.hx, b.y + r * 1.2);
      return;
    }
    const x = b.x, y = b.y + Math.sin(t * 2 + b.phase) * 2;
    // String down to the board.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 1.25);
    ctx.quadraticCurveTo(x + (b.hx - x) * 0.5 + 6, y + r * 1.9, b.hx, y + r * 2.4);
    ctx.stroke();
    this._pin(ctx, b.hx, y + r * 2.4);
    // Body.
    ctx.fillStyle = shade(b.color, -0.25);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.08, y - r * 0.08, r * 0.9, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Knot.
    ctx.fillStyle = shade(b.color, -0.25);
    ctx.beginPath();
    ctx.moveTo(x, y + r * 1.15);
    ctx.lineTo(x - 5, y + r * 1.32);
    ctx.lineTo(x + 5, y + r * 1.32);
    ctx.closePath();
    ctx.fill();
    // Shine.
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.38, y - r * 0.5, r * 0.18, r * 0.32, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.82, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
    // Point value.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.font = '900 18px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(String(b.points), x, y + 2);
    ctx.fillText(String(b.points), x, y + 2);
  }

  _pin(ctx, x, y) {
    ctx.fillStyle = '#e0303e';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x - 1.5, y - 1.5, 1.2, 1.2);
  }

  // A throwing dart pointing along `angle` (tip at x,y).
  _drawDart(ctx, x, y, angle, s = 1, stuck = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    // Tip.
    ctx.strokeStyle = '#d8dde6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(stuck ? -2 : 0, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
    // Barrel.
    ctx.fillStyle = '#3a3f4a';
    rr(ctx, -30, -3, 19, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#ffcf3f';
    ctx.fillRect(-24, -3, 3, 6);
    // Shaft + flights.
    ctx.strokeStyle = '#7a4416';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-44, 0);
    ctx.stroke();
    ctx.fillStyle = '#ff4f8b';
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.lineTo(-48, -8);
    ctx.lineTo(-50, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4fd1ff';
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.lineTo(-48, 8);
    ctx.lineTo(-50, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  getResult() {
    const allPopped = this.balloons.every((b) => b.popped);
    return {
      gameKey: 'darts',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: allPopped,
      coinBonus: allPopped ? 20 : 0,
    };
  }
}

// Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
