// Headless Node.js smoke-test for the top-down joystick ClawMachine.js.
// Run from the repo root: node test-claw.mjs

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

// --- Imports ---
const { makeRng } = await import('./js/core/util.js');
const { ClawMachine } = await import('./js/games/ClawMachine.js');

const VIEW = { w: 420, h: 760 };
const mkInput = () => ({ drag: { active: false, startX: 0, startY: 0, x: 0, y: 0 }, keys: new Set(), consumeGesture: () => null });

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));

// Mock 2d context (so we can assert render() never throws).
const mockCtx = () => ({
  shadowColor: '', shadowBlur: 0, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
  save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
  ellipse() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
  setLineDash() {}, measureText() { return { width: 0 }; }, createLinearGradient() { return { addColorStop() {} }; },
});

// 1) Steering: a full-right joystick drag moves the claw right and clamps in the bin.
{
  const g = new ClawMachine(VIEW, makeRng(1)); g.init();
  const x0 = g.claw.x;
  const input = mkInput(); input.drag = { active: true, startX: 100, startY: 600, x: 160, y: 600 };
  for (let i = 0; i < 40; i++) { g.handleInput(input); g.update(1 / 60); }
  ok(g.claw.x > x0 + 10, 'joystick steers the claw right');
  ok(g.claw.x <= g.bin.x + g.bin.w, 'claw stays clamped inside the bin');
}

// 2) Drops, grabs, termination — aim at the nearest prize each drop.
function runAimNearest(seed) {
  const g = new ClawMachine(VIEW, makeRng(seed)); g.init();
  const startCount = g.prizes.length;
  const input = mkInput(); let frames = 0;
  while (!g.isDone() && frames++ < 20000) {
    if (g.state === 'idle' && g.prizes.length) {
      let best = g.prizes[0], bd = Infinity;
      for (const p of g.prizes) { const d = Math.hypot(p.x - g.claw.x, p.z - g.claw.z); if (d < bd) { bd = d; best = p; } }
      g.claw.x = best.x; g.claw.z = best.z;
      input.keys = new Set([' ']); g.handleInput(input); g.update(1 / 60); input.keys = new Set();
    } else { g.handleInput(input); g.update(1 / 60); }
  }
  return { g, result: g.getResult(), removed: startCount - g.prizes.length };
}
let anyHits = 0;
for (let s = 1; s <= 8; s++) {
  const r = runAimNearest(s);
  if (r.result.hits > 0) anyHits++;
  ok(r.g.isDone() && r.result.attempts <= DROPS, `seed ${s}: ends within ${DROPS} drops`);
  ok(r.result.hits === r.removed, `seed ${s}: hits == prizes removed`);
}
ok(anyHits > 0, 'aligned drops produce grabs');

// 3) Determinism + result shape.
{
  const a = runAimNearest(3).result, b = runAimNearest(3).result;
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed + input => identical result');
  const keys = ['gameKey', 'score', 'hits', 'attempts', 'won', 'bigWin', 'coinBonus'];
  ok(keys.every((k) => k in a), 'result has the full shape');
  ok(a.gameKey === 'claw', "gameKey is 'claw'");
  ok((a.score >= 24) === a.bigWin && (a.score >= 24 ? 15 : 0) === a.coinBonus, 'bigWin/coinBonus thresholds');
}

// 4) render() never throws across states.
{
  const g = new ClawMachine(VIEW, makeRng(2)); g.init();
  let threw = false;
  try {
    g.render(mockCtx());
    g._startDrop();
    for (let i = 0; i < 120; i++) { g.handleInput(mkInput()); g.update(1 / 60); g.render(mockCtx()); }
  } catch (e) { threw = true; console.log('   render threw: ' + e.message); }
  ok(!threw, 'render() never throws on a mock ctx');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
