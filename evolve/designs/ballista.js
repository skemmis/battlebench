import { kit } from '../kit.js';
const { pedeFrame, stalk, righting, beam, block, WALKER, PEDE_L, PEDE_R } = kit;

export const idea = 'A ring-out gun, aimed at Toss. Three geared pistons side by side fire as one: 30 kN for 0.6 m, enough to send an 800 kg machine back at several metres a second. The program does not waste it: it holds fire until the enemy stands between its ram and an edge within reach of the throw, then fires all three. On ten legs and nearly a tonne, so the recoil moves the enemy and not itself.';
export const target = 'Toss';

const RAMS = ['ram_l', 'ram_m', 'ram_r'];
export const build = {
  name: 'Ballista',
  note: 'Ten legs, a tonne of steel, and three piston rams that fire together. It waits until the enemy is lined up with an edge and then knocks it out of the ring in one stroke.',
  parts: [
    ...pedeFrame(),
    beam('neck', [0.26, 0.26, 1.0], [0, 0, 2.4], 'spine_f', 'steel'),
    beam('brow', [1.7, 0.26, 0.26], [0, -0.04, 2.95], 'neck', 'steel'),
    ...RAMS.map((id, k) => ({ id, type: 'block', material: 'steel', size: [0.52, 0.46, 0.3], pos: [(1 - k) * 0.56, -0.06, 3.2], parent: 'brow', joint: { type: 'piston', axis: [0, 0, 1], stroke: 0.6, gear: 2 } })),
    block('ballast_0', [0.6, 0.4, 0.6], [0, 0.33, -0.5], 'spine_b', 'steel'),
    block('ballast_1', [0.6, 0.4, 0.6], [0, 0.33, -1.3], 'spine_b', 'steel'),
  ],
};

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
  const worth = toEdge < 4.5 || (s.timeLeft < 12 && toEdge < 8);
  if (inLine && ready && worth && !firing) { mem.fire = s.t + 0.3; mem.shots = (mem.shots || 0) + 1; mem.shotAt = toEdge; for (const id of RAMS) out[id] = 1; }
  const n = stalk(s, out, mem, lib, SELF, legs);
  if (mem.shots && s.t < mem.fire + 0.6) out.say = `fired all three, it had ${mem.shotAt.toFixed(1)} m to the edge`;
  else if (inLine && !worth) out.say = `rams on it but the edge is ${toEdge.toFixed(1)} m behind it, holding fire and walking it out`;
  else if (inLine && !ready) out.say = 'rams on it, waiting on the charge';
  void n;
}
