import { kit } from '../kit.js';
const { walk, righting, WALKER } = kit;
export const base = 'Reaper';
export const name = 'Reaper-press';
export const idea = 'Reaper drew with Ox standing ten metres away for the whole fight, each waiting on the other. This program notices when it has not moved for four seconds with nothing in the bar\'s arc, gives up on picking a leg, and walks straight at the enemy until something is in reach.';
export const target = 'Ox';
export const note = 'Reaper with a program that walks straight in when it finds itself standing still out of reach.';

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.2, mem }, COCK = 1.35, PIVOT = 2.05, BAR = 2.2;
  if (mem.side === undefined) { mem.side = 1; mem.sweeps = 0; }
  const bar = me.joints.bar;
  if (righting(s, out)) { if (bar) out.bar = { angle: 0 }; return; }
  // The target: the nearest piece of leg still attached, else the nearest piece. Measured from the bar's pivot.
  const px = me.x + Math.sin(me.heading) * PIVOT, pz = me.z + Math.cos(me.heading) * PIVOT;
  let tg = null;
  for (const pass of [true, false]) {
    for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached || (pass && !/^(leg|wl|wr)/.test(id))) continue; const d = Math.hypot(p.x - px, p.z - pz); if (!tg || d < tg.d) tg = { id, x: p.x, z: p.z, d }; }
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
  // Stuck: if I have not moved half a metre in four seconds and nothing is in the arc, stop picking a leg and walk straight at its middle, swinging a little to one side then the other to get off whatever is holding me.
  if (mem.px === undefined || s.t > mem.pt + 4) { mem.stuck = mem.px !== undefined && Math.hypot(me.x - mem.px, me.z - mem.pz) < 0.5 && !inArc ? s.t + 4 : 0; mem.px = me.x; mem.pz = me.z; mem.pt = s.t; mem.jink = -(mem.jink || 1); }
  if (bar && s.t < (mem.stuck || 0) && !mem.sweeping && !inArc) { const c = lib.to(s, foe.x, foe.z), g = lib.guard(s, 1, SELF); out.say = 'not getting anywhere, walking straight at it'; walk(s, out, mem, lib, g.drive, lib.clamp(c.bearing * 2 + mem.jink * 0.25, -0.6, 0.6)); return; }
  if (!bar) { const n = lib.nav(s, foe.x, foe.z, { ...SELF, stopAt: 0 }); out.say = 'bar gone, pushing with what is left'; walk(s, out, mem, lib, n.drive, n.turn); return; }
  if (mem.sweeping || (inArc && s.t < (mem.until || 0) + 0.4)) { out.say = `sweeping the bar through ${mem.at} (sweep ${mem.sweeps})`; walk(s, out, mem, lib, 0, lib.clamp(rel * 1.5, -0.3, 0.3)); return; }
  // Too close for the bar to get up speed before it lands: step back. Otherwise step in until the leg is in the arc.
  if (tg.d < 0.9) { const g = lib.guard(s, -0.8, SELF); out.say = 'too close for a sweep, stepping back'; walk(s, out, mem, lib, g.drive, lib.clamp(rel * 2, -0.4, 0.4)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: PIVOT + BAR - 0.6 });
  out.say = n.braking ? 'stopping short of the edge' : inArc ? 'leg in the arc, bar cocking' : `bar cocked ${mem.side > 0 ? 'left' : 'right'}, stepping in on ${tg.id}`;
  walk(s, out, mem, lib, n.arrived ? 0 : n.drive, n.arrived ? lib.clamp(at.bearing * 2, -0.5, 0.5) : n.turn);
}
