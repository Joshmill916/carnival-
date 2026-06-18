// The top-down fairground. Walk the avatar with the joystick (or WASD); walking
// up to a booth opens its play prompt. The fair is alive: animated rides, food
// stalls, wandering people, swaying trees and twinkling string lights.
import { Scene } from '../core/SceneManager.js';
import { BOOTHS, RIDES, FOOD, TREES, LIGHT_LINES, WORLD, NPC_COUNT } from '../data/defs.js';
import { clamp, dist, makeRng } from '../core/util.js';
import {
  drawGround, drawBooth, drawAvatar, drawRide, drawFoodStall,
  drawTree, drawStringLights, drawNPC, drawDizzyStars,
} from '../ui/Sprites.js';
import { Particles } from '../ui/Particles.js';
import { Audio } from '../core/Audio.js';

const SPEED = 240; // px/s
const TRIGGER_R = 110; // proximity to open a booth
const FOOD_R = 64; // proximity to set a food stall erupting
const RIDE_GRAVITY = 1600; // px/s^2 pull on the flung rider's height

const SHIRTS = ['#ff5d8f', '#5b8cff', '#3ddc97', '#ffd14d', '#ff8f4d', '#b07cff'];
const SKINS = ['#ffd9b3', '#e8b990', '#c98e63', '#8d5a3b'];
const HAIRS = ['#2b2b3e', '#5a3a22', '#caa24a', '#7a3b2a'];

export class MapScene extends Scene {
  onEnter(params) {
    this.game.input.setMode('move');
    this.game.hud.show();
    this.pos = this.game.state.s.player.pos;
    this.facing = this.game.state.s.player.facing || 'up';
    this.walkPhase = 0;
    this.t = 0;
    this.dismissedBoothId = null;
    this.dismissedLockedId = null;
    this.foodNearId = null;
    this.fx = new Particles(); // world-space effects: food eruptions, landing dust
    this._resetRider();
    if (!this.npcs) this._spawnNpcs();
  }

  onResume(result) {
    this.pos = this.game.state.s.player.pos;
    this.facing = this.game.state.s.player.facing || 'up';
    this.game.input.setMode('move');
    this.game.hud.show();
    this.foodNearId = null;
    this.dismissedLockedId = null;
    this._resetRider();
    if (result?.dismissedBoothId) this.dismissedBoothId = result.dismissedBoothId;
  }

  // Player ride state machine: free → riding (spins up) → flung (tumbles through
  // the air) → dizzy (stars circle the head) → free again.
  _resetRider() {
    this.rider = {
      state: 'free', ride: null, t: 0,
      angle: 0, radius: 0, spinRate: 0,
      z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vrot: 0,
      dizzyT: 0, cooldown: 0,
    };
  }

  _spawnNpcs() {
    const rng = makeRng(1234);
    this.npcs = [];
    for (let i = 0; i < NPC_COUNT; i++) {
      const x = rng.range(120, WORLD.w - 120);
      const y = rng.range(160, WORLD.h - 120);
      this.npcs.push({
        x, y,
        tx: x, ty: y,
        speed: rng.range(18, 38),
        pause: rng.range(0, 3),
        phase: rng.range(0, Math.PI * 2),
        shirt: rng.pick(SHIRTS),
        skin: rng.pick(SKINS),
        hair: rng.pick(HAIRS),
        _rng: rng,
      });
    }
  }

  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    this._updateRider(dt);

    // Player movement — only when not on/flying off a ride.
    if (this.rider.state === 'free') {
      const mv = this.game.input.move;
      const moving = Math.hypot(mv.x, mv.y) > 0.01;
      if (moving) {
        this.pos.x = clamp(this.pos.x + mv.x * SPEED * dt, 24, WORLD.w - 24);
        this.pos.y = clamp(this.pos.y + mv.y * SPEED * dt, 24, WORLD.h - 24);
        this.walkPhase += dt * 12;
        if (Math.abs(mv.x) > Math.abs(mv.y)) this.facing = mv.x < 0 ? 'left' : 'right';
        else this.facing = mv.y < 0 ? 'up' : 'down';
        this.game.state.s.player.facing = this.facing;
        this.game.state.save();
      }
      this._checkFood();
    }

