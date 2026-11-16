# Glowkeep

A tower defense game for the make.fun best-game-01 bounty. Shadow wisps march along a
stone path toward the Ember Crystal at the heart of a night garden. Build towers on the
stone pads, stop all 10 waves, and keep the crystal shining.

## How to play

- **Click a stone pad** to build a tower there (or press `1` / `2` / `3` to pick a tower
  type first, then click a pad).
- **Three towers:** Spark Spire (fast bolts), Frost Spire (slows wisps), Ember Cannon
  (splash damage). Each can be upgraded twice.
- **Click a tower** to upgrade it or sell it back for 70% of what you spent.
- **Space** starts the next wave. **P** pauses, **F** toggles 2x speed, **M** mutes,
  **R** restarts, **Esc** deselects.
- Wisps that reach the crystal damage it; if its health hits zero, the crystal falls
  and the game is over. Clear wave 10 to win. Kills and cleared waves earn gold and
  score; the best score is kept in the browser.

## Running it

No build step and no network: serve `game/` with any static file server and open
`index.html` in desktop Chrome. For example, from the kit:

```
node serve.ts   # then open http://localhost:8080
```

`main.ts` (Node 22, standard library only) hands the game in: it copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with `buildDossier`
from `vendor/makefun-game.ts`.

## Files

- `game/index.html` — the page: a full-window canvas and the module script.
- `game/src/config.js` — every tuning number: field, path, pads, towers, enemies, waves.
- `game/src/random.js` — the seeded random source (a seeded game replays identically).
- `game/src/audio.js` — all sound, synthesized with WebAudio; no audio files.
- `game/src/input.js` — mouse and keyboard, mapped into field coordinates.
- `game/src/enemies.js` — the wisps: path walking, slowing, health, reaching the crystal.
- `game/src/towers.js` — towers, targeting, projectiles, particles, floating gold text.
- `game/src/world.js` — the rules: gold, core health, waves, economy, winning, losing.
- `game/src/render.js` — everything drawn: garden, path, crystal, towers, HUD, screens.
- `game/src/shots.js` — the deterministic screenshot scenes (`?shot=start|play|win|end`).
- `game/src/main.js` — boot and the one loop; screens, input handling, shot mode.

## Screenshots

`screenshots/` holds four real renders of the game in headless Chromium: the title
screen, a wave in progress, the victory screen and the defeat screen. The first by
name is the cover.

## License

MIT — see `LICENSE`.
