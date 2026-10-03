// BB Gun Star: shoot BBs at a paper target to blast out the red star.
// The star is represented as a grid of sample points; each BB shot covers a
// circular blast radius. Score = fraction of star destroyed × 10. 12 shots.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawCounter, drawSign, rr } from '../ui/BoothStage.js';
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
    this._lastShotT = this.t;
    this._aim = { x: this.cx + localX, y: this.cy + localY };
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
    const t = this.t || 0;
    const cx = this.cx, cy = this.cy, R = this.targetR;
    drawBoothBack(ctx, W, H, 'green', t);

    // Dark gallery back wall the target hangs in front of.
    const gx = 24, gy = cy - R * 1.3 - 18, gw = W - 48, gh = R * 2.6 + 36;
    ctx.fillStyle = '#4a2410';
    rr(ctx, gx - 6, gy - 6, gw + 12, gh + 12, 10);
    ctx.fill();
    const wall = ctx.createLinearGradient(0, gy, 0, gy + gh);
    wall.addColorStop(0, '#1d2b22');
    wall.addColorStop(1, '#0f1712');
    ctx.fillStyle = wall;
    ctx.fillRect(gx, gy, gw, gh);
    // Wire + clip holding the card.
    ctx.strokeStyle = '#9aa3b2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, gy + 14);
    ctx.lineTo(gx + gw, gy + 14);
    ctx.stroke();

    // Paper target card.
    const cw = R * 1.7, ch = R * 2.2;
    const cardX = cx - cw / 2, cardY = cy - ch / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(cardX + 5, cardY + 6, cw, ch);
    ctx.fillStyle = '#fbf6ea';
    ctx.fillRect(cardX, cardY, cw, ch);
    ctx.fillStyle = '#e9e0cb';
    ctx.fillRect(cardX, cardY + ch - 8, cw, 8);
    // Printed range rings + header.
    ctx.strokeStyle = 'rgba(30,60,140,0.35)';
    ctx.lineWidth = 1.5;
    for (const k of [1.25, 1.0, 0.75]) {
      ctx.beginPath();
      ctx.arc(cx, cy, STAR_R * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#1e3c8c';
    ctx.font = '900 13px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHOOT OUT THE STAR', cx, cardY + 18);
    ctx.font = '700 10px "Outfit", system-ui, sans-serif';
    ctx.fillText('NO RED LEFT = WINNER', cx, cardY + ch - 20);

    // Red star.
    ctx.save();
    ctx.translate(cx, cy);
    this._starPath(ctx, 0, 0, STAR_R);
    ctx.fillStyle = '#e8221a';
    ctx.fill();
    ctx.strokeStyle = '#a80f0a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // BB holes: punched through to the dark wall, with torn paper edges.
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      if (Math.abs(s.x) > cw / 2 + BLAST_R || Math.abs(s.y) > ch / 2 + BLAST_R) continue;
      ctx.fillStyle = '#0f1712';
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const rad = BLAST_R * (0.86 + 0.14 * Math.sin(k * 2.7 + i * 1.3));
        const px = s.x + Math.cos(a) * rad, py = s.y + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,50,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    // Clip on top of the card.
    ctx.fillStyle = '#2b2f3a';
    rr(ctx, cx - 22, cardY - 10, 44, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#9aa3b2';
    ctx.fillRect(cx - 18, cardY - 6, 36, 3);

    // Progress meter: how much of the star is gone.
    const frac = this.starPoints.filter((p) => p.hit).length / this.starPoints.length;
    const mx = gx + 10, my = gy + gh - 22, mw = gw - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    rr(ctx, mx, my, mw, 14, 7);
    ctx.fill();
    ctx.fillStyle = frac >= WIN_FRAC ? '#3dff8a' : '#ffd23f';
    rr(ctx, mx + 2, my + 2, Math.max(10, (mw - 4) * frac), 10, 5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx + 2 + (mw - 4) * WIN_FRAC, my - 3, 2, 20);

    drawSign(ctx, W / 2, gy - 50, 'SHOOTING GALLERY', '#ffcf3f', '#14613f', 15);

    // The BB gun, seen from behind, swinging toward the last shot.
    const counterY = H - 122;
    drawCounter(ctx, W, H, counterY, 'green');
    const aim = this._aim || { x: cx, y: cy };
    const ang = Math.atan2(aim.x - cx, (counterY + 40) - aim.y) * 0.35;
    const since = this._lastShotT === undefined ? 9 : t - this._lastShotT;
    const kick = since < 0.08 ? 6 : 0;
    ctx.save();
    ctx.translate(cx, counterY + 30 + kick);
    ctx.rotate(ang);
    // Muzzle flash.
    if (since < 0.08) {
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rad = k % 2 ? 8 : 18;
        ctx.lineTo(Math.cos(a) * rad, -150 + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Barrel (tapers into the distance).
    const bg = ctx.createLinearGradient(-14, 0, 14, 0);
    bg.addColorStop(0, '#1d2028');
    bg.addColorStop(0.45, '#6b7382');
    bg.addColorStop(1, '#1d2028');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-15, -20);
    ctx.lineTo(-6, -138);
    ctx.lineTo(6, -138);
    ctx.lineTo(15, -20);
    ctx.closePath();
    ctx.fill();
    // Front sight.
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-2, -150, 4, 12);
    // Wooden stock.
    const sg = ctx.createLinearGradient(-30, 0, 30, 0);
    sg.addColorStop(0, '#6b3a14');
    sg.addColorStop(0.5, '#c98e4a');
    sg.addColorStop(1, '#6b3a14');
    ctx.fillStyle = sg;
    rr(ctx, -30, -40, 60, 90, 14);
    ctx.fill();
    ctx.fillStyle = '#2b2f3a';
    rr(ctx, -10, -44, 20, 30, 4);
    ctx.fill();
    ctx.restore();

    // BB pellets left in the tray.
    const left = this.attemptsLeft;
    for (let i = 0; i < SHOTS_MAX; i++) {
      const px = W - 30 - (i % 6) * 12, py = counterY - 8 - Math.floor(i / 6) * 10;
      ctx.fillStyle = i < left ? '#d98a3a' : 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (i < left) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(px - 2, py - 2, 1.6, 1.6);
      }
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
