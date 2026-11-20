import { kit } from '../kit.js';
const { hunt, beam, block, plate } = kit;

export const idea = 'Win the shoving match by taking the enemy\'s weight. A heavy wheeled machine slides a steel fork under the enemy and lifts: the enemy\'s feet lose their grip, that weight lands on this machine\'s front wheels, and it carries the enemy to the edge. Nothing in the league lifts.';
export const target = 'Ox';

const wheel = (id, x, z, parent) => ({ id, type: 'disc', material: 'rubber', radius: 0.5, thickness: 0.2, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 6, power: 0.7 } });
export const build = {
  name: 'Lever',
  note: 'Six driven wheels, steel ballast over the back axle and a lifting fork on the nose. It gets the fork under the enemy, lifts until the enemy\'s front is off the ground, and drives it out of the ring.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.24, 0.2, 2.4], [0, 0, 0], 'core', 'steel'),
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [1.6, 0.2, 0.2], [0, 0, i * 1.05], 'spine'), wheel('wl_' + (i + 1), 0.95, i * 1.05, 'axle_' + (i + 1)), wheel('wr_' + (i + 1), -0.95, i * 1.05, 'axle_' + (i + 1))]),
    block('ballast_0', [0.6, 0.4, 0.6], [0, 0.3, -0.9], 'spine', 'steel'), block('ballast_1', [0.6, 0.4, 0.5], [0, 0.3, -0.3], 'spine', 'steel'),
    beam('brow', [1.5, 0.22, 0.22], [0, -0.1, 1.45], 'spine', 'steel'),
    // The fork: two steel tines on one motor, pivoted at the brow and lying just clear of the ground.
    { id: 'fork', type: 'plate', material: 'steel', size: [1.5, 0.08, 1.5], pos: [0, -0.4, 2.3], rot: [8, 0, 0], parent: 'brow', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, -0.3, 1.56], gear: 8, power: 1, limits: [-55, 4] } },
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 3.1, top: 4.5, margin: 2.2, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem };
  const L = ['wl_0', 'wl_1', 'wl_2'], R = ['wr_0', 'wr_1', 'wr_2'];
  const drive = (d, t) => { for (const id of L) out[id] = lib.clamp(d - t); for (const id of R) out[id] = lib.clamp(d + t); };
  const fork = me.joints.fork, UP = -0.75;
  const hold = (to, max = 1) => { if (fork) out.fork = lib.clamp((to - fork.angle) * 4, -max, max); };
  if (me.upright < 0.2) { out.say = 'tipped, pushing off the ground with the fork'; hold(Math.sin(s.t * 3) > 0 ? UP : 0.05); drive(Math.sin(s.t * 5), 0.5); return; }
  const h = hunt(s, lib), under = foe.distance < 3.9 && Math.abs(foe.bearing) < 0.4;
  // Fork under it: lift, and keep driving. Count how long it has been under so a lift that gets nowhere is let go.
  mem.under = under ? (mem.under || 0) + 1 : 0;
  const lifting = under && mem.under > 6 && s.t > (mem.rest || 0);
  if (lifting && me.speed < 0.25 && mem.under > 120) { mem.rest = s.t + 1.2; mem.under = 0; }
  hold(lifting ? UP : 0.03, lifting ? 1 : 0.5);
  if (s.t < (mem.rest || 0)) { out.say = 'lift got nowhere, dropping the fork and backing out for another bite'; const g = lib.guard(s, -0.8, SELF); drive(g.drive, lib.clamp(foe.bearing, -0.3, 0.3)); return; }
  const n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6, feed: !under });
  out.say = n.braking ? 'braking for the edge' : lifting ? `fork under it and lifting (${fork ? Math.round(-fork.angle * 57) : 0} degrees), carrying it out` : under ? 'sliding the fork under it' : h.say;
  drive(n.drive, n.turn);
}
