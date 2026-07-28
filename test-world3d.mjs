// Headless test for the 3D overworld simulation. Sim3D.js deliberately imports
// no three.js/DOM/audio, so all of the movement, camera, collision, proximity
// and ride math is testable in plain Node. Run from the repo root:
//   node test-world3d.mjs
import {
  Sim3D, stickToWorld, headingToYaw, shortestAngle, buildObstacles,
  RUN_SPEED, MAX_JUMPS, TRIGGER_R, PLAYER_R, EDGE, CAM_DIST, CAM_MIN,
} from './js/world/Sim3D.js';
import { WORLD, BOOTHS, RIDES, COLLIDE_R } from './js/data/defs.js';

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const DT = 1 / 60;
const run = (sim, steps, input) => { let last; for (let i = 0; i < steps; i++) last = sim.step(DT, input); return last; };

// --- 1. Camera-relative stick mapping ---------------------------------------
{
  // camYaw 0 = camera sits at +Z looking toward -Z. Stick up must run away from it.
  let d = stickToWorld(0, -1, 0);
  ok(near(d.x, 0) && near(d.z, -1), 'stick up runs away from the camera (yaw 0)');
  d = stickToWorld(1, 0, 0);
  ok(near(d.x, 1) && near(d.z, 0), 'stick right runs screen-right (yaw 0)');

  // Rotate the camera a quarter turn: "up" must still mean away from it.
  d = stickToWorld(0, -1, Math.PI / 2);
  ok(near(d.x, -1) && Math.abs(d.z) < 1e-9, 'stick up still runs away after a 90° camera swing');

  // At any camera yaw, stick-up should point directly away from the camera.
  let allAway = true;
  for (const yaw of [0.3, 1.1, 2.7, -2.0, 5.5]) {
    const m = stickToWorld(0, -1, yaw);
    // Camera sits at (sin(yaw), cos(yaw)) * dist from the player.
    const camDir = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const dot = m.x * camDir.x + m.z * camDir.z; // should be -1 (opposite)
    if (!near(dot, -1, 1e-9)) allAway = false;
  }
  ok(allAway, 'stick up points directly away from the camera at every yaw');
}

// --- 2. Heading → mesh yaw (three.js models face -Z) ------------------------
{
  ok(near(headingToYaw(0, -1), 0), 'running toward -Z is yaw 0');
  ok(near(headingToYaw(1, 0), -Math.PI / 2), 'running toward +X is yaw -90°');
  ok(near(shortestAngle(0.1, 6.2), 6.2 - 0.1 - Math.PI * 2, 1e-9), 'angles take the short way around');
}

// --- 3. Running: accelerates, caps at RUN_SPEED -----------------------------
{
  // Obstacles cleared so this measures the movement math, not a tent in the way.
  const sim = new Sim3D({ x: 700, z: 600 });
  sim.obstacles = [];
  const z0 = sim.player.z;
  run(sim, 10, { mvx: 0, mvy: -1 });
  ok(sim.player.speed > 0 && sim.player.z < z0, 'the stick gets him running');
  run(sim, 180, { mvx: 0, mvy: -1 });
  ok(sim.player.speed <= RUN_SPEED + 1e-6, `speed caps at RUN_SPEED (${Math.round(sim.player.speed)})`);
  ok(sim.player.speed > RUN_SPEED - 1, 'and actually reaches it');
  // Releasing the stick brings him to a stop.
  run(sim, 60, { mvx: 0, mvy: 0 });
  ok(near(sim.player.speed, 0, 1e-6), 'releasing the stick stops him');
}

