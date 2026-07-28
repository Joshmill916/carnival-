// Builds the 3D fairground scene graph from the SAME data the 2D map used
// (js/data/defs.js), so the layout you know carries over exactly: the old map's
// (x, y) is (x, z) here, and y is real height.
//
// Style is deliberately chunky N64: flat-shaded low-poly, bright solid colours,
// no shadow maps (blob shadows instead), no textures except the little emoji
// signs on the booths.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, BOOTHS, RIDES, FOOD, TREES, LIGHT_LINES, HEIGHTS } from '../data/defs.js';
import { mat, flat, box, cyl, slab } from './mats.js';

const SKY = 0x7ec8f0;
const GRASS = 0x6bbf4a;
const GRASS_DK = 0x5fb040;
const SAND = 0xe8d5a3;
const SAND_DK = 0xd9c28c;
const WOOD = 0x9c6b43;
const WHITE = 0xfff6e8;

const CX = WORLD.w / 2;      // plaza centre, matching the old 2D ground art
const CZ = WORLD.h * 0.55;

// Emoji sign texture. Guarded so the scene still builds headlessly in Node
// (the tests build the whole graph without a DOM).
function emojiTexture(emoji) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#fff6e8';
    g.fillRect(0, 0, 128, 128);
    g.font = '86px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  } catch {
    return null;
  }
}

