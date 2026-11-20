// Run with: npm test
// These are the checks to rerun after any change to parts or physics values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createMatch, validateBuild } from '../src/sim.js';
import { ALL, ROVER, SLINGER } from '../src/bots.js';
import { LIB } from '../src/lib.js';
import { drawChallenge, NAMED, OPEN } from '../src/challenges.js';

const byName = (n) => ALL.find((r) => r.build.name === n);
const named = (n) => NAMED.find((c) => c.name === n);
const BRICK = { name: 'Brick', parts: [{ id: 'core', type: 'core' }, { id: 'slab', type: 'plate', material: 'aluminium', size: [1, 0.1, 1], pos: [0, -0.25, 0], parent: 'core' }] };
const idle = () => {};
const play = (a, b, challenge = OPEN, seed = 1, config = CONFIG) => createMatch({ builds: [byName(a).build, byName(b).build], programs: [byName(a).program, byName(b).program], seed, config, challenge }).run();

test('all hand-built machines pass the build checks and use only plain pieces', () => {
  const plain = ['core', 'beam', 'plate', 'block', 'wedge', 'disc', 'ball'];
  for (const r of ALL) { const c = validateBuild(r.build); assert.ok(c.ok, r.build.name + ': ' + c.errors.join(' ')); for (const p of r.build.parts) assert.ok(plain.includes(p.type), `${r.build.name} uses ${p.type}`); }
});

test('ready-made parts are gone from the kit', () => {
  for (const type of ['drive', 'track', 'thruster', 'gripper']) {
    const c = validateBuild({ name: 'Old', parts: [{ id: 'core', type: 'core' }, { id: 'x', type, pos: [0, 0, 1], parent: 'core' }] });
    assert.equal(c.ok, false, type);
  }
});

test('a broken build gets plain-language errors', () => {
  const bad = { name: 'Bad', parts: [{ id: 'core', type: 'core' }, { id: 'x', type: 'saw', pos: [0, 0, 0], parent: 'core' }, { id: 'y', type: 'plate', material: 'gold', size: [1, 0.1, 1], pos: [0, 0, 0], parent: 'nope' }] };
  const c = validateBuild(bad);
  assert.equal(c.ok, false);
  assert.ok(c.errors.some((e) => e.includes('unknown type "saw"')));
  assert.ok(c.errors.some((e) => e.includes('unknown material "gold"')));
});

test('the same seed gives exactly the same fight', () => {
  const a = play('Slinger', 'Rover', named('Crags'), 3), b = play('Slinger', 'Rover', named('Crags'), 3);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.result, b.result);
});

test('a machine left alone sits still and keeps all its parts', () => {
  for (const r of ALL) {
    const m = createMatch({ builds: [r.build, BRICK], programs: [idle, idle], seed: 1 }).run();
    assert.ok(m.result.reason.startsWith('settled'), r.build.name + ' ' + m.result.reason);
    assert.equal(m.events.filter((e) => e.type === 'part_lost').length, 0, r.build.name);
  }
});

test('nothing gets launched: no machine ever rises far above the floor', () => {
  for (const [a, b] of [['Rover', 'Mantis'], ['Slinger', 'Strider'], ['Thresher', 'Rover']]) { const m = play(a, b); for (const row of m.track) for (const i of [0, 1]) assert.ok(row[i].y < 4.5, `${a} v ${b} t=${row.t} machine ${i} at height ${row[i].y}`); }
});

test('a hinge with limits and a spring comes to rest inside its limits', () => {
  const b = { name: 'Flap', parts: [{ id: 'core', type: 'core' }, { id: 'base', type: 'plate', material: 'steel', size: [1.5, 0.1, 1.5], pos: [0, -0.25, 0], parent: 'core' },
    { id: 'flap', type: 'beam', material: 'steel', size: [0.1, 0.1, 1.0], pos: [0, 0.4, 0.6], parent: 'core', joint: { type: 'hinge', axis: [1, 0, 0], pivot: [0, 0.4, 0.1], limits: [-20, 20], spring: 400 } }] };
  const m = createMatch({ builds: [b, BRICK], programs: [idle, idle], seed: 1 });
  for (let i = 0; i < 480 * 3; i++) m.step();
  const angle = m.bots[0].byId.get('flap').angle;
  assert.ok(Math.abs(angle) < (25 * Math.PI) / 180, `flap at ${angle}`);
});

