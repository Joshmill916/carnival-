// Small math + helper utilities shared across the engine. No dependencies.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// Axis-aligned bounding box overlap.
export const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Circle vs circle hit test (centers + radii).
export const circleHit = (ax, ay, ar, bx, by, br) =>
  dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);

// Point inside circle.
export const pointInCircle = (px, py, cx, cy, r) => dist2(px, py, cx, cy) <= r * r;

// Format milliseconds as M:SS (used for the energy regen countdown).
export function formatTime(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Glow helpers — intentionally FLAT. Canvas shadowBlur gets multiplied by the
// device pixel ratio, so on a high-DPI phone (3x) a small blur became a huge
// hazy halo that made the whole game look like a blurry "fish-eye". We keep
// these as no-ops so every call site stays simple; the neon look now comes
// purely from bright fills, strokes and colors (no bloom).
export function setGlow(ctx, _color, _blur = 0) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}
export function clearGlow(ctx) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

// Seeded PRNG (mulberry32) so mini-games are deterministic for testing.
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.seed = seed;
  return rng;
}

// Deep clone via structuredClone with a JSON fallback for old engines.
export function clone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// Recursively fill missing keys of `target` from `defaults` (objects only).
// Used by save migration so new schema fields get sane defaults on old saves.
export function deepMergeDefaults(target, defaults) {
  if (Array.isArray(defaults)) return target === undefined ? clone(defaults) : target;
  if (defaults && typeof defaults === 'object') {
    const out = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
    for (const k of Object.keys(defaults)) {
      out[k] = deepMergeDefaults(out[k], defaults[k]);
    }
    return out;
  }
  return target === undefined ? defaults : target;
}
