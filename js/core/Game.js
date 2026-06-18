// Top-level orchestrator: owns the renderer, camera, input, loop, scene stack and
// HUD, and exposes the navigation helpers scenes call to move between screens.
import { Renderer, Camera } from './Renderer.js';
import { Loop } from './Loop.js';
import { SceneManager } from './SceneManager.js';
import { Input } from './Input.js';
import { State } from '../data/State.js';
import { HUD } from '../ui/HUD.js';

import { BootScene } from '../scenes/BootScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { BoothPromptScene } from '../scenes/BoothPromptScene.js';
import { MiniGameScene } from '../scenes/MiniGameScene.js';
import { ResultsScene } from '../scenes/ResultsScene.js';
import { StoreScene } from '../scenes/StoreScene.js';
import { PrizeScene } from '../scenes/PrizeScene.js';
import { SettingsScene } from '../scenes/SettingsScene.js';

export class Game {
  constructor(canvas) {
    this.renderer = new Renderer(canvas);
    this.camera = new Camera();
    this.input = new Input(this.renderer);
    this.state = State;
    this.scenes = new SceneManager(this);

    this.hud = new HUD({
      onPrizes: () => this.openPrizes(),
      onStore: () => this.openStore(),
      onSettings: () => this.openSettings(),
    });
    this.hud.hide();

    this._registerScenes();
    // Screen-shake state, applied around every scene render.
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeMag = 0;
    this.loop = new Loop(
      (dt) => this._update(dt),
      (alpha) => this._render(alpha)
    );
  }

  // Kick a screen shake: peak pixel offset `mag`, easing out over `dur` seconds.
  addShake(mag, dur = 0.3) {
    if (mag > this.shakeMag || this.shakeT <= 0) {
      this.shakeMag = mag;
      this.shakeDur = dur;
      this.shakeT = dur;
    }
  }

  _registerScenes() {
    this.scenes.register('Boot', (g) => new BootScene(g));
    this.scenes.register('Map', (g) => new MapScene(g));
    this.scenes.register('BoothPrompt', (g) => new BoothPromptScene(g));
    this.scenes.register('MiniGame', (g) => new MiniGameScene(g));
    this.scenes.register('Results', (g) => new ResultsScene(g));
    this.scenes.register('Store', (g) => new StoreScene(g));
    this.scenes.register('Prizes', (g) => new PrizeScene(g));
    this.scenes.register('Settings', (g) => new SettingsScene(g));
  }

  start() {
    this.scenes.clearTo('Boot');
    this.loop.start();
  }

  _update(dt) {
    this.input.sample();
    if (this.shakeT > 0) this.shakeT -= dt;
    this.scenes.update(dt);
  }
  _render(alpha) {
    this.renderer.clear('#0e1630');
    const ctx = this.renderer.ctx;
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      const i = this.shakeMag * (this.shakeT / this.shakeDur);
      ox = (Math.random() * 2 - 1) * i;
      oy = (Math.random() * 2 - 1) * i;
    }
    ctx.save();
    ctx.translate(ox, oy);
    this.scenes.render(ctx, alpha);
    ctx.restore();
  }

  // --- Navigation helpers used by scenes -------------------------------------
  toMap() {
    while (this.scenes.stack.length > 1) this.scenes.pop();
    this.hud.show();
  }
  openBoothPrompt(booth) {
    this.scenes.push('BoothPrompt', { booth });
  }
  closeBoothPrompt(boothId) {
    this.scenes.pop({ dismissedBoothId: boothId });
  }
  playBooth(booth) {
    this.scenes.replace('MiniGame', { booth });
  }
  openStore() {
    this.scenes.push('Store');
  }
  openPrizes() {
    this.scenes.push('Prizes');
  }
  openSettings() {
    this.scenes.push('Settings');
  }
  closeMenu() {
    this.scenes.pop();
    this.hud.show();
  }
}
