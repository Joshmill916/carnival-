// The persistent top bar: energy (with regen countdown), tickets, coins, and the
// Store/Upgrades/Settings buttons. DOM-based; updates on economy changes and a 1s
// timer for the countdown. Hidden during mini-games.
import { bus } from '../core/EventBus.js';
import { getEnergyStatus, accrueEnergy } from '../systems/Economy.js';
import { Audio } from '../core/Audio.js';

export class HUD {
  constructor({ onStore, onUpgrades, onSettings }) {
    this.onStore = onStore;
    this.onUpgrades = onUpgrades;
    this.onSettings = onSettings;
    this._build();
    bus.on('economy:changed', () => this.refresh());
    bus.on('upgrades:changed', () => this.refresh());
    // Tick the countdown + accrue energy every second while visible.
    this._timer = setInterval(() => {
      accrueEnergy();
      this.refresh();
    }, 1000);
    this.refresh();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = `
      <div class="hud-stats">
        <div class="stat stat-energy"><span class="ico">⚡</span><span class="val" id="hud-energy">0/0</span><span class="sub" id="hud-energy-time"></span></div>
        <div class="stat stat-tickets"><span class="ico">🎟️</span><span class="val" id="hud-tickets">0</span></div>
        <div class="stat stat-coins"><span class="ico">🪙</span><span class="val" id="hud-coins">0</span></div>
      </div>
      <div class="hud-buttons">
        <button class="hud-btn" id="hud-store" title="Store">🛒</button>
        <button class="hud-btn" id="hud-upgrades" title="Upgrades">⬆️</button>
        <button class="hud-btn" id="hud-settings" title="Settings">⚙️</button>
      </div>`;
    document.getElementById('overlay-root').appendChild(el);
    this.el = el;
    el.querySelector('#hud-store').addEventListener('click', () => {
      Audio.ui();
      this.onStore();
    });
    el.querySelector('#hud-upgrades').addEventListener('click', () => {
      Audio.ui();
      this.onUpgrades();
    });
    el.querySelector('#hud-settings').addEventListener('click', () => {
      Audio.ui();
      this.onSettings();
    });
  }

  refresh() {
    const s = getEnergyStatus();
    this.el.querySelector('#hud-energy').textContent = `${s.current}/${s.max}`;
    this.el.querySelector('#hud-energy-time').textContent = s.full ? '' : `+1 in ${s.countdown}`;
    this.el.querySelector('#hud-tickets').textContent = s.tickets;
    this.el.querySelector('#hud-coins').textContent = s.coins;
  }

  show() {
    this.el.style.display = '';
    this.refresh();
  }
  hide() {
    this.el.style.display = 'none';
  }
}
