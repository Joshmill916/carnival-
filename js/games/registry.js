// Maps booth game keys to MiniGame classes, plus the score→tickets payout per
// game. Adding a new game = drop a class here.
import { RingToss } from './RingToss.js';
import { BottleKnockdown } from './BottleKnockdown.js';
import { BalloonDarts } from './BalloonDarts.js';

export const GAMES = {
  rings: RingToss,
  bottles: BottleKnockdown,
  darts: BalloonDarts,
};

// Convert a game's raw score into base tickets (before the prize multiplier).
// Tuned so a good round pays a handful of tickets.
export function scoreToTickets(gameKey, score) {
  switch (gameKey) {
    case 'rings':
      return score; // peg points map ~1:1
    case 'bottles':
      return score * 3; // 1 ticket-ish per bottle, ×3
    case 'darts':
      return score * 2;
    default:
      return score;
  }
}
