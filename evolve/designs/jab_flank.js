export const base = 'Jab';
export const name = 'Jab-flank';
export const idea = 'Jab\'s body with a program that will not step in from the front. It reads where the enemy\'s weapons are from its moving joints, circles to the other side, and takes only legs on that side, so it boxes from where the enemy cannot answer.';
export const target = 'Warden';
export const note = 'Jab with a flanking program: it circles to the side away from the enemy\'s weapons and jabs the legs there.';
const FISTS = [['fist_l', 0.5], ['fist_m', 0], ['fist_r', -0.5]];

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
  const me = s.self, foe = s.enemy, SELF = { length: 2.0, top: 6, margin: 1.6, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false };
  const flip = me.upright < 0 ? -1 : 1;
  const drive = (d, t) => { d *= flip; out.wl_f = out.wl_b = lib.clamp(d - t); out.wr_f = out.wr_b = lib.clamp(d + t); };
  for (const [id] of FISTS) out[id] = s.t < (mem[id] || 0) ? 1 : 0;
  if (Math.abs(me.upright) < 0.3) { out.say = 'on my side, rocking the wheels to drop back'; drive(Math.sin(s.t * 6), 0.6); return; }
  const w = weakSide(s);
  // The target: the nearest piece of leg still on the enemy. With no legs left it cannot walk; then any piece will do.
  let tg = null, anyLeg = false;
  for (const pass of [true, false]) {
    for (const id in foe.parts) { const p = foe.parts[id]; if (!p.attached || (pass && (!id.startsWith('leg') || (p.x - foe.x) * w.dx + (p.z - foe.z) * w.dz < 0))) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (!tg || d < tg.d) tg = { id, x: p.x, z: p.z, d }; }
    if (tg) { anyLeg = pass; break; }
  }
  if (!tg) tg = { id: 'core', x: foe.x, z: foe.z, d: foe.distance };
  const at = lib.to(s, tg.x, tg.z), ready = FISTS.filter(([id]) => { const j = me.joints[id]; return j && j.charge > 0.95 && j.extension < 0.05; });
  // Fist range: the fists reach 1.9 m ahead of the core at rest and 2.5 m at full stroke.
  const REACH = 2.25, inRange = at.distance < 2.55 && at.distance > 1.5 && Math.abs(at.bearing) < 0.3;
  if (inRange && ready.length) {
    // Throw the fist that is most nearly in line with the target.
    const side = Math.sin(at.bearing) * at.distance, pick = ready.reduce((a, b) => (Math.abs(b[1] - side) < Math.abs(a[1] - side) ? b : a));
    mem[pick[0]] = s.t + 0.25; out[pick[0]] = 1; mem.thrown = (mem.thrown || 0) + 1;
    out.say = `jabbing at ${tg.id}`;
    drive(0, lib.clamp(at.bearing * 2.5, -0.5, 0.5)); return;
  }
  // Nothing charged: step back out of reach of whatever it swings, facing it, until a fist is ready again.
  if (!ready.length && foe.distance < 4.2) {
    out.say = 'fists recharging, stepping back out of reach';
    const g = lib.guard(s, -0.9, SELF); drive(g.drive, lib.clamp(at.bearing * 2, -0.5, 0.5)); return;
  }
  // Step in: close to fist range on the target and square up to it. Too close, back off to range.
  if (at.distance < 1.6) { const g = lib.guard(s, -0.7, SELF); out.say = 'too close to punch, opening the range'; drive(g.drive, lib.clamp(at.bearing * 2, -0.5, 0.5)); return; }
  // Not on its weak side yet: go round, outside its reach, before stepping in.
  const ang = Math.atan2(me.x - foe.x, me.z - foe.z), off = lib.wrap(Math.atan2(w.dx, w.dz) - ang);
  if (Math.abs(off) > 0.7 && foe.distance < 7) {
    const a = ang + lib.clamp(off, -0.8, 0.8); let R = 4.6; while (R > 3 && !(lib.floorAt(s, foe.x + Math.sin(a) * R, foe.z + Math.cos(a) * R) && lib.edgeAt(s, foe.x + Math.sin(a) * R, foe.z + Math.cos(a) * R) > 1.8)) R -= 0.4;
    const px = foe.x + Math.sin(a) * R, pz = foe.z + Math.cos(a) * R;
    if (lib.floorAt(s, px, pz) && lib.edgeAt(s, px, pz) > 1.8) { const c = lib.nav(s, px, pz, { ...SELF, stopAt: 0, reverse: true }); out.say = c.braking ? 'braking for the edge' : `circling to ${w.why}`; drive(c.drive, c.turn); return; }
  }
  const n = lib.nav(s, tg.x, tg.z, { ...SELF, stopAt: REACH });
  out.say = n.braking ? 'braking for the edge' : n.arrived ? `squaring up to ${tg.id}` : anyLeg ? `stepping in on ${tg.id}` : 'it has no legs left, going for what is still attached';
  drive(n.drive, n.arrived ? lib.clamp(at.bearing * 2.5, -0.6, 0.6) : n.turn);
}
