// Everything the player sees, and nothing else: the garden, the path, the crystal, the
// towers, the wisps, the particles and the HUD, plus the title, pause, victory and defeat
// screens. The renderer never changes the world; it reads state and ui and paints.
// All hit areas the main loop needs are exposed through layout(): the top-bar buttons,
// the tower cards and the selection panel's buttons.
import { CRYSTAL, ENEMIES, FIELD, PADS, PAD_RADIUS, PATH_POINTS, PATH_WIDTH, TOWERS, TOWER_ORDER, towerStats } from './config.js';
import { pathPosition } from './enemies.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_WON = 4;

const TOP_BAR = { x: 0, y: 0, width: FIELD.width, height: 40 };
const BOTTOM_BAR = { x: 0, y: 556, width: FIELD.width, height: 44 };

// Deterministic stars and grass tufts (fixed seed, so every render agrees).
function seededPoints(count, width, height, seed) {
  let state = seed >>> 0;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    points.push({ x: (state / 4294967296) * width, y: (state / 4294967296) * height, r: 0.6 + ((state >>> 8) % 10) / 10 * 1.2 });
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  }
  return points;
}
const STARS = seededPoints(90, FIELD.width, 200, 424242);
const TUFTS = seededPoints(70, FIELD.width, FIELD.height, 777);

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function button(ctx, rect, label, enabled, hover) {
  ctx.save();
  ctx.fillStyle = !enabled ? '#3a3550' : hover ? '#4d6fb8' : '#35497e';
  ctx.strokeStyle = '#8fb0ff';
  ctx.lineWidth = 1.5;
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = enabled ? '#ffffff' : '#9a94b5';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
  ctx.restore();
}

