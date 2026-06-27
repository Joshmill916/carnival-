// Offline service worker for Carnival Games. Bump CACHE_VERSION whenever the app
// shell changes so installed players get the new build on their next online load.
// Only app code is cached — game progress lives in localStorage and is untouched.
const CACHE_VERSION = 'carnival-v10';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/reset.css',
  './css/theme.css',
  './css/ui.css',
  './js/main.js',
  './js/core/Game.js',
  './js/core/Loop.js',
  './js/core/SceneManager.js',
  './js/core/Renderer.js',
  './js/core/Input.js',
  './js/core/Audio.js',
  './js/core/Storage.js',
  './js/core/EventBus.js',
  './js/core/util.js',
  './js/data/schema.js',
  './js/data/State.js',
  './js/data/defs.js',
  './js/systems/Progression.js',
  './js/systems/Prizes.js',
  './js/systems/Store.js',
  './js/scenes/BootScene.js',
  './js/scenes/MapScene.js',
  './js/scenes/BoothPromptScene.js',
  './js/scenes/MiniGameScene.js',
  './js/scenes/ResultsScene.js',
  './js/scenes/StoreScene.js',
  './js/scenes/PrizeScene.js',
  './js/scenes/SettingsScene.js',
  './js/games/MiniGame.js',
  './js/games/registry.js',
  './js/games/RingToss.js',
  './js/games/BottleKnockdown.js',
  './js/games/BalloonDarts.js',
  './js/games/HighStriker.js',
  './js/games/ClawMachine.js',
  './js/games/BBGunStar.js',
  './js/games/RailBowling.js',
  './js/games/BasketToss.js',
  './js/games/GoldfishToss.js',
  './js/ui/HUD.js',
  './js/ui/Modal.js',
  './js/ui/Sprites.js',
  './js/ui/Particles.js',
  './js/ui/Backdrop.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      // Do NOT claim the live page: seizing it fires 'controllerchange' and, on
      // iOS home-screen PWAs, reload-loops on every launch. An updated worker
      // waits and takes over on the next cold start instead.
      .then(() => Promise.resolve())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigations: network-first so an online device always gets the latest build.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Code + assets: cache-first, then fill the cache on a miss.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
