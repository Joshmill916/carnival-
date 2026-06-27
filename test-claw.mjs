// Headless Node.js smoke-test for the side-view (pseudo-3D) ClawMachine.js.
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

const { makeRng } = await import('./js/core/util.js');
const { ClawMachine } = await import('./js/games/ClawMachine.js');

const VIEW = { w: 420, h: 760 };
const mkInput = () => ({ drag: { active: false, startX: 0, startY: 0, x: 0, y: 0 }, keys: new Set(), consumeGesture: () => null });

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));

const mockCtx = () => {
  const c = {
    _depth: 0, _neg: 0, shadowColor: '', shadowBlur: 0, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '',
    save() { this._depth++; }, restore() { this._depth--; if (this._depth < 0) this._neg++; },
    translate() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
    setLineDash() {}, clip() {}, measureText() { return { width: 0 }; }, createLinearGradient() { return { addColorStop() {} }; },
  };
  return c;
};

// 1) Steering: holding "right" moves the claw right and clamps in the cabinet.
{
  const g = new ClawMachine(VIEW, makeRng(1)); g.init();
  const x0 = g.clawX;
  const input = mkInput(); input.keys = new Set(['arrowright']);
  for (let i = 0; i < 60; i++) { g.handleInput(input); g.update(1 / 60); }
  ok(g.clawX > x0 + 10, 'arrow-right steers the claw right');
  ok(g.clawX <= g._clawMaxX + 0.001, 'claw clamps at the right wall');
}

// 2) Drops + grabs + termination — line the claw up with the nearest prize.
function runAimNearest(seed) {
  const g = new ClawMachine(VIEW, makeRng(seed)); g.init();
  const startCount = g.prizes.length;
  const input = mkInput(); let frames = 0;
  while (!g.isDone() && frames++ < 20000) {
    if (g.clawPhase === 'idle') {
      let best = null, bd = Infinity;
      for (const p of g.prizes) { if (p.grabbed) continue; const d = Math.abs(p.sx - g.clawX); if (d < bd) { bd = d; best = p; } }
      if (best) g.clawX = best.sx;
      input.keys = new Set([' ']); g.handleInput(input); g.update(1 / 60); input.keys = new Set();
    } else { g.handleInput(input); g.update(1 / 60); }
  }
  const grabbed = g.prizes.filter((p) => p.grabbed).length;
  return { g, result: g.getResult(), grabbed, startCount };
}
let anyHits = 0;
for (let s = 1; s <= 8; s++) {
  const r = runAimNearest(s);
  if (r.result.hits > 0) anyHits++;
  ok(r.g.isDone() && r.result.attempts <= DROPS, `seed ${s}: ends within ${DROPS} drops`);
  ok(r.result.hits === r.grabbed && r.result.hits <= r.result.attempts, `seed ${s}: hits == grabbed prizes (<= drops)`);
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

// 4) render() never throws + balanced save/restore + no leaked glow.
{
  const g = new ClawMachine(VIEW, makeRng(2)); g.init();
  let threw = false, unbalanced = false, glow = false;
  try {
    for (let i = 0; i < 140; i++) {
      const ctx = mockCtx();
      g.render(ctx);
      if (ctx._depth !== 0 || ctx._neg > 0) unbalanced = true;
      if (ctx.shadowBlur !== 0) glow = true;
      g.handleInput(mkInput()); g.update(1 / 60);
      if (i === 5) g._startDrop();
    }
  } catch (e) { threw = true; console.log('   render threw: ' + e.message); }
  ok(!threw, 'render() never throws on a mock ctx');
  ok(!unbalanced, 'render save/restore balanced');
  ok(!glow, 'render leaves no leaked glow');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
