// How nimble is a machine? Drives it by hand on the open floor and reports top speed, how long it takes to get
// there, how far it takes to stop, and how fast it can turn on the spot. Usage: npm run agility
import { createMatch } from '../src/sim.js';
import { ALL, walk } from '../src/bots.js';
import { NAMED } from '../src/challenges.js';

const BRICK = { name: 'Brick', parts: [{ id: 'core', type: 'core' }] };
const floor = NAMED.find((c) => c.name === 'Open floor');
// A machine may bring its own way of being driven by hand: build.drive(s, out, mem, lib, forward, turn).
const driver = (build) => build.drive || ((s, out, mem, lib, f, t) => {
  const ids = Object.keys(s.self.joints), L = ids.filter((i) => /^(leg_l|wl_)/.test(i)), R = ids.filter((i) => /^(leg_r|wr_)/.test(i));
  if (ids.some((i) => /^w[lr]_/.test(i))) { for (const i of L) out[i] = lib.clamp(f - t); for (const i of R) out[i] = lib.clamp(f + t); }
  else { mem.long = L.length > 3; walk(s, out, mem, lib, f, t, L, R); }
});
export function measure(build) {
  const d = driver(build), run = (cmd, seconds) => {
    const ch = { ...floor, spawn: [{ x: 0, z: -7, yaw: 0 }, { x: 8, z: 8, yaw: 0 }] };
    const m = createMatch({ builds: [build, BRICK], programs: [(s, out, mem, lib) => { const c = cmd(s.t, s); d(s, out, mem, lib, c[0], c[1]); }, () => {}], seed: 1, challenge: ch });
    const tr = [];
    while (m.t < seconds && !m.done) { m.step(); const b = m.bots[0].core.body; tr.push({ t: m.t, x: b.position.x, z: b.position.z, v: Math.hypot(b.velocity.x, b.velocity.z), w: b.angularVelocity.y }); }
    return { tr, mass: m.bots[0].startMass, lost: m.events.filter((e) => e.type === 'part_lost').length };
  };
  const avg = (tr, a, b, f) => { const s = tr.filter((p) => p.t >= a && p.t < b); return s.reduce((x, p) => x + f(p), 0) / s.length; };
  // Straight: full ahead for 4 s, then stop.
  const st = run((t) => [t < 4 ? 1 : 0, 0], 7), top = avg(st.tr, 3, 4, (p) => p.v);
  const reach = st.tr.find((p) => p.v >= 0.8 * top)?.t ?? 9, at4 = st.tr.find((p) => p.t >= 4), end = st.tr.at(-1);
  // Spin: full turn for 4 s from rest.
  const sp = run((t) => [0, 1], 4), spin = Math.abs(avg(sp.tr, 1.5, 4, (p) => p.w)) * 180 / Math.PI;
  return { name: build.name, mass: Math.round(st.mass), top: +top.toFixed(1), to80: +reach.toFixed(1), stop: +Math.hypot(end.x - at4.x, end.z - at4.z).toFixed(1), spin: Math.round(spin), lost: st.lost + sp.lost };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const pick = process.argv[2] ? new RegExp(process.argv[2]) : /./;
  console.log('machine        kg   top m/s  s to 80%  stop m  turn deg/s  parts lost');
  for (const r of ALL) if (pick.test(r.build.name)) { const a = measure(r.build); console.log(a.name.padEnd(12), String(a.mass).padStart(4), String(a.top).padStart(8), String(a.to80).padStart(9), String(a.stop).padStart(7), String(a.spin).padStart(10), String(a.lost).padStart(8)); }
}
