// Rail Bowling: swipe UP hard to roll a bowling ball along a raised rail.
// The rail has a bump near the far end. Too weak = rolls back. Too strong =
// flies off the far end. Hit the sweet spot to land it on the far side. 3 rolls.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawFloor, drawPrizeShelf, drawSign, contactShadow, rr } from '../ui/BoothStage.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

// Visual exaggeration of the hump height (physics uses bumpH as-is).
const VIS_BUMP = 1.8;

export class RailBowling extends MiniGame {
  static key = 'railbowl';
  static label = 'Rail Bowling';

  init() {
    this.attemptsLeft = 3;
    this.hint = 'Swipe UP to roll — clear the bump! 🎳';
    const W = this.view.w, H = this.view.h;

    // Rail geometry (in screen coords, left = player end, right = far end).
    this.railLeft  = W * 0.08;
    this.railRight = W * 0.92;
    this.railLen   = this.railRight - this.railLeft;
    this.railY     = H * 0.6;      // rail surface y

    // Bump position and height.
    this.bumpX     = this.railLeft + this.railLen * 0.62;
    this.bumpH     = 38;           // visual height of the bump

    this.ball = null;
    this.markerX = null;     // where ball stopped last roll
    this.markerColor = '#888';
  }

  handleInput(input) {
    if (this.phase !== 'aim' || this.ball) return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -100) {
      const power = clamp((Math.abs(g.vy) - 100) / 2200, 0.02, 1);
      this._roll(power);
    }
  }

  _roll(power) {
    // Initial velocity scales with power; needs ~0.50+ power to clear the bump.
    const maxV = 820; // px/s at full power
    this.ball = {
      x: this.railLeft + 18,
      vx: power * maxV,
      onFarSide: false,
      done: false,
    };
    this.phase = 'fly';
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    if (this.phase !== 'fly' || !this.ball) return;
    const b = this.ball;

    // Friction.
    const friction = 180; // px/s^2 deceleration
    b.vx = Math.max(0, b.vx - friction * dt);

    b.x += b.vx * dt;

    // Near the bump: apply an energy penalty (simulates climbing the hump).
    const distToBump = b.x - this.bumpX;
    if (distToBump >= -4 && distToBump <= 4 && !b.onFarSide) {
      // Energy needed to clear bump (½mv² >= mgh, use unit mass).
      const energyNeeded = 2 * 9.8 * this.bumpH * 8; // tuned constant
      const ke = 0.5 * b.vx * b.vx;
      if (ke < energyNeeded) {
        // Not enough energy — reverse.
        b.vx = -b.vx * 0.3;
      } else {
        b.vx = Math.sqrt(2 * (ke - energyNeeded));
        b.onFarSide = true;
      }
    }

    // Rolled off far end.
    if (b.x > this.railRight + 10) {
      this._scoreRoll(0, 'Too fast! 💨');
      return;
    }

    // Stopped on the near side (didn't reach or clear the bump).
    if (!b.onFarSide && b.vx <= 1) {
      this._scoreRoll(0, 'Too slow! 😅');
      return;
    }

    // Stopped on far side.
    if (b.onFarSide && b.vx <= 1) {
      // Score based on position in the far zone.
      const farZoneLen = this.railRight - this.bumpX;
      const pos = clamp((b.x - this.bumpX) / farZoneLen, 0, 1);
      // Perfect is middle of far zone (pos≈0.5); edges score less.
      const proximity = 1 - Math.abs(pos - 0.5) * 2;
      const pts = proximity > 0.7 ? 10 : 7;
      this._scoreRoll(pts, pts === 10 ? 'Perfect! 🎳' : 'Nice roll!');
    }
  }

  _scoreRoll(pts, msg) {
    const b = this.ball;
    this.markerX = clamp(b.x, this.railLeft, this.railRight);
    this.markerColor = pts >= 10 ? '#ffd14d' : pts > 0 ? '#3ddc97' : '#ff5d5d';
    const markerY = this._surfaceY(this.markerX) - 20;

    if (pts > 0) {
      this.score += pts;
      this.hits++;
      this.particles.text(this.markerX, markerY - 24, `+${pts}  ${msg}`, this.markerColor, 18);
      this.particles.burst(this.markerX, markerY, this.markerColor, 14);
      if (pts >= 10) Audio.win(); else Audio.hit();
    } else {
      this.particles.text(this.markerX, markerY - 24, msg, '#ff5d5d', 18);
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
      this.hint = 'Swipe UP to roll — clear the bump! 🎳';
    }
  }

  // Rail surface height at x: flat, a smooth ramp over the bump, then raised.
  // The hump is drawn taller than its physics height so it reads on a phone.
  _surfaceY(x) {
    const ry = this.railY, x0 = this.bumpX - 34, x1 = this.bumpX + 34;
    const h = this.bumpH * VIS_BUMP;
    if (x <= x0) return ry;
    if (x >= x1) return ry - h;
    const u = (x - x0) / (x1 - x0);
    return ry - h * (0.5 - 0.5 * Math.cos(Math.PI * u));
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    const ry = this.railY;
    drawBoothBack(ctx, W, H, 'teal', t);
    drawFloor(ctx, W, ry + 90, H);
    drawPrizeShelf(ctx, 30, W - 30, H * 0.3, ['🧸', '🦄', '🐼', '🎳', '🐸', '🦆'], 34);
    drawSign(ctx, W / 2, H * 0.3 - 110, 'ROLL IT OVER THE HUMP!', '#ffcf3f', '#0a6366', 14);

    // Long wooden table carrying the rail.
    const tx0 = this.railLeft - 10, tx1 = this.railRight + 4;
    contactShadow(ctx, (tx0 + tx1) / 2, ry + 92, (tx1 - tx0) / 2, 8, 0.35);
    ctx.fillStyle = '#5a2c0c';
    for (const lx of [tx0 + 14, (tx0 + tx1) / 2, tx1 - 20]) ctx.fillRect(lx, ry + 20, 8, 72);
    const tg = ctx.createLinearGradient(0, ry + 4, 0, ry + 24);
    tg.addColorStop(0, '#d49752');
    tg.addColorStop(1, '#7a4416');
    ctx.fillStyle = tg;
    ctx.fillRect(tx0, ry + 4, tx1 - tx0, 20);
    ctx.fillStyle = '#0fa3a3';
    ctx.fillRect(tx0, ry + 14, tx1 - tx0, 4);

    // Raised ramp body under the rail.
    ctx.fillStyle = '#b8742f';
    ctx.beginPath();
    ctx.moveTo(this.bumpX - 34, ry + 4);
    for (let x = this.bumpX - 34; x <= this.railRight; x += 4) ctx.lineTo(x, this._surfaceY(x) + 4);
    ctx.lineTo(this.railRight, ry + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,10,0.4)';
    ctx.lineWidth = 1;
    for (let x = this.bumpX; x < this.railRight; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, this._surfaceY(x) + 6);
      ctx.lineTo(x, ry + 4);
      ctx.stroke();
    }

    // Win zone painted on the raised section.
    const zoneLeft = this.bumpX + 20, zoneRight = this.railRight - 20;
    const zy = ry - this.bumpH * VIS_BUMP;
    const zmid = (zoneLeft + zoneRight) / 2, zw = zoneRight - zoneLeft;
    ctx.fillStyle = '#3ddc97';
    ctx.fillRect(zoneLeft, zy + 6, zw, 10);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(zmid - zw * 0.15, zy + 6, zw * 0.3, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 10px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WIN', zmid, zy + 26);

    // The rail itself: twin chrome rods following the surface.
    for (const [off, w, c] of [[0, 5, '#5d6676'], [-1.5, 2, '#ffffff']]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let x = this.railLeft; x <= this.railRight; x += 3) {
        const y = this._surfaceY(x) + off;
        if (x === this.railLeft) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // End stop post (miss if you fly past it).
    ctx.fillStyle = '#e0303e';
    rr(ctx, this.railRight - 2, zy - 22, 8, 26, 3);
    ctx.fill();

    // Marker from last roll.
    if (this.markerX !== null) {
      const my = this._surfaceY(this.markerX);
      ctx.fillStyle = this.markerColor;
      ctx.beginPath();
      ctx.moveTo(this.markerX, my - 8);
      ctx.lineTo(this.markerX - 7, my - 22);
      ctx.lineTo(this.markerX + 7, my - 22);
      ctx.closePath();
      ctx.fill();
    }

    // Bowling ball: rolling on the rail, or waiting at the start.
    const ballR = 17;
    const waiting = !this.ball && this.attemptsLeft > 0 && !this.done;
    if (this.ball || waiting) {
      const bx = this.ball ? this.ball.x : this.railLeft + 18;
      const by = this._surfaceY(bx) - ballR - 2;
      this._drawBowlingBall(ctx, bx, by, ballR, bx / ballR);
    }

    // Player at the near end.
    ctx.font = '72px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000000';
    ctx.fillText('🧍', this.railLeft + 4, ry + 96);

    // Ball-return rack on the floor with the rolls still to come.
    const rackY = ry + 160, rackX = W / 2;
    const spare = Math.max(0, this.attemptsLeft - 1);
    ctx.fillStyle = '#2b2f3a';
    rr(ctx, rackX - 90, rackY, 180, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#9aa3b2';
    ctx.fillRect(rackX - 84, rackY + 2, 168, 3);
    for (let i = 0; i < spare; i++) {
      this._drawBowlingBall(ctx, rackX - 60 + i * 40, rackY - 16, 18, i * 1.7);
    }

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawBowlingBall(ctx, x, y, r, spin) {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#5a7bff');
    g.addColorStop(0.5, '#2a3fb0');
    g.addColorStop(1, '#141c5a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Finger holes rotate as it rolls.
    ctx.fillStyle = '#0a0f30';
    for (const [a, d] of [[0, 0.45], [0.5, 0.5], [-0.5, 0.5]]) {
      const ang = spin + a - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * r * d, y + Math.sin(ang) * r * d, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  getResult() {
    return {
      gameKey: 'railbowl',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: this.score >= 28,
      coinBonus: this.score >= 28 ? 15 : 0,
    };
  }
}
