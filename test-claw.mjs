// Headless Node.js smoke-test for the front-view, 2D-joystick, challenge
// ClawMachine.js. Run from the repo root: node test-claw.mjs

const DROPS = 5; // must match ClawMachine's DROPS constant

// --- Browser stubs (must be set before any module is imported) ---
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.performance = { now: () => 0 };
const mn = { connect() { return this; }, start() {}, stop() {},
  frequency: { value: 0, setValueAtTime() {} },
  gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
globalThis.window = { AudioContext: class {
  constructor() { this.currentTime = 0; this.destination = {};
    this.createOscillator = () => ({ ...mn }); this.createGain = () => ({ ...mn }); }
} };
globalThis.AudioContext = globalThis.window.AudioContext;

const { makeRng } = await import('./js/core/util.js');
const { ClawMachine } = await import('./js/games/ClawMachine.js');

const VIEW = { w: 420, h: 760 };
const mkInput = () => ({ drag: { active: false, startX: 0, startY: 0, x: 0, y: 0 }, keys: new Set(), consumeGesture: () => null });

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));

const mockCtx = () => ({
  _depth: 0, _neg: 0, shadowColor: '', shadowBlur: 0, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '',
  save() { this._depth++; }, restore() { this._depth--; if (this._depth < 0) this._neg++; },
  translate() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {},
  quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
  setLineDash() {}, clip() {}, measureText() { return { width: 0 }; }, createLinearGradient() { return { addColorStop() {} }; },
});

// 1) 2-AXIS STEERING — joystick moves the claw in both X and Y.
{
  const g = new ClawMachine(VIEW, makeRng(1)); g.init();
  const x0 = g.clawX, y0 = g.clawY;
  const input = mkInput();
  // down-right: start (100,300) -> (160,360)
  input.drag = { active: true, startX: 100, startY: 300, x: 160, y: 360 };
  for (let i = 0; i < 40; i++) { g.handleInput(input); g.update(1 / 60); }
  ok(g.clawX > x0 + 10, 'joystick moves claw right (X axis)');
  ok(g.clawY > y0 + 10, 'joystick moves claw down (Y axis)');
  ok(g.clawX <= g._clawMaxX + 0.01 && g.clawY <= g._clawMaxY + 0.01, 'claw stays inside the case');
}

// Helper: park the claw on a target point, then grab (one attempt).
function grabAt(g, tx, ty) {
  // teleport-park (gameplay drives there with the joystick; tests place directly)
  g.clawX = Math.max(g._clawMinX, Math.min(g._clawMaxX, tx));
  g.clawY = Math.max(g._clawMinY, Math.min(g._clawMaxY, ty));
  const input = mkInput(); input.keys = new Set([' ']);
  g.handleInput(input); g.update(1 / 60);          // press grab
  const empty = mkInput();
  let guard = 0;
  while (g.clawPhase !== 'idle' && !g.isDone() && guard++ < 4000) { g.handleInput(empty); g.update(1 / 60); }
}

// 2) A centred grab on an easy prize CAN win (search seeds for a 2pt prize).
{
  let won = false;
  for (let s = 1; s <= 40 && !won; s++) {
    const g = new ClawMachine(VIEW, makeRng(s)); g.init();
    const easy = g.prizes.find((p) => p.pts === 2);
    if (!easy) continue;
    const before = g.score;
    grabAt(g, easy.x, easy.y - 10);
    if (g.score > before) won = true;
  }
  ok(won, 'a well-centred grab on an easy prize can win');
}

// 3) Grabbing an empty corner misses but still costs a try.
{
  const g = new ClawMachine(VIEW, makeRng(2)); g.init();
  const before = g.score, triesBefore = g.attemptsLeft;
  grabAt(g, g._clawMinX, g._clawMinY); // top-left, away from the bottom pile
  ok(g.score === before, 'empty grab scores nothing');
  ok(g.attemptsLeft === triesBefore - 1, 'empty grab still costs a try');
}

// 4) NOT a winner every time — drive random parks; wins must be < attempts overall.
function playRandom(seed) {
  const g = new ClawMachine(VIEW, makeRng(seed)); g.init();
  let guard = 0;
  while (!g.isDone() && guard++ < 60) {
    // park somewhere in the lower pile region, varied by attempt + seed
    const fx = ((seed * 7 + g.attempts * 13) % 100) / 100;
    const tx = g._clawMinX + fx * (g._clawMaxX - g._clawMinX);
    const ty = g._clawMaxY - ((g.attempts * 11) % 30);
    grabAt(g, tx, ty);
  }
  return g.getResult();
}
{
  let totalWins = 0, totalAttempts = 0;
  for (let s = 1; s <= 12; s++) {
    const r = playRandom(s);
    totalWins += r.hits;
    totalAttempts += r.attempts;
  }
  ok(totalAttempts === 12 * DROPS, `all games use ${DROPS} grabs each`);
  ok(totalWins < totalAttempts, `it is a challenge — ${totalWins} wins out of ${totalAttempts} grabs (not always-win)`);
  ok(totalWins > 0, 'but skillful grabs still win sometimes');
}

// 5) Determinism + result shape.
{
  const a = playRandom(3), b = playRandom(3);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed + input => identical result');
  const keys = ['gameKey', 'score', 'hits', 'attempts', 'won', 'bigWin', 'coinBonus'];
  ok(keys.every((k) => k in a), 'result has the full shape');
  ok(a.gameKey === 'claw', "gameKey is 'claw'");
}

// 6) render() never throws + balanced save/restore + no leaked glow.
{
  const g = new ClawMachine(VIEW, makeRng(2)); g.init();
  let threw = false, unbalanced = false, glow = false;
  try {
    for (let i = 0; i < 160; i++) {
      const ctx = mockCtx();
      g.render(ctx);
      if (ctx._depth !== 0 || ctx._neg > 0) unbalanced = true;
      if (ctx.shadowBlur !== 0) glow = true;
      g.handleInput(mkInput()); g.update(1 / 60);
      if (i === 5) { g.clawY = g._clawMaxY - 4; g._startGrab(); }
    }
  } catch (e) { threw = true; console.log('   render threw: ' + e.message); }
  ok(!threw, 'render() never throws on a mock ctx');
  ok(!unbalanced, 'render save/restore balanced');
  ok(!glow, 'render leaves no leaked glow');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
