// The single source of truth for the saved game shape, its version, and migration.
import { clone, deepMergeDefaults } from '../core/util.js';

export const SCHEMA_VERSION = 1;
export const SAVE_KEY = 'carnival.save.v1';

// Base economy tuning. These are the LEVEL-0 values; Upgrades derives the
// effective max/regen/multiplier from these plus the player's purchased levels.
export const BASE = {
  energyStart: 5,
  energyMax: 10, // upgradable
  regenMs: 10 * 60 * 1000, // 10 min per energy at level 0 (upgradable)
  playCost: 1, // energy spent per game play
  startingCoins: 50,
};

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    createdTs: 0, // set on first save
    lastSeenTs: 0, // updated every save
    settings: {
      muted: false,
      debug: false,
    },
    player: {
      name: 'Player',
      pos: { x: 600, y: 520 }, // spawn near the centre of the fairground
      facing: 'down',
    },
    economy: {
      energy: {
        current: BASE.energyStart,
        max: BASE.energyMax, // overwritten by Upgrades at boot
        regenMs: BASE.regenMs, // overwritten by Upgrades at boot
        lastTickTs: 0, // ms epoch of last credited unit; set on first save
      },
      tickets: 0, // soft currency won from games
      coins: BASE.startingCoins, // currency for upgrades + store
    },
    upgrades: {
      levels: { energyCap: 0, regenSpeed: 0, prizeMult: 0 },
      unlocked: { rings: true, bottles: false, darts: false }, // ring toss free at start
    },
    stats: {
      plays: 0,
      ticketsEarnedTotal: 0,
      best: { rings: 0, bottles: 0, darts: 0 },
    },
    store: {
      purchases: [], // [{ productId, receipt, ts }]
    },
  };
}

// Turn an arbitrary stored blob into a valid current-version state.
// Falls back to defaults on anything unusable, and deep-merges new keys.
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return defaultState();
  let s = raw;
  if (s.version === undefined) s.version = 0;

  // Forward migration chain goes here as the schema evolves, e.g.:
  // if (s.version < 2) { /* transform */ s.version = 2; }

  s = deepMergeDefaults(s, defaultState());
  s.version = SCHEMA_VERSION;
  return s;
}

// Exposed for tests: a fresh default object.
export const freshState = () => clone(defaultState());
