// Procedural canvas art for the fairground. No image assets — everything is
// drawn with shapes, gradients and emoji in a bright, lively fair style. Many
// draws take a time `t` (seconds) so rides, lights and people animate.

import { setGlow, clearGlow } from '../core/util.js';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- Ground ------------------------------------------------------------------
export function drawGround(ctx, world, camera) {
  // Grass gradient.
  const g = ctx.createLinearGradient(0, 0, 0, world.h);
  g.addColorStop(0, '#4bb061');
  g.addColorStop(1, '#37934e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, world.w, world.h);

  // Soft mowed stripes.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < world.h; y += 96) ctx.fillRect(0, y, world.w, 48);

  // Sandy paths: a central plaza with arms reaching toward the three booths.
  const cx = world.w / 2, cy = world.h * 0.55;
  ctx.strokeStyle = '#d9bd86';
  ctx.lineWidth = 64;
  ctx.lineCap = 'round';
  const arms = [
    [360, 470], [1040, 470], [700, 930],
    [250, 230], [1150, 250], [700, 250],
  ];
  for (const [ax, ay] of arms) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
  }
  // Plaza disc.
  ctx.fillStyle = '#e3c891';
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();

  // Decorative fence around the world edge.
  ctx.strokeStyle = '#caa24a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, world.w - 16, world.h - 16);
}

