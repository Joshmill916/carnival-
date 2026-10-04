// Builds the 3D fairground scene graph from the SAME data the 2D map uses
// (js/data/defs.js): the 2D map's (x, y) is (x, z) here, and y is real height.
//
// Style: chunky low-poly N64-ish, but dressed up — striped circus-tent booths
// that face the plaza with painted name boards, a fountain plaza, a picket
// fence with an entrance arch, a big-top tent and pine forest beyond the
// fence, rolling hills, a gradient sky with a sun, and soft real shadows from
// the sun (cheap: one shadow map that follows the player).
import * as THREE from '../vendor/three.module.min.js';
import {
  WORLD, BOOTHS, RIDES, FOOD, TREES, LIGHT_LINES, HEIGHTS, PLAZA, FOUNTAIN, PLATFORMS, rideFrame,
} from '../data/defs.js';
import { mat, flat, box, cyl, slab } from './mats.js';

const HORIZON = 0xcfe9ff;
const SKY_TOP = 0x3d8fe0;
const GRASS_A = 0x67c04a;
const GRASS_B = 0x5bb33f;
const GRASS_FAR = 0x4f9f39;
const SAND = 0xead6a4;
const SAND_EDGE = 0xc9a86e;
const WOOD = 0x9c6b43;
const WOOD_DK = 0x6b4426;
const WHITE = 0xfff6e8;
const STONE = 0xd9d2c3;
const WATER = 0x5cc8f2;
const POLE = 0x2f5d4a;

const CX = PLAZA.x;
const CZ = PLAZA.y;
const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

// --- small helpers -----------------------------------------------------------

// One shared vertex-coloured material for every striped / patchwork mesh.
let _vc = null;
function vcMat() {
  if (!_vc) _vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return _vc;
}

// Paint a cone/cylinder with alternating vertical stripes (seg must be a
// multiple of 4 so the stripe edges land on the geometry's segment edges).
function striped(geo, c1, c2, seg, capColor = c2) {
  const g = geo.toNonIndexed();
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const A = new THREE.Color(c1), B = new THREE.Color(c2), C = new THREE.Color(capColor);
  const step = (Math.PI * 2) / seg;
  for (let i = 0; i < pos.count; i += 3) {
    const y0 = pos.getY(i), y1 = pos.getY(i + 1), y2 = pos.getY(i + 2);
    let col;
    if (Math.abs(y0 - y1) < 1e-6 && Math.abs(y1 - y2) < 1e-6) {
      col = C; // flat cap
    } else {
      const cx = pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2);
      const cz = pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2);
      const a = (Math.atan2(cz, cx) + Math.PI * 2) % (Math.PI * 2);
      col = Math.floor(a / step + 1e-4) % 2 ? A : B;
    }
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = col.r;
      cols[(i + k) * 3 + 1] = col.g;
      cols[(i + k) * 3 + 2] = col.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return new THREE.Mesh(g, vcMat());
}

function stripedCone(r, h, seg, c1, c2) {
  return striped(new THREE.ConeGeometry(r, h, seg, 1), c1, c2, seg);
}
function stripedCyl(rt, rb, h, seg, c1, c2, open = false) {
  return striped(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c1, c2, seg);
}

// Deterministic 0..1 hash so the patchwork / scatter is the same every load.
function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Bulbs, flags and signs are skipped as shadow casters: they'd barely show
// and each one costs a draw call in the shadow pass on a phone.
function shadowy(obj, cast = true, receive = false) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const tiny = o.material && (o.material.isMeshBasicMaterial || o.geometry === BULB_GEO || o.geometry === PENNANT_GEO);
    o.castShadow = cast && !tiny;
    o.receiveShadow = receive;
  });
  return obj;
}

// Canvas texture, guarded so the scene still builds headlessly in Node (the
// tests build the whole graph without a DOM).
function canvasTexture(w, h, draw) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  } catch {
    return null;
  }
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Painted name board: "🎯 Ring Toss" on a cream panel with a coloured frame.
function signTexture(text, color, sub = '') {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = color;
    roundRectPath(g, 0, 0, w, h, 26);
    g.fill();
    g.fillStyle = '#fff8e8';
    roundRectPath(g, 10, 10, w - 20, h - 20, 18);
    g.fill();
    g.fillStyle = '#3a1a2a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${sub ? 46 : 54}px "Outfit", "Trebuchet MS", system-ui, sans-serif`;
    g.fillText(text, w / 2, sub ? h / 2 - 12 : h / 2 + 3);
    if (sub) {
      g.font = '700 26px "Outfit", "Trebuchet MS", system-ui, sans-serif';
      g.fillStyle = color;
      g.fillText(sub, w / 2, h / 2 + 32);
    }
  });
}

function emojiTexture(emoji, bg = '#fff6e8') {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.font = '86px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText(emoji, 64, 70);
  });
}

