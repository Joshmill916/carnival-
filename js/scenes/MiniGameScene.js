// Host scene that wraps a pure MiniGame instance and owns the economy side:
// spends energy on entry, converts the final score to tickets (× prize
// multiplier), awards coin bonuses on big wins, and routes to the results screen.
import { Scene } from '../core/SceneManager.js';
import { GAMES, scoreToTickets } from '../games/registry.js';
import { spendEnergy, canPlay, addTickets, addCoins } from '../systems/Economy.js';
import { getEffectiveStats } from '../systems/Upgrades.js';
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
    if (!canPlay(booth.cost)) {
      toast('Not enough energy.');
      return this.game.toMap();
    }
    spendEnergy(booth.cost);
    State.s.stats.plays++;

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
    const stats = getEffectiveStats();
    const base = scoreToTickets(r.gameKey, r.score);
    const tickets = Math.round(base * stats.prizeMultiplier);
    if (tickets > 0) addTickets(tickets);
    if (r.bigWin && r.coinBonus > 0) addCoins(r.coinBonus);

    // Track best score per game.
    const best = State.s.stats.best;
    if (best[r.gameKey] === undefined || r.score > best[r.gameKey]) {
      best[r.gameKey] = r.score;
    }
    State.save();

    this.game.scenes.replace('Results', {
      result: r,
      tickets,
      multiplier: stats.prizeMultiplier,
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
