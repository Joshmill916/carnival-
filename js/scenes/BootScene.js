// Boots the game: re-derives your level from saved progress, then hands off to
// the map. Renders a brief splash.
import { Scene } from '../core/SceneManager.js';
import { recompute } from '../systems/Progression.js';

export class BootScene extends Scene {
  onEnter() {
    recompute(); // level from lifetime tickets earned
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.t > 0.7) this.game.scenes.replace('Map');
  }
  render(ctx) {
    const { width: w, height: h } = this.game.renderer;
    // Warm dusk gradient.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a1a44');
    g.addColorStop(1, '#0e1630');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd14d';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎪 CARNIVAL', w / 2, h / 2 - 16);
    ctx.fillStyle = '#fff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Welcome to the fair...', w / 2, h / 2 + 22);
  }
  get blocksRenderBelow() {
    return true;
  }
}
