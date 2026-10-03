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
import { safeTop } from '../ui/BoothStage.js';

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

  // Shared helper: the score / tries bar every game shares. Two chunky chips
  // that sit below the notch and clear of the ✕ quit button, plus the hint in
  // a dark pill at the bottom so it reads over any scenery. No glow.
  _drawHud(ctx) {
    const W = this.view.w, H = this.view.h;
    const top = safeTop() + 8, h = 38;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '800 17px "Outfit", "Trebuchet MS", system-ui, sans-serif';

    const chip = (x, w, label, value, color) => {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      _roundRectPath(ctx, x + 1, top + 3, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(28,12,40,0.86)';
      _roundRectPath(ctx, x, top, w, h, h / 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      _roundRectPath(ctx, x + 1.5, top + 1.5, w - 3, h - 3, h / 2 - 1.5);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '700 12px "Outfit", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(label, x + 14, top + h / 2 + 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.font = '900 19px "Outfit", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(String(value), x + w - 14, top + h / 2 + 1);
    };
    const left = 58; // clear of the ✕ button
    const gap = 8;
    const cw = Math.min(150, (W - left - 10 - gap) / 2);
    chip(left, cw, 'SCORE', this.score, '#ffd84a');
    chip(W - 10 - cw, cw, 'TRIES', this.attemptsLeft, '#ff6fae');

    if (this.hint) {
      ctx.font = '700 14px "Outfit", "Trebuchet MS", system-ui, sans-serif';
      const tw = Math.min(W - 24, ctx.measureText(this.hint).width + 32);
      const py = H - 46;
      ctx.fillStyle = 'rgba(20,8,30,0.78)';
      _roundRectPath(ctx, W / 2 - tw / 2, py, tw, 30, 15);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff8e8';
      ctx.fillText(this.hint, W / 2, py + 16);
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