// --- 4. The trailing camera ---------------------------------------------------
{
  // Running away from the camera must NOT rotate the view — that stability is
  // the whole point of the leash. (A camera that locks to your heading instead
  // rotates what "right" means, which rotates the camera, and you run in circles.)
  const sim = new Sim3D({ x: 700, z: 900, yaw: 0 });
  sim.obstacles = [];
  const yaw0 = sim.camYaw;
  run(sim, 120, { mvx: 0, mvy: -1 });
  ok(Math.abs(shortestAngle(sim.camYaw, yaw0)) < 0.02, 'running straight ahead never spins the camera');
  ok(sim.player.z < 900, 'and he actually covered ground');
  // The leash is smoothed, so at a full sprint it trails a little past its
  // resting length before settling — that pull-back is part of the feel.
  const d = Math.hypot(sim.camX - sim.player.x, sim.camZ - sim.player.z);
  ok(d <= CAM_DIST * 1.3, `camera stays roughly on its leash at a sprint (${Math.round(d)})`);
  ok(Math.abs(shortestAngle(sim.player.yaw, headingToYaw(0, -1))) < 0.05, 'character faces the way he runs');
}
{
  // Start the camera off to the side; running away should drag it in behind.
  const sim = new Sim3D({ x: 700, z: 900, yaw: 0 });
  sim.obstacles = [];
  sim.camX = 700 + CAM_DIST; sim.camZ = 900; // camera parked at +X
  run(sim, 240, { mvx: 0, mvy: -1 });        // run toward -Z
  const behind = Math.atan2(sim.camX - sim.player.x, sim.camZ - sim.player.z);
  ok(Math.abs(shortestAngle(behind, 0)) < Math.PI / 2, 'a camera left off to the side gets dragged around behind you');
}

// --- 4b. The camera doesn't end up inside a tent -----------------------------
{
  const booth = BOOTHS[0];
  // Stand just past the booth and park the camera on its far side, so the
  // straight-line leash position would be right inside the stall.
  const sim = new Sim3D({ x: booth.x, z: booth.y - 130 });
  sim.camX = booth.x; sim.camZ = booth.y + 60;
  sim.step(DT, {});
  const toBooth = Math.hypot(sim.camX - booth.x, sim.camZ - booth.y);
  ok(toBooth > COLLIDE_R.booth, `camera is pulled out of the booth (${Math.round(toBooth)} from its centre)`);
  const toPlayer = Math.hypot(sim.camX - sim.player.x, sim.camZ - sim.player.z);
  ok(toPlayer >= CAM_MIN - 1, `and stays off the player's back (${Math.round(toPlayer)})`);

  // With nothing in the way it must NOT pull in — the leash length is the norm.
  const open = new Sim3D({ x: 700, z: 600 });
  open.obstacles = [];
  open.step(DT, {});
  const od = Math.hypot(open.camX - open.player.x, open.camZ - open.player.z);
  ok(od > CAM_DIST * 0.9, `in the open the camera keeps its full distance (${Math.round(od)})`);
}

// --- 5. Jump, double jump, landing ------------------------------------------
{
  const sim = new Sim3D({ x: 700, z: 600 });
  ok(sim.player.grounded, 'starts on the ground');
  let ev = sim.step(DT, { jump: true });
  ok(ev.jumped && !sim.player.grounded && sim.player.y > 0, 'jump leaves the ground');

  ev = sim.step(DT, { jump: true });
  ok(ev.doubleJumped && sim.player.jumps === MAX_JUMPS, 'a second press double-jumps');

  ev = sim.step(DT, { jump: true });
  ok(!ev.jumped, `no third jump (max ${MAX_JUMPS})`);

  // Fall back down.
  let landed = false, guard = 0;
  while (!landed && guard++ < 600) landed = sim.step(DT, {}).landed;
  ok(landed, 'gravity brings him back down and he lands');
  ok(sim.player.y === 0 && sim.player.grounded && sim.player.jumps === 0, 'landing resets ground state');

  // And he can jump again once grounded.
  ok(sim.step(DT, { jump: true }).jumped, 'can jump again after landing');
}

// --- 6. Collision — you cannot walk through a booth --------------------------
{
  const booth = BOOTHS[0];
  const sim = new Sim3D({ x: booth.x, z: booth.y + 260 });
  // Run straight at the booth for a good while.
  run(sim, 240, { mvx: 0, mvy: -1 });
  const d = Math.hypot(sim.player.x - booth.x, sim.player.z - booth.y);
  ok(d >= COLLIDE_R.booth + PLAYER_R - 0.5, `blocked by the booth (stopped ${Math.round(d)} out, wall at ${COLLIDE_R.booth + PLAYER_R})`);
  ok(sim.player.z > booth.y, 'did not tunnel through to the far side');
  // Crucially, the collision wall must still be inside the prompt radius.
  ok(COLLIDE_R.booth + PLAYER_R < TRIGGER_R, 'you can still get close enough to trigger the booth prompt');
}

