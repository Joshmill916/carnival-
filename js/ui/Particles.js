// Particle + effects system for pops, hits, wins, confetti, emoji eruptions and
// floating score text. Shared by mini-games and the map. Three particle kinds:
//   'rect'  — a little colored square (the original burst confetti bit)
//   'emoji' — a tumbling emoji (food eruptions, etc.)
//   'text'  — a rising, fading label like "+5"
// Neon-arcade confetti: a mix of all four neon accents (plus white sparks).
const CONFETTI_COLORS = ['#ff2d78', '#00e5ff', '#ffe600', '#b44fff', '#ffffff'];

export class Particles {
  constructor() {
    this.parts = [];
  }

  // Radial spray of colored squares with gravity (the classic hit/pop burst).
  burst(x, y, color, count = 12, speed = 160) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const s = speed * (0.5 + Math.random());
      this.parts.push({
        kind: 'rect', x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        gravity: 300,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        color,
        r: 3 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 12,
      });
    }
  }

  // Confetti rain across the top of a `width`-wide area (screen space). Falls
  // with gravity, drifts sideways and tumbles — used for win celebrations.
  confetti(width, count = 80) {
    for (let i = 0; i < count; i++) {
      this.parts.push({
        kind: 'rect',
        x: Math.random() * width,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 80,
        vy: 80 + Math.random() * 180,
        gravity: 60,
        life: 1.4 + Math.random() * 1.1,
        age: 0,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        r: 5 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 14,
      });
    }
  }

  // Volcano-style eruption of an emoji (plus the caller's color specks via burst).
  // Particles shoot UP and out, then fall under strong gravity and tumble.
  erupt(x, y, emoji, count = 14) {
    for (let i = 0; i < count; i++) {
      this.parts.push({
        kind: 'emoji', x, y,
        vx: (Math.random() - 0.5) * 360,
        vy: -300 - Math.random() * 280,
        gravity: 560,
        life: 1.0 + Math.random() * 0.7,
        age: 0,
        emoji,
        size: 20 + Math.random() * 16,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 16,
      });
    }
  }

  // A single rising, fading label (e.g. "+5" or "RING!").
  text(x, y, str, color = '#fff', size = 22) {
    this.parts.push({
      kind: 'text', x, y,
      vx: 0, vy: -70, gravity: 40,
      life: 0.95, age: 0,
      color, text: str, size,
      rot: 0, vrot: 0,
    });
  }

  update(dt) {
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity || 0) * dt;
      p.rot += p.vrot * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
  }

  render(ctx) {
    for (const p of this.parts) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = alpha;
      if (p.kind === 'emoji') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      } else if (p.kind === 'text') {
        ctx.font = `bold ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}
