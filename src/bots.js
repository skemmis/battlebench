// Hand-built machines for the knockout game on broken ground. Each is a build (the parts list a model would
// write) and a control program. There are no ready-made wheels, legs or weapons in the kit, so everything here
// is assembled from plain pieces: a leg is spokes on a hub, a hammer is a weight on an arm on a motor.
// The builds are written with a few small helpers to save typing; what the simulator receives is the plain list.
// The machines from before the game changed (point holding on flat floors) are in old/bots-v05.js.

const beam = (id, size, pos, parent, material = 'aluminium', extra = {}) => ({ id, type: 'beam', material, size, pos, parent, ...extra });
const plate = (id, size, pos, parent, material = 'aluminium', extra = {}) => ({ id, type: 'plate', material, size, pos, parent, ...extra });
const block = (id, size, pos, parent, material = 'aluminium', extra = {}) => ({ id, type: 'block', material, size, pos, parent, ...extra });

// A spoked leg: a hub on a motor with three spokes and rubber feet. It steps onto a ledge that a wheel of the
// same size would only bump against.
function leg(name, x, z, offsetDeg, parent, { reach = 0.74, power = 0.6 } = {}) {
  const parts = [{ id: name, type: 'disc', material: 'aluminium', radius: 0.18, thickness: 0.14, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 8, power } }];
  for (let k = 0; k < 3; k++) {
    const deg = offsetDeg + k * 120, a = (deg * Math.PI) / 180, dy = -Math.sin(a), dz = Math.cos(a), mid = (reach + 0.1) / 2;
    parts.push({ id: `${name}_s${k}`, type: 'beam', material: 'aluminium', size: [0.08, 0.08, reach - 0.18], pos: [x, dy * mid, z + dz * mid], rot: [deg, 0, 0], parent: name });
    parts.push({ id: `${name}_f${k}`, type: 'block', material: 'rubber', size: [0.2, 0.14, 0.14], pos: [x, dy * reach, z + dz * reach], rot: [deg, 0, 0], parent: `${name}_s${k}` });
  }
  return parts;
}
// A six-legged frame: a spine, three axles, and legs built a sixth of a turn apart so that three feet are always
// coming down as three lift. The middle legs sit further out so the spokes pass each other.
function hexFrame({ spread = 1.0, half = 1.04, reach = 0.74, power = 0.6, frame = 'aluminium' } = {}) {
  return [
    { id: 'core', type: 'core' },
    beam('spine', [0.2, 0.16, 2.4], [0, 0, 0], 'core', frame),
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [Math.min(2.4, (i === 0 ? half + 0.26 : half) * 2 - 0.18), 0.12, 0.12], [0, 0, i * spread], 'spine', frame)]),
    ...[-1, 0, 1].flatMap((i) => { const x = i === 0 ? half + 0.26 : half; return [...leg('leg_l' + (i + 1), x, i * spread, i === 0 ? 60 : 0, 'axle_' + (i + 1), { reach, power }), ...leg('leg_r' + (i + 1), -x, i * spread, i === 0 ? 0 : 60, 'axle_' + (i + 1), { reach, power })]; }),
  ];
}
const LEGS_L = ['leg_l0', 'leg_l1', 'leg_l2'], LEGS_R = ['leg_r0', 'leg_r1', 'leg_r2'];

// Walk: each side has a phase that advances with the wanted speed, and every hub on that side is held to it by
// reading its angle, the way a walking animal keeps a gait. Going straight, the two sides are pulled into step
// so the gait stays a tripod.
function walk(s, out, mem, lib, fwd, turn) {
  const me = s.self, TURN = (2 * Math.PI) / 3;
  if (mem.pl === undefined) { mem.pl = 0; mem.pr = 0; }
  // A walker turns badly with one side stopped: for a sharp turn, the two sides step in opposite directions.
  turn = lib.clamp(turn - me.turnRate * 0.5);
  if (Math.abs(turn) > 0.3) fwd *= 0.1;
  // In low gravity each step takes longer to come down, so the gait slows to match.
  const pace = 3.2 * Math.sqrt(s.challenge.gravity);
  const vl = lib.clamp(fwd - turn) * pace, vr = lib.clamp(fwd + turn) * pace;
  mem.pl += vl / 30; mem.pr += vr / 30;
  // Do not let the wanted leg position run away from the real one when the legs are held up.
  const lead = (ids, ph) => { let sum = 0, n = 0; for (const id of ids) { const j = me.joints[id]; if (j) { sum += j.angle; n++; } } return n ? lib.clamp(ph, sum / n - 0.5, sum / n + 0.5) : ph; };
  mem.pl = lead(LEGS_L, mem.pl); mem.pr = lead(LEGS_R, mem.pr);
  if (Math.abs(vl - vr) < 0.5) { let d = (mem.pl - mem.pr) % TURN; if (d > TURN / 2) d -= TURN; if (d < -TURN / 2) d += TURN; mem.pl -= d * 0.05; mem.pr += d * 0.05; }
  for (const [ids, ph, v] of [[LEGS_L, mem.pl, vl], [LEGS_R, mem.pr, vr]]) for (const id of ids) {
    const j = me.joints[id]; if (!j) continue;
    out[id] = lib.clamp((v + 6 * (ph - j.angle)) / 10);
  }
}

