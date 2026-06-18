// Goldfish Toss: toss ping-pong balls into fishbowls. 5 balls. Three bowls at
// increasing distances — near (3 pts), mid (5 pts), far (8 pts). Swipe UP
// to throw; the lateral angle steers left/right toward the target bowls.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

const GRAVITY = 800;

const BOWLS = [
  { pts: 3, color: '#ff8f4d', water: '#5bc8e8aa' },
  { pts: 5, color: '#ff5d8f', water: '#a0e8a0aa' },
  { pts: 8, color: '#b07cff', water: '#ffd14daa' },
];

export class GoldfishToss extends MiniGame {
  static key = 'goldfish';
  static label = 'Goldfish Toss';

  init() {
    this.attemptsLeft = 5;
    this.hint = 'Swipe UP toward a bowl! 🐟';
    const W = this.view.w, H = this.view.h;
    this.cx = W / 2;

    // Throw origin (bottom-center).
    this.throwX = W * 0.50;
    this.throwY = H * 0.82;

    // Bowl positions (spread horizontally on a shelf).
    const shelfY = H * 0.38;
    const spacing = W * 0.22;
    this.bowls = BOWLS.map((def, i) => ({
      ...def,
      x: this.cx + (i - 1) * spacing,
      y: shelfY,
      r: 28 - i * 2,   // near bowl widest, far bowl narrowest
      hit: false,
    }));

    this.ball = null;
  }

  handleInput(input) {
    if (this.phase !== 'aim' || this.ball) return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -120) {
      const vy = -clamp(Math.abs(g.vy) * 0.55, 200, 900);
      const vx = clamp(g.vx * 0.30, -350, 350);
      this._toss(vx, vy);
    }
  }

  _toss(vx, vy) {
    this.ball = { x: this.throwX, y: this.throwY, vx, vy };
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

    // Check each bowl.
    for (const bowl of this.bowls) {
      const dx = b.x - bowl.x;
      const dy = b.y - bowl.y;
      if (Math.sqrt(dx * dx + dy * dy) < bowl.r + 6) {
        this._scoreToss(bowl);
        return;
      }
    }

    // Off screen.
    if (b.y > this.view.h + 20 || b.x < -20 || b.x > this.view.w + 20) {
      this._scoreToss(null);
    }
  }

  _scoreToss(bowl) {
    if (bowl) {
      bowl.hit = true;
      this.score += bowl.pts;
      this.hits++;
      this.particles.text(bowl.x, bowl.y - 40, `+${bowl.pts}`, bowl.color, 22);
      this.particles.burst(bowl.x, bowl.y, bowl.color, 14, 160);
      // Goldfish splash effect.
      this.particles.text(bowl.x, bowl.y, '🐟', '#5bc8e8', 20);
      if (bowl.pts >= 8) Audio.win(); else Audio.hit();
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
      this.hint = 'Swipe UP toward a bowl! 🐟';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Shelf backdrop.
    ctx.fillStyle = '#2e1f0e';
    ctx.fillRect(0, H * 0.44, W, H * 0.10);
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(0, H * 0.42, W, 10);

    // Draw bowls.
    for (const b of this.bowls) {
      // Glass bowl body.
      ctx.save();
      ctx.globalAlpha = b.hit ? 0.5 : 1;

      // Bowl outline.
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 4;
      ctx.fillStyle = 'rgba(20,20,60,0.85)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Water surface.
      ctx.fillStyle = b.water;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y - b.r * 0.1, b.r * 0.9, b.r * 0.28, 0, 0, Math.PI);
      ctx.fill();

      // Goldfish inside (if not yet hit).
      if (!b.hit) {
        ctx.font = `${Math.round(b.r * 0.8)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐟', b.x, b.y + b.r * 0.15);
      }

      // Point label above bowl.
      ctx.fillStyle = b.color;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${b.pts}pts`, b.x, b.y - b.r - 6);

      ctx.restore();
    }

    // Throw zone.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.throwX, this.throwY, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Ping-pong ball in-flight.
    if (this.ball) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.ball.x, this.ball.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Thrower.
    ctx.font = '30px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧑', this.throwX, H * 0.90);

    // Remaining balls indicator.
    for (let i = 0; i < this.attemptsLeft && this.phase !== 'done'; i++) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(W * 0.5 - (this.attemptsLeft - 1) * 13 / 2 + i * 13, H * 0.96, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  getResult() {
    return {
      gameKey: 'goldfish',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: this.score >= 13,
      coinBonus: this.score >= 13 ? 15 : 0,
    };
  }
}
