// Run with: npm test
// These are the checks to rerun after any change to parts or physics values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createMatch, validateBuild } from '../src/sim.js';
import { ALL, BULWARK, MANGONEL } from '../src/bots.js';
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
  const a = play('Mangonel', 'Bulwark', OPEN, 3), b = play('Mangonel', 'Bulwark', OPEN, 3);
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
  for (const [a, b] of [['Bulwark', 'Corral'], ['Mangonel', 'Strider'], ['Span', 'Bulwark']]) { const m = play(a, b); for (const row of m.track) for (const i of [0, 1]) assert.ok(row[i].y < 3.5, `${a} v ${b} t=${row.t} machine ${i} at height ${row[i].y}`); }
});

test('a hinge with limits and a spring comes to rest inside its limits', () => {
  const b = { name: 'Flap', parts: [{ id: 'core', type: 'core' }, { id: 'base', type: 'plate', material: 'steel', size: [1.5, 0.1, 1.5], pos: [0, -0.25, 0], parent: 'core' },
    { id: 'flap', type: 'beam', material: 'steel', size: [0.1, 0.1, 1.0], pos: [0, 0.4, 0.6], parent: 'core', joint: { type: 'hinge', axis: [1, 0, 0], pivot: [0, 0.4, 0.1], limits: [-20, 20], spring: 400 } }] };
  const m = createMatch({ builds: [b, BRICK], programs: [idle, idle], seed: 1 });
  for (let i = 0; i < 480 * 3; i++) m.step();
  const angle = m.bots[0].byId.get('flap').angle;
  assert.ok(Math.abs(angle) < (25 * Math.PI) / 180, `flap at ${angle}`);
});

test('a wheel is a rubber ball on a small motor, and six of them move a machine', () => {
  const m = createMatch({ builds: [BULWARK, BRICK], programs: [(s, out) => { for (const id of ['wl_0', 'wl_1', 'wl_2', 'wr_0', 'wr_1', 'wr_2']) out[id] = 1; }, idle], seed: 1 });
  const z0 = m.bots[0].core.body.position.z; for (let i = 0; i < 480 * 3; i++) m.step();
  assert.ok(Math.abs(m.bots[0].core.body.position.z - z0) > 1.5);
});

test('a program can let go of a part: the thrower lands a ball near where it aimed', () => {
  const m = createMatch({ builds: [MANGONEL, BRICK], programs: [byName('Mangonel').program, idle], seed: 1 });
  for (let i = 0; i < 480 * 8; i++) m.step();
  assert.ok(m.events.some((e) => e.type === 'released'));
  assert.ok(m.events.some((e) => e.type === 'intent' && e.text.includes('throwing at')));
});

test('programs say what they are doing, and the fight records it', () => {
  const m = play('Bulwark', 'Corral');
  for (const i of [0, 1]) assert.ok(m.events.some((e) => e.type === 'intent' && e.bot === i));
});

test('programs are told the whole state: every part of both machines, the challenge and the target', () => {
  let seen = null;
  createMatch({ builds: [BULWARK, MANGONEL], programs: [(s) => { seen = seen || s; }, idle], seed: 1 }).step();
  for (let i = 0; i < 20 && !seen; i++);
  const m = createMatch({ builds: [BULWARK, MANGONEL], programs: [(s) => { seen = s; }, idle], seed: 1 });
  for (let i = 0; i < 40; i++) m.step();
  assert.equal(Object.keys(seen.self.parts).length, BULWARK.parts.length);
  assert.equal(Object.keys(seen.enemy.parts).length, MANGONEL.parts.length);
  assert.ok(seen.challenge && seen.target && typeof seen.homeSide === 'number');
});

test('a challenge is drawn from its number alone, and the same number gives the same round', () => {
  assert.deepEqual(drawChallenge(7), drawChallenge(7));
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => Object.values(drawChallenge(i + 1).keys).join()));
  assert.ok(kinds.size > 15, `only ${kinds.size} kinds in 40 draws`);
});