// Where to go to win. A machine near a drop is easier to put over it than to break, so if the enemy is within
// reach of an edge, get on the inboard side of it and drive it out. Otherwise close with it.
function hunt(s, lib) {
  const me = s.self, foe = s.enemy;
  let best = null;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), d = lib.run(s, foe.x, foe.z, dx, dz, 8, 0, 99); if (!best || d < best.d) best = { d, dx, dz }; }
  if (best.d < 6) {
    const mx = me.x - foe.x, mz = me.z - foe.z, mn = Math.hypot(mx, mz) || 1;
    if (-(mx * best.dx + mz * best.dz) / mn > 0.5) return { x: foe.x + best.dx * 1.2, z: foe.z + best.dz * 1.2, charge: true, say: 'driving it toward the edge' };
    const sx = foe.x - best.dx * 3, sz = foe.z - best.dz * 3;
    if (lib.floorAt(s, sx, sz) && foe.distance > 2.5) return { x: sx, z: sz, charge: false, say: 'getting inboard of it, to push it out' };
  }
  const hit = foe.distance > 3 ? lib.intercept(s, foe, 2.5) : foe;
  return { x: hit.x, z: hit.z, charge: true, say: 'closing on the enemy' };
}
// Walk to wherever hunt says, by a route this machine can climb, stopping short of drops.
function stalk(s, out, mem, lib, SELF, { keep = 0 } = {}) {
  const h = hunt(s, lib), foe = s.enemy;
  // If there is no way to it, the plan ends at the nearest ground I can stand on: stop there, do not press on.
  const open = lib.plan(s, h.x, h.z, SELF).reachable;
  const n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: !open ? 0.8 : h.charge ? keep : 0.6, reverse: !open });
  if (!open && n.arrived) { out.say = 'no way to it from here, waiting at the nearest ground'; walk(s, out, mem, lib, 0, 0); return n; }
  out.say = n.backing ? 'jammed on a ledge, backing off to try again' : n.braking ? 'stopping short of the edge' : !n.reachable && foe.distance > 3 ? 'no way to it from here, getting as near as I can' : h.say;
  walk(s, out, mem, lib, n.drive, n.turn);
  return n;
}
// On its back, a walker kicks both sides opposite ways to roll over.
function righting(s, out) {
  if (s.self.upright >= 0.2) return false;
  out.say = 'on my back, kicking to roll over';
  for (const id of LEGS_L) out[id] = 1; for (const id of LEGS_R) out[id] = -1;
  return true;
}

// ── Strider ────────────────────────────────────────────────────────────────
// Six legs and a steel beak. Light and quick over ledges. It wins by getting inboard of a heavier machine near
// an edge, or by pecking pieces off one that is stuck.
export const STRIDER = {
  name: 'Strider',
  note: 'Walks on six spoked legs and climbs ledges wheels cannot. Light and quick; it goes for machines that are stuck or near an edge, and pecks with a steel beak.',
  parts: [
    ...hexFrame(),
    plate('back_0', [0.9, 0.06, 0.7], [0, 0.2, -0.8], 'spine', 'plastic'),
    plate('back_1', [1.0, 0.06, 0.7], [0, 0.28, 0], 'spine', 'plastic'),
    plate('back_2', [0.9, 0.06, 0.7], [0, 0.2, 0.8], 'spine', 'plastic'),
    beam('beak', [0.16, 0.16, 0.7], [0, -0.05, 1.5], 'spine', 'steel'),
    { id: 'beak_tip', type: 'wedge', material: 'steel', size: [0.5, 0.3, 0.4], pos: [0, -0.1, 2.0], parent: 'beak' },
  ],
};
const WALKER = { length: 1.9, top: 2.4, margin: 2.0, side: 0.5, climb: 0.45, grip: 0.8, feed: false };
export function striderProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, mem };
  if (righting(s, out)) return;
  // Peck: when the beak is on it, back off a pace and come in again at speed. A blow at speed is what breaks joints.
  if (s.t < (mem.back || 0)) { out.say = 'stepping back for another peck'; const g = lib.guard(s, -1, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(foe.bearing * 1.5, -0.3, 0.3)); return; }
  mem.press = foe.distance < 3.2 && Math.abs(foe.bearing) < 0.6 && me.speed < 0.5 ? (mem.press || 0) + 1 : 0;
  if (mem.press > 25) { mem.press = 0; mem.back = s.t + 0.9; }
  stalk(s, out, mem, lib, SELF);
}

