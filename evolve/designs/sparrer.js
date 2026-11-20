import { kit } from '../kit.js';
const { hexFrame, walk, righting, beam, LEGS_L, LEGS_R, WALKER } = kit;

export const idea = 'Jab on legs. Jab\'s wheels stalled on the hills and it drew two of its four fights standing off. This puts the same three piston fists and the same leg-picking program on the league\'s six-legged steel frame, to see whether the boxer works on ground that wheels cannot take.';
export const target = 'Warden';

const FISTS = [['fist_l', 0.5], ['fist_m', 0], ['fist_r', -0.5]];
export const build = {
  name: 'Sparrer',
  note: 'A six-legged walker with three piston fists in a row at its nose. It picks a leg, steps to fist range, jabs it off, and steps back out while the fists recharge.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    beam('bow', [1.5, 0.3, 0.3], [0, 0.1, 1.35], 'spine', 'steel'),
    ...FISTS.map(([id, x]) => ({ id, type: 'block', material: 'steel', size: [0.3, 0.3, 0.4], pos: [x, 0.1, 1.7], parent: 'bow', joint: { type: 'piston', axis: [0, 0, 1], stroke: 0.6, gear: 1 } })),
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.0, mem };
  const drive = (d, t) => walk(s, out, mem, lib, d, t);
  for (const [id] of FISTS) out[id] = s.t < (mem[id] || 0) ? 1 : 0;
  if (righting(s, out)) return;
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
