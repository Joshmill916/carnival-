// Ring Toss: swipe up toward the pegs to lob a ring. A ring landing over a peg
// while descending = ringed. 3 rings; farther/smaller pegs are worth more.
import { MiniGame } from './MiniGame.js';
import { drawRing, drawPeg } from '../ui/Sprites.js';
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
    ctx.fillStyle = '#1c3a5e';
    ctx.fillRect(0, 0, this.view.w, this.view.h);
    // Pegs back-to-front.
    for (const p of this.pegs) drawPeg(ctx, p.x, p.y, p.ringed, p.points);
    // Launch marker.
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.ellipse(this.launch.x, this.launch.y, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.ring) drawRing(ctx, this.ring.x, this.ring.y, this.ring.z);
    this.particles.render(ctx);
    this._drawHud(ctx);
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
