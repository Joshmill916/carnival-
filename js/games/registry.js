// Maps booth game keys to MiniGame classes, plus the score→tickets payout per
// game. Adding a new game = drop a class here.
import { RingToss } from './RingToss.js';
import { BottleKnockdown } from './BottleKnockdown.js';
import { BalloonDarts } from './BalloonDarts.js';
import { HighStriker } from './HighStriker.js';
import { ClawMachine } from './ClawMachine.js';
import { BBGunStar } from './BBGunStar.js';
import { RailBowling } from './RailBowling.js';
import { BasketToss } from './BasketToss.js';
import { GoldfishToss } from './GoldfishToss.js';

export const GAMES = {
  rings: RingToss,
  bottles: BottleKnockdown,
  darts: BalloonDarts,
  striker: HighStriker,
  claw: ClawMachine,
  bbgun: BBGunStar,
  railbowl: RailBowling,
  basket: BasketToss,
  goldfish: GoldfishToss,
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
    case 'striker':
      return score; // 0–30, ~1:1
    case 'claw':
      return score * 3;
    case 'bbgun':
      return score * 2;
    case 'railbowl':
      return score * 4;
    case 'basket':
      return score * 3;
    case 'goldfish':
      return score * 2;
    default:
      return score;
  }
}
