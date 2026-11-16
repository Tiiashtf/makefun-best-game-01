// The wisps: what walks the path, how it moves, and what happens when it is hit, slowed
// or reaches the crystal. Enemies are pooled (no allocation after setup) and walk by
// distance along the path, so their position is always a pure function of that distance.
import { ENEMIES, PATH_POINTS, WAVE_HP_SCALE } from './config.js';

const POOL_SIZE = 48;

// Cumulative path lengths, so a distance along the path maps to an (x, y).
const segments = [];
let pathLength = 0;
for (let index = 0; index < PATH_POINTS.length - 1; index += 1) {
  const a = PATH_POINTS[index];
  const b = PATH_POINTS[index + 1];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  segments.push({ a, b, start: pathLength, length });
  pathLength += length;
}

export function pathPosition(distance, out) {
  let d = Math.min(distance, pathLength);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (d <= segment.start + segment.length || index === segments.length - 1) {
      const t = segment.length === 0 ? 0 : Math.min(1, Math.max(0, (d - segment.start) / segment.length));
      out.x = segment.a.x + (segment.b.x - segment.a.x) * t;
      out.y = segment.a.y + (segment.b.y - segment.a.y) * t;
      return out;
    }
  }
  return out;
}

export function pathTotalLength() {
  return pathLength;
}

export function createEnemies() {
  const pool = [];
  let wobbleSeed = 0;
  for (let index = 0; index < POOL_SIZE; index += 1) {
    pool.push({
      active: false, kind: 'wisp', x: 0, y: 0, dist: 0, hp: 1, maxHp: 1,
      speed: 0, slowFactor: 1, slowLeft: 0, flash: 0, wobble: 0, reward: 0, leak: 1,
    });
  }

  function spawn(kind, wave) {
    for (let index = 0; index < pool.length; index += 1) {
      const enemy = pool[index];
      if (enemy.active) continue;
      const def = ENEMIES[kind];
      enemy.active = true;
      enemy.kind = kind;
      enemy.dist = 0;
      enemy.maxHp = Math.round(def.hp * WAVE_HP_SCALE ** (wave - 1));
      enemy.hp = enemy.maxHp;
      enemy.speed = def.speed;
      enemy.slowFactor = 1;
      enemy.slowLeft = 0;
      enemy.flash = 0;
      // Deterministic wobble phase (no Math.random): the bob is visual only, but a
      // seeded phase keeps staged screenshots identical run to run.
      wobbleSeed += 1;
      enemy.wobble = (wobbleSeed * 2.39996) % (Math.PI * 2);
      enemy.reward = def.reward;
      enemy.leak = def.leak;
      pathPosition(0, enemy);
      return enemy;
    }
    return null;
  }

  function damage(enemy, amount) {
    if (!enemy.active) return false;
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (enemy.hp <= 0) {
      enemy.active = false;
      return true;
    }
    return false;
  }

  function slow(enemy, factor, time) {
    if (!enemy.active) return;
    const def = ENEMIES[enemy.kind];
    const resist = def.slowResist ?? 1;
    const effective = 1 - (1 - factor) * resist;
    if (effective < enemy.slowFactor) enemy.slowFactor = effective;
    enemy.slowLeft = Math.max(enemy.slowLeft, time);
  }

  // Advance every live enemy; returns the ones that reached the crystal this step.
  function step(dt, reached) {
    for (let index = 0; index < pool.length; index += 1) {
      const enemy = pool[index];
      if (!enemy.active) continue;
      if (enemy.slowLeft > 0) {
        enemy.slowLeft -= dt;
        if (enemy.slowLeft <= 0) enemy.slowFactor = 1;
      }
      if (enemy.flash > 0) enemy.flash -= dt;
      enemy.wobble += dt * 6;
      enemy.dist += enemy.speed * enemy.slowFactor * dt;
      pathPosition(enemy.dist, enemy);
      if (enemy.dist >= pathLength) {
        enemy.active = false;
        reached.push(enemy);
      }
    }
  }

  function reset() {
    for (const enemy of pool) enemy.active = false;
  }

  function count() {
    let total = 0;
    for (const enemy of pool) if (enemy.active) total += 1;
    return total;
  }

  return { pool, spawn, damage, slow, step, reset, count };
}
