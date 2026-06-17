// Boots the game: applies derived upgrade stats, credits offline energy, then
// hands off to the map. Renders a brief splash.
import { Scene } from '../core/SceneManager.js';
import { recompute } from '../systems/Upgrades.js';
import { accrueEnergy, getEnergyStatus } from '../systems/Economy.js';
import { State } from '../data/State.js';

export class BootScene extends Scene {
  onEnter() {
    recompute(); // energy.max / regenMs from purchased upgrade levels
    const before = State.s.economy.energy.current;
    accrueEnergy(); // credit energy earned while away
    this.gained = State.s.economy.energy.current - before;
    this.t = 0;
    this.status = getEnergyStatus();
  }
  update(dt) {
    this.t += dt;
    if (this.t > 0.6) {
      this.game.scenes.replace('Map', { welcomeGained: this.gained });
    }
  }
  render(ctx) {
    const { width: w, height: h } = this.game.renderer;
    ctx.fillStyle = '#14122b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd14d';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎪 CARNIVAL', w / 2, h / 2 - 16);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('Loading the fair...', w / 2, h / 2 + 20);
  }
  get blocksRenderBelow() {
    return true;
  }
}
