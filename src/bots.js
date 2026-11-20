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
function hexFrame({ spread = 1.0, half = 1.04, reach = 0.74, power = 0.6, frame = 'aluminium', mid = 0.12 } = {}) {
  return [
    { id: 'core', type: 'core' },
    beam('spine', [0.2, 0.16, 2.4], [0, 0, 0], 'core', frame),
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [Math.min(2.4, (i === 0 ? half + 0.26 : half) * 2 - 0.18), i === 0 ? mid : 0.12, i === 0 ? mid : 0.12], [0, 0, i * spread], 'spine', frame)]),
    ...[-1, 0, 1].flatMap((i) => { const x = i === 0 ? half + 0.26 : half; return [...leg('leg_l' + (i + 1), x, i * spread, i === 0 ? 60 : 0, 'axle_' + (i + 1), { reach, power }), ...leg('leg_r' + (i + 1), -x, i * spread, i === 0 ? 0 : 60, 'axle_' + (i + 1), { reach, power })]; }),
  ];
}
const LEGS_L = ['leg_l0', 'leg_l1', 'leg_l2'], LEGS_R = ['leg_r0', 'leg_r1', 'leg_r2'];

// Walk: each side has a phase that advances with the wanted speed, and every hub on that side is held to it by
// reading its angle, the way a walking animal keeps a gait. Going straight, the two sides are pulled into step
// so the gait stays a tripod.
function walk(s, out, mem, lib, fwd, turn, LL = LEGS_L, RR = LEGS_R) {
  const me = s.self, TURN = (2 * Math.PI) / 3;
  if (mem.pl === undefined) { mem.pl = 0; mem.pr = 0; }
  // Spoked legs reach the ground either way up. On its back, the same hubs turned the other way walk it forward.
  if (me.upright < 0) fwd = -fwd;
  // A walker turns badly with one side stopped: for a sharp turn, the two sides step in opposite directions.
  turn = lib.clamp(turn - me.turnRate * 0.5);
  // A long machine cannot spin on the spot, its end feet would have to drag sideways: it turns on the move.
  if (Math.abs(turn) > 0.3) fwd = mem.long ? Math.sign(fwd || 1) * Math.max(0.55, Math.abs(fwd) * 0.7) : fwd * 0.1;
  // In low gravity each step takes longer to come down, so the gait slows to match.
  const pace = 3.2 * Math.sqrt(s.challenge.gravity);
  const vl = lib.clamp(fwd - turn) * pace, vr = lib.clamp(fwd + turn) * pace;
  mem.pl += vl / 30; mem.pr += vr / 30;
  // Do not let the wanted leg position run away from the real one when the legs are held up.
  const lead = (ids, ph) => { let sum = 0, n = 0; for (const id of ids) { const j = me.joints[id]; if (j) { sum += j.angle; n++; } } return n ? lib.clamp(ph, sum / n - 0.5, sum / n + 0.5) : ph; };
  mem.pl = lead(LL, mem.pl); mem.pr = lead(RR, mem.pr);
  if (Math.abs(vl - vr) < 0.5) { let d = (mem.pl - mem.pr) % TURN; if (d > TURN / 2) d -= TURN; if (d < -TURN / 2) d += TURN; mem.pl -= d * 0.05; mem.pr += d * 0.05; }
  for (const [ids, ph, v] of [[LL, mem.pl, vl], [RR, mem.pr, vr]]) for (const id of ids) {
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
function stalk(s, out, mem, lib, SELF, { keep = 0, L = LEGS_L, R = LEGS_R } = {}) {
  const h = hunt(s, lib), foe = s.enemy;
  // If there is no way to it, the plan ends at the nearest ground I can stand on: stop there, do not press on.
  const open = lib.plan(s, h.x, h.z, SELF).reachable;
  const n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: !open ? 0.8 : h.charge ? keep : 0.6, reverse: !open });
  if (!open && n.arrived) { out.say = 'no way to it from here, waiting at the nearest ground'; walk(s, out, mem, lib, 0, 0, L, R); return n; }
  out.say = n.backing ? 'jammed on a ledge, backing off to try again' : n.braking ? 'stopping short of the edge' : !n.reachable && foe.distance > 3 ? 'no way to it from here, getting as near as I can' : h.say;
  walk(s, out, mem, lib, n.drive, n.turn, L, R);
  return n;
}
// A flat walker works either way up, so it only needs to do something when it is lying on its side: kick both
// sides opposite ways to roll off it.
function righting(s, out, L = LEGS_L, R = LEGS_R) {
  if (Math.abs(s.self.upright) >= 0.35) return false;
  out.say = 'on my side, kicking to roll off it';
  for (const id of L) out[id] = 1; for (const id of R) out[id] = -1;
  return true;
}

