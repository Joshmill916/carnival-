// Thin bridge to the native Android shell (Capacitor). The game itself stays a
// plain web app: everything here checks whether it is running inside the
// Android app and quietly falls back (or does nothing) in a browser.
//
// Capacitor injects `window.Capacitor` into the app's WebView, and installed
// plugins are reachable through `Capacitor.Plugins`, so no bundler is needed.
import { State } from '../data/State.js';

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);

// True inside the Android (or iOS) app, false in a browser.
export function isNative() {
  const c = cap();
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
}

function plugin(name) {
  const c = cap();
  return (c && c.Plugins && c.Plugins[name]) || null;
}

// Short vibrations for the big moments. `kind` is light | medium | heavy |
// success | warning. Uses the native Haptics plugin in the app, the browser's
// vibrate() where it exists (Android Chrome), and nothing otherwise.
const PATTERN = { light: 12, medium: 24, heavy: 45, success: [18, 60, 30], warning: [30, 50, 30] };
const STYLE = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };

export function haptic(kind = 'light') {
  try {
    if (State.s && State.s.settings && State.s.settings.haptics === false) return;
    const h = isNative() ? plugin('Haptics') : null;
    if (h) {
      if (kind === 'success' || kind === 'warning') h.notification({ type: kind.toUpperCase() });
      else h.impact({ style: STYLE[kind] || 'LIGHT' });
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERN[kind] || PATTERN.light);
    }
  } catch {
    // Haptics are a nicety; never let them break the game.
  }
}

// Android's system Back button: close whatever is open, leave a mini-game, or
// (from the fairground itself) send the app to the background like any other
// Android app. `game` is the running Game.
export function installBackButton(game) {
  const app = isNative() ? plugin('App') : null;
  if (!app || typeof app.addListener !== 'function') return;
  app.addListener('backButton', () => {
    const scenes = game.scenes;
    const top = scenes.top;
    const key = top && top.key;
    if (scenes.stack.length <= 1) {
      app.minimizeApp();
    } else if (key === 'MiniGame' || key === 'Results') {
      game.toMap();
    } else if (key === 'BoothPrompt') {
      game.closeBoothPrompt(top.booth && top.booth.id);
    } else {
      game.closeMenu();
    }
  });
}
