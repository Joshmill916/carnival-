// Canvas setup with device-pixel-ratio scaling + resize, plus client→canvas
// coordinate mapping. Also exposes the logical (CSS-pixel) viewport size.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0; // logical CSS pixels
    this.height = 0;
    this.dpr = 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    ctx.imageSmoothingEnabled = false;
  }

  clear(color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, this.width, this.height);
    } else {
      ctx.clearRect(0, 0, this.width, this.height);
    }
    ctx.restore();
  }

  // Map a pointer/touch client coordinate to logical canvas coordinates.
  toCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (this.width / rect.width),
      y: (clientY - rect.top) * (this.height / rect.height),
    };
  }
}

// A camera that follows a target point and clamps to world bounds. The map scene
// applies/removes its transform around world-space drawing.
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }
  follow(targetX, targetY, viewW, viewH, worldW, worldH) {
    let x = targetX - viewW / 2;
    let y = targetY - viewH / 2;
    // Clamp so we never show outside the world; if the world is smaller than the
    // view, centre it.
    x = worldW <= viewW ? (worldW - viewW) / 2 : Math.max(0, Math.min(x, worldW - viewW));
    y = worldH <= viewH ? (worldH - viewH) / 2 : Math.max(0, Math.min(y, worldH - viewH));
    this.x = x;
    this.y = y;
  }
  apply(ctx) {
    ctx.save();
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  }
  reset(ctx) {
    ctx.restore();
  }
  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}