// ── Strider ────────────────────────────────────────────────────────────────
// Six legs and a steel beak. Light and quick over ledges. It wins by getting inboard of a heavier machine near
// an edge, or by pecking pieces off one that is stuck.
export const STRIDER = {
  name: 'Strider',
  note: 'Walks on six spoked legs and climbs ledges wheels cannot. It is flat, so it works either way up: tipped onto its back it just keeps walking. It goes for machines that are stuck or near an edge, and pecks with a steel beak.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    plate('back_0', [0.9, 0.06, 0.7], [0, 0.2, -0.8], 'spine', 'plastic'),
    plate('back_1', [1.0, 0.06, 0.7], [0, 0.28, 0], 'spine', 'plastic'),
    plate('back_2', [0.9, 0.06, 0.7], [0, 0.2, 0.8], 'spine', 'plastic'),
    beam('beak', [0.16, 0.16, 0.7], [0, -0.05, 1.5], 'spine', 'steel'),
    { id: 'beak_tip', type: 'wedge', material: 'steel', size: [0.5, 0.3, 0.4], pos: [0, -0.1, 2.0], parent: 'beak' },
  ],
};
// A walker wades: its frame rides above half a metre of water. It takes slopes up to about one in two.
const WALKER = { length: 1.9, top: 2.4, margin: 2.0, side: 0.5, climb: 0.45, grade: 0.55, wade: 0.7, grip: 0.8, feed: false };
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
// Each hammer is one steel bar on a motor. There is no separate head to snap off: the bar is the hammer. Struck
// about two thirds of the way along it swings without loading the pivot at all, and even at the tip only half
// the blow reaches the mast. The pivot is ahead of the front axle, so a swing that misses comes down on the
// ground and not on the machine's own legs.
const hammer = (i, x) => [
  { id: 'club_' + i, type: 'beam', material: 'steel', size: [0.14, 0.14, 1.9], pos: [x, 0.66, 0.2], parent: 'yoke', joint: { type: 'motor', axis: [1, 0, 0], pivot: [x, 0.66, 1.1], gear: 5, power: 1, limits: [-6, 215] } },
];
export const MANTIS = {
  name: 'Mantis',
  note: 'A six-legged walker with two steel clubs on a mast at its nose. It walks up to the enemy, squares up, and brings the clubs over and down one after the other. Each club is a single bar, so there is no head to snap off, and a struck club swings and spares the mast.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    beam('mast', [0.22, 0.66, 0.22], [0, 0.36, 1.1], 'spine', 'steel'),
    beam('stay', [0.08, 0.85, 0.08], [0, 0.32, 0.76], 'mast', 'steel', { rot: [-50, 0, 0] }),
    beam('yoke', [0.9, 0.2, 0.2], [0, 0.66, 1.1], 'mast', 'steel'),
    ...hammer(0, 0.3), ...hammer(1, -0.3),
    block('keel', [0.3, 0.2, 0.6], [0, -0.18, -0.2], 'spine', 'steel'),
  ],
};
export function mantisProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, mem }, REST = -0.05, DOWN = 3.6;
  const arms = [0, 1].filter((i) => me.joints['club_' + i]);
  const hold = (i, to, max = 0.6) => { const j = me.joints['club_' + i]; if (j) out['club_' + i] = lib.clamp((to - j.angle) * 1.2, -max, max); };
  if (me.upright < 0.2) { mem.down = (mem.down || 0) + 1; out.say = 'tipped over, kicking and levering up with the hammers'; for (const i of arms) out['club_' + i] = mem.down < 60 ? 0 : Math.sin(s.t * 2) > 0 ? 0.25 : -0.25; for (const id of LEGS_L) out[id] = 1; for (const id of LEGS_R) out[id] = -1; return; }
  // A swing in progress: full power down, then lift the arm back.
  if (mem.swing != null) {
    const i = mem.swing, j = me.joints['club_' + i];
    if (!j) mem.swing = null;
    else if (mem.lift) { hold(i, REST, 0.8); if (j.angle < 0.4 || s.t > mem.until) { mem.swing = null; mem.lift = false; mem.next = 1 - i; } }
    else { out['club_' + i] = 1; if (j.angle > DOWN || s.t > mem.until) { mem.lift = true; mem.until = s.t + 2; } }
  }
  for (const i of arms) if (mem.swing !== i) hold(i, REST);
  // In reach and square on: stand and strike. The heads come down about 2.7 m ahead of the core.
  // Close in it still strikes: the clubs come down on anything within their length of the mast.
  const inReach = foe.distance < 3.4 && Math.abs(foe.bearing) < (foe.distance < 2 ? 0.6 : 0.3);
  if (inReach && arms.length) {
    out.say = foe.distance < 1.9 ? 'tangled up with it, clubbing it where it stands' : 'in reach, bringing the clubs down';
    walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.4, 0.4));
    if (mem.swing == null && s.t > (mem.cool || 0)) { const i = arms.includes(mem.next) ? mem.next : arms[0]; mem.swing = i; mem.lift = false; mem.until = s.t + 0.9; mem.cool = s.t + 0.45; }
    return;
  }
  if (foe.distance <= 1.8 && arms.length && Math.abs(foe.bearing) > 1.2) { out.say = 'it is on my flank, stepping clear'; const g = lib.guard(s, -0.8, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(foe.bearing * 2, -0.4, 0.4)); return; }
  // Closing in: stop at striking distance, not on top of it.
  const n = stalk(s, out, mem, lib, SELF, { keep: arms.length ? 2.6 : 0 });
  if (n.arrived && arms.length) { out.say = 'squaring up to strike'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.5, 0.5)); }
}

