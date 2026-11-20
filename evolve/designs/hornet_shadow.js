export const base = 'Hornet';
export const name = 'Hornet-shadow';
export const idea = 'Hornet-flank landed its punches but spent most of each fight running in and out, and drew with Dreadnought after taking four legs. This program does not leave: it takes station just outside the enemy\'s outermost piece on its weak side, holds there as the enemy turns (it is three times as fast), and punches every time the fist recharges. It gives ground only when one of the enemy\'s weapons swings to within reach of it.';
export const target = 'Dreadnought';
export const note = 'Hornet with a shadowing program: it sits on the enemy\'s weak side at fist range, moves with it as it turns, and punches on every recharge.';

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
  const me = s.self, foe = s.enemy, SELF = { length: 1.2, top: 6.5, margin: 1.4, side: 0.5, climb: 0.2, grade: 0.4, grip: 0.45, feed: false, mem };
  const drive = (d, t) => { out.wl_0 = lib.clamp(d - t); out.wr_0 = lib.clamp(d + t); };
  const w = weakSide(s);
  // The nearest piece I can hit, how far the enemy sticks out on its weak side, and how near its nearest weapon is.
  let near = null, extent = 0.5, threat = 99;
  for (const id in foe.parts) {
    const p = foe.parts[id]; if (!p.attached) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z); if (!near || d < near.d) near = { id, x: p.x, z: p.z, d };
    extent = Math.max(extent, (p.x - foe.x) * w.dx + (p.z - foe.z) * w.dz);
    if (foe.joints[id] && !/^(leg|wl|wr|turret)/.test(id)) threat = Math.min(threat, d);
  }
  if (!near) near = { id: 'core', x: foe.x, z: foe.z, d: foe.distance };
  const tj = me.joints.turret, aim = lib.to(s, near.x, near.z);
  if (tj) out.turret = { angle: tj.angle + lib.wrap((me.upright < 0 ? -1 : 1) * aim.bearing - lib.wrap(tj.angle)) };
  const fj = me.joints.fist;
  if (fj && near.d < 2.3 && fj.charge > 0.95 && fj.extension < 0.05) { mem.punch = s.t + 0.25; mem.count = (mem.count || 0) + 1; mem.hit = near.id; }
  out.fist = s.t < (mem.punch || 0) ? 1 : 0;
  if (Math.abs(me.upright) < 0.3) { out.say = 'on my side, spinning the wheels to roll over'; drive(Math.sin(s.t * 6), 0.6); return; }
  const good = (x, z) => lib.floorAt(s, x, z) && lib.edgeAt(s, x, z) > 1.3;
  // Station: fist range beyond its outermost piece on the weak side. Further out while a weapon is close.
  const giving = threat < 1.7; let R = extent + (giving ? 3.6 : 1.8);
  let px = foe.x + w.dx * R, pz = foe.z + w.dz * R;
  // No floor there (its weak side is at the edge): slide round one way or the other until there is.
  if (!good(px, pz)) { const a0 = Math.atan2(w.dx, w.dz); for (const da of [0.5, -0.5, 1, -1, 1.5, -1.5]) { const x = foe.x + Math.sin(a0 + da) * R, z = foe.z + Math.cos(a0 + da) * R; if (good(x, z)) { px = x; pz = z; break; } } }
  // Getting there: if the enemy is between me and the station, go round it, not through it.
  const ang = Math.atan2(me.x - foe.x, me.z - foe.z), off = lib.wrap(Math.atan2(px - foe.x, pz - foe.z) - ang);
  if (Math.abs(off) > 0.8) { const a = ang + lib.clamp(off, -0.8, 0.8), RR = Math.max(R, extent + 2.4); const x = foe.x + Math.sin(a) * RR, z = foe.z + Math.cos(a) * RR; if (good(x, z)) { px = x; pz = z; } }
  const n = lib.nav(s, px, pz, { ...SELF, stopAt: 0.25, reverse: true });
  out.say = n.braking ? 'braking for the edge' : giving ? 'its weapon is coming round, giving ground' : Math.abs(off) > 0.8 ? `going round to ${w.why}` : s.t < (mem.punch || 0) + 0.5 ? `on ${w.why}, punching ${mem.hit} (punch ${mem.count})` : `holding station on ${w.why}`;
  drive(n.drive, n.arrived ? 0 : n.turn);
}
