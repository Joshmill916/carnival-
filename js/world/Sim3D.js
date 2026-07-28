// Pure simulation for the 3D overworld — no three.js, no DOM, no audio, no canvas.
// Everything in here is plain math so it can be unit-tested headlessly
// (see test-world3d.mjs). The scene layer (World3DScene) drives this and turns
// the emitted events into sound, particles and mesh updates.
//
// Coordinate system: the old 2D map's (x, y) becomes 3D (x, z) with y as real
// height, so every position in defs.js carries over unchanged.
import { clamp } from '../core/util.js';
import { WORLD, BOOTHS, RIDES, FOOD, TREES, COLLIDE_R } from '../data/defs.js';

// --- Feel constants — tune these ---------------------------------------------
export const RUN_SPEED = 300;   // top running speed, units/s
export const ACCEL = 1600;      // how quickly you reach top speed
export const FRICTION = 2000;   // how quickly you coast to a stop
export const TURN_RATE = 12;    // how fast the character swings to face his heading
export const GRAVITY = 1900;    // units/s^2
export const JUMP_V = 620;      // first jump launch speed
export const JUMP2_V = 560;     // double jump
export const MAX_JUMPS = 2;
// The camera trails on a leash with slack rather than locking to your heading.
// Locking to the heading makes the camera chase its own tail: it rotates, which
// rotates what "right" on the stick means, which rotates the camera... and you
// run in circles. With slack, running away from the camera drags it straight
// behind you and never spins the view.
export const CAM_DIST = 380;    // how far back the leash lets the camera drift
export const CAM_NEAR = 220;    // and how close it may come before being pushed out
export const CAM_LAG = 6;       // how quickly the leash takes up slack
export const CAM_CLEAR = 44;    // keep-out margin when the camera meets scenery
// Floor on how far the camera can be pulled in. Deliberately small: when you
// are wedged against a stall, being uncomfortably close is far better than
// being *inside* it, so the obstacle constraint wins over comfort.
export const CAM_MIN = 30;
export const TRIGGER_R = 110;   // booth prompt proximity (same as the 2D map)
export const FOOD_R = 64;
export const RIDE_GRAVITY = 1600; // the ride fling keeps its own snappier gravity
export const PLAYER_R = 20;     // collision radius
export const EDGE = 24;         // keep-out from the world fence

const TAU = Math.PI * 2;