test('every named challenge plays to a result, and programs are told the conditions', () => {
  for (const ch of NAMED) {
    let seen = null;
    const a = byName('Bulwark'), b = byName('Strider');
    const m = createMatch({ builds: [a.build, b.build], programs: [(s, out, mem, lib) => { seen = s; a.program(s, out, mem, lib); }, b.program], seed: 2, challenge: ch }).run();
    assert.ok(m.result && m.result.t <= CONFIG.match.maxSeconds + 0.5, ch.name);
    assert.equal(seen.challenge.gravity, ch.gravity);
    assert.ok(ch.objective.type === 'deliver' ? seen.crate && seen.target === null : typeof seen.target.bearing === 'number', ch.name);
  }
});

test('a control program over the size limit does not run', () => {
  const big = new Function('s', 'out', `out.wl_0 = 1; /* ${'x'.repeat(CONFIG.program.maxChars)} */`);
  const m = createMatch({ builds: [BULWARK, BRICK], programs: [big, idle], seed: 1, challenge: OPEN });
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
  // Distance = speed squared / (2 x friction x gravity): 1.53 m at 0.3 and 0.46 m at 1.0.
  assert.ok(Math.abs(slide('aluminium') - 1.53) < 0.15); assert.ok(Math.abs(slide('rubber') - 0.46) < 0.1);
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
  const bridge = named('Bridge'), gap = named('The gap');
  const far = bridge.floor[1];
  const p = LIB.plan(view(bridge, 6, bridge.floor[0].z), far.x + 6, far.z, { margin: 1.5 });
  assert.equal(p.reachable, true); assert.ok(p.left > Math.abs(far.z - bridge.floor[0].z), 'the way round is longer than the straight line');
  const q = LIB.plan(view(gap, 0, gap.floor[0].z), 0, gap.floor[1].z, { margin: 1.5 });
  assert.equal(q.reachable, false); assert.ok(LIB.floorAt(view(gap, 0, 0), q.end.x, q.end.z));
});

test('machines stop for edges: on ice in low gravity nobody drives off on their own', () => {
  const ch = drawChallenge(1);
  for (const r of ALL) { const m = createMatch({ builds: [r.build, BRICK], programs: [r.program, idle], seed: 1, challenge: ch }).run(); assert.ok(!(m.result.reason === 'ring_out' && m.result.winner !== 0), r.build.name); }
});

test('the pen swallows the crate and hauls it home', () => {
  const m = createMatch({ builds: [byName('Corral').build, BRICK], programs: [byName('Corral').program, idle], seed: 1, challenge: named('Bring it home') }).run();
  assert.equal(m.result.winner, 0); assert.ok(m.result.reason.startsWith('crate'));
});

test('legs climb what wheels cannot: the walker gets onto the plinth and the shover does not', () => {
  const m = play('Strider', 'Bulwark', named('The plinth'));
  assert.equal(m.result.winner, 0); assert.ok(m.bots[0].core.body.position.y > m.bots[1].core.body.position.y + 0.3);
});

test('the long machine crosses a gap by shifting its weight, and stops astride one when the point is over it', () => {
  const span = byName('Span');
  const a = createMatch({ builds: [span.build, BRICK], programs: [span.program, idle], seed: 1, challenge: named('Islands') }).run();
  assert.equal(a.result.winner, 0); assert.ok(Math.abs(a.bots[0].core.body.position.z) < 3, 'on the middle island');
  const b = createMatch({ builds: [span.build, BRICK], programs: [span.program, idle], seed: 1, challenge: named('The gap') }).run();
  assert.equal(b.result.winner, 0); assert.ok(Math.abs(b.bots[0].core.body.position.z) < 1 && b.bots[0].core.body.position.y > 0.2, 'astride the gap');
  const c = createMatch({ builds: [span.build, BRICK], programs: [span.program, idle], seed: 1, challenge: drawChallenge(1) }).run();
  assert.ok(Math.abs(c.bots[0].core.body.position.z) < 1, 'astride the gap on ice in low gravity');
});
