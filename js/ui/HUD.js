// The persistent top bar: tickets, your Level + progress, and the
// Prizes / Store / Settings buttons. DOM-based; updates on wallet/progress
// changes. Hidden during mini-games.
import { bus } from '../core/EventBus.js';
import { getStatus } from '../systems/Progression.js';
import { Audio } from '../core/Audio.js';

export class HUD {
  constructor({ onPrizes, onStore, onSettings }) {
    this.onPrizes = onPrizes;
    this.onStore = onStore;
    this.onSettings = onSettings;
    this._build();
    bus.on('wallet:changed', () => this.refresh());
    bus.on('progress:changed', () => this.refresh());
    this.refresh();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = `
      <div class="hud-stats">
        <div class="stat stat-tickets"><span class="ico">🎟️</span><span class="val" id="hud-tickets">0</span></div>
        <div class="stat stat-level">
          <span class="ico">⭐</span><span class="val" id="hud-level">1</span>
          <span class="lvlbar mini"><span id="hud-lvlfill"></span></span>
        </div>
      </div>
      <div class="hud-buttons">
        <button class="hud-btn" id="hud-prizes" title="Prize Booth">🎁</button>
        <button class="hud-btn" id="hud-store" title="Get tickets">🛒</button>
        <button class="hud-btn" id="hud-settings" title="Settings">⚙️</button>
      </div>`;
    document.getElementById('overlay-root').appendChild(el);
    this.el = el;
    el.querySelector('#hud-prizes').addEventListener('click', () => {
      Audio.ui();
      this.onPrizes();
    });
    el.querySelector('#hud-store').addEventListener('click', () => {
      Audio.ui();
      this.onStore();
    });
    el.querySelector('#hud-settings').addEventListener('click', () => {
      Audio.ui();
      this.onSettings();
    });
  }

  refresh() {
    const s = getStatus();
    this.el.querySelector('#hud-tickets').textContent = s.tickets;
    this.el.querySelector('#hud-level').textContent = s.level;
    this.el.querySelector('#hud-lvlfill').style.width = `${Math.round(s.progress * 100)}%`;
  }

  show() {
    this.el.style.display = '';
    this.refresh();
  }
  hide() {
    this.el.style.display = 'none';
  }
}
