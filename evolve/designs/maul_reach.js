export const base = 'Maul';
export const name = 'Maul-reach';
export const idea = 'Maul drew with Pivot but kept its wheels in reach of Pivot\'s bars. This program fights at the very end of the hammer: it stops at arm\'s length, strikes, and backs out while the arm comes up again.';
export const target = 'Pivot';
export const note = 'Maul with a program that strikes at arm\'s length and backs out after every blow.';

export function program(s, out, mem, lib) {
  const PIVOT = 1.9, ARM = 2.2, UP = -1.6, DOWN = 0.36;
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
  const arm = me.joints.arm;
  if (me.upright < 0.2) { out.say = 'tipped, pushing off with the arm'; if (arm) out.arm = { angle: Math.sin(s.t * 3) > 0 ? UP : DOWN }; drive(Math.sin(s.t * 5), 0.5); return; }
  if (!arm) { const n = lib.nav(s, foe.x, foe.z, { ...SELF, stopAt: 0 }); out.say = 'arm gone, pushing with what is left'; drive(n.drive, n.turn); return; }
  // Under the hammer: between 1.1 m and the arm's length ahead of the post, and nearly dead ahead.
  const under = tg.d > 1.1 && tg.d < ARM + 0.1 && Math.abs(rel) < 0.22;
  if (mem.blow && s.t > mem.until) { mem.blow = false; mem.back = s.t + 0.9; }
  if (!mem.blow && under && Math.abs(arm.angle - UP) < 0.3) { mem.blow = true; mem.until = s.t + 0.55; mem.blows = (mem.blows || 0) + 1; mem.at = tg.id; }
  out.arm = { angle: mem.blow ? DOWN : UP };
  if (mem.blow) { out.say = `bringing the arm down on ${mem.at} (blow ${mem.blows})`; drive(0, lib.clamp(rel * 1.5, -0.3, 0.3)); return; }
  // After every blow, back straight out while the arm comes up, so the enemy has to cross the hammer's reach again to get at the wheels.
  if (s.t < (mem.back || 0)) { const g = lib.guard(s, -0.9, SELF); out.say = 'blow struck, backing out while the arm comes up'; drive(g.drive, lib.clamp(rel * 1.5, -0.3, 0.3)); return; }
  if (tg.d < 1.0) { const g = lib.guard(s, -0.8, SELF); out.say = 'too close for the arm, backing off'; drive(g.drive, lib.clamp(rel * 2, -0.4, 0.4)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: PIVOT + ARM - 0.2 });
  out.say = n.braking ? 'braking for the edge' : under ? 'under the hammer, arm coming up' : `arm up, lining up on ${tg.id}`;
  drive(n.arrived ? 0 : n.drive, n.arrived ? lib.clamp(at.bearing * 2.5, -0.5, 0.5) : n.turn);
}
