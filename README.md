# Carnival Games 🎪

A free-to-play carnival/fair game. You walk a top-down fairground, step up to a
booth, and play a classic carnival game. It's an installable web app (PWA) that
runs on **iPhone and Android** (and desktop), works **offline**, and saves your
progress locally — no account, no server, nothing uploaded.

## Play

- **Walk** the lively fairground with the on-screen joystick (drag anywhere on the
  lower part of the screen). On desktop, use **WASD / arrow keys**. The fair has
  animated rides (Ferris wheel, carousel), food stalls, wandering people, trees
  and twinkling string lights.
- **Walk up to a booth** to play — all three are open from the start, and play is
  **free and unlimited**:
  - 🎯 **Ring Toss** — swipe up toward a peg to lob a ring. A harder swipe reaches
    the farther, higher-value pegs. 3 rings.
  - 🎳 **Bottle Knockdown** — swipe up to throw a baseball and topple the stack.
    2 balls; clear them all for a bonus.
  - 🎈 **Balloon Darts** — tap a balloon to throw a dart. 5 darts; brighter
    balloons are worth more.
- **Win 🎟️ tickets** from every game.

## Progression (play → level up → collect prizes)

- Every game pays out **🎟️ tickets**. Tickets do two things: they fund the Prize
  Booth, and your lifetime total raises your **⭐ Level**.
- **Leveling up opens up the fair** — higher prize tiers unlock as you climb, and
  later levels add a ticket bonus and reserve slots for future games.
- The **🎁 Prize Booth** is where you spend tickets:
  - **Redeem** tickets for prizes across five tiers (lollipops → giant pandas).
  - **Trade up**: turn 3 prizes of one tier into 1 prize of the next tier up.
- The **🛒 Store** is the optional "buy". It's **simulated** — Buy buttons grant
  tickets instantly with **no real money** — and sits behind a clean interface
  (`js/systems/Store.js`) so a real payment provider can be added later without
  changing the rest of the app.

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
js/systems/ progression (tickets + levels), prizes (redeem + trade up), store
js/scenes/  boot, map, booth prompt, mini-game host, results, store, prizes, settings
js/games/   mini-game base + ring toss / bottle knockdown / balloon darts
js/ui/      HUD, modal helper, procedural sprites, particles
```

## Tests

Open `tests.html` over HTTP to run the built-in progression, prize, and
mini-game-determinism checks in the browser (no framework, no build).