test('a wheel is a rubber disc on a geared-down motor, and six of them move a machine', () => {
  const m = createMatch({ builds: [ROVER, BRICK], programs: [(s, out) => { for (const id of ['wl_0', 'wl_1', 'wl_2', 'wr_0', 'wr_1', 'wr_2']) out[id] = 1; }, idle], seed: 1 });
  const z0 = m.bots[0].core.body.position.z; for (let i = 0; i < 480 * 3; i++) m.step();
  assert.ok(Math.abs(m.bots[0].core.body.position.z - z0) > 1.5);
});

test('a program can let go of a part: the thrower lands a ball near where it aimed', () => {
  const m = createMatch({ builds: [SLINGER, BRICK], programs: [byName('Slinger').program, idle], seed: 1 });
  for (let i = 0; i < 480 * 12; i++) m.step();
  assert.ok(m.events.some((e) => e.type === 'released'));
  assert.ok(m.events.some((e) => e.type === 'intent' && e.text.includes('throwing at')));
});

test('programs say what they are doing, and the fight records it', () => {
  const m = play('Rover', 'Mantis');
  for (const i of [0, 1]) assert.ok(m.events.some((e) => e.type === 'intent' && e.bot === i));
});

test('programs are told the whole state: every part of both machines and the challenge', () => {
  let seen = null;
  const m = createMatch({ builds: [ROVER, SLINGER], programs: [(s) => { seen = s; }, idle], seed: 1, challenge: named('Crags') });
  for (let i = 0; i < 40; i++) m.step();
  assert.equal(Object.keys(seen.self.parts).length, ROVER.parts.length);
  assert.equal(Object.keys(seen.enemy.parts).length, SLINGER.parts.length);
  assert.ok(seen.challenge.floor.length > 50 && seen.challenge.objective.type === 'knockout' && typeof seen.enemy.bearing === 'number');
});

test('a challenge is drawn from its number alone, and the same number gives the same round', () => {
  assert.deepEqual(drawChallenge(7), drawChallenge(7));
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => Object.values(drawChallenge(i + 1).keys).join()));
  assert.ok(kinds.size > 15, `only ${kinds.size} kinds in 40 draws`);
});

test('named challenges play to a result, and programs are told the conditions', () => {
  for (const ch of ['Valley', 'High ground', 'Narrow gap'].map(named)) {
    let seen = null;
    const a = byName('Rover'), b = byName('Strider');
    const m = createMatch({ builds: [a.build, b.build], programs: [(s, out, mem, lib) => { seen = s; a.program(s, out, mem, lib); }, b.program], seed: 2, challenge: ch }).run();
    assert.ok(m.result && m.result.t <= CONFIG.match.maxSeconds + 0.5, ch.name);
    assert.equal(seen.challenge.gravity, ch.gravity);
  }
});

test('a control program over the size limit does not run', () => {
  const big = new Function('s', 'out', `out.wl_0 = 1; /* ${'x'.repeat(CONFIG.program.maxChars)} */`);
  const m = createMatch({ builds: [ROVER, BRICK], programs: [big, idle], seed: 1, challenge: OPEN });
  for (let i = 0; i < 480; i++) m.step();
  assert.ok(m.events.some((e) => e.type === 'program_error'));
  assert.ok(m.bots[0].core.body.velocity.length() < 0.2);
});

test('floor friction matches the textbook: a sliding slab stops where it should, and rubber stops sooner', () => {
  const slide = (material) => {
    const brick = { name: 'Brick', parts: [{ id: 'core', type: 'core' }, { id: 'slab', type: 'plate', material, size: [1, 0.1, 1], pos: [0, -0.25, 0], parent: 'core' }] };
    const m = createMatch({ builds: [brick, brick], programs: [() => {}, () => {}], seed: 1 });
    for (let i = 0; i < 240; i++) m.step();
    const b = m.bots[0].core.body, x0 = b.position.x; b.velocity.set(3, 0, 0);
    for (let i = 0; i < 480 * 4; i++) m.step();
    return b.position.x - x0;
  };
  // Distance = speed squared / (2 x friction x gravity). Metal on the floor grips 0.3 at rest and 0.8 of that
  // once sliding, so 1.91 m. Rubber that is skidding has 0.6 of its rolling grip, so it stops in about 0.76 m,
  // not the 0.46 m full grip would give.
  const al = slide('aluminium'); assert.ok(Math.abs(al - 1.91) < 0.18, `aluminium slid ${al}`); const rub = slide('rubber'); assert.ok(rub > 0.5 && rub < 0.95, `rubber slid ${rub}`);
});

