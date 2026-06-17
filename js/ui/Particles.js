// Minimal particle burst system for pops, hits and wins. Shared by mini-games.
export class Particles {
  constructor() {
    this.parts = [];
  }
  burst(x, y, color, count = 12, speed = 160) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const s = speed * (0.5 + Math.random());
      this.parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        color,
        r: 3 + Math.random() * 3,
      });
    }
  }
  update(dt) {
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt; // gravity
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
  }
  render(ctx) {
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  }
}
