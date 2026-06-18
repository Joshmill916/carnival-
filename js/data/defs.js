// Static content definitions: the fairground layout (booths, rides, food,
// decorations), the prize catalog, and the level/progression ladder.

// World bounds the avatar can roam (the fairground field).
export const WORLD = { w: 1400, h: 1200 };

// --- Game booths -------------------------------------------------------------
// `game` maps to the MiniGame registry key. All three are open from the start;
// `minLevel` is here so future games can unlock as you level up.
export const BOOTHS = [
  {
    id: 'rings',
    name: 'Ring Toss',
    game: 'rings',
    minLevel: 1,
    x: 360,
    y: 430,
    color: '#ff5d8f',
    emoji: '🎯',
  },
  {
    id: 'bottles',
    name: 'Bottle Knockdown',
    game: 'bottles',
    minLevel: 1,
    x: 1040,
    y: 430,
    color: '#3ddc97',
    emoji: '🎳',
  },
  {
    id: 'darts',
    name: 'Balloon Darts',
    game: 'darts',
    minLevel: 1,
    x: 700,
    y: 930,
    color: '#5b8cff',
    emoji: '🎈',
  },
  {
    id: 'striker',
    name: 'High Striker',
    game: 'striker',
    minLevel: 1,
    x: 700,
    y: 430,
    color: '#ff8f4d',
    emoji: '🔨',
  },
];

// --- Rides (decorative landmarks, animated) ----------------------------------
export const RIDES = [
  { id: 'ferris', kind: 'ferris', x: 250, y: 200, r: 150, name: 'Ferris Wheel' },
  { id: 'carousel', kind: 'carousel', x: 1150, y: 220, r: 110, name: 'Carousel' },
];

// --- Food stalls (decorative) ------------------------------------------------
export const FOOD = [
  { id: 'hotdog', x: 620, y: 250, emoji: '🌭', name: 'Hot Dogs', color: '#e8552e' },
  { id: 'icecream', x: 800, y: 250, emoji: '🍦', name: 'Ice Cream', color: '#5bc8e8' },
  { id: 'popcorn', x: 1040, y: 820, emoji: '🍿', name: 'Popcorn', color: '#f2c14e' },
  { id: 'cotton', x: 360, y: 820, emoji: '🍭', name: 'Cotton Candy', color: '#ff8fc7' },
];

// --- Static decorations ------------------------------------------------------
export const TREES = [
  { x: 120, y: 520 }, { x: 1290, y: 560 }, { x: 150, y: 980 },
  { x: 1280, y: 980 }, { x: 700, y: 120 }, { x: 480, y: 660 },
  { x: 930, y: 660 }, { x: 700, y: 1120 },
];

// String-light runs: each is a list of pole anchor points lights are strung between.
export const LIGHT_LINES = [
  [{ x: 460, y: 360 }, { x: 700, y: 320 }, { x: 940, y: 360 }],
  [{ x: 300, y: 700 }, { x: 700, y: 740 }, { x: 1100, y: 700 }],
];

// How many wandering fair-goers to spawn.
export const NPC_COUNT = 14;

// --- Prizes ------------------------------------------------------------------
// Tiered catalog. Redeem tickets for a prize; trade 3 of one tier up to a prize
// one tier higher. Higher tiers unlock as your Level climbs.
export const PRIZE_TIERS = 5;
export const TRADE_UP_COUNT = 3; // 3 of tier N → 1 of tier N+1

export const PRIZES = [
  // Tier 1
  { id: 'lollipop', name: 'Lollipop', emoji: '🍭', tier: 1, cost: 15 },
  { id: 'goldfish', name: 'Goldfish', emoji: '🐠', tier: 1, cost: 15 },
  { id: 'sticker', name: 'Star Sticker', emoji: '⭐', tier: 1, cost: 15 },
  // Tier 2
  { id: 'teddy', name: 'Teddy Bear', emoji: '🧸', tier: 2, cost: 60 },
  { id: 'ball', name: 'Bouncy Ball', emoji: '🏀', tier: 2, cost: 60 },
  { id: 'yoyo', name: 'Yo-yo', emoji: '🪀', tier: 2, cost: 60 },
  // Tier 3
  { id: 'guitar', name: 'Toy Guitar', emoji: '🎸', tier: 3, cost: 220 },
  { id: 'skateboard', name: 'Skateboard', emoji: '🛹', tier: 3, cost: 220 },
  { id: 'headphones', name: 'Headphones', emoji: '🎧', tier: 3, cost: 220 },
  // Tier 4
  { id: 'console', name: 'Game Console', emoji: '🎮', tier: 4, cost: 750 },
  { id: 'bike', name: 'Bicycle', emoji: '🚲', tier: 4, cost: 750 },
  { id: 'camera', name: 'Camera', emoji: '📷', tier: 4, cost: 750 },
  // Tier 5
  { id: 'panda', name: 'Giant Panda', emoji: '🐼', tier: 5, cost: 2500 },
  { id: 'trophy', name: 'Gold Trophy', emoji: '🏆', tier: 5, cost: 2500 },
  { id: 'crown', name: 'Jeweled Crown', emoji: '👑', tier: 5, cost: 2500 },
];

export const prizeById = (id) => PRIZES.find((p) => p.id === id);
export const prizesInTier = (tier) => PRIZES.filter((p) => p.tier === tier);

// --- Levels ------------------------------------------------------------------
// `need` is the total tickets EARNED (lifetime) to reach that level. Each level
// opens up more of the fair. Prize tier 1 is open at L1; tier N opens at level N.
export const LEVELS = [
  { level: 1, need: 0, unlock: 'All three games open — start winning!' },
  { level: 2, need: 80, unlock: 'Prize tier 2 unlocked 🧸' },
  { level: 3, need: 260, unlock: 'Prize tier 3 unlocked 🎸' },
  { level: 4, need: 650, unlock: 'Prize tier 4 unlocked 🎮' },
  { level: 5, need: 1400, unlock: 'Prize tier 5 — top prizes! 🏆' },
  { level: 6, need: 2600, unlock: 'Golden tickets: +25% prize tickets' },
  { level: 7, need: 4400, unlock: 'New game slot — coming soon 🎪' },
  { level: 8, need: 7000, unlock: 'Fair Champion status 👑' },
];