test('parts of one machine collide with each other: an arm swung down stops on its own deck', () => {
  const b = { name: 'Self', parts: [{ id: 'core', type: 'core' }, { id: 'deck', type: 'plate', material: 'aluminium', size: [1.2, 0.08, 2.4], pos: [0, -0.24, 0.6], parent: 'core' },
    { id: 'post', type: 'block', material: 'aluminium', size: [0.2, 0.5, 0.2], pos: [0, 0.45, 0], parent: 'core' },
    { id: 'arm', type: 'beam', material: 'steel', size: [0.1, 0.1, 1.2], pos: [0, 0.7, 0.75], parent: 'post', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, 0.7, 0.1], gear: 2 } }] };
  const m = createMatch({ builds: [b, BRICK], programs: [(s, out) => { out.arm = 1; }, idle], seed: 1 });
  for (let i = 0; i < 480 * 3; i++) m.step();
  const angle = m.bots[0].byId.get('arm').angle;
  assert.ok(angle > 0.4 && angle < 1.2, `arm at ${angle}`);
});

test('the route planner goes round a gap when it can and says so when it cannot', () => {
  const view = (ch, x, z) => ({ challenge: ch, self: { x, z, heading: 0, forwardSpeed: 0, speed: 0, vx: 0, vz: 0 } });
  const bridge = named('Bridge'), gap = drawChallenge(105, { layout: 'gap' });
  const far = bridge.floor[1];
  const p = LIB.plan(view(bridge, 6, bridge.floor[0].z), far.x + 6, far.z, { margin: 1.5, climb: 0.5, side: 0.5 });
  assert.equal(p.reachable, true); assert.ok(p.left > Math.abs(far.z - bridge.floor[0].z), 'the way round is longer than the straight line');
  const q = LIB.plan(view(gap, 0, gap.floor[0].z), 0, gap.floor[1].z, { margin: 1.5 });
  assert.equal(q.reachable, false); assert.ok(LIB.floorAt(view(gap, 0, 0), q.end.x, q.end.z));
});

test('the only ways to win are to break the enemy apart or put it off the floor; otherwise damage decides', () => {
  // A machine that sheds over half its mass has lost.
  const weak = structuredClone(CONFIG); weak.breakage.scale = 0.004;
  const a = createMatch({ builds: [ROVER, BRICK], programs: [byName('Rover').program, idle], config: weak }).run();
  assert.equal(a.result.reason, 'destroyed'); assert.equal(a.result.winner, 1);
  // A core that goes off the floor has lost.
  const b = createMatch({ builds: [ROVER, BRICK], programs: [(s, out) => { for (const id of ['wl_0', 'wl_1', 'wl_2', 'wr_0', 'wr_1', 'wr_2']) out[id] = -1; }, idle] }).run();
  assert.equal(b.result.reason, 'ring_out'); assert.equal(b.result.winner, 1);
  // Two machines that never touch draw: standing somewhere wins nothing.
  const c = createMatch({ builds: [BRICK, BRICK], programs: [idle, idle] }).run();
  assert.equal(c.result.winner, null);
});

