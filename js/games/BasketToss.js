// Basket Toss: throw a softball so it bounces off an angled wooden board and
// lands in the basket. Swipe UP (with optional lateral lean) to throw. 3 tries.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawFloor, drawPrizeShelf, drawSign, contactShadow, rr } from '../ui/BoothStage.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

const GRAVITY = 900; // px/s^2

export class BasketToss extends MiniGame {
  static key = 'basket';
  static label = 'Basket Toss';

  init() {
    this.attemptsLeft = 3;
    this.hint = 'Swipe UP to toss at the board! 🧺';
    const W = this.view.w, H = this.view.h;

    this.throwX  = W * 0.14;
    this.throwY  = H * 0.72;

    // Angled board: defined by two endpoints.
    this.boardA  = { x: W * 0.52, y: H * 0.32 };
    this.boardB  = { x: W * 0.72, y: H * 0.64 };

    // Basket opening at far right.
    this.basketX = W * 0.84;
    this.basketY = H * 0.70;
    this.basketR = 26;

    this.ball    = null;
    this.bounced = false;
  }

  handleInput(input) {
    if (this.phase !== 'aim' || this.ball) return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -120) {
      const speedY = clamp(Math.abs(g.vy), 200, 2800);
      const speedX = clamp(g.vx, -900, 900);
      // Normalize so a pure-up flick aims toward the board.
      const vx = speedX * 0.28 + 140;
      const vy = -(speedY * 0.52);
      this._throw(vx, vy);
    }
  }

  _throw(vx, vy) {
    this.ball = { x: this.throwX, y: this.throwY, vx, vy, bounced: false };
    this.phase = 'fly';
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    if (this.phase !== 'fly' || !this.ball) return;
    const b = this.ball;
    b.vy += GRAVITY * dt;
    b.x  += b.vx * dt;
    b.y  += b.vy * dt;

    // Board collision (only once per throw, going right).
    if (!b.bounced && b.vx > 0) {
      if (this._hitBoard(b)) {
        this._reflectOffBoard(b);
        b.bounced = true;
        Audio.hit();
      }
    }

    // Off-screen or below floor.
    if (b.y > this.view.h + 40 || b.x > this.view.w + 40 || b.x < -40) {
      this._scoreThrow(false);
      return;
    }

    // Basket collision: check when ball is moving downward into basket zone.
    if (b.vy > 0 && b.bounced) {
      const dx = b.x - this.basketX;
      const dy = b.y - this.basketY;
      if (Math.sqrt(dx * dx + dy * dy) < this.basketR + 8) {
        this._scoreThrow(true);
      }
    }
  }

  _hitBoard(b) {
    // Signed distance from ball to the board line segment.
    const { boardA: A, boardB: B } = this;
    const abx = B.x - A.x, aby = B.y - A.y;
    const len = Math.sqrt(abx * abx + aby * aby);
    const nx = -aby / len, ny = abx / len; // left-facing normal
    const dot = (b.x - A.x) * nx + (b.y - A.y) * ny;
    if (Math.abs(dot) > 14) return false;
    // Check projection is within segment.
    const t = ((b.x - A.x) * abx + (b.y - A.y) * aby) / (len * len);
    return t >= -0.05 && t <= 1.05;
  }

  _reflectOffBoard(b) {
    const { boardA: A, boardB: B } = this;
    const abx = B.x - A.x, aby = B.y - A.y;
    const len = Math.sqrt(abx * abx + aby * aby);
    // Normal pointing away from thrower (right-ish).
    let nx = aby / len, ny = -abx / len;
    if (nx < 0) { nx = -nx; ny = -ny; }
    const dot = b.vx * nx + b.vy * ny;
    b.vx = (b.vx - 2 * dot * nx) * 0.72;
    b.vy = (b.vy - 2 * dot * ny) * 0.72;
  }

  _scoreThrow(landed) {
    const pts = landed ? 10 : 0;
    if (landed) {
      this.score += pts;
      this.hits++;
      this.particles.text(this.basketX, this.basketY - 30, `+${pts}`, '#ffd14d', 24);
      this.particles.burst(this.basketX, this.basketY, '#ffd14d', 18, 200);
      Audio.win();
    } else {
      Audio.fail();
    }
    this.ball = null;
    this.attempts++;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      this.hint = 'Swipe UP to toss at the board! 🧺';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    const groundY = H * 0.78;
    drawBoothBack(ctx, W, H, 'orange', t);
    drawFloor(ctx, W, groundY, H);
    drawPrizeShelf(ctx, 30, W - 30, H * 0.2, ['🐻', '🦒', '🧺', '🐙', '🦊', '🐧'], 32);

    // Angled backboard on a stand.
    const { boardA: A, boardB: B } = this;
    contactShadow(ctx, B.x, groundY + 4, 40, 7, 0.35);
    ctx.strokeStyle = '#5a2c0c';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(B.x - 6, groundY);
    ctx.moveTo((A.x + B.x) / 2 + 10, (A.y + B.y) / 2);
    ctx.lineTo(B.x + 26, groundY);
    ctx.stroke();
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    ctx.save();
    ctx.translate(A.x, A.y);
    ctx.rotate(ang);
    const bg = ctx.createLinearGradient(0, -12, 0, 12);
    bg.addColorStop(0, '#f2c27f');
    bg.addColorStop(1, '#b8742f');
    ctx.fillStyle = bg;
    rr(ctx, -4, -9, len + 8, 18, 4);
    ctx.fill();
    ctx.strokeStyle = '#7a4416';
    ctx.lineWidth = 2;
    rr(ctx, -4, -9, len + 8, 18, 4);
    ctx.stroke();
    // Painted aim stripes.
    ctx.fillStyle = '#e0303e';
    ctx.fillRect(len * 0.35, -9, len * 0.3, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(len * 0.45, -9, len * 0.1, 18);
    ctx.restore();

    // Bushel basket.
    this._drawBasket(ctx, this.basketX, this.basketY, this.basketR, groundY);

    drawSign(ctx, W / 2, H * 0.2 - 92, 'BANK IT IN THE BASKET!', '#ffcf3f', '#9a3d0c', 14);

    // Bucket of softballs by the thrower.
    const bkx = this.throwX + 34, bky = groundY;
    const left = this.attemptsLeft - (this.ball ? 1 : 0);
    for (let i = 0; i < left; i++) this._drawSoftball(ctx, bkx - 8 + i * 9, bky - 30 - (i % 2) * 4, 9);
    ctx.fillStyle = '#9aa3b2';
    ctx.beginPath();
    ctx.moveTo(bkx - 18, bky - 28);
    ctx.lineTo(bkx + 26, bky - 28);
    ctx.lineTo(bkx + 20, bky);
    ctx.lineTo(bkx - 12, bky);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9d0db';
    ctx.fillRect(bkx - 18, bky - 28, 44, 4);

    // Thrower.
    ctx.font = '56px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000000';
    ctx.fillText('🧑', this.throwX - 4, groundY + 4);

    // Ball in flight.
    if (this.ball) this._drawSoftball(ctx, this.ball.x, this.ball.y, 13);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawSoftball(ctx, x, y, r) {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#fff7b0');
    g.addColorStop(1, '#d8c23a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d6283a';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(x - r * 1.3, y, r, -0.6, 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 1.3, y, r, Math.PI - 0.6, Math.PI + 0.6);
    ctx.stroke();
  }

  _drawBasket(ctx, bx, by, r, groundY) {
    const topW = r * 1.25, botW = r * 0.8, bot = groundY - 2;
    contactShadow(ctx, bx, groundY + 3, topW, 6, 0.35);
    // Body (woven slats).
    const g = ctx.createLinearGradient(bx - topW, 0, bx + topW, 0);
    g.addColorStop(0, '#9a5a24');
    g.addColorStop(0.5, '#e8b46a');
    g.addColorStop(1, '#8a4a18');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - topW, by);
    ctx.lineTo(bx + topW, by);
    ctx.lineTo(bx + botW, bot);
    ctx.lineTo(bx - botW, bot);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,44,12,0.55)';
    ctx.lineWidth = 1.5;
    for (let k = 1; k < 6; k++) {
      const u = k / 6;
      ctx.beginPath();
      ctx.moveTo(bx - topW + (topW - botW) * u, by + (bot - by) * u);
      ctx.lineTo(bx + topW - (topW - botW) * u, by + (bot - by) * u);
      ctx.stroke();
    }
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(bx + k * topW * 0.4, by);
      ctx.lineTo(bx + k * botW * 0.4, bot);
      ctx.stroke();
    }
    // Red band + rim with dark opening.
    ctx.fillStyle = '#e0303e';
    ctx.beginPath();
    ctx.moveTo(bx - topW * 0.95, by + 10);
    ctx.lineTo(bx + topW * 0.95, by + 10);
    ctx.lineTo(bx + topW * 0.92, by + 16);
    ctx.lineTo(bx - topW * 0.92, by + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a1a08';
    ctx.beginPath();
    ctx.ellipse(bx, by, topW, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c98e4a';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  getResult() {
    return {
      gameKey: 'basket',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: this.hits >= 3,
      coinBonus: this.hits >= 3 ? 20 : 0,
    };
  }
}
