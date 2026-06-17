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
import { UpgradesScene } from '../scenes/UpgradesScene.js';
import { SettingsScene } from '../scenes/SettingsScene.js';

export class Game {
  constructor(canvas) {
    this.renderer = new Renderer(canvas);
    this.camera = new Camera();
    this.input = new Input(this.renderer);
    this.state = State;
    this.scenes = new SceneManager(this);

    this.hud = new HUD({
      onStore: () => this.openStore(),
      onUpgrades: () => this.openUpgrades(),
      onSettings: () => this.openSettings(),
    });
    this.hud.hide();

    this._registerScenes();
    this.loop = new Loop(
      (dt) => this._update(dt),
      (alpha) => this._render(alpha)
    );
  }

  _registerScenes() {
    this.scenes.register('Boot', (g) => new BootScene(g));
    this.scenes.register('Map', (g) => new MapScene(g));
    this.scenes.register('BoothPrompt', (g) => new BoothPromptScene(g));
    this.scenes.register('MiniGame', (g) => new MiniGameScene(g));
    this.scenes.register('Results', (g) => new ResultsScene(g));
    this.scenes.register('Store', (g) => new StoreScene(g));
    this.scenes.register('Upgrades', (g) => new UpgradesScene(g));
    this.scenes.register('Settings', (g) => new SettingsScene(g));
  }

  start() {
    this.scenes.clearTo('Boot');
    this.loop.start();
  }

  _update(dt) {
    this.input.sample();
    this.scenes.update(dt);
  }
  _render(alpha) {
    this.renderer.clear('#0e1630');
    this.scenes.render(this.renderer.ctx, alpha);
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
    // Called from the prompt or the results screen (both are the top overlay).
    this.scenes.replace('MiniGame', { booth });
  }
  openStore() {
    this.scenes.push('Store');
  }
  openUpgrades() {
    this.scenes.push('Upgrades');
  }
  openSettings() {
    this.scenes.push('Settings');
  }
  closeMenu() {
    this.scenes.pop();
    this.hud.show();
  }
}