// ── Mantis ─────────────────────────────────────────────────────────────────
// A walker with two hammers. The arms lie back along the body, swing up and over, and come down in front of it.
// Each head is 20 kg of steel on a 1.7 m arm.
const hammer = (i, x) => [
  { id: 'arm_' + i, type: 'beam', material: 'aluminium', size: [0.1, 0.1, 1.8], pos: [x, 0.75, -0.7], parent: 'yoke', joint: { type: 'motor', axis: [1, 0, 0], pivot: [x, 0.75, 0.2], gear: 5, power: 1, limits: [-6, 214] } },
  block('head_' + i, [0.24, 0.24, 0.3], [x, 0.75, -1.5], 'arm_' + i, 'steel'),
];
export const MANTIS = {
  name: 'Mantis',
  note: 'A six-legged walker with two steel hammers. It walks up to the enemy, squares up, and brings the hammers down one after the other. A steel keel keeps it the right way up on ledges.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    beam('post_l', [0.14, 0.75, 0.14], [0.62, 0.38, 0.2], 'axle_1', 'steel'),
    beam('post_r', [0.14, 0.75, 0.14], [-0.62, 0.38, 0.2], 'axle_1', 'steel'),
    beam('stay_l', [0.08, 0.9, 0.08], [0.62, 0.32, 0.5], 'post_l', 'aluminium', { rot: [-40, 0, 0] }),
    beam('stay_r', [0.08, 0.9, 0.08], [-0.62, 0.32, 0.5], 'post_r', 'aluminium', { rot: [-40, 0, 0] }),
    beam('yoke', [1.38, 0.12, 0.12], [0, 0.75, 0.2], 'post_l', 'steel'),
    ...hammer(0, 0.36), ...hammer(1, -0.36),
    block('keel', [0.3, 0.2, 0.6], [0, -0.18, 0], 'spine', 'steel'),
  ],
};
export function mantisProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, mem }, REST = -0.05, DOWN = 3.62;
  const arms = [0, 1].filter((i) => me.joints['arm_' + i]);
  const hold = (i, to, max = 0.6) => { const j = me.joints['arm_' + i]; if (j) out['arm_' + i] = lib.clamp((to - j.angle) * 1.2, -max, max); };
  if (me.upright < 0.2) { out.say = 'tipped over, pushing up with the hammers'; for (const i of arms) out['arm_' + i] = Math.sin(s.t * 2) > 0 ? 0.35 : -0.35; for (const id of LEGS_L) out[id] = 1; for (const id of LEGS_R) out[id] = -1; return; }
  // A swing in progress: full power down, then lift the arm back.
  if (mem.swing != null) {
    const i = mem.swing, j = me.joints['arm_' + i];
    if (!j) mem.swing = null;
    else if (mem.lift) { hold(i, REST, 0.8); if (j.angle < 0.4 || s.t > mem.until) { mem.swing = null; mem.lift = false; mem.next = 1 - i; } }
    else { out['arm_' + i] = 1; if (j.angle > DOWN || s.t > mem.until) { mem.lift = true; mem.until = s.t + 2; } }
  }
  for (const i of arms) if (mem.swing !== i) hold(i, REST);
  // In reach and square on: stand and strike. The heads land between 1.3 and 2.2 m ahead of the core.
  const inReach = foe.distance > 1.1 && foe.distance < 2.5 && Math.abs(foe.bearing) < 0.3;
  if (inReach && arms.length) {
    out.say = 'in reach, bringing the hammers down';
    walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.4, 0.4));
    if (mem.swing == null && s.t > (mem.cool || 0)) { const i = arms.includes(mem.next) ? mem.next : arms[0]; mem.swing = i; mem.lift = false; mem.until = s.t + 0.9; mem.cool = s.t + 0.45; }
    return;
  }
  if (foe.distance <= 1.1 && arms.length) { out.say = 'too close to swing, stepping back'; const g = lib.guard(s, -0.8, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(foe.bearing * 2, -0.4, 0.4)); return; }
  // Closing in: stop at striking distance, not on top of it.
  const n = stalk(s, out, mem, lib, SELF, { keep: arms.length ? 1.7 : 0 });
  if (n.arrived && arms.length) { out.say = 'squaring up to strike'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.5, 0.5)); }
}

