// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// that builds towers from a priority list and starts each wave when it is ready, so the
// frame is what a real game looks like and the same seed always gives the same frame.
import { STEP, TOWERS } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 42;
const LIMIT_SECONDS = 900;

// The autopilot's build order: [padIndex, kind] to build when affordable, then upgrades.
const BUILD_PLAN = [
  [1, 'spark'], [5, 'frost'], [6, 'cannon'], [2, 'spark'], [0, 'frost'], [4, 'spark'],
  [7, 'cannon'], [10, 'spark'], [9, 'frost'], [3, 'spark'], [8, 'cannon'], [11, 'spark'],
];
const UPGRADE_PLAN = [1, 6, 1, 5, 6, 2, 0, 4, 7, 10, 5, 2, 6, 0, 9, 3, 8, 11, 4, 7];

/** Build one tower from the plan if affordable; returns the cost of the next planned
 *  item (null when the build plan is done). Upgrades run after the builds. */
function autopilot(world) {
  const state = world.state;
  for (const [pad, kind] of BUILD_PLAN) {
    if (world.towers.towerAtPad(pad)) continue;
    world.buildTower(pad, kind);
    return TOWERS[kind].cost;
  }
  for (const pad of UPGRADE_PLAN) {
    const tower = world.towers.towerAtPad(pad);
    if (!tower || tower.level >= 3) continue;
    const cost = TOWERS[tower.kind].upgradeCost(tower.level);
    world.upgradeTower(pad);
    return cost;
  }
  return null;
}

/** Start the next wave whenever the build phase is open and nothing more is affordable. */
function maybeStartWave(world) {
  const state = world.state;
  if (state.phase !== 'build') return;
  const nextCost = autopilot(world);
  if (nextCost === null || state.gold < nextCost) world.startWave();
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is start)
 * and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, true);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'end') {
    // No towers at all: the wisps walk straight through and the crystal falls.
    for (let index = 0; index < LIMIT_SECONDS / STEP; index += 1) {
      if (world.state.phase === 'build') world.startWave();
      world.step(STEP, false);
      if (world.state.phase === 'over') break;
    }
    return { screen: SCREEN_OVER };
  }
  if (name === 'win') {
    for (let index = 0; index < LIMIT_SECONDS / STEP; index += 1) {
      maybeStartWave(world);
      world.step(STEP, false);
      if (world.state.phase === 'won' || world.state.phase === 'over') break;
    }
    return { screen: world.state.phase === 'won' ? SCREEN_WON : SCREEN_OVER };
  }
  // Play: a real mid-game frame — three towers up, wave 2 in progress.
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    maybeStartWave(world);
    world.step(STEP, false);
    if (world.state.phase === 'over' || world.state.phase === 'won') break;
  }
  return { screen: SCREEN_PLAY };
}
