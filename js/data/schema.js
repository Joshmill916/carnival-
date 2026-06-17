// The single source of truth for the saved game shape, its version, and migration.
import { clone, deepMergeDefaults } from '../core/util.js';

export const SCHEMA_VERSION = 2;
export const SAVE_KEY = 'carnival.save.v1';

// Base tuning. Play is now free and unlimited — progression comes from your
// Level (climbs as you play) and the Prize Booth (redeem + trade up tickets).
export const BASE = {
  startingTickets: 0,
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
      pos: { x: 600, y: 640 }, // spawn on the central plaza
      facing: 'up',
    },
    // How far you've come. Level rises with total tickets earned and opens up
    // more of the fair (higher prize tiers, future games).
    progress: {
      level: 1,
      playsTotal: 0,
      ticketsEarnedTotal: 0,
    },
    // Soft currency won from games and spent in the Prize Booth.
    wallet: {
      tickets: BASE.startingTickets,
    },
    // Prizes you own: { prizeId: count }. Trade 3 of a tier up to 1 better prize.
    prizes: {
      inventory: {},
    },
    stats: {
      best: { rings: 0, bottles: 0, darts: 0 },
    },
  };
}

// Turn an arbitrary stored blob into a valid current-version state.
// Falls back to defaults on anything unusable, and deep-merges new keys.
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return defaultState();
  let s = raw;
  if (s.version === undefined) s.version = 0;

  // v0/v1 → v2: the old energy/coins/upgrades economy is gone. Carry over any
  // tickets the player had into the new wallet, then let defaults fill the rest.
  if (s.version < 2) {
    const carriedTickets =
      (s.wallet && s.wallet.tickets) ||
      (s.economy && s.economy.tickets) ||
      0;
    const earnedTotal =
      (s.progress && s.progress.ticketsEarnedTotal) ||
      (s.stats && s.stats.ticketsEarnedTotal) ||
      carriedTickets;
    s.wallet = { tickets: carriedTickets };
    s.progress = {
      level: 1,
      playsTotal: (s.stats && s.stats.plays) || 0,
      ticketsEarnedTotal: earnedTotal,
    };
    delete s.economy;
    delete s.upgrades;
    delete s.store;
    s.version = 2;
  }

  s = deepMergeDefaults(s, defaultState());
  s.version = SCHEMA_VERSION;
  return s;
}

// Exposed for tests: a fresh default object.
export const freshState = () => clone(defaultState());