// ── Thresher ───────────────────────────────────────────────────────────────
// A walker with a heavy steel bar spinning flat above its nose, like a rotor. The bar turns on the spine itself,
// the strongest thing to hang a weapon from, and it sweeps a circle wider than the front legs stand.
export const THRESHER = {
  name: 'Thresher',
  note: 'A six-legged walker with a steel bar spinning flat over its nose at 80 km/h at the tips. The bar is mounted on the spine, so hits do not tear it off. It keeps its nose on the enemy and walks the bar into legs and wheels.',
  parts: [
    ...hexFrame({ frame: 'steel' }),
    { id: 'bar', type: 'beam', material: 'steel', size: [1.7, 0.14, 0.2], pos: [0, 0.26, 1.2], parent: 'spine', joint: { type: 'motor', axis: [0, 1, 0], gear: 3, power: 1 } },
    plate('back', [1.0, 0.06, 1.2], [0, 0.2, -0.55], 'spine', 'plastic'),
    block('tail', [0.4, 0.3, 0.4], [0, 0, -1.25], 'spine', 'steel'),
  ],
};
export function thresherProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.4, mem };
  out.bar = 1;
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
  if (me.upright < 0.2) { mem.down = (mem.down || 0) + 1; out.say = 'tipped over, kicking and levering up with the arms'; for (const i of [0, 1, 2]) out['arm_' + i] = mem.down < 60 ? 0 : Math.sin(s.t * 2) > 0 ? 0.25 : -0.25; for (const id of LEGS_L) out[id] = 1; for (const id of LEGS_R) out[id] = -1; return; }
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
  const me = s.self, foe = s.enemy, SELF = { length: 2.5, top: 5, margin: 2.0, side: 0.6, climb: 0.2, grade: 0.4, wade: 0.2, mem };
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

