// Post-game results: score, tickets won, any perfect-clear bonus, and a level-up
// banner. "Play again" and "Back to map". DOM modal over the map.
import { Scene } from '../core/SceneManager.js';
import { createModal } from '../ui/Modal.js';
import { levelDef } from '../systems/Progression.js';
import { Audio } from '../core/Audio.js';

export class ResultsScene extends Scene {
  onEnter({ result, tickets, multiplier, leveledTo, booth }) {
    this.booth = booth;
    this.game.hud.show();
    this.game.input.setMode('none');
    if (leveledTo) Audio.fanfare();
    else if (result.won) Audio.win();
    else Audio.fail();

    const title = result.won ? '🎉 Nice round!' : 'Better luck next time';
    this.modal = createModal({ title });
    const multTxt = multiplier > 1 ? ` <span class="muted">(×${multiplier} level bonus)</span>` : '';
    const banner = result.bigWin ? 'BIG WIN!' : (result.won ? 'YOU WON' : '');
    const levelTxt = leveledTo
      ? `<p class="win">⭐ LEVEL UP! You reached Level ${leveledTo}<br><span class="muted">${levelDef(leveledTo).unlock}</span></p>`
      : '';
    this.modal.body.innerHTML = `
      ${banner ? `<p class="result-banner">${banner}</p>` : ''}
      <p class="result-score">${result.score}</p>
      <p class="result-tickets">🎟️ ${tickets} tickets${multTxt}</p>
      ${levelTxt}
    `;
    this.modal.addButton('Play again', () => this.game.playBooth(booth), 'primary');
    this.modal.addButton('Prize Booth 🎁', () => {
      this.game.toMap();
      this.game.openPrizes();
    }, 'ghost');
    this.modal.addButton('Back to map', () => this.game.toMap(), 'ghost');
  }
  onExit() {
    this.modal?.close();
  }
}
