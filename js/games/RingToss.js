// Ring Toss: swipe up toward the pegs to lob a ring. A ring landing over a peg
// while descending = ringed. 3 rings; farther/smaller pegs are worth more.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawCounter, contactShadow, drawSign } from '../ui/BoothStage.js';
import { dist } from '../core/util.js';
import { Audio } from '../core/Audio.js';

export class RingToss extends MiniGame {
  static key = 'rings';
  static label = 'Ring Toss';

  init() {
    this.attemptsLeft = 3;
    this.hint = 'Swipe up toward a peg to toss';
    const W = this.view.w, H = this.view.h;
    this.launch = { x: W / 2, y: H - 90 };
    this.ring = null;

    // Three rows of pegs; higher on screen = "farther" = more points.
    this.pegs = [];
    const rows = [
      { y: H * 0.30, pts: 10, n: 3, catchR: 20 },
      { y: H * 0.45, pts: 5, n: 4, catchR: 24 },
      { y: H * 0.60, pts: 3, n: 5, catchR: 28 },
    ];
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const x = (W * (i + 1)) / (row.n + 1);
        this.pegs.push({ x, y: row.y, points: row.pts, catchR: row.catchR, ringed: false });
      }
    }
  }

  handleInput(input) {
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -50) {
      this._launch(g);
    }
  }

  _launch(g) {
    // Power (0..1) from swipe speed controls how FAR the ring travels: a gentle
    // swipe lands on the near low-value pegs, a strong one reaches the far
    // high-value row. The ring arcs to a target point over a fixed-ish airtime
    // (parabolic height) so it always lands on the field — no off-the-top misses.
    const W = this.view.w;
    const power = Math.min(1, Math.max(0, (Math.abs(g.vy) - 250) / 1900));
    const topY = this.view.h * 0.26; // a touch above the far row
    const targetY = this.launch.y - power * (this.launch.y - topY);
    // Horizontal aim from the swipe's sideways component.
    const targetX = Math.max(24, Math.min(W - 24, this.launch.x + g.vx * 0.18));
    this.ring = {
      sx: this.launch.x,
      sy: this.launch.y,
      tx: targetX,
      ty: targetY,
      x: this.launch.x,
      y: this.launch.y,
      z: 0,
      t: 0,
      airtime: 0.55 + power * 0.45,
      peak: 70 + power * 150,
    };
    this.phase = 'fly';
    this.hint = '';
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    if (this.phase !== 'fly' || !this.ring) return;
    const r = this.ring;
    r.t += dt;
    const u = Math.min(1, r.t / r.airtime);
    r.x = r.sx + (r.tx - r.sx) * u;
    r.y = r.sy + (r.ty - r.sy) * u;
    r.z = Math.sin(Math.PI * u) * r.peak; // up then back to 0 at landing
    if (u >= 1) this._land(false);
  }

  _land(offscreen) {
    const r = this.ring;
    let scored = 0;
    if (!offscreen) {
      // Closest un-ringed peg within catch radius wins.
      let best = null, bestD = Infinity;
      for (const p of this.pegs) {
        if (p.ringed) continue;
        const d = dist(r.x, r.y, p.x, p.y);
        if (d < p.catchR && d < bestD) {
          best = p;
          bestD = d;
        }
      }
      if (best) {
        best.ringed = true;
        scored = best.points;
        this.score += scored;
        this.hits++;
        this.particles.burst(best.x, best.y - 30, '#3ddc97', 14);
        Audio.win();
      }
    }
    if (!scored) Audio.fail();

    this.ring = null;
    this.attemptsLeft--;
    if (this.attemptsLeft <= 0) {
      this.phase = 'done';
      this.done = true;
    } else {
      this.phase = 'aim';
      this.hint = 'Swipe up toward a peg to toss';
    }
    this.attempts++;
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    drawBoothBack(ctx, W, H, 'red', t);

    // Sloped felt table the pegs stand on (narrower at the back = depth).
    const backY = H * 0.24, frontY = H * 0.70;
    const inBack = W * 0.12, inFront = 6;
    ctx.fillStyle = '#7a3a12';
    ctx.beginPath();
    ctx.moveTo(inBack - 6, backY - 6);
    ctx.lineTo(W - inBack + 6, backY - 6);
    ctx.lineTo(W - inFront + 6, frontY + 8);
    ctx.lineTo(inFront - 6, frontY + 8);
    ctx.closePath();
    ctx.fill();
    const felt = ctx.createLinearGradient(0, backY, 0, frontY);
    felt.addColorStop(0, '#1d6b3a');
    felt.addColorStop(1, '#2fa25a');
    ctx.fillStyle = felt;
    ctx.beginPath();
    ctx.moveTo(inBack, backY);
    ctx.lineTo(W - inBack, backY);
    ctx.lineTo(W - inFront, frontY);
    ctx.lineTo(inFront, frontY);
    ctx.closePath();
    ctx.fill();
    // Painted score lanes across the felt.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (const f of [0.375, 0.525]) {
      const y = H * f;
      const u = (y - backY) / (frontY - backY);
      const inset = inBack + (inFront - inBack) * u;
      ctx.beginPath();
      ctx.moveTo(inset, y);
      ctx.lineTo(W - inset, y);
      ctx.stroke();
    }
    // Table skirt.
    ctx.fillStyle = '#c0283a';
    ctx.fillRect(0, frontY + 8, W, 18);
    ctx.fillStyle = '#ffcf3f';
    for (let x = 8; x < W; x += 22) {
      ctx.beginPath();
      ctx.arc(x, frontY + 26, 6, 0, Math.PI);
      ctx.fill();
    }
    drawSign(ctx, W / 2, backY - 50, 'RING A PEG!', '#ffcf3f', '#8a1530', 16);

    // Pegs back-to-front.
    for (const p of this.pegs) this._drawPeg(ctx, p, backY, frontY);

    // Ring in flight, with its shadow on the table.
    if (this.ring) {
      const r = this.ring;
      const s = this._depthScale(r.y, backY, frontY);
      contactShadow(ctx, r.x, r.y, 20 * s * (1 - r.z / 400), 7 * s, 0.25);
      this._drawRing(ctx, r.x, r.y - r.z, 22 * s * (1 + r.z / 260), '#ffd23f', r.t * 10);
    }

    drawCounter(ctx, W, H, H - 122, 'red');
    // Stack of rings still to throw, resting on the counter.
    const left = this.attemptsLeft - (this.ring ? 1 : 0);
    const colors = ['#ffd23f', '#4fd1ff', '#ff6fae'];
    for (let i = 0; i < left; i++) {
      this._drawRing(ctx, this.launch.x, H - 116 - i * 7, 30, colors[i % colors.length], 0);
    }

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _depthScale(y, backY, frontY) {
    const u = Math.max(0, Math.min(1, (y - backY) / (frontY - backY)));
    return 0.85 + u * 0.45;
  }

  _drawRing(ctx, x, y, r, color, spin) {
    const tilt = 0.42 + 0.08 * Math.sin(spin);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(60,20,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1.5, r, r * tilt, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * tilt, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, r, r * tilt, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }

  _drawPeg(ctx, p, backY, frontY) {
    const s = this._depthScale(p.y, backY, frontY);
    const band = p.points >= 10 ? '#ffcf3f' : p.points >= 5 ? '#ff6fae' : '#4fd1ff';
    const pw = 11 * s, ph = 46 * s;
    contactShadow(ctx, p.x + 4 * s, p.y + 1, 15 * s, 5 * s, 0.3);
    // Base plate.
    ctx.fillStyle = '#5a2c0c';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 14 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Post with cylinder shading.
    const g = ctx.createLinearGradient(p.x - pw / 2, 0, p.x + pw / 2, 0);
    g.addColorStop(0, '#8a4f1e');
    g.addColorStop(0.45, '#f0c48a');
    g.addColorStop(1, '#7a4116');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - pw / 2, p.y - ph, pw, ph);
    // Painted band + top cap.
    ctx.fillStyle = band;
    ctx.fillRect(p.x - pw / 2, p.y - ph * 0.62, pw, ph * 0.16);
    ctx.fillStyle = '#ffe9c4';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - ph, pw / 2, pw / 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ring resting around the base once ringed.
    if (p.ringed) this._drawRing(ctx, p.x, p.y - 4 * s, 18 * s, '#3ddc97', 0);
    // Points badge.
    const by = p.y + 12 * s;
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.arc(p.x, by, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a0c18';
    ctx.font = `900 ${Math.round(10 * s)}px "Outfit", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.points), p.x, by + 0.5);
  }

  getResult() {
    const won = this.score > 0;
    const allRinged = this.pegs.every((p) => p.ringed);
    return {
      gameKey: 'rings',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won,
      bigWin: allRinged,
      coinBonus: allRinged ? 25 : 0,
    };
  }
}