// ── Thresher ───────────────────────────────────────────────────────────────
// A walker with a spinning bar across its nose, turning so that it strikes upward. It breaks what it touches
// and throws lighter machines back.
export const THRESHER = {
  name: 'Thresher',
  note: 'A six-legged walker with a steel bar spinning across its nose. The bar turns upward at the front, so what it hits is broken or thrown up and back. It keeps its nose on the enemy and walks into it.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    beam('fork_l', [0.12, 0.12, 0.9], [0.56, 0.02, 1.55], 'axle_2', 'steel'),
    beam('fork_r', [0.12, 0.12, 0.9], [-0.56, 0.02, 1.55], 'axle_2', 'steel'),
    { id: 'drum', type: 'disc', material: 'steel', radius: 0.16, thickness: 0.2, pos: [0, 0.02, 1.9], rot: [0, 0, 90], parent: 'fork_l', joint: { type: 'motor', axis: [1, 0, 0], gear: 3, power: 1 } },
    beam('bar_a', [0.9, 0.1, 0.12], [0, 0.02, 1.9 + 0.36], 'drum', 'steel'),
    beam('bar_b', [0.9, 0.1, 0.12], [0, 0.02, 1.9 - 0.36], 'drum', 'steel'),
    plate('back', [1.0, 0.06, 1.6], [0, 0.22, -0.2], 'spine', 'plastic'),
    block('tail', [0.4, 0.3, 0.4], [0, 0, -1.25], 'spine', 'steel'),
  ],
};
export function thresherProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.4, mem };
  // The bar spins all the time it is the right way up, upward at the front.
  out.drum = me.upright > 0.2 ? -1 : 0;
  if (righting(s, out)) return;
  // After a hit, the enemy is often thrown clear. Do not chase blindly over an edge: stalk plans the way.
  if (foe.distance < 3 && Math.abs(foe.bearing) > 0.5) { out.say = 'turning the bar onto it'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.6, 0.6)); return; }
  stalk(s, out, mem, lib, SELF);
  if (foe.distance < 3) out.say = 'feeding it into the bar';
}

