// Copies the shipping game files into www/ — the folder Capacitor bundles
// into the Android app. The game has no build step, so this is just a clean
// copy that leaves out tests, tooling and the android/ project itself.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const SHIP = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of SHIP) {
  const src = join(root, item);
  if (!existsSync(src)) throw new Error(`missing ${item}`);
  cpSync(src, join(out, item), { recursive: true });
}
console.log(`Copied ${SHIP.join(', ')} → www/`);
