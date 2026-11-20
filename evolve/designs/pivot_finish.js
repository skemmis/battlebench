import { kit } from '../kit.js';
const { hunt } = kit;
export const base = 'Pivot';
export const name = 'Pivot-finish';
export const idea = 'Pivot wins on damage at the bell and has never put a machine out of the ring or destroyed one. This program finishes: once the enemy has lost two wheels or legs, it stops cutting, holds the shears open as a catcher, gets on the enemy\'s inboard side and drives it out.';
export const target = 'Pivot';
export const note = 'Pivot with a program that stops cutting once the enemy is crippled and drives it out of the ring.';

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 2.9, top: 5, margin: 2.0, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false }, OPEN = 1.3, PIVOT = 2.2, BAR = 1.9;
  const drive = (d, tn) => { for (const id of ['wl_0', 'wl_1', 'wl_2']) out[id] = lib.clamp(d - tn); for (const id of ['wr_0', 'wr_1', 'wr_2']) out[id] = lib.clamp(d + tn); };
  const bl = me.joints.bar_l, br = me.joints.bar_r;
  if (mem.dir === undefined) {
    mem.dir = 0; mem.cuts = 0;
  }
  // Which way is "out" for the left bar is found by trying: ask for +OPEN and see where the tip goes.
  const sgn = 1;
  const set = (open) => { if (bl) out.bar_l = { angle: (open ? 1 : -1) * sgn * OPEN }; if (br) out.bar_r = { angle: (open ? -1 : 1) * sgn * OPEN }; };
  if (me.upright < 0.2) { out.say = 'tipped, working the bars to roll back'; set(Math.sin(s.t * 3) > 0); drive(Math.sin(s.t * 5), 0.5); return; }
  const px = me.x + Math.sin(me.heading) * PIVOT, pz = me.z + Math.cos(me.heading) * PIVOT;
  let tg = null;
  for (const pass of [true, false]) {
    for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached || (pass && !/^(leg|wl|wr|fork)/.test(id))) continue; const d = Math.hypot(p.x - px, p.z - pz); if (!tg || d < tg.d) tg = { id, x: p.x, z: p.z, d }; }
    if (tg) break;
  }
  if (!tg) tg = { id: 'core', x: foe.x, z: foe.z, d: Math.hypot(foe.x - px, foe.z - pz) };
  const rel = lib.wrap(Math.atan2(tg.x - px, tg.z - pz) - me.heading);
  const inArc = tg.d < BAR + 0.3 && Math.abs(rel) < 1.0;
  // Finish it. Once the enemy has lost a wheel or a leg it cannot hold its ground: stop cutting, open the shears wide as a catcher, get inboard of it and drive it out of the ring.
  let lostRun = 0; for (const id in foe.parts) if (/^(leg|wl|wr)/.test(id) && !foe.parts[id].attached) lostRun++;
  if (lostRun >= 2 && (bl || br)) { const h = hunt(s, lib), c = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6 }); set(true); out.say = c.braking ? 'braking for the edge' : 'it is crippled, driving it out: ' + h.say; drive(c.drive, c.turn); return; }
  if (!bl && !br) { const n = lib.nav(s, foe.x, foe.z, { ...SELF, stopAt: 0 }); out.say = 'bars gone, pushing with what is left'; drive(n.drive, n.turn); return; }
  const any = bl || br, opened = Math.abs(Math.abs(any.angle) - OPEN) < 0.3 && !mem.closing;
  if (mem.closing && s.t > mem.until) mem.closing = false;
  if (!mem.closing && inArc && s.t > (mem.until || 0) + 0.7) { mem.closing = true; mem.until = s.t + 0.6; mem.cuts++; mem.at = tg.id; }
  set(!mem.closing);
  if (mem.closing) { out.say = `closing the shears on ${mem.at} (cut ${mem.cuts})`; drive(0.15, lib.clamp(rel * 1.5, -0.3, 0.3)); return; }
  if (tg.d < 0.7) { const g = lib.guard(s, -0.8, SELF); out.say = 'too close to cut, backing off'; drive(g.drive, lib.clamp(rel * 2, -0.4, 0.4)); return; }
  if (me.speed > 0.3 || tg.d < 3) mem.moved = s.t;
  if (mem.moved === undefined) mem.moved = s.t;
  if (s.t - mem.moved > 2) { mem.rush = s.t + 3; mem.moved = s.t + 3; }
  if (s.t < (mem.rush || 0) && tg.d > 2.5) { const c = lib.to(s, foe.x, foe.z), g = lib.guard(s, 1, SELF); out.say = g.braking ? 'braking for the edge' : 'parked out of reach, taking the slope head on'; drive(g.drive, lib.clamp(c.bearing * 2, -0.6, 0.6)); return; }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: PIVOT + BAR - 0.7 }), at = lib.to(s, tg.x, tg.z);
  out.say = n.braking ? 'braking for the edge' : inArc ? 'in the shears, opening for the next cut' : `shears open, driving in on ${tg.id}`;
  drive(n.arrived ? 0 : n.drive, n.arrived ? lib.clamp(at.bearing * 2, -0.5, 0.5) : n.turn);
}
