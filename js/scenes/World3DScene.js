// The 3D overworld — the Mario-64-style fairground you run around between games.
//
// This scene is glue: it feeds input into Sim3D (pure math, unit-tested), pushes
// the results onto the three.js scene graph, and draws the touch controls on the
// 2D canvas that sits on top of the WebGL one. The booth prompt, HUD, store and
// every mini-game are untouched by all of this.
import * as THREE from '../vendor/three.module.min.js';
import { Scene } from '../core/SceneManager.js';
import { WORLD, NPC_COUNT } from '../data/defs.js';
import { clamp, makeRng } from '../core/util.js';
import { Audio } from '../core/Audio.js';
import { Particles } from '../ui/Particles.js';
import { Sim3D, RUN_SPEED, CAM_DIST } from '../world/Sim3D.js';
import { World3D } from '../world/World3D.js';
import {
  buildPerson, buildBlobShadow, animatePerson, applySquash,
  buildDizzyStars, animateDizzyStars, SHIRTS, SKINS, HAIRS,
} from '../world/Actors3D.js';

const CAM_HEIGHT = 430;   // how high above the player the camera floats
const CAM_LOOK_UP = 40;   // it aims a little above his feet...
const CAM_LOOK_AHEAD = 170; // ...and out ahead of him, so he sits low on screen
                            // and you can see where you're running
const CAM_SMOOTH = 9;     // vertical/positional smoothing

const CAM_BTN = { w: 96, h: 96, margin: 26 };

export class World3DScene extends Scene {
  onEnter() {
    const g = this.game;
    g.input.setMode('move');
    g.hud.show();

    const p = g.state.s.player;
    this.sim = new Sim3D({
      x: p.pos.x,
      z: p.pos.y,          // the 2D map's y is our z
      yaw: p.yaw || 0,
      level: g.state.s.progress.level,
    });

    if (!this.world) this._buildWorld();
    this._syncVisible(true);

    this.fx = new Particles();  // screen-space sparkle for pickups/landings
    this.walkPhase = 0;
    this.t = 0;
    this._jumpWasDown = false;
    this._orbitKeyWasDown = false;
    this._camBtn = this._layoutCamBtn();
    g.input.setButtons([{ id: 'cam', ...this._camBtn }]);
  }

  onResume(result) {
    const g = this.game;
    g.input.setMode('move');
    g.hud.show();
    this._syncVisible(true);
    this._camBtn = this._layoutCamBtn();
    g.input.setButtons([{ id: 'cam', ...this._camBtn }]);
    if (this.sim) {
      this.sim.level = g.state.s.progress.level;
      // Re-latch so backing out of a booth doesn't instantly reopen it.
      if (result?.dismissedBoothId) this.sim.dismissedBoothId = result.dismissedBoothId;
    }
  }

  // A modal (booth prompt, store, settings) floats over the live world, so the
  // 3D canvas stays up — we just stop drawing our touch controls under it and
  // release the camera button so stray taps don't reach us.
  onPause() {
    this._paused = true;
    this.game.input.setButtons([]);
  }
  onExit() {
    this._paused = true;
    this.game.input.setButtons([]);
  }

  // Canvas visibility is driven centrally by Game._render from `uses3D`; this
  // only kicks a resize when we become active again.
  _syncVisible(on) {
    const r3 = this.game.renderer3d;
    if (r3 && on) r3.setVisible(true);
    this._paused = !on;
  }

  _layoutCamBtn() {
    const r = this.game.renderer;
    return {
      x: r.width - CAM_BTN.w - CAM_BTN.margin,
      y: r.height - CAM_BTN.h - CAM_BTN.margin - 8,
      w: CAM_BTN.w,
      h: CAM_BTN.h,
    };
  }

  _buildWorld() {
    this.world = new World3D();
    const scene = this.world.scene;

    // Player rig.
    this.playerRig = buildPerson({ shirt: 0xff5d8f, skin: 0xffd9b3, hair: 0x2b2b3e, scale: 1.15 });
    this.playerShadow = buildBlobShadow(22);
    this.dizzy = buildDizzyStars();
    this.playerRig.add(this.dizzy);
    this.dizzy.position.y = 76;
    scene.add(this.playerRig, this.playerShadow);

    // The crowd — same seeded wander as the 2D map so the fair feels the same.
    const rng = makeRng(1234);
    this.npcs = [];
    for (let i = 0; i < NPC_COUNT; i++) {
      const x = rng.range(120, WORLD.w - 120);
      const z = rng.range(160, WORLD.h - 120);
      const rig = buildPerson({
        shirt: rng.pick(SHIRTS), skin: rng.pick(SKINS), hair: rng.pick(HAIRS),
        scale: 0.95, simple: true,
      });
      const shadow = buildBlobShadow(16);
      scene.add(rig, shadow);
      this.npcs.push({
        x, z, tx: x, tz: z, rig, shadow,
        speed: rng.range(18, 38), pause: rng.range(0, 3),
        phase: rng.range(0, Math.PI * 2), _rng: rng,
      });
    }
  }

  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    const g = this.game;
    const input = g.input;

