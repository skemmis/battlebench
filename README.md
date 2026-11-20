# BattleBotBench

A 3D simulated arena where AI models build battlers from parts and pit them against each other. It has two goals: a test space where pre-training gives little help, and something fun to watch. What it means to reward is creative problem solving under conditions the builder has not seen before.

This is an early prototype (v0.7). It has a family of challenges fought over land with high ground, a kit of plain pieces, breakable joints, twelve hand-built machines (two of them large, two built for close quarters, one built only to push), and a viewer that replays a fight and shows what each machine says it is doing. No model calls yet: the machines here are written by hand, to the standard a model's would need to reach.

The kit and the physics stay fixed. What changes from round to round is the challenge: the shape of the arena, the ground, the surface and gravity. There is one way to win everywhere: break the enemy apart or put it off the floor. A machine that only works in one arena does badly.

There are no ready-made parts. No wheel unit, no track, no thruster, no gripper. A wheel is a rubber disc on a geared motor; a leg is a hub with spokes; a gate is a beam on a motor with limits. Function has to be assembled, so machines end up as mechanisms and not as one idea on a box.

## Try it

```
npm install
npm run build      # writes dist/index.html
```

Open `dist/index.html` in a browser (it needs an internet connection to load its two libraries). The Showcase strip at the top steps through eleven fights, each picked to show one idea. Or pick two machines, a challenge and a seed yourself.