test('rounds are drawn over land of every kind, and stepped rock is still there for rounds that ask for it', () => {
  const kinds = new Set();
  for (let n = 1; n <= 40; n++) kinds.add(drawChallenge(n).keys.ground);
  for (const k of ['valley', 'highground', 'downs', 'flat']) assert.ok(kinds.has(k), `no ${k} round in the first 40`);
  for (const [name, maxStep] of [['Crags', 0.6], ['Rubble', 0.3]]) {
    const ch = named(name), s = { challenge: ch };
    assert.ok(ch.floor.length > 50, `${name} has ${ch.floor.length} ledges`);
    let big = 0, steps = 0;
    for (let x = -9; x < 9; x += 1) for (let z = -9; z < 9; z += 1) { const d = Math.abs(LIB.stepAt(s, x + 0.5, z + 0.5) - LIB.stepAt(s, x + 1.5, z + 0.5)); big = Math.max(big, d); if (d > 0.05) steps++; }
    assert.ok(big <= maxStep + 0.01, `${name}: a step of ${big}`);
    assert.ok(steps > 45, `${name}: only ${steps} steps on 324 lines`);
    for (const sp of ch.spawn) assert.equal(LIB.stepAt(s, sp.x - 2, sp.z - 2), LIB.stepAt(s, sp.x + 2, sp.z + 2), 'starting pad is level');
  }
});

test('legs cross broken ground that wheels cannot: the walker reaches the enemy on the crags, the wheeled machine does not', () => {
  const reach = (name, ground) => {
    const m = createMatch({ builds: [byName(name).build, BRICK], programs: [byName(name).program, idle], challenge: named(ground) });
    let best = 99;
    while (!m.done && m.t < 40) { m.step(); const a = m.bots[0].core.body.position, b = m.bots[1].core.body.position; best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z)); }
    return best;
  };
  const walker = reach('Strider', 'Crags'), wheels = reach('Rover', 'Crags'), flat = reach('Rover', 'Open floor');
  assert.ok(walker < 3, `the walker got within ${walker.toFixed(1)} m`);
  assert.ok(wheels > 5, `the wheeled machine got within ${wheels.toFixed(1)} m`);
  assert.ok(flat < 3.5, `on flat floor the wheeled machine got within ${flat.toFixed(1)} m`);
});

test('machines stop for edges: across a gap on ice in low gravity nobody walks or drives off on their own', () => {
  const ch = drawChallenge(1, { layout: 'gap', surface: 'ice', gravity: 'low' });
  for (const r of ALL) { const m = createMatch({ builds: [r.build, BRICK], programs: [r.program, idle], seed: 1, challenge: ch }).run(); /* Knocking the brick off is fair; going off yourself is not. */ assert.ok(!(/ring_out/.test(m.result.reason) && m.result.winner !== 0), r.build.name + ' ' + m.result.text); }
});

test('broken-off wheels come to rest instead of rolling away', () => {
  // Joints made so weak that the machine sheds its wheels as soon as it drives.
  const config = structuredClone(CONFIG); config.breakage.scale = 0.004; config.match.stalemateSeconds = 99; config.match.wreckShare = 2;
  const m = createMatch({ builds: [byName('Rover').build, BRICK], programs: [(st, out) => { if (st.t < 4) for (const id of ['wl_0', 'wl_1', 'wl_2', 'wr_0', 'wr_1', 'wr_2']) out[id] = 0.6; }, idle], config });
  // It drives for four seconds, shedding pieces, then cuts its power. Ten seconds later nothing should be moving.
  while (!m.done && m.t < 14) m.step();
  const loose = m.bots[0].bodies.filter((b) => !b.live);
  assert.ok(loose.length >= 3, `only ${loose.length} pieces came off`);
  for (const b of loose) {
    assert.ok(b.position.y > -1, `${b.rootPart.id} left the floor`);
    assert.ok(b.velocity.length() < 0.3, `${b.rootPart.id} is still moving at ${b.velocity.length().toFixed(2)} m/s`);
  }
});

// Earth physics. Each check lets go of one loose piece and compares what it does with the textbook figure.
const loose = (part) => {
  const config = structuredClone(CONFIG); config.match.stalemateSeconds = 999; config.match.maxSeconds = 999;
  const build = { name: 'Holder', parts: [{ id: 'core', type: 'core' }, { parent: 'core', ...part }] };
  let let_go = false;
  const m = createMatch({ builds: [build, { name: 'Brick', parts: [{ id: 'core', type: 'core' }] }], programs: [(s, out) => { if (!let_go) { out.release = [part.id]; let_go = true; } }, idle], config });
  while (m.t < 1.5) m.step();
  const b = m.parts.find((p) => p.id === part.id && p.bot === m.bots[0]).body; b.wakeUp();
  return { m, b };
};