// ── Centipede ──────────────────────────────────────────────────────────────
// Ten legs on a frame nearly five metres long. It is long enough to walk straight across a gap that stops
// everything else: by the time its middle is over the drop, two pairs of legs are already on the far side.
const PEDE_Z = [-1.7, -0.85, 0, 0.85, 1.7];
const PEDE_L = PEDE_Z.map((_, i) => 'leg_l' + i), PEDE_R = PEDE_Z.map((_, i) => 'leg_r' + i);
export const CENTIPEDE = {
  name: 'Centipede',
  note: 'Ten spoked legs on a frame nearly five metres long, with a steel ram at each end. It walks straight across gaps up to about 1.9 m wide, because some of its legs are always on the ground on one side or the other, and it works either way up.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine_f', [0.2, 0.18, 1.9], [0, 0, 0.95], 'core', 'steel'),
    beam('spine_b', [0.2, 0.18, 1.9], [0, 0, -0.95], 'core', 'steel'),
    ...PEDE_Z.flatMap((z, i) => { const x = i % 2 ? 1.3 : 1.04, parent = z > 0 ? 'spine_f' : z < 0 ? 'spine_b' : 'core'; return [
      beam('axle_' + i, [Math.min(2.4, x * 2 - 0.18), 0.12, 0.12], [0, 0, z], parent, 'steel'),
      ...leg('leg_l' + i, x, z, i % 2 ? 60 : 0, 'axle_' + i, { reach: 0.7 }), ...leg('leg_r' + i, -x, z, i % 2 ? 0 : 60, 'axle_' + i, { reach: 0.7 }),
    ]; }),
    { id: 'ram_f', type: 'wedge', material: 'steel', size: [0.9, 0.3, 0.4], pos: [0, 0, 2.1], parent: 'spine_f' },
    { id: 'ram_b', type: 'wedge', material: 'steel', size: [0.9, 0.3, 0.4], pos: [0, 0, -2.1], rot: [0, 180, 0], parent: 'spine_b' },
  ],
};
export function centipedeProgram(s, out, mem, lib) {
  mem.long = true;
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.7, margin: 2.4, span: 1.9, mem }, legs = { L: PEDE_L, R: PEDE_R };
  if (righting(s, out, PEDE_L, PEDE_R)) return;
  if (s.t < (mem.back || 0)) { out.say = 'stepping back for another run at it'; const g = lib.guard(s, -1, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(foe.bearing * 1.5, -0.3, 0.3), PEDE_L, PEDE_R); return; }
  mem.press = foe.distance < 4 && Math.abs(foe.bearing) < 0.6 && me.speed < 0.5 ? (mem.press || 0) + 1 : 0;
  if (mem.press > 30) { mem.press = 0; mem.back = s.t + 1.1; }
  const n = stalk(s, out, mem, lib, SELF, legs);
  // Say so when the way to the enemy goes over a gap.
  if (n.reachable && !lib.plan(s, foe.x, foe.z, { ...SELF, span: 0 }).reachable && foe.distance > 4) out.say = 'walking across the gap to get at it';
}

