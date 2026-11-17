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
  for (let seed = 1; seed <= 8; seed++) { const m = fight(seed); assert.ok(m.result && m.result.t <= CONFIG.match.maxSeconds + 0.5, `seed ${seed}`); }
});

test('nothing gets launched: no bot ever rises far above the floor', () => {
  for (let seed = 1; seed <= 8; seed++) { const m = fight(seed); for (const row of m.track) for (const i of [0, 1]) assert.ok(row[i].y < 2.5, `seed ${seed} t=${row.t} bot ${i} at height ${row[i].y}`); }
});

test('a bot left alone sits still and keeps all its parts', () => {
  const idle = () => {};
  const m = createMatch({ builds: [DOORSTOP, DOORSTOP], programs: [idle, idle], seed: 1 }).run();
  assert.equal(m.result.reason, 'both_stuck');
  assert.equal(m.events.filter((e) => e.type === 'part_lost').length, 0);
});

test('weaker joints mean more parts come off', () => {
  const count = (scale) => { const cfg = structuredClone(CONFIG); cfg.breakage.scale = scale; let n = 0; for (let s = 1; s <= 8; s++) n += fight(s, cfg).events.filter((e) => e.type === 'part_lost').length; return n; };
  assert.ok(count(0.4) > count(2.5));
});

test('joint angle sensors follow the motor: a powered flipper lifts', () => {
  const lift = (s, out) => { out.flipper = -1; };
  const m = createMatch({ builds: [ALL[2].build, DOORSTOP], programs: [lift, () => {}], seed: 1 });
  for (let i = 0; i < 240; i++) m.step();
  assert.ok(m.bots[0].byId.get('flipper').angle < -0.5);
});
