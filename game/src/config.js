// Glowkeep — one place for every number that tunes the game: the field, the path the
// wisps walk, the build pads, the towers, the enemies and the waves. Nothing here draws
// or listens; change a number here and the whole game rebalances from it.
export const STEP = 1 / 60;
export const BEST_KEY = 'glowkeep-best-score';

export const FIELD = { width: 960, height: 600 };

// The path, as waypoints the enemies walk from the left edge to the crystal.
export const PATH_POINTS = [
  { x: -20, y: 84 },
  { x: 252, y: 84 },
  { x: 252, y: 264 },
  { x: 492, y: 264 },
  { x: 492, y: 444 },
  { x: 732, y: 444 },
  { x: 732, y: 264 },
  { x: 888, y: 264 },
];
export const PATH_WIDTH = 46;
export const CRYSTAL = { x: 888, y: 264, radius: 30 };

// Build pads: stone circles a tower can stand on. Each sits clear of the path corridor.
export const PADS = [
  { x: 120, y: 180 }, { x: 360, y: 170 }, { x: 600, y: 170 }, { x: 840, y: 150 },
  { x: 120, y: 360 }, { x: 360, y: 360 }, { x: 600, y: 360 }, { x: 840, y: 360 },
  { x: 120, y: 520 }, { x: 360, y: 520 }, { x: 600, y: 520 }, { x: 840, y: 528 },
];
export const PAD_RADIUS = 24;

export const START_GOLD = 130;
export const CORE_HP = 20;
export const TOTAL_WAVES = 10;
export const SELL_RATE = 0.7;

// Towers, keyed by kind. upgradeCost(level) is what level -> level+1 costs.
export const TOWERS = {
  spark: {
    name: 'Spark Spire', key: '1', cost: 50, range: 98, rate: 2.2, damage: 7,
    color: '#ffd94a', dark: '#8a6d1f',
    blurb: 'Fast bolts, one wisp at a time',
    upgradeCost: (level) => Math.round(50 * 0.9 * level),
  },
  frost: {
    name: 'Frost Spire', key: '2', cost: 60, range: 88, rate: 1.0, damage: 2,
    slowFactor: 0.55, slowTime: 1.6, color: '#7fe3ff', dark: '#1f6d8a',
    blurb: 'Chills wisps, slowing them down',
    upgradeCost: (level) => Math.round(60 * 0.9 * level),
  },
  cannon: {
    name: 'Ember Cannon', key: '3', cost: 90, range: 112, rate: 0.55, damage: 22,
    splash: 55, color: '#ff8a5c', dark: '#8a3d1f',
    blurb: 'Slow shells that burst and splash',
    upgradeCost: (level) => Math.round(90 * 0.9 * level),
  },
};
export const TOWER_ORDER = ['spark', 'frost', 'cannon'];
export const MAX_LEVEL = 3;
// Per-level growth: damage x1.6, range +8, rate +10%, splash +12, slow a little stronger.
export function towerStats(kind, level) {
  const base = TOWERS[kind];
  const mult = 1.6 ** (level - 1);
  return {
    range: base.range + 8 * (level - 1),
    rate: base.rate * (1 + 0.1 * (level - 1)),
    damage: Math.round(base.damage * mult),
    splash: base.splash ? base.splash + 12 * (level - 1) : 0,
    slowFactor: base.slowFactor ? Math.max(0.3, base.slowFactor - 0.05 * (level - 1)) : 1,
    slowTime: base.slowTime ? base.slowTime + 0.3 * (level - 1) : 0,
  };
}

// Enemies, keyed by kind. hp is multiplied by the wave scale.
export const ENEMIES = {
  wisp: { name: 'Wisp', hp: 18, speed: 52, reward: 6, leak: 1, radius: 11, color: '#b78cff', eye: '#efe6ff' },
  gloom: { name: 'Gloom', hp: 42, speed: 36, reward: 9, leak: 1, radius: 14, color: '#7a5cff', eye: '#ffe9a8' },
  brute: { name: 'Brute', hp: 130, speed: 24, reward: 18, leak: 3, radius: 19, color: '#5c3df0', eye: '#ff5c5c' },
  dread: { name: 'Dread Wisp', hp: 900, speed: 26, reward: 120, leak: 10, radius: 26, color: '#e33e7a', eye: '#ffffff', slowResist: 0.5 },
};
export const WAVE_HP_SCALE = 1.15;

// What wave n sends, in spawn order: [kind, count] groups.
export function waveComposition(n) {
  const groups = [['wisp', 5 + 2 * n]];
  if (n >= 2) groups.push(['gloom', 2 + n]);
  if (n >= 3) groups.push(['brute', Math.floor((n - 1) / 2)]);
  if (n === TOTAL_WAVES) groups.push(['dread', 1]);
  return groups;
}
export function waveSpawnInterval(n) {
  return Math.max(0.55, 0.9 - 0.04 * (n - 1));
}
export function waveClearBonus(n) {
  return 25 + 5 * n;
}
