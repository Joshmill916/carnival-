// BB Gun Star: shoot BBs at a paper target to blast out the red star.
// The star is represented as a grid of sample points; each BB shot covers a
// circular blast radius. Score = fraction of star destroyed × 10. 12 shots.
import { MiniGame } from './MiniGame.js';
import { drawSpace } from '../ui/Backdrop.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/util.js';

const SHOTS_MAX = 12;
const STAR_R = 58;        // outer tip radius of the 5-point star
const BLAST_R = 16;       // radius of each BB hole
const SAMPLE_N = 240;     // grid points that represent the star area
const WIN_FRAC = 0.80;    // fraction of star that must be destroyed to win

// Returns true if (px, py) is inside the 5-point star centered at (cx, cy)
// with outer radius R. Uses a simple winding approach via the star polygon.
function inStar(px, py, cx, cy, R) {
  const r = R * 0.4; // inner radius
  const pts = 5;
  const dx = px - cx, dy = py - cy;
  // Point-in-polygon test for the star polygon.
  let inside = false;
  const verts = [];
  for (let i = 0; i < pts * 2; i++) {
    const a = (Math.PI / pts) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    verts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if ((yi > dy) !== (yj > dy) && dx < ((xj - xi) * (dy - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export class BBGunStar extends MiniGame {
  static key = 'bbgun';
  static label = 'BB Gun Star';

  init() {
    this.attemptsLeft = SHOTS_MAX;
    this.hint = 'Tap to shoot — blast out the star! ⭐';
    const W = this.view.w, H = this.view.h;
    this.cx = W / 2;
    this.cy = H * 0.44;
    this.targetR = W * 0.36; // paper target circle radius

    // Pre-sample the star area with random-ish grid points.
    this.starPoints = [];
    const rng = this.rng;
    while (this.starPoints.length < SAMPLE_N) {
      const sx = (rng.range(0, 1) - 0.5) * STAR_R * 2.2;
      const sy = (rng.range(0, 1) - 0.5) * STAR_R * 2.2;
      if (inStar(sx, sy, 0, 0, STAR_R)) {
        this.starPoints.push({ x: sx, y: sy, hit: false });
      }
    }

    this.shots = []; // { x, y } in target-local coords
  }

  handleInput(input) {
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (g && (g.type === 'tap' || g.type === 'flick')) {
      const tx = (g.x ?? this.cx) - this.cx;
      const ty = (g.y ?? this.cy) - this.cy;
      this._shoot(tx, ty);
    }
  }

  _shoot(localX, localY) {
    this.shots.push({ x: localX, y: localY });
    let newHits = 0;
    for (const pt of this.starPoints) {
      if (!pt.hit) {
        const d2 = (pt.x - localX) ** 2 + (pt.y - localY) ** 2;
        if (d2 <= BLAST_R * BLAST_R) { pt.hit = true; newHits++; }
      }
    }
    if (newHits > 0) Audio.hit(); else Audio.fail();

    this.attempts++;
    this.attemptsLeft--;
    const frac = this.starPoints.filter(p => p.hit).length / this.starPoints.length;
    if (frac >= WIN_FRAC || this.attemptsLeft <= 0) {
      this.score = Math.round(frac * 10);
      if (frac > 0) this.hits++;
      if (this.score > 0) {
        this.particles.text(this.cx, this.cy - STAR_R - 20, `+${this.score}`, '#ffd14d', 22);
        this.particles.burst(this.cx, this.cy, '#ff5d5d', 16, 180);
        if (this.score >= 10) Audio.win();
      } else {
        Audio.fail();
      }
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      const pct = Math.round(frac * 100);
      this.hint = `${pct}% cleared — keep shooting!`;
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    drawSpace(ctx, W, H, this.t);

    // Target backing board.
    ctx.fillStyle = '#8b6343';
    ctx.beginPath();
    ctx.roundRect(this.cx - this.targetR - 18, this.cy - this.targetR - 18,
      (this.targetR + 18) * 2, (this.targetR + 18) * 2, 8);
    ctx.fill();

    // Paper circle — concentric rings.
    const rings = [
      { r: this.targetR,       color: '#fff8f0' },
      { r: this.targetR * 0.7, color: '#333' },
      { r: this.targetR * 0.5, color: '#fff8f0' },
      { r: this.targetR * 0.3, color: '#333' },
    ];
    for (const ring of rings) {
      ctx.fillStyle = ring.color;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ring.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Red star (intact portions shown as filled star path).
    ctx.save();
    ctx.translate(this.cx, this.cy);
    // Clip to star shape first to render intact star.
    this._starPath(ctx, 0, 0, STAR_R);
    ctx.fillStyle = '#e8221a';
    ctx.fill();

    // Draw each BB hole as a grey circle inside the clipped region.
    ctx.restore();

    // Holes (grey punch-outs over the star).
    ctx.save();
    ctx.translate(this.cx, this.cy);
    for (const s of this.shots) {
      const d2 = s.x * s.x + s.y * s.y;
      // Only show hole if it overlapped the target circle at all.
      if (Math.sqrt(d2) < this.targetR + BLAST_R) {
        ctx.fillStyle = '#2a1a10';
        ctx.beginPath();
        ctx.arc(s.x, s.y, BLAST_R, 0, Math.PI * 2);
        ctx.fill();
        // Torn paper edge.
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();

    // Gun barrel at bottom center.
    ctx.fillStyle = '#555';
    ctx.fillRect(this.cx - 8, H * 0.82, 16, 34);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(this.cx, H * 0.82, 10, Math.PI, Math.PI * 2);
    ctx.fill();

    // Shot counter dots.
    const dotY = H * 0.93;
    for (let i = 0; i < SHOTS_MAX; i++) {
      ctx.fillStyle = i < (SHOTS_MAX - this.attemptsLeft) ? '#888' : '#ffd14d';
      ctx.beginPath();
      ctx.arc(this.cx - ((SHOTS_MAX - 1) / 2) * 14 + i * 14, dotY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  _starPath(ctx, cx, cy, R) {
    const r = R * 0.4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  getResult() {
    return {
      gameKey: 'bbgun',
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score >= Math.round(WIN_FRAC * 10),
      bigWin: this.score >= 10,
      coinBonus: this.score >= 10 ? 20 : 0,
    };
  }
}
