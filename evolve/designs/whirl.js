import { kit } from '../kit.js';
const { beam, block, hornetWheel } = kit;

export const idea = 'The quick two-wheeled body with a weapon that needs no recharge: a steel bar spinning flat above its wheels. Under the new damage rules only fast contacts count, and the tip of this bar is always fast. It goes round to the enemy\'s weak side and grazes it with the tip of the bar, keeping its own body a bar\'s length away.';
export const target = 'Mantis';

export const build = {
  name: 'Whirl',
  note: 'Two driven wheels, two skids, and a steel bar spinning flat over the top. It circles to the side away from the enemy\'s weapons and brushes it with the tip of the bar.',
  parts: [
    { id: 'core', type: 'core' },
    beam('axle', [1.0, 0.24, 0.24], [0, 0, 0], 'core'),
    hornetWheel('wl_0', 0.66), hornetWheel('wr_0', -0.66),
    beam('keel', [0.24, 0.24, 1.7], [0, -0.05, 0], 'core'),
    { id: 'skid_f', type: 'ball', material: 'plastic', radius: 0.17, pos: [0, -0.24, 0.8], parent: 'keel' },
    { id: 'skid_b', type: 'ball', material: 'plastic', radius: 0.17, pos: [0, -0.24, -0.8], parent: 'keel' },
    block('post', [0.3, 0.36, 0.3], [0, 0.34, 0], 'core', 'steel'),
    block('ballast', [0.5, 0.2, 0.3], [0, -0.05, -0.45], 'keel', 'steel'), block('ballast_f', [0.5, 0.2, 0.3], [0, -0.05, 0.45], 'keel', 'steel'),
    { id: 'bar', type: 'beam', material: 'steel', size: [2.3, 0.12, 0.2], pos: [0, 0.6, 0], parent: 'post', joint: { type: 'motor', axis: [0, 1, 0], gear: 2, power: 1 } },
  ],
};

// Which way, from the enemy's middle, is its weak side? Its weapons are its moving joints that are not legs or
// wheels. If they sit to one end, the weak side is the other end. If they are all round or there are none, a flank.
function weakSide(s) {
  const me = s.self, foe = s.enemy; let wx = 0, wz = 0, n = 0;
  for (const id in foe.joints) { if (/^(leg|wl|wr|turret)/.test(id)) continue; const p = foe.parts[id]; if (!p || !p.attached) continue; wx += p.x - foe.x; wz += p.z - foe.z; n++; }
  const fx = Math.sin(foe.heading), fz = Math.cos(foe.heading), m = Math.hypot(wx, wz);
  if (n && m / n > 0.5) return { dx: -wx / m, dz: -wz / m, why: 'the side away from its weapons' };
  const side = (me.x - foe.x) * fz - (me.z - foe.z) * fx > 0 ? 1 : -1;
  return { dx: fz * side, dz: -fx * side, why: n ? 'its flank, it is armed at both ends' : 'its flank' };
}


export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 1.3, top: 6, margin: 1.5, side: 0.5, climb: 0.2, grade: 0.4, grip: 0.45, feed: false, mem };
  const drive = (d, t) => { out.wl_0 = lib.clamp(d - t); out.wr_0 = lib.clamp(d + t); };
  out.bar = me.upright < 0 ? -1 : 1;
  if (Math.abs(me.upright) < 0.3) { out.say = 'on my side, spinning the wheels to roll over'; drive(Math.sin(s.t * 6), 0.6); return; }
  const w = weakSide(s), TIP = 1.15;
  let near = null, extent = 0.5, threat = 99;
  for (const id in foe.parts) {
    const p = foe.parts[id]; if (!p.attached) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z); if (!near || d < near.d) near = { id, x: p.x, z: p.z, d };
    extent = Math.max(extent, (p.x - foe.x) * w.dx + (p.z - foe.z) * w.dz);
    if (foe.joints[id] && !/^(leg|wl|wr|turret)/.test(id)) threat = Math.min(threat, d);
  }
  if (!near) near = { id: 'core', x: foe.x, z: foe.z, d: foe.distance };
  const good = (x, z) => lib.floorAt(s, x, z) && lib.edgeAt(s, x, z) > 1.5;
  const ang = Math.atan2(me.x - foe.x, me.z - foe.z), off = lib.wrap(Math.atan2(w.dx, w.dz) - ang);
  const giving = threat < TIP + 0.5;
  let px, pz, say;
  if (giving) { const R = extent + 4; px = foe.x + w.dx * R; pz = foe.z + w.dz * R; say = 'its weapon is inside my bar, backing out'; }
  else if (Math.abs(off) > 0.7) { const a = ang + lib.clamp(off, -0.8, 0.8), R = extent + 3; px = foe.x + Math.sin(a) * R; pz = foe.z + Math.cos(a) * R; say = `going round to ${w.why}`; }
  // On the weak side: put the tip of the bar on its nearest piece. Body stays a bar's length off.
  else { const d = Math.max(near.d, 0.01), k = (d - TIP + 0.12) / d; px = me.x + (near.x - me.x) * k; pz = me.z + (near.z - me.z) * k; say = near.d < TIP + 0.35 ? `bar on ${near.id}` : `closing the bar onto ${near.id}`; }
  if (!good(px, pz)) { px = foe.x + w.dx * (extent + 1.5); pz = foe.z + w.dz * (extent + 1.5); if (!good(px, pz)) { px = 0; pz = 0; } }
  const n = lib.nav(s, px, pz, { ...SELF, stopAt: 0.15, reverse: true, speed: !giving && Math.abs(off) <= 0.7 && near.d < 2.5 ? 0.35 : 1 });
  out.say = n.braking ? 'braking for the edge' : say;
  drive(n.drive, n.arrived ? 0 : n.turn);
}
