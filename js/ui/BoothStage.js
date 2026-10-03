// Shared carnival-booth scenery for the mini-games: a striped tent wall, a
// scalloped awning with chasing marquee bulbs, side posts and a wooden counter
// the player throws from. Plus an outdoor "dusk midway" variant. Everything is
// flat fills + gradients — NO shadowBlur (it balloons into a hazy halo on
// high-DPI phones), bulbs get their sparkle from a small translucent disc.

export function rr(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// Booth colour themes: [stripe A, stripe B, awning trim, counter front].
export const THEMES = {
  red:    { a: '#e8343f', b: '#fff1dc', trim: '#ffcf3f', front: '#9c1f3a' },
  blue:   { a: '#2f6fe0', b: '#eaf3ff', trim: '#ffcf3f', front: '#1d3f8f' },
  purple: { a: '#8a3fd8', b: '#fbeaff', trim: '#ffd84a', front: '#4f2287' },
  green:  { a: '#1f9e62', b: '#effff4', trim: '#ffd84a', front: '#14613f' },
  teal:   { a: '#0fa3a3', b: '#e9ffff', trim: '#ffb43f', front: '#0a6366' },
  orange: { a: '#f2731d', b: '#fff4e2', trim: '#3fc7ff', front: '#9a3d0c' },
  aqua:   { a: '#2bb6e6', b: '#f2fcff', trim: '#ff6fae', front: '#126c94' },
};

// ---------------------------------------------------------------------------
// Indoor booth: tent wall + awning + posts. Call first in render(). `floorY`
// is where the back wall meets the counter/floor (drawn by drawCounter).
export function drawBoothBack(ctx, W, H, theme, t = 0) {
  const th = THEMES[theme] || THEMES.red;

  // Tent wall: vertical canvas stripes.
  const stripes = 9;
  const sw = W / stripes;
  ctx.fillStyle = th.b;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.a;
  for (let i = 0; i < stripes; i += 2) ctx.fillRect(i * sw, 0, sw, H);

  // Fabric folds: soft darker band at each stripe seam.
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let i = 1; i < stripes; i++) ctx.fillRect(i * sw - 3, 0, 6, H);

  // Interior shading — dim toward the floor and the edges so props pop.
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(20,6,30,0.10)');
  v.addColorStop(0.55, 'rgba(20,6,30,0.32)');
  v.addColorStop(1, 'rgba(20,6,30,0.62)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const side = ctx.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(20,6,30,0.35)');
  side.addColorStop(0.18, 'rgba(20,6,30,0)');
  side.addColorStop(0.82, 'rgba(20,6,30,0)');
  side.addColorStop(1, 'rgba(20,6,30,0.35)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, W, H);

  drawPosts(ctx, W, H);
  drawAwning(ctx, W, th, t);
}

// Candy-striped corner poles holding the awning up.
export function drawPosts(ctx, W, H) {
  const pw = 12;
  for (const x of [0, W - pw]) {
    const g = ctx.createLinearGradient(x, 0, x + pw, 0);
    g.addColorStop(0, '#d9b98a');
    g.addColorStop(0.5, '#fff3dc');
    g.addColorStop(1, '#b8915c');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, pw, H);
    ctx.fillStyle = 'rgba(200,40,60,0.85)';
    for (let y = 40; y < H; y += 28) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + pw, y - 10);
      ctx.lineTo(x + pw, y - 2);
      ctx.lineTo(x, y + 8);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Scalloped striped awning across the top with a row of chasing bulbs.
export function drawAwning(ctx, W, th, t = 0, bandH = 30) {
  const n = 9;
  const sw = W / n;
  // Band.
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? th.b : th.a;
    ctx.fillRect(i * sw, 0, sw + 1, bandH);
  }
  // Scallops hanging under the band.
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? th.b : th.a;
    ctx.beginPath();
    ctx.moveTo(i * sw, bandH - 1);
    ctx.lineTo((i + 1) * sw, bandH - 1);
    ctx.arc((i + 0.5) * sw, bandH - 1, sw / 2, 0, Math.PI);
    ctx.fill();
  }
  // Under-shadow of the scallops for depth.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.ellipse((i + 0.5) * sw, bandH + sw / 2 - 2, sw / 2 - 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Gold trim rail.
  ctx.fillStyle = th.trim;
  ctx.fillRect(0, bandH - 4, W, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(0, bandH - 4, W, 1.5);
  // Top shade.
  const g = ctx.createLinearGradient(0, 0, 0, bandH);
  g.addColorStop(0, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, bandH - 4);

  drawBulbRow(ctx, 10, W - 10, bandH - 1.5, Math.round(W / 26), t);
}

