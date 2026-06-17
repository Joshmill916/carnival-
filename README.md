# Carnival Games 🎪

A free-to-play carnival/fair game. You walk a top-down fairground, step up to a
booth, and play a classic carnival game. It's an installable web app (PWA) that
runs on **iPhone and Android** (and desktop), works **offline**, and saves your
progress locally — no account, no server, nothing uploaded.

## Play

- **Walk** around the fair with the on-screen joystick (drag anywhere on the
  lower part of the screen). On desktop, use **WASD / arrow keys**.
- **Walk up to a booth** to get the play prompt, then play:
  - 🎯 **Ring Toss** — swipe up toward a peg to lob a ring. A harder swipe reaches
    the farther, higher-value pegs. 3 rings.
  - 🎳 **Bottle Knockdown** — swipe up to throw a baseball and topple the stack.
    2 balls; clear them all for a coin bonus.
  - 🎈 **Balloon Darts** — tap a balloon to throw a dart. 5 darts; brighter
    balloons are worth more.
- **Win 🎟️ tickets** from every game (boosted by your Prize upgrade).

## The economy (energy that refills over time)

- Playing a game costs **⚡ energy**. Energy **refills on its own over time**, up
  to a cap — even while the app is closed (it catches up when you return), just
  like Monopoly Go's dice.
- **🪙 Coins** buy **Upgrades**: a bigger energy cap, faster regen, a prize-ticket
  boost, and unlocks for the Bottle and Dart booths.
- The **🛒 Store** is the "option to buy". In this version it's **simulated** — the
  Buy buttons grant coins/energy instantly with **no real money**. The store sits
  behind a clean interface (`js/systems/Store.js`) so a real payment provider can
  be added later without changing the rest of the app.

## Run it

- **Quickest:** serve the folder over HTTP (service workers and ES modules don't
  run from `file://`):
  ```sh
  python3 -m http.server 8000
  ```
  then open `http://localhost:8000`.
- **Install:** open it over HTTPS (e.g. a Netlify/GitHub Pages deploy) and use
  "Add to Home Screen" on iPhone Safari or "Install" on Android Chrome.

See `SETUP.md` for hosting and the path to real app-store builds.

## Tech

Vanilla HTML/CSS/JavaScript, **no build step**. HTML5 Canvas with a
fixed-timestep loop and a scene stack; ES modules loaded directly by the browser.
All art is drawn procedurally (no image assets). Code layout:

```
index.html, sw.js, manifest.webmanifest, css/, assets/icons/
js/core/    engine: loop, scene manager, renderer/camera, input, storage, audio
js/data/    save schema + migration, shared state, content definitions
js/systems/ economy (energy/currency), upgrades, store
js/scenes/  boot, map, booth prompt, mini-game host, results, store, upgrades, settings
js/games/   mini-game base + ring toss / bottle knockdown / balloon darts
js/ui/      HUD, modal helper, procedural sprites, particles
```

## Tests

Open `tests.html` over HTTP to run the built-in economy, upgrade, and
mini-game-determinism checks in the browser (no framework, no build).