// ── Scorpion ───────────────────────────────────────────────────────────────
// A large machine: ten legs, two claws that snap shut across its front, and a tail that comes over the top.
// The claws are steel bars on upright pivots ahead of the front legs. Open, they stand wide; snapped shut they
// meet in front of the nose, and whatever is between them takes a bar from each side. The tail is a long club
// on a mast, lying back along the body until something is in front of it.
const pedeFrame = (frame = 'steel', power = 1, sp = 0.26) => [
  { id: 'core', type: 'core' },
  // The backbone is two heavy beams, thick enough that the machine does not snap in half at the core.
  beam('spine_f', [sp, sp, 1.9], [0, 0, 0.95], 'core', frame),
  beam('spine_b', [sp, sp, 1.9], [0, 0, -0.95], 'core', frame),
  ...PEDE_Z.flatMap((z, i) => { const x = i % 2 ? 1.3 : 1.04, parent = z > 0 ? 'spine_f' : z < 0 ? 'spine_b' : 'core'; return [
    beam('axle_' + i, [Math.min(2.4, x * 2 - 0.18), 0.12, 0.12], [0, 0, z], parent, frame),
    ...leg('leg_l' + i, x, z, i % 2 ? 60 : 0, 'axle_' + i, { reach: 0.7, power }), ...leg('leg_r' + i, -x, z, i % 2 ? 0 : 60, 'axle_' + i, { reach: 0.7, power }),
  ]; }),
];
const claw = (side, x) => ({ id: 'claw_' + side, type: 'beam', material: 'steel', size: [0.17, 0.17, 1.5], pos: [x, 0, 3.4], parent: 'brow', joint: { type: 'motor', axis: [0, 1, 0], pivot: [x, 0, 2.68], gear: 8, power: 1, limits: side === 'l' ? [-14, 62] : [-62, 14] } });
export const SCORPION = {
  name: 'Scorpion',
  note: 'A large machine on ten legs, nearly seven metres from tail to claw tips. Two steel claws stand open across its front and snap shut on whatever comes between them, and a tail club comes over the top onto anything held there. It weighs about twice what the six-legged walkers do.',
  parts: [
    ...pedeFrame(),
    beam('neck', [0.2, 0.2, 0.8], [0, 0, 2.3], 'spine_f', 'steel'),
    beam('brow', [1.4, 0.16, 0.16], [0, 0, 2.68], 'neck', 'steel'),
    claw('l', 0.55), claw('r', -0.55),
    beam('mast', [0.22, 0.66, 0.22], [0, 0.44, 1.3], 'spine_f', 'steel'),
    beam('stay', [0.08, 0.9, 0.08], [0, 0.36, 0.95], 'mast', 'steel', { rot: [-50, 0, 0] }),
    { id: 'tail', type: 'beam', material: 'steel', size: [0.14, 0.14, 2.4], pos: [0, 0.82, 0.2], parent: 'mast', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, 0.82, 1.3], gear: 6, power: 1, limits: [-4, 192] } },
    plate('shell_l', [0.6, 0.06, 2.4], [0.5, 0.24, -0.7], 'spine_b', 'aluminium', { rot: [0, 0, -12] }),
    plate('shell_r', [0.6, 0.06, 2.4], [-0.5, 0.24, -0.7], 'spine_b', 'aluminium', { rot: [0, 0, 12] }),
    block('sting', [0.3, 0.3, 0.5], [0, 0.05, -2.1], 'spine_b', 'steel'),
  ],
};
export function scorpionProgram(s, out, mem, lib) {
  mem.long = true;
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 3.2, margin: 2.6, span: 1.9, mem }, legs = { L: PEDE_L, R: PEDE_R };
  const OPEN = 0.9, SHUT = -0.12;
  const set = (id, to, max) => { const j = me.joints[id]; if (j) out[id] = lib.clamp((to - j.angle) * 2, -max, max); };
  const claws = (l, r, max) => { set('claw_l', l, max); set('claw_r', -r, max); };
  if (righting(s, out, PEDE_L, PEDE_R)) { claws(OPEN, OPEN, 0.3); return; }
  const tail = me.joints.tail, flat = me.upright > 0.5;
  // The tail: over and down at full power, then back.
  if (tail) {
    if (mem.strike === 'down') { out.tail = 1; if (tail.angle > 3.2 || s.t > mem.until) { mem.strike = 'up'; mem.until = s.t + 2.5; } }
    else if (mem.strike === 'up') { out.tail = lib.clamp((-0.05 - tail.angle) * 1.2, -0.7, 0.7); if (tail.angle < 0.4 || s.t > mem.until) mem.strike = null; }
    else out.tail = lib.clamp((-0.05 - tail.angle) * 1.2, -0.5, 0.5);
  }
  const front = Math.abs(foe.bearing) < 0.3, inClaws = foe.distance < 4.6 && (front || foe.distance < 2.4 && Math.abs(foe.bearing) < 0.7), underTail = foe.distance < 4.3 && Math.abs(foe.bearing) < (foe.distance < 2.4 ? 0.5 : 0.22);
  // The claws: wide open on the way in, then snap, hold a moment, and open again.
  if (mem.snap > s.t) claws(SHUT, SHUT, 1);
  else if (inClaws && s.t > (mem.reopen || 0)) { mem.snap = s.t + 0.45; mem.reopen = s.t + 1.3; claws(SHUT, SHUT, 1); }
  else claws(OPEN, OPEN, 0.35);
  if (inClaws || underTail) {
    out.say = underTail && tail ? 'it is between the claws, bringing the tail over' : 'snapping the claws shut on it';
    walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.4, 0.4), PEDE_L, PEDE_R);
    if (underTail && tail && flat && !mem.strike && s.t > (mem.cool || 0)) { mem.strike = 'down'; mem.until = s.t + 1.1; mem.cool = s.t + 1.6; }
    return;
  }
  if (foe.distance <= 2.2 && Math.abs(foe.bearing) > 1.2) { out.say = 'it is on my flank, stepping clear'; const g = lib.guard(s, -0.8, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(foe.bearing * 2, -0.4, 0.4), PEDE_L, PEDE_R); return; }
  const n = stalk(s, out, mem, lib, SELF, { keep: 3.4, ...legs });
  if (n.arrived) { out.say = 'turning the claws onto it'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.5, 0.5), PEDE_L, PEDE_R); }
}