// ── Slinger ────────────────────────────────────────────────────────────────
// A walker carrying three throwing arms. It stays at range, works out the swing for the distance and gravity,
// and leads a moving target. When the shot is gone the arms are clubs.
const ARM_X = [-0.38, 0, 0.38];
export const SLINGER = {
  name: 'Slinger',
  note: 'A six-legged walker that throws steel balls from three swinging arms. It measures the range, sets the swing to match the gravity, leads a moving target, and uses the arms as clubs when the balls are gone.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    plate('deck', [1.3, 0.06, 1.8], [0, 0.12, 0], 'spine'),
    block('keel', [0.4, 0.22, 0.6], [0, -0.2, 0.3], 'spine', 'steel'),
    ...['l', 'r'].flatMap((side) => { const sx = side === 'l' ? 1 : -1; return [
      beam('tower_' + side, [0.14, 1.0, 0.14], [sx * 0.66, 0.5, 0], 'axle_1'),
      beam('brace_f' + side, [0.08, 1.15, 0.08], [sx * 0.66, 0.42, 0.42], 'tower_' + side, 'aluminium', { rot: [-36, 0, 0] }),
      beam('brace_b' + side, [0.08, 1.15, 0.08], [sx * 0.66, 0.42, -0.42], 'tower_' + side, 'aluminium', { rot: [36, 0, 0] }),
    ]; }),
    beam('axle', [1.46, 0.1, 0.1], [0, 1.0, 0], 'tower_l', 'steel'),
    ...ARM_X.flatMap((x, i) => [
      { id: 'arm_' + i, type: 'beam', material: 'aluminium', size: [0.1, 0.1, 2.0], pos: [x, 1.0, -0.5], parent: 'axle', joint: { type: 'motor', axis: [1, 0, 0], pivot: [x, 1.0, 0], gear: 6, power: 1, limits: [-14, 215] } },
      block('weight_' + i, [0.2, 0.3, 0.2], [x, 0.85, 0.4], 'arm_' + i, 'steel'),
      plate('cup_' + i, [0.3, 0.05, 0.3], [x, 1.07, -1.4], 'arm_' + i),
      { id: 'shot_' + i, type: 'ball', material: 'steel', radius: 0.17, pos: [x, 1.27, -1.4], parent: 'cup_' + i },
    ]),
  ],
};
export function slingerProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, ARM = 1.45, TOP = 20 / 1.5, RELEASE = 0.85, SELF = { ...WALKER, mem };
  const loaded = [0, 1, 2].filter((i) => me.parts['shot_' + i].attached && me.parts['arm_' + i].attached);
  const g = 9.81 * s.challenge.gravity;
  out.release = [];
  for (const i of [0, 1, 2]) { const j = me.joints['arm_' + i]; if (j && mem.firing !== i) out['arm_' + i] = lib.clamp((-0.2 - j.angle) * 0.8, -0.5, 0.5); }
  if (me.upright < 0.2) { out.say = 'tipped over, levering up with the arms'; for (const i of [0, 1, 2]) out['arm_' + i] = Math.sin(s.t * 2) > 0 ? 0.3 : -0.3; for (const id of LEGS_L) out[id] = 1; for (const id of LEGS_R) out[id] = -1; return; }
  // Launch speed for a ball let go at 49 degrees, to come down d metres away on ground "drop" metres below the
  // point of release. Throwing from high ground reaches further, and the sum allows for it.
  const speedFor = (d, drop) => { const c = Math.cos(RELEASE), sn = Math.sin(RELEASE), den = 2 * c * c * (d * (sn / c) + drop); return den > 0 ? Math.sqrt((g * d * d) / den) : 99; };
  const MAXV = 11.5;
  if (mem.firing != null) {
    const i = mem.firing, j = me.joints['arm_' + i];
    if (!j || !me.parts['shot_' + i].attached) { mem.firing = null; mem.cool = s.t + 0.8; }
    else {
      out['arm_' + i] = lib.clamp(mem.swing / (ARM * TOP), 0, 1);
      out.say = `throwing at ${mem.range.toFixed(0)} m`;
      walk(s, out, mem, lib, 0, 0);
      if (j.angle >= RELEASE) { out.release.push('shot_' + i); mem.firing = null; mem.cool = s.t + 0.9; }
      return;
    }
  }
  if (loaded.length) {
    // Aim where the enemy will be when the ball lands, not where it is now.
    const drop = 2.0 + me.y - foe.y;
    let lead = { x: foe.x, z: foe.z }, d = foe.distance, v = speedFor(d, drop);
    for (let k = 0; k < 3; k++) { const flight = d / Math.max(1, v * Math.cos(RELEASE)) + 0.45; lead = lib.ahead(foe, flight); d = Math.hypot(lead.x - me.x, lead.z - me.z); v = speedFor(d, drop); }
    const b = lib.to(s, lead.x, lead.z), tooFar = v > MAXV, tooNear = d < 4.5;
    if (tooFar) {
      const n = lib.nav(s, lead.x, lead.z, { ...SELF, speed: 0.85, stopAt: 6 });
      out.say = n.reachable ? 'closing to throwing range' : 'closing as far as the ground lets me';
      walk(s, out, mem, lib, n.drive, n.turn); return;
    }
    if (tooNear && !(mem.cornered > s.t)) {
      const gd = lib.guard(s, -0.8, SELF);
      if (gd.room > 0.3) { out.say = 'too close to throw, backing off'; walk(s, out, mem, lib, gd.drive, lib.clamp(b.bearing * 1.5, -0.3, 0.3)); return; }
      mem.cornered = s.t + 3;
    }
    if (tooNear) {
      out.say = 'no room to back off, swinging at it';
      for (const i of loaded) { const j = me.joints['arm_' + i]; if (j) out['arm_' + i] = j.angle < 2.6 ? 1 : -1; }
      walk(s, out, mem, lib, 0, lib.clamp(b.bearing * 2, -0.5, 0.5)); return;
    }
    // In range: stop, turn onto the line, wait until steady, then swing.
    const steady = Math.abs(b.bearing) < 0.05 && Math.abs(me.turnRate) < 0.3 && me.speed < 0.4;
    out.say = steady ? 'on target' : 'lining up the throw';
    walk(s, out, mem, lib, 0, lib.clamp(b.bearing * 2.5, -0.5, 0.5));
    if (steady && s.t > (mem.cool || 1.2)) { mem.firing = loaded[0]; mem.swing = v; mem.range = d; }
    return;
  }
  // Out of shot: close in and club it.
  const near = foe.distance < 2.6 && Math.abs(foe.bearing) < 0.5;
  for (const i of [0, 1, 2]) { const j = me.joints['arm_' + i]; if (j) out['arm_' + i] = near ? (j.angle < 2.9 ? 1 : -1) : lib.clamp((-0.2 - j.angle) * 0.8, -0.5, 0.5); }
  if (near) { out.say = 'out of shot, clubbing with the arms'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.5, 0.5)); return; }
  stalk(s, out, mem, lib, SELF, { keep: 1.8 });
}