// --- 7. World bounds ---------------------------------------------------------
{
  const sim = new Sim3D({ x: 100, z: 100 });
  run(sim, 600, { mvx: -1, mvy: -1 });
  ok(sim.player.x >= EDGE - 1e-9 && sim.player.z >= EDGE - 1e-9, 'held inside the near fence');
  const sim2 = new Sim3D({ x: WORLD.w - 100, z: WORLD.h - 100 });
  run(sim2, 900, { mvx: 1, mvy: 1 });
  ok(sim2.player.x <= WORLD.w - EDGE + 1e-9 && sim2.player.z <= WORLD.h - EDGE + 1e-9, 'held inside the far fence');
}

// Walk in one direction until a booth event lands (or the budget runs out), so
// tests can't accidentally stroll on past their target into the next booth.
function walkUntilBooth(sim, input, budget = 240) {
  let ev = null;
  for (let i = 0; i < budget; i++) {
    const e = sim.step(DT, input);
    if (e.boothEnter || e.boothLocked) { ev = e; break; }
  }
  return ev;
}

// --- 8. Booth proximity fires once, then re-arms -----------------------------
{
  // Approach Ring Toss (360,430) from the empty lane above it — no other booth
  // shares that lane, so any second trigger is a real bug and not a fly-by.
  const booth = BOOTHS[0];
  const sim = new Sim3D({ x: booth.x, z: 180, level: 99 });
  sim.obstacles = []; // isolate proximity from collision

  const ev = walkUntilBooth(sim, { mvx: 0, mvy: 1 });
  ok(ev && ev.boothEnter && ev.boothEnter.id === booth.id, 'walking up to a booth opens its prompt');

  // Standing there must not reopen it every frame.
  let repeats = 0;
  for (let i = 0; i < 300; i++) if (sim.step(DT, {}).boothEnter) repeats++;
  ok(repeats === 0, 'and it does not reopen while you stand next to it');

  // Walk away — the latch clears — then come back and it opens again.
  run(sim, 120, { mvx: 0, mvy: -1 });
  ok(sim.dismissedBoothId === null, 'latch clears once you walk away');
  const back = walkUntilBooth(sim, { mvx: 0, mvy: 1 });
  ok(back && back.boothEnter && back.boothEnter.id === booth.id, 'and it opens again when you come back');
}

// --- 9. Locked booths prompt differently -------------------------------------
{
  // Claw Machine (360,700) needs level 2; approach from the clear lane to its left.
  const locked = BOOTHS.find((b) => b.minLevel > 1);
  const sim = new Sim3D({ x: 150, z: locked.y, level: 1 });
  sim.obstacles = [];
  const ev = walkUntilBooth(sim, { mvx: 1, mvy: 0 });
  ok(ev && ev.boothLocked && ev.boothLocked.id === locked.id, 'an under-level booth shows the lock hint');
  ok(!ev.boothEnter, 'and never opens the play prompt');
  let opens = 0;
  for (let i = 0; i < 200; i++) if (sim.step(DT, {}).boothEnter) opens++;
  ok(opens === 0, 'still refuses to open while you stand there');
}

// --- 10. Ride: free → riding → flung → dizzy → free --------------------------
{
  const ride = RIDES[0];
  const sim = new Sim3D({ x: ride.x, z: ride.y + ride.r * 0.4 });
  const seen = [];
  let flung = false, dizzy = false, maxY = 0, guard = 0;
  while (guard++ < 2000) {
    const ev = sim.step(DT, {});
    if (!seen.includes(sim.rider.state)) seen.push(sim.rider.state);
    if (ev.flung) flung = true;
    if (ev.dizzy) dizzy = true;
    maxY = Math.max(maxY, sim.player.y);
    if (dizzy && sim.rider.state === 'free') break;
  }
  ok(seen.includes('riding'), 'walking into a ride boards it');
  ok(flung, 'the ride flings you');
  ok(maxY > 100, `and you fly on a real arc (peaked ${Math.round(maxY)} units up)`);
  ok(dizzy, 'you land dizzy');
  ok(sim.rider.state === 'free', 'and recover to walking again');
  ok(sim.player.y === 0, 'ending back on the ground');
}

