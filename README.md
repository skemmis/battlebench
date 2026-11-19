# BattleBotBench

A 3D simulated arena where AI models build battlers from parts and pit them against each other. It has two goals: a test space where pre-training gives little help, and something fun to watch. What it means to reward is creative problem solving under conditions the builder has not seen before.

This is an early prototype (v0.5). It has a family of challenges, a kit of plain pieces, breakable joints, five hand-built machines, and a viewer that replays a fight and shows what each machine says it is doing. No model calls yet: the machines here are written by hand, to the standard a model's would need to reach.

The kit and the physics stay fixed. What changes from round to round is the challenge: the shape of the floor, the surface, gravity and the objective. A machine that only works in one arena does badly.

There are no ready-made parts. No wheel unit, no track, no thruster, no gripper. A wheel is a rubber ball on a small geared motor; a leg is a hub with spokes; a gate is a beam on a motor with limits. Function has to be assembled, so machines end up as mechanisms and not as one idea on a box.

## Try it

```
npm install
npm run build      # writes dist/index.html
```

Open `dist/index.html` in a browser (it needs an internet connection to load its two libraries). The Showcase strip at the top steps through seven fights, each picked to show one idea. Or pick two machines, a challenge and a seed yourself.

```
npm test                 # the checks to rerun after any change
npm run gauntlet -- 12   # every machine against every other in each of 12 drawn challenges
```

## How it works

A machine is two things:

- **A build**: a JSON parts list. Each part has a type (`core`, `beam`, `plate`, `block`, `wedge`, `disc`, `ball`), a size, a material (steel, aluminium, plastic, rubber), a position measured from the core, a parent, and a joint.
- **A control program**: a function `(s, out, mem, lib)` called 30 times a second with the whole state of the fight. It sets motors and pistons, can let go of any part with `out.release = ['id']`, and can say what it is doing with `out.say = 'text'`, which is shown on screen and written to the log.

Joints:

- `fixed`: rigid. Parts joined this way move as one body.
- `hinge`: turns freely about `axis` through `pivot`. Optional `limits: [low, high]` in degrees, and a `spring` that pulls it toward `rest`.
- `motor`: a driven hinge. `gear` from 0.5 to 8 trades speed for torque, and `power` from 0.02 to 1 picks the size of the motor (torque and cost scale with it). May also have limits and a spring.
- `piston`: stores energy and lets it go in a kick.

Joint `axis` and `pivot` are given in the machine's own frame. Limits: 200 parts, 500 kg, 300 cost, a 5 x 4 x 5 m box. Arenas are 14 to 34 m across.

Parts of one machine collide with each other unless they were built touching, so mechanisms can interlock, rest on stops, and jam.

The program sees everything: both machines' position, speed and heading, every part with its position and whether it is still attached, joint angles, loose parts, the challenge, the target or crate, and the score. It is limited in size (20,000 characters), not in what it can see.

`src/lib.js` is a small helper library passed to every program: bearings and interception, a map of the floor, a route planner that goes round gaps and walls and says when there is no way, and a guard that keeps a machine from driving off an edge. The guard works out braking distance from the round's grip and gravity, and feeds power to the wheels no faster than the ground is passing so they keep their grip. Strategy stays in the program.

A fight is simulated in full first and then replayed, so the same seed always gives the same fight.

### When parts come off

There are no hit points. A hit lasts several physics steps, so the impulse between two parts is added up over the length of the blow (up to a twentieth of a second) and judged as a whole:

    load = impulse of the blow × share of the machine the joint drags along × leverage × sharpness

Leverage grows with the distance from the joint to the hit. Sharpness is the speed the parts met at, so parts that only rest or push on each other load nothing. Walking inward from the part that was hit, the first joint that cannot carry the load breaks, so machines lose their outer pieces first. Whatever was hanging off that joint comes away with it and stays in the arena as loose debris.

### Grip

