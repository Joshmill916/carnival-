// Shared material/geometry helpers for the 3D world. Materials are cached by
// colour: the fair reuses a handful of bright flat colours across hundreds of
// meshes, and sharing them keeps GPU state changes (and phone battery) down.
import * as THREE from '../vendor/three.module.min.js';

const _lit = new Map();
const _flat = new Map();

// Flat-shaded lit material — the chunky N64 look.
export function mat(color) {
  let m = _lit.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    _lit.set(color, m);
  }
  return m;
}

// Unlit material, for things that should read as glowing (bulbs, stars, sky).
export function flat(color) {
  let m = _flat.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    _flat.set(color, m);
  }
  return m;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

export function cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  return m;
}

// A flat quad lying on the ground (paths, plaza, mowed stripes).
export function slab(w, d, color, x, z, y = 0.4) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