    // The on-screen button swings the camera 90° round you; Q/E do the same
    // on a keyboard. Jumping stays on Space/Enter for keyboard players.
    if (input.consumeButton && input.consumeButton('cam')) this.sim.orbitCamera(Math.PI / 2);
    const orbitKey = input.keys.has('e') ? 1 : input.keys.has('q') ? -1 : 0;
    if (orbitKey && !this._orbitKeyWasDown) this.sim.orbitCamera((orbitKey * Math.PI) / 2);
    this._orbitKeyWasDown = !!orbitKey;
    const keyJump = input.keys.has(' ') || input.keys.has('enter');
    const jump = keyJump && !this._jumpWasDown;
    this._jumpWasDown = keyJump;

    const ev = this.sim.step(dt, {
      mvx: input.move.x,
      mvy: input.move.y,
      jump,
    });
    this._handleEvents(ev);

    const p = this.sim.player;
    this.walkPhase += (p.speed / RUN_SPEED) * dt * 14;

    this._updateNpcs(dt);
    this.world.update(dt, this.t, this.sim.level, this.sim.rider);
    this._updateVisuals();
    this._updateCamera(dt);
    this._persist();
  }

  _handleEvents(ev) {
    const g = this.game;
    const p = this.sim.player;

    if (ev.jumped) Audio.whoosh();
    if (ev.landed) {
      Audio.thud();
      this._burstAt(p.x, p.z, '#e8d5a3', 8);
    }
    if (ev.mounted) Audio.spinUp();
    if (ev.flung) { Audio.whoosh(); g.addShake(6, 0.25); }
    if (ev.dizzy) {
      Audio.thud();
      g.addShake(8, 0.3);
      this._burstAt(p.x, p.z, '#caa24a', 18);
    }
    if (ev.foodEnter) {
      const f = ev.foodEnter;
      Audio.splat();
      g.addShake(5, 0.22);
      this._burstAt(f.x, f.y, f.color, 16);
      this._textAt(f.x, f.y, `${f.name}!`, '#fff', 110);
    }
    if (ev.boothLocked) {
      const b = ev.boothLocked;
      this._textAt(b.x, b.y, `🔒 Level ${b.minLevel} to unlock`, '#ffd14d', 150);
    }
    if (ev.boothEnter) {
      g.openBoothPrompt(ev.boothEnter);
    }
  }

  // Effects are drawn on the flat 2D overlay above the 3D canvas, so world
  // points have to be projected to screen space first.
  _project(x, z, y = 40) {
    const r3 = this.game.renderer3d;
    if (!r3 || !r3.ok) return null;
    const v = this._scratch || (this._scratch = new THREE.Vector3());
    v.set(x, y, z).project(r3.camera);
    if (v.z > 1) return null; // behind the camera
    return {
      x: (v.x * 0.5 + 0.5) * this.game.renderer.width,
      y: (-v.y * 0.5 + 0.5) * this.game.renderer.height,
    };
  }

  _burstAt(x, z, color, n) {
    const s = this._project(x, z, 30);
    if (s) this.fx.burst(s.x, s.y, color, n, 200);
  }

  _textAt(x, z, msg, color, height) {
    const s = this._project(x, z, height);
    if (s) this.fx.text(s.x, s.y, msg, color, 18);
  }

  _updateNpcs(dt) {
    for (const n of this.npcs) {
      if (n.pause > 0) {
        n.pause -= dt;
      } else {
        const dx = n.tx - n.x, dz = n.tz - n.z;
        const d = Math.hypot(dx, dz);
        if (d < 4) {
          n.tx = clamp(n.x + n._rng.range(-220, 220), 100, WORLD.w - 100);
          n.tz = clamp(n.z + n._rng.range(-220, 220), 140, WORLD.h - 100);
          n.pause = n._rng.range(0.5, 3);
        } else {
          n.x += (dx / d) * n.speed * dt;
          n.z += (dz / d) * n.speed * dt;
          n.rig.rotation.y = Math.atan2(-dx / d, -dz / d);
          n.phase += dt * 6;
        }
      }
      n.rig.position.set(n.x, 0, n.z);
      n.shadow.position.set(n.x, 0.6, n.z);
      animatePerson(n.rig, n.phase, 1);
    }
  }

  _updateVisuals() {
    const p = this.sim.player;
    const rd = this.sim.rider;
    const rig = this.playerRig;

    rig.position.set(p.x, p.y, p.z);
    rig.rotation.set(0, p.yaw, 0);
    if (rd.state === 'flung') rig.rotation.z = rd.rot;

    applySquash(rig, p.squash);
    animatePerson(rig, this.walkPhase, Math.min(1, p.speed / RUN_SPEED), !p.grounded);

    // Blob shadow stays on the ground and shrinks with height.
    const h = clamp(1 - p.y / 420, 0.35, 1);
    this.playerShadow.position.set(p.x, 0.6, p.z);
    this.playerShadow.scale.setScalar(h);
    this.playerShadow.material.opacity = 0.26 * h;

    this.dizzy.visible = rd.state === 'dizzy';
    if (this.dizzy.visible) animateDizzyStars(this.dizzy, this.t);
  }

  _updateCamera(dt) {
    const r3 = this.game.renderer3d;
    if (!r3 || !r3.ok) return;
    const cam = r3.camera;
    const p = this.sim.player;

    // Sim3D owns where the camera sits on the ground plane (the leash); this
    // just adds height, smoothing and the look-at.
    // When scenery forces the leash short, climb instead — looking down on the
    // character stays readable, where a shortened level camera just buries your
    // nose in a tent wall.
    const lead = Math.hypot(this.sim.camX - p.x, this.sim.camZ - p.z);
    const tight = clamp(1 - lead / CAM_DIST, 0, 1);
    const k = Math.min(1, CAM_SMOOTH * dt);
    const wantY = p.y + CAM_HEIGHT + tight * 150;
    cam.position.x += (this.sim.camX - cam.position.x) * k;
    cam.position.z += (this.sim.camZ - cam.position.z) * k;
    cam.position.y += (wantY - cam.position.y) * k;

    // Screen shake nudges the camera instead of the 2D canvas.
    const g = this.game;
    if (g.shakeT > 0) {
      const i = g.shakeMag * (g.shakeT / g.shakeDur);
      cam.position.x += (Math.random() * 2 - 1) * i;
      cam.position.y += (Math.random() * 2 - 1) * i;
    }
    const ax = p.x - this.sim.camX, az = p.z - this.sim.camZ;
    const al = Math.hypot(ax, az) || 1;
    cam.lookAt(p.x + (ax / al) * CAM_LOOK_AHEAD, p.y + CAM_LOOK_UP, p.z + (az / al) * CAM_LOOK_AHEAD);
    this.world.follow(cam, p.x, p.z);
  }

  _persist() {
    const p = this.sim.player;
    const sp = this.game.state.s.player;
    // Only write when it actually moved — save() is not free.
    if (Math.abs(sp.pos.x - p.x) > 1 || Math.abs(sp.pos.y - p.z) > 1) {
      sp.pos.x = p.x;
      sp.pos.y = p.z;
      sp.yaw = p.yaw;
      this.game.state.save();
    }
  }

  render(ctx) {
    const r3 = this.game.renderer3d;
    if (r3 && r3.ok) r3.render(this.world.scene);

    // Everything below draws on the transparent 2D canvas above the 3D one.
    // While a modal is up we keep rendering the world but drop the controls.
    if (this._paused) return;
    this.fx.render(ctx);
    this._drawJoystick(ctx);
    this._drawCamBtn(ctx);
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
    if (mag > 56) { dx = (dx / mag) * 56; dy = (dy / mag) * 56; }
    ctx.beginPath();
    ctx.arc(joy.baseX + dx, joy.baseY + dy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Round button with a little camera and a curved "swing round" arrow.
  _drawCamBtn(ctx) {
    const b = this._camBtn;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const held = this.game.input.isButtonDown && this.game.input.isButtonDown('cam');
    const r = b.w / 2 - (held ? 4 : 0);
    ctx.save();
    ctx.globalAlpha = held ? 0.95 : 0.8;
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.stroke();
    // Camera body + lens.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cx - 17, cy - 13, 34, 22, 5);
    ctx.fill();
    ctx.fillRect(cx - 7, cy - 17, 14, 5);
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 7, 0, Math.PI * 2);
    ctx.fill();
    // Swing-round arrow under it.
    ctx.strokeStyle = '#ffd14d';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 15, 22, 7, 0, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();
    const ax = cx - 21, ay = cy + 13;
    ctx.fillStyle = '#ffd14d';
    ctx.beginPath();
    ctx.moveTo(ax - 4, ay - 6);
    ctx.lineTo(ax + 6, ay - 3);
    ctx.lineTo(ax - 2, ay + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Transparent 2D layer so the WebGL world shows through underneath.
  get clearColor() { return null; }
  get uses3D() { return true; }
  get blocksRenderBelow() { return true; }
}
