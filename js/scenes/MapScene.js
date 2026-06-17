// The top-down fairground. Walk the avatar with the joystick (or WASD); walking
// up to a booth opens its play prompt. The fair is alive: animated rides, food
// stalls, wandering people, swaying trees and twinkling string lights.
import { Scene } from '../core/SceneManager.js';
import { BOOTHS, RIDES, FOOD, TREES, LIGHT_LINES, WORLD, NPC_COUNT } from '../data/defs.js';
import { clamp, dist, makeRng } from '../core/util.js';
import {
  drawGround, drawBooth, drawAvatar, drawRide, drawFoodStall,
  drawTree, drawStringLights, drawNPC,
} from '../ui/Sprites.js';

const SPEED = 240; // px/s
const TRIGGER_R = 110; // proximity to open a booth

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
    if (!this.npcs) this._spawnNpcs();
  }

  onResume(result) {
    this.pos = this.game.state.s.player.pos;
    this.facing = this.game.state.s.player.facing || 'up';
    this.game.input.setMode('move');
    this.game.hud.show();
    if (result?.dismissedBoothId) this.dismissedBoothId = result.dismissedBoothId;
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

    // Player movement.
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

    // Booth proximity → open prompt.
    let near = null;
    for (const b of BOOTHS) {
      if (dist(this.pos.x, this.pos.y, b.x, b.y) < TRIGGER_R) {
        near = b;
        break;
      }
    }
    if (!near) {
      this.dismissedBoothId = null;
    } else if (near.id !== this.dismissedBoothId) {
      this.dismissedBoothId = near.id;
      this.game.openBoothPrompt(near);
    }
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
    for (const b of BOOTHS) drawables.push({ y: b.y + 62, draw: () => drawBooth(ctx, b, this.t) });
    for (const n of this.npcs) drawables.push({ y: n.y, draw: () => drawNPC(ctx, n, this.t) });
    drawables.push({ y: this.pos.y, draw: () => drawAvatar(ctx, this.pos.x, this.pos.y, this.facing, this.walkPhase) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // Overhead string lights, on top of everything.
    for (const line of LIGHT_LINES) drawStringLights(ctx, line, this.t);

    this.game.camera.reset(ctx);

    this._drawJoystick(ctx);
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
