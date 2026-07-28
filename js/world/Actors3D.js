// Low-poly people — the player and the wandering fair-goers. Chunky N64 rigs:
// a few boxes, flat shading, no textures, no skeleton. Animation is the limbs
// swinging on a phase value plus squash-and-stretch on the player.
//
// NPCs use the `simple` build (4 meshes instead of 9). There are 14 of them, and
// on a phone the draw calls matter more than their elbows do.
import * as THREE from '../vendor/three.module.min.js';
import { mat, box } from './mats.js';

export const SHIRTS = [0xff5d8f, 0x5b8cff, 0x3ddc97, 0xffd14d, 0xff8f4d, 0xb07cff];
export const SKINS = [0xffd9b3, 0xe8b990, 0xc98e63, 0x8d5a3b];
export const HAIRS = [0x2b2b3e, 0x5a3a22, 0xcaa24a, 0x7a3b2a];

// A person is modelled facing -Z (three.js convention), feet at y = 0.
export function buildPerson({ shirt, skin, hair, scale = 1, simple = false } = {}) {
  const g = new THREE.Group();
  const s = scale;

  if (simple) {
    const legs = box(22 * s, 18 * s, 10 * s, 0x37406b, 0, 9 * s, 0);
    const body = box(22 * s, 22 * s, 14 * s, shirt, 0, 29 * s, 0);
    const head = box(18 * s, 16 * s, 16 * s, skin, 0, 48 * s, 0);
    const hairM = box(19 * s, 6 * s, 17 * s, hair, 0, 56 * s, 0);
    g.add(legs, body, head, hairM);
    g.userData = { simple: true, body, scale: s, baseY: 29 * s };
    return g;
  }

  const legL = box(9 * s, 18 * s, 9 * s, 0x37406b, -5 * s, 9 * s, 0);
  const legR = box(9 * s, 18 * s, 9 * s, 0x37406b, 5 * s, 9 * s, 0);
  const body = box(22 * s, 22 * s, 14 * s, shirt, 0, 29 * s, 0);
  const armL = box(6 * s, 18 * s, 6 * s, skin, -14 * s, 30 * s, 0);
  const armR = box(6 * s, 18 * s, 6 * s, skin, 14 * s, 30 * s, 0);
  const head = box(18 * s, 16 * s, 16 * s, skin, 0, 48 * s, 0);
  const hairM = box(19 * s, 6 * s, 17 * s, hair, 0, 56 * s, 0);
  // Eyes on the -Z face so you can tell which way he's looking.
  const eyeL = box(3 * s, 3 * s, 1 * s, 0x1a1a2e, -4.5 * s, 49 * s, -8.2 * s);
  const eyeR = box(3 * s, 3 * s, 1 * s, 0x1a1a2e, 4.5 * s, 49 * s, -8.2 * s);

  g.add(legL, legR, body, armL, armR, head, hairM, eyeL, eyeR);
  g.userData = { simple: false, legL, legR, armL, armR, body, head, scale: s, baseY: 29 * s };
  return g;
}

// Flat dark disc on the ground under an actor — the N64 way to fake a shadow
// without paying for a shadow map.
export function buildBlobShadow(radius = 20) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.6;
  return m;
}

// `amount` is 0..1 (how hard he's running); `airborne` tucks the legs and
// throws the arms overhead.
export function animatePerson(g, phase, amount, airborne = false) {
  const u = g.userData;
  if (!u) return;
  if (u.simple) {
    u.body.position.y = u.baseY + Math.abs(Math.sin(phase)) * 1.6 * amount;
    return;
  }
  if (airborne) {
    u.legL.rotation.x = -0.5;
    u.legR.rotation.x = 0.3;
    u.armL.rotation.x = -2.3;
    u.armR.rotation.x = -2.3;
    return;
  }
  const sw = Math.sin(phase) * 0.9 * amount;
  u.legL.rotation.x = sw;
  u.legR.rotation.x = -sw;
  u.armL.rotation.x = -sw;
  u.armR.rotation.x = sw;
  u.body.position.y = u.baseY + Math.abs(Math.sin(phase)) * 1.6 * amount;
}

// Squash on landing, stretch on takeoff. Volume is roughly preserved.
export function applySquash(g, squash) {
  const s = squash || 1;
  g.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
}

// Stars that circle your head after a ride flings you.
export function buildDizzyStars() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(new THREE.Mesh(new THREE.TetrahedronGeometry(5, 0), mat(0xffd14d)));
  }
  g.visible = false;
  return g;
}

export function animateDizzyStars(g, t) {
  g.children.forEach((st, i) => {
    const a = t * 5 + (i * Math.PI * 2) / 3;
    st.position.set(Math.cos(a) * 20, Math.sin(t * 8 + i) * 3, Math.sin(a) * 20);
    st.rotation.y = a * 2;
    st.rotation.x = a;
  });
}
