import { kit } from '../kit.js';
const { hunt } = kit;
export const base = 'Bull';
export const name = 'Bull-flank';
export const idea = 'Bull drove straight into Pivot\'s shears and lost its front axle, its blade and a rail in the first six seconds. This program goes round first: it finds the side away from the enemy\'s weapons, drives to a point out on that side, and only then turns in to shove.';
export const target = 'Pivot';
export const note = 'Bull with a program that goes round to the enemy\'s weak side before it shoves.';

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
  const me = s.self, foe = s.enemy, SELF = { length: 2.9, top: 5, margin: 2.0, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem, feed: false };
  const L = ['wl_0', 'wl_1', 'wl_2'], R = ['wr_0', 'wr_1', 'wr_2'];
  const drive = (d, t) => { for (const id of L) out[id] = lib.clamp(d - t); for (const id of R) out[id] = lib.clamp(d + t); };
  if (me.upright < 0.2) { out.say = 'tipped, rocking the wheels'; drive(Math.sin(s.t * 5), 0.5); return; }
  // Do not drive into its weapons. Go to a point three and a half metres out on its weak side first, then turn in and shove from there.
  const w = weakSide(s), ang = Math.atan2(me.x - foe.x, me.z - foe.z), off = Math.abs(lib.wrap(Math.atan2(w.dx, w.dz) - ang));
  const gx = foe.x + w.dx * 3.5, gz = foe.z + w.dz * 3.5, round = off > 0.8 && foe.distance > 2.2 && lib.floorAt(s, gx, gz) && lib.edgeAt(s, gx, gz) > 2;
  if (round) { const c = lib.nav(s, gx, gz, { ...SELF, stopAt: 0.5 }); out.say = c.braking ? 'braking for the edge' : 'going round to ' + w.why; drive(c.drive, c.turn); return; }
  const h = hunt(s, lib), n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6 });
  out.say = n.braking ? 'braking for the edge' : foe.distance < 3.5 && Math.abs(foe.bearing) < 0.5 ? 'blade under it, shoving' : h.say;
  drive(n.drive, n.turn);
}