// --- Rides -------------------------------------------------------------------
export function drawFerrisWheel(ctx, ride, t) {
  const { x, y, r } = ride;
  shadow(ctx, x, y + r * 0.9, r * 0.7, r * 0.16);
  // Support legs.
  ctx.strokeStyle = '#8893a7';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y + r);
  ctx.lineTo(x, y);
  ctx.lineTo(x + r * 0.45, y + r);
  ctx.stroke();

  const spin = t * 0.5;
  const spokes = 10;
  // Rim.
  ctx.strokeStyle = '#ffd14d';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Spokes + gondolas.
  const cols = ['#ff5d8f', '#5b8cff', '#3ddc97', '#ffd14d', '#ff8f4d'];
  for (let i = 0; i < spokes; i++) {
    const a = spin + (Math.PI * 2 * i) / spokes;
    const gx = x + Math.cos(a) * r;
    const gy = y + Math.sin(a) * r;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.fillStyle = cols[i % cols.length];
    roundRect(ctx, gx - 11, gy - 6, 22, 18, 5);
    ctx.fill();
  }
  // Hub.
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCarousel(ctx, ride, t) {
  const { x, y, r } = ride;
  shadow(ctx, x, y + r * 0.7, r * 0.85, r * 0.18);
  // Base platform.
  ctx.fillStyle = '#caa24a';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.5, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // Center pole.
  ctx.fillStyle = '#b9c2d0';
  ctx.fillRect(x - 5, y - r * 0.5, 10, r);
  // Spinning horses.
  const spin = t * 0.9;
  for (let i = 0; i < 6; i++) {
    const a = spin + (Math.PI * 2 * i) / 6;
    const hx = x + Math.cos(a) * r * 0.78;
    const hy = y + r * 0.4 + Math.sin(a) * r * 0.16;
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐴', hx, hy + Math.sin(t * 4 + i) * 4);
  }
  // Striped conical roof.
  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#ff5d8f' : '#fff7e6';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.7);
    const a0 = (Math.PI * 2 * i) / stripes;
    const a1 = (Math.PI * 2 * (i + 1)) / stripes;
    ctx.lineTo(x + Math.cos(a0) * r, y - r * 0.5 + Math.sin(a0) * r * 0.3);
    ctx.lineTo(x + Math.cos(a1) * r, y - r * 0.5 + Math.sin(a1) * r * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffd14d';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.7, 7, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRide(ctx, ride, t) {
  if (ride.kind === 'ferris') drawFerrisWheel(ctx, ride, t);
  else if (ride.kind === 'carousel') drawCarousel(ctx, ride, t);
}

// --- Food stalls -------------------------------------------------------------
export function drawFoodStall(ctx, food) {
  const { x, y, emoji, name, color } = food;
  const w = 96, h = 70;
  const left = x - w / 2, top = y - h / 2;
  shadow(ctx, x, top + h + 4, w * 0.55, 9);
  // Counter.
  ctx.fillStyle = '#b98a52';
  roundRect(ctx, left, top + 26, w, h - 26, 6);
  ctx.fill();
  // Awning.
  const stripes = 5, sw = w / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#fff7e6' : color;
    ctx.beginPath();
    ctx.moveTo(left + i * sw, top + 26);
    ctx.lineTo(left + i * sw + sw, top + 26);
    ctx.lineTo(left + i * sw + sw / 2, top + 38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = i % 2 ? color : '#fff7e6';
    ctx.fillRect(left + i * sw, top, sw, 26);
  }
  // Sign emoji + label.
  ctx.font = '26px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, top + 52);
  ctx.fillStyle = '#2b2b14';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(name, x, top + 13);
}

// --- Booths ------------------------------------------------------------------
export function drawBooth(ctx, booth, t, locked = false) {
  const { x, y, color, name, emoji, minLevel } = booth;
  const w = 168, h = 124;
  const left = x - w / 2, top = y - h / 2;
  shadow(ctx, x, top + h + 2, w * 0.55, 12);

  ctx.save();
  if (locked) ctx.globalAlpha = 0.45;

  // Body with a soft gradient.
  const g = ctx.createLinearGradient(0, top + 30, 0, top + h);
  g.addColorStop(0, locked ? '#c0b8a8' : '#f3e2b8');
  g.addColorStop(1, locked ? '#a09080' : '#d9bd86');
  ctx.fillStyle = g;
  roundRect(ctx, left, top + 30, w, h - 30, 8);
  ctx.fill();

  // Counter front.
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(left, top + h - 22, w, 22);

  // Striped awning.
  const awningColor = locked ? '#888' : color;
  const stripes = 7, sw = w / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? awningColor : '#fff7e6';
    ctx.beginPath();
    ctx.moveTo(left + i * sw, top + 30);
    ctx.lineTo(left + i * sw + sw, top + 30);
    ctx.lineTo(left + i * sw + sw / 2, top + 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(left + i * sw, top + 6, sw, 24);
  }

  // Sign banner.
  ctx.fillStyle = locked ? '#444455' : '#2b2b3e';
  roundRect(ctx, x - 64, top - 16, 128, 26, 6);
  ctx.fill();
  ctx.fillStyle = locked ? '#aaa' : '#ffd14d';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, top - 3);

  if (locked) {
    // Lock icon + level requirement.
    ctx.font = '30px serif';
    ctx.fillText('🔒', x, top + h - 36);
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`Level ${minLevel}`, x, top + h - 10);
  } else {
    // Big emoji + a glow pulse to draw the eye.
    const pulse = 0.5 + 0.5 * Math.sin(t * 2 + x);
    ctx.save();
    ctx.globalAlpha = 0.25 + pulse * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, top + h - 30, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.font = '34px serif';
    ctx.fillText(emoji, x, top + h - 30);
  }

  // Neon frame with marquee corner accents, pulsing with game time.
  const pulse = 0.6 + 0.4 * Math.sin(t * 2 + x * 0.05);
  const frameCol = locked ? '#6a6a80' : color;
  const fx = left - 6, fy = top - 18, fw = w + 12, fh = h + 28;
  ctx.save();
  ctx.globalAlpha = (locked ? 0.5 : 1) * pulse;
  setGlow(ctx, frameCol, 14);
  ctx.strokeStyle = frameCol;
  ctx.lineWidth = 2.5;
  roundRect(ctx, fx, fy, fw, fh, 12);
  ctx.stroke();
  ctx.fillStyle = frameCol;
  for (const [cxp, cyp] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) {
    ctx.beginPath();
    ctx.arc(cxp, cyp, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  clearGlow(ctx);
  ctx.restore();

  ctx.restore();
}

// --- Trees -------------------------------------------------------------------
export function drawTree(ctx, x, y, t) {
  shadow(ctx, x, y + 6, 26, 9);
  ctx.fillStyle = '#7a4a22';
  ctx.fillRect(x - 5, y - 18, 10, 24);
  const sway = Math.sin(t * 1.5 + x) * 2;
  const blobs = [
    { dx: 0, dy: -44, r: 24 },
    { dx: -18, dy: -30, r: 18 },
    { dx: 18, dy: -30, r: 18 },
  ];
  ctx.fillStyle = '#2f8f48';
  for (const b of blobs) {
    ctx.beginPath();
    ctx.arc(x + b.dx + sway, y + b.dy, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x - 6 + sway, y - 50, 10, 0, Math.PI * 2);
  ctx.fill();
}

// --- String lights -----------------------------------------------------------
export function drawStringLights(ctx, line, t) {
  const cols = ['#ff5d8f', '#ffd14d', '#5b8cff', '#3ddc97', '#ff8f4d'];
  for (let i = 0; i < line.length; i++) {
    // Pole.
    const p = line[i];
    ctx.strokeStyle = '#9aa3b2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + 60);
    ctx.stroke();
  }
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const midX = (a.x + b.x) / 2, sag = 26;
    // Wire (quadratic swag).
    ctx.strokeStyle = 'rgba(40,40,60,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(midX, (a.y + b.y) / 2 + sag, b.x, b.y);
    ctx.stroke();
    // Bulbs along the swag.
    const n = 8;
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const bx = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * midX + u * u * b.x;
      const by =
        (1 - u) * (1 - u) * a.y +
        2 * (1 - u) * u * ((a.y + b.y) / 2 + sag) +
        u * u * b.y;
      const tw = 0.5 + 0.5 * Math.sin(t * 4 + k + i);
      ctx.fillStyle = cols[k % cols.length];
      ctx.globalAlpha = 0.5 + tw * 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// --- People ------------------------------------------------------------------
export function drawNPC(ctx, npc, t) {
  const bob = Math.sin(t * 4 + npc.phase) * 1.5;
  shadow(ctx, npc.x, npc.y + 12, 9, 4);
  // Legs.
  ctx.fillStyle = '#3a3a52';
  ctx.fillRect(npc.x - 5, npc.y + 2 + bob, 4, 10);
  ctx.fillStyle = '#3a3a52';
  ctx.fillRect(npc.x + 1, npc.y + 2 + bob, 4, 10);
  // Body.
  ctx.fillStyle = npc.shirt;
  roundRect(ctx, npc.x - 7, npc.y - 8 + bob, 14, 14, 4);
  ctx.fill();
  // Head.
  ctx.fillStyle = npc.skin;
  ctx.beginPath();
  ctx.arc(npc.x, npc.y - 13 + bob, 6, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = npc.hair;
  ctx.beginPath();
  ctx.arc(npc.x, npc.y - 15 + bob, 6, Math.PI, Math.PI * 2);
  ctx.fill();
}

// --- Avatar ------------------------------------------------------------------
export function drawAvatar(ctx, x, y, facing, walkPhase) {
  const bob = Math.sin(walkPhase) * 2;
  shadow(ctx, x, y + 16, 14, 6);
  // Legs.
  ctx.fillStyle = '#2b2b4a';
  ctx.fillRect(x - 7, y + 8 + bob, 5, 9);
  ctx.fillRect(x + 2, y + 8 + bob, 5, 9);
  // Body.
  ctx.fillStyle = '#ff5d8f';
  roundRect(ctx, x - 10, y - 6 + bob, 20, 20, 6);
  ctx.fill();
  // Head.
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath();
  ctx.arc(x, y - 14 + bob, 9, 0, Math.PI * 2);
  ctx.fill();
  // Cap.
  ctx.fillStyle = '#2b2b4a';
  ctx.beginPath();
  ctx.arc(x, y - 16 + bob, 9, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 9, y - 16 + bob, 18, 3);
  // Eyes (hidden when facing up).
  ctx.fillStyle = '#1b1b2e';
  const ex = facing === 'left' ? -3 : facing === 'right' ? 3 : 0;
  if (facing !== 'up') {
    ctx.fillRect(x - 4 + ex, y - 14 + bob, 2, 2);
    ctx.fillRect(x + 2 + ex, y - 14 + bob, 2, 2);
  }
}

// Spinning stars that circle a dizzy head after being flung off a ride.
export function drawDizzyStars(ctx, x, y, t) {
  ctx.save();
  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const a = t * 7 + (Math.PI * 2 * i) / 3;
    const sx = x + Math.cos(a) * 15;
    const sy = y + Math.sin(a) * 6;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8 + i);
    ctx.fillText('💫', sx, sy);
  }
  ctx.restore();
}

// --- Mini-game pieces (unchanged gameplay shapes, lightly polished) ----------
export function drawRing(ctx, x, y, z, r = 16) {
  const scale = 1 + z / 200;
  ctx.save();
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(x, y - z, r * scale, r * 0.5 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawPeg(ctx, x, y, ringed, points) {
  ctx.fillStyle = ringed ? '#3ddc97' : '#b5651d';
  ctx.fillRect(x - 5, y - 36, 10, 36);
  ctx.fillStyle = '#7a4416';
  ctx.beginPath();
  ctx.ellipse(x, y, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(points, x, y + 3);
}

export function drawBottle(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle || 0);
  ctx.fillStyle = b.down ? '#7a8a99' : '#2fa37a';
  ctx.fillRect(-b.r * 0.6, -b.r, b.r * 1.2, b.r * 2);
  ctx.fillRect(-b.r * 0.3, -b.r * 1.4, b.r * 0.6, b.r * 0.5);
  ctx.restore();
}

export function drawBall(ctx, x, y, r = 12) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d33';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x - 3, y, r, -0.6, 0.6);
  ctx.stroke();
}

export function drawBalloon(ctx, bl) {
  if (bl.popped) return;
  ctx.fillStyle = bl.color;
  ctx.beginPath();
  ctx.ellipse(bl.x, bl.y, bl.r, bl.r * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(bl.x - bl.r * 0.3, bl.y - bl.r * 0.4, bl.r * 0.25, bl.r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(bl.points, bl.x, bl.y + 4);
}

export function drawDart(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  ctx.fillStyle = '#e33';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(2, -4);
  ctx.lineTo(2, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