// A row of marquee bulbs; every third one dims in a chase pattern.
export function drawBulbRow(ctx, x0, x1, y, count, t = 0, r = 3.6) {
  const step = (x1 - x0) / Math.max(1, count - 1);
  const phase = Math.floor(t * 6) % 3;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * step;
    const on = (i + phase) % 3 !== 0;
    if (on) {
      ctx.fillStyle = 'rgba(255,226,120,0.30)';
      ctx.beginPath();
      ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = on ? '#fff6c8' : '#b68a3a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Swagged string of pennant flags between two points.
export function drawBunting(ctx, x0, x1, y, sag, colors, t = 0) {
  const n = Math.max(4, Math.round((x1 - x0) / 26));
  ctx.strokeStyle = 'rgba(60,30,20,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * u;
    const py = y + sag * 4 * u * (1 - u);
    const sway = Math.sin(t * 2 + i) * 1.5;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(px - 8, py);
    ctx.lineTo(px + 8, py);
    ctx.lineTo(px + sway, py + 16);
    ctx.closePath();
    ctx.fill();
  }
}

// The wooden counter across the bottom of the booth (player side).
export function drawCounter(ctx, W, H, y, theme) {
  const th = THEMES[theme] || THEMES.red;
  // Countertop lip with a wood gradient.
  const lip = 16;
  const g = ctx.createLinearGradient(0, y, 0, y + lip);
  g.addColorStop(0, '#f2c27f');
  g.addColorStop(0.5, '#d49752');
  g.addColorStop(1, '#a5662e');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, lip);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, y, W, 2);
  // Wood grain.
  ctx.strokeStyle = 'rgba(110,60,20,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, y + 5 + i * 3);
    ctx.bezierCurveTo(W * 0.3, y + 3 + i * 3, W * 0.6, y + 8 + i * 3, W, y + 5 + i * 3);
    ctx.stroke();
  }
  // Front panel.
  const fy = y + lip;
  const fg = ctx.createLinearGradient(0, fy, 0, H);
  fg.addColorStop(0, th.front);
  fg.addColorStop(1, '#1a0b1e');
  ctx.fillStyle = fg;
  ctx.fillRect(0, fy, W, H - fy);
  // Shadow under the lip.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, fy, W, 6);
  // Diamond pattern + trim stripe.
  ctx.fillStyle = th.trim;
  ctx.fillRect(0, fy + 12, W, 3);
  const dy = fy + 30;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let x = 20; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, dy - 9);
    ctx.lineTo(x + 9, dy);
    ctx.lineTo(x, dy + 9);
    ctx.lineTo(x - 9, dy);
    ctx.closePath();
    ctx.fill();
  }
}

