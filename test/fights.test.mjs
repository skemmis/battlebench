// Run with: npm test
// These are the checks to rerun after any change to parts or physics values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createMatch, validateBuild } from '../src/sim.js';
import { ROSTER, ALL, DOORSTOP } from '../src/bots.js';

const fight = (seed, config = CONFIG) => createMatch({ builds: ROSTER.map((r) => r.build), programs: ROSTER.map((r) => r.program), seed, config }).run();

test('all hand-written bots pass the build checks', () => {
  for (const r of ALL) { const c = validateBuild(r.build); assert.ok(c.ok, c.errors.join(' ')); }
});

test('a broken build gets plain-language errors', () => {
  const bad = { name: 'Bad', parts: [{ id: 'core', type: 'core' }, { id: 'x', type: 'saw', pos: [0, 0, 0], parent: 'core' }, { id: 'y', type: 'plate', material: 'gold', size: [1, 0.1, 1], pos: [0, 0, 0], parent: 'nope' }] };
  const c = validateBuild(bad);
  assert.equal(c.ok, false);
  assert.ok(c.errors.some((e) => e.includes('unknown type "saw"')));
  assert.ok(c.errors.some((e) => e.includes('unknown material "gold"')));
});

test('the same seed gives exactly the same fight', () => {
  const a = fight(3), b = fight(3);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.result, b.result);
});

test('every fight ends with a result inside the time limit', () => {
  for (let seed = 1; seed <= 4; seed++) { const m = fight(seed); assert.ok(m.result && m.result.t <= CONFIG.match.maxSeconds + 0.5, `seed ${seed}`); }
});

test('nothing gets launched: no bot ever rises far above the floor', () => {
  for (let seed = 1; seed <= 4; seed++) { const m = fight(seed); for (const row of m.track) for (const i of [0, 1]) assert.ok(row[i].y < 2.5, `seed ${seed} t=${row.t} bot ${i} at height ${row[i].y}`); }
});

test('a bot left alone sits still and keeps all its parts', () => {
  const idle = () => {};
  const m = createMatch({ builds: [DOORSTOP, DOORSTOP], programs: [idle, idle], seed: 1 }).run();
  assert.ok(m.result.reason.startsWith('settled'));
  assert.equal(m.events.filter((e) => e.type === 'part_lost').length, 0);
});

test('weaker joints mean more parts come off', () => {
  const count = (scale) => { const cfg = structuredClone(CONFIG); cfg.breakage.scale = scale; let n = 0; for (let s = 1; s <= 4; s++) n += fight(s, cfg).events.filter((e) => e.type === 'part_lost').length; return n; };
  assert.ok(count(0.4) > count(2.5));
});

test('joint angle sensors follow the motor: a powered flipper lifts', () => {
  const lift = (s, out) => { out.flipper = -1; };
  const m = createMatch({ builds: [ALL[2].build, DOORSTOP], programs: [lift, () => {}], seed: 1 });
  for (let i = 0; i < 480; i++) m.step();
  assert.ok(m.bots[0].byId.get('flipper').angle < -0.5);
});

const byName = (n) => ALL.find((r) => r.build.name === n);

test('a piston stores energy: a kick lifts the hopper off the floor and drains charge', () => {
  const flea = byName('Flea');
  const m = createMatch({ builds: [flea.build, DOORSTOP], programs: [flea.program, () => {}], seed: 1 });
  const y0 = m.bots[0].core.body.position.y; let top = 0, low = 1;
  for (let i = 0; i < 480 * 2; i++) { m.step(); top = Math.max(top, m.bots[0].core.body.position.y - y0); low = Math.min(low, m.bots[0].byId.get('leg_l').charge); }
  assert.ok(top > 0.08, `rose ${top}`); assert.ok(low < 0.9, `charge ${low}`);
});

test('a program can let go of a part, and the part flies on as a loose object', () => {
  const sling = byName('Slingshot');
  const m = createMatch({ builds: [sling.build, DOORSTOP], programs: [sling.program, () => {}], seed: 1 });
  for (let i = 0; i < 480 * 12 && !m.events.some((e) => e.type === 'released'); i++) m.step();
  assert.ok(m.events.some((e) => e.type === 'released'));
  for (let i = 0; i < 20; i++) m.step();
  const ball = m.bots[0].byId.get('shot_1');
  assert.equal(ball.live, false); assert.ok(ball.body.velocity.length() > 5);
});

test('sitting still on the centre can win: the win rule does not demand a fight', () => {
  const sq = byName('Squatter');
  const m = createMatch({ builds: [sq.build, DOORSTOP], programs: [sq.program, () => {}], seed: 1 }).run();
  assert.equal(m.result.winner, 0); assert.ok(m.result.reason.endsWith('center'));
});

test('programs are told the whole state: every part of both bots and loose objects', () => {
  let seen = null;
  const spy = (s) => { seen = s; };
  const m = createMatch({ builds: [DOORSTOP, DOORSTOP], programs: [spy, () => {}], seed: 1 });
  for (let i = 0; i < 40; i++) m.step();
  assert.ok(seen.enemy.parts.scoop.attached && typeof seen.enemy.parts.scoop.x === 'number');
  assert.ok(Array.isArray(seen.loose) && typeof seen.enemy.vx === 'number' && typeof seen.timeLeft === 'number');
});