test('a rolling ball slows down and stops, about where rolling resistance says it should', () => {
  const { m, b } = loose({ id: 'ball', type: 'ball', material: 'steel', radius: 0.2, pos: [1.5, 0, 0] });
  const z0 = b.position.z, t0 = m.t; b.velocity.set(0, 0, 3); b.angularVelocity.set(15, 0, 0);
  while (b.velocity.length() > 0.05 && m.t < t0 + 40) m.step();
  // A solid ball rolling loses speed at 5/7 x resistance x gravity: from 3 m/s that is 10.7 m.
  const want = 9 / (2 * (5 / 7) * CONFIG.ground.rollHard * CONFIG.physics.gravity), went = b.position.z - z0;
  assert.ok(Math.abs(went - want) < want * 0.25, `rolled ${went.toFixed(1)} m, theory ${want.toFixed(1)} m`);
  for (let i = 0; i < 480 * 2; i++) m.step();
  assert.equal(b.sleepState, 2, 'it has come to rest for good');
});

test('air slows a light thrown ball and barely touches a heavy one', () => {
  const range = (material) => {
    const { m, b } = loose({ id: 'ball', type: 'ball', material, radius: 0.2, pos: [1.5, 0, 0] });
    b.position.y = 1; const z0 = b.position.z; b.velocity.set(0, 12, 12); b.angularVelocity.set(0, 0, 0);
    while (b.position.y > 0.25 || b.velocity.y > 0) m.step();
    return b.position.z - z0;
  };
  const vacuum = (12 * (12 + Math.sqrt(144 + 2 * 9.81 * 0.75))) / 9.81, light = range('plastic'), heavy = range('steel');
  assert.ok(light < vacuum * 0.88 && light > vacuum * 0.6, `plastic ball went ${light.toFixed(1)} m of ${vacuum.toFixed(1)}`);
  assert.ok(heavy > vacuum * 0.93, `steel ball went ${heavy.toFixed(1)} m of ${vacuum.toFixed(1)}`);
});

test('the long walker crosses a gap that stops the others, and refuses one that is too wide', () => {
  const find = (want) => { for (let n = 300; n < 400; n++) { const ch = drawChallenge(n, { layout: 'gap', ground: 'flat', surface: 'normal', gravity: 'normal' }); const g = Number(ch.brief.match(/([\d.]+) m gap/)[1]); if (Math.abs(g - want) < 0.15) return ch; } };
  const cross = (name, ch) => { const r = byName(name), m = createMatch({ builds: [r.build, BRICK], programs: [r.program, idle], challenge: ch }); while (!m.done && m.t < 25) m.step(); return { z: m.bots[0].core.body.position.z, lost: m.bots[0].parts.filter((p) => !p.live).length, out: m.result && m.result.reason === 'ring_out' }; };
  const narrow = find(1.6), wide = find(2.8);
  const a = cross('Centipede', narrow); assert.ok(a.z > 2 && a.lost === 0, `Centipede ended at z=${a.z.toFixed(1)} having lost ${a.lost} parts`);
  const b = cross('Strider', narrow); assert.ok(b.z < 0 && !b.out, `Strider ended at z=${b.z.toFixed(1)}`);
  const c = cross('Centipede', wide); assert.ok(c.z < 0 && !c.out, `Centipede tried a 2.8 m gap and ended at z=${c.z.toFixed(1)}`);
});

test('land is drawn like a game map: walkable ground, a hill too steep to climb except by its ramps, and no water', () => {
  const ch = named('Valley'), t = ch.terrain, H = (ix, iz) => t.heights[iz * t.nx + ix];
  assert.ok(t && !ch.water, 'the valley has land and no water');
  // The same from either end.
  for (let iz = 0; iz < t.nz; iz++) for (let ix = 0; ix < t.nx; ix++) assert.ok(Math.abs(H(ix, iz) - H(t.nx - 1 - ix, t.nz - 1 - iz)) < 0.02, 'the map is the same from both ends');
  let top = 0, steep = 0;
  for (let iz = 1; iz < t.nz - 1; iz++) for (let ix = 1; ix < t.nx - 1; ix++) { top = Math.max(top, H(ix, iz)); steep = Math.max(steep, Math.abs(H(ix + 1, iz) - H(ix, iz))); }
  assert.ok(top > 2 && steep > 0.7, `top ${top}, steepest ${steep}`);
  const s = { challenge: ch, self: { x: ch.spawn[0].x, z: ch.spawn[0].z } };
  assert.ok(LIB.plan(s, ch.spawn[1].x, ch.spawn[1].z, { margin: 2 }).reachable, 'there is a way across');
});