A wheel grips according to how hard it is pressed to the floor, which is mostly the weight of the machine above it. (The physics engine on its own uses the wheel's own weight, which left wheels with about a sixth of the grip they should have.) Braking distances now match the textbook figure, v² / 2μg.

### Shoving

Two machines of the same weight and grip pushing head on is a deadlock, and it should be. Two things break it. A rubber tyre that is spinning or skidding has 0.6 of the grip of one that is rolling, so a machine that feeds its power in beats one that floors it. And a slow push loads no joints while a blow at speed does, so the machines here back off for a run-up instead of leaning.

### Challenges

A challenge is plain data (`src/challenges.js`), and a program receives it whole as `s.challenge`, with the same conditions in words as `s.challenge.brief`. `drawChallenge(n)` draws round `n` from the family:

- **Floor**: an open square, a small square, two platforms joined by a bridge, two platforms with a gap between them, a square with solid pillars, a square with a raised block in the middle, three islands in a row, or a square crossed by two low ridges that legs step over and wheels have to go round.
- **Surface**: normal, ice, or sticky.
- **Gravity**: normal, a third, or half again as strong.
- **Objective**: hold a fixed point, hold a point that circles, hold a point that jumps, or get a crate toward your own end.

Sizes, speeds and masses are drawn too, so there are a few hundred kinds of round and no two are quite alike.

### How a round ends

- **Ring-out**: a core that falls off the floor loses, whatever the objective.
- **Hold a fixed point**: at 60 seconds, or sooner if nothing has moved for 8 seconds, the core closer to the point wins. If they are within 0.4 m of level, the machine that has had less broken off it wins; if that is level too, it is a draw.
- **Hold a moving point**: five times a second the closer core scores. Most time closest wins.
- **Crate**: whoever has the crate nearer their own end when the round stops wins.

Damage only counts as a tie-break. A machine that cannot reach the point does better by pushing the enemy further from it than by waiting.

### The fight log

Each fight produces three layers of data: a summary, timestamped events (hits, parts lost, flips, the ending), and a motion track of both machines sampled 5 times a second. It reports what happened and leaves the why to the reader.

## The machines

- **Bulwark** (29 parts): a six-wheeled shover with five plough blades on sprung hinges.
- **Strider** (52 parts): six spoked legs held in a tripod gait by reading each hub angle. Climbs the plinth, which wheels cannot. Slows its gait in low gravity.
- **Mangonel** (31 parts): three throwing arms. Works out the swing for the range and gravity, leads a moving target, backs off when too close, clubs with the arms once the shot is gone.
- **Corral** (73 parts): a walled pen of separate bricks with two motor gates. Drives over the crate, shuts the gates, hauls it home.
- **Span** (34 parts): a 5 m frame on four axles with two heavy weights on arms. With the weights at the tail it reaches its nose over a gap, then swings them over the top to the nose and brings its tail across. If the point is out over a gap it stops astride it.

## Layout

- `src/challenges.js`: the challenge family and the generator that draws a round.
- `src/sim.js`: the simulator. All tunable values are in `CONFIG` at the top.
- `src/lib.js`: helpers passed to control programs.
- `src/bots.js`: the five machines and their programs.
- `src/viewer.js`, `src/page.html`: the replay page.
- `scripts/build.mjs`: inlines everything into `dist/index.html`.
- `test/fights.test.mjs`: build checks, repeatability, physics sanity checks, and one test per machine's signature move.
- `old/`: the v0.4 bots, kept for reference. They use parts that no longer exist.

## Known rough edges

- Damage is newly tuned (about six parts lost per fight in a sample). A broken joint takes everything beyond it, so a rail goes with its wheels; builds made of longer chains lose bigger pieces.
- About a third of fights end with both machines standing still, most often when the point is somewhere neither can reach and both sensibly wait.
- Low gravity is where machines still fall off on their own: braking distances are long and tall machines tip.
- Wheels are spheres in the physics. The engine is cannon-es, chosen because it is plain JavaScript; friction is corrected on top of it.
- Compute per tick is not limited yet. There are no hidden test rounds yet.