function hitTest(rect, point) {
  return point && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scale = { x: 1, y: 1 };
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = FIELD.width * dpr;
    canvas.height = FIELD.height * dpr;
    scale.x = canvas.width / FIELD.width;
    scale.y = canvas.height / FIELD.height;
  }
  resize();
  window.addEventListener('resize', resize);

  // The hit areas, rebuilt every frame from the same numbers the drawing uses.
  function layout(state, ui) {
    const topButtons = [];
    let x = FIELD.width - 12;
    const defs = [
      { id: 'mute', label: ui.muted ? 'Sound: off' : 'Sound: on', width: 96 },
      { id: 'speed', label: ui.speed === 2 ? 'Speed: 2x' : 'Speed: 1x', width: 92 },
      { id: 'pause', label: 'Pause (P)', width: 86 },
      { id: 'wave', label: state.phase === 'build' ? `Start wave ${state.wave + 1} (Space)` : `Wave ${state.wave}/10`, width: 168 },
    ];
    for (const def of defs) {
      x -= def.width;
      topButtons.push({ id: def.id, label: def.label, rect: { x, y: 6, width: def.width, height: 28 }, enabled: def.id !== 'wave' || state.phase === 'build' });
      x -= 8;
    }
    const cards = TOWER_ORDER.map((kind, index) => {
      const def = TOWERS[kind];
      return {
        kind, rect: { x: 12 + index * 236, y: 560, width: 224, height: 36 },
        label: `${def.name} — ${def.cost}g  [${def.key}]`,
      };
    });
    let panel = null;
    if (ui.selectedPad >= 0) {
      const pad = PADS[ui.selectedPad];
      const tower = ui.towerAtPad ? ui.towerAtPad(ui.selectedPad) : null;
      const width = 236;
      const height = tower ? 168 : 196;
      let px = pad.x + PAD_RADIUS + 12;
      if (px + width > FIELD.width - 8) px = pad.x - PAD_RADIUS - 12 - width;
      let py = pad.y - height / 2;
      py = Math.max(TOP_BAR.height + 6, Math.min(FIELD.height - BOTTOM_BAR.height - 6 - height, py));
      const buttons = [];
      if (tower) {
        const stats = towerStats(tower.kind, tower.level);
        const upCost = TOWERS[tower.kind].upgradeCost(tower.level);
        buttons.push({ id: 'upgrade', rect: { x: px + 12, y: py + height - 68, width: width - 24, height: 26 }, label: tower.level >= 3 ? 'Max level' : `Upgrade — ${upCost}g (U)`, enabled: tower.level < 3 });
        buttons.push({ id: 'sell', rect: { x: px + 12, y: py + height - 36, width: width - 24, height: 26 }, label: `Sell — +${Math.round(tower.invested * 0.7)}g (X)`, enabled: true });
      } else {
        TOWER_ORDER.forEach((kind, index) => {
          const def = TOWERS[kind];
          buttons.push({ id: `build-${kind}`, rect: { x: px + 12, y: py + 34 + index * 44, width: width - 24, height: 38 }, label: `${def.name} — ${def.cost}g`, enabled: true });
        });
      }
      panel = { x: px, y: py, width, height, tower, buttons };
    }
    const overButtons = [];
    if (ui.screen === SCREEN_OVER || ui.screen === SCREEN_WON) {
      overButtons.push({ id: 'again', rect: { x: FIELD.width / 2 - 110, y: 398, width: 220, height: 40 }, label: 'Play again (R)', enabled: true });
    }
    return { topButtons, cards, panel, overButtons };
  }

  function drawBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, '#171233');
    gradient.addColorStop(0.55, '#1d1840');
    gradient.addColorStop(1, '#241a33');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const star of STARS) {
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(time * 0.7 + star.x));
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(120,200,140,0.16)';
    ctx.lineWidth = 2;
    for (const tuft of TUFTS) {
      ctx.beginPath();
      ctx.moveTo(tuft.x, tuft.y);
      ctx.lineTo(tuft.x - 3, tuft.y - 6);
      ctx.moveTo(tuft.x + 2, tuft.y);
      ctx.lineTo(tuft.x + 5, tuft.y - 6);
      ctx.stroke();
    }
  }

  function drawPath() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5d4f38';
    ctx.lineWidth = PATH_WIDTH + 6;
    ctx.beginPath();
    PATH_POINTS.forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
    ctx.stroke();
    ctx.strokeStyle = '#c9b18a';
    ctx.lineWidth = PATH_WIDTH;
    ctx.stroke();
    // Stone seams across the path.
    ctx.strokeStyle = 'rgba(93,79,56,0.55)';
    ctx.lineWidth = 2;
    for (let d = 40; d < 1400; d += 46) {
      const point = pathPosition(d, { x: 0, y: 0 });
      const next = pathPosition(d + 2, { x: 0, y: 0 });
      const angle = Math.atan2(next.y - point.y, next.x - point.x) + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(point.x - Math.cos(angle) * PATH_WIDTH / 2, point.y - Math.sin(angle) * PATH_WIDTH / 2);
      ctx.lineTo(point.x + Math.cos(angle) * PATH_WIDTH / 2, point.y + Math.sin(angle) * PATH_WIDTH / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrystal(state, time) {
    const pulse = 1 + 0.06 * Math.sin(time * 2.2);
    const glow = ctx.createRadialGradient(CRYSTAL.x, CRYSTAL.y, 4, CRYSTAL.x, CRYSTAL.y, 86 * pulse);
    const flash = state.crystalFlash > 0;
    glow.addColorStop(0, flash ? 'rgba(255,90,90,0.85)' : 'rgba(140,240,255,0.8)');
    glow.addColorStop(0.5, flash ? 'rgba(255,90,90,0.18)' : 'rgba(90,180,255,0.22)');
    glow.addColorStop(1, 'rgba(90,180,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(CRYSTAL.x, CRYSTAL.y, 86 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // The crystal: a faceted diamond on a stone plinth.
    ctx.fillStyle = '#3d3458';
    ctx.beginPath();
    ctx.arc(CRYSTAL.x, CRYSTAL.y + 16, CRYSTAL.radius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8f86ad';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flash ? '#ff7a7a' : '#8ff0ff';
    ctx.beginPath();
    ctx.moveTo(CRYSTAL.x, CRYSTAL.y - 30 * pulse);
    ctx.lineTo(CRYSTAL.x + 20, CRYSTAL.y - 2);
    ctx.lineTo(CRYSTAL.x, CRYSTAL.y + 26);
    ctx.lineTo(CRYSTAL.x - 20, CRYSTAL.y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(CRYSTAL.x, CRYSTAL.y - 30 * pulse);
    ctx.lineTo(CRYSTAL.x + 8, CRYSTAL.y - 4);
    ctx.lineTo(CRYSTAL.x, CRYSTAL.y + 8);
    ctx.lineTo(CRYSTAL.x - 8, CRYSTAL.y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CRYSTAL', CRYSTAL.x, CRYSTAL.y + 46);
  }

  function drawPads(world, ui, areas) {
    for (let index = 0; index < PADS.length; index += 1) {
      const pad = PADS[index];
      const tower = world.towers.towerAtPad(index);
      const selected = ui.selectedPad === index;
      const hovered = ui.hoverPad === index;
      ctx.save();
      ctx.fillStyle = tower ? '#4a4364' : '#5b5478';
      ctx.strokeStyle = selected ? '#ffd94a' : hovered ? '#8fb0ff' : '#7d76a0';
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, PAD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!tower) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, PAD_RADIUS - 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', pad.x, pad.y + 1);
      }
      ctx.restore();
    }
    // Range preview for the pad under the mouse or the selected pad.
    const focus = ui.selectedPad >= 0 ? ui.selectedPad : ui.hoverPad;
    if (focus >= 0 && focus < PADS.length) {
      const kind = ui.chosenKind || (world.towers.towerAtPad(focus) ? world.towers.towerAtPad(focus).kind : null);
      if (kind) {
        const tower = world.towers.towerAtPad(focus);
        const level = tower ? tower.level : 1;
        const range = towerStats(kind, level).range;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(PADS[focus].x, PADS[focus].y, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    void areas;
  }

  function drawTower(tower) {
    const pad = PADS[tower.pad];
    const def = TOWERS[tower.kind];
    const x = pad.x;
    const y = pad.y;
    ctx.save();
    // Base.
    ctx.fillStyle = '#2e2a45';
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Barrel / head, aimed along tower.angle.
    ctx.translate(x, y - 6);
    ctx.rotate(tower.angle + Math.PI / 2);
    ctx.fillStyle = def.dark;
    ctx.fillRect(-4, -16, 8, 20);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, -14, tower.kind === 'cannon' ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (tower.flash > 0) {
      ctx.save();
      ctx.globalAlpha = tower.flash / 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y - 20, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Level pips.
    ctx.fillStyle = '#ffd94a';
    for (let level = 0; level < tower.level; level += 1) {
      ctx.beginPath();
      ctx.arc(x - 8 + level * 8, y + 15, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemy(enemy, time) {
    const def = ENEMIES[enemy.kind];
    const bob = Math.sin(enemy.wobble) * 2;
    const x = enemy.x;
    const y = enemy.y + bob;
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 2, x, y, def.radius + 10);
    glow.addColorStop(0, def.color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, def.radius + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = enemy.flash > 0 ? '#ffffff' : def.color;
    ctx.beginPath();
    ctx.arc(x, y, def.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (enemy.kind === 'dread') {
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.moveTo(x - 14, y - def.radius + 2);
      ctx.lineTo(x - 7, y - def.radius - 10);
      ctx.lineTo(x, y - def.radius + 2);
      ctx.lineTo(x + 7, y - def.radius - 10);
      ctx.lineTo(x + 14, y - def.radius + 2);
      ctx.closePath();
      ctx.fill();
    }
    // Eyes, looking along the path.
    ctx.fillStyle = def.eye;
    ctx.beginPath();
    ctx.arc(x - def.radius * 0.35, y - 2, 2.6, 0, Math.PI * 2);
    ctx.arc(x + def.radius * 0.35, y - 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath();
    ctx.arc(x - def.radius * 0.35 + 1, y - 2, 1.2, 0, Math.PI * 2);
    ctx.arc(x + def.radius * 0.35 + 1, y - 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.slowLeft > 0) {
      ctx.strokeStyle = '#7fe3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, def.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.hp < enemy.maxHp) {
      const width = def.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - width / 2, y - def.radius - 10, width, 4);
      ctx.fillStyle = enemy.hp / enemy.maxHp > 0.35 ? '#7dff8a' : '#ff5c5c';
      ctx.fillRect(x - width / 2, y - def.radius - 10, width * (enemy.hp / enemy.maxHp), 4);
    }
    ctx.restore();
  }

  function drawProjectiles(world) {
    for (const shot of world.towers.projectiles) {
      if (!shot.active) continue;
      ctx.save();
      if (shot.kind === 'cannon') {
        ctx.fillStyle = '#ff8a5c';
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd94a';
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (shot.kind === 'frost') {
        ctx.strokeStyle = '#7fe3ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(shot.x - 5, shot.y - 5);
        ctx.lineTo(shot.x + 5, shot.y + 5);
        ctx.moveTo(shot.x + 5, shot.y - 5);
        ctx.lineTo(shot.x - 5, shot.y + 5);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#ffd94a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shot.x, shot.y);
        ctx.lineTo(shot.x - (shot.tx - shot.x) * 0.03, shot.y - (shot.ty - shot.y) * 0.03);
        ctx.stroke();
        ctx.fillStyle = '#fff6c9';
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const particle of world.towers.particles) {
      if (!particle.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const item of world.towers.floaters) {
      if (!item.active) continue;
      ctx.globalAlpha = Math.max(0, item.life);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.restore();
  }

  function drawHud(state, ui, areas) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,24,0.85)';
    ctx.fillRect(TOP_BAR.x, TOP_BAR.y, TOP_BAR.width, TOP_BAR.height);
    ctx.fillStyle = 'rgba(10,8,24,0.85)';
    ctx.fillRect(BOTTOM_BAR.x, BOTTOM_BAR.y, BOTTOM_BAR.width, BOTTOM_BAR.height);
    ctx.strokeStyle = 'rgba(143,134,173,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, TOP_BAR.height + 0.5);
    ctx.lineTo(FIELD.width, TOP_BAR.height + 0.5);
    ctx.moveTo(0, BOTTOM_BAR.y + 0.5);
    ctx.lineTo(FIELD.width, BOTTOM_BAR.y + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('●', 12, 21);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${state.gold} gold`, 30, 21);
    ctx.fillText(`Wave ${Math.min(state.wave, 10)}/10`, 140, 21);
    // Core health bar.
    ctx.fillStyle = '#ff5c7a';
    ctx.fillText('♥', 232, 21);
    ctx.fillStyle = '#33284f';
    roundRect(ctx, 252, 12, 110, 16, 8);
    ctx.fill();
    ctx.fillStyle = state.coreHp > 7 ? '#7dff8a' : '#ff5c5c';
    const hpWidth = Math.max(0, 110 * (state.coreHp / 20));
    if (hpWidth > 0) {
      roundRect(ctx, 252, 12, hpWidth, 16, 8);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.coreHp}/20`, 307, 21);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score ${state.score}`, 384, 21);
    ctx.fillText(`Kills ${state.kills}`, 500, 21);

    for (const btn of areas.topButtons) {
      button(ctx, btn.rect, btn.label, btn.enabled, ui.mouse && hitTest(btn.rect, ui.mouse));
    }

    // Tower cards.
    for (const card of areas.cards) {
      const def = TOWERS[card.kind];
      const selected = ui.chosenKind === card.kind;
      ctx.save();
      ctx.fillStyle = selected ? '#3d5a9e' : '#2a2547';
      ctx.strokeStyle = selected ? '#ffd94a' : def.color;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      roundRect(ctx, card.rect.x, card.rect.y, card.rect.width, card.rect.height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(card.rect.x + 16, card.rect.y + 18, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(card.label, card.rect.x + 30, card.rect.y + 13);
      ctx.fillStyle = '#b9b3d6';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(def.blurb, card.rect.x + 30, card.rect.y + 29);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPanel(state, ui, areas) {
    const panel = areas.panel;
    if (!panel) return;
    ctx.save();
    ctx.fillStyle = 'rgba(12,10,28,0.95)';
    ctx.strokeStyle = '#8fb0ff';
    ctx.lineWidth = 1.5;
    roundRect(ctx, panel.x, panel.y, panel.width, panel.height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (panel.tower) {
      const tower = panel.tower;
      const def = TOWERS[tower.kind];
      const stats = towerStats(tower.kind, tower.level);
      ctx.fillText(`${def.name} — Lv ${tower.level}`, panel.x + 12, panel.y + 22);
      ctx.fillStyle = '#b9b3d6';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`Damage ${stats.damage}  ·  Range ${stats.range}`, panel.x + 12, panel.y + 42);
      ctx.fillText(`Rate ${stats.rate.toFixed(1)}/s${stats.splash ? `  ·  Splash ${stats.splash}` : ''}${stats.slowTime ? `  ·  Slow ${Math.round((1 - stats.slowFactor) * 100)}%` : ''}`, panel.x + 12, panel.y + 60);
      ctx.fillText(`Invested ${tower.invested}g`, panel.x + 12, panel.y + 78);
    } else {
      ctx.fillText('Build here', panel.x + 12, panel.y + 22);
      ctx.fillStyle = '#b9b3d6';
      ctx.font = '12px system-ui, sans-serif';
      for (let index = 0; index < TOWER_ORDER.length; index += 1) {
        const def = TOWERS[TOWER_ORDER[index]];
        ctx.fillText(def.blurb, panel.x + 12, panel.y + 34 + index * 44 + 30);
      }
    }
    for (const btn of panel.buttons) {
      const affordable = btn.id.startsWith('build-') ? state.gold >= TOWERS[btn.id.slice(6)].cost : btn.enabled;
      button(ctx, btn.rect, btn.label, affordable && btn.enabled, ui.mouse && hitTest(btn.rect, ui.mouse));
    }
    ctx.restore();
  }

  function drawBanner(state) {
    if (state.phase !== 'build' || state.wave >= 10) return;
    ctx.save();
    ctx.fillStyle = 'rgba(12,10,28,0.8)';
    roundRect(ctx, FIELD.width / 2 - 250, 52, 500, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.wave === 0 ? 'Build your towers, then press Space to start wave 1' : `Wave ${state.wave} cleared! Build, then press Space for wave ${state.wave + 1}`, FIELD.width / 2, 68);
    ctx.restore();
  }

  function overlayPanel(title, lines, accent) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,20,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = 'rgba(16,13,34,0.97)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, FIELD.width / 2 - 260, 130, 520, 300, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, FIELD.width / 2, 196);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui, sans-serif';
    lines.forEach((line, index) => ctx.fillText(line, FIELD.width / 2, 244 + index * 28));
    ctx.restore();
  }

  function draw(world, screen, ui) {
    const state = world.state;
    ctx.save();
    ctx.setTransform(scale.x, 0, 0, scale.y, 0, 0);
    const shake = state.shake;
    if (shake > 0) {
      const time = state.time;
      ctx.translate(Math.sin(time * 47) * shake * 7, Math.cos(time * 39) * shake * 7);
    }
    drawBackground(state.time);
    drawPath();
    drawCrystal(state, state.time);
    const areas = layout(state, ui);
    drawPads(world, ui, areas);
    for (const tower of world.towers.towers) if (tower.active) drawTower(tower);
    for (const enemy of world.enemies.pool) if (enemy.active) drawEnemy(enemy, state.time);
    drawProjectiles(world);
    drawHud(state, ui, areas);
    drawPanel(state, ui, areas);
    if (screen === SCREEN_PLAY) drawBanner(state);

    if (screen === SCREEN_TITLE) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,6,20,0.62)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GLOWKEEP', FIELD.width / 2, 190);
      ctx.fillStyle = '#8ff0ff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('Defend the crystal through 10 waves of shadow wisps', FIELD.width / 2, 232);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Click a stone pad to build a tower · 1 / 2 / 3 pick a tower · Space starts a wave', FIELD.width / 2, 300);
      ctx.fillText('Click a tower to upgrade or sell it · P pauses · F speeds up · M mutes', FIELD.width / 2, 326);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 18px system-ui, sans-serif';
      if (ui.best > 0) ctx.fillText(`Best score: ${ui.best}`, FIELD.width / 2, 372);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('Click or press Space to begin', FIELD.width / 2, 420);
      ctx.restore();
    } else if (screen === SCREEN_PAUSED) {
      overlayPanel('PAUSED', ['Press P to keep playing', 'Press R to restart from wave 1'], '#8fb0ff');
    } else if (screen === SCREEN_WON) {
      overlayPanel('VICTORY!', [
        'The crystal shines on — all 10 waves are beaten.',
        `Score ${state.score}  ·  Kills ${state.kills}  ·  Best ${Math.max(ui.best, state.score)}`,
        `Gold earned ${state.goldEarned}`,
      ], '#ffd94a');
      for (const btn of areas.overButtons) button(ctx, btn.rect, btn.label, true, ui.mouse && hitTest(btn.rect, ui.mouse));
    } else if (screen === SCREEN_OVER) {
      overlayPanel('THE CRYSTAL FALLS', [
        `The wisps broke through on wave ${state.wave} of 10.`,
        `Score ${state.score}  ·  Kills ${state.kills}  ·  Best ${Math.max(ui.best, state.score)}`,
        'Build closer to the path next time — and mind the brutes.',
      ], '#ff5c7a');
      for (const btn of areas.overButtons) button(ctx, btn.rect, btn.label, true, ui.mouse && hitTest(btn.rect, ui.mouse));
    }
    ctx.restore();
    return areas;
  }

  return { draw, layout, hitTest };
}
