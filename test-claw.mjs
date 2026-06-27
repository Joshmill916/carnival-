// Headless Node.js smoke-test for the side-view ClawMachine.js.
// Run from the repo root: node test-claw.mjs

const DROPS = 5; // must match ClawMachine's DROPS constant

// --- Browser stubs (must be set before any module is imported) ---
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.window = { AudioContext: null, webkitAudioContext: null };
globalThis.performance = { now: () => 0 };

// --- Imports ---
const { makeRng } = await import('./js/core/util.js');
const { Audio } = await import('./js/core/Audio.js');

// Silence audio so the stub AudioContext is never invoked.
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

// Mock 2-D context: tracks save/restore depth, swallows everything else.
function makeMockCtx() {
  let depth = 0;
  return new Proxy({}, {
    get(_, k) {
      if (k === 'save') return () => { depth++; };
      if (k === 'restore') return () => { depth--; };
      if (k === 'getSaveDepth') return () => depth;
      // createLinearGradient must return an object with addColorStop.
      if (k === 'createLinearGradient') return () => ({ addColorStop: () => {} });
      return (..._a) => {};
    },
    set() { return true; },
  });
}

// Minimal fake input.
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
const dropCenter = (g) => ({ x: g.dropBtn.x + g.dropBtn.w / 2, y: g.dropBtn.y + g.dropBtn.h / 2 });

// Drive the game to completion pressing DROP whenever the claw is idle.
function runToEnd(seed, preDrop = null) {
  const g = new ClawMachine(VIEW, makeRng(seed));
  g.init();
  const dc = dropCenter(g);
  let guard = 0;
  while (!g.isDone() && guard++ < 30000) {
    if (g.clawPhase === 'idle') {
      if (preDrop) preDrop(g);
      g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));
    } else {
      g.handleInput(fakeInput());
    }
    g.update(1 / 60);
  }
  return g;
}

// ─── 1. Steering ─────────────────────────────────────────────────────────────
console.log('\nSteering tests');
{
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startX = g.clawX;
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 280, y: 300 }));
  g.update(0.4);
  ok(g.clawX > startX, 'claw moves right when joystick dragged right');
}
{
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startX = g.clawX;
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 120, y: 300 }));
  g.update(0.4);
  ok(g.clawX < startX, 'claw moves left when joystick dragged left');
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
{
  // Drag only vertically — claw should not move horizontally.
  const g = new ClawMachine(VIEW, makeRng(99));
  g.init();
  const startX = g.clawX;
  g.handleInput(fakeInput({ dragActive: true, startX: 200, startY: 300, x: 200, y: 380 }));
  g.update(0.4);
  ok(g.clawX === startX, 'purely vertical drag does not move claw horizontally');
}

// ─── 2. Grab on an easy, aligned prize ───────────────────────────────────────
console.log('\nGrab tests');
{
  const g = new ClawMachine(VIEW, makeRng(42));
  g.init();

  // Find the easiest (diff=1) prize that is horizontally closest to centre.
  const cx = g.prizeArea.x + g.prizeArea.w / 2;
  const easy = g.prizes
    .filter(p => p.diff === 1.0)
    .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];

  // Place claw directly over this prize (guaranteed grab: closeness=1, prob=1).
  g.clawX = easy.x;

  const dc = dropCenter(g);
  g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));

  let guard = 0;
  while (g.clawPhase !== 'idle' && !g.isDone() && guard++ < 5000) {
    g.handleInput(fakeInput());
    g.update(1 / 60);
  }

  ok(g.score > 0, 'aligned drop on diff=1 prize banks points');
  ok(g.hits === 1, 'hits counter incremented after successful grab');
  ok(easy.grabbed, 'prize is marked grabbed after successful lift');
}

// ─── 3. Slip animation on a near-miss ────────────────────────────────────────
console.log('\nSlip animation tests');
{
  // Force a near-miss: position claw at the far edge of GRAB_R so probability is low.
  // Use a seeded rng where the first drop will fail.
  // We check that _slipPrize is set after grabbing phase.
  const g = new ClawMachine(VIEW, makeRng(7));
  g.init();
  // Place claw near the edge of the nearest diff=1 prize so prob is reduced.
  const edgePrize = g.prizes.filter(p => p.diff === 1.0)[0];
  g.clawX = edgePrize.x + 42; // within GRAB_R=48 but low closeness

  const dc = dropCenter(g);
  g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));

  // Run through drop → grabbing.
  let guard = 0;
  while (g.clawPhase !== 'lifting' && g.clawPhase !== 'idle' && !g.isDone() && guard++ < 5000) {
    g.handleInput(fakeInput());
    g.update(1 / 60);
  }

  // Either a grab succeeded or a slip animation started — both are valid outcomes.
  // hits is incremented only after lifting completes; check heldPrize for an in-progress grab.
  const hadSlip = g._slipPrize !== null;
  const hadGrab = g.heldPrize !== null;
  ok(hadSlip || hadGrab, 'edge-of-reach drop either grabs or triggers slip animation');
}

// ─── 4. Game ends after DROPS attempts ───────────────────────────────────────
console.log('\nCompletion tests');
{
  const g = runToEnd(7);
  ok(g.isDone(), 'game ends when attempts run out');
  ok(g.attempts === DROPS, `exactly ${DROPS} drop attempts logged`);
}

// ─── 5. getResult() shape and determinism ────────────────────────────────────
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

// ─── 6. render() safety (no throw; balanced save/restore) ────────────────────
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
  g.update(0.3);
  const ctx = makeMockCtx();
  let threw = false;
  try { g.render(ctx, 1); } catch (e) { threw = true; console.error('  render threw:', e); }
  ok(!threw, 'render() does not throw during dropping phase');
  ok(ctx.getSaveDepth() === 0, 'save/restore balanced (dropping)');
}
{
  // Lifting with a held prize.
  const g = new ClawMachine(VIEW, makeRng(42));
  g.init();
  const easy = g.prizes.find(p => p.diff === 1.0);
  g.clawX = easy.x;
  const dc = dropCenter(g);
  g.handleInput(fakeInput({ gesture: { type: 'tap', x: dc.x, y: dc.y } }));
  let guard = 0;
  while (g.clawPhase !== 'lifting' && guard++ < 5000) {
    g.handleInput(fakeInput()); g.update(1 / 60);
  }
  g.handleInput(fakeInput()); g.update(0.1);
  const ctx = makeMockCtx();
  let threw = false;
  try { g.render(ctx, 1); } catch (e) { threw = true; console.error('  render threw:', e); }
  ok(!threw, 'render() does not throw while lifting a prize');
  ok(ctx.getSaveDepth() === 0, 'save/restore balanced (lifting)');
}
{
  // Slip animation visible in render.
  const g = new ClawMachine(VIEW, makeRng(1));
  g.init();
  g._slipPrize = { emoji: '🧸', x: 200, startY: 400 };
  g._slipT = 0.1;
  const ctx = makeMockCtx();
  let threw = false;
  try { g.render(ctx, 1); } catch (e) { threw = true; console.error('  render threw:', e); }
  ok(!threw, 'render() does not throw with active slip animation');
  ok(ctx.getSaveDepth() === 0, 'save/restore balanced during slip animation');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n${total} checks: ${pass} ok, ${fail} failed`);
if (fail > 0) process.exit(1);
