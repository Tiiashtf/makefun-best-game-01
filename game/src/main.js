// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, victory and defeat.
//
// ?seed=N fixes the random pattern. ?shot=start|play|win|end (with &seed=N) stages that
// scene instead of starting fresh, paints it twice and sets window.__shotReady for a
// screenshot — then hands control to the normal loop, so the staged screen is playable.
//
// window.__game is a small read-only handle for testing: the world state, the screen,
// and the same actions the buttons take.
import { BEST_KEY, PADS, STEP, TOWERS, TOWER_ORDER } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOOM, EVENT_KILL, EVENT_LEAK, EVENT_LOSE, EVENT_SHOT, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ESCAPE, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART,
  ACTION_SELL, ACTION_SPEED, ACTION_TOWER_1, ACTION_TOWER_2, ACTION_TOWER_3,
  ACTION_UPGRADE, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runGame(initialScreen) {
  const input = createInput(canvas);
  let screen = initialScreen;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let speed = 1;
  let selectedPad = -1;
  let chosenKind = null;
  let areas = null;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    selectedPad = -1;
    chosenKind = null;
    screen = SCREEN_PLAY;
    announce('Playing. Build towers, then press Space to start wave 1.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WON : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory! Score ${world.state.score}.` : `Defeat on wave ${world.state.wave}. Score ${world.state.score}.`);
  }

  function padAt(point) {
    for (let index = 0; index < PADS.length; index += 1) {
      const pad = PADS[index];
      const dx = point.x - pad.x;
      const dy = point.y - pad.y;
      if (dx * dx + dy * dy <= 28 * 28) return index;
    }
    return -1;
  }

  function handleClick(point) {
    audio.unlock();
    if (screen === SCREEN_TITLE) {
      audio.click();
      startGame();
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WON) {
      if (areas && areas.overButtons.some((btn) => renderer.hitTest(btn.rect, point))) {
        audio.click();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_PAUSED) return;
    // Top-bar buttons.
    if (areas) {
      for (const btn of areas.topButtons) {
        if (!renderer.hitTest(btn.rect, point)) continue;
        if (btn.id === 'wave' && btn.enabled) {
          if (world.startWave()) { audio.horn(); announce(`Wave ${world.state.wave} begins.`); }
        } else if (btn.id === 'speed') {
          speed = speed === 1 ? 2 : 1;
          audio.click();
        } else if (btn.id === 'pause') {
          screen = SCREEN_PAUSED;
          announce('Paused.');
        } else if (btn.id === 'mute') {
          audio.toggleMute();
        }
        return;
      }
      // Tower cards: pick a kind, then a pad to build it on.
      for (const card of areas.cards) {
        if (renderer.hitTest(card.rect, point)) {
          chosenKind = chosenKind === card.kind ? null : card.kind;
          audio.click();
          return;
        }
      }
      // Selection panel buttons.
      if (areas.panel) {
        for (const btn of areas.panel.buttons) {
          if (!renderer.hitTest(btn.rect, point)) continue;
          if (btn.id === 'upgrade' && world.upgradeTower(selectedPad)) { audio.upgrade(); announce('Tower upgraded.'); }
          else if (btn.id === 'sell' && world.sellTower(selectedPad)) { audio.click(); selectedPad = -1; }
          else if (btn.id.startsWith('build-')) {
            const kind = btn.id.slice(6);
            if (world.buildTower(selectedPad, kind)) { audio.build(); selectedPad = -1; chosenKind = null; }
          }
          return;
        }
      }
    }
    // Pads: select, or build the chosen kind straight away.
    const padIndex = padAt(point);
    if (padIndex >= 0) {
      if (chosenKind && !world.towers.towerAtPad(padIndex)) {
        if (world.buildTower(padIndex, chosenKind)) {
          audio.build();
          chosenKind = null;
          selectedPad = -1;
        } else {
          announce('Not enough gold for that tower.');
        }
      } else {
        selectedPad = selectedPad === padIndex ? -1 : padIndex;
        audio.click();
      }
      return;
    }
    selectedPad = -1;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions) audio.unlock();
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (actions & ACTION_SPEED && screen === SCREEN_PLAY) speed = speed === 1 ? 2 : 1;
    if (actions & ACTION_ESCAPE) {
      selectedPad = -1;
      chosenKind = null;
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      audio.click();
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) {
        audio.click();
        startGame();
        return;
      }
      if (screen === SCREEN_PLAY && world.state.phase === 'build') {
        if (world.startWave()) { audio.horn(); announce(`Wave ${world.state.wave} begins.`); }
        return;
      }
      if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
        return;
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_TOWER_1) chosenKind = chosenKind === 'spark' ? null : 'spark';
      else if (actions & ACTION_TOWER_2) chosenKind = chosenKind === 'frost' ? null : 'frost';
      else if (actions & ACTION_TOWER_3) chosenKind = chosenKind === 'cannon' ? null : 'cannon';
      if (actions & ACTION_UPGRADE && selectedPad >= 0 && world.upgradeTower(selectedPad)) audio.upgrade();
      if (actions & ACTION_SELL && selectedPad >= 0 && world.sellTower(selectedPad)) selectedPad = -1;
    }
  }

  function hoverPad() {
    if (!input.mouse.inside) return -1;
    return padAt(input.mouse);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, false);
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_SHOT) audio.shoot('spark');
    if (events & EVENT_BOOM) audio.cannonBoom();
    if (events & EVENT_LEAK) audio.leak();
    if (events & EVENT_WAVE_CLEAR) {
      audio.coin();
      announce(`Wave ${world.state.wave} cleared! Build, then start wave ${world.state.wave + 1}.`);
    }
    if (events & EVENT_WIN) {
      audio.victory();
      endGame(true);
    } else if (events & EVENT_LOSE) {
      audio.defeat();
      endGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME) * speed;
    last = now;
    handleActions();
    for (const click of input.takeClicks()) handleClick(click);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const ui = {
      screen, best, muted: audio.isMuted(), speed, selectedPad, chosenKind,
      hoverPad: hoverPad(), mouse: input.mouse,
      towerAtPad: (index) => world.towers.towerAtPad(index),
    };
    areas = renderer.draw(world, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting wisps walk unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  if (screen === SCREEN_TITLE) announce('Glowkeep. Press Space or click to start.');
  window.__game = {
    state: world.state,
    get screen() { return screen; },
    get speed() { return speed; },
    get enemyCount() { return world.enemies.count(); },
    towerAtPad: (index) => world.towers.towerAtPad(index),
    startGame, startWave: () => world.startWave(),
    buildTower: (pad, kind) => world.buildTower(pad, kind),
    selectedPad: () => selectedPad,
    setSelectedPad: (index) => { selectedPad = index; },
  };
  requestAnimationFrame(frame);
}

if (shot) {
  const scene = stageShot(shot, world);
  let painted = 0;
  function paint() {
    const ui = {
      screen: scene.screen, best: readBest(), muted: false, speed: 1,
      selectedPad: -1, chosenKind: null, hoverPad: -1, mouse: { x: -1, y: -1, inside: false },
      towerAtPad: (index) => world.towers.towerAtPad(index),
    };
    renderer.draw(world, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      runGame(scene.screen);
    }
  }
  requestAnimationFrame(paint);
} else {
  runGame(SCREEN_TITLE);
}
