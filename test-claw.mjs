// Headless Node.js test for the real-life-style ClawMachine.js.
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
const DT = 1 / 60;
const mkInput = () => ({ drag: { active: false, startX: 0, startY: 0, x: 0, y: 0 }, keys: new Set(), consumeGesture: () => null });

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));

const mockCtx = () => ({
  _depth: 0, _neg: 0, shadowColor: '', shadowBlur: 0, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '',
  save() { this._depth++; }, restore() { this._depth--; if (this._depth < 0) this._neg++; },
  translate() {}, rotate() {}, scale() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {},
  quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
  setLineDash() {}, clip() {}, measureText() { return { width: 0 }; }, createLinearGradient() { return { addColorStop() {} }; },
});

// Run one try to completion (claw back home and idle again).
function finishTry(g) {
  let guard = 0;
  while (g.clawPhase !== 'idle' && guard++ < 4000) { g.handleInput(mkInput()); g.update(DT); }
  guard = 0;
  while (g.falling.length && guard++ < 400) { g.handleInput(mkInput()); g.update(DT); }
}

// Park the claw over (x, d) and press GRAB.
function grabAt(g, x, d) {
  g.clawX = Math.max(g.minX, Math.min(g.maxX, x));
  g.clawD = Math.max(g.minD, Math.min(g.maxD, d));
  const input = mkInput(); input.keys = new Set([' ']);
  g.handleInput(input); g.update(DT);
  finishTry(g);
}

// 1) Steering: X and depth move; the claw stays up top until you drop it.
{
  const g = new ClawMachine(VIEW, makeRng(1)); g.init();
  const x0 = g.clawX, d0 = g.clawD, h0 = g.clawH;
  const input = mkInput();
  input.drag = { active: true, startX: 200, startY: 400, x: 260, y: 340 }; // up-right
  for (let i = 0; i < 40; i++) { g.handleInput(input); g.update(DT); }
  ok(g.clawX > x0 + 10, 'joystick right moves the claw right');
  ok(g.clawD > d0 + 0.1, 'joystick up moves the claw toward the back');
  ok(g.clawH === h0 && g.clawPhase === 'idle', 'steering never lowers the claw — it stays up top');
  ok(g.clawX <= g.maxX && g.clawD <= g.maxD, 'claw stays inside the cabinet');
}

// 2) GRAB drops it on its own: it descends, closes, lifts, returns home.
{
  const g = new ClawMachine(VIEW, makeRng(2)); g.init();
  const p = g.prizes.find((q) => q.d > 0.4);
  g.clawX = p.x; g.clawD = p.d;
  const input = mkInput(); input.keys = new Set([' ']);
  g.handleInput(input); g.update(DT);
  const seen = new Set();
  let minH = g.clawH, guard = 0;
  while (g.clawPhase !== 'idle' && guard++ < 4000) {
    seen.add(g.clawPhase);
    minH = Math.min(minH, g.clawH);
    g.handleInput(mkInput()); g.update(DT);
  }
  ok(['dropping', 'closing', 'lifting', 'returning', 'releasing'].every((s) => seen.has(s)),
    'a grab runs drop → close → lift → return → release by itself');
  ok(minH < g.topH - 100 && minH > 0, `the claw stops on top of the pile (lowest hub height ${Math.round(minH)})`);
  ok(Math.abs(g.clawX - g.home.x) < 1 && Math.abs(g.clawD - g.home.d) < 0.01, 'and goes back home over the chute');
  ok(g.attempts === 1 && g.attemptsLeft === DROPS - 1, 'one try used');
}

// 3) The timer: leave it alone and it drops by itself.
{
  const g = new ClawMachine(VIEW, makeRng(3)); g.init();
  let guard = 0;
  while (g.clawPhase === 'idle' && guard++ < 60 * 20) { g.handleInput(mkInput()); g.update(DT); }
  ok(g.clawPhase === 'dropping' && guard > 60 * 14, `the 15 s timer drops the claw for you (after ${(guard / 60).toFixed(1)} s)`);
}

// 4) A well-centred grab on an easy prize can win (and the prize ends up
//    in the chute, not just vanishing at the top).
{
  let won = false, wentToChute = false;
  for (let s = 1; s <= 40 && !won; s++) {
    const g = new ClawMachine(VIEW, makeRng(s)); g.init();
    // Easiest: a grippy prize on the top of the heap.
    const top = g.prizes.filter((q) => q.pts === 2).sort((a, b) => (b.h + b.size) - (a.h + a.size))[0];
    if (!top) continue;
    const before = g.score;
    g.clawX = top.x; g.clawD = top.d;
    const input = mkInput(); input.keys = new Set([' ']);
    g.handleInput(input); g.update(DT);
    let guard = 0;
    while ((g.clawPhase !== 'idle' || g.falling.length) && guard++ < 4000) {
      if (g.falling.some((q) => g._inChute(q.x, q.d))) wentToChute = true;
      g.handleInput(mkInput()); g.update(DT);
    }
    if (g.score > before) won = true;
  }
  ok(won, 'a well-centred grab on an easy prize can win');
  ok(wentToChute, 'a won prize is carried back and dropped down the chute');
}

// 5) Dropping over the empty chute corner catches nothing but costs a try.
{
  const g = new ClawMachine(VIEW, makeRng(4)); g.init();
  grabAt(g, g.home.x, g.home.d);
  ok(g.score === 0 && g.attemptsLeft === DROPS - 1, 'an empty grab scores nothing and still costs a try');
}

// 6) It's a challenge: random grabs don't always win, but some do; and grips
//    really do slip.
function playRandom(seed) {
  const g = new ClawMachine(VIEW, makeRng(seed)); g.init();
  let guard = 0;
  while (!g.isDone() && guard++ < 40) {
    const p = g.prizes[(seed * 7 + g.attempts * 5) % g.prizes.length];
    grabAt(g, p.x + ((seed + g.attempts) % 3 - 1) * 10, p.d);
  }
  return g.getResult();
}
{
  let wins = 0, tries = 0;
  for (let s = 1; s <= 12; s++) { const r = playRandom(s); wins += r.hits; tries += r.attempts; }
  ok(tries === 12 * DROPS, `all games use ${DROPS} tries each`);
  ok(wins < tries, `it is a challenge — ${wins} wins out of ${tries} tries`);
  ok(wins > 0, 'but good grabs still win sometimes');
}

// 7) Determinism + result shape.
{
  const a = playRandom(3), b = playRandom(3);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed + input => identical result');
  ok(['gameKey', 'score', 'hits', 'attempts', 'won', 'bigWin', 'coinBonus'].every((k) => k in a), 'result has the full shape');
  ok(a.gameKey === 'claw', "gameKey is 'claw'");
}

// 8) render() never throws + balanced save/restore + no leaked glow, through
//    every phase of a try.
{
  const g = new ClawMachine(VIEW, makeRng(2)); g.init();
  let threw = false, unbalanced = false, glow = false;
  try {
    for (let i = 0; i < 600; i++) {
      const ctx = mockCtx();
      g.render(ctx);
      if (ctx._depth !== 0 || ctx._neg > 0) unbalanced = true;
      if (ctx.shadowBlur !== 0) glow = true;
      g.handleInput(mkInput()); g.update(DT);
      if (i === 5) g._startGrab();
    }
  } catch (e) { threw = true; console.log('   render threw: ' + e.message); }
  ok(!threw, 'render() never throws on a mock ctx');
  ok(!unbalanced, 'render save/restore balanced');
  ok(!glow, 'render leaves no leaked glow');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