export class World3D {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 1100, 2600);

    // Flat, generous lighting — N64 fairs are not moody.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    const sun = new THREE.DirectionalLight(0xfff2d0, 0.75);
    sun.position.set(-500, 900, 400);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x4a7a35, 0.35));

    this.booths = new Map();  // boothId → { group, sign, glow }
    this.rides = [];
    this.bulbs = [];
    this.clouds = [];

    this._buildGround();
    this._buildFence();
    this._buildBooths();
    this._buildRides();
    this._buildFood();
    this._buildTrees();
    this._buildLights();
    this._buildClouds();
  }

  // --- ground ---------------------------------------------------------------
  _buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.w, WORLD.h), mat(GRASS));
    g.rotation.x = -Math.PI / 2;
    g.position.set(CX, 0, WORLD.h / 2);
    this.scene.add(g);

    // Mowed stripes.
    const stripe = 120;
    for (let z = 0; z < WORLD.h; z += stripe * 2) {
      this.scene.add(slab(WORLD.w, stripe, GRASS_DK, CX, z + stripe / 2, 0.2));
    }

    // Central plaza.
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(170, 20), mat(SAND));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(CX, 0.5, CZ);
    this.scene.add(plaza);

    // Paths out to every booth and ride. Derived from defs.js rather than
    // hardcoded, so they can never drift out of sync with the layout.
    for (const target of [...BOOTHS, ...RIDES]) {
      const dx = target.x - CX, dz = target.y - CZ;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const p = slab(64, len, SAND, CX + dx / 2, CZ + dz / 2, 0.45);
      p.rotation.z = -Math.atan2(dx, dz);
      this.scene.add(p);
    }
  }

  _buildFence() {
    const H = 46, T = 10;
    const rails = [
      [WORLD.w, T, CX, 0],
      [WORLD.w, T, CX, WORLD.h],
      [T, WORLD.h, 0, WORLD.h / 2],
      [T, WORLD.h, WORLD.w, WORLD.h / 2],
    ];
    for (const [w, d, x, z] of rails) {
      this.scene.add(box(w, H, d, WOOD, x, H / 2, z));
    }
    // Posts, spaced around the perimeter.
    const step = 160;
    for (let x = 0; x <= WORLD.w; x += step) {
      this.scene.add(box(16, H + 18, 16, SAND_DK, x, (H + 18) / 2, 0));
      this.scene.add(box(16, H + 18, 16, SAND_DK, x, (H + 18) / 2, WORLD.h));
    }
    for (let z = step; z < WORLD.h; z += step) {
      this.scene.add(box(16, H + 18, 16, SAND_DK, 0, (H + 18) / 2, z));
      this.scene.add(box(16, H + 18, 16, SAND_DK, WORLD.w, (H + 18) / 2, z));
    }
  }

  // --- booths ---------------------------------------------------------------
  _buildBooths() {
    for (const b of BOOTHS) {
      const g = new THREE.Group();
      g.position.set(b.x, 0, b.y);
      const color = new THREE.Color(b.color).getHex();
      const H = HEIGHTS.booth;

      g.add(box(150, 78, 96, WHITE, 0, 39, 0));            // back wall / body
      g.add(box(158, 16, 104, color, 0, 86, 0));           // header band
      g.add(box(150, 22, 30, WOOD, 0, 42, -56));           // counter facing you
      g.add(box(14, 44, 14, WOOD, -66, 22, -56));          // counter legs
      g.add(box(14, 44, 14, WOOD, 66, 22, -56));

      // Striped awning over the counter — alternating slats, the classic look.
      for (let i = 0; i < 6; i++) {
        const s = box(25, 8, 54, i % 2 ? WHITE : color, -62.5 + i * 25, 104, -40);
        s.rotation.x = -0.42;
        g.add(s);
      }

      // Sign board with the booth's emoji.
      const tex = emojiTexture(b.emoji);
      const signMat = tex
        ? new THREE.MeshLambertMaterial({ map: tex, flatShading: true })
        : mat(WHITE);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(56, 56, 8), signMat);
      sign.position.set(0, H + 12, -20);
      g.add(sign);

      // Two poles holding the sign up.
      g.add(box(8, 44, 8, WOOD, -22, H - 14, -20));
      g.add(box(8, 44, 8, WOOD, 22, H - 14, -20));

      this.scene.add(g);
      this.booths.set(b.id, { group: g, sign, def: b, locked: false });
    }
  }

  // --- rides ----------------------------------------------------------------
  _buildRides() {
    for (const r of RIDES) {
      const g = new THREE.Group();
      g.position.set(r.x, 0, r.y);
      if (r.kind === 'ferris') this._buildFerris(g, r);
      else this._buildCarousel(g, r);
      this.scene.add(g);
    }
  }

  _buildFerris(g, r) {
    const R = r.r * 0.9;
    // A-frame legs.
    for (const s of [-1, 1]) {
      const leg = box(16, R + 40, 16, SAND_DK, s * R * 0.5, (R + 40) / 2, 0);
      leg.rotation.z = -s * 0.28;
      g.add(leg);
    }
    // The wheel itself sits in the XY plane, so it spins about Z like a real
    // ferris wheel. Cabins counter-rotate to stay upright.
    const wheel = new THREE.Group();
    wheel.position.y = R + 30;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 6, 6, 16), mat(0xff5d8f));
    wheel.add(rim);
    const cabins = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const spoke = box(6, R, 6, WHITE, 0, 0, 0);
      spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);

      const cab = box(30, 26, 30, i % 2 ? 0xffd14d : 0x5b8cff, 0, 0, 0);
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(cab);
      cabins.push({ mesh: cab, a });
    }
    g.add(wheel);
    this.rides.push({ kind: 'ferris', wheel, cabins, R });
  }

  _buildCarousel(g, r) {
    const R = r.r;
    g.add(cyl(R, R, 14, 16, SAND_DK, 0, 7, 0));           // platform
    g.add(cyl(10, 10, 130, 8, WHITE, 0, 72, 0));          // centre pole
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(R + 12, 56, 12), mat(0xff5d8f));
    canopy.position.y = 158;
    g.add(canopy);

    const spinner = new THREE.Group();
    spinner.position.y = 0;
    const N = 6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * R * 0.62, z = Math.sin(a) * R * 0.62;
      spinner.add(cyl(3, 3, 110, 6, 0xffd14d, x, 69, z));
      const horse = box(34, 22, 14, i % 2 ? WHITE : 0xffd14d, x, 52, z);
      horse.rotation.y = -a;
      spinner.add(horse);
    }
    g.add(spinner);
    this.rides.push({ kind: 'carousel', spinner, horses: spinner.children });
  }

  // --- food, trees, lights, clouds -------------------------------------------
  _buildFood() {
    for (const f of FOOD) {
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.y);
      const color = new THREE.Color(f.color).getHex();
      g.add(box(96, 58, 62, WHITE, 0, 29, 0));
      g.add(box(102, 12, 68, color, 0, 64, 0));
      for (let i = 0; i < 4; i++) {
        const s = box(24, 6, 40, i % 2 ? WHITE : color, -36 + i * 24, 78, -30);
        s.rotation.x = -0.4;
        g.add(s);
      }
      const tex = emojiTexture(f.emoji);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(38, 38, 6),
        tex ? new THREE.MeshLambertMaterial({ map: tex, flatShading: true }) : mat(WHITE)
      );
      sign.position.set(0, HEIGHTS.food + 8, -14);
      g.add(sign);
      g.add(box(6, 34, 6, WOOD, 0, HEIGHTS.food - 12, -14));
      this.scene.add(g);
    }
  }

  _buildTrees() {
    for (const t of TREES) {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.y);
      g.add(cyl(11, 15, 62, 6, WOOD, 0, 31, 0));
      // Chunky low-poly canopy: three faceted blobs.
      const blobs = [[46, 82, 0, 0], [34, 116, 12, 8], [30, 108, -14, -10]];
      for (const [r, y, dx, dz] of blobs) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(0x3f9c35));
        m.position.set(dx, y, dz);
        m.rotation.set(dx, y, dz);
        g.add(m);
      }
      this.scene.add(g);
    }
  }

  _buildLights() {
    for (const line of LIGHT_LINES) {
      const H = HEIGHTS.pole;
      for (const p of line) {
        this.scene.add(cyl(6, 8, H, 6, WHITE, p.x, H / 2, p.y));
      }
      // Bulbs strung in a catenary sag between consecutive poles, on a wire.
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const N = 10;
        const pts = [];
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          pts.push(new THREE.Vector3(
            a.x + (b.x - a.x) * t,
            H - 6 - Math.sin(t * Math.PI) * 34,
            a.y + (b.y - a.y) * t
          ));
        }
        this.scene.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x3a3a4a })
        ));
        for (let k = 1; k < N; k++) {
          const t = k / N;
          const sag = Math.sin(t * Math.PI) * 34;
          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(6, 6, 5),
            flat(k % 2 ? 0xffd14d : 0xff8fc7)
          );
          bulb.position.set(a.x + (b.x - a.x) * t, H - 12 - sag, a.y + (b.y - a.y) * t);
          this.scene.add(bulb);
          this.bulbs.push(bulb);
        }
      }
    }
  }

  _buildClouds() {
    const spots = [[200, 640, 300], [900, 700, 180], [1250, 600, 900], [520, 680, 1100]];
    for (const [x, y, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      for (const [r, dx, dz] of [[70, 0, 0], [52, 66, 10], [46, -60, -8]]) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), flat(0xffffff));
        m.position.set(dx, 0, dz);
        m.scale.y = 0.55;
        g.add(m);
      }
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  // --- per-frame ------------------------------------------------------------
  update(dt, t, level) {
    for (const r of this.rides) {
      if (r.kind === 'ferris') {
        r.wheel.rotation.z += dt * 0.5;
        // Keep the cabins hanging level as the wheel turns.
        for (const c of r.cabins) c.mesh.rotation.z = -r.wheel.rotation.z;
      } else {
        r.spinner.rotation.y += dt * 0.7;
        r.horses.forEach((h, i) => {
          if (h.geometry && h.geometry.type === 'BoxGeometry') {
            h.position.y = 52 + Math.sin(t * 3 + i) * 9;
          }
        });
      }
    }

    // Bulbs twinkle.
    for (let i = 0; i < this.bulbs.length; i++) {
      const s = 0.8 + Math.sin(t * 4 + i * 1.7) * 0.25;
      this.bulbs[i].scale.setScalar(s);
    }

    // Clouds drift and wrap around.
    for (const c of this.clouds) {
      c.position.x += dt * 6;
      if (c.position.x > WORLD.w + 400) c.position.x = -400;
    }

    // Locked booths go grey and drop their sign, matching the 2D map's rule.
    for (const [, b] of this.booths) {
      const locked = b.def.minLevel > level;
      if (locked !== b.locked) {
        b.locked = locked;
        b.group.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          // Remember the real material the first time we grey one out.
          if (!o.userData._origMat) o.userData._origMat = o.material;
          o.material = locked ? mat(0x8b8b9c) : o.userData._origMat;
        });
      }
    }
  }
}
