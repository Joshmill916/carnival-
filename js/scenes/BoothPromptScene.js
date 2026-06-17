// Overlay shown when the player walks up to a booth: confirm play (and energy
// cost) or back out. Rendered as a DOM modal over the dimmed, frozen map.
import { Scene } from '../core/SceneManager.js';
import { createModal } from '../ui/Modal.js';
import { canPlay, getEnergyStatus } from '../systems/Economy.js';

export class BoothPromptScene extends Scene {
  onEnter({ booth }) {
    this.booth = booth;
    const status = getEnergyStatus();
    const affordable = canPlay(booth.cost);
    this.modal = createModal({ title: `${booth.emoji} ${booth.name}` });
    this.modal.body.innerHTML = `
      <p class="lead">Step right up!</p>
      <p>Cost to play: <b>${booth.cost} ⚡</b></p>
      <p class="muted">You have ${status.current}/${status.max} energy.</p>
      ${affordable ? '' : '<p class="warn">Not enough energy — wait for it to refill or visit the Store.</p>'}
    `;
    const playBtn = this.modal.addButton('Play', () => this.game.playBooth(booth), 'primary');
    if (!affordable) playBtn.disabled = true;
    this.modal.addButton('Back', () => this.game.closeBoothPrompt(booth.id), 'ghost');
  }
  onExit() {
    this.modal?.close();
  }
}
