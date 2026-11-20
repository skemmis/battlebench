import { kit } from '../kit.js';
const { hunt } = kit;
export const base = 'Sting';
export const name = 'Sting-finish';
export const idea = 'Sting keeps its wheels out of reach and loses nothing, but breaks little and draws. This gives it the finishing rule: once the enemy has lost two wheels or legs, stop sweeping, hold the bar straight out like a lance, get on its inboard side and drive it out of the ring.';
export const target = 'Pivot-finish';
export const note = 'Sting with a program that stops sweeping once the enemy is crippled and drives it out of the ring.';

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 5.6, top: 5, margin: 2.0, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false }, COCK = 1.35, PIVOT = 3.4, BAR = 2.2;
  const walk = (s_, o_, m_, l_, d, tn) => { for (const id of ['wl_0', 'wl_1']) out[id] = lib.clamp(d - tn); for (const id of ['wr_0', 'wr_1']) out[id] = lib.clamp(d + tn); };
  if (mem.side === undefined) { mem.side = 1; mem.sweeps = 0; }
  const bar = me.joints.bar;
  if (me.upright < 0.2) { out.say = 'tipped, swinging the bar to roll back'; if (bar) out.bar = { angle: Math.sin(s.t * 3) > 0 ? COCK : -COCK }; walk(s, out, mem, lib, Math.sin(s.t * 5), 0.5); return; }
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
  // Finish it. Once the enemy has lost two wheels or legs it cannot hold its ground: stop sweeping, hold the bar straight ahead, get inboard of it and drive it out of the ring.
  let lostRun = 0; for (const id in foe.parts) if (/^(leg|wl|wr)/.test(id) && !foe.parts[id].attached) lostRun++;
  if (lostRun >= 2 && bar) { const h = hunt(s, lib), c = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6 }); out.bar = { angle: 0 }; out.say = c.braking ? 'braking for the edge' : 'it is crippled, driving it out: ' + h.say; walk(s, out, mem, lib, c.drive, c.turn); return; }
  if (!bar) { const n = lib.nav(s, foe.x, foe.z, { ...SELF, stopAt: 0 }); out.say = 'bar gone, pushing with what is left'; walk(s, out, mem, lib, n.drive, n.turn); return; }
  if (mem.sweeping || (inArc && s.t < (mem.until || 0) + 0.4)) { out.say = `sweeping the bar through ${mem.at} (sweep ${mem.sweeps})`; walk(s, out, mem, lib, 0, lib.clamp(rel * 1.5, -0.3, 0.3)); return; }
  // Too close for the bar to get up speed before it lands: step back. Otherwise step in until the leg is in the arc.
  if (tg.d < 0.9) { const g = lib.guard(s, -0.8, SELF); out.say = 'too close for a sweep, stepping back'; walk(s, out, mem, lib, g.drive, lib.clamp(rel * 2, -0.4, 0.4)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: PIVOT + BAR - 0.6 });
  out.say = n.braking ? 'stopping short of the edge' : inArc ? 'leg in the arc, bar cocking' : `bar cocked ${mem.side > 0 ? 'left' : 'right'}, stepping in on ${tg.id}`;
  walk(s, out, mem, lib, n.arrived ? 0 : n.drive, n.arrived ? lib.clamp(at.bearing * 2, -0.5, 0.5) : n.turn);
}
