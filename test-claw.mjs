// Headless Node.js smoke-test for the new ClawMachine.js.
// Run from the repo root: node test-claw.mjs

const DROPS = 5; // must match ClawMachine's DROPS constant

// --- Browser stubs (must be set before any module is imported) ---
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
// Audio.js references window.AudioContext inside method bodies (not at load time),
// but we replace the audio methods below, so window is only needed as a namespace.
globalThis.window = { AudioContext: null, webkitAudioContext: null };
globalThis.performance = { now: () => 0 };

// --- Imports ---
const { makeRng } = await import('./js/core/util.js');
const { Audio } = await import('./js/core/Audio.js');

// Silence audio so stub AudioContext is never invoked.
const noop = () => {};
Audio.throw_ = noop;
Audio.hit = noop;
Audio.fail = noop;
Audio.win = noop;

const { ClawMachine } = await import('./js/games/ClawMachine.js');

// --- Test harness ---
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.error(`  FAIL ${msg}`); }
};

// Mock 2-D context that tracks save/restore balance and swallows everything else.
function makeMockCtx() {
  let depth = 0;
  return new Proxy({}, {
    get(_, k) {
      if (k === 'save') return () => { depth++; };
      if (k === 'restore') return () => { depth--; };
      if (k === 'getSaveDepth') return () => depth;
      return (..._a) => {};
    },
    set() { return true; },
  });
}

// Build a minimal fake input object.
function fakeInput({ dragActive = false, startX = 0, startY = 0, x = 0, y = 0,
                     gesture = null, keys = [] } = {}) {
  let consumed = false;
  return {
    drag: { active: dragActive, startX, startY, x, y, dx: x - startX, dy: y - startY },
    keys: new Set(keys),
    consumeGesture() {
      if (consumed || !gesture) return null;
      consumed = true;
      return gesture;
    },
  };
}

const VIEW = { w: 400, h: 700 };

// Compute the center of the DROP button for a given game instance.
const dropCenter = (g) => ({ x: g.dropBtn.x + g.dropBtn.w / 2, y: g.dropBtn.y + g.dropBtn.h / 2 });

// Drive the game to completion by pressing DROP every time the claw is idle.
// Optionally call preDrop(g) before each drop for setup.
function runToEnd(seed, preDrop = null) {
  const g = new ClawMachine(VIEW, makeRng(seed));
  g.init();
  const dc = dropCenter(g);
  let guard = 0;
  while (!g.isDone() && guard++ < 30000) {
    if (g.clawPhase === 'idle') {
      if (preDrop) preDrop(g);
      let used = false;
      g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));
      void used;
    } else {
      g.handleInput(fakeInput());
    }
    g.update(1 / 60);
  }
  return g;
}

// ─── 1. Steering ────────────────────────────────────────────────────────────
console.log('\nSteering tests');
{
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startX = g.clawX;
  // Drag 80 px to the right.
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 280, y: 300 }));
  g.update(0.4);
  ok(g.clawX > startX, 'claw moves right when joystick dragged right');
}
{
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startX = g.clawX;
  // Drag 80 px to the left.
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 120, y: 300 }));
  g.update(0.4);
  ok(g.clawX < startX, 'claw moves left when joystick dragged left');
}
{
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startZ = g.clawZ;
  // Drag 80 px down (increases Z = depth toward viewer).
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 200, y: 380 }));
  g.update(0.4);
  ok(g.clawZ > startZ, 'claw moves forward when joystick dragged down');
}
{
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startX = g.clawX;
  // Deadzone: drag of only 6 px → no movement.
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 206, y: 300 }));
  g.update(0.4);
  ok(g.clawX === startX, 'drag within deadzone produces no movement');
}

