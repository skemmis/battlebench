import { kit } from '../kit.js';
const { hexFrame, walk, righting, beam, WALKER } = kit;

export const idea = 'A walker whose weapon is a swept bar, placed by angle. A 2.2 m steel bar is pivoted ahead of its nose at leg height and driven by a motor that goes to the angle it is told. The program cocks the bar out to one side, steps until an enemy leg is inside the arc, and sweeps to the other side, so the bar comes through the legs sideways at over 15 m/s. Then it sweeps back. No pistons to recharge and nothing spinning to tangle.';
export const target = 'Dreadnought';

export const build = {
  name: 'Scythe',
  note: 'A six-legged walker with a long steel bar on a pivot ahead of its nose. It cocks the bar to one side, steps in until a leg is in the arc, and sweeps it across.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    beam('nose', [0.22, 0.22, 1.0], [0, -0.05, 1.6], 'spine', 'steel'),
    { id: 'bar', type: 'beam', material: 'steel', size: [0.16, 0.16, 2.2], pos: [0, -0.05, 3.15], parent: 'nose', joint: { type: 'motor', axis: [0, 1, 0], pivot: [0, -0.05, 2.05], gear: 6, power: 1, limits: [-80, 80] } },
  ],
};

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.2, mem }, COCK = 1.35, PIVOT = 2.05, BAR = 2.2;
  if (mem.side === undefined) { mem.side = 1; mem.sweeps = 0; }
  const bar = me.joints.bar;
  if (righting(s, out)) { if (bar) out.bar = { angle: 0 }; return; }
  // The target: the nearest piece of leg still attached, else the nearest piece. Measured from the bar's pivot.
  const px = me.x + Math.sin(me.heading) * PIVOT, pz = me.z + Math.cos(me.heading) * PIVOT;
  let tg = null;
  for (const pass of [true, false]) {
    for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached || (pass && !id.startsWith('leg'))) continue; const d = Math.hypot(p.x - px, p.z - pz); if (!tg || d < tg.d) tg = { id, x: p.x, z: p.z, d }; }
    if (tg) break;
  }
  if (!tg) tg = { id: 'core', x: foe.x, z: foe.z, d: Math.hypot(foe.x - px, foe.z - pz) };
  const rel = lib.wrap(Math.atan2(tg.x - px, tg.z - pz) - me.heading), at = lib.to(s, tg.x, tg.z);
  // In the arc: within the bar's length of the pivot and inside the sweep.
  const inArc = tg.d < BAR - 0.1 && tg.d > 0.5 && Math.abs(rel) < 1.1;
  if (bar) {
    // A sweep ends when the bar has got to the far side, or has been stopped for a third of a second.
    if (mem.sweeping) {
      const done = Math.abs(bar.angle - mem.side * -COCK) < 0.15 || s.t > mem.until;
      if (done) { mem.sweeping = false; mem.side = -mem.side; }
    } else if (inArc && Math.abs(bar.angle - mem.side * COCK) < 0.25) { mem.sweeping = true; mem.until = s.t + 0.6; mem.sweeps++; mem.at = tg.id; }
    out.bar = { angle: (mem.sweeping ? -1 : 1) * mem.side * COCK };
  }
  if (!bar) { const n = lib.nav(s, foe.x, foe.z, { ...SELF, stopAt: 0 }); out.say = 'bar gone, pushing with what is left'; walk(s, out, mem, lib, n.drive, n.turn); return; }
  if (mem.sweeping || (inArc && s.t < (mem.until || 0) + 0.4)) { out.say = `sweeping the bar through ${mem.at} (sweep ${mem.sweeps})`; walk(s, out, mem, lib, 0, lib.clamp(rel * 1.5, -0.3, 0.3)); return; }
  // Too close for the bar to get up speed before it lands: step back. Otherwise step in until the leg is in the arc.
  if (tg.d < 0.9) { const g = lib.guard(s, -0.8, SELF); out.say = 'too close for a sweep, stepping back'; walk(s, out, mem, lib, g.drive, lib.clamp(rel * 2, -0.4, 0.4)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: PIVOT + BAR - 0.6 });
  out.say = n.braking ? 'stopping short of the edge' : inArc ? 'leg in the arc, bar cocking' : `bar cocked ${mem.side > 0 ? 'left' : 'right'}, stepping in on ${tg.id}`;
  walk(s, out, mem, lib, n.arrived ? 0 : n.drive, n.arrived ? lib.clamp(at.bearing * 2, -0.5, 0.5) : n.turn);
}
