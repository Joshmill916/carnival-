// Basket Toss: throw a softball so it bounces off an angled wooden board and
// lands in the basket. Swipe UP (with optional lateral lean) to throw. 3 tries.
import { MiniGame } from './MiniGame.js';
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
    ctx.fillStyle = '#1a2a14';
    ctx.fillRect(0, 0, W, H);

    // Ground.
    ctx.fillStyle = '#3a2e20';
    ctx.fillRect(0, H * 0.78, W, H * 0.22);

    // Angled wooden board.
    const { boardA: A, boardB: B } = this;
    ctx.strokeStyle = '#c8a060';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
    ctx.strokeStyle = '#8b6343';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Board support leg.
    ctx.strokeStyle = '#7a5530';
    ctx.lineWidth = 6;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(B.x, H * 0.78);
    ctx.stroke();

    // Basket.
    const bx = this.basketX, by = this.basketY;
    ctx.strokeStyle = '#c8a060';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    // Rim.
    ctx.beginPath();
    ctx.ellipse(bx, by, this.basketR, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Net lines.
    ctx.strokeStyle = '#a08048';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(bx + i * this.basketR * 0.7, by + 4);
      ctx.lineTo(bx + i * this.basketR * 0.3, by + 28);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(bx - this.basketR * 0.6, by + 16);
    ctx.lineTo(bx + this.basketR * 0.6, by + 16);
    ctx.stroke();
    // Back of basket.
    ctx.strokeStyle = '#c8a060';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bx - this.basketR, by + 4);
    ctx.lineTo(bx - this.basketR * 0.3, by + 32);
    ctx.lineTo(bx + this.basketR * 0.3, by + 32);
    ctx.lineTo(bx + this.basketR, by + 4);
    ctx.stroke();

    // Throw zone marker.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.throwX, this.throwY, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Ball.
    if (this.ball) {
      const br = 13;
      ctx.fillStyle = '#e8c878';
      ctx.strokeStyle = '#c8a050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.ball.x, this.ball.y, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Seam lines.
      ctx.strokeStyle = '#c87038';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.ball.x + br * 0.3, this.ball.y, br * 0.7, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
    }

    // Thrower.
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧑', this.throwX, H * 0.70);

    this.particles.render(ctx);
    this._drawHud(ctx);
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
