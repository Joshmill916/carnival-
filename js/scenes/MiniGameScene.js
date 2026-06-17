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

    const view = { w: this.game.renderer.width, h: this.game.renderer.height };
    this.instance = new GameClass(view, makeRng(), {});
    this.instance.init();
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
    this.instance.handleInput(this.game.input);
    this.instance.update(dt);
    if (this.instance.isDone()) this._finish();
  }

  _finish() {
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

    this.game.scenes.replace('Results', {
      result: r,
      tickets,
      multiplier: mult,
      leveledTo: award.leveledTo,
      booth: this.booth,
    });
  }

  render(ctx, alpha) {
    if (this.instance) this.instance.render(ctx, alpha);
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
