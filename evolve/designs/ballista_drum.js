import { kit } from '../kit.js';
const { stalk, righting, WALKER, PEDE_L, PEDE_R } = kit;
export const base = 'Ballista';
export const name = 'Ballista-drum';
export const idea = 'Ballista held its fire for a whole fight waiting for the enemy to stand within 4.5 m of an edge, and drew four times without firing once. This program fires every time the rams are charged and on target with an edge anywhere behind the enemy, so each salvo walks it a few metres further out.';
export const target = 'Toss';
export const note = 'Ballista with a program that fires on every recharge, knocking the enemy toward the edge a salvo at a time.';
const RAMS = ['ram_l', 'ram_m', 'ram_r'];

export function program(s, out, mem, lib) {
  mem.long = true;
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 3.5, margin: 2.6, span: 1.9, mem }, legs = { L: PEDE_L, R: PEDE_R };
  const firing = s.t < (mem.fire || 0);
  for (const id of RAMS) out[id] = firing ? 1 : 0;
  if (righting(s, out, PEDE_L, PEDE_R)) return;
  const rams = RAMS.map((id) => me.joints[id]).filter(Boolean), ready = rams.length && rams.every((j) => j.charge > 0.95 && j.extension < 0.05);
  // The nearest piece of the enemy ahead of the rams, and how far it is from an edge along my line of fire.
  const hx = Math.sin(me.heading), hz = Math.cos(me.heading); let gap = 99;
  for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached) continue; const along = (p.x - me.x) * hx + (p.z - me.z) * hz, across = Math.abs((p.x - me.x) * hz - (p.z - me.z) * hx); if (across < 0.85 && along > 0) gap = Math.min(gap, along - 3.35); }
  const toEdge = lib.run(s, foe.x, foe.z, hx, hz, 12, 0, 99), inLine = gap < 0.45 && gap > -0.4;
  // A throw sends it about 4 m. Further than that from the edge, the shot only moves it; keep it for when it counts,
  // unless time is running out and a shove toward the edge is the best there is.
  // Every shot moves it a few metres. Fire whenever the edge is somewhere behind it; hold only if the shot would send it back toward the middle.
  const worth = toEdge < 11;
  if (inLine && ready && worth && !firing) { mem.fire = s.t + 0.3; mem.shots = (mem.shots || 0) + 1; mem.shotAt = toEdge; for (const id of RAMS) out[id] = 1; }
  const n = stalk(s, out, mem, lib, SELF, legs);
  if (mem.shots && s.t < mem.fire + 0.6) out.say = `fired all three, it had ${mem.shotAt.toFixed(1)} m to the edge`;
  else if (inLine && !worth) out.say = 'rams on it but no edge behind it, working round';
  else if (inLine && !ready) out.say = 'rams on it, waiting on the charge';
  void n;
}
