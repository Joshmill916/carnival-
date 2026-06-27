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
    this.zoom = 1;
  }
  // `zoom` < 1 pulls the camera back so more of the world is visible (important
  // on narrow phones, where a 1:1 view feels zoomed right in on the player).
  follow(targetX, targetY, viewW, viewH, worldW, worldH, zoom = 1) {
    this.zoom = zoom;
    const spanW = viewW / zoom; // world units visible across the viewport
    const spanH = viewH / zoom;
    let x = targetX - spanW / 2;
    let y = targetY - spanH / 2;
    // Clamp so we never show outside the world; if the world is smaller than the
    // visible span, centre it.
    x = worldW <= spanW ? (worldW - spanW) / 2 : Math.max(0, Math.min(x, worldW - spanW));
    y = worldH <= spanH ? (worldH - spanH) / 2 : Math.max(0, Math.min(y, worldH - spanH));
    this.x = x;
    this.y = y;
  }
  apply(ctx) {
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  }
  reset(ctx) {
    ctx.restore();
  }
  screenToWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }
}
