// Bottle Knockdown: swipe up to throw a baseball at a stacked pyramid of bottles.
// Knocked bottles cascade into each other. 2 balls; clear them all for a coin bonus.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawCounter, drawFloor, drawBaseball, contactShadow, drawSign, rr } from '../ui/BoothStage.js';
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
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    const tableY = H * 0.42 + 26; // bottom of the pyramid's base row
    const counterY = H - 122;
    drawBoothBack(ctx, W, H, 'blue', t);
    drawFloor(ctx, W, tableY + 70, counterY);
    drawSign(ctx, W / 2, H * 0.42 - 205, 'KNOCK \'EM ALL DOWN!', '#ffcf3f', '#1d3f8f', 15);

    // Display table with a ruffled cloth.
    const tw = W * 0.74, tx = W / 2 - tw / 2;
    ctx.fillStyle = '#6b3a14';
    ctx.fillRect(tx + 10, tableY + 50, 10, 30);
    ctx.fillRect(tx + tw - 20, tableY + 50, 10, 30);
    const top = ctx.createLinearGradient(0, tableY - 4, 0, tableY + 10);
    top.addColorStop(0, '#f2c27f');
    top.addColorStop(1, '#a5662e');
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(tx + 14, tableY - 6);
    ctx.lineTo(tx + tw - 14, tableY - 6);
    ctx.lineTo(tx + tw, tableY + 8);
    ctx.lineTo(tx, tableY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx, tableY + 8, tw, 44);
    ctx.fillStyle = '#2f6fe0';
    for (let x = tx; x < tx + tw; x += 20) ctx.fillRect(x, tableY + 8, 10, 44);
    ctx.fillStyle = '#ffcf3f';
    for (let x = tx + 6; x < tx + tw; x += 14) {
      ctx.beginPath();
      ctx.arc(x, tableY + 52, 6, 0, Math.PI);
      ctx.fill();
    }

    // Standing bottles first (back rows up top), knocked ones drawn over.
    const order = [...this.bottles].sort((a, b) => (a.down - b.down) || (a.y - b.y));
    for (const bo of order) this._drawMilkBottle(ctx, bo);

    if (this.ball) {
      const b = this.ball;
      const depth = Math.max(0.6, Math.min(1.25, b.y / (H * 0.8)));
      drawBaseball(ctx, b.x, b.y, b.r * depth * 1.15, t * 14);
    }

    drawCounter(ctx, W, H, counterY, 'blue');
    // Balls waiting on the counter.
    const left = this.attemptsLeft - (this.ball ? 1 : 0);
    for (let i = 0; i < left; i++) {
      const bx = this.launch.x + (i - (left - 1) / 2) * 34;
      contactShadow(ctx, bx, counterY + 4, 14, 4, 0.35);
      drawBaseball(ctx, bx, counterY - 12, 14, 0.4 + i);
    }

    // Live score = bottles currently down.
    this.score = this.bottles.filter((b) => b.down).length;
    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  // Classic carnival milk bottle: white glass, red bands, foil cap.
  _drawMilkBottle(ctx, b) {
    const r = b.r * 1.3;
    ctx.save();
    ctx.translate(b.x, b.y + b.r * 0.3);
    ctx.rotate(b.angle || 0);
    if (b.down) ctx.globalAlpha = 0.85;
    const bodyW = r * 1.5, bodyTop = -r * 0.55, bottom = r;
    const neckW = r * 0.8, neckTop = -r * 1.45;
    // Silhouette.
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, bottom);
    ctx.lineTo(-bodyW / 2, bodyTop);
    ctx.quadraticCurveTo(-bodyW / 2, bodyTop - r * 0.35, -neckW / 2, bodyTop - r * 0.5);
    ctx.lineTo(-neckW / 2, neckTop);
    ctx.lineTo(neckW / 2, neckTop);
    ctx.lineTo(neckW / 2, bodyTop - r * 0.5);
    ctx.quadraticCurveTo(bodyW / 2, bodyTop - r * 0.35, bodyW / 2, bodyTop);
    ctx.lineTo(bodyW / 2, bottom);
    ctx.closePath();
    const g = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
    g.addColorStop(0, '#c9d2dc');
    g.addColorStop(0.35, '#ffffff');
    g.addColorStop(1, '#aab4c0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,50,70,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Red bands.
    ctx.fillStyle = '#e0303e';
    ctx.fillRect(-bodyW / 2, r * 0.05, bodyW, r * 0.32);
    ctx.fillRect(-bodyW / 2, r * 0.55, bodyW, r * 0.14);
    // Foil cap.
    ctx.fillStyle = '#ffcf3f';
    rr(ctx, -neckW / 2 - 1, neckTop - 3, neckW + 2, 6, 2);
    ctx.fill();
    // Glass highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-bodyW * 0.3, bodyTop + 2, r * 0.16, r * 0.45);
    ctx.restore();
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
