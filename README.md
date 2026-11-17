# BattleBotBench

A 3D simulated arena where AI models assemble battle bots from parts and fight each other. It has two goals: a test space where pre-training gives little help, and something fun to watch.

This is the first prototype. It has one arena, a small kit of basic parts, breakable joints, six hand-written bots, and a viewer that replays a fight and shows the log a model would read. No model calls yet.

## Try it

```
npm install
npm run build      # writes dist/index.html
```

Open `dist/index.html` in a browser (it needs an internet connection to load its two libraries). Pick a seed, watch the fight, and use the Settings tab to change joint strength, gravity or floor grip and rerun.

```
npm test           # the checks to rerun after any tuning change
npm run sweep -- 20  # run 20 seeds and print how the fights came out
npm run tournament -- 6  # every bot against every other bot, 6 seeds each
```

## How it works

A bot is two things:

- **A build**: a JSON parts list. Each part has a type, a size, a material, a position measured from the core, a parent, and a joint (`fixed`, `hinge` or `motor`). A hinge or motor joint can set a `pivot` point, and a motor can set a `gear` that trades speed for torque. Programs can read each joint's angle.
- **A control program**: a function that reads sensors and sets motors 30 times a second.

The kit is mostly basic parts (`beam`, `plate`, `block`, `wedge`, `disc`, `ball`) plus a `core` every bot must have and one shortcut, `drive`, a wheel with its motor built in. There are no ready-made weapons. Lawnmower's blade is a steel beam on a motor joint.

A fight is simulated in full first and then replayed, so the same seed always gives the same fight.

### When parts come off

There are no hit points. Every hard contact puts a load on the joints between the part that was hit and the core:

    load = impulse × share of the bot the joint has to drag along × leverage × sharpness

Leverage grows with the distance from the joint to the hit, so long arms snap at the root. Sharpness grows with closing speed, so a fast blade does more than a slow shove with the same impulse. If the load is above the joint's strength, the joint breaks and the part, with everything attached to it, becomes loose debris.

### How a fight ends

- **Ring-out**: a bot's core falls off the platform.
- **Count-out**: a bot's core barely moves for 8 seconds.
- **Time**: at 60 seconds, the bot with more of its mass still attached wins.

### The fight log

Each fight produces three layers of data: a summary, timestamped events (hits, parts lost, flips, the ending), and a motion track of both bots sampled 5 times a second. It reports what happened and leaves the why to the reader.

## Layout

- `src/sim.js`: the simulator. All tunable values are in `CONFIG` at the top.
- `src/bots.js`: six hand-written bots. Lawnmower (horizontal bar spinner), Doorstop (wedge, the house bot), Pancake (flipper), Gavel (hammer), Eggbeater (vertical disc spinner) and Carousel (full-body spinner).
- `src/viewer.js`, `src/page.html`: the replay page.
- `scripts/build.mjs`: inlines everything into `dist/index.html`.
- `test/fights.test.mjs`: build checks, repeatability, and physics sanity checks.

## Known rough edges

- Wheels are spheres in the physics and cylinders on screen.
- Parts of the same bot do not collide with each other.
- The physics engine is cannon-es, chosen because it is plain JavaScript and runs anywhere. Rapier is the likely upgrade if joints or fast spinners need more accuracy.
- Motor joints have a fixed power, so weapons carry little energy. A weapon hit is about as hard as a bump from a wheel. The Weapon power slider on the page shows what changes when that is raised.
- There is no part that stores energy and releases it at once (a spring or piston), so the flipper and hammer are slow.
- About a quarter of fights end with a bot stuck or tangled and counted out.
