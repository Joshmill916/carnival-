// Rail Bowling: swipe UP hard to roll a bowling ball along a raised rail.
// The rail has a bump near the far end. Too weak = rolls back. Too strong =
// flies off the far end. Hit the sweet spot to land it on the far side. 3 rolls.
import { MiniGame } from './MiniGame.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

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
    this.railY     = H * 0.56;     // rail surface y

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
    const markerY = this.railY - this.bumpH * (this.markerX > this.bumpX ? 0.5 : 0);

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

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    ctx.fillStyle = '#1e1a30';
    ctx.fillRect(0, 0, W, H);

    const ry = this.railY;

    // Crowd / backdrop.
    ctx.fillStyle = '#2a2248';
    ctx.fillRect(0, 0, W, ry - 60);

    // Floor.
    ctx.fillStyle = '#3a2e20';
    ctx.fillRect(0, ry + 14, W, H - ry - 14);

    // Rail shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(this.railLeft, ry + 8, this.railLen, 10);

    // Rail body (flat section left of bump, raised at bump, flat right of bump).
    this._drawRail(ctx);

    // Bump.
    this._drawBump(ctx);

    // Marker from last roll.
    if (this.markerX !== null) {
      const my = ry - (this.markerX > this.bumpX ? this.bumpH * 0.35 : 0);
      ctx.strokeStyle = this.markerColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(this.markerX, my - 20);
      ctx.lineTo(this.markerX, my + 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bowling ball.
    if (this.ball) {
      const bx = this.ball.x;
      const surfaceY = bx > this.bumpX
        ? ry - this.bumpH * 0.5
        : bx > this.bumpX - 30
          ? ry - this.bumpH * 0.5 * ((bx - (this.bumpX - 30)) / 30)
          : ry;
      const ballR = 16;
      ctx.fillStyle = '#222';
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, surfaceY - ballR, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Finger holes.
      ctx.fillStyle = '#444';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(bx + i * 5, surfaceY - ballR - 3, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player figure on the left.
    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧍', this.railLeft - 18, ry - 10);

    // Win zone indicator on far side.
    const zoneLeft = this.bumpX + 20;
    const zoneRight = this.railRight - 20;
    ctx.fillStyle = 'rgba(61,220,151,0.15)';
    ctx.fillRect(zoneLeft, ry - this.bumpH - 6, zoneRight - zoneLeft, this.bumpH + 6);
    ctx.strokeStyle = 'rgba(61,220,151,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(zoneLeft, ry - this.bumpH - 6, zoneRight - zoneLeft, this.bumpH + 6);
    ctx.fillStyle = 'rgba(61,220,151,0.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WIN ZONE', (zoneLeft + zoneRight) / 2, ry - this.bumpH / 2 - 3);

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _drawRail(ctx) {
    const ry = this.railY;
    // Left flat section.
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(this.railLeft, ry - 10, this.bumpX - this.railLeft, 10);
    // Right elevated section (raised by bumpH).
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(this.bumpX, ry - this.bumpH - 10, this.railRight - this.bumpX, 10);
    // Rail edges.
    ctx.strokeStyle = '#8b6343';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.railLeft, ry - 10, this.bumpX - this.railLeft, 10);
    ctx.strokeRect(this.bumpX, ry - this.bumpH - 10, this.railRight - this.bumpX, 10);
  }

  _drawBump(ctx) {
    const ry = this.railY;
    // Curved ramp shape.
    ctx.fillStyle = '#b08040';
    ctx.beginPath();
    ctx.moveTo(this.bumpX - 30, ry);
    ctx.quadraticCurveTo(this.bumpX, ry - this.bumpH * 1.1, this.bumpX + 30, ry - this.bumpH);
    ctx.lineTo(this.bumpX + 30, ry - this.bumpH - 10);
    ctx.lineTo(this.bumpX, ry - this.bumpH * 1.1 - 10);
    ctx.lineTo(this.bumpX - 30, ry - 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8b6343';
    ctx.lineWidth = 2;
    ctx.stroke();
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
