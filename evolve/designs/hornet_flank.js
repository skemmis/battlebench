export const base = 'Hornet';
export const name = 'Hornet-flank';
export const idea = 'Hornet\'s body with a program that picks its side. It works out where the enemy\'s weapons are from the enemy\'s own moving joints, circles to the opposite side at full speed, staying out of reach, and only then runs in. The turret tracks the nearest piece it can actually hit, not the enemy\'s middle, and it leaves along the same weak side, re-reading the side as the enemy turns.';
export const target = 'Dreadnought';
export const note = 'Hornet with a flanking program: it circles to the side away from the enemy\'s weapons before every run, strikes the nearest leg there, and leaves the way it came.';

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
  const me = s.self, foe = s.enemy, SELF = { length: 1.2, top: 6.5, margin: 1.8, side: 0.5, climb: 0.2, grade: 0.4, grip: 0.45, feed: false, mem };
  const drive = (d, t) => { out.wl_0 = lib.clamp(d - t); out.wr_0 = lib.clamp(d + t); };
  const w = weakSide(s);
  // What the fist can reach: the nearest piece still on the enemy. The turret stays on that.
  let near = null, prey = null;
  for (const id in foe.parts) {
    const p = foe.parts[id]; if (!p.attached) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z); if (!near || d < near.d) near = { id, x: p.x, z: p.z, d };
    // The piece to run at: a leg on the weak side, the one furthest out that way.
    const out2 = (p.x - foe.x) * w.dx + (p.z - foe.z) * w.dz; if (id.startsWith('leg') && (!prey || out2 > prey.o)) prey = { id, x: p.x, z: p.z, o: out2 };
  }
  if (!near) near = { id: 'core', x: foe.x, z: foe.z, d: foe.distance };
  if (!prey) prey = { id: near.id, x: foe.x + w.dx, z: foe.z + w.dz };
  const tj = me.joints.turret, aim = lib.to(s, near.x, near.z);
  if (tj) out.turret = { angle: tj.angle + lib.wrap((me.upright < 0 ? -1 : 1) * aim.bearing - lib.wrap(tj.angle)) };
  const fj = me.joints.fist;
  if (fj && near.d < 2.3 && fj.charge > 0.95 && fj.extension < 0.05) { mem.punch = s.t + 0.25; mem.hit = near.id; }
  out.fist = s.t < (mem.punch || 0) ? 1 : 0;
  if (Math.abs(me.upright) < 0.3) { out.say = 'on my side, spinning the wheels to roll over'; drive(Math.sin(s.t * 6), 0.6); return; }
  // Where am I round the enemy, and how far from its weak side?
  const ang = Math.atan2(me.x - foe.x, me.z - foe.z), off = lib.wrap(Math.atan2(w.dx, w.dz) - ang);
  const good = (x, z) => lib.floorAt(s, x, z) && lib.edgeAt(s, x, z) > 1.6;
  if (!mem.mode) mem.mode = 'circle';
  if (mem.mode === 'circle' && Math.abs(off) < 0.45 && fj && fj.charge > 0.8) { mem.mode = 'strike'; mem.until = s.t + 3; }
  else if (mem.mode === 'strike' && (s.t < (mem.punch || 0) + 0.3 && s.t > (mem.punch || 0) || near.d < 1.3 || s.t > mem.until || Math.abs(off) > 1.3)) { mem.mode = 'out'; mem.until = s.t + 2.2; }
  else if (mem.mode === 'out' && (s.t > mem.until || foe.distance > 6)) mem.mode = 'circle';
  let n;
  if (mem.mode === 'strike') {
    n = lib.nav(s, prey.x, prey.z, { ...SELF, stopAt: 0 });
    out.say = `on ${w.why}, running in at ${prey.id}`;
  } else if (mem.mode === 'out') {
    // Leave straight back out along the weak side, so the way in next time is short.
    let R = 6.5; while (R > 3 && !good(foe.x + w.dx * R, foe.z + w.dz * R)) R -= 0.5;
    n = lib.nav(s, foe.x + w.dx * R, foe.z + w.dz * R, { ...SELF, stopAt: 0.5, reverse: true });
    out.say = mem.hit ? `struck ${mem.hit}, out the way I came` : 'out the way I came';
  } else {
    // Circle: a point further round toward the weak side, at a radius that keeps me out of its reach and on the floor.
    const step = lib.clamp(off, -0.9, 0.9), a = ang + step; let R = 5; while (R > 3 && !good(foe.x + Math.sin(a) * R, foe.z + Math.cos(a) * R)) R -= 0.5;
    const px = foe.x + Math.sin(a) * R, pz = foe.z + Math.cos(a) * R;
    if (good(px, pz)) { n = lib.nav(s, px, pz, { ...SELF, stopAt: 0, reverse: true }); out.say = `circling to ${w.why}`; }
    // Its weak side is against the edge and there is no room there: take the nearest piece from where I am.
    else { mem.mode = 'strike'; mem.until = s.t + 2.5; n = lib.nav(s, near.x, near.z, { ...SELF, stopAt: 0 }); out.say = 'no room on its weak side, taking the nearest piece'; }
  }
  if (n.braking) out.say = 'braking for the edge';
  drive(n.drive, n.turn);
}
