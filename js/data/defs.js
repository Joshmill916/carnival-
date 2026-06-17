// Static content definitions: upgrades (with cost curves) and the booth catalog.
import { BASE } from './schema.js';

// --- Upgrades ----------------------------------------------------------------
// Stat upgrades have levels with an exponential coin cost. Unlocks are one-shots.
// cost(level) returns the price to buy the NEXT level from the given current level.
export const UPGRADES = {
  energyCap: {
    id: 'energyCap',
    label: 'Energy Cap',
    desc: '+5 max energy per level.',
    kind: 'stat',
    maxLevel: 8,
    cost: (lvl) => Math.round(50 * Math.pow(1.6, lvl)),
    value: (lvl) => BASE.energyMax + 5 * lvl, // effective energy max
  },
  regenSpeed: {
    id: 'regenSpeed',
    label: 'Faster Regen',
    desc: 'Energy refills ~15% faster per level.',
    kind: 'stat',
    maxLevel: 6,
    cost: (lvl) => Math.round(80 * Math.pow(1.7, lvl)),
    // Each level multiplies regen time by 0.85, with a 1-minute floor.
    value: (lvl) => Math.max(60 * 1000, Math.round(BASE.regenMs * Math.pow(0.85, lvl))),
  },
  prizeMult: {
    id: 'prizeMult',
    label: 'Prize Boost',
    desc: '+15% tickets from every game per level.',
    kind: 'stat',
    maxLevel: 6,
    cost: (lvl) => Math.round(120 * Math.pow(1.8, lvl)),
    value: (lvl) => +(1 + 0.15 * lvl).toFixed(2), // prize multiplier
  },
  unlockBottles: {
    id: 'unlockBottles',
    label: 'Unlock Bottle Knockdown',
    desc: 'Open the baseball bottle-toss booth.',
    kind: 'unlock',
    boothKey: 'bottles',
    cost: 150,
  },
  unlockDarts: {
    id: 'unlockDarts',
    label: 'Unlock Balloon Darts',
    desc: 'Open the balloon dart booth.',
    kind: 'unlock',
    boothKey: 'darts',
    cost: 300,
  },
};

// --- Booths ------------------------------------------------------------------
// Placed around the fairground. `game` maps to the MiniGame registry key.
// `unlockKey` matches state.upgrades.unlocked[...]; rings starts unlocked.
export const BOOTHS = [
  {
    id: 'rings',
    name: 'Ring Toss',
    game: 'rings',
    unlockKey: 'rings',
    x: 320,
    y: 300,
    color: '#ff5d8f',
    emoji: '🎯',
    cost: BASE.playCost,
  },
  {
    id: 'bottles',
    name: 'Bottle Knockdown',
    game: 'bottles',
    unlockKey: 'bottles',
    x: 880,
    y: 300,
    color: '#3ddc97',
    emoji: '🎳',
    cost: BASE.playCost,
  },
  {
    id: 'darts',
    name: 'Balloon Darts',
    game: 'darts',
    unlockKey: 'darts',
    x: 600,
    y: 760,
    color: '#5b8cff',
    emoji: '🎈',
    cost: BASE.playCost,
  },
];

// World bounds the avatar can roam (the fairground field).
export const WORLD = { w: 1200, h: 1000 };

// --- Store products ----------------------------------------------------------
// v1 is simulated: priceLabel is cosmetic, grants are applied instantly.
export const STORE_PRODUCTS = [
  { id: 'coins_small', title: 'Pocket of Coins', desc: '100 coins', priceLabel: '$0.99', grants: { coins: 100 } },
  { id: 'coins_med', title: 'Bag of Coins', desc: '550 coins (+10%)', priceLabel: '$3.99', grants: { coins: 550 } },
  { id: 'coins_large', title: 'Chest of Coins', desc: '1500 coins (+25%)', priceLabel: '$9.99', grants: { coins: 1500 } },
  { id: 'energy_refill', title: 'Full Energy', desc: 'Refill energy to max', priceLabel: '$1.99', grants: { energyFull: true } },
];