    // Wandering fair-goers.
    for (const n of this.npcs) {
      if (n.pause > 0) {
        n.pause -= dt;
        continue;
      }
      const dx = n.tx - n.x, dy = n.ty - n.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        n.tx = clamp(n.x + n._rng.range(-220, 220), 100, WORLD.w - 100);
        n.ty = clamp(n.y + n._rng.range(-220, 220), 140, WORLD.h - 100);
        n.pause = n._rng.range(0.5, 3);
      } else {
        n.x += (dx / d) * n.speed * dt;
        n.y += (dy / d) * n.speed * dt;
      }
    }

    // Booth proximity → open prompt (only while walking freely).
    if (this.rider.state === 'free') {
      let near = null;
      for (const b of BOOTHS) {
        if (dist(this.pos.x, this.pos.y, b.x, b.y) < TRIGGER_R) {
          near = b;
          break;
        }
      }
      if (!near) {
        this.dismissedBoothId = null;
        this.dismissedLockedId = null;
      } else {
        const currentLevel = this.game.state.s.progress.level;
        if (near.minLevel > currentLevel) {
          // Locked booth — show a one-time hint, suppress the game prompt.
          if (near.id !== this.dismissedLockedId) {
            this.dismissedLockedId = near.id;
            this.fx.text(near.x, near.y - 80, `🔒 Level ${near.minLevel} to unlock`, '#ffd14d', 18);
          }
        } else if (near.id !== this.dismissedBoothId) {
          this.dismissedBoothId = near.id;
          this.game.openBoothPrompt(near);
        }
      }
    }
  }

  // Walk onto a food stall → it erupts like a volcano (edge-triggered: re-arms
  // when you walk away and come back).
  _checkFood() {
    let near = null;
    for (const f of FOOD) {
      if (dist(this.pos.x, this.pos.y, f.x, f.y) < FOOD_R) {
        near = f;
        break;
      }
    }
    if (!near) {
      this.foodNearId = null;
    } else if (near.id !== this.foodNearId) {
      this.foodNearId = near.id;
      this._eruptFood(near);
    }
  }

  _eruptFood(f) {
    this.fx.erupt(f.x, f.y - 30, f.emoji, 16);
    this.fx.burst(f.x, f.y - 30, f.color, 16, 240);
    this.fx.text(f.x, f.y - 70, `${f.name}!`, '#fff', 18);
    Audio.splat();
    this.game.addShake(5, 0.22);
  }

  _updateRider(dt) {
    const rd = this.rider;
    if (rd.cooldown > 0) rd.cooldown -= dt;

    if (rd.state === 'free') {
      if (rd.cooldown <= 0) {
        for (const ride of RIDES) {
          if (dist(this.pos.x, this.pos.y, ride.x, ride.y) < ride.r * 0.5) {
            this._mountRide(ride);
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
      rd.z = 6 + Math.sin(rd.t * 6) * 4;
      this.pos.x = rd.ride.x + Math.cos(rd.angle) * rd.radius;
      this.pos.y = rd.ride.y + Math.sin(rd.angle) * rd.radius;
      if (rd.t > 2.3) this._fling();
      return;
    }

    if (rd.state === 'flung') {
      this.pos.x = clamp(this.pos.x + rd.vx * dt, 24, WORLD.w - 24);
      this.pos.y = clamp(this.pos.y + rd.vy * dt, 24, WORLD.h - 24);
      rd.z += rd.vz * dt;
      rd.vz -= RIDE_GRAVITY * dt;
      rd.rot += rd.vrot * dt;
      if (rd.z <= 0 && rd.vz < 0) this._land();
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

  _mountRide(ride) {
    const rd = this.rider;
    rd.state = 'riding';
    rd.ride = ride;
    rd.t = 0;
    rd.radius = ride.r * 0.55;
    rd.angle = Math.atan2(this.pos.y - ride.y, this.pos.x - ride.x);
    rd.z = 0;
    Audio.spinUp();
  }

  _fling() {
    const rd = this.rider;
    const tangent = rd.angle + Math.PI / 2;
    const speed = clamp(rd.spinRate * rd.radius, 220, 720);
    rd.vx = Math.cos(tangent) * speed + Math.cos(rd.angle) * 120;
    rd.vy = Math.sin(tangent) * speed + Math.sin(rd.angle) * 120;
    rd.vz = 540;
    rd.z = rd.ride.r * 0.1;
    rd.rot = 0;
    rd.vrot = (rd.vx >= 0 ? 1 : -1) * 14;
    rd.state = 'flung';
    Audio.whoosh();
    this.game.addShake(6, 0.25);
  }

  _land() {
    const rd = this.rider;
    rd.z = 0;
    rd.rot = 0;
    rd.state = 'dizzy';
    rd.dizzyT = 2.0;
    this.facing = 'down';
    Audio.thud();
    this.game.addShake(8, 0.3);
    this.fx.burst(this.pos.x, this.pos.y + 6, '#caa24a', 18, 200);
    this.game.state.s.player.facing = this.facing;
    this.game.state.save();
  }

  render(ctx) {
    const r = this.game.renderer;
    ctx.fillStyle = '#0e1630';
    ctx.fillRect(0, 0, r.width, r.height);

    this.game.camera.follow(this.pos.x, this.pos.y, r.width, r.height, WORLD.w, WORLD.h);
    this.game.camera.apply(ctx);

    drawGround(ctx, WORLD, this.game.camera);

    // Trees behind the walk-among entities.
    for (const tr of TREES) drawTree(ctx, tr.x, tr.y, this.t);

    // Depth-sort tall entities by their base y so closer ones overlap correctly.
    const drawables = [];
    for (const ride of RIDES) drawables.push({ y: ride.y + ride.r, draw: () => drawRide(ctx, ride, this.t) });
    for (const f of FOOD) drawables.push({ y: f.y + 35, draw: () => drawFoodStall(ctx, f) });
    const currentLevel = this.game.state.s.progress.level;
    for (const b of BOOTHS) drawables.push({ y: b.y + 62, draw: () => drawBooth(ctx, b, this.t, b.minLevel > currentLevel) });
    for (const n of this.npcs) drawables.push({ y: n.y, draw: () => drawNPC(ctx, n, this.t) });
    drawables.push({ y: this.pos.y, draw: () => this._drawPlayer(ctx) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // World-space effects (food eruptions, landing dust) above the entities.
    this.fx.render(ctx);

    // Overhead string lights, on top of everything.
    for (const line of LIGHT_LINES) drawStringLights(ctx, line, this.t);

    this.game.camera.reset(ctx);

    this._drawJoystick(ctx);
  }

  _drawPlayer(ctx) {
    const rd = this.rider;
    const x = this.pos.x;
    const y = this.pos.y - rd.z;
    if (rd.state === 'flung') {
      // Tumbling through the air.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rd.rot);
      drawAvatar(ctx, 0, 0, this.facing, this.walkPhase);
      ctx.restore();
    } else {
      drawAvatar(ctx, x, y, this.facing, this.walkPhase);
      if (rd.state === 'dizzy') drawDizzyStars(ctx, this.pos.x, this.pos.y - 30, this.t);
    }
  }

  _drawJoystick(ctx) {
    const joy = this.game.input.joy;
    if (!joy.active) return;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(joy.baseX, joy.baseY, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffd14d';
    let dx = joy.curX - joy.baseX, dy = joy.curY - joy.baseY;
    const mag = Math.hypot(dx, dy);
    if (mag > 56) {
      dx = (dx / mag) * 56;
      dy = (dy / mag) * 56;
    }
    ctx.beginPath();
    ctx.arc(joy.baseX + dx, joy.baseY + dy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  get blocksRenderBelow() {
    return true;
  }
}