// ── Dreadnought ────────────────────────────────────────────────────────────
// A large machine: ten legs under an armoured shell, with a rotor bar at each end. It does not need to turn to
// face anything, and it is long enough to walk across gaps.
const rotor = (id, z, parent) => ({ id, type: 'beam', material: 'steel', size: [1.7, 0.14, 0.2], pos: [0, 0.26, z], parent, joint: { type: 'motor', axis: [0, 1, 0], gear: 3, power: 1 } });
export const DREADNOUGHT = {
  name: 'Dreadnought',
  note: 'A large machine on ten legs under a shell of plates, with a spinning steel bar at each end. Either end is the front. It walks into the enemy with whichever rotor is nearer and crosses gaps the six-legged machines cannot.',
  parts: [
    ...pedeFrame(),
    rotor('rotor_f', 1.95, 'spine_f'), rotor('rotor_b', -1.95, 'spine_b'),
    // The shell stands on two posts and rides clear above the legs; the skirts hang outside them.
    beam('post_f', [0.14, 0.8, 0.14], [0, 0.5, 0.45], 'spine_f', 'steel'),
    beam('post_b', [0.14, 0.8, 0.14], [0, 0.5, -0.45], 'spine_b', 'steel'),
    beam('rib_f', [2.4, 0.1, 0.1], [0, 0.92, 0.45], 'post_f', 'steel'),
    beam('rib_b', [2.4, 0.1, 0.1], [0, 0.92, -0.45], 'post_b', 'steel'),
    plate('roof', [2.0, 0.06, 2.4], [0, 1.0, 0], 'rib_f', 'aluminium'),
    plate('skirt_l', [0.06, 0.6, 2.4], [1.62, 0.62, 0], 'rib_f', 'aluminium', { rot: [0, 0, 18] }),
    plate('skirt_r', [0.06, 0.6, 2.4], [-1.62, 0.62, 0], 'rib_f', 'aluminium', { rot: [0, 0, -18] }),
    beam('tower', [0.3, 0.4, 0.3], [0, 1.23, 0], 'roof', 'aluminium'),
  ],
};
export function dreadnoughtProgram(s, out, mem, lib) {
  mem.long = true;
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.9, margin: 2.5, span: 1.9, mem }, legs = { L: PEDE_L, R: PEDE_R };
  out.rotor_f = 1; out.rotor_b = -1;
  if (righting(s, out, PEDE_L, PEDE_R)) return;
  // Close up, whichever end is nearer goes in first: if the enemy is behind, back into it.
  if (foe.distance < 5 && Math.abs(foe.bearing) > 2.0) { out.say = 'backing the rear rotor into it'; const turn = lib.clamp((foe.bearing > 0 ? foe.bearing - Math.PI : foe.bearing + Math.PI) * 2, -0.5, 0.5); const g = lib.guard(s, -0.8, SELF); walk(s, out, mem, lib, g.drive, turn, PEDE_L, PEDE_R); return; }
  if (foe.distance < 3.5 && Math.abs(foe.bearing) > 0.5) { out.say = 'turning a rotor onto it'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.6, 0.6), PEDE_L, PEDE_R); return; }
  stalk(s, out, mem, lib, SELF, legs);
  if (foe.distance < 3.5) out.say = 'walking the rotor into it';
}

