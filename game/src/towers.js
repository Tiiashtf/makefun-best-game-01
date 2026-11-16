// The towers: what stands on a pad, how it picks a target, and the projectiles, particles
// and floating gold text its shots leave behind. Towers are pooled too; projectiles home
// on their target and fizzle if it is already gone.
import { PADS, TOWERS, towerStats } from './config.js';

const TOWER_POOL = 12;
const PROJECTILE_POOL = 64;
const PARTICLE_POOL = 160;
const FLOATER_POOL = 24;

export function createTowers() {
  // A tiny deterministic random source for particle scatter (no Math.random): staged
  // screenshots must render identically run to run.
  let rngState = 987654321;
  function rand() {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 4294967296;
  }
  const towers = [];
  for (let index = 0; index < TOWER_POOL; index += 1) {
    towers.push({ active: false, pad: -1, kind: 'spark', level: 1, invested: 0, cooldown: 0, angle: -Math.PI / 2, flash: 0 });
  }
  const projectiles = [];
  for (let index = 0; index < PROJECTILE_POOL; index += 1) {
    projectiles.push({ active: false, kind: 'spark', x: 0, y: 0, tx: 0, ty: 0, target: null, speed: 0, damage: 0, splash: 0, slowFactor: 1, slowTime: 0 });
  }
  const particles = [];
  for (let index = 0; index < PARTICLE_POOL; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '#ffffff' });
  }
  const floaters = [];
  for (let index = 0; index < FLOATER_POOL; index += 1) {
    floaters.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffd94a' });
  }

  function spawnParticle(x, y, color, speed, life, size) {
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (particle.active) continue;
      const angle = rand() * Math.PI * 2;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - speed * 0.3;
      particle.life = life;
      particle.maxLife = life;
      particle.size = size;
      particle.color = color;
      return;
    }
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let index = 0; index < count; index += 1) spawnParticle(x, y, color, speed, life, size);
  }

  function floater(x, y, text, color) {
    for (let index = 0; index < floaters.length; index += 1) {
      const item = floaters[index];
      if (item.active) continue;
      item.active = true;
      item.x = x;
      item.y = y;
      item.life = 1;
      item.text = text;
      item.color = color || '#ffd94a';
      return;
    }
  }

  function place(padIndex, kind) {
    for (let index = 0; index < towers.length; index += 1) {
      const tower = towers[index];
      if (tower.active) continue;
      tower.active = true;
      tower.pad = padIndex;
      tower.kind = kind;
      tower.level = 1;
      tower.invested = TOWERS[kind].cost;
      tower.cooldown = 0;
      tower.angle = -Math.PI / 2;
      tower.flash = 0;
      return tower;
    }
    return null;
  }

  function towerAtPad(padIndex) {
    for (const tower of towers) if (tower.active && tower.pad === padIndex) return tower;
    return null;
  }

  function fireProjectile(tower, target, stats) {
    for (let index = 0; index < projectiles.length; index += 1) {
      const shot = projectiles[index];
      if (shot.active) continue;
      const pad = PADS[tower.pad];
      shot.active = true;
      shot.kind = tower.kind;
      shot.x = pad.x;
      shot.y = pad.y - 14;
      shot.target = target;
      shot.tx = target.x;
      shot.ty = target.y;
      shot.speed = tower.kind === 'cannon' ? 320 : 520;
      shot.damage = stats.damage;
      shot.splash = stats.splash;
      shot.slowFactor = stats.slowFactor;
      shot.slowTime = stats.slowTime;
      return;
    }
  }

  // One step of tower logic. `enemies` is the enemy pool; `events` collects what happened
  // ({ shots: [{kind}], kills, gold }) for the world to score and sound.
  function step(dt, enemies, events) {
    for (const tower of towers) {
      if (!tower.active) continue;
      if (tower.flash > 0) tower.flash -= dt;
      tower.cooldown -= dt;
      const pad = PADS[tower.pad];
      const stats = towerStats(tower.kind, tower.level);
      // Target: the live enemy furthest along the path inside range.
      let target = null;
      for (const enemy of enemies.pool) {
        if (!enemy.active) continue;
        const dx = enemy.x - pad.x;
        const dy = enemy.y - pad.y;
        if (dx * dx + dy * dy > stats.range * stats.range) continue;
        if (target === null || enemy.dist > target.dist) target = enemy;
      }
      if (target) tower.angle = Math.atan2(target.y - (pad.y - 14), target.x - pad.x);
      if (target && tower.cooldown <= 0) {
        tower.cooldown += 1 / stats.rate;
        tower.flash = 0.08;
        fireProjectile(tower, target, stats);
        events.shots.push(tower.kind);
      }
    }

    for (const shot of projectiles) {
      if (!shot.active) continue;
      if (shot.target && shot.target.active) {
        shot.tx = shot.target.x;
        shot.ty = shot.target.y;
      }
      const dx = shot.tx - shot.x;
      const dy = shot.ty - shot.y;
      const distance = Math.hypot(dx, dy);
      const travel = shot.speed * dt;
      if (distance <= Math.max(travel, 10)) {
        shot.active = false;
        if (shot.splash > 0) {
          burst(shot.tx, shot.ty, '#ff8a5c', 10, 120, 0.4, 3);
          events.booms.push({ x: shot.tx, y: shot.ty });
          for (const enemy of enemies.pool) {
            if (!enemy.active) continue;
            const ex = enemy.x - shot.tx;
            const ey = enemy.y - shot.ty;
            if (ex * ex + ey * ey > shot.splash * shot.splash) continue;
            if (enemies.damage(enemy, shot.damage)) events.kills.push(enemy);
          }
        } else if (shot.target && shot.target.active) {
          burst(shot.tx, shot.ty, shot.kind === 'frost' ? '#7fe3ff' : '#ffd94a', 4, 70, 0.3, 2.5);
          if (shot.slowTime > 0) enemies.slow(shot.target, shot.slowFactor, shot.slowTime);
          if (enemies.damage(shot.target, shot.damage)) events.kills.push(shot.target);
        }
      } else {
        shot.x += (dx / distance) * travel;
        shot.y += (dy / distance) * travel;
      }
    }

    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) { particle.active = false; continue; }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 160 * dt;
    }
    for (const item of floaters) {
      if (!item.active) continue;
      item.life -= dt * 0.8;
      item.y -= 26 * dt;
      if (item.life <= 0) item.active = false;
    }
  }

  function reset() {
    rngState = 987654321;
    for (const tower of towers) tower.active = false;
    for (const shot of projectiles) shot.active = false;
    for (const particle of particles) particle.active = false;
    for (const item of floaters) item.active = false;
  }

  return { towers, projectiles, particles, floaters, place, towerAtPad, burst, floater, step, reset };
}
