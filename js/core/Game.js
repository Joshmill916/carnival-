// Top-level orchestrator: owns the renderer, camera, input, loop, scene stack and
// HUD, and exposes the navigation helpers scenes call to move between screens.
import { Renderer, Camera } from './Renderer.js';
import { Renderer3D, webglSupported } from './Renderer3D.js';
import { Loop } from './Loop.js';
import { SceneManager } from './SceneManager.js';
import { Input } from './Input.js';
import { State } from '../data/State.js';
import { HUD } from '../ui/HUD.js';

import { BootScene } from '../scenes/BootScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { World3DScene } from '../scenes/World3DScene.js';
import { BoothPromptScene } from '../scenes/BoothPromptScene.js';
import { MiniGameScene } from '../scenes/MiniGameScene.js';
import { ResultsScene } from '../scenes/ResultsScene.js';
import { StoreScene } from '../scenes/StoreScene.js';
import { PrizeScene } from '../scenes/PrizeScene.js';
import { SettingsScene } from '../scenes/SettingsScene.js';

export class Game {
  constructor(canvas, canvas3d) {
    this.renderer = new Renderer(canvas);
    // The 3D overworld is optional: without WebGL we fall back to the original
    // top-down 2D map, which is still fully playable.
    this.renderer3d = canvas3d && webglSupported() ? new Renderer3D(canvas3d) : null;
    if (this.renderer3d && !this.renderer3d.ok) this.renderer3d = null;
    this.use3d = !!this.renderer3d;
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
    // 'Map' is the overworld, whichever backend we're on.
    this.scenes.register('Map', (g) => (this.use3d ? new World3DScene(g) : new MapScene(g)));
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
    // The scene that owns the background decides the backend and the clear
    // colour — not the top of the stack, which is usually a DOM-only modal.
    // That way the booth prompt and store float over the live 3D world instead
    // of over a dead black screen.
    const base = this.scenes.baseRenderScene;
    const is3d = !!(base && base.uses3D);
    if (this.renderer3d) this.renderer3d.setVisible(is3d);
    this.renderer.clear(base ? base.clearColor : '#0e1630');
    const ctx = this.renderer.ctx;
    let ox = 0, oy = 0;
    // A 3D scene shakes its own camera, so don't also shake the 2D overlay —
    // that would jiggle the touch controls away from where you're pressing.
    if (this.shakeT > 0 && !is3d) {
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
