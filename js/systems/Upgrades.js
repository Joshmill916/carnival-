// Upgrade purchasing + derivation of effective stats from purchased levels.
import { State } from '../data/State.js';
import { bus } from '../core/EventBus.js';
import { UPGRADES } from '../data/defs.js';
import { addCoins, spendCoins } from './Economy.js';

const up = () => State.s.upgrades;

// Effective tuning derived from levels. Read by Economy (max/regen) and the
// mini-game host (prizeMultiplier).
export function getEffectiveStats() {
  return {
    energyMax: UPGRADES.energyCap.value(up().levels.energyCap),
    regenMs: UPGRADES.regenSpeed.value(up().levels.regenSpeed),
    prizeMultiplier: UPGRADES.prizeMult.value(up().levels.prizeMult),
  };
}

// Push derived stats into the live economy object. Called at boot and after any
// purchase. Re-anchors the regen timer so a faster regen takes effect immediately.
export function recompute() {
  const stats = getEffectiveStats();
  const e = State.s.economy.energy;
  e.max = stats.energyMax;
  e.regenMs = stats.regenMs;
  if (e.current > e.max) e.current = e.max;
  if (!e.lastTickTs) e.lastTickTs = Date.now();
}

export function levelOf(id) {
  return up().levels[id] ?? 0;
}

export function isUnlocked(boothKey) {
  return !!up().unlocked[boothKey];
}

// Cost of the next purchase for an upgrade, or Infinity if maxed/already owned.
export function costFor(id) {
  const def = UPGRADES[id];
  if (!def) return Infinity;
  if (def.kind === 'unlock') {
    return isUnlocked(def.boothKey) ? Infinity : def.cost;
  }
  const lvl = levelOf(id);
  if (lvl >= def.maxLevel) return Infinity;
  return def.cost(lvl);
}

export function canAfford(id) {
  const c = costFor(id);
  return c !== Infinity && State.s.economy.coins >= c;
}

// Attempt a purchase. Returns { ok, reason? }.
export function purchase(id) {
  const def = UPGRADES[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const cost = costFor(id);
  if (cost === Infinity) return { ok: false, reason: 'maxed' };
  if (!spendCoins(cost)) return { ok: false, reason: 'broke' };

  if (def.kind === 'unlock') {
    up().unlocked[def.boothKey] = true;
  } else {
    up().levels[id] = levelOf(id) + 1;
  }
  recompute();
  State.save();
  bus.emit('upgrades:changed');
  bus.emit('economy:changed');
  return { ok: true };
}

// Re-export for callers that grant coins via the upgrades flow (none yet, kept
// for symmetry with the store fulfillment helper).
export { addCoins };
