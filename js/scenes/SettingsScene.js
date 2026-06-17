// Settings overlay: mute toggle, reset save (with confirm), and app info.
import { Scene } from '../core/SceneManager.js';
import { createModal, toast } from '../ui/Modal.js';
import { State } from '../data/State.js';
import { recompute } from '../systems/Progression.js';

export class SettingsScene extends Scene {
  onEnter() {
    this.game.input.setMode('none');
    this.modal = createModal({ title: '⚙️ Settings' });
    this._render();
    this.modal.addButton('Close', () => this.game.closeMenu(), 'ghost');
  }

  _render() {
    const muted = State.s.settings.muted;
    this.modal.body.innerHTML = `
      <label class="setting-row">
        <span>Sound</span>
        <input type="checkbox" id="set-sound" ${muted ? '' : 'checked'}>
      </label>
      <p class="muted">Progress saves automatically on this device.</p>
    `;
    this.modal.body.querySelector('#set-sound').addEventListener('change', (e) => {
      State.s.settings.muted = !e.target.checked;
      State.save();
    });

    if (!this._resetBound) {
      this._resetBound = true;
      const reset = this.modal.addButton('Reset progress', () => {
        if (this._confirming) {
          State.reset();
          recompute();
          toast('Progress reset.');
          this.game.closeMenu();
        } else {
          this._confirming = true;
          reset.textContent = 'Tap again to confirm';
          setTimeout(() => {
            this._confirming = false;
            reset.textContent = 'Reset progress';
          }, 2500);
        }
      }, 'danger');
    }
  }

  onExit() {
    this.modal?.close();
  }
}
