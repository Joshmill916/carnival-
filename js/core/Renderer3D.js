// WebGL renderer for the 3D overworld. Mirrors Renderer.js's DPR/resize handling
// but drives its own canvas, which sits *underneath* the 2D canvas so the 2D
// layer keeps owning all pointer input and all overlay drawing.
import * as THREE from '../vendor/three.module.min.js';

const FOV = 68; // wider than a default 3rd-person cam so the fair reads as open, not cramped
const NEAR = 1;
const FAR = 4000;
const MAX_DPR = 2; // 3x on a phone costs a lot and buys nothing at this poly count

// Cheap probe so the game can fall back to the 2D map on a device without WebGL.
export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.width = 0;
    this.height = 0;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.warn('[3D] WebGL unavailable, falling back to the 2D map:', e && e.message);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
    this.ok = true;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  _resize() {
    if (!this.ok) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setVisible(on) {
    this.canvas.style.display = on ? 'block' : 'none';
    if (on) this._resize();
  }

  render(scene) {
    if (!this.ok) return;
    this.renderer.render(scene, this.camera);
  }
}
