# BattleBotBench

A 3D simulated arena where AI models assemble battle bots from parts and fight each other. It has two goals: a test space where pre-training gives little help, and something fun to watch.

This is an early prototype. It has one arena, a small kit of basic parts, breakable joints, nine hand-written bots, and a viewer that replays a fight and shows the log a model would read. No model calls yet.

The rules try not to assume what a good bot looks like. Three of the nine bots are not battlebots at all: one hops, one sits on the centre and refuses to move, and one throws things from a distance.

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

- **A build**: a JSON parts list. Each part has a type, a size, a material, a position measured from the core, a parent, and a joint (`fixed`, `hinge`, `motor` or `piston`). A hinge or motor joint can set a `pivot` point, and a motor can set a `gear` that trades speed for torque. A piston slides its part along an axis and stores energy: pushing out is fast and strong but drains its charge, and the charge refills over a few seconds.
- **A control program**: a function called 30 times a second with the whole state of the fight. It sets motors and pistons, and can let go of any part with `out.release = ['id']`.

The program sees everything: its own and the enemy's position, speed and heading, every part of both bots with its position and whether it is still attached, joint angles and piston charge, loose parts on the floor, and the time left. The plan is to limit the program itself (code size, compute per tick, no outside help during a fight), not what it can see. Those limits are not enforced yet.

The kit is mostly basic parts (`beam`, `plate`, `block`, `wedge`, `disc`, `ball`) in steel, aluminium, plastic or rubber, plus a `core` every bot must have and one shortcut, `drive`, a wheel with its motor built in. Rubber grips the floor; everything else slides. There are no ready-made weapons. Lawnmower's blade is a steel beam on a motor joint.

A fight is simulated in full first and then replayed, so the same seed always gives the same fight.

### When parts come off

There are no hit points. Every hard contact puts a load on the joints between the part that was hit and the core:

    load = impulse × share of the bot the joint has to drag along × leverage × sharpness

Leverage grows with the distance from the joint to the hit, so long arms snap at the root. Sharpness grows with closing speed, so a fast blade does more than a slow shove with the same impulse. If the load is above the joint's strength, the joint breaks and the part, with everything attached to it, becomes loose debris.

### How a fight ends

- **Ring-out**: a bot's core falls off the platform.
- **Otherwise the centre decides**: at 45 seconds, or sooner if nothing has moved for 8 seconds, the bot whose core is closer to the middle of the arena wins.

Nothing in the rules rewards damage or movement for their own sake. Breaking the other bot is one way to take the centre, and so are shoving it, outlasting it, or never leaving.

### The fight log

Each fight produces three layers of data: a summary, timestamped events (hits, parts lost, flips, the ending), and a motion track of both bots sampled 5 times a second. It reports what happened and leaves the why to the reader.

## Layout

- `src/sim.js`: the simulator. All tunable values are in `CONFIG` at the top.
- `src/bots.js`: nine hand-written bots. Lawnmower (horizontal bar spinner), Doorstop (wedge, the house bot), Pancake (flipper), Gavel (hammer), Eggbeater (vertical disc spinner), Carousel (full-body spinner), Flea (hops on two pistons, no wheels), Squatter (parks on the centre and jacks itself onto rubber pads) and Slingshot (throws steel balls, then holds the centre).
- `src/viewer.js`, `src/page.html`: the replay page.
- `scripts/build.mjs`: inlines everything into `dist/index.html`.
- `test/fights.test.mjs`: build checks, repeatability, and physics sanity checks.

## Known rough edges

- Wheels are spheres in the physics and cylinders on screen.
- Parts of the same bot do not collide with each other.
- The physics engine is cannon-es, chosen because it is plain JavaScript and runs anywhere. Rapier is the likely upgrade if joints or fast spinners need more accuracy.
- Pistons deliver well under their rated force, because the physics engine's joints are soft. Hopping works but is slow.
- Spinners at the current power throw themselves around when they land a hit. Carousel in particular is top-heavy and often leaves the arena on its own.
- Under the centre rule the three bots that are not battlebots have the best records. Whether that is the game we want is an open question.
- About a third of fights are quiet, with fewer than three hard hits.