// ─── 2. Grab on an easy, centred prize ───────────────────────────────────────
console.log('\nGrab tests');
{
  const g = new ClawMachine(VIEW, makeRng(42));
  g.init();

  // Find the easiest (diff=1) prize closest to the bin centre.
  const cx = g.bin.x + g.bin.w / 2;
  const cz = g.bin.y + g.bin.h / 2;
  const easy = g.prizes
    .filter(p => p.diff === 1.0)
    .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];

  // Place claw exactly on this prize (guaranteed grab: closeness=1, prob=1).
  g.clawX = easy.x;
  g.clawZ = easy.z;

  // Fire one drop.
  const dc = dropCenter(g);
  g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));

  // Run through dropping → grabbing → lifting.
  let guard = 0;
  while (g.clawPhase !== 'idle' && !g.isDone() && guard++ < 5000) {
    g.handleInput(fakeInput());
    g.update(1 / 60);
  }

  ok(g.score > 0, 'centered drop on diff=1 prize banks points');
  ok(g.hits === 1, 'hits counter incremented after successful grab');
  ok(easy.grabbed, 'prize is marked grabbed after successful lift');
}

// ─── 3. Game ends after DROPS attempts ───────────────────────────────────────
console.log('\nCompletion tests');
{
  const g = runToEnd(7);
  ok(g.isDone(), 'game ends when attempts run out');
  ok(g.attempts === DROPS, `exactly ${DROPS} drop attempts logged`);
}

// ─── 4. getResult() shape and determinism ────────────────────────────────────
console.log('\ngetResult() tests');
{
  const r1 = runToEnd(42).getResult();
  const r2 = runToEnd(42).getResult();
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'same seed → identical result (deterministic)');
  ok(r1.gameKey === 'claw', 'gameKey is "claw"');
  ok(typeof r1.score === 'number', 'score is a number');
  ok(typeof r1.hits === 'number', 'hits is a number');
  ok(typeof r1.attempts === 'number', 'attempts is a number');
  ok(typeof r1.won === 'boolean', 'won is boolean');
  ok(typeof r1.bigWin === 'boolean', 'bigWin is boolean');
  ok(r1.coinBonus === (r1.bigWin ? 15 : 0), 'coinBonus matches bigWin');
}

// ─── 5. render() safety (no throw; balanced save/restore) ────────────────────
console.log('\nrender() tests');
{
  // Idle phase.
  const g = new ClawMachine(VIEW, makeRng(1));
  g.init();
  const ctx = makeMockCtx();
  let threw = false;
  try { g.render(ctx, 1); } catch (e) { threw = true; console.error('  render threw:', e); }
  ok(!threw, 'render() does not throw in idle phase');
  ok(ctx.getSaveDepth() === 0, 'save/restore balanced after render (idle)');
}
{
  // Dropping phase.
  const g = new ClawMachine(VIEW, makeRng(1));
  g.init();
  g._startDrop();
  g.update(0.3); // partway through drop
  const ctx = makeMockCtx();
  let threw = false;
  try { g.render(ctx, 1); } catch (e) { threw = true; console.error('  render threw:', e); }
  ok(!threw, 'render() does not throw during dropping phase');
  ok(ctx.getSaveDepth() === 0, 'save/restore balanced after render (dropping)');
}
{
  // After a grab (lifting with held prize).
  const g = new ClawMachine(VIEW, makeRng(42));
  g.init();
  const easy = g.prizes.find(p => p.diff === 1.0);
  g.clawX = easy.x;
  g.clawZ = easy.z;
  const dc = dropCenter(g);
  g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));
  // Advance until mid-lifting (prize should be held).
  let guard = 0;
  while (g.clawPhase !== 'lifting' && guard++ < 5000) {
    g.handleInput(fakeInput()); g.update(1 / 60);
  }
  // One more update to be mid-lift.
  g.handleInput(fakeInput()); g.update(0.1);
  const ctx = makeMockCtx();
  let threw = false;
  try { g.render(ctx, 1); } catch (e) { threw = true; console.error('  render threw:', e); }
  ok(!threw, 'render() does not throw while lifting a prize');
  ok(ctx.getSaveDepth() === 0, 'save/restore balanced after render (lifting)');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n${total} checks: ${pass} ok, ${fail} failed`);
if (fail > 0) process.exit(1);
