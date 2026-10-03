// Goldfish Toss: toss ping-pong balls into fishbowls. 5 balls. Three bowls at
// increasing distances — near (3 pts), mid (5 pts), far (8 pts). Swipe UP
// to throw; the lateral angle steers left/right toward the target bowls.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawCounter, drawFloor, drawSign, contactShadow, rr } from '../ui/BoothStage.js';
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
    const t = this.t || 0;
    const shelfY = this.bowls[0].y;
    const tableY = shelfY + 30;
    const counterY = H - 122;
    drawBoothBack(ctx, W, H, 'aqua', t);
    drawFloor(ctx, W, tableY + 150, counterY);

    // Prize goldfish in water bags hanging from a line.
    ctx.strokeStyle = 'rgba(60,30,20,0.7)';
    ctx.lineWidth = 1.5;
    const lineY = H * 0.14;
    ctx.beginPath();
    ctx.moveTo(14, lineY);
    ctx.quadraticCurveTo(W / 2, lineY + 24, W - 14, lineY);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.5) / 5;
      const bx = 14 + (W - 28) * u;
      const by = lineY + 48 * u * (1 - u) + 4;
      this._drawFishBag(ctx, bx, by, t + i);
    }
    drawSign(ctx, W / 2, shelfY - 118, 'WIN A GOLDFISH!', '#ffcf3f', '#126c94', 16);

    // Table with a ruffled cloth.
    const top = ctx.createLinearGradient(0, tableY - 6, 0, tableY + 8);
    top.addColorStop(0, '#f2c27f');
    top.addColorStop(1, '#a5662e');
    ctx.fillStyle = top;
    ctx.fillRect(16, tableY - 6, W - 32, 14);
    // Long cloth skirt down to the floor.
    const skirt = 142;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(16, tableY + 8, W - 32, skirt);
    ctx.fillStyle = '#2bb6e6';
    for (let x = 16; x < W - 16; x += 22) ctx.fillRect(x, tableY + 8, 11, skirt);
    const shade = ctx.createLinearGradient(0, tableY + 8, 0, tableY + 8 + skirt);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,30,60,0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(16, tableY + 8, W - 32, skirt);
    ctx.fillStyle = '#ff6fae';
    ctx.fillRect(16, tableY + 8, W - 32, 6);
    for (let x = 22; x < W - 16; x += 14) {
      ctx.beginPath();
      ctx.arc(x, tableY + 14, 6, 0, Math.PI);
      ctx.fill();
    }

    for (const b of this.bowls) this._drawBowl(ctx, b, tableY, t);

    // Ping-pong ball in flight: shrinks as it flies "away" up the screen.
    if (this.ball) {
      const k = Math.max(0.6, Math.min(1.2, this.ball.y / this.throwY));
      contactShadow(ctx, this.ball.x, Math.min(this.ball.y + 30 * k, counterY - 2), 8 * k, 3 * k, 0.15);
      this._drawPingPong(ctx, this.ball.x, this.ball.y, 10 * k);
    }

    drawCounter(ctx, W, H, counterY, 'aqua');
    // Bucket of ping-pong balls on the counter.
    const left = this.attemptsLeft - (this.ball ? 1 : 0);
    const bkx = this.throwX, bky = counterY + 2;
    for (let i = 0; i < left; i++) {
      this._drawPingPong(ctx, bkx - 16 + (i % 3) * 16, bky - 30 - Math.floor(i / 3) * 10, 9);
    }
    const bg = ctx.createLinearGradient(bkx - 28, 0, bkx + 28, 0);
    bg.addColorStop(0, '#d6283a');
    bg.addColorStop(0.5, '#ff6b7a');
    bg.addColorStop(1, '#a8182a');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(bkx - 30, bky - 28);
    ctx.lineTo(bkx + 30, bky - 28);
    ctx.lineTo(bkx + 24, bky);
    ctx.lineTo(bkx - 24, bky);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bkx - 30, bky - 28, 60, 4);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawPingPong(ctx, x, y, r) {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9dde6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawGoldfish(ctx, x, y, s, flip, t) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.rotate(Math.PI);
    const wag = Math.sin(t * 9) * 0.35;
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * s, 5.5 * s, flip ? Math.PI : 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.moveTo(-7 * s, 0);
    ctx.lineTo(-15 * s, -6 * s + wag * 6 * s);
    ctx.lineTo(-15 * s, 6 * s + wag * 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4.5 * s, -1.5 * s * (flip ? -1 : 1), 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(5 * s, -1.5 * s * (flip ? -1 : 1), 0.9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawFishBag(ctx, x, y, t) {
    const sway = Math.sin(t * 1.5) * 2;
    ctx.fillStyle = 'rgba(190,235,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.quadraticCurveTo(x - 24 + sway, y + 30, x - 18 + sway, y + 50);
    ctx.quadraticCurveTo(x + sway, y + 64, x + 18 + sway, y + 50);
    ctx.quadraticCurveTo(x + 24 + sway, y + 30, x + 3, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ff6fae';
    ctx.fillRect(x - 5, y - 2, 10, 5);
    this._drawGoldfish(ctx, x + sway + Math.sin(t * 2) * 5, y + 40, 0.9, Math.cos(t * 2) < 0, t);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x - 13 + sway, y + 26, 2.5, 12);
  }

  _drawBowl(ctx, b, tableY, t) {
    const R = b.r * 1.45; // drawn a touch larger than the catch zone
    const cy = tableY - R * 0.9;
    contactShadow(ctx, b.x, tableY + 1, R * 0.8, 5, 0.35);
    // Water.
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const wy = cy - R * 0.25;
    const wg = ctx.createLinearGradient(0, wy, 0, cy + R);
    wg.addColorStop(0, '#7fdcff');
    wg.addColorStop(1, '#1f8fd6');
    ctx.fillStyle = wg;
    ctx.fillRect(b.x - R, wy, R * 2, R * 2);
    // Gravel.
    const gravel = ['#ff6fae', '#ffd23f', '#3ddc97', '#b07cff'];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = gravel[i % 4];
      ctx.beginPath();
      ctx.arc(b.x - R + 6 + ((i * 13.7) % (R * 2 - 12)), cy + R - 5 - (i % 3) * 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fish swimming back and forth.
    const sx = Math.sin(t * 1.3 + b.x) * R * 0.45;
    this._drawGoldfish(ctx, b.x + sx, cy + R * 0.2, 1.1, Math.cos(t * 1.3 + b.x) < 0, t);
    // Won: the ball bobs in the water.
    if (b.hit) this._drawPingPong(ctx, b.x - sx * 0.5, wy + 2 + Math.sin(t * 3) * 1.5, 8);
    ctx.restore();
    // Glass.
    ctx.fillStyle = 'rgba(200,240,255,0.18)';
    ctx.beginPath();
    ctx.arc(b.x, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,250,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Rim opening.
    ctx.fillStyle = 'rgba(20,60,90,0.55)';
    ctx.beginPath();
    ctx.ellipse(b.x, cy - R * 0.82, R * 0.58, R * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(b.x - R * 0.5, cy - R * 0.3, R * 0.1, R * 0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Points tag.
    ctx.fillStyle = b.color;
    rr(ctx, b.x - 22, tableY + 30, 44, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 13px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${b.pts} PTS`, b.x, tableY + 41.5);
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
