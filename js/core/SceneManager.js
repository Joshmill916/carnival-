// Scene base class + a stack-based manager so modal overlays (booth prompt, store,
// upgrades, settings) can render over a frozen map.

export class Scene {
  constructor(game) {
    this.game = game;
  }
  onEnter(_params) {}
  onExit() {}
  onPause() {} // another scene pushed on top
  onResume(_result) {} // scene above this one was popped
  update(_dt) {}
  render(_ctx, _alpha) {}
  handleInput(_input) {}
  // Modal scenes pause and (optionally) hide everything below them.
  get blocksUpdateBelow() {
    return true;
  }
  get blocksRenderBelow() {
    return false;
  }
}

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.factories = new Map();
    this.stack = [];
  }
  register(key, factory) {
    this.factories.set(key, factory);
  }
  _make(key) {
    const f = this.factories.get(key);
    if (!f) throw new Error(`Scene not registered: ${key}`);
    return f(this.game);
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  // Overlay a new scene; pause the one below.
  push(key, params) {
    this.top?.onPause();
    const scene = this._make(key);
    this.stack.push(scene);
    scene.onEnter(params);
    return scene;
  }
  // Swap the top scene.
  replace(key, params) {
    const old = this.stack.pop();
    old?.onExit();
    const scene = this._make(key);
    this.stack.push(scene);
    scene.onEnter(params);
    return scene;
  }
  // Pop the top scene and resume the one below, passing it a result.
  pop(result) {
    const old = this.stack.pop();
    old?.onExit();
    this.top?.onResume(result);
  }
  // Unwind to a fresh single root scene.
  clearTo(key, params) {
    while (this.stack.length) this.stack.pop()?.onExit();
    return this.push(key, params);
  }

  update(dt) {
    // Walk top→down; stop descending once a scene blocks updates below it.
    for (let i = this.stack.length - 1; i >= 0; i--) {
      this.stack[i].update(dt);
      if (this.stack[i].blocksUpdateBelow) break;
    }
  }
  render(ctx, alpha) {
    // Find the lowest visible scene (highest one that hides everything below).
    let start = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].blocksRenderBelow) {
        start = i;
        break;
      }
    }
    for (let i = start; i < this.stack.length; i++) {
      this.stack[i].render(ctx, alpha);
    }
  }
  handleInput(input) {
    this.top?.handleInput(input);
  }
}
