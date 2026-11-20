import { kit } from '../kit.js';
const { hunt, beam, block } = kit;

export const idea = 'Wasp from round 1 rebuilt for a small ring, where there is no room to reach top speed: six wheels on full-size motors for pull-away, thick steel axles, and runs that start from seven metres out. A wheeled wedge that hits the enemy on the side facing away from the nearest edge, and if the enemy does not give, pulls out and comes again from a new angle instead of leaning on it.';
export const target = 'Warden';

const wheel = (id, x, z, parent) => ({ id, type: 'disc', material: 'rubber', radius: 0.45, thickness: 0.2, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 4, power: 1 } });
export const build = {
  name: 'Bolt',
  note: 'A low steel wedge on six hard-pulling wheels. It does not push: it charges, strikes, pulls out and charges again from another side, always toward the nearest edge.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.2, 0.16, 2.0], [0, 0, 0], 'core', 'steel'),
    beam('axle_f', [1.5, 0.3, 0.3], [0, 0, 0.95], 'spine', 'steel'), beam('axle_m', [1.5, 0.3, 0.3], [0, 0, 0], 'spine', 'steel'), beam('axle_b', [1.5, 0.3, 0.3], [0, 0, -0.95], 'spine', 'steel'),
    wheel('wl_f', 0.9, 0.95, 'axle_f'), wheel('wr_f', -0.9, 0.95, 'axle_f'), wheel('wl_m', 0.9, 0, 'axle_m'), wheel('wr_m', -0.9, 0, 'axle_m'), wheel('wl_b', 0.9, -0.95, 'axle_b'), wheel('wr_b', -0.9, -0.95, 'axle_b'),
    { id: 'nose', type: 'wedge', material: 'steel', size: [1.6, 0.36, 0.7], pos: [0, -0.2, 1.6], parent: 'axle_f' },
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, TOP = 8, SELF = { length: 2.1, top: TOP, margin: 1.6, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem };
  const flip = me.upright < 0 ? -1 : 1;
  const drive = (d, t) => { d *= flip; out.wl_f = out.wl_m = out.wl_b = lib.clamp(d - t); out.wr_f = out.wr_m = out.wr_b = lib.clamp(d + t); };
  if (Math.abs(me.upright) < 0.3) { out.say = 'on my side, rocking the wheels to drop back'; drive(Math.sin(s.t * 6), 0.6); return; }
  const h = hunt(s, lib), square = Math.abs(foe.bearing) < 0.5;
  // Pulling out: reverse hard, swinging the tail to one side, so the next charge comes in on a new line.
  if (s.t < (mem.out || 0)) {
    out.say = 'did not give, pulling out to come at it from another side';
    const g = lib.guard(s, -1, { ...SELF, feed: false });
    drive(g.drive, g.braking ? 0 : mem.swing * 0.45);
    if (foe.distance > 7) mem.out = 0;
    return;
  }
  // In contact and stopped: that was the blow. A wedge this light loses a shoving match, so do not start one,
  // unless the enemy is already on its way out.
  const stuck = foe.distance < 3.4 && square && me.speed < 0.6;
  mem.press = stuck ? (mem.press || 0) + 1 : 0;
  const nearOut = lib.edgeAt(s, foe.x, foe.z) < 1.6 && h.charge;
  if (mem.press > (nearOut ? 45 : 9)) { mem.press = 0; mem.out = s.t + 2.2; mem.swing = (mem.swing || 1) * -1; }
  const n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6, feed: false });
  out.say = n.braking ? 'braking hard for the edge' : nearOut && foe.distance < 3.6 ? 'it is on the brink, keeping the wedge in' : h.charge ? (foe.distance < 6 ? `charging at ${me.speed.toFixed(1)} m/s` : 'lining up a run') : h.say;
  drive(n.drive, n.turn);
}
