# Carnival on Android

The game is wrapped as a native Android app with [Capacitor](https://capacitorjs.com).
The same web code runs in both places: the website (GitHub Pages) and the app.
Nothing in `js/` is Android-only; native extras live in `js/core/Native.js` and
quietly do nothing in a browser.

What the app adds over the website:

- **A real Android app** — installs from an APK now, from Google Play later.
- **Vibration** on big moments (bell rings, bottles hit, stomps, wins). It can be
  turned off in Settings → Vibration. Android Chrome on the website gets it too.
- **Back button** — closes the open menu, leaves a mini-game, or minimises the
  app from the fairground.
- **Portrait-locked**, with the HUD kept clear of the status bar and notch.
- Carnival-wheel **launcher icon** (adaptive) and a dark **splash screen**.
- All game files ship inside the app, so it works offline with no service worker.

App id: `io.github.joshmill916.carnival`. **It can't be changed once the app is
on Google Play**, so change it in `capacitor.config.json` and
`android/app/build.gradle` before the first upload if you want a different one.

## Get the app on your phone (no Android tools needed)

Every push to `main` that touches the game builds the app on GitHub's servers.

1. On github.com, open the repo → **Actions** → **Android build** → the latest run.
2. Under **Artifacts**, download **carnival-debug-apk** (a zip). Unzip it on the
   phone (or on a computer and copy it over) to get `app-debug.apk`.
3. Open `app-debug.apk` on the Android phone. Android will ask to allow
   installing from this source (your browser or Files app) — allow it once.
4. Open **Carnival** from your home screen.

You can also start a build any time: Actions → Android build → **Run workflow**.

To let friends test, send them the same APK. For a proper test group, use
Google Play's testing tracks (below).

## Publishing to Google Play

1. **Developer account** — sign up at play.google.com/console ($25, one time).
   New personal accounts must run a **closed test** (Google has required at
   least 12 testers for 14 days; check the current rule when you sign up) before
   the app can go public.
2. **Create an upload key** (once, on any computer with Java):

   ```sh
   keytool -genkeypair -v -keystore carnival-upload.jks -alias carnival \
     -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 carnival-upload.jks > carnival-upload.b64   # macOS: base64 -i carnival-upload.jks
   ```

   Keep `carnival-upload.jks` and its passwords somewhere safe. **Never commit it.**
3. **Add four repository secrets** (repo → Settings → Secrets and variables →
   Actions → New repository secret):

   | Secret | Value |
   |---|---|
   | `CARNIVAL_KEYSTORE_BASE64` | contents of `carnival-upload.b64` |
   | `CARNIVAL_KEYSTORE_PASSWORD` | the keystore password |
   | `CARNIVAL_KEY_ALIAS` | `carnival` (or the alias you chose) |
   | `CARNIVAL_KEY_PASSWORD` | the key password |

4. Run the **Android build** workflow again. It now also produces
   **carnival-release-aab**, a signed bundle. Upload `app-release.aab` to the
   closed testing track in Play Console. Each build gets a higher version code
   automatically.
5. In Play Console, fill in the store listing, content rating questionnaire and
   Data safety form. The game currently collects no data and has no ads or
   purchases. Update the forms when ads or purchases are added.

## Working on the Android project locally (optional)

Only needed if you want Android Studio. You need Node 22+, JDK 21 and the
Android SDK.

```sh
npm install
npm run android:sync     # copies the game into android/ (www/ is a build folder)
npx cap open android     # opens Android Studio
```

Always run `npm run android:sync` after changing game files, so the app picks
them up. The web build step just copies `index.html`, `css/`, `js/`, `assets/`,
`manifest.webmanifest` and `sw.js` into `www/` (see `scripts/build-web.mjs`).

Icons and splash screens are generated from `resources/` with
`npx @capacitor/assets generate --android --assetPath resources`.