```
npm run quick            # a spot check for iterating: 12 fights over four maps, a few minutes
npm run quick -- 24 2    # more fights, another seed
npm test                 # the checks to rerun after any change
npm run gauntlet -- 4    # the long form: every machine against every other in each of 4 drawn challenges
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

`src/lib.js` is a small helper library passed to every program: bearings and interception, a map of the floor, a route planner that goes round gaps and walls and says when there is no way, and a guard that keeps a machine from driving off an edge. The guard works out braking distance from the round's grip and gravity, and feeds power to the wheels no faster than the ground is passing so they keep their grip. The planner refuses slopes steeper than a set grade, less on a slippery surface. The driving helper also notices when a machine is asking to move and is not moving, and backs it off for another try. Strategy stays in the program.

A fight is simulated in full first and then replayed, so the same seed always gives the same fight.

### When parts come off

There are no hit points. A hit lasts several physics steps, so the impulse between two parts is added up over the length of the blow (up to a twentieth of a second) and judged as a whole:

    load = impulse of the blow × share of the machine the joint drags along × leverage × sharpness

Leverage grows with the distance from the joint to the hit. Sharpness is the speed the parts met at, so parts that only rest or push on each other load nothing. Walking inward from the part that was hit, the first joint that cannot carry the load breaks, so machines lose their outer pieces first. Whatever was hanging off that joint comes away with it and stays in the arena as loose debris.

### Grip

A wheel grips according to how hard it is pressed to the floor, which is mostly the weight of the machine above it. (The physics engine on its own uses the wheel's own weight, which left wheels with about a sixth of the grip they should have.) Braking distances now match the textbook figure, v² / 2μg.

### Earth physics

Nothing here coasts for ever. Four things slow and stop objects, and each is checked in the tests against the textbook figure.

- **Sliding friction** on every contact, by material, limited by how hard the two things are pressed together. Anything sliding grips 0.8 as well as it did at rest; a skidding rubber tyre, 0.6.
- **Rolling resistance.** A thing that rolls or pivots on another loses a little at the contact: a torque against its turning of (resistance x pressing force x distance to the contact). A steel ball rolling at 3 m/s stops in about 11 m.
- **Air drag** that grows with the square of speed, from real air density and each body's area. It barely touches a steel shot and takes a fifth off the range of a light ball.
- **Rest.** A loose piece that has stopped stays stopped until something hits it.

- **Water.** No map has water at present (rivers were taken out), but the engine still does it. Wherever the ground is lower than a round's water level there is water. What stands in it is dragged on by the part of it that is under, and borne up by the weight of water that part pushes aside: steel wades, rubber tyres and plastic float.

A motor with no power still resists turning, so wheels on a broken-off axle drag. Two pieces that were built overlapping do not collide with each other even after they break apart.

### Shoving

Two machines of the same weight and grip pushing head on is a deadlock, and it should be. A slow push loads no joints while a blow at speed does, so the machines here back off for a run-up instead of leaning.

### Challenges

A challenge is plain data (`src/challenges.js`), and a program receives it whole as `s.challenge`, with the same conditions in words as `s.challenge.brief`. `drawChallenge(n)` draws round `n` from the family:

- **Arena**: an open square, a small square, two platforms joined by a bridge, two platforms with a gap between them, a square with solid pillars, or three islands in a row.
- **Ground**: on a single platform 18 to 22 m across, land like a game map, as a grid of heights in `s.challenge.terrain`. It rolls gently and is walkable everywhere except where it is meant not to be. *Valley*: a flat-topped hill on each side of the middle, each with steep sides and one ramp. *High ground*: one hill in the middle with two ramps. *Downs*: open rises and hollows. Every map is the same from either end. Split arenas (bridge, gap, islands, pillars) are flat or rubble. The stepped rock of v0.6 (crags, terraces) is still in the generator for rounds that ask for it, but is no longer drawn.
- **Surface**: normal, ice, or sticky.
- **Gravity**: normal, a third, or half again as strong.

### How a round ends

- **Ring-out**: a core that goes off the floor loses.
- **Destroyed**: a machine that has had more than half its mass broken off its core loses.
- **Otherwise**, at 45 seconds, or sooner if neither machine has moved or landed a blow for 8 seconds, the machine with more of itself still attached wins, if the difference is 5% or more. If not, it is a draw.

There are no points to hold and nothing to fetch. Standing somewhere wins nothing.

### The fight log

Each fight produces three layers of data: a summary, timestamped events (hits, parts lost, flips, the ending), and a motion track of both machines sampled 5 times a second. It reports what happened and leaves the why to the reader.

## The machines

Nine walk on spoked legs and one has wheels. The flat walkers (Strider, Thresher, Centipede) work either way up.

Two are large, about 700 kg and nearly 90 parts, built on a ten-legged frame with a thick steel backbone:

- **Scorpion** (88 parts, 723 kg): two steel claws on upright pivots stand open across its front and snap shut on whatever comes between them; a 2.4 m tail club lies back along the body and comes over the top onto anything the claws have caught. Nearly seven metres from tail to claw tips.
- **Dreadnought** (88 parts, 766 kg): a spinning steel bar at each end, under a roof and skirts of plate. Either end is the front: if the enemy is behind, it backs the rear rotor into it.

The rest weigh 260 to 490 kg:

- **Strider** (52 parts, 262 kg): quick, with a steel beak. Goes for machines that are stuck or near an edge.
- **Mantis** (53 parts, 354 kg): two steel clubs on a mast at its nose that lie back along the body and come over and down in front of it. Each club is one bar on a motor, so there is no head to snap off.
- **Thresher** (50 parts, 293 kg): a steel bar spinning flat over its nose like a rotor, mounted on the spine itself.
- **Slinger** (68 parts, 444 kg): three throwing arms. Works out the swing for the range, the gravity and the difference in height, leads a moving target, and clubs with the arms once the shot is gone.
- **Centipede** (80 parts, 467 kg): ten legs and a ram at each end. Walks straight across gaps up to about 1.9 m.
- **Rover** (14 parts, 490 kg): six of the biggest tyres the kit allows and a steel ram on a piston, so it shoves as well as hits. Fast on open ground.

### Sumo

Pushing the enemy out is meant to be a real way to win. Rings are small (18 to 22 m), fights are 45 seconds, and machines are built solid: a joint's strength now goes up in proportion to the section of the thinner part, up to four times, and every machine has a thick backbone and axles, so a single touch no longer takes a machine apart.

- **Ox** (84 parts, 842 kg): no weapon. Ten legs, steel ballast, and a 2 m plough on a piston. It gets inboard of the enemy, leans in, and shoves it half a metre at a stroke until the floor runs out.

In a 22-fight check, 6 fights ended in a ring-out, 12 on damage at the clock, 4 were draws, and none ended with a machine destroyed.

### Agility

`npm run agility` drives each machine by hand on the open floor and reports top speed, time to reach it, stopping distance and how fast it turns on the spot. The walkers do 1.8 to 2.8 m/s and turn at 20 to 58 degrees a second; Rover does 5.6 m/s but turns no faster. What holds them back is weight against leg power and long layouts whose end feet scrub sideways in a turn, not a limit in the kit: a bare 76 kg two-wheeler built from the same parts does 6 m/s and turns at over 500 degrees a second.

A motor can now be told an angle to hold, `out.id = { angle: radians }`, as well as a speed. The engine follows it at the physics rate, so limbs, steering joints and aimed weapons go where they are told.

- **Hornet** (13 parts, 173 kg): two driven wheels and two skids, 6.6 m/s, with a piston fist on a turret that is held on the enemy whichever way the body is going. It runs in, punches and leaves. It is quick and it loses most of its fights: the heavy machines catch it against the edge and push it out.

### The tangle

On maps this size two machines spend about 85% of a fight within 3.5 m of each other, usually locked together with legs in legs, where a weapon built for arm's length does nothing. Two machines are built around that:

- **Bramble** (52 parts, 343 kg): a flat rotor at each end and an upright saw bar outboard of the legs on each flank. It has no safe side to lock onto and does not try to get free: it leans the nearest weapon in.
- **Warden** (58 parts, 597 kg): fights at arm's length and keeps it that way. Two tall steel shields stand ahead of its front legs, high enough and thick enough to stop a rotor; a piston fist in the nose punches an enemy back out; two long clubs come down over the shields onto whatever is held there.

The three kinds check each other. Blows from above beat Bramble, whose weapons are all at leg height: Mantis broke it apart. Shields and a fist beat Mantis. Bramble beats most things that close with it.

Mantis and Scorpion also keep striking when something is inside their reach, where before they tried to step back. `npm run quick` reports the seconds spent at close quarters and how often something broke there.

### What makes a weapon work

Three rules in the simulator decide whether a weapon survives its own blows, and the machines above are built around them:

- **A struck part on a pivot swings.** A blow on something hung from a hinge or a motor is partly taken up by the swing, and only the rest goes through the pivot into the mount. A bar struck two thirds of the way along passes nothing on; a balanced rotor passes all of it, so a spinner needs the strongest mount on the machine.
- **Thicker parts make stronger joints**, by the square root of the section, up to two and a half times. A long machine needs a thick backbone or it snaps at the core.
- **Stops are as hard as the arm is heavy**, so a club that misses stops at its limit and does not swing on into its own machine. A pivot has to be on the part it turns.

The allowance for one machine is 1200 kg, 300 parts and a box 8 x 5 x 9 m.

## Layout

- `src/challenges.js`: the challenge family and the generator that draws a round.
- `src/sim.js`: the simulator. All tunable values are in `CONFIG` at the top.
- `src/lib.js`: helpers passed to control programs.
- `src/bots.js`: the ten machines and their programs.
- `src/viewer.js`, `src/page.html`: the replay page.
- `scripts/build.mjs`: inlines everything into `dist/index.html`.
- `scripts/quick.mjs`, `scripts/gauntlet.mjs`: the spot check and the full table.
- `test/fights.test.mjs`: build checks, repeatability, physics sanity checks, and one test per machine's signature move.
- `old/`: earlier machines, kept for reference. `bots-v05.js` are the point-holding machines for flat floors; `bots-v04.js` use parts that no longer exist.

## Known rough edges

- In the last 20-fight spot check, 5 fights ended in a knockout, 11 were decided on damage and 4 were draws. Most fights still go to the clock.
- The spot checks are small. Which machine beats which is from a handful of fights each, and browser and Node can disagree.
- Large machines need room: on the smallest maps a ring-out can come from a tumble near the start.
- Rivers stand still. A current that carries floating machines toward the edge is an obvious next step.
- Hills are grids of heights one metre apart, so cliffs are steep slopes and not sheer walls. A walker can sometimes scramble up one.
- Where there is a gap with no way across, only a thrower or a long machine can do anything.
- A fight takes about as long to simulate as it lasts, and longer with the large machines.
- A fight replays exactly in one JavaScript engine, but the page in a browser and the scripts in Node can come out differently for the same seed.
- The engine is cannon-es, chosen because it is plain JavaScript; friction, rolling resistance, air drag, water and joint breakage are added on top of it.
- Compute per tick is not limited yet. There are no hidden test rounds yet.
