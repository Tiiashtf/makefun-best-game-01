// Mouse and keyboard, translated into the game's logical field: the canvas is scaled to
// fit the window, so a click's client position is mapped back into field coordinates.
// Clicks are queued (taken once, in order) and keys are reported as pressed-this-frame
// actions, so the loop never misses a fast tap.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_SPEED = 16;
export const ACTION_TOWER_1 = 32;
export const ACTION_TOWER_2 = 64;
export const ACTION_TOWER_3 = 128;
export const ACTION_UPGRADE = 256;
export const ACTION_SELL = 512;
export const ACTION_ESCAPE = 1024;

const KEY_ACTIONS = {
  ' ': ACTION_CONFIRM, Enter: ACTION_CONFIRM,
  p: ACTION_PAUSE, P: ACTION_PAUSE,
  r: ACTION_RESTART, R: ACTION_RESTART,
  m: ACTION_MUTE, M: ACTION_MUTE,
  f: ACTION_SPEED, F: ACTION_SPEED,
  1: ACTION_TOWER_1, 2: ACTION_TOWER_2, 3: ACTION_TOWER_3,
  u: ACTION_UPGRADE, U: ACTION_UPGRADE,
  x: ACTION_SELL, X: ACTION_SELL,
  Escape: ACTION_ESCAPE,
};

export function createInput(canvas) {
  let actions = 0;
  const clicks = [];
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 2, inside: false };

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  canvas.addEventListener('pointermove', (event) => {
    const point = toField(event);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.inside = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    clicks.push(toField(event));
  });
  canvas.addEventListener('pointerleave', () => { mouse.inside = false; });
  window.addEventListener('keydown', (event) => {
    const action = KEY_ACTIONS[event.key];
    if (action) {
      actions |= action;
      event.preventDefault();
    }
  });

  return {
    mouse,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
  };
}
