// Host scene that wraps a pure MiniGame instance and owns progression: counts
// the play, converts the final score to tickets (× any level bonus), and routes
// to the results screen. Play is free and unlimited.
import { Scene } from '../core/SceneManager.js';
import { GAMES, scoreToTickets } from '../games/registry.js';
import { registerPlay, awardTickets, prizeMultiplier } from '../systems/Progression.js';
import { State } from '../data/State.js';
import { makeRng } from '../core/util.js';
import { toast } from '../ui/Modal.js';
import { Audio } from '../core/Audio.js';
import { Particles } from '../ui/Particles.js';

export class MiniGameScene extends Scene {
  onEnter({ booth }) {
    this.booth = booth;
    const GameClass = GAMES[booth.game];
    if (!GameClass) {
      toast('That game is not available yet.');
      return this.game.toMap();
    }
    registerPlay();

    this.game.hud.hide();
    this.game.input.setMode('gesture');

    this.view = { w: this.game.renderer.width, h: this.game.renderer.height };
    this.instance = new GameClass(this.view, makeRng(), {});
    this.instance.init();
    this.fx = new Particles();         // screen-space confetti for the win moment
    this.finishing = false;
    this.celebrating = false;
    this.celebrateT = 0;
    this.banner = '';
    this._addQuitButton();
  }

  _addQuitButton() {
    const b = document.createElement('button');
    b.className = 'quit-btn';
    b.textContent = '✕';
    b.title = 'Leave game';
    b.addEventListener('click', () => {
      Audio.ui();
      this.game.toMap();
    });
    document.getElementById('overlay-root').appendChild(b);
    this.quitBtn = b;
  }

  update(dt) {
    if (!this.instance) return;
    if (this.celebrating) {
      this.celebrateT -= dt;
      this.fx.update(dt);
      if (this.celebrateT <= 0) this._goResults();
      return;
    }
    this.instance.handleInput(this.game.input);
    this.instance.update(dt);
    if (this.instance.isDone() && !this.finishing) this._finish();
  }

  _finish() {
    this.finishing = true;
    const r = this.instance.getResult();
    const mult = prizeMultiplier();
    const base = scoreToTickets(r.gameKey, r.score);
    const bonus = r.bigWin ? r.coinBonus : 0; // perfect-clear ticket bonus
    const tickets = Math.round((base + bonus) * mult);
    const award = awardTickets(tickets);

    // Track best score per game.
    const best = State.s.stats.best;
    if (best[r.gameKey] === undefined || r.score > best[r.gameKey]) {
      best[r.gameKey] = r.score;
    }
    State.save();

    this.pending = {
      result: r,
      tickets,
      multiplier: mult,
      leveledTo: award.leveledTo,
      booth: this.booth,
    };

    // A short on-canvas celebration (confetti + shake + fanfare) before results.
    if (award.leveledTo || r.bigWin || r.won) {
      this.celebrating = true;
      this.celebrateT = award.leveledTo ? 1.6 : 1.2;
      this.banner = award.leveledTo ? `⭐ LEVEL ${award.leveledTo}!` : (r.bigWin ? 'PERFECT! 🎉' : 'NICE! 🎉');
      this.fx.confetti(this.view.w, award.leveledTo ? 130 : 90);
      this.game.addShake(award.leveledTo ? 10 : 7, 0.4);
      if (award.leveledTo || r.bigWin) Audio.fanfare();
      else Audio.win();
    } else {
      this._goResults();
    }
  }

  _goResults() {
    this.game.scenes.replace('Results', this.pending);
  }

  render(ctx, alpha) {
    if (this.instance) this.instance.render(ctx, alpha);
    if (this.celebrating) {
      this.fx.render(ctx);
      ctx.save();
      ctx.font = '900 42px "Outfit", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const by = this.view.h * 0.32;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(this.banner, this.view.w / 2, by);
      ctx.fillStyle = '#ff2d78';
      ctx.fillText(this.banner, this.view.w / 2, by);
      ctx.restore();
    }
  }

  onExit() {
    this.instance?.destroy();
    this.instance = null;
    this.quitBtn?.remove();
  }

  get blocksRenderBelow() {
    return true;
  }
}
