# BattleBotBench

A 3D simulated arena where AI models build battlers from parts and pit them against each other. It has two goals: a test space where pre-training gives little help, and something fun to watch. What it means to reward is creative problem solving under conditions the builder has not seen before.

This is an early prototype (v0.6). It has a family of challenges, a kit of plain pieces, breakable joints, five hand-built machines, and a viewer that replays a fight and shows what each machine says it is doing. No model calls yet: the machines here are written by hand, to the standard a model's would need to reach.

The kit and the physics stay fixed. What changes from round to round is the challenge: the shape of the arena, the ground, the surface and gravity. There is one way to win everywhere: break the enemy apart or put it off the floor. A machine that only works in one arena does badly.

There are no ready-made parts. No wheel unit, no track, no thruster, no gripper. A wheel is a rubber disc on a geared motor; a leg is a hub with spokes; a gate is a beam on a motor with limits. Function has to be assembled, so machines end up as mechanisms and not as one idea on a box.

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

A motor with no power still resists turning, so wheels on a broken-off axle drag. Two pieces that were built overlapping do not collide with each other even after they break apart.

### Shoving

Two machines of the same weight and grip pushing head on is a deadlock, and it should be. A slow push loads no joints while a blow at speed does, so the machines here back off for a run-up instead of leaning.

### Challenges

A challenge is plain data (`src/challenges.js`), and a program receives it whole as `s.challenge`, with the same conditions in words as `s.challenge.brief`. `drawChallenge(n)` draws round `n` from the family:

- **Arena**: an open square, a small square, two platforms joined by a bridge, two platforms with a gap between them, a square with solid pillars, or three islands in a row.
- **Ground**: broken rock in seven rounds out of eight. It is made of flat-topped ledges, each an entry in `s.challenge.floor` with a `top` height, cut from smooth noise so there are shelves and outcrops and not a scatter of obstacles. *Crags* have ledges up to 1.6 m with steps up to 0.6 m. *Terraces* are broad shelves 0.35 m apart. *Rubble* is small steps of 0.1 to 0.3 m everywhere. No step is higher than the round says, so nothing is walled in, but most steps are more than a wheel can take. Starting places are level pads.
- **Surface**: normal, ice, or sticky.
- **Gravity**: normal, a third, or half again as strong.

### How a round ends

- **Ring-out**: a core that goes off the floor loses.
- **Destroyed**: a machine that has had more than half its mass broken off its core loses.
- **Otherwise**, at 90 seconds, or sooner if nothing has moved for 10 seconds, the machine with more of itself still attached wins, if the difference is 5% or more. If not, it is a draw.

There are no points to hold and nothing to fetch. Standing somewhere wins nothing.

### The fight log

Each fight produces three layers of data: a summary, timestamped events (hits, parts lost, flips, the ending), and a motion track of both machines sampled 5 times a second. It reports what happened and leaves the why to the reader.

## The machines

Design round 1 for the knockout game on broken ground. Four walk on six spoked legs, which step onto ledges; one has wheels.

- **Strider** (52 parts, 165 kg): light and quick, with a steel beak. Goes for machines that are stuck or near an edge.
- **Mantis** (58 parts): two steel hammers on 1.7 m arms that lie back along the body and come down in front of it. Squares up at striking distance and swings them in turn.
- **Thresher** (54 parts): a steel bar spinning across its nose, turning upward at the front. Keeps its nose on the enemy and walks into it.
- **Slinger** (68 parts): three throwing arms. Works out the swing for the range, the gravity and the difference in height, leads a moving target, and clubs with the arms once the shot is gone.
- **Rover** (14 parts, 423 kg): the wheeled machine, with six of the biggest tyres the kit allows, a high frame and a steel ram. Fast on the flat. On crags and terraces it usually reports that there is no way its wheels can take.

All of them share one idea of where to go: a machine near a drop is easier to put over it than to break, so get inboard of it and drive it out; otherwise close with it.

## Layout

- `src/challenges.js`: the challenge family and the generator that draws a round.
- `src/sim.js`: the simulator. All tunable values are in `CONFIG` at the top.
- `src/lib.js`: helpers passed to control programs.
- `src/bots.js`: the five machines and their programs.
- `src/viewer.js`, `src/page.html`: the replay page.
- `scripts/build.mjs`: inlines everything into `dist/index.html`.
- `test/fights.test.mjs`: build checks, repeatability, physics sanity checks, and one test per machine's signature move.
- `old/`: earlier machines, kept for reference. `bots-v05.js` are the point-holding machines for flat floors; `bots-v04.js` use parts that no longer exist.

## Known rough edges

- The machines are a first attempt at this game. Walkers lose a whole axle and both its legs to one good hit, so fights can be over in seconds. Hammers and throwing arms can break their own machine when it is tipped over.
- Rover often wins on damage without going anywhere: walkers come to it and break themselves on it.
- Where there is a gap with no way across, only a thrower can do anything, and the round is usually a draw.
- A fight takes about as long to simulate as it lasts.
- A fight replays exactly in one JavaScript engine, but the page in a browser and the scripts in Node can come out differently for the same seed.
- The engine is cannon-es, chosen because it is plain JavaScript; friction, rolling resistance and air drag are added on top of it.
- Smooth terrain (a grid of heights) is still supported by the simulator and the helpers but no round uses it.
- Compute per tick is not limited yet. There are no hidden test rounds yet.
