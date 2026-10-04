// Static content definitions: the fairground layout (booths, rides, food,
// decorations), the prize catalog, and the level/progression ladder.

// Layout spread: every position below is authored on the original 1400x1200
// plan and multiplied out, so the fair has real breathing room between
// attractions without re-placing anything by hand.
export const SPREAD = 1.6;
export const sp = (v) => Math.round(v * SPREAD);

// World bounds the avatar can roam (the fairground field).
export const WORLD = { w: sp(1400), h: sp(1200) };

// Bump when the layout moves so saved player positions are reset to SPAWN
// instead of landing somewhere odd (or inside a tent).
export const LAYOUT_VERSION = 2;

// Central plaza with the fountain.
export const PLAZA = { x: WORLD.w / 2, y: Math.round(WORLD.h * 0.55), r: 300 };
export const FOUNTAIN = { x: PLAZA.x, y: PLAZA.y, r: 92 };
// You arrive through the entrance arch on the south fence, facing the fair.
export const SPAWN = { x: PLAZA.x - 210, y: WORLD.h - 300 };

// --- Game booths -------------------------------------------------------------
// `game` maps to the MiniGame registry key. All three are open from the start;
// `minLevel` is here so future games can unlock as you level up.
export const BOOTHS = [
  {
    id: 'rings',
    name: 'Ring Toss',
    game: 'rings',
    minLevel: 1,
    x: sp(360),
    y: sp(430),
    color: '#ff5d8f',
    emoji: '🎯',
  },
  {
    id: 'bottles',
    name: 'Bottle Knockdown',
    game: 'bottles',
    minLevel: 1,
    x: sp(1040),
    y: sp(430),
    color: '#3ddc97',
    emoji: '🎳',
  },
  {
    id: 'darts',
    name: 'Balloon Darts',
    game: 'darts',
    minLevel: 1,
    x: sp(700),
    y: sp(930),
    color: '#5b8cff',
    emoji: '🎈',
  },
  {
    id: 'striker',
    name: 'High Striker',
    game: 'striker',
    minLevel: 1,
    x: sp(700),
    y: sp(430),
    color: '#ff8f4d',
    emoji: '🔨',
  },
  {
    id: 'claw',
    name: 'Claw Machine',
    game: 'claw',
    minLevel: 2,
    x: sp(360),
    y: sp(700),
    color: '#b07cff',
    emoji: '🦾',
  },
  {
    id: 'bbgun',
    name: 'BB Gun Star',
    game: 'bbgun',
    minLevel: 3,
    x: sp(1040),
    y: sp(700),
    color: '#ff5d5d',
    emoji: '⭐',
  },
  {
    id: 'railbowl',
    name: 'Rail Bowling',
    game: 'railbowl',
    minLevel: 4,
    x: sp(210),
    y: sp(1050),
    color: '#3ddc97',
    emoji: '🎳',
  },
  {
    id: 'basket',
    name: 'Basket Toss',
    game: 'basket',
    minLevel: 5,
    x: sp(1190),
    y: sp(1050),
    color: '#ffd14d',
    emoji: '🧺',
  },
  {
    id: 'goldfish',
    name: 'Goldfish Toss',
    game: 'goldfish',
    minLevel: 6,
    x: sp(700),
    y: sp(185),
    color: '#5b8cff',
    emoji: '🐟',
  },
];

// --- Rides (decorative landmarks, animated) ----------------------------------
export const RIDES = [
  { id: 'ferris', kind: 'ferris', x: sp(250), y: sp(200), r: 190, name: 'Ferris Wheel' },
  { id: 'carousel', kind: 'carousel', x: sp(1150), y: sp(220), r: 140, name: 'Carousel' },
];

// --- Food stalls (decorative) ------------------------------------------------
export const FOOD = [
  { id: 'hotdog', x: sp(620), y: sp(250), emoji: '🌭', name: 'Hot Dogs', color: '#e8552e' },
  { id: 'icecream', x: sp(800), y: sp(250), emoji: '🍦', name: 'Ice Cream', color: '#5bc8e8' },
  { id: 'popcorn', x: sp(1040), y: sp(820), emoji: '🍿', name: 'Popcorn', color: '#f2c14e' },
  { id: 'cotton', x: sp(360), y: sp(820), emoji: '🍭', name: 'Cotton Candy', color: '#ff8fc7' },
];

// --- Static decorations ------------------------------------------------------
export const TREES = [
  { x: sp(120), y: sp(520) }, { x: sp(1290), y: sp(560) }, { x: sp(150), y: sp(980) },
  { x: sp(1280), y: sp(980) }, { x: sp(700), y: sp(120) }, { x: sp(470), y: sp(560) },
  { x: sp(930), y: sp(560) }, { x: sp(300), y: sp(1150) },
  { x: sp(520), y: sp(330) }, { x: sp(880), y: sp(330) }, { x: sp(460), y: sp(1100) },
  { x: sp(940), y: sp(1100) }, { x: sp(1260), y: sp(820) }, { x: sp(140), y: sp(780) },
];

// String-light runs: each is a list of pole anchor points lights are strung between.
export const LIGHT_LINES = [
  // Placed in open lawn between the booth rows, clear of every path.
  [{ x: 260, y: 560 }, { x: 840, y: 500 }, { x: 1400, y: 500 }, { x: 1980, y: 560 }],
  [{ x: 300, y: 1440 }, { x: 840, y: 1440 }, { x: 1400, y: 1440 }, { x: 1940, y: 1440 }],
];

// How many wandering fair-goers to spawn.
export const NPC_COUNT = 22;

// --- 3D world tuning ---------------------------------------------------------
// The overworld is rendered in 3D (see js/world/), where the 2D map's (x, y)
// becomes (x, z) and y is real height. Positions above are shared by both the
// 3D world and the 2D fallback map; these extra dimensions are 3D-only.
// Rides are intentionally absent from COLLIDE_R — you must be able to walk into
// one to board it.
export const COLLIDE_R = { booth: 84, food: 46, tree: 24 };
export const HEIGHTS = { booth: 150, food: 110, tree: 170, pole: 240 };

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
  { level: 1, need: 0, unlock: 'All four games open — start winning!' },
  { level: 2, need: 80, unlock: 'Claw Machine unlocked 🦾 + Prize tier 2 🧸' },
  { level: 3, need: 260, unlock: 'BB Gun Star unlocked ⭐ + Prize tier 3 🎸' },
  { level: 4, need: 650, unlock: 'Rail Bowling unlocked 🎳 + Prize tier 4 🎮' },
  { level: 5, need: 1400, unlock: 'Basket Toss unlocked 🧺 + Prize tier 5 🏆' },
  { level: 6, need: 2600, unlock: 'Goldfish Toss unlocked 🐟 + Golden tickets +25%' },
  { level: 7, need: 4400, unlock: 'All games unlocked! Double the fun 🎪' },
  { level: 8, need: 7000, unlock: 'Fair Champion status 👑' },
];
