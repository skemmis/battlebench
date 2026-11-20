import { kit } from '../kit.js';
const { hunt, beam } = kit;

export const idea = 'Pivot\'s bars take legs and axles, the things that stick out. Bull has nothing sticking out: wheels inside steel side rails, a steel prow across the front and a low blade ahead of it, on the rocker axle so it can turn. It carries no weapon at all. At over a tonne against Pivot\'s 737 kg it means to get the blade under Pivot\'s bars and walk it out of the ring.';
export const target = 'Pivot';

const wheel = (id, x, z, parent, y = 0) => ({ id, type: 'disc', material: 'rubber', radius: 0.45, thickness: 0.2, pos: [x, y, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 5, power: 1 } });
export const build = {
  name: 'Bull',
  note: 'Six wheels boxed in by steel rails, with a steel prow and a low blade in front. No weapon: it shoves the enemy out of the ring.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.3, 0.3, 2.2], [0, 0, 0], 'core', 'steel'),
    // The middle axle sits 7 cm lower than the other two, so the machine rocks on its middle wheels and can turn on the spot.
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [1.5, 0.3, 0.3], [0, i ? 0 : -0.07, i * 0.95], 'spine', 'steel'), wheel('wl_' + (i + 1), 0.9, i * 0.95, 'axle_' + (i + 1), i ? 0 : -0.07), wheel('wr_' + (i + 1), -0.9, i * 0.95, 'axle_' + (i + 1), i ? 0 : -0.07)]),
    beam('nose', [0.3, 0.3, 0.8], [0, 0, 1.5], 'spine', 'steel'),
    beam('prow', [2.4, 0.3, 0.3], [0, -0.12, 1.75], 'nose', 'steel'),
    beam('rail_l', [0.2, 0.3, 2.4], [1.2, -0.12, 0.4], 'prow', 'steel'),
    beam('rail_r', [0.2, 0.3, 2.4], [-1.2, -0.12, 0.4], 'prow', 'steel'),
    { id: 'blade', type: 'plate', material: 'steel', size: [2.4, 0.1, 0.8], pos: [0, -0.33, 2.3], parent: 'prow' },
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 2.9, top: 5, margin: 2.0, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false };
  const L = ['wl_0', 'wl_1', 'wl_2'], R = ['wr_0', 'wr_1', 'wr_2'];
  const drive = (d, t) => { for (const id of L) out[id] = lib.clamp(d - t); for (const id of R) out[id] = lib.clamp(d + t); };
  if (me.upright < 0.2) { out.say = 'tipped, rocking the wheels'; drive(Math.sin(s.t * 5), 0.5); return; }
  const h = hunt(s, lib), n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6 });
  out.say = n.braking ? 'braking for the edge' : foe.distance < 3.5 && Math.abs(foe.bearing) < 0.5 ? 'blade under it, shoving' : h.say;
  drive(n.drive, n.turn);
}
