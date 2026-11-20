import { kit } from '../kit.js';
const { hexFrame, walk, righting, beam, LEGS_L, LEGS_R, WALKER } = kit;

export const idea = 'Reach. A six-legged walker with one piston point on the end of a long steel shaft, 3.5 m ahead of its core and 4.1 m at full thrust, against Jab\'s 2.5 m. It keeps its target at exactly that distance, thrusts when it is lined up, and gives ground when anything comes inside the point, so the enemy is always walking onto it.';
export const target = 'Jab';

const FISTS = [['point', 0]];
export const build = {
  name: 'Fencer',
  note: 'A six-legged walker with a long steel shaft and a piston point. It fights at the length of the shaft: it thrusts when the target is lined up at the point and steps back when anything gets inside it.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    beam('shaft', [0.2, 0.2, 2.0], [0, 0, 2.2], 'spine', 'steel'),
    { id: 'point', type: 'block', material: 'steel', size: [0.3, 0.3, 0.4], pos: [0, 0, 3.3], parent: 'shaft', joint: { type: 'piston', axis: [0, 0, 1], stroke: 0.6, gear: 1 } },
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
  // The point is 3.5 m ahead of the core at rest and 4.1 m at full thrust.
  const REACH = 3.75, inRange = at.distance < 4.1 && at.distance > 3.2 && Math.abs(at.bearing) < 0.12;
  if (inRange && ready.length) {
    // Throw the fist that is most nearly in line with the target.
    const side = Math.sin(at.bearing) * at.distance, pick = ready.reduce((a, b) => (Math.abs(b[1] - side) < Math.abs(a[1] - side) ? b : a));
    mem[pick[0]] = s.t + 0.25; out[pick[0]] = 1; mem.thrown = (mem.thrown || 0) + 1;
    out.say = `thrusting at ${tg.id}`;
    drive(0, lib.clamp(at.bearing * 2.5, -0.5, 0.5)); return;
  }
  // Nothing charged: step back out of reach of whatever it swings, facing it, until a fist is ready again.
  if (!ready.length && at.distance < 4.6) {
    out.say = 'point recharging, giving ground to keep the distance';
    const g = lib.guard(s, -0.9, SELF); drive(g.drive, lib.clamp(at.bearing * 2, -0.5, 0.5)); return;
  }
  // Step in: close to fist range on the target and square up to it. Too close, back off to range.
  if (at.distance < 3.2) { const g = lib.guard(s, -0.7, SELF); out.say = 'it is inside the point, stepping back to the length of the shaft'; drive(g.drive, lib.clamp(at.bearing * 2, -0.5, 0.5)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: REACH });
  out.say = n.braking ? 'braking for the edge' : n.arrived ? `squaring up to ${tg.id}` : anyLeg ? `stepping in on ${tg.id}` : 'it has no legs left, going for what is still attached';
  drive(n.drive, n.arrived ? lib.clamp(at.bearing * 2.5, -0.6, 0.6) : n.turn);
}
