// The game's rules and state, with no drawing and no browser in it: gold, the core's
// health, the wave queue, the build phase, kills and score, and winning and losing.
// step() advances one fixed step and returns what happened as bit flags, so the caller
// can react (and sound) without the world knowing about screens.
import {
  CORE_HP, START_GOLD, TOTAL_WAVES, TOWERS,
  waveClearBonus, waveComposition, waveSpawnInterval,
} from './config.js';
import { createEnemies } from './enemies.js';
import { createTowers } from './towers.js';

export const EVENT_KILL = 1;
export const EVENT_LEAK = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_WIN = 8;
export const EVENT_LOSE = 16;
export const EVENT_SHOT = 32;
export const EVENT_BOOM = 64;

export function createWorld(random) {
  const enemies = createEnemies();
  const towers = createTowers();
  const reached = [];
  const state = {
    gold: START_GOLD, goldEarned: 0, coreHp: CORE_HP, wave: 0, score: 0, kills: 0,
    best: 0, phase: 'build', spawnQueue: [], spawnTimer: 0, spawnInterval: 0.9,
    toSpawn: 0, waveActive: false, time: 0, shake: 0, crystalFlash: 0,
  };

  function reset() {
    enemies.reset();
    towers.reset();
    state.gold = START_GOLD;
    state.goldEarned = 0;
    state.coreHp = CORE_HP;
    state.wave = 0;
    state.score = 0;
    state.kills = 0;
    state.phase = 'build';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.toSpawn = 0;
    state.waveActive = false;
    state.time = 0;
    state.shake = 0;
    state.crystalFlash = 0;
  }

  function recomputeScore() {
    state.score = state.goldEarned + state.kills * 5 + state.wave * 250;
  }

  function startWave() {
    if (state.phase !== 'build' || state.wave >= TOTAL_WAVES) return false;
    state.wave += 1;
    state.phase = 'wave';
    state.waveActive = true;
    state.spawnQueue = [];
    for (const [kind, count] of waveComposition(state.wave)) {
      for (let index = 0; index < count; index += 1) state.spawnQueue.push(kind);
    }
    // Shuffle the queue's order inside each group only lightly: keep the group's kind
    // order but vary the spawn gaps, so waves feel the same but not identical.
    state.spawnInterval = waveSpawnInterval(state.wave);
    state.spawnTimer = 0.6;
    state.toSpawn = state.spawnQueue.length;
    return true;
  }

  function buildTower(padIndex, kind) {
    if (towers.towerAtPad(padIndex)) return false;
    const cost = TOWERS[kind].cost;
    if (state.gold < cost) return false;
    if (!towers.place(padIndex, kind)) return false;
    state.gold -= cost;
    return true;
  }

  function upgradeTower(padIndex) {
    const tower = towers.towerAtPad(padIndex);
    if (!tower || tower.level >= 3) return false;
    const cost = TOWERS[tower.kind].upgradeCost(tower.level);
    if (state.gold < cost) return false;
    state.gold -= cost;
    tower.level += 1;
    tower.invested += cost;
    return true;
  }

  function sellTower(padIndex) {
    const tower = towers.towerAtPad(padIndex);
    if (!tower) return false;
    state.gold += Math.round(tower.invested * 0.7);
    tower.active = false;
    return true;
  }

  // One fixed step. `harmless` runs the title-screen backdrop: wisps drift but never
  // reach the crystal and never score.
  function step(dt, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.4);
    if (state.crystalFlash > 0) state.crystalFlash = Math.max(0, state.crystalFlash - dt);

    if (harmless) {
      if (state.spawnTimer <= 0 && enemies.count() < 6) {
        enemies.spawn(random() < 0.6 ? 'wisp' : 'gloom', 1);
        state.spawnTimer = 1.4 + random() * 1.2;
      }
      state.spawnTimer -= dt;
      enemies.step(dt, reached);
      reached.length = 0;
      towers.step(dt, enemies, { shots: [], kills: [], booms: [] });
      return 0;
    }

    if (state.phase === 'wave') {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const kind = state.spawnQueue.shift();
          enemies.spawn(kind, state.wave);
          state.spawnTimer = state.spawnInterval * (0.85 + random() * 0.3);
        }
      }
      const towerEvents = { shots: [], kills: [], booms: [] };
      towers.step(dt, enemies, towerEvents);
      if (towerEvents.shots.length > 0) events |= EVENT_SHOT;
      if (towerEvents.booms.length > 0) events |= EVENT_BOOM;
      for (const enemy of towerEvents.kills) {
        state.kills += 1;
        state.gold += enemy.reward;
        state.goldEarned += enemy.reward;
        towers.floater(enemy.x, enemy.y - 10, `+${enemy.reward}g`);
        towers.burst(enemy.x, enemy.y, '#b78cff', 8, 90, 0.4, 3);
        events |= EVENT_KILL;
      }
      recomputeScore();

      enemies.step(dt, reached);
      for (const enemy of reached) {
        state.coreHp -= enemy.leak;
        state.shake = 0.5;
        state.crystalFlash = 0.5;
        events |= EVENT_LEAK;
        if (state.coreHp <= 0) {
          state.coreHp = 0;
          state.phase = 'over';
          events |= EVENT_LOSE;
        }
      }
      reached.length = 0;
      if (state.phase === 'wave' && state.spawnQueue.length === 0 && enemies.count() === 0) {
        const bonus = waveClearBonus(state.wave);
        state.gold += bonus;
        state.goldEarned += bonus;
        state.waveActive = false;
        if (state.wave >= TOTAL_WAVES) {
          state.phase = 'won';
          events |= EVENT_WIN;
        } else {
          state.phase = 'build';
          events |= EVENT_WAVE_CLEAR;
        }
        recomputeScore();
      }
    } else {
      // Build phase: towers may still fire at nothing; just idle the visuals.
      towers.step(dt, enemies, { shots: [], kills: [], booms: [] });
    }
    return events;
  }

  reset();
  return { state, enemies, towers, reset, startWave, buildTower, upgradeTower, sellTower, step };
}