// Soft contact shadow on a surface.
export function contactShadow(ctx, x, y, rx, ry, a = 0.28) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Outdoor dusk midway: gradient sky, a few stars, silhouetted tents and a
// Ferris wheel, string lights and grass down to `groundY`.
export function drawDusk(ctx, W, H, groundY, t = 0) {
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#1b1446');
  sky.addColorStop(0.45, '#5a2a7a');
  sky.addColorStop(0.8, '#d2557a');
  sky.addColorStop(1, '#ffad6b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, groundY);

  // Stars in the top band (fixed pattern, gentle twinkle).
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97.13) % 1) * W + ((i * 53) % W);
    const y = ((i * 37) % Math.max(1, groundY * 0.4));
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + i * 1.7);
    ctx.fillRect(x % W, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;

  // Ferris wheel silhouette, slowly turning.
  const fx = W * 0.82, fy = groundY - 110, fr = 78;
  ctx.strokeStyle = 'rgba(40,14,60,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const a = t * 0.25 + (i * Math.PI * 2) / 10;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? '#ffd86b' : '#ff7fb0';
    ctx.beginPath();
    ctx.arc(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(40,14,60,0.85)';
  ctx.beginPath();
  ctx.moveTo(fx - 40, groundY);
  ctx.lineTo(fx, fy);
  ctx.lineTo(fx + 40, groundY);
  ctx.closePath();
  ctx.fill();

  // Tent silhouettes on the horizon.
  ctx.fillStyle = '#2a1240';
  const tents = [[0.05, 60, 46], [0.28, 80, 62], [0.52, 64, 50]];
  for (const [u, w, h] of tents) {
    const x = u * W;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, groundY);
    ctx.lineTo(x - w / 2, groundY - h * 0.45);
    ctx.lineTo(x, groundY - h);
    ctx.lineTo(x + w / 2, groundY - h * 0.45);
    ctx.lineTo(x + w / 2, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(x - 1, groundY - h - 10, 2, 10);
    ctx.fillStyle = '#2a1240';
  }

  // Ground: grass with a worn dirt path.
  const gg = ctx.createLinearGradient(0, groundY, 0, H);
  gg.addColorStop(0, '#2f7d3f');
  gg.addColorStop(1, '#173f22');
  ctx.fillStyle = gg;
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = 'rgba(160,110,60,0.55)';
  ctx.beginPath();
  ctx.moveTo(W * 0.32, groundY);
  ctx.lineTo(W * 0.68, groundY);
  ctx.lineTo(W * 0.95, H);
  ctx.lineTo(W * 0.05, H);
  ctx.closePath();
  ctx.fill();

  // Two swags of string lights.
  drawLightString(ctx, -10, W * 0.55, 100, 40, t);
  drawLightString(ctx, W * 0.45, W + 10, 92, 34, t + 0.5);
}

export function drawLightString(ctx, x0, x1, y, sag, t = 0) {
  ctx.strokeStyle = 'rgba(20,10,30,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y);
  ctx.stroke();
  const colors = ['#ffe27a', '#ff7fb0', '#7fd4ff', '#9dff8a'];
  const n = Math.max(5, Math.round((x1 - x0) / 22));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * u;
    const py = y + sag * 4 * u * (1 - u) + 4;
    const on = Math.sin(t * 3 + i * 1.3) > -0.6;
    ctx.fillStyle = on ? colors[i % colors.length] : '#5a4a60';
    if (on) {
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A painted wooden sign with a title, e.g. over a game's play area.
export function drawSign(ctx, cx, y, text, bg = '#ffcf3f', fg = '#5a1a2a', size = 18) {
  ctx.save();
  ctx.font = `900 ${size}px "Outfit", "Trebuchet MS", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 34;
  const h = size + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, cx - w / 2 + 2, y + 3, w, h, 10);
  ctx.fill();
  ctx.fillStyle = bg;
  rr(ctx, cx - w / 2, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 2.5;
  rr(ctx, cx - w / 2 + 4, y + 4, w - 8, h - 8, 7);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + 1);
  ctx.restore();
}

// Height of the iOS notch / status bar (the app runs edge-to-edge with
// viewport-fit=cover), so canvas HUDs can sit below it. 0 outside a browser.
let _safeTop = null;
export function safeTop() {
  if (_safeTop !== null) return _safeTop;
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;height:env(safe-area-inset-top, 0px)';
    document.body.appendChild(d);
    _safeTop = d.getBoundingClientRect().height || 0;
    d.remove();
  } catch {
    _safeTop = 0;
  }
  return _safeTop;
}

// Wooden booth floor between the back wall (y0) and the counter (y1), planks
// converging toward a vanishing point for depth.
export function drawFloor(ctx, W, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#5b3518');
  g.addColorStop(1, '#a8682f');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.strokeStyle = 'rgba(40,18,6,0.45)';
  ctx.lineWidth = 1.5;
  const vx = W / 2, n = 10;
  for (let i = 0; i <= n; i++) {
    const xb = (i / n) * W * 1.6 - W * 0.3;
    const xt = vx + (xb - vx) * 0.45;
    ctx.beginPath();
    ctx.moveTo(xt, y0);
    ctx.lineTo(xb, y1);
    ctx.stroke();
  }
  // Baseboard where the wall meets the floor.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, y0, W, 5);
}

// A baseball: white with red stitching, shaded.
export function drawBaseball(ctx, x, y, r, spin = 0) {
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#cfc6b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,60,40,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.strokeStyle = '#d6283a';
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  ctx.beginPath();
  ctx.arc(-r * 1.35, 0, r, -0.62, 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 1.35, 0, r, Math.PI - 0.62, Math.PI + 0.62);
  ctx.stroke();
  ctx.restore();
}

// A wooden shelf on the back wall lined with prize plushies (decor).
export function drawPrizeShelf(ctx, x0, x1, y, items, size = 30) {
  const n = items.length;
  const step = (x1 - x0) / n;
  ctx.font = `${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000000'; // opaque: emoji glyphs inherit fill alpha
  for (let i = 0; i < n; i++) ctx.fillText(items[i], x0 + step * (i + 0.5), y + 2);
  const g = ctx.createLinearGradient(0, y, 0, y + 10);
  g.addColorStop(0, '#d49752');
  g.addColorStop(1, '#7a4416');
  ctx.fillStyle = g;
  ctx.fillRect(x0 - 8, y, x1 - x0 + 16, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0 - 8, y + 10, x1 - x0 + 16, 5);
  ctx.fillStyle = '#5a2c0c';
  ctx.fillRect(x0 + 6, y + 10, 5, 14);
  ctx.fillRect(x1 - 11, y + 10, 5, 14);
}
