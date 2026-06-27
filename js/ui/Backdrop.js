// Shared deep-space backdrop: a dark navy → slightly-lighter vertical gradient
// with a slowly-scrolling, twinkling starfield. Stars are generated once from a
// fixed seed (deterministic, no per-frame allocation) and positioned in 0..1
// fractions so they fill any viewport size.
import { makeRng } from '../core/util.js';

let STARS = null;

function buildStars() {
  const rng = makeRng(98765);
  STARS = [];
  for (let i = 0; i < 260; i++) {
    STARS.push({
      x: rng(),
      y: rng(),
      r: 0.5 + rng() * 1.5,
      a: 0.3 + rng() * 0.5,
      tw: rng() * Math.PI * 2,
    });
  }
}

// Fill (0,0,w,h) with the space gradient + starfield. `t` (seconds) scrolls and
// twinkles the stars; pass 0 for a static field.
export function drawSpace(ctx, w, h, t = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0918');
  g.addColorStop(1, '#141233');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (!STARS) buildStars();
  const scroll = t * 6;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  for (const s of STARS) {
    const sx = s.x * w;
    const sy = (s.y * h + scroll) % h;
    const tw = 0.7 + 0.3 * Math.sin(t * 2 + s.tw);
    ctx.globalAlpha = s.a * tw;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
