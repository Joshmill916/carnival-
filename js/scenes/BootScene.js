// Boots the game: re-derives your level from saved progress, then hands off to
// the map. Renders a brief neon splash over a starfield.
import { Scene } from '../core/SceneManager.js';
import { recompute } from '../systems/Progression.js';
import { drawSpace } from '../ui/Backdrop.js';
import { setGlow, clearGlow } from '../core/util.js';

const BOOT_TIME = 0.9;

export class BootScene extends Scene {
  onEnter() {
    recompute(); // level from lifetime tickets earned
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.t > BOOT_TIME) this.game.scenes.replace('Map');
  }
  render(ctx) {
    const { width: w, height: h } = this.game.renderer;
    drawSpace(ctx, w, h, this.t);

    // Sparkles around the title.
    ctx.save();
    ctx.fillStyle = '#ffe600';
    for (let i = 0; i < 5; i++) {
      const a = this.t * 1.5 + (i / 5) * Math.PI * 2;
      const rx = w / 2 + Math.cos(a) * (110 + i * 6);
      const ry = h / 2 - 16 + Math.sin(a) * 34;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 3 + i));
      ctx.globalAlpha = tw;
      setGlow(ctx, '#ffe600', 10);
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    clearGlow(ctx);
    ctx.restore();

    // Neon title.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setGlow(ctx, '#ff2d78', 24);
    ctx.fillStyle = '#ff2d78';
    ctx.font = '900 42px "Outfit", system-ui, sans-serif';
    ctx.fillText('CARNIVAL', w / 2, h / 2 - 16);
    clearGlow(ctx);

    ctx.fillStyle = '#8880b0';
    ctx.font = '600 15px "Outfit", system-ui, sans-serif';
    ctx.fillText('loading the lights…', w / 2, h / 2 + 18);

    // Thin neon-cyan progress bar.
    const bw = Math.min(240, w * 0.6), bx = w / 2 - bw / 2, by = h / 2 + 48;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, by, bw, 4);
    const p = Math.min(1, this.t / BOOT_TIME);
    setGlow(ctx, '#00e5ff', 12);
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(bx, by, bw * p, 4);
    clearGlow(ctx);
  }
  get blocksRenderBelow() {
    return true;
  }
}
