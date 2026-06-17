// Overlay shown when the player walks up to a booth: confirm play or back out.
// Play is free and unlimited. Rendered as a DOM modal over the frozen map.
import { Scene } from '../core/SceneManager.js';
import { createModal } from '../ui/Modal.js';

export class BoothPromptScene extends Scene {
  onEnter({ booth }) {
    this.booth = booth;
    this.modal = createModal({ title: `${booth.emoji} ${booth.name}` });
    this.modal.body.innerHTML = `
      <p class="lead">Step right up!</p>
      <p class="muted">Free to play — win 🎟️ tickets for the Prize Booth.</p>
    `;
    this.modal.addButton('Play', () => this.game.playBooth(booth), 'primary');
    this.modal.addButton('Back', () => this.game.closeBoothPrompt(booth.id), 'ghost');
  }
  onExit() {
    this.modal?.close();
  }
}