// ── Rover ──────────────────────────────────────────────────────────────────
// The wheeled machine, built as well as wheels allow: six rubber discs of the largest size, a high frame, and a
// steel ram. It is the heaviest and fastest machine here on flat ground. Broken ground is another matter.
const tyre = (id, x, z, parent) => ({ id, type: 'disc', material: 'rubber', radius: 0.58, thickness: 0.2, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 6, power: 0.45 } });
export const ROVER = {
  name: 'Rover',
  note: 'The wheeled machine: six of the biggest tyres the kit allows, a high frame and a steel ram. Heavy and fast on the flat, and it rams. On broken ground it has to find a way its wheels can take.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.2, 0.16, 2.4], [0, 0, 0], 'core', 'steel'),
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [1.7, 0.14, 0.14], [0, 0, i * 1.22], 'spine'), tyre('wl_' + (i + 1), 1.0, i * 1.22, 'axle_' + (i + 1)), tyre('wr_' + (i + 1), -1.0, i * 1.22, 'axle_' + (i + 1))]),
    plate('deck', [1.4, 0.06, 2.2], [0, 0.14, 0], 'spine'),
    beam('horn', [0.2, 0.2, 0.8], [0, 0.0, 1.6], 'spine', 'steel'),
    { id: 'ram', type: 'wedge', material: 'steel', size: [1.3, 0.4, 0.5], pos: [0, -0.05, 2.2], parent: 'horn' },
  ],
};
export function roverProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 2.5, top: 5, margin: 2.0, side: 0.6, climb: 0.2, mem };
  const drive = (d, t) => { for (const id of ['wl_0', 'wl_1', 'wl_2']) out[id] = lib.clamp(d - t); for (const id of ['wr_0', 'wr_1', 'wr_2']) out[id] = lib.clamp(d + t); };
  if (me.upright < 0.2) { out.say = 'on my back, spinning the wheels to roll over'; drive(Math.sin(s.t * 5), 0.5); return; }
  // Ram, and if it does not give, back off for a run-up: a blow at speed is what breaks joints.
  if (s.t < (mem.back || 0)) { out.say = 'backing off for a run-up'; const g = lib.guard(s, -1, SELF); drive(g.drive, lib.clamp(foe.bearing, -0.3, 0.3)); if (foe.distance > 6) mem.back = 0; return; }
  mem.press = foe.distance < 3.6 && Math.abs(foe.bearing) < 0.6 && me.speed < 0.5 ? (mem.press || 0) + 1 : 0;
  if (mem.press > 25) { mem.press = 0; mem.back = s.t + 1.4; }
  const h = hunt(s, lib), open = lib.plan(s, h.x, h.z, SELF).reachable, n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: !open ? 0.8 : h.charge ? 0 : 0.6, reverse: !open });
  out.say = n.backing ? 'wheels jammed on a ledge, backing off' : n.braking ? 'braking for the edge' : !n.reachable && foe.distance > 3.5 ? 'no way my wheels can take, getting as near as I can' : h.say;
  drive(n.drive, n.turn);
}

export const ALL = [
  { build: STRIDER, program: striderProgram },
  { build: MANTIS, program: mantisProgram },
  { build: THRESHER, program: thresherProgram },
  { build: SLINGER, program: slingerProgram },
  { build: ROVER, program: roverProgram },
];
export const ROSTER = ALL;
