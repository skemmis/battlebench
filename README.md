# BattleBotBench

A 3D simulated arena where AI models build battlers from parts and pit them against each other. It has two goals: a test space where pre-training gives little help, and something fun to watch. What it means to reward is creative problem solving under conditions the model has not seen.

This is an early prototype. It has a family of challenges, a small kit of basic parts, breakable joints, twelve hand-written bots, and a viewer that replays a fight and shows the log a model would read. No model calls yet.

The kit and the physics stay fixed. What changes from round to round is the challenge: the shape of the floor, the surface, gravity and the objective. A bot that only works in one arena does badly.

The rules try not to assume what a good bot looks like, and in particular not that it has four wheels. Three of the nine bots are not battlebots at all: one hops, one sits on the centre and refuses to move, and one throws things from a distance.

## Try it

```
npm install
npm run build      # writes dist/index.html
```

Open `dist/index.html` in a browser (it needs an internet connection to load its two libraries). Pick a seed, watch the fight, and use the Settings tab to change joint strength, gravity or floor grip and rerun.

```
npm test           # the checks to rerun after any tuning change
npm run sweep -- 20  # run 20 seeds and print how the fights came out
npm run tournament -- 6  # every bot against every other bot, 6 seeds each, on the open floor
npm run gauntlet -- 12   # every bot against every other bot in each of 12 drawn challenges
```

## How it works

A bot is two things:

- **A build**: a JSON parts list. Each part has a type, a size, a material, a position measured from the core, a parent, and a joint (`fixed`, `hinge`, `motor` or `piston`). A hinge or motor joint can set a `pivot` point, and a motor can set a `gear` that trades speed for torque. A piston slides its part along an axis and stores energy: pushing out is fast and strong but drains its charge, and the charge refills over a few seconds.
- **A control program**: a function called 30 times a second with the whole state of the fight. It sets motors and pistons, and can let go of any part with `out.release = ['id']`.

The program sees everything: its own and the enemy's position, speed and heading, every part of both bots with its position and whether it is still attached, joint angles and piston charge, loose parts on the floor, and the time left. The plan is to limit the program itself (code size, compute per tick, no outside help during a fight), not what it can see. Those limits are not enforced yet.

The kit is mostly basic parts (`beam`, `plate`, `block`, `wedge`, `disc`, `ball`) in steel, aluminium, plastic or rubber, plus a `core` every bot must have and four ready-made parts: `drive` (a wheel with its motor built in), `track` (a tread that drives along its own length and resists sliding sideways), `thruster` (pushes in one direction and burns a charge that refills while it is off) and `gripper` (locks onto the next thing it touches: the other bot, a loose part, the crate, a wall or the floor). Rubber grips the floor; everything else slides. There are no ready-made weapons. Lawnmower's blade is a steel beam on a motor joint.

A fight is simulated in full first and then replayed, so the same seed always gives the same fight.

### When parts come off

There are no hit points. Every hard contact puts a load on the joints between the part that was hit and the core:

    load = impulse × share of the bot the joint has to drag along × leverage × sharpness

Leverage grows with the distance from the joint to the hit, so long arms snap at the root. Sharpness grows with closing speed, so a fast blade does more than a slow shove with the same impulse. If the load is above the joint's strength, the joint breaks and the part, with everything attached to it, becomes loose debris.

### Challenges

A challenge is plain data (`src/challenges.js`), and a program receives it whole as `s.challenge`, with the same conditions in words as `s.challenge.brief`. `drawChallenge(n)` draws round `n` from the family:

- **Floor**: an open square, a small square, two platforms joined by a bridge, two platforms with a gap between them, a square with solid pillars, a square with a raised block in the middle, or three islands in a row.
- **Surface**: normal, ice, or sticky.
- **Gravity**: normal, a third, or half again as strong.
- **Objective**: hold a fixed point, hold a point that circles, hold a point that jumps, or get a crate toward your own end.

Sizes, speeds and masses are drawn too, so there are a few hundred kinds of round and no two are quite alike.

### How a round ends

- **Ring-out**: a core that falls off the floor loses, whatever the objective.
- **Hold a fixed point**: at 45 seconds, or sooner if nothing has moved for 8 seconds, the core closer to the point wins.
- **Hold a moving point**: five times a second the closer core scores. Most time closest wins.
- **Crate**: whoever has the crate nearer their own end when the round stops wins.

Nothing in the rules rewards damage or movement for their own sake.

### The fight log

Each fight produces three layers of data: a summary, timestamped events (hits, parts lost, flips, the ending), and a motion track of both bots sampled 5 times a second. It reports what happened and leaves the why to the reader.

## Layout

- `src/challenges.js`: the challenge family and the generator that draws a round.
- `src/sim.js`: the simulator. All tunable values are in `CONFIG` at the top.
- `src/bots.js`: twelve hand-written bots. Tread (two tracks, no wheels), Comet (flies on eight thrusters and lands on the objective) and Limpet (grips the crate or the other bot, and clamps itself to the floor), plus: Lawnmower (horizontal bar spinner), Doorstop (wedge, the house bot), Pancake (flipper), Gavel (hammer), Eggbeater (vertical disc spinner), Carousel (full-body spinner), Flea (hops on two pistons, no wheels), Squatter (parks on the centre and jacks itself onto rubber pads) and Slingshot (throws steel balls, then holds the centre).
- `src/viewer.js`, `src/page.html`: the replay page.
- `scripts/build.mjs`: inlines everything into `dist/index.html`.
- `test/fights.test.mjs`: build checks, repeatability, and physics sanity checks.

## Known rough edges

- Wheels are spheres in the physics and cylinders on screen.
- Parts of the same bot do not collide with each other.
- The physics engine is cannon-es, chosen because it is plain JavaScript and runs anywhere. Rapier is the likely upgrade if joints or fast spinners need more accuracy.
- Motors are strongest from a standstill and fade to a tenth at top speed, so a spinner hits with the energy stored in its spinning part and then has to spin up again.
- Parts of the same bot pass through each other, so a hammer can swing through its own deck.
- Program size is limited to 20,000 characters. Compute per tick is not limited yet.
- Friction is corrected on top of the engine. Out of the box the engine lets nothing slide: a slab pushed at 3 m/s stopped in a centimetre whatever its material. Friction between a part and the floor now matches friction x weight. Friction between two bots in a hard hit is still only approximate.
- Across drawn challenges the three bots on the newer parts (Comet, Tread, Limpet) now have the best records and the wheeled wedge is mid-table. More than half the fights are quiet: bots go for the objective and often never touch.
- Every bot here is still one idea on a small frame. The direction from here is machines made of many small parts, with function assembled from plain mechanism pieces.
- Pistons deliver well under their rated force, because the physics engine's joints are soft. Hopping works but is slow.
- Carousel is top-heavy and often leaves the arena on its own.
- About a third of fights are quiet, with fewer than three hard hits.
