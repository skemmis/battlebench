import { kit } from '../kit.js';
const { beam } = kit;

export const idea = 'A swept bar has to stop, cock and swing again; between swings it is harmless, and Pivot gets its cut in then. Rotor\'s bar never stops. It is centred on a pivot at the end of a boom ahead of the nose and spins flat at hub height the whole fight, so whatever comes within 1.2 m of the boom\'s end is struck several times a second.';
export const target = 'Pivot';

const wheel = (id, x, z, parent, y = 0) => ({ id, type: 'disc', material: 'rubber', radius: 0.45, thickness: 0.2, pos: [x, y, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 5, power: 1 } });
export const build = {
  name: 'Rotor',
  note: 'Six wheels on a rocker and a steel bar spinning flat on the end of a boom ahead of its nose. It keeps the spinning bar on the enemy and never stops it.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.3, 0.3, 2.2], [0, 0, 0], 'core', 'steel'),
    // The middle axle sits 7 cm lower than the other two, so the machine rocks on its middle wheels and can turn on the spot.
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [1.5, 0.3, 0.3], [0, i ? 0 : -0.07, i * 0.95], 'spine', 'steel'), wheel('wl_' + (i + 1), 0.9, i * 0.95, 'axle_' + (i + 1), i ? 0 : -0.07), wheel('wr_' + (i + 1), -0.9, i * 0.95, 'axle_' + (i + 1), i ? 0 : -0.07)]),
    beam('nose', [0.22, 0.22, 1.0], [0, 0, 1.6], 'spine', 'steel'),
    beam('boom', [0.22, 0.22, 0.9], [0, 0, 2.5], 'nose', 'steel'),
    { id: 'bar', type: 'beam', material: 'steel', size: [0.16, 0.16, 2.4], pos: [0, -0.2, 2.8], parent: 'boom', joint: { type: 'motor', axis: [0, 1, 0], pivot: [0, -0.2, 2.8], gear: 4, power: 1 } },
  ],
};

export function program(s, out, mem, lib) {
  const PIVOT = 2.8, R = 1.2;
  const me = s.self, foe = s.enemy, SELF = { length: 2.9, top: 5, margin: 2.0, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false };
  const drive = (d, tn) => { for (const id of ['wl_0', 'wl_1', 'wl_2']) out[id] = lib.clamp(d - tn); for (const id of ['wr_0', 'wr_1', 'wr_2']) out[id] = lib.clamp(d + tn); };
  const px = me.x + Math.sin(me.heading) * PIVOT, pz = me.z + Math.cos(me.heading) * PIVOT;
  let tg = null;
  for (const pass of [2, 1, 0]) {
    for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached || (pass === 2 && !/^(yoke|nose|brow|bow)/.test(id)) || (pass === 1 && !/^(leg|wl|wr)/.test(id))) continue; const d = Math.hypot(p.x - px, p.z - pz); if (!tg || d < tg.d) tg = { id, x: p.x, z: p.z, d }; }
    if (tg) break;
  }
  if (!tg) tg = { id: 'core', x: foe.x, z: foe.z, d: Math.hypot(foe.x - px, foe.z - pz) };
  const rel = lib.wrap(Math.atan2(tg.x - px, tg.z - pz) - me.heading), at = lib.to(s, tg.x, tg.z);
  if (me.joints.bar) out.bar = 1;
  if (me.upright < 0.2) { out.say = 'tipped, rocking the wheels'; drive(Math.sin(s.t * 5), 0.5); return; }
  if (!me.joints.bar) { const n = lib.nav(s, foe.x, foe.z, { ...SELF, stopAt: 0 }); out.say = 'bar gone, pushing with what is left'; drive(n.drive, n.turn); return; }
  // Keep the target just inside the bar's circle, and no closer: the bar should meet it, the boom should not.
  if (tg.d < R - 0.5) { const g = lib.guard(s, -0.7, SELF); out.say = 'too far in, easing back so the bar keeps landing'; drive(g.drive, lib.clamp(rel * 2, -0.4, 0.4)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: PIVOT + R - 0.25 });
  out.say = n.braking ? 'braking for the edge' : tg.d < R + 0.1 ? `bar spinning into ${tg.id}` : `bar spinning, driving in on ${tg.id}`;
  drive(n.arrived ? 0 : n.drive, n.arrived ? lib.clamp(at.bearing * 2, -0.5, 0.5) : n.turn);
}