function texPlane(w, h, tex, fallbackColor = WHITE) {
  const m = tex
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    : mat(fallbackColor);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// A little triangular pennant, hanging point-down.
const PENNANT_GEO = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -9, 0, 0, 9, 0, 0, 0, -22, 0,
  ]), 3));
  g.computeVertexNormals();
  return g;
})();
const _pennantMats = new Map();
function pennant(color) {
  let m = _pennantMats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    _pennantMats.set(color, m);
  }
  return new THREE.Mesh(PENNANT_GEO, m);
}

const BULB_GEO = new THREE.SphereGeometry(5, 6, 5);
const BULB_COLORS = [0xffe27a, 0xff8fc7, 0x8fe3ff, 0xb6ff8a];

export class World3D {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.fog = new THREE.Fog(HORIZON, 1700, 4600);

    // Bright, cheerful lighting with a real sun for soft shadows.
    this.scene.add(new THREE.HemisphereLight(0xd8efff, 0x5a8a3a, 0.75));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -950; sc.right = 950; sc.top = 950; sc.bottom = -950;
    sc.near = 50; sc.far = 4000;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 1.5;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.booths = new Map();  // boothId → { group, def, locked, lockSign }
    this.rides = [];
    this.bulbs = [];
    this.clouds = [];
    this.flags = [];
    this.droplets = [];

