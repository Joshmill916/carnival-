// Bottle Knockdown: swipe up to throw a baseball at a stacked pyramid of bottles.
// Knocked bottles cascade into each other. 2 balls; clear them all for a coin bonus.
import { MiniGame } from './MiniGame.js';
import { drawSpace } from '../ui/Backdrop.js';
import { drawBottle, drawBall } from '../ui/Sprites.js';
import { circleHit } from '../core/util.js';
import { Audio } from '../core/Audio.js';

const KNOCK_DIST = 34; // displacement from home before a bottle counts as down

export class BottleKnockdown extends MiniGame {
  static key = 'bottles';
  static label = 'Bottle Knockdown';

  init() {
    this.attemptsLeft = 2;
    this.hint = 'Swipe up to throw the ball';
    const W = this.view.w, H = this.view.h;
    this.launch = { x: W / 2, y: H - 80 };
    this.ball = null;

    // Pyramid: 3 bottom, 2 middle, 1 top.
    this.bottles = [];
    const r = 20;
    const cx = W / 2;
    const baseY = H * 0.42;
    const layout = [
      { n: 3, y: baseY },
      { n: 2, y: baseY - 52 },
      { n: 1, y: baseY - 104 },
    ];
    for (const row of layout) {
      const spacing = r * 2.4;
      const startX = cx - ((row.n - 1) * spacing) / 2;
      for (let i = 0; i < row.n; i++) {
        const x = startX + i * spacing;
        this.bottles.push({ x, y: row.y, hx: x, hy: row.y, vx: 0, vy: 0, r, angle: 0, down: false });
      }
    }
  }

  handleInput(input) {
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -50) {
      this._throw(g);
    }
  }

  _throw(g) {
    const scale = 0.5;
    this.ball = {
      x: this.launch.x,
      y: this.launch.y,
      vx: g.vx * scale,
      vy: Math.min(g.vy * scale, -320),
      r: 12,
    };
    this.phase = 'fly';
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    if (this.phase === 'aim' || this.phase === 'done') return;

    const b = this.ball;
    if (b) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 60 * dt; // slight gravity
      // Ball vs standing bottles.
      for (const bo of this.bottles) {
        if (bo.down) continue;
        if (circleHit(b.x, b.y, b.r, bo.x, bo.y, bo.r)) {
          const nx = bo.x - b.x, ny = bo.y - b.y;
          const len = Math.hypot(nx, ny) || 1;
          const speed = Math.hypot(b.vx, b.vy);
          bo.vx += (nx / len) * speed * 0.6 + b.vx * 0.3;
          bo.vy += (ny / len) * speed * 0.6 + b.vy * 0.3;
          b.vx *= 0.35;
          b.vy *= 0.35;
          Audio.hit();
        }
      }
      if (b.y < -60 || b.x < -60 || b.x > this.view.w + 60 || Math.hypot(b.vx, b.vy) < 20) {
        this.ball = null;
        this.phase = 'settle';
        this.settleT = 0;
      }
    }

    // Bottle motion + bottle-bottle collisions.
    let moving = false;
    for (const bo of this.bottles) {
      if (bo.vx || bo.vy) {
        bo.x += bo.vx * dt;
        bo.y += bo.vy * dt;
        bo.vx *= 1 - 2.6 * dt; // friction
        bo.vy *= 1 - 2.6 * dt;
        bo.angle += (bo.vx * dt) / 30;
        if (Math.hypot(bo.vx, bo.vy) < 6) {
          bo.vx = bo.vy = 0;
        } else {
          moving = true;
        }
        if (!bo.down && Math.hypot(bo.x - bo.hx, bo.y - bo.hy) > KNOCK_DIST) {
          bo.down = true;
          this.particles.burst(bo.x, bo.y, '#3ddc97', 8);
        }
      }
    }
    // Resolve overlaps between bottles (cheap push-apart + velocity share).
    for (let i = 0; i < this.bottles.length; i++) {
      for (let j = i + 1; j < this.bottles.length; j++) {
        const a = this.bottles[i], c = this.bottles[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + c.r;
        if (d > 0 && d < min) {
          const nx = dx / d, ny = dy / d;
          const overlap = (min - d) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;
          const av = a.vx * nx + a.vy * ny;
          const cv = c.vx * nx + c.vy * ny;
          a.vx += (cv - av) * nx * 0.5; a.vy += (cv - av) * ny * 0.5;
          c.vx += (av - cv) * nx * 0.5; c.vy += (av - cv) * ny * 0.5;
          moving = true;
        }
      }
    }

    if (this.phase === 'settle') {
      this.settleT += dt;
      if (!moving && this.settleT > 0.3) this._endThrow();
    }
  }

  _endThrow() {
    this.attempts++;
    this.attemptsLeft--;
    const allDown = this.bottles.every((b) => b.down);
    if (this.attemptsLeft <= 0 || allDown) {
      this.score = this.bottles.filter((b) => b.down).length;
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      this.hint = 'Swipe up to throw the ball';
    }
  }

  render(ctx) {
    drawSpace(ctx, this.view.w, this.view.h, this.t);
    // Shelf.
    ctx.fillStyle = '#5a4424';
    ctx.fillRect(0, this.view.h * 0.42 + 22, this.view.w, 10);

    for (const bo of this.bottles) drawBottle(ctx, bo);
    if (this.ball) drawBall(ctx, this.ball.x, this.ball.y, this.ball.r);
    // Live score = bottles currently down.
    this.score = this.bottles.filter((b) => b.down).length;
    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  getResult() {
    const down = this.bottles.filter((b) => b.down).length;
    const allDown = down === this.bottles.length;
    return {
      gameKey: 'bottles',
      score: down,
      hits: down,
      attempts: this.attempts,
      won: down > 0,
      bigWin: allDown,
      coinBonus: allDown ? 30 : 0,
    };
  }
}
