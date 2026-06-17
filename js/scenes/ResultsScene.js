// Post-game results: score, tickets won (and any big-win coin bonus), with
// "Play again" and "Back to map". DOM modal over the dimmed map.
import { Scene } from '../core/SceneManager.js';
import { createModal } from '../ui/Modal.js';
import { canPlay } from '../systems/Economy.js';
import { Audio } from '../core/Audio.js';

export class ResultsScene extends Scene {
  onEnter({ result, tickets, multiplier, booth }) {
    this.booth = booth;
    this.game.hud.show();
    this.game.input.setMode('none');
    if (result.won) Audio.win();
    else Audio.fail();

    const title = result.won ? '🎉 Nice!' : 'Better luck next time';
    this.modal = createModal({ title });
    const multTxt = multiplier > 1 ? ` <span class="muted">(×${multiplier} boost)</span>` : '';
    this.modal.body.innerHTML = `
      <p class="big">Score: <b>${result.score}</b></p>
      <p class="big">🎟️ Tickets won: <b>${tickets}</b>${multTxt}</p>
      ${result.bigWin ? `<p class="win">PERFECT! Bonus 🪙 +${result.coinBonus}</p>` : ''}
    `;
    const again = this.modal.addButton('Play again', () => this.game.playBooth(booth), 'primary');
    if (!canPlay(booth.cost)) {
      again.disabled = true;
      again.title = 'Not enough energy';
    }
    this.modal.addButton('Back to map', () => this.game.toMap(), 'ghost');
  }
  onExit() {
    this.modal?.close();
  }
}
