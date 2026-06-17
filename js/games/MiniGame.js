// Base class / interface contract for booth mini-games. Games are PURE: given the
// injected RNG and player input they produce a deterministic result and never
// touch currency. The MiniGameScene host owns energy + payout.
//
// Lifecycle the host drives:
//   new Game(view, rng, opts) → init() → (update/render/handleInput each frame)
//   → isDone() → getResult() → destroy()
//
// `view` is the logical viewport { w, h } in CSS pixels (games render in screen
// space; there is no world camera inside a mini-game).
import { Particles } from '../ui/Particles.js';

export class MiniGame {
  static label = 'Mini Game';
  static cost = 1;

  constructor(view, rng, opts = {}) {
    this.view = view;
    this.rng = rng;
    this.opts = opts;
    this.particles = new Particles();
    this.score = 0;
    this.hits = 0;
    this.attempts = 0;
    this.attemptsLeft = 1;
    this.phase = 'aim'; // 'aim' | 'fly' | 'settle' | 'done'
    this.done = false;
    this.hint = '';
  }

  init() {}
  update(dt) {
    this.particles.update(dt);
  }
  render(_ctx, _alpha) {}
  handleInput(_input) {}

  isDone() {
    return this.done;
  }

  // Pure result. Subclasses set score/hits/won/bigWin/coinBonus.
  getResult() {
    return {
      gameKey: this.constructor.key,
      score: this.score,
      hits: this.hits,
      attempts: this.attempts,
      won: this.score > 0,
      bigWin: false,
      coinBonus: 0,
    };
  }

  destroy() {}

  // Shared helper: draw the little attempts/score banner all games share.
  _drawHud(ctx) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score ${this.score}`, 16, 56);
    ctx.textAlign = 'right';
    ctx.fillText(`Tries ${this.attemptsLeft}`, this.view.w - 16, 56);
    if (this.hint) {
      ctx.textAlign = 'center';
      ctx.font = '14px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(this.hint, this.view.w / 2, this.view.h - 28);
    }
    ctx.restore();
  }
}
