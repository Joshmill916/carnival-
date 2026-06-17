// Entry point: build the game, persist around tab visibility, unlock audio on
// first touch, register the service worker, and expose a debug hook for testing.
import { Game } from './core/Game.js';
import { Audio } from './core/Audio.js';
import { State } from './data/State.js';
import { recompute, awardTickets } from './systems/Progression.js';
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

// Persist when the app is backgrounded/closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') State.flush();
});
window.addEventListener('pagehide', () => State.flush());

// Register the offline service worker (only over http/https, not file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Debug hook for manual/automated testing.
window.__debug = {
  state: () => State.s,
  addTickets: (n) => awardTickets(n),
  recompute,
};