// ── Bramble ────────────────────────────────────────────────────────────────
// Built for the tangle. Two machines that meet usually lock together, legs in legs, and then neither weapon
// reaches. Bramble has no safe side to lock onto: a flat rotor at each end and an upright saw bar outboard of the
// legs on each flank. Whatever is touching it is being hit, and it does not need to get free to do it.
const saw = (side, x) => ({ id: 'saw_' + side, type: 'beam', material: 'steel', size: [0.16, 0.7, 0.2], pos: [x, 0, 0], parent: 'axle_1', joint: { type: 'motor', axis: [1, 0, 0], gear: 1, power: 1 } });
export const BRAMBLE = {
  name: 'Bramble',
  note: 'A six-legged walker with something spinning on every side: a flat steel rotor at each end and an upright saw bar outside the legs on each flank. It is built to win the tangle. Anything locked against it is being hit the whole time.',
  parts: [
    ...hexFrame({ frame: 'steel', mid: 0.2 }),
    { id: 'rotor_f', type: 'beam', material: 'steel', size: [1.7, 0.14, 0.2], pos: [0, 0.26, 1.2], parent: 'spine', joint: { type: 'motor', axis: [0, 1, 0], gear: 3, power: 1 } },
    { id: 'rotor_b', type: 'beam', material: 'steel', size: [1.7, 0.14, 0.2], pos: [0, 0.26, -1.2], parent: 'spine', joint: { type: 'motor', axis: [0, 1, 0], gear: 3, power: 1 } },
    saw('l', 1.66), saw('r', -1.66),
    block('keel', [0.3, 0.2, 0.5], [0, -0.18, 0], 'spine', 'steel'),
  ],
};
export function brambleProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.2, mem };
  out.rotor_f = 1; out.rotor_b = -1; out.saw_l = 1; out.saw_r = 1;
  if (righting(s, out)) return;
  const b = foe.bearing, back = Math.abs(b) > 2.2, side = !back && Math.abs(b) > 0.8;
  if (foe.distance < 3.2) {
    // At close quarters it does not try to get free. It leans whichever weapon is nearest into the enemy.
    if (back) { out.say = 'grinding the rear rotor into it'; const g = lib.guard(s, -0.7, SELF); walk(s, out, mem, lib, g.drive, lib.clamp((b > 0 ? b - Math.PI : b + Math.PI) * 2, -0.4, 0.4)); return; }
    if (side) { out.say = 'it is on my flank, in the saw: holding it there'; walk(s, out, mem, lib, 0, lib.clamp(Math.sin(s.t * 3) * 0.3, -0.3, 0.3)); return; }
    out.say = 'grinding the front rotor into it'; const g = lib.guard(s, 0.7, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(b * 2, -0.4, 0.4)); return;
  }
  stalk(s, out, mem, lib, SELF);
}

