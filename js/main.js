// Entry point: build the game, wire visibility/energy handling, unlock audio on
// first touch, register the service worker, and expose a debug hook for testing.
import { Game } from './core/Game.js';
import { Audio } from './core/Audio.js';
import { State } from './data/State.js';
import { accrueEnergy } from './systems/Economy.js';
import { recompute } from './systems/Upgrades.js';
import { bus } from './core/EventBus.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();

// Unlock the AudioContext on the first user interaction (mobile requirement).
const unlock = () => {
  Audio.unlock();
  window.removeEventListener('pointerdown', unlock);
};
window.addEventListener('pointerdown', unlock);

// Credit energy + persist around tab visibility changes.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    accrueEnergy();
    bus.emit('economy:changed');
  } else {
    State.flush(); // persist lastTickTs before the app is backgrounded/closed
  }
});
window.addEventListener('pagehide', () => State.flush());

// Register the offline service worker (only over http/https, not file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Debug hook for manual/automated testing of the energy economy.
window.__debug = {
  state: () => State.s,
  setEnergy: (n) => {
    State.s.economy.energy.current = n;
    State.saveNow();
    bus.emit('economy:changed');
  },
  addCoins: (n) => {
    State.s.economy.coins += n;
    State.saveNow();
    bus.emit('economy:changed');
  },
  // Pretend `ms` milliseconds have passed since the last energy tick.
  warpTime: (ms) => {
    State.s.economy.energy.lastTickTs -= ms;
    accrueEnergy();
    bus.emit('economy:changed');
    return State.s.economy.energy;
  },
  recompute,
};
