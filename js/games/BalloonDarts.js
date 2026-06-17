// Balloon Darts: tap a balloon (or flick toward it) to throw a dart. Balloons
// drift side to side; colour = point value. 5 darts.
import { MiniGame } from './MiniGame.js';
import { drawBalloon, drawDart } from '../ui/Sprites.js';
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
    const r = 24;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tier = this.rng.pick(TIERS);
        const x = (W * (col + 1)) / (cols + 1);
        const y = H * 0.18 + row * (r * 2.6);
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
    ctx.fillStyle = '#2b1d3a';
    ctx.fillRect(0, 0, this.view.w, this.view.h);
    for (const b of this.balloons) drawBalloon(ctx, b);
    // Launch hand marker.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(this.launch.x, this.launch.y, 16, 0, Math.PI * 2);
    ctx.fill();
    if (this.dart) drawDart(ctx, this.dart.x, this.dart.y, this.dart.angle);
    this.particles.render(ctx);
    this._drawHud(ctx);
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
