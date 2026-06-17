// The energy + currency core. Energy regenerates by timestamp math so it accrues
// even while the app is closed (only lastTickTs is persisted). Effective max and
// regenMs are owned here but written by Upgrades.recompute().
import { State } from '../data/State.js';
import { bus } from '../core/EventBus.js';
import { formatTime } from '../core/util.js';

const econ = () => State.s.economy;

// Credit any energy earned since lastTickTs. `now` is injectable for testing.
// Returns the number of energy units added.
export function accrueEnergy(now = Date.now()) {
  const e = econ().energy;
  if (!e.lastTickTs) e.lastTickTs = now;

  if (e.current >= e.max) {
    e.lastTickTs = now; // already full: keep the timer anchored to now
    return 0;
  }
  const elapsed = now - e.lastTickTs;
  if (elapsed < e.regenMs) return 0;

  const gained = Math.floor(elapsed / e.regenMs);
  const applied = Math.min(gained, e.max - e.current);
  e.current += applied;
  // Advance the anchor by whole regen windows so partial progress is preserved.
  e.lastTickTs += gained * e.regenMs;
  if (e.current >= e.max) e.lastTickTs = now; // at cap, start fresh on next spend

  if (applied > 0) {
    State.save();
    bus.emit('economy:changed');
  }
  return applied;
}

export function canPlay(cost = 1) {
  accrueEnergy();
  return econ().energy.current >= cost;
}

// Spend energy for a play. Returns true on success.
export function spendEnergy(cost = 1) {
  accrueEnergy();
  const e = econ().energy;
  if (e.current < cost) return false;
  const wasFull = e.current >= e.max;
  e.current -= cost;
  // If we were at the cap, the regen timer was paused — start it now.
  if (wasFull) e.lastTickTs = Date.now();
  State.save();
  bus.emit('economy:changed');
  return true;
}

export function refillEnergy() {
  const e = econ().energy;
  e.current = e.max;
  e.lastTickTs = Date.now();
  State.save();
  bus.emit('economy:changed');
}

export function addTickets(n) {
  if (n <= 0) return;
  econ().tickets += n;
  State.s.stats.ticketsEarnedTotal += n;
  State.save();
  bus.emit('economy:changed');
}

export function addCoins(n) {
  if (n <= 0) return;
  econ().coins += n;
  State.save();
  bus.emit('economy:changed');
}

export function spendCoins(n) {
  if (econ().coins < n) return false;
  econ().coins -= n;
  State.save();
  bus.emit('economy:changed');
  return true;
}

// Snapshot for the HUD: current/max plus a formatted countdown to the next unit.
export function getEnergyStatus(now = Date.now()) {
  const e = econ().energy;
  const full = e.current >= e.max;
  const intoWindow = full ? 0 : (now - e.lastTickTs) % e.regenMs;
  const msToNext = full ? 0 : e.regenMs - intoWindow;
  return {
    current: e.current,
    max: e.max,
    full,
    msToNext,
    countdown: full ? 'FULL' : formatTime(msToNext),
    tickets: econ().tickets,
    coins: econ().coins,
  };
}
