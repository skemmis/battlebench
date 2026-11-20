import { kit } from '../kit.js';
const { hunt, beam } = kit;

export const idea = 'A flipper, to end the draws. Thick-steel machines shrug off every blow in the league, so this one does not try to break them: it slides three steel pads under the enemy and fires them upward together on geared pistons, 30 kN in all, enough to throw a 700 kg machine off its feet. Then it drives the tumbling machine out before it recovers.';
export const target = 'Jab';

const wheel = (id, x, z, parent) => ({ id, type: 'disc', material: 'rubber', radius: 0.45, thickness: 0.2, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 5, power: 1 } });
const PADS = ['pad_l', 'pad_m', 'pad_r'];
export const build = {
  name: 'Toss',
  note: 'Six wheels and three steel pads that lie flat ahead of its nose. It gets the pads under the enemy and fires all three upward at once to throw it over, then pushes it out while it is off its feet.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.3, 0.3, 2.2], [0, 0, 0], 'core', 'steel'),
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [1.5, 0.3, 0.3], [0, 0, i * 0.95], 'spine', 'steel'), wheel('wl_' + (i + 1), 0.9, i * 0.95, 'axle_' + (i + 1)), wheel('wr_' + (i + 1), -0.9, i * 0.95, 'axle_' + (i + 1))]),
    beam('brow', [1.7, 0.3, 0.3], [0, -0.22, 1.3], 'spine', 'steel'),
    ...PADS.map((id, k) => ({ id, type: 'plate', material: 'steel', size: [0.54, 0.08, 1.3], pos: [(1 - k) * 0.57, -0.36, 2.08], parent: 'brow', joint: { type: 'piston', axis: [0, 1, 0], stroke: 0.6, gear: 2 } })),
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 2.9, top: 5, margin: 2.0, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false };
  const L = ['wl_0', 'wl_1', 'wl_2'], R = ['wr_0', 'wr_1', 'wr_2'];
  const drive = (d, t) => { for (const id of L) out[id] = lib.clamp(d - t); for (const id of R) out[id] = lib.clamp(d + t); };
  const firing = s.t < (mem.fire || 0);
  for (const id of PADS) out[id] = firing ? 1 : 0;
  if (me.upright < 0.2) { out.say = 'tipped, kicking off the ground with the pads'; for (const id of PADS) out[id] = Math.sin(s.t * 4) > 0 ? 1 : 0; drive(Math.sin(s.t * 5), 0.5); return; }
  const pads = PADS.map((id) => me.joints[id]).filter(Boolean), ready = pads.length && pads.every((j) => j.charge > 0.95 && j.extension < 0.05);
  // Under it: the pads reach from 1.4 to 2.7 m ahead of the core. Fire when the enemy's middle is over them.
  const over = foe.distance < 3.3 && Math.abs(foe.bearing) < 0.35;
  if (over && ready && !firing) { mem.fire = s.t + 0.3; mem.tossed = (mem.tossed || 0) + 1; for (const id of PADS) out[id] = 1; }
  const h = hunt(s, lib), n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6 });
  const down = Math.abs(foe.upright) < 0.6;
  out.say = n.braking ? 'braking for the edge' : s.t < (mem.fire || 0) + 0.4 ? `pads under it, throwing it (throw ${mem.tossed})` : down && foe.distance < 4.5 ? 'it is off its feet, driving it out' : over ? 'pads under it, waiting on the charge' : h.say;
  drive(n.drive, n.turn);
}