// --- 11. Obstacles are built from the real fairground ------------------------
{
  const obs = buildObstacles();
  ok(obs.length > 0 && obs.every((o) => o.r > 0 && Number.isFinite(o.x) && Number.isFinite(o.z)),
    `built ${obs.length} collision cylinders from defs.js`);
  const rideBlocked = obs.some((o) => RIDES.some((r) => o.x === r.x && o.z === r.y));
  ok(!rideBlocked, 'rides are NOT solid, so you can walk in and board them');
}

// --- 12. Determinism ---------------------------------------------------------
{
  const play = () => {
    const sim = new Sim3D({ x: 700, z: 600 });
    for (let i = 0; i < 300; i++) {
      sim.step(DT, { mvx: Math.sin(i / 20), mvy: Math.cos(i / 17), jump: i % 47 === 0 });
    }
    return JSON.stringify(sim.player);
  };
  ok(play() === play(), 'same inputs => identical state (deterministic)');
}

// --- 13. The 3D scene graph actually builds ----------------------------------
// three.js Scene/Mesh/geometry all construct fine without a GL context, so the
// whole fairground can be built and animated here — no browser needed.
{
  const { World3D } = await import('./js/world/World3D.js');
  const { buildPerson, animatePerson, applySquash } = await import('./js/world/Actors3D.js');
  const { FOOD, TREES } = await import('./js/data/defs.js');

  let world = null, threw = null;
  try { world = new World3D(); } catch (e) { threw = e; }
  ok(!threw, `the fairground builds${threw ? ': ' + threw.message : ''}`);

  if (world) {
    let meshes = 0;
    world.scene.traverse((o) => { if (o.isMesh) meshes++; });
    ok(meshes > 200, `${meshes} meshes in the world`);
    ok(world.booths.size === BOOTHS.length, `all ${BOOTHS.length} booths built`);
    ok(world.rides.length === RIDES.length, `both rides built (${world.rides.map((r) => r.kind).join(', ')})`);
    ok(world.bulbs.length > 0 && world.clouds.length > 0, 'string lights and clouds built');

    // Animating must not throw, and the locked→unlocked material swap must work
    // in both directions.
    let animThrew = null;
    try {
      for (let i = 0; i < 10; i++) world.update(DT, i * DT, 1);
      for (let i = 0; i < 10; i++) world.update(DT, i * DT, 9);
      for (let i = 0; i < 10; i++) world.update(DT, i * DT, 1);
    } catch (e) { animThrew = e; }
    ok(!animThrew, `world animates cleanly${animThrew ? ': ' + animThrew.message : ''}`);

    const gated = BOOTHS.find((b) => b.minLevel > 1);
    ok(world.booths.get(gated.id).locked === true, 'an under-level booth greys out');
    world.update(DT, 0, 99);
    ok(world.booths.get(gated.id).locked === false, 'and colours back in once unlocked');
  }

  // Character rigs.
  let rigThrew = null;
  try {
    const rig = buildPerson({ shirt: 0xff5d8f, skin: 0xffd9b3, hair: 0x2b2b3e, scale: 1.15 });
    const npc = buildPerson({ shirt: 0x3ddc97, skin: 0xffd9b3, hair: 0x2b2b3e, simple: true });
    animatePerson(rig, 1.2, 1, false);
    animatePerson(rig, 1.2, 1, true);   // airborne pose
    animatePerson(npc, 0.5, 1);
    applySquash(rig, 1.3);
    applySquash(rig, 0.7);
    let rp = 0, np = 0;
    rig.traverse((o) => { if (o.isMesh) rp++; });
    npc.traverse((o) => { if (o.isMesh) np++; });
    ok(rp === 9 && np === 4, `player rig ${rp} meshes, crowd rig ${np} (crowd kept cheap)`);
  } catch (e) { rigThrew = e; }
  ok(!rigThrew, `character rigs build and animate${rigThrew ? ': ' + rigThrew.message : ''}`);

  ok(FOOD.length === 4 && TREES.length === 8, 'food stalls and trees still defined');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
