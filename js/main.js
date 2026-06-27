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
  // A worker already controlling the page at load means any later
  // controllerchange is a NEW build taking over — reload once to run it.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Skip the first-install claim; never auto-reload an iOS home-screen PWA
    // (navigator.standalone) — there it causes a launch-time reload loop.
    if (reloaded || !hadController || navigator.standalone) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
      // Re-check for a new build hourly and whenever the app regains focus.
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}

// Debug hook for manual/automated testing.
window.__debug = {
  state: () => State.s,
  addTickets: (n) => awardTickets(n),
  recompute,
};