// Signed shortest angular difference from a to b, in (-PI, PI].
export function shortestAngle(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Turn a camera yaw + stick vector into a world-space direction. Stick up
// (mvy = -1) always means "away from the camera", which is the whole point of
// a Mario-64 camera.
export function stickToWorld(mvx, mvy, camYaw) {
  const c = Math.cos(camYaw), s = Math.sin(camYaw);
  return { x: c * mvx + s * mvy, z: -s * mvx + c * mvy };
}

// Facing angle for a mesh whose modelled forward is -Z (three.js convention).
export function headingToYaw(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export class Sim3D {
  constructor(opts = {}) {
    this.level = opts.level ?? 99;
    this.player = {
      x: opts.x ?? 600, y: 0, z: opts.z ?? 640,
      vx: 0, vy: 0, vz: 0,
      yaw: opts.yaw ?? 0,
      grounded: true,
      jumps: 0,
      speed: 0,      // horizontal speed, for the walk animation
      squash: 1,     // 1 = neutral; <1 squashed, >1 stretched
    };
    this.camYaw = opts.yaw ?? 0;
    this.camX = this.player.x + Math.sin(this.camYaw) * CAM_DIST;
    this.camZ = this.player.z + Math.cos(this.camYaw) * CAM_DIST;
    this.t = 0;

    // Edge-trigger latches, mirrored from the 2D map so the booth prompt does
    // not immediately reopen after you back out of it.
    this.dismissedBoothId = null;
    this.dismissedLockedId = null;
    this.foodNearId = null;

    this._resetRider();
    this.obstacles = buildObstacles();
  }

  // Ride state machine: free → riding → flung → dizzy → free.
  _resetRider() {
    this.rider = {
      state: 'free', ride: null, t: 0,
      angle: 0, radius: 0, spinRate: 0,
      vx: 0, vz: 0, rot: 0, vrot: 0,
      dizzyT: 0, cooldown: 0,
    };
  }

  // input: { mvx, mvy, jump } — jump is an edge-triggered press, not a hold.
  // Returns the events this step produced so the scene can react.
  step(dt, input = {}) {
    const ev = {
      jumped: false, landed: false, doubleJumped: false,
      mounted: null, flung: false, dizzy: false,
      boothEnter: null, boothLocked: null, foodEnter: null,
    };
    this.t += dt;

    this._updateRider(dt, ev);
    if (this.rider.state === 'free') {
      this._move(dt, input, ev);
      this._checkFood(ev);
      this._checkBooths(ev);
    }
    this._updateCamera(dt);
    return ev;
  }

  // A trailing "leash" camera. It is only dragged when you pull away from it or
  // back into it; running sideways leaves it alone, so the view never spins.
  _updateCamera(dt) {
    const p = this.player;
    let dx = this.camX - p.x, dz = this.camZ - p.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      dx = Math.sin(this.camYaw); dz = Math.cos(this.camYaw); d = 1;
    }
    const nx = dx / d, nz = dz / d;
    let want = null;
    if (d > CAM_DIST) want = CAM_DIST;
    else if (d < CAM_NEAR) want = CAM_NEAR;
    if (want !== null) {
      const k = Math.min(1, CAM_LAG * dt);
      this.camX += (p.x + nx * want - this.camX) * k;
      this.camZ += (p.z + nz * want - this.camZ) * k;
    }
    this._clearCamera();
    this.camYaw = Math.atan2(this.camX - p.x, this.camZ - p.z);
  }

  // Stop the camera sitting inside a tent. Cast from the player out toward the
  // camera and pull it in to the first thing the ray enters.
  _clearCamera() {
    const p = this.player;
    const dx = this.camX - p.x, dz = this.camZ - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const nx = dx / d, nz = dz / d;
    let maxD = d;
    for (const o of this.obstacles) {
      const ox = o.x - p.x, oz = o.z - p.z;
      const proj = ox * nx + oz * nz;      // distance along the ray to closest approach
      if (proj <= 0) continue;             // obstacle is behind the player
      const r = o.r + CAM_CLEAR;
      const perp2 = ox * ox + oz * oz - proj * proj;
      if (perp2 >= r * r) continue;        // ray misses it
      const tEnter = proj - Math.sqrt(r * r - perp2);
      if (tEnter > 0 && tEnter < maxD) maxD = tEnter;
    }
    if (maxD < d) {
      maxD = Math.max(maxD, CAM_MIN);
      this.camX = p.x + nx * maxD;
      this.camZ = p.z + nz * maxD;
    }
  }

  _move(dt, input, ev) {
    const p = this.player;
    const mvx = input.mvx || 0, mvy = input.mvy || 0;
    const mag = Math.hypot(mvx, mvy);

    // Camera-relative acceleration.
    if (mag > 0.01) {
      const dir = stickToWorld(mvx, mvy, this.camYaw);
      const dl = Math.hypot(dir.x, dir.z) || 1;
      const want = Math.min(1, mag) * RUN_SPEED;
      p.vx += (dir.x / dl) * ACCEL * dt;
      p.vz += (dir.z / dl) * ACCEL * dt;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > want) { p.vx = (p.vx / sp) * want; p.vz = (p.vz / sp) * want; }
      // Face where you're running. The camera is left to its own leash.
      const targetYaw = headingToYaw(dir.x / dl, dir.z / dl);
      p.yaw += shortestAngle(p.yaw, targetYaw) * Math.min(1, TURN_RATE * dt);
    } else {
      // Friction — only on the ground; airborne you keep your momentum.
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 0) {
        const drop = (p.grounded ? FRICTION : FRICTION * 0.15) * dt;
        const ns = Math.max(0, sp - drop);
        p.vx = (p.vx / sp) * ns;
        p.vz = (p.vz / sp) * ns;
      }
    }

    // Jump / double jump.
    if (input.jump) {
      if (p.grounded) {
        p.vy = JUMP_V; p.grounded = false; p.jumps = 1; p.squash = 1.28;
        ev.jumped = true;
      } else if (p.jumps < MAX_JUMPS) {
        p.vy = JUMP2_V; p.jumps++; p.squash = 1.22;
        ev.jumped = true; ev.doubleJumped = true;
      }
    }

    // Gravity + ground.
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      if (!p.grounded) { ev.landed = true; p.squash = 0.7; }
      p.y = 0; p.vy = 0; p.grounded = true; p.jumps = 0;
    }
    // Squash/stretch eases back to neutral.
    p.squash += (1 - p.squash) * Math.min(1, 9 * dt);

    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.speed = Math.hypot(p.vx, p.vz);

    this._collide();
    this._clampToWorld();
  }

  // Push the player out of any obstacle cylinder he has walked into.
  _collide() {
    const p = this.player;
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const rr = o.r + PLAYER_R;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = rr - d;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      // Kill the velocity component heading into the obstacle so you slide
      // along it instead of juddering.
      const nx = dx / d, nz = dz / d;
      const into = p.vx * nx + p.vz * nz;
      if (into < 0) { p.vx -= into * nx; p.vz -= into * nz; }
    }
  }

  _clampToWorld() {
    const p = this.player;
    p.x = clamp(p.x, EDGE, WORLD.w - EDGE);
    p.z = clamp(p.z, EDGE, WORLD.h - EDGE);
  }

  _checkBooths(ev) {
    const p = this.player;
    let near = null;
    for (const b of BOOTHS) {
      if (Math.hypot(p.x - b.x, p.z - b.y) < TRIGGER_R) { near = b; break; }
    }
    if (!near) {
      this.dismissedBoothId = null;
      this.dismissedLockedId = null;
      return;
    }
    if (near.minLevel > this.level) {
      if (near.id !== this.dismissedLockedId) {
        this.dismissedLockedId = near.id;
        ev.boothLocked = near;
      }
    } else if (near.id !== this.dismissedBoothId) {
      this.dismissedBoothId = near.id;
      ev.boothEnter = near;
    }
  }

  _checkFood(ev) {
    const p = this.player;
    let near = null;
    for (const f of FOOD) {
      if (Math.hypot(p.x - f.x, p.z - f.y) < FOOD_R) { near = f; break; }
    }
    if (!near) this.foodNearId = null;
    else if (near.id !== this.foodNearId) {
      this.foodNearId = near.id;
      ev.foodEnter = near;
    }
  }

  // --- Rides ----------------------------------------------------------------
  _updateRider(dt, ev) {
    const rd = this.rider;
    const p = this.player;
    if (rd.cooldown > 0) rd.cooldown -= dt;

    if (rd.state === 'free') {
      if (rd.cooldown <= 0 && p.grounded) {
        for (const ride of RIDES) {
          if (Math.hypot(p.x - ride.x, p.z - ride.y) < ride.r * 0.5) {
            this._mount(ride, ev);
            break;
          }
        }
      }
      return;
    }

    if (rd.state === 'riding') {
      rd.t += dt;
      rd.spinRate = 2 + rd.t * 5; // accelerate
      rd.angle += rd.spinRate * dt;
      p.y = 6 + Math.sin(rd.t * 6) * 4;
      p.x = rd.ride.x + Math.cos(rd.angle) * rd.radius;
      p.z = rd.ride.y + Math.sin(rd.angle) * rd.radius;
      p.yaw = headingToYaw(-Math.sin(rd.angle), Math.cos(rd.angle));
      if (rd.t > 2.3) this._fling(ev);
      return;
    }

    if (rd.state === 'flung') {
      p.x = clamp(p.x + rd.vx * dt, EDGE, WORLD.w - EDGE);
      p.z = clamp(p.z + rd.vz * dt, EDGE, WORLD.h - EDGE);
      p.y += p.vy * dt;
      p.vy -= RIDE_GRAVITY * dt;
      rd.rot += rd.vrot * dt;
      if (p.y <= 0 && p.vy < 0) this._land(ev);
      return;
    }

    if (rd.state === 'dizzy') {
      rd.dizzyT -= dt;
      if (rd.dizzyT <= 0) {
        rd.state = 'free';
        rd.cooldown = 1.0; // don't instantly re-board
      }
    }
  }

  _mount(ride, ev) {
    const rd = this.rider, p = this.player;
    rd.state = 'riding';
    rd.ride = ride;
    rd.t = 0;
    rd.radius = ride.r * 0.55;
    rd.angle = Math.atan2(p.z - ride.y, p.x - ride.x);
    rd.rot = 0;
    p.vx = p.vz = 0;
    p.y = 0;
    ev.mounted = ride;
  }

  _fling(ev) {
    const rd = this.rider, p = this.player;
    const tangent = rd.angle + Math.PI / 2;
    const speed = clamp(rd.spinRate * rd.radius, 220, 720);
    rd.vx = Math.cos(tangent) * speed + Math.cos(rd.angle) * 120;
    rd.vz = Math.sin(tangent) * speed + Math.sin(rd.angle) * 120;
    p.vy = 540;
    p.y = rd.ride.r * 0.1;
    rd.rot = 0;
    rd.vrot = (rd.vx >= 0 ? 1 : -1) * 14;
    rd.state = 'flung';
    ev.flung = true;
  }

  _land(ev) {
    const rd = this.rider, p = this.player;
    p.y = 0;
    p.vy = 0;
    p.vx = p.vz = 0;
    p.grounded = true;
    p.jumps = 0;
    rd.rot = 0;
    rd.state = 'dizzy';
    rd.dizzyT = 2.0;
    ev.dizzy = true;
  }
}

// Solid things you bump into. Rides are deliberately absent — you need to be
// able to walk into one to board it.
export function buildObstacles() {
  const out = [];
  for (const b of BOOTHS) out.push({ x: b.x, z: b.y, r: COLLIDE_R.booth });
  for (const f of FOOD) out.push({ x: f.x, z: f.y, r: COLLIDE_R.food });
  for (const t of TREES) out.push({ x: t.x, z: t.y, r: COLLIDE_R.tree });
  return out;
}
