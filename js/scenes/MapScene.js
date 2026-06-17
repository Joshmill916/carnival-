// The top-down fairground. Walk the avatar with the joystick (or WASD); walking
// up to an unlocked booth opens its play prompt. Locked booths show a hint.
import { Scene } from '../core/SceneManager.js';
import { BOOTHS, WORLD } from '../data/defs.js';
import { isUnlocked } from '../systems/Upgrades.js';
import { clamp, dist } from '../core/util.js';
import { drawGround, drawBooth, drawAvatar } from '../ui/Sprites.js';
import { toast } from '../ui/Modal.js';

const SPEED = 220; // px/s
const TRIGGER_R = 95; // proximity to open a booth
const LOCK_HINT_R = 95;

export class MapScene extends Scene {
  onEnter(params) {
    this.game.input.setMode('move');
    this.game.hud.show();
    this.pos = this.game.state.s.player.pos;
    this.facing = this.game.state.s.player.facing || 'down';
    this.walkPhase = 0;
    this.dismissedBoothId = null; // don't re-open the same booth until we leave it
    this.lockHinted = null;
    if (params?.welcomeGained > 0) {
      toast(`Welcome back! +${params.welcomeGained} ⚡ while away`);
    }
  }

  onResume(result) {
    // Returning from a prompt/game: keep the joystick + HUD active. Re-grab the
    // player ref in case the save was reset while a menu was open.
    this.pos = this.game.state.s.player.pos;
    this.facing = this.game.state.s.player.facing || 'down';
    this.game.input.setMode('move');
    this.game.hud.show();
    if (result?.dismissedBoothId) this.dismissedBoothId = result.dismissedBoothId;
  }

  update(dt) {
    const mv = this.game.input.move;
    const moving = Math.hypot(mv.x, mv.y) > 0.01;
    if (moving) {
      this.pos.x = clamp(this.pos.x + mv.x * SPEED * dt, 20, WORLD.w - 20);
      this.pos.y = clamp(this.pos.y + mv.y * SPEED * dt, 20, WORLD.h - 20);
      this.walkPhase += dt * 12;
      if (Math.abs(mv.x) > Math.abs(mv.y)) this.facing = mv.x < 0 ? 'left' : 'right';
      else this.facing = mv.y < 0 ? 'up' : 'down';
      this.game.state.s.player.facing = this.facing;
      this.game.state.save();
    }

    // Booth proximity.
    let near = null;
    for (const b of BOOTHS) {
      if (dist(this.pos.x, this.pos.y, b.x, b.y) < TRIGGER_R) {
        near = b;
        break;
      }
    }
    if (!near) {
      this.dismissedBoothId = null;
      this.lockHinted = null;
    } else if (near.id !== this.dismissedBoothId) {
      if (isUnlocked(near.unlockKey)) {
        this.activeBoothId = near.id;
        this.dismissedBoothId = near.id; // suppress re-trigger until handled/left
        this.game.openBoothPrompt(near);
      } else if (this.lockHinted !== near.id) {
        this.lockHinted = near.id;
        toast(`${near.name} is locked — open it in Upgrades ⬆️`);
      }
    }
  }

  render(ctx, _alpha) {
    const r = this.game.renderer;
    // Sky/background behind the world edges.
    ctx.fillStyle = '#0e1630';
    ctx.fillRect(0, 0, r.width, r.height);

    this.game.camera.follow(this.pos.x, this.pos.y, r.width, r.height, WORLD.w, WORLD.h);
    this.game.camera.apply(ctx);

    drawGround(ctx, WORLD, this.game.camera);
    // Draw booths and avatar sorted by y so closer ones overlap correctly.
    const drawables = [
      ...BOOTHS.map((b) => ({ y: b.y, draw: () => drawBooth(ctx, b, isUnlocked(b.unlockKey)) })),
      { y: this.pos.y, draw: () => drawAvatar(ctx, this.pos.x, this.pos.y, this.facing, this.walkPhase) },
    ].sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.game.camera.reset(ctx);

    // Joystick overlay (screen space).
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
