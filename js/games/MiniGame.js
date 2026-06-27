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
import { setGlow, clearGlow } from '../core/util.js';

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
    this.t = 0; // seconds elapsed (drives backdrops/animation)
    this.phase = 'aim'; // 'aim' | 'fly' | 'settle' | 'done'
    this.done = false;
    this.hint = '';
  }

  init() {}
  update(dt) {
    this.t += dt;
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

  // Shared helper: draw the neon score/tries banner all games share.
  _drawHud(ctx) {
    const W = this.view.w;
    const top = 48, h = 38, pad = 12;
    ctx.save();

    // Neon panel.
    const x = pad, w = W - pad * 2;
    ctx.fillStyle = 'rgba(19,17,42,0.72)';
    _roundRectPath(ctx, x, top, w, h, 12);
    ctx.fill();
    setGlow(ctx, '#00e5ff', 12);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    _roundRectPath(ctx, x, top, w, h, 12);
    ctx.stroke();
    clearGlow(ctx);

    ctx.textBaseline = 'middle';
    ctx.font = '700 17px "Outfit", system-ui, sans-serif';
    // Score (left, neon-yellow).
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe600';
    ctx.fillText(`SCORE ${this.score}`, x + 14, top + h / 2 + 1);
    // Tries (right, neon-pink).
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff2d78';
    ctx.fillText(`TRIES ${this.attemptsLeft}`, x + w - 14, top + h / 2 + 1);

    if (this.hint) {
      ctx.textAlign = 'center';
      ctx.font = '600 14px "Outfit", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(240,238,255,0.9)';
      ctx.fillText(this.hint, W / 2, this.view.h - 28);
    }
    ctx.restore();
  }
}

// Local rounded-rect path (avoids depending on ctx.roundRect support).
function _roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
