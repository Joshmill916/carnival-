// Fixed-timestep game loop. Logic advances in whole STEP units (deterministic
// physics); rendering interpolates with `alpha`. Clamps frame time so a sleeping
// tab doesn't trigger a spiral of catch-up updates.
export class Loop {
  constructor(update, render) {
    this.update = update; // (dtSeconds) => void
    this.render = render; // (alpha) => void
    this.STEP = 1 / 60;
    this.MAX_FRAME = 0.25;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this._frame = this._frame.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }
  stop() {
    this.running = false;
  }
  _frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > this.MAX_FRAME) dt = this.MAX_FRAME;
    this.acc += dt;
    while (this.acc >= this.STEP) {
      this.update(this.STEP);
      this.acc -= this.STEP;
    }
    this.render(this.acc / this.STEP);
    requestAnimationFrame(this._frame);
  }
}
