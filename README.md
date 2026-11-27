# Ridge Runner — Bush Pilot over Crestline Valley

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun rank](https://make.fun/badge/best-flight-game-20261126-0057/catalysdrop/makefun-best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun reward](https://make.fun/badge/best-flight-game-20261126-0057/catalysdrop/makefun-best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057).
Fly the Kestrel K-2 bush plane over Crestline Valley: thread glowing rings,
drop the mail over Alder village, and land cleanly on Alder Field — before
the fuel and the timer run out.

## Play

Open `game/index.html` in a desktop browser. No build, no network, no
assets to download — the whole game is static files.

- **Arrows / WASD** — pitch and roll
- **Shift / Ctrl** (or `+` / `-`) — throttle up / down
- **Q / E** — rudder · **Space** — brake on the ground
- **C** — swap chase / cockpit camera · **M** — mouse steering
  (hold the left button and move)
- **B** — drop the mail sack · **R** — reset to the runway · **P** — pause
- **1 / 2 / 3** — pick a sortie from the menu

### Sorties

1. **Ring Run** — thread all 6 valley rings, then land on Alder Field.
2. **Mail Drop** — drop the sack over Alder village, then land.
3. **Touchdown** — take off, fly one circuit, land cleanly.

Lift needs speed: below 26 m/s the wing stalls and she sinks. A hard
landing, or a landing with too much bank, ends the day. Fuel burns with the
throttle; the timer gives you 5 minutes a sortie.

## How it is built

No engine, no library — a small software 3D renderer on a 2D canvas, all
original code written for this bounty:

| File | Job |
| --- | --- |
| `game/src/config.js` | Every tuning number: world, plane, missions, palette |
| `game/src/random.js` | Seeded RNG, value noise, angle helpers |
| `game/src/terrain.js` | The valley: heightmap, river, lake, fields, runway, village, forest |
| `game/src/plane.js` | The Kestrel K-2: flight model and its triangle model |
| `game/src/render.js` | Sky, sun, clouds, painter's-algorithm renderer, near-plane clipping |
| `game/src/hud.js` | Artificial horizon, airspeed/altitude tapes, compass, gauges |
| `game/src/audio.js` | Synthesised WebAudio: engine, wind, chimes, thuds |
| `game/src/input.js` | Keyboard + mouse |
| `game/src/game.js` | Sorties, scoring, fuel, timer, crash/landing |
| `game/src/shots.js` | Deterministic screenshot staging (`?shot=cover\|ring\|cockpit\|landing`) |
| `game/src/main.js` | Boot, main loop, smoothed chase/cockpit cameras |

`main.ts` (repo root) copies `game/` and `screenshots/` into the output
directory and writes `dossier.json` with make.fun's `vendor/makefun-game.ts`
(copied unchanged from the bounty kit). Run it with:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Screenshots

Real renders of the game, captured from the running code:

- `screenshots/01-cover.jpg` — chase view on the run-in to ring 2
- `screenshots/02-ring.jpg` — threading ring 3 between the peaks
- `screenshots/03-cockpit.jpg` — cockpit view on final approach
- `screenshots/04-landing.jpg` — wheels down on Alder Field, sortie complete

Screenshots were captured from the running game with Playwright
(`?shot=cover|ring|cockpit|landing`, 1280×720, then JPEG quality 85).

## License

MIT — see [LICENSE](LICENSE).