// ── Warden ─────────────────────────────────────────────────────────────────
// The other answer to the tangle: do not let it happen. Warden carries a tall steel shield ahead of each front
// leg, so an enemy (or its rotor) meets a plate and not the spokes, and a piston fist in its nose. When something
// gets inside the clubs' reach the fist punches it back out to where they land.
const longClub = (i, x) => ({ id: 'club_' + i, type: 'beam', material: 'steel', size: [0.16, 0.16, 2.2], pos: [x, 0.66, 0.05], parent: 'yoke', joint: { type: 'motor', axis: [1, 0, 0], pivot: [x, 0.66, 1.1], gear: 5, power: 1, limits: [-6, 215] } });
export const WARDEN = {
  name: 'Warden',
  note: 'A walker that fights at arm\'s length and keeps it that way. Two tall steel shields stand ahead of its front legs, high enough to stop a rotor; a piston fist in the nose punches an enemy back out; and two long clubs come down over the shields onto whatever is held there.',
  parts: [
    ...hexFrame({ frame: 'steel', power: 1 }),
    beam('mast', [0.22, 0.66, 0.22], [0, 0.36, 1.1], 'spine', 'steel'),
    beam('stay', [0.08, 0.85, 0.08], [0, 0.32, 0.76], 'mast', 'steel', { rot: [-50, 0, 0] }),
    beam('yoke', [0.9, 0.2, 0.2], [0, 0.66, 1.1], 'mast', 'steel'),
    longClub(0, 0.3), longClub(1, -0.3),
    beam('bow', [1.5, 0.2, 0.2], [0, 0, 1.3], 'spine', 'steel'),
    beam('strut_l', [0.2, 0.2, 0.9], [0.65, 0, 1.75], 'bow', 'steel'),
    beam('strut_r', [0.2, 0.2, 0.9], [-0.65, 0, 1.75], 'bow', 'steel'),
    // The shields stand from below the hubs to above a rotor's height, and are thick enough to take one.
    plate('shield_l', [0.95, 0.15, 0.5], [0.98, 0.1, 2.15], 'strut_l', 'steel', { rot: [90, 0, 0] }),
    plate('shield_r', [0.95, 0.15, 0.5], [-0.98, 0.1, 2.15], 'strut_r', 'steel', { rot: [90, 0, 0] }),
    { id: 'fist', type: 'block', material: 'steel', size: [0.4, 0.3, 0.3], pos: [0, -0.02, 1.85], parent: 'bow', joint: { type: 'piston', axis: [0, 0, 1], stroke: 0.6, gear: 1 } },
  ],
};
export function wardenProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { ...WALKER, length: 2.3, mem }, REST = -0.05, DOWN = 3.6;
  const arms = [0, 1].filter((i) => me.joints['club_' + i]);
  const hold = (i, to, max = 0.6) => { const j = me.joints['club_' + i]; if (j) out['club_' + i] = lib.clamp((to - j.angle) * 1.2, -max, max); };
  const fist = me.joints.fist;
  out.fist = s.t < (mem.punch || 0) ? 1 : 0;
  if (me.upright < 0.2) { mem.down = (mem.down || 0) + 1; out.say = 'tipped over, kicking and levering up with the clubs'; for (const i of arms) out['club_' + i] = mem.down < 60 ? 0 : Math.sin(s.t * 2) > 0 ? 0.25 : -0.25; for (const id of LEGS_L) out[id] = 1; for (const id of LEGS_R) out[id] = -1; return; }
  if (mem.swing != null) {
    const i = mem.swing, j = me.joints['club_' + i];
    if (!j) mem.swing = null;
    else if (mem.lift) { hold(i, REST, 0.8); if (j.angle < 0.4 || s.t > mem.until) { mem.swing = null; mem.lift = false; mem.next = 1 - i; } }
    else { out['club_' + i] = 1; if (j.angle > DOWN || s.t > mem.until) { mem.lift = true; mem.until = s.t + 2; } }
  }
  for (const i of arms) if (mem.swing !== i) hold(i, REST);
  const front = Math.abs(foe.bearing) < 0.5;
  // Inside the clubs' reach: punch it back out. The fist needs a couple of seconds to recharge between punches.
  if (fist && foe.distance < 2.9 && front && fist.charge > 0.95 && fist.extension < 0.05) mem.punch = s.t + 0.3;
  const inReach = foe.distance < 4.0 && Math.abs(foe.bearing) < (foe.distance < 2 ? 0.6 : 0.3);
  if (inReach && arms.length) {
    out.say = s.t < (mem.punch || 0) + 0.4 ? 'punching it back to where the clubs land' : 'in reach, bringing the clubs down';
    walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.4, 0.4));
    if (mem.swing == null && s.t > (mem.cool || 0)) { const i = arms.includes(mem.next) ? mem.next : arms[0]; mem.swing = i; mem.lift = false; mem.until = s.t + 0.9; mem.cool = s.t + 0.45; }
    return;
  }
  if (foe.distance <= 1.8 && Math.abs(foe.bearing) > 1.2) { out.say = 'it is on my flank, stepping clear'; const g = lib.guard(s, -0.8, SELF); walk(s, out, mem, lib, g.drive, lib.clamp(foe.bearing * 2, -0.4, 0.4)); return; }
  // With the clubs gone the fist is the weapon: keep the nose on it and keep punching.
  if (!arms.length && fist && foe.distance < 2.8) { out.say = 'clubs gone, punching with the fist'; walk(s, out, mem, lib, front ? 0.4 : 0, lib.clamp(foe.bearing * 2, -0.5, 0.5)); return; }
  const n = stalk(s, out, mem, lib, SELF, { keep: arms.length ? 3.2 : 0 });
  if (n.arrived && arms.length) { out.say = 'squaring up to strike'; walk(s, out, mem, lib, 0, lib.clamp(foe.bearing * 2, -0.5, 0.5)); }
}

export const ALL = [
  { build: STRIDER, program: striderProgram },
  { build: MANTIS, program: mantisProgram },
  { build: THRESHER, program: thresherProgram },
  { build: SLINGER, program: slingerProgram },
  { build: ROVER, program: roverProgram },
  { build: CENTIPEDE, program: centipedeProgram },
  { build: SCORPION, program: scorpionProgram },
  { build: DREADNOUGHT, program: dreadnoughtProgram },
  { build: BRAMBLE, program: brambleProgram },
  { build: WARDEN, program: wardenProgram },
];
export const ROSTER = ALL;
