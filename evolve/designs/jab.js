import { kit } from '../kit.js';
const { beam } = kit;

export const idea = 'A boxer that goes for the legs. Every machine in the league stands on spoked legs whose joints are its weakest, and a blow counts by how fast it lands, so this machine carries three piston fists that strike at 8 m/s whatever its own speed. It picks the nearest leg still attached, sets itself at exactly fist range from it, jabs, and steps back out of reach while the fists recharge.';
export const target = 'Dreadnought';

const wheel = (id, x, z, parent) => ({ id, type: 'disc', material: 'rubber', radius: 0.45, thickness: 0.2, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 4, power: 0.8 } });
const FISTS = [['fist_l', 0.5], ['fist_m', 0], ['fist_r', -0.5]];
export const build = {
  name: 'Jab',
  note: 'Four wheels, thick steel axles and three piston fists in a row. It boxes: picks a leg, steps to fist range, jabs it off, steps back out, and picks the next one.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.3, 0.3, 2.0], [0, 0, 0], 'core', 'steel'),
    beam('axle_f', [1.5, 0.3, 0.3], [0, 0, 0.7], 'spine', 'steel'), beam('axle_b', [1.5, 0.3, 0.3], [0, 0, -0.7], 'spine', 'steel'),
    wheel('wl_f', 0.9, 0.7, 'axle_f'), wheel('wr_f', -0.9, 0.7, 'axle_f'), wheel('wl_b', 0.9, -0.7, 'axle_b'), wheel('wr_b', -0.9, -0.7, 'axle_b'),
    beam('bow', [1.5, 0.3, 0.3], [0, 0.1, 1.35], 'spine', 'steel'),
    ...FISTS.map(([id, x]) => ({ id, type: 'block', material: 'steel', size: [0.3, 0.3, 0.4], pos: [x, 0.1, 1.7], parent: 'bow', joint: { type: 'piston', axis: [0, 0, 1], stroke: 0.6, gear: 1 } })),
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 2.0, top: 6, margin: 1.6, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false };
  const flip = me.upright < 0 ? -1 : 1;
  const drive = (d, t) => { d *= flip; out.wl_f = out.wl_b = lib.clamp(d - t); out.wr_f = out.wr_b = lib.clamp(d + t); };
  for (const [id] of FISTS) out[id] = s.t < (mem[id] || 0) ? 1 : 0;
  if (Math.abs(me.upright) < 0.3) { out.say = 'on my side, rocking the wheels to drop back'; drive(Math.sin(s.t * 6), 0.6); return; }
  // The target: the nearest piece of leg still on the enemy. With no legs left it cannot walk; then any piece will do.
  let tg = null, anyLeg = false;
  for (const pass of [true, false]) {
    for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached || (pass && !id.startsWith('leg'))) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (!tg || d < tg.d) tg = { id, x: p.x, z: p.z, d }; }
    if (tg) { anyLeg = pass; break; }
  }
  if (!tg) tg = { id: 'core', x: foe.x, z: foe.z, d: foe.distance };
  const at = lib.to(s, tg.x, tg.z), ready = FISTS.filter(([id]) => { const j = me.joints[id]; return j && j.charge > 0.95 && j.extension < 0.05; });
  // Fist range: the fists reach 1.9 m ahead of the core at rest and 2.5 m at full stroke.
  const REACH = 2.25, inRange = at.distance < 2.55 && at.distance > 1.5 && Math.abs(at.bearing) < 0.3;
  if (inRange && ready.length) {
    // Throw the fist that is most nearly in line with the target.
    const side = Math.sin(at.bearing) * at.distance, pick = ready.reduce((a, b) => (Math.abs(b[1] - side) < Math.abs(a[1] - side) ? b : a));
    mem[pick[0]] = s.t + 0.25; out[pick[0]] = 1; mem.thrown = (mem.thrown || 0) + 1;
    out.say = `jabbing at ${tg.id}`;
    drive(0, lib.clamp(at.bearing * 2.5, -0.5, 0.5)); return;
  }
  // Nothing charged: step back out of reach of whatever it swings, facing it, until a fist is ready again.
  if (!ready.length && foe.distance < 4.2) {
    out.say = 'fists recharging, stepping back out of reach';
    const g = lib.guard(s, -0.9, SELF); drive(g.drive, lib.clamp(at.bearing * 2, -0.5, 0.5)); return;
  }
  // Step in: close to fist range on the target and square up to it. Too close, back off to range.
  if (at.distance < 1.6) { const g = lib.guard(s, -0.7, SELF); out.say = 'too close to punch, opening the range'; drive(g.drive, lib.clamp(at.bearing * 2, -0.5, 0.5)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: REACH });
  out.say = n.braking ? 'braking for the edge' : n.arrived ? `squaring up to ${tg.id}` : anyLeg ? `stepping in on ${tg.id}` : 'it has no legs left, going for what is still attached';
  drive(n.drive, n.arrived ? lib.clamp(at.bearing * 2.5, -0.6, 0.6) : n.turn);
}
