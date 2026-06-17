// Procedural canvas drawing for every game object. No image assets — everything
// is shapes/emoji in a chunky retro style.

export function drawGround(ctx, world, camera) {
  // Grass base.
  ctx.fillStyle = '#2a7d4f';
  ctx.fillRect(0, 0, world.w, world.h);
  // Checker path tiles for a fairground feel.
  const tile = 80;
  for (let y = 0; y < world.h; y += tile) {
    for (let x = 0; x < world.w; x += tile) {
      if (((x / tile) + (y / tile)) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }
  // Border fence.
  ctx.strokeStyle = '#1d5a39';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, world.w - 8, world.h - 8);
}

export function drawBooth(ctx, booth, unlocked) {
  const { x, y, color, name, emoji } = booth;
  const w = 150, h = 110;
  const left = x - w / 2;
  const top = y - h / 2;

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(left + 6, top + h - 6, w, 14);

  // Stall body.
  ctx.fillStyle = unlocked ? '#caa24a' : '#6b6b6b';
  ctx.fillRect(left, top + 28, w, h - 28);

  // Striped awning.
  const stripes = 6;
  const sw = w / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? (unlocked ? color : '#888') : '#fff7e6';
    ctx.beginPath();
    ctx.moveTo(left + i * sw, top + 28);
    ctx.lineTo(left + i * sw + sw, top + 28);
    ctx.lineTo(left + i * sw + sw / 2, top + 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(left + i * sw, top, sw, 28);
  }

  // Sign.
  ctx.font = '28px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, top + h - 28);

  ctx.fillStyle = unlocked ? '#1b1b2e' : '#ddd';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(name, x, top + 14);

  if (!unlocked) {
    ctx.font = '34px serif';
    ctx.fillText('🔒', x, y + 6);
  }
}

export function drawAvatar(ctx, x, y, facing, walkPhase) {
  const bob = Math.sin(walkPhase) * 2;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = '#ff5d8f';
  ctx.fillRect(x - 9, y - 6 + bob, 18, 20);
  // Head.
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath();
  ctx.arc(x, y - 14 + bob, 9, 0, Math.PI * 2);
  ctx.fill();
  // Cap.
  ctx.fillStyle = '#2b2b4a';
  ctx.fillRect(x - 9, y - 22 + bob, 18, 7);
  // Facing eyes.
  ctx.fillStyle = '#1b1b2e';
  const ex = facing === 'left' ? -3 : facing === 'right' ? 3 : 0;
  if (facing !== 'up') {
    ctx.fillRect(x - 4 + ex, y - 15 + bob, 2, 2);
    ctx.fillRect(x + 2 + ex, y - 15 + bob, 2, 2);
  }
}

export function drawRing(ctx, x, y, z, r = 16) {
  const scale = 1 + z / 200; // higher = looks bigger/closer
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
