// Prize Booth logic: redeem tickets for prizes and trade 3 of one tier up to a
// single prize one tier higher. Inventory is a { prizeId: count } map.
import { State } from '../data/State.js';
import { bus } from '../core/EventBus.js';
import { PRIZES, prizeById, prizesInTier, TRADE_UP_COUNT, PRIZE_TIERS } from '../data/defs.js';
import { spendTickets, maxPrizeTier } from './Progression.js';

const inv = () => State.s.prizes.inventory;

export function countOf(prizeId) {
  return inv()[prizeId] || 0;
}

// Total prizes owned in a tier (across all prizes of that tier).
export function tierCount(tier) {
  return prizesInTier(tier).reduce((sum, p) => sum + countOf(p.id), 0);
}

export function totalPrizes() {
  return Object.values(inv()).reduce((a, b) => a + b, 0);
}

function give(prizeId, n = 1) {
  inv()[prizeId] = countOf(prizeId) + n;
}

// Redeem tickets for a prize. Returns { ok, reason? }.
export function redeem(prizeId) {
  const p = prizeById(prizeId);
  if (!p) return { ok: false, reason: 'unknown' };
  if (p.tier > maxPrizeTier()) return { ok: false, reason: 'locked' };
  if (!spendTickets(p.cost)) return { ok: false, reason: 'broke' };
  give(prizeId);
  State.save();
  bus.emit('prizes:changed');
  return { ok: true };
}

// Can we trade up from this tier? Need TRADE_UP_COUNT prizes in it and a tier above.
export function canTradeUp(tier) {
  return tier < PRIZE_TIERS && tierCount(tier) >= TRADE_UP_COUNT;
}

// Trade TRADE_UP_COUNT prizes of `tier` for one chosen prize of `tier + 1`.
// Consumes the most-owned prizes in the tier first. Returns { ok, reason? }.
export function tradeUp(tier, rewardId) {
  if (!canTradeUp(tier)) return { ok: false, reason: 'need-more' };
  const reward = prizeById(rewardId);
  if (!reward || reward.tier !== tier + 1) return { ok: false, reason: 'bad-reward' };

  // Spend TRADE_UP_COUNT items from this tier, draining highest counts first.
  let toSpend = TRADE_UP_COUNT;
  const owned = prizesInTier(tier)
    .map((p) => ({ id: p.id, n: countOf(p.id) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  for (const item of owned) {
    if (toSpend <= 0) break;
    const take = Math.min(item.n, toSpend);
    inv()[item.id] -= take;
    if (inv()[item.id] <= 0) delete inv()[item.id];
    toSpend -= take;
  }
  give(rewardId);
  State.save();
  bus.emit('prizes:changed');
  return { ok: true };
}

// All prizes the player currently owns, for the inventory view.
export function ownedList() {
  return PRIZES.filter((p) => countOf(p.id) > 0).map((p) => ({ ...p, count: countOf(p.id) }));
}
