// Upgrades overlay: spend coins on energy cap, regen speed, prize boost, and
// booth unlocks. Re-renders after each purchase to show new levels/costs.
import { Scene } from '../core/SceneManager.js';
import { createModal, toast } from '../ui/Modal.js';
import { UPGRADES } from '../data/defs.js';
import { State } from '../data/State.js';
import { costFor, canAfford, purchase, levelOf, isUnlocked } from '../systems/Upgrades.js';
import { Audio } from '../core/Audio.js';

export class UpgradesScene extends Scene {
  onEnter() {
    this.game.input.setMode('none');
    this.modal = createModal({ title: '⬆️ Upgrades' });
    this.list = document.createElement('div');
    this.list.className = 'upgrade-list';
    this.modal.body.appendChild(this.list);
    this._render();
    this.modal.addButton('Close', () => this.game.closeMenu(), 'ghost');
  }

  _render() {
    this.list.innerHTML = `<p class="muted">You have 🪙 ${State.s.economy.coins} coins.</p>`;
    for (const def of Object.values(UPGRADES)) {
      const cost = costFor(def.id);
      const maxed =
        cost === Infinity &&
        (def.kind === 'unlock' ? isUnlocked(def.boothKey) : levelOf(def.id) >= def.maxLevel);
      const lvlText =
        def.kind === 'unlock'
          ? isUnlocked(def.boothKey)
            ? 'Unlocked'
            : 'Locked'
          : `Lv ${levelOf(def.id)}/${def.maxLevel}`;

      const row = document.createElement('div');
      row.className = 'upgrade';
      row.innerHTML = `
        <div class="upgrade-info">
          <div class="upgrade-title">${def.label} <span class="muted">${lvlText}</span></div>
          <div class="upgrade-desc">${def.desc}</div>
        </div>`;
      const buy = document.createElement('button');
      buy.className = 'btn btn-primary';
      if (maxed) {
        buy.textContent = def.kind === 'unlock' ? 'Owned' : 'Max';
        buy.disabled = true;
      } else {
        buy.textContent = `🪙 ${cost}`;
        buy.disabled = !canAfford(def.id);
        buy.addEventListener('click', () => {
          const res = purchase(def.id);
          if (res.ok) {
            Audio.coin();
            toast(`Purchased ${def.label}`);
          } else {
            toast(res.reason === 'broke' ? 'Not enough coins' : 'Cannot buy');
          }
          this._render();
        });
      }
      row.appendChild(buy);
      this.list.appendChild(row);
    }
  }

  onExit() {
    this.modal?.close();
  }
}