    this._buildSky();
    this._buildGround();
    this._buildPlaza();
    this._buildFence();
    this._buildOutskirts();
    this._buildBooths();
    this._buildRides();
    this._buildFood();
    this._buildTrees();
    this._buildLights();
    this._buildPlatforms();
    this._buildClouds();
  }

  // --- sky --------------------------------------------------------------------
  _buildSky() {
    const geo = new THREE.SphereGeometry(6000, 32, 16);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const top = new THREE.Color(SKY_TOP), hor = new THREE.Color(HORIZON), warm = new THREE.Color(0xfff1d6);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 6000;
      if (y > 0.08) c.copy(hor).lerp(top, Math.min(1, (y - 0.08) / 0.6));
      else c.copy(warm).lerp(hor, Math.max(0, (y + 0.05) / 0.13));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
    }));
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(260, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff6cc, fog: false, depthWrite: false })
    );
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(520, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff6cc, fog: false, transparent: true, opacity: 0.25, depthWrite: false })
    );
    halo.position.z = -1;
    this.sunDisc = new THREE.Group();
    this.sunDisc.add(halo, sunDisc);
    this.sunDisc.renderOrder = -1;
    this.scene.add(this.sunDisc);
  }

  // Keep the sky, sun and shadow box centred on the action. Called by the
  // scene each frame with the camera and the player position.
  follow(camera, fx, fz) {
    this.sky.position.copy(camera.position);
    this.sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 5200);
    this.sunDisc.lookAt(camera.position);
    // Snap the shadow box to a grid so shadows don't shimmer as you walk.
    const gx = Math.round(fx / 64) * 64, gz = Math.round(fz / 64) * 64;
    this.sun.target.position.set(gx, 0, gz);
    this.sun.position.set(gx + SUN_DIR.x * 1600, SUN_DIR.y * 1600, gz + SUN_DIR.z * 1600);
  }

  // --- ground -----------------------------------------------------------------
  _buildGround() {
    // Far field beyond the fence, so the world never ends at a void.
    const far = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mat(GRASS_FAR));
    far.rotation.x = -Math.PI / 2;
    far.position.set(CX, -0.6, WORLD.h / 2);
    far.receiveShadow = true;
    this.scene.add(far);

    // Fairground lawn: a faceted patchwork of greens with mowed stripes.
    const nx = 44, nz = 38;
    const geo = new THREE.PlaneGeometry(WORLD.w + 200, WORLD.h + 200, nx, nz).toNonIndexed();
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const A = new THREE.Color(GRASS_A), B = new THREE.Color(GRASS_B), c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const mx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const my = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const stripe = Math.floor((my + WORLD.h) / 150) % 2;
      c.copy(stripe ? A : B).offsetHSL(0, 0, (hash(Math.round(mx), Math.round(my)) - 0.5) * 0.05);
      for (let k = 0; k < 3; k++) {
        cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const lawn = new THREE.Mesh(geo, vcMat());
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(CX, 0, WORLD.h / 2);
    lawn.receiveShadow = true;
    this.scene.add(lawn);

    // Paths from the plaza out to every booth and ride, with a darker edge,
    // ending in a round pad in front of each attraction.
    for (const target of [...BOOTHS, ...RIDES]) {
      const dx = target.x - CX, dz = target.y - CZ;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const ang = -Math.atan2(dx, dz);
      const edge = slab(112, len, SAND_EDGE, CX + dx / 2, CZ + dz / 2, 0.35);
      edge.rotation.z = ang;
      const p = slab(92, len, SAND, CX + dx / 2, CZ + dz / 2, 0.5);
      p.rotation.z = ang;
      edge.receiveShadow = p.receiveShadow = true;
      this.scene.add(edge, p);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(target.r ? target.r + 40 : 150, 28), mat(SAND));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(target.x, 0.55, target.y);
      pad.receiveShadow = true;
      this.scene.add(pad);
    }
  }

  // --- plaza + fountain -------------------------------------------------------
  _buildPlaza() {
    const tex = canvasTexture(512, 512, (g, w) => {
      const cx = w / 2, R = w / 2;
      const rings = ['#e9d3a1', '#d9a46a', '#f2e2bb', '#c98e55', '#efdcb0', '#d9a46a', '#f6e8c6'];
      for (let i = 0; i < rings.length; i++) {
        g.fillStyle = rings[i];
        g.beginPath();
        g.arc(cx, cx, R * (1 - i / rings.length), 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(120,70,30,0.35)';
      g.lineWidth = 2;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.32, cx + Math.sin(a) * R * 0.32);
        g.lineTo(cx + Math.cos(a) * R, cx + Math.sin(a) * R);
        g.stroke();
      }
      // Compass star.
      g.fillStyle = '#e0503e';
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? R * 0.42 : R * 0.62;
        g.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(PLAZA.r, 48),
      tex ? new THREE.MeshLambertMaterial({ map: tex }) : mat(SAND)
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(CX, 0.7, CZ);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Flower beds ringing the plaza (gaps where the paths leave it).
    const pathAngles = [...BOOTHS, ...RIDES].map((t) => Math.atan2(t.y - CZ, t.x - CX));
    const colors = [0xff5d8f, 0xffd14d, 0xffffff, 0xb07cff, 0xff8f4d];
    const dummy = new THREE.Object3D();
    const spots = [];
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * Math.PI * 2;
      if (pathAngles.some((p) => Math.abs(Math.atan2(Math.sin(a - p), Math.cos(a - p))) < 0.2)) continue;
      const r = PLAZA.r + 18 + hash(i, 3) * 30;
      spots.push([CX + Math.cos(a) * r, CZ + Math.sin(a) * r, colors[i % colors.length]]);
    }
    const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(13, 0), mat(0x3f9c35), spots.length);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(6, 0), new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
    const col = new THREE.Color();
    spots.forEach(([x, z, c], i) => {
      dummy.position.set(x, 8, z);
      dummy.rotation.set(i, i * 0.7, 0);
      dummy.scale.set(1, 0.8, 1);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + 3, 19, z - 2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
      flowers.setColorAt(i, col.setHex(c));
    });
    this.scene.add(bushes, flowers);

    // Two-tier fountain.
    const f = new THREE.Group();
    f.position.set(FOUNTAIN.x, 0, FOUNTAIN.y);
    f.add(cyl(FOUNTAIN.r, FOUNTAIN.r + 6, 28, 24, STONE, 0, 14, 0));
    f.add(cyl(FOUNTAIN.r - 10, FOUNTAIN.r - 10, 4, 24, WATER, 0, 25, 0));
    f.add(cyl(16, 22, 70, 10, STONE, 0, 35, 0));
    f.add(cyl(46, 30, 16, 16, STONE, 0, 74, 0));
    f.add(cyl(40, 40, 3, 16, WATER, 0, 81, 0));
    f.add(cyl(7, 9, 34, 8, STONE, 0, 96, 0));
    const top = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 8), mat(0xffd14d));
    top.position.y = 116;
    f.add(top);
    shadowy(f, true, true);
    // Water droplets arcing out of the top bowl (animated in update()).
    const dropMat = flat(0xd8f6ff);
    const dropGeo = new THREE.SphereGeometry(3.2, 6, 4);
    for (let i = 0; i < 36; i++) {
      const d = new THREE.Mesh(dropGeo, dropMat);
      d.userData = { a: (i / 36) * Math.PI * 2, off: (i % 6) / 6 };
      f.add(d);
      this.droplets.push(d);
    }
    this.scene.add(f);
  }

  // --- fence + entrance -------------------------------------------------------
  _buildFence() {
    const H = 40;
    const step = 22;
    const gate = 130; // gap under the entrance arch, south side
    const pts = [];
    for (let x = 0; x <= WORLD.w; x += step) {
      pts.push([x, 0, 0]);
      if (Math.abs(x - CX) > gate) pts.push([x, WORLD.h, 0]);
    }
    for (let z = step; z < WORLD.h; z += step) {
      pts.push([0, z, Math.PI / 2]);
      pts.push([WORLD.w, z, Math.PI / 2]);
    }
    const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(8, H, 4), mat(WHITE), pts.length);
    const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(5.6, 9, 4), mat(WHITE), pts.length);
    const d = new THREE.Object3D();
    pts.forEach(([x, z, r], i) => {
      d.position.set(x, H / 2, z);
      d.rotation.set(0, r, 0);
      d.updateMatrix();
      pickets.setMatrixAt(i, d.matrix);
      d.position.set(x, H + 4, z);
      d.rotation.set(0, r + Math.PI / 4, 0);
      d.updateMatrix();
      tips.setMatrixAt(i, d.matrix);
    });
    this.scene.add(pickets, tips);
    // Two rails per side.
    for (const y of [12, 30]) {
      this.scene.add(box(WORLD.w, 5, 3, WHITE, CX, y, -3));
      this.scene.add(box(WORLD.w / 2 - gate, 5, 3, WHITE, (WORLD.w / 2 - gate) / 2, y, WORLD.h - 3));
      this.scene.add(box(WORLD.w / 2 - gate, 5, 3, WHITE, WORLD.w - (WORLD.w / 2 - gate) / 2, y, WORLD.h - 3));
      this.scene.add(box(3, 5, WORLD.h, WHITE, -3, y, WORLD.h / 2));
      this.scene.add(box(3, 5, WORLD.h, WHITE, WORLD.w + 3, y, WORLD.h / 2));
    }

    // Entrance arch over the south gate.
    const arch = new THREE.Group();
    arch.position.set(CX, 0, WORLD.h);
    for (const s of [-1, 1]) {
      const pillar = stripedCyl(16, 18, 230, 12, 0xff5d8f, WHITE);
      pillar.position.set(s * gate, 115, 0);
      arch.add(pillar);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(20, 12, 8), mat(0xffd14d));
      ball.position.set(s * gate, 244, 0);
      arch.add(ball);
    }
    arch.add(box(gate * 2 + 50, 16, 22, 0xff5d8f, 0, 214, 0));
    const tex = signTexture('🎪 CARNIVAL 🎪', '#ff5d8f');
    const sign = texPlane(gate * 2 - 10, (gate * 2 - 10) / 4, tex, 0xffd14d);
    sign.position.set(0, 180, -14);
    sign.rotation.y = Math.PI; // reads from inside the fair
    arch.add(sign);
    const back = texPlane(gate * 2 - 10, (gate * 2 - 10) / 4, tex, 0xffd14d);
    back.position.set(0, 180, 14);
    arch.add(back);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(BULB_GEO, flat(BULB_COLORS[i % 4]));
      b.position.set(-gate + (i * gate * 2) / 8, 226, -12);
      arch.add(b);
      this.bulbs.push(b);
    }
    shadowy(arch, true, false);
    this.scene.add(arch);
  }

  // --- beyond the fence: forest, hills, big top ------------------------------
  _buildOutskirts() {
    // Ring of pines just outside the fence.
    const trees = [];
    for (let i = 0; i < 320; i++) {
      const u = hash(i, 1), v = hash(i, 2);
      const side = i % 4;
      const depth = 420 + v * 650;
      let x, z;
      if (side === 0) { x = -300 + u * (WORLD.w + 600); z = -depth; }
      else if (side === 1) { x = -300 + u * (WORLD.w + 600); z = WORLD.h + depth; }
      else if (side === 2) { x = -depth; z = -300 + u * (WORLD.h + 600); }
      else { x = WORLD.w + depth; z = -300 + u * (WORLD.h + 600); }
      // Keep the view through the entrance and to the big top open.
      if (side === 1 && Math.abs(x - CX) < 260) continue;
      if (side === 0 && Math.abs(x - CX) < 420 && depth < 900) continue;
      trees.push([x, z, 0.8 + hash(i, 3) * 0.7]);
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(7, 10, 40, 5), mat(WOOD_DK), trees.length);
    const low = new THREE.InstancedMesh(new THREE.ConeGeometry(46, 80, 7), new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
    const high = new THREE.InstancedMesh(new THREE.ConeGeometry(34, 70, 7), new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    trees.forEach(([x, z, s], i) => {
      d.rotation.set(0, i, 0);
      d.scale.setScalar(s);
      d.position.set(x, 20 * s, z); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
      d.position.set(x, 75 * s, z); d.updateMatrix(); low.setMatrixAt(i, d.matrix);
      d.position.set(x, 120 * s, z); d.updateMatrix(); high.setMatrixAt(i, d.matrix);
      c.setHex(0x2f8a3a).offsetHSL((hash(i, 4) - 0.5) * 0.04, 0, (hash(i, 5) - 0.5) * 0.12);
      low.setColorAt(i, c);
      high.setColorAt(i, c.offsetHSL(0, 0, 0.04));
    });
    for (const m of [trunk, low, high]) m.castShadow = true;
    this.scene.add(trunk, low, high);

    // Rolling hills on the horizon (fog blends them into the sky).
    const hillGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + hash(i, 7) * 0.2;
      const r = 3000 + hash(i, 8) * 700;
      const hill = new THREE.Mesh(hillGeo, mat(i % 2 ? 0x5fae45 : 0x4f9f3d));
      hill.position.set(CX + Math.cos(a) * r, -40, WORLD.h / 2 + Math.sin(a) * r);
      hill.scale.set(700 + hash(i, 9) * 500, 280 + hash(i, 10) * 260, 600);
      hill.rotation.y = a;
      this.scene.add(hill);
    }

    // The big top, standing just past the north fence as a landmark.
    const top = new THREE.Group();
    top.position.set(CX, 0, -520);
    const wall = stripedCyl(300, 300, 130, 24, 0xe8343f, WHITE);
    wall.position.y = 65;
    const roof = stripedCone(330, 230, 24, 0xe8343f, WHITE);
    roof.position.y = 130 + 115;
    top.add(wall, roof);
    top.add(cyl(6, 6, 90, 6, WOOD, 0, 400, 0));
    const flag = pennant(0xffd14d);
    flag.scale.set(3, 2, 1);
    flag.rotation.z = Math.PI / 2;
    flag.position.set(0, 440, 0);
    top.add(flag);
    this.flags.push(flag);
    for (const s of [-1, 0, 1]) {
      const peak = stripedCone(70, 100, 12, 0x5b8cff, WHITE);
      peak.position.set(s * 230, 200, 120);
      if (s !== 0) top.add(peak);
    }
    shadowy(top, true, false);
    this.scene.add(top);
  }

  // --- booths -----------------------------------------------------------------
  _buildBooths() {
    for (const b of BOOTHS) {
      const g = new THREE.Group();
      g.position.set(b.x, 0, b.y);
      // Face the plaza: local -Z is the counter side.
      g.rotation.y = Math.atan2(-(CX - b.x), -(CZ - b.y));
      const color = new THREE.Color(b.color).getHex();
      const H = HEIGHTS.booth;
      const W = 190, D = 140;

      g.add(box(W + 24, 10, D + 24, WOOD_DK, 0, 5, 0));                 // deck
      // Back wall: vertical canvas stripes.
      const slats = 8;
      for (let i = 0; i < slats; i++) {
        g.add(box(W / slats + 0.5, H - 20, 10, i % 2 ? WHITE : color,
          -W / 2 + (i + 0.5) * (W / slats), (H - 20) / 2 + 10, D / 2 - 5));
      }
      g.add(box(10, H - 20, D, color, -W / 2 + 5, (H - 20) / 2 + 10, 0)); // side walls
      g.add(box(10, H - 20, D, color, W / 2 - 5, (H - 20) / 2 + 10, 0));
      // Prize plushies hanging on the back wall.
      const plush = [0xff8fc7, 0xffd14d, 0x8fe3ff, 0xb6ff8a, 0xffffff, 0xff8f4d];
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(11, 0), mat(plush[i]));
        p.position.set(-70 + i * 28, 100 + (i % 2) * 18, D / 2 - 16);
        g.add(p);
      }
      // Counter with a coloured skirt.
      g.add(box(W - 10, 46, 24, WHITE, 0, 33, -D / 2 + 10));
      g.add(box(W - 6, 28, 3, color, 0, 26, -D / 2 - 3));
      g.add(box(W + 4, 7, 34, WOOD, 0, 59, -D / 2 + 10));
      // Corner posts.
      for (const [px, pz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
        g.add(cyl(6, 6, H, 8, WHITE, px, H / 2, pz));
      }
      // Striped tent roof.
      const roof = stripedCone(1, 1, 16, color, WHITE);
      roof.scale.set(140, 78, 112);
      roof.position.y = H + 39;
      g.add(roof);
      g.add(cyl(3, 3, 44, 6, WOOD, 0, H + 96, 0));
      const flag = pennant(color);
      flag.rotation.z = Math.PI / 2;
      flag.position.set(0, H + 116, 0);
      g.add(flag);
      this.flags.push(flag);
      // Bulbs along the front edge of the roof.
      for (let i = 0; i < 9; i++) {
        const bl = new THREE.Mesh(BULB_GEO, flat(BULB_COLORS[i % 4]));
        bl.position.set(-W / 2 + (i * W) / 8, H + 2, -D / 2 - 6);
        g.add(bl);
        this.bulbs.push(bl);
      }

      // Painted name board over the counter (front), and on the back wall.
      const tex = signTexture(`${b.emoji} ${b.name}`, b.color);
      const sign = texPlane(170, 42, tex, color);
      sign.position.set(0, H - 18, -D / 2 - 7);
      sign.rotation.y = Math.PI;
      g.add(sign);
      const back = texPlane(170, 42, tex, color);
      back.position.set(0, H - 30, D / 2 + 1);
      g.add(back);

      // Padlock board, shown only while the booth is locked.
      const lockSign = texPlane(150, 38, signTexture('🔒 LOCKED', '#8b8b9c', `Level ${b.minLevel}`), 0x8b8b9c);
      lockSign.position.set(0, 86, -D / 2 - 8);
      lockSign.rotation.y = Math.PI;
      lockSign.visible = false;
      lockSign.userData.noGrey = true;
      g.add(lockSign);

      shadowy(g, true, false);
      this.scene.add(g);
      this.booths.set(b.id, { group: g, def: b, locked: false, lockSign });
    }
  }

  // --- rides ------------------------------------------------------------------
  _buildRides() {
    for (const r of RIDES) {
      const g = new THREE.Group();
      g.position.set(r.x, 0, r.y);
      if (r.kind === 'ferris') this._buildFerris(g, r);
      else this._buildCarousel(g, r);
      shadowy(g, true, false);
      this.scene.add(g);
    }
  }

  _buildFerris(g, r) {
    const { R, hubY, yaw } = rideFrame(r);
    // Faces the plaza so you see the wheel side-on as you walk up.
    g.rotation.y = yaw;
    g.add(box(R * 1.3, 12, 120, WOOD_DK, 0, 6, 0));
    // A-frame legs, front and back.
    for (const z of [-34, 34]) {
      for (const s of [-1, 1]) {
        const leg = box(14, hubY + 20, 14, 0xdfe4ec, s * R * 0.28, hubY / 2, z);
        leg.rotation.z = -s * 0.3;
        g.add(leg);
      }
    }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 90, 8), mat(0xdfe4ec)));
    g.children[g.children.length - 1].rotation.x = Math.PI / 2;
    g.children[g.children.length - 1].position.y = hubY;

    // The wheel spins in the XY plane about Z; gondolas counter-rotate.
    const wheel = new THREE.Group();
    wheel.position.y = hubY;
    for (const z of [-24, 24]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 5, 6, 32), mat(0xff5d8f));
      rim.position.z = z;
      wheel.add(rim);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 3, 6, 24), mat(0xffd14d));
      inner.position.z = z;
      wheel.add(inner);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 60, 12), mat(0xffd14d));
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    const cabins = [];
    const N = 12;
    const cabColors = [0xff5d8f, 0x5b8cff, 0xffd14d, 0x3ddc97, 0xb07cff, 0xff8f4d];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      for (const z of [-24, 24]) {
        const spoke = box(4, R, 4, WHITE, 0, 0, z);
        spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, z);
        spoke.rotation.z = a - Math.PI / 2;
        wheel.add(spoke);
      }
      for (let k = 0; k < 2; k++) {
        const ba = a + (k + 0.5) * (Math.PI / N);
        const bulb = new THREE.Mesh(BULB_GEO, flat(BULB_COLORS[(i + k) % 4]));
        bulb.position.set(Math.cos(ba) * R, Math.sin(ba) * R, -30);
        wheel.add(bulb);
        this.bulbs.push(bulb);
      }
      const cab = new THREE.Group();
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      const c = cabColors[i % cabColors.length];
      cab.add(box(34, 24, 30, c, 0, -22, 0));
      cab.add(box(40, 6, 36, WHITE, 0, -6, 0));
      cab.add(box(3, 14, 3, 0xdfe4ec, 0, 2, 0));
      wheel.add(cab);
      cabins.push({ mesh: cab, a });
    }
    g.add(wheel);
    this.rides.push({ kind: 'ferris', wheel, cabins, R });
  }

  _buildCarousel(g, r) {
    const R = r.r;
    const horseR = rideFrame(r).horseR;
    const platform = stripedCyl(R, R + 4, 16, 24, 0xffd14d, WHITE);
    platform.position.y = 8;
    g.add(platform);
    g.add(cyl(14, 14, 150, 12, 0xff5d8f, 0, 90, 0));
    // Valance band + striped canopy + finial.
    const band = stripedCyl(R + 14, R + 14, 26, 24, 0xff5d8f, WHITE, true);
    band.position.y = 158;
    g.add(band);
    const canopy = stripedCone(R + 22, 80, 24, 0xff5d8f, WHITE);
    canopy.position.y = 171 + 40;
    g.add(canopy);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(12, 10, 8), mat(0xffd14d));
    ball.position.y = 258;
    g.add(ball);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const bl = new THREE.Mesh(BULB_GEO, flat(BULB_COLORS[i % 4]));
      bl.position.set(Math.cos(a) * (R + 16), 146, Math.sin(a) * (R + 16));
      g.add(bl);
      this.bulbs.push(bl);
    }

    const spinner = new THREE.Group();
    const N = 8;
    const horseColors = [WHITE, 0xffd14d, 0x8fe3ff, 0xff8fc7];
    const horses = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * horseR, z = Math.sin(a) * horseR;
      spinner.add(cyl(2.5, 2.5, 130, 6, 0xffd14d, x, 85, z));
      const horse = new THREE.Group();
      horse.position.set(x, 56, z);
      horse.rotation.y = -a;
      horse.userData.a = a;
      const hc = horseColors[i % horseColors.length];
      horse.add(box(12, 16, 36, hc, 0, 0, 0));                 // body
      horse.add(box(10, 18, 10, hc, 0, 12, -18));              // neck
      horse.add(box(10, 10, 16, hc, 0, 20, -24));              // head
      horse.add(box(12, 4, 14, 0xff5d8f, 0, 9, 2));            // saddle
      for (const [lx, lz] of [[-4, -12], [4, -12], [-4, 12], [4, 12]]) {
        horse.add(box(3, 16, 3, hc, lx, -14, lz));
      }
      spinner.add(horse);
      horses.push(horse);
    }
    g.add(spinner);
    this.rides.push({ kind: 'carousel', spinner, horses });
  }

  // --- food carts -------------------------------------------------------------
  _buildFood() {
    for (const f of FOOD) {
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.y);
      g.rotation.y = Math.atan2(-(CX - f.x), -(CZ - f.y));
      const color = new THREE.Color(f.color).getHex();
      g.add(box(92, 46, 56, WHITE, 0, 42, 0));
      g.add(box(94, 20, 58, color, 0, 28, 0));
      g.add(box(100, 6, 64, WOOD, 0, 68, 0));
      for (const s of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 8, 12), mat(0x3a3a4a));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(s * 34, 16, 30);
        g.add(wheel);
        const w2 = wheel.clone();
        w2.position.z = -30;
        g.add(w2);
      }
      g.add(cyl(3, 3, 80, 6, WHITE, 0, 100, 0));
      const umb = stripedCone(74, 34, 12, color, WHITE);
      umb.position.y = 152;
      g.add(umb);
      const tex = emojiTexture(f.emoji);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(40, 40, 4),
        tex ? new THREE.MeshLambertMaterial({ map: tex }) : mat(WHITE)
      );
      sign.position.set(0, 95, -30);
      g.add(sign);
      shadowy(g, true, false);
      this.scene.add(g);
    }
  }

  // --- trees ------------------------------------------------------------------
  _buildTrees() {
    TREES.forEach((t, i) => {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.y);
      g.add(cyl(10, 14, 64, 6, WOOD, 0, 32, 0));
      if (i % 3 === 2) {
        // Pine.
        for (const [r, y] of [[52, 80], [42, 120], [30, 156]]) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(r, 64, 7), mat(0x2f8a3a));
          c.position.y = y;
          c.rotation.y = y;
          g.add(c);
        }
      } else {
        const blobs = [[50, 96, 0, 0, 0x3f9c35], [38, 132, 14, 8, 0x4caf3f], [34, 118, -18, -10, 0x37902f], [30, 110, 8, -22, 0x4caf3f]];
        for (const [r, y, dx, dz, c] of blobs) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(c));
          m.position.set(dx, y, dz);
          m.rotation.set(dx, y, dz);
          g.add(m);
        }
      }
      shadowy(g, true, false);
      this.scene.add(g);
    });
  }

  // --- lamp posts, string lights and bunting -----------------------------------
  _buildLights() {
    const H = HEIGHTS.pole;
    for (const line of LIGHT_LINES) {
      for (const p of line) {
        const post = new THREE.Group();
        post.position.set(p.x, 0, p.y);
        post.add(cyl(10, 12, 14, 8, POLE, 0, 7, 0));
        post.add(cyl(4, 6, H, 8, POLE, 0, H / 2, 0));
        post.add(cyl(14, 8, 10, 8, POLE, 0, H + 2, 0));
        const globe = new THREE.Mesh(new THREE.SphereGeometry(11, 10, 8), flat(0xfff3b0));
        globe.position.y = H + 16;
        post.add(globe);
        post.add(cyl(12, 2, 10, 8, POLE, 0, H + 30, 0));
        shadowy(post, true, false);
        this.scene.add(post);
      }
      // Bulbs + pennants strung in a catenary sag between consecutive posts.
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const N = 16, SAG = 46;
        const pts = [];
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, H - Math.sin(t * Math.PI) * SAG, a.y + (b.y - a.y) * t));
        }
        this.scene.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x3a3a4a })
        ));
        const yaw = Math.atan2(-(b.y - a.y), b.x - a.x);
        for (let k = 1; k < N; k++) {
          const p = pts[k];
          if (k % 2) {
            const bulb = new THREE.Mesh(BULB_GEO, flat(BULB_COLORS[k % 4]));
            bulb.position.set(p.x, p.y - 6, p.z);
            this.scene.add(bulb);
            this.bulbs.push(bulb);
          } else {
            const pen = pennant([0xff5d8f, 0xffd14d, 0x5b8cff, 0x3ddc97][(k / 2) % 4]);
            pen.position.copy(p);
            pen.rotation.y = yaw;
            this.scene.add(pen);
          }
        }
      }
    }
  }

  // --- hay bales, crates and barrels to jump on --------------------------------
  // Each platform is drawn as a stack reaching exactly its `top`, so what you
  // see is what you can stand on.
  _buildPlatforms() {
    this.spinners = [];
    for (const pl of PLATFORMS) {
      const g = new THREE.Group();
      g.position.set(pl.x, 0, pl.y);
      g.rotation.y = hash(pl.x, pl.y) * 0.3 - 0.15;
      const w = pl.s * 2;
      if (pl.kind === 'barrel') {
        g.add(cyl(pl.s, pl.s * 0.9, pl.top, 12, 0xa0622d, 0, pl.top / 2, 0));
        for (const y of [pl.top * 0.2, pl.top * 0.8]) g.add(cyl(pl.s + 1.5, pl.s + 1.5, 4, 12, 0x5d6676, 0, y, 0));
        g.add(cyl(pl.s - 3, pl.s - 3, 2, 12, 0x7a4416, 0, pl.top + 0.5, 0));
      } else {
        const layers = Math.round(pl.top / 40);
        const lh = pl.top / layers;
        for (let i = 0; i < layers; i++) {
          const y = i * lh + lh / 2;
          const jitter = (hash(i, pl.x) - 0.5) * 6;
          if (pl.kind === 'hay') {
            g.add(box(w, lh - 1, w * 0.86, i % 2 ? 0xe8c45c : 0xdcb44a, jitter, y, 0));
            for (const tx of [-w * 0.25, w * 0.25]) g.add(box(3, lh, w * 0.88, 0x8a5a24, tx + jitter, y, 0));
          } else {
            g.add(box(w, lh - 1, w, i % 2 ? 0xb07a45 : 0xc68a50, jitter, y, 0));
            g.add(box(w + 1, 5, w + 1, 0x7a4416, jitter, y + lh / 2 - 4, 0));
            g.add(box(w + 1, 5, w + 1, 0x7a4416, jitter, y - lh / 2 + 4, 0));
          }
        }
        // A spinning gold star on top of each crate tower — the summit.
        if (pl.kind === 'crate') {
          const star = new THREE.Mesh(new THREE.OctahedronGeometry(14, 0), mat(0xffd14d));
          star.position.y = pl.top + 40;
          star.userData.baseY = pl.top + 40;
          g.add(star);
          this.spinners.push(star);
        }
      }
      shadowy(g, true, true);
      this.scene.add(g);
    }
  }

  _buildClouds() {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa8b8, flatShading: true });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      g.position.set(-1500 + hash(i, 11) * (WORLD.w + 3000), 760 + hash(i, 12) * 380, -1500 + hash(i, 13) * (WORLD.h + 3000));
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const r = 60 + hash(i, k) * 50;
        const m = new THREE.Mesh(geo, cloudMat);
        m.position.set((k - (n - 1) / 2) * 70, hash(k, i) * 20, hash(i + k, 3) * 40 - 20);
        m.scale.set(r, r * 0.6, r * 0.8);
        g.add(m);
      }
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  // --- per-frame --------------------------------------------------------------
  // `rider` is Sim3D's rider state. While you're on a ride, the ride is driven
  // by your ride angle so you stay in your gondola / on your horse; otherwise
  // it idles round on its own.
  update(dt, t, level, rider = null) {
    const riding = rider && rider.state === 'riding' ? rider : null;
    for (const r of this.rides) {
      const mine = riding && riding.ride.kind === r.kind;
      if (r.kind === 'ferris') {
        if (mine) {
          // Lock onto the gondola nearest your seat, then turn the wheel with you.
          if (r.lockA == null) {
            let best = r.cabins[0], bd = Infinity;
            for (const c of r.cabins) {
              const d = Math.abs(Math.atan2(Math.sin(c.a + r.wheel.rotation.z - riding.angle), Math.cos(c.a + r.wheel.rotation.z - riding.angle)));
              if (d < bd) { bd = d; best = c; }
            }
            r.lockA = best.a;
          }
          r.wheel.rotation.z = riding.angle - r.lockA;
        } else {
          r.lockA = null;
          r.wheel.rotation.z += dt * 0.35;
        }
        for (const c of r.cabins) c.mesh.rotation.z = -r.wheel.rotation.z;
      } else {
        if (mine) {
          // A horse at base angle a sits at world angle (a - spin).
          if (r.lockA == null) {
            let best = r.horses[0], bd = Infinity;
            for (const h of r.horses) {
              const d = Math.abs(Math.atan2(Math.sin(h.userData.a - r.spinner.rotation.y - riding.angle), Math.cos(h.userData.a - r.spinner.rotation.y - riding.angle)));
              if (d < bd) { bd = d; best = h; }
            }
            r.lockA = best.userData.a;
          }
          r.spinner.rotation.y = r.lockA - riding.angle;
        } else {
          r.lockA = null;
          r.spinner.rotation.y += dt * 0.6;
        }
        r.horses.forEach((h, i) => { h.position.y = 56 + Math.sin(t * 3 + i * 1.3) * 10; });
      }
    }

    // Bulbs twinkle.
    for (let i = 0; i < this.bulbs.length; i++) {
      this.bulbs[i].scale.setScalar(0.85 + Math.sin(t * 4 + i * 1.7) * 0.2);
    }

    // Pennants flutter.
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].rotation.y = Math.sin(t * 3 + i) * 0.5;
    }

    // Fountain droplets: arcs from the top bowl down into the basin.
    for (const d of this.droplets) {
      const u = (t * 0.7 + d.userData.off) % 1;
      const rr = 14 + u * 62;
      d.position.set(Math.cos(d.userData.a) * rr, 110 + 34 * u - 110 * u * u, Math.sin(d.userData.a) * rr);
    }

    for (const st of this.spinners) { st.rotation.y += dt * 2; st.position.y = st.userData.baseY + Math.sin(t * 2) * 5; }

    // Clouds drift and wrap around.
    for (const c of this.clouds) {
      c.position.x += dt * 8;
      if (c.position.x > WORLD.w + 1600) c.position.x = -1600;
    }

    // Locked booths go grey and show their padlock board.
    for (const [, b] of this.booths) {
      const locked = b.def.minLevel > level;
      if (locked !== b.locked) {
        b.locked = locked;
        b.lockSign.visible = locked;
        b.group.traverse((o) => {
          if (!o.isMesh || !o.material || o.userData.noGrey) return;
          if (!o.userData._origMat) o.userData._origMat = o.material;
          o.material = locked ? mat(0x8b8b9c) : o.userData._origMat;
        });
      }
    }
  }
}
