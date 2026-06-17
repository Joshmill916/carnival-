// Tickets wallet + level progression. Play is free and unlimited; you earn
// tickets from games, which both fund the Prize Booth and raise your Level.
// Leveling up opens higher prize tiers (and, later, new games).
import { State } from '../data/State.js';
import { bus } from '../core/EventBus.js';
import { LEVELS, PRIZE_TIERS } from '../data/defs.js';

const prog = () => State.s.progress;
const wallet = () => State.s.wallet;

// Highest level whose ticket requirement is met by lifetime tickets earned.
export function levelForEarned(earned) {
  let lvl = 1;
  for (const L of LEVELS) if (earned >= L.need) lvl = L.level;
  return lvl;
}

export function levelDef(level) {
  return LEVELS.find((L) => L.level === level) || LEVELS[LEVELS.length - 1];
}

// Prize tiers available at a level: tier N opens at level N (capped).
export function maxPrizeTier(level = prog().level) {
  return Math.max(1, Math.min(PRIZE_TIERS, level));
}

// Bonus multiplier on prize tickets, unlocked at higher levels.
export function prizeMultiplier(level = prog().level) {
  return level >= 6 ? 1.25 : 1;
}

// Snapshot for the HUD / prize booth.
export function getStatus() {
  const p = prog();
  const level = p.level;
  const next = LEVELS.find((L) => L.level === level + 1);
  const curNeed = levelDef(level).need;
  const span = next ? next.need - curNeed : 1;
  const into = p.ticketsEarnedTotal - curNeed;
  return {
    tickets: wallet().tickets,
    level,
    playsTotal: p.playsTotal,
    earnedTotal: p.ticketsEarnedTotal,
    maxTier: maxPrizeTier(level),
    next, // null at max level
    progress: next ? Math.max(0, Math.min(1, into / span)) : 1,
    toNext: next ? Math.max(0, next.need - p.ticketsEarnedTotal) : 0,
  };
}

// Recompute level from lifetime earnings; returns the new level if it changed.
function refreshLevel() {
  const p = prog();
  const computed = levelForEarned(p.ticketsEarnedTotal);
  if (computed !== p.level) {
    const leveledUp = computed > p.level;
    p.level = computed;
    bus.emit('progress:changed');
    return leveledUp ? computed : null;
  }
  return null;
}

// Award tickets from a finished game. Returns { tickets, leveledTo|null }.
export function awardTickets(n) {
  if (n <= 0) return { tickets: 0, leveledTo: null };
  wallet().tickets += n;
  prog().ticketsEarnedTotal += n;
  const leveledTo = refreshLevel();
  State.save();
  bus.emit('wallet:changed');
  return { tickets: n, leveledTo };
}

export function spendTickets(n) {
  if (wallet().tickets < n) return false;
  wallet().tickets -= n;
  State.save();
  bus.emit('wallet:changed');
  return true;
}

// Count a play. Plays are unlimited; we track the total for stats/feel.
export function registerPlay() {
  prog().playsTotal++;
  State.save();
  bus.emit('progress:changed');
}

// Re-derive level on boot (e.g. after a migration) without granting anything.
export function recompute() {
  refreshLevel();
}