test('water bears up what is lighter than it and not what is heavier', () => {
  // No map has water now, so this makes a pond: the downs with the water level set above its lowest hollow.
  const base = named('Downs'), ch = { ...base, water: { level: Math.min(...base.terrain.heights) + 0.9 } };
  const boat = (material) => ({ name: material, parts: [{ id: 'core', type: 'core' }, { id: 'hull', type: 'block', material, size: [0.6, 0.6, 0.6], pos: [0, 0, 0.5], parent: 'core' }] });
  // Find deep water and start both there.
  const t = ch.terrain; let at = null;
  for (let iz = 2; iz < t.nz - 2 && !at; iz++) for (let ix = 2; ix < t.nx - 2 && !at; ix++) if (ch.water.level - t.heights[iz * t.nx + ix] > 0.5) at = { x: t.x0 + ix, z: t.z0 + iz };
  const pond = { ...ch, spawn: [at, ch.spawn[1]] };
  const y = (material) => { const m = createMatch({ builds: [boat(material), BRICK], programs: [idle, idle], seed: 1, challenge: pond }); while (m.t < 4) m.step(); const hull = m.bots[0].parts.find((p) => p.id === 'hull'); return hull.body.position.y - (ch.water.level - 0.5); };
  assert.ok(y('plastic') > y('steel') + 0.1, 'plastic rides higher than steel');
});

test('a thicker beam makes a stronger joint, and a pivot has to be on its own part', () => {
  const b = (size) => ({ name: 'B', parts: [{ id: 'core', type: 'core' }, { id: 'a', type: 'beam', material: 'steel', size, pos: [0, 0, 1], parent: 'core' }] });
  const strength = (size) => createMatch({ builds: [b(size), BRICK], programs: [idle, idle], seed: 1 }).bots[0].parts.find((p) => p.id === 'a').strength;
  assert.ok(strength([0.3, 0.3, 1.5]) > 2 * strength([0.12, 0.12, 1.5]));
  const far = { name: 'Far', parts: [{ id: 'core', type: 'core' }, { id: 'w', type: 'block', material: 'steel', size: [0.3, 0.3, 0.3], pos: [0, 0.5, -1], parent: 'core', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, 0.5, 1] } }] };
  assert.equal(validateBuild(far).ok, false);
});

test('a motor told an angle goes there and holds it', () => {
  const arm = { name: 'Arm', parts: [{ id: 'core', type: 'core' }, { id: 'mast', type: 'block', material: 'steel', size: [0.6, 0.6, 0.6], pos: [0, 0.5, 0], parent: 'core' },
    { id: 'hub', type: 'disc', material: 'aluminium', radius: 0.2, thickness: 0.1, pos: [0, 0.9, 0], parent: 'mast', joint: { type: 'motor', axis: [0, 1, 0], gear: 8, power: 0.5 } },
    { id: 'boom', type: 'beam', material: 'aluminium', size: [0.1, 0.1, 1.2], pos: [0, 0.9, 0.7], parent: 'hub' }] };
  const m = createMatch({ builds: [arm, BRICK], programs: [(s, out) => { out.hub = { angle: s.t < 2 ? 1 : -0.5 }; }, idle], seed: 1 });
  const hub = m.bots[0].parts.find((p) => p.id === 'hub');
  while (m.t < 1.9) m.step();
  assert.ok(Math.abs(hub.angle - 1) < 0.05, `asked for 1 rad, at ${hub.angle.toFixed(2)}`);
  while (m.t < 3.9) m.step();
  assert.ok(Math.abs(hub.angle + 0.5) < 0.05, `asked for -0.5 rad, at ${hub.angle.toFixed(2)}`);
});
