# Carnival Games — Setup & Hosting

A static site with **no build step**. Host it anywhere that serves static files.

## Run locally

Service workers and ES modules need a real origin, so serve over HTTP rather than
opening `index.html` from disk:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
# or:  npx serve .
```

`localhost` is a secure context, so the service worker registers and you can test
offline mode (DevTools → Application → Service Workers, then Network → Offline,
and reload).

## Deploy free (installable on iPhone + Android)

A PWA installs from the home screen on both platforms when served over **HTTPS**.

1. Push to GitHub.
2. Point a static host at this folder with **no build command** and the publish
   directory set to this directory:
   - **Netlify** — Add new site → Import from Git (or drag-and-drop the folder).
   - **GitHub Pages** / **Cloudflare Pages** / **Vercel** also work.
3. Visit the HTTPS URL on a phone:
   - **iPhone (Safari):** Share → *Add to Home Screen*.
   - **Android (Chrome):** menu → *Install app* / *Add to Home screen*.

## Updating the app

When you change any shell file, bump `CACHE_VERSION` in `sw.js` (e.g.
`carnival-v2`). Updates **apply automatically**: on the next online visit the
new service worker installs, takes control, and the page reloads itself once
onto the fresh build — no manual cache-clearing. (See the registration block in
`js/main.js`, which reloads on `controllerchange` and re-checks for new builds
on focus.) Save data lives in `localStorage` and is never touched by the
service worker, so it survives the reload.

## Player data & privacy

All progress (energy, tickets, coins, upgrades, stats) is stored only in the
browser's `localStorage` on the device. Nothing is uploaded.

## Path to real purchases / app stores

The store is behind the `IStore` interface in `js/systems/Store.js`. To take real
payments later:

- **Web:** add a `StripeStore` implementing the same `getProducts / purchase /
  restore` methods; call the shared `fulfill(product)` after server-side receipt
  verification. No UI changes needed.
- **App stores:** wrap this same code in a thin native shell (e.g. **Capacitor**)
  and add a `CapacitorIAPStore` for App Store / Play billing. The game logic and
  UI stay as-is.
