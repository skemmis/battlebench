// Hand-built machines. Each is a build (the parts list a model would write) and a control program.
// There are no ready-made wheels or weapons in the kit, so everything here is assembled from plain pieces:
// a wheel is a rubber ball on a small geared-down motor, a leg is spokes on a hub, a thrower is an arm on a hinge.
// The builds are written with a few small helpers to save typing; what the simulator receives is the plain list.

const wheel = (id, pos, parent, { radius = 0.3, power = 0.14, gear = 6, material = 'rubber' } = {}) => ({ id, type: 'ball', material, radius, pos, parent, joint: { type: 'motor', axis: [1, 0, 0], gear, power } });
const beam = (id, size, pos, parent, material = 'aluminium', extra = {}) => ({ id, type: 'beam', material, size, pos, parent, ...extra });
const plate = (id, size, pos, parent, material = 'aluminium', extra = {}) => ({ id, type: 'plate', material, size, pos, parent, ...extra });
const block = (id, size, pos, parent, material = 'aluminium', extra = {}) => ({ id, type: 'block', material, size, pos, parent, ...extra });

// A ladder frame: two rails, cross members, and wheels down each side. Returns the parts and the wheel ids.
function ladder({ width = 1.4, length = 2.4, y = -0.25, wheels = 3, wheelOpts = {}, slickEnds = false } = {}) {
  const parts = [{ id: 'core', type: 'core' }], left = [], right = [];
  const hx = width / 2;
  parts.push(beam('spine', [0.16, 0.12, length], [0, y, 0], 'core'));
  for (const [side, sx] of [['l', 1], ['r', -1]]) parts.push(beam('rail_' + side, [0.14, 0.14, length], [sx * hx, y, 0], 'spine'));
  const rungs = Math.max(2, wheels);
  for (let i = 0; i < rungs; i++) {
    const z = rungs === 1 ? 0 : -length / 2 + 0.12 + (i * (length - 0.24)) / (rungs - 1);
    parts.push(beam('rung_' + i, [width, 0.1, 0.12], [0, y, z], 'spine'));
  }
  for (let i = 0; i < wheels; i++) {
    const z = wheels === 1 ? 0 : -length / 2 + 0.3 + (i * (length - 0.6)) / (wheels - 1);
    // Slick ends: only the middle axle is rubber. Hard plastic end wheels slide sideways, so the machine turns
    // about its middle instead of fighting its own grip.
    const opts = slickEnds && i !== (wheels - 1) / 2 ? { ...wheelOpts, material: 'plastic' } : wheelOpts;
    parts.push(wheel('wl_' + i, [hx + 0.3, y - 0.1, z], 'rail_l', opts)); left.push('wl_' + i);
    parts.push(wheel('wr_' + i, [-hx - 0.3, y - 0.1, z], 'rail_r', opts)); right.push('wr_' + i);
  }
  return { parts, left, right };
}

// When the point cannot be reached, or the enemy is as near it as I am, standing still wins nothing. This picks
// somewhere to go instead: round to the point side of the enemy, then into it, to push it further from the point.
// Returns null when I am already clearly nearer the point than the enemy (then holding is right), or when there
// is no way to the enemy.
function shoveTarget(s, lib, { margin = 1.2, climb = 0.15, lead = 1.2 } = {}) {
  if (!s.target) return null;
  const me = s.self, foe = s.enemy, tg = s.target;
  const mine = Math.hypot(me.x - tg.x, me.z - tg.z), theirs = Math.hypot(foe.x - tg.x, foe.z - tg.z);
  if (mine < theirs - lead) return null;
  if (!lib.plan(s, foe.x, foe.z, { margin, climb }).reachable) return null;
  const ux = tg.x - foe.x, uz = tg.z - foe.z, un = Math.hypot(ux, uz) || 1, mx = me.x - foe.x, mz = me.z - foe.z, mn = Math.hypot(mx, mz) || 1;
  const onPointSide = (ux * mx + uz * mz) / (un * mn) > 0.5;
  return onPointSide ? { x: foe.x, z: foe.z, charge: true } : { x: foe.x + (ux / un) * 2.6, z: foe.z + (uz / un) * 2.6, charge: false };
}

// Ram the enemy, and if it does not give, do not sit there pushing: back off for a run-up and hit it again at
// speed. A blow at speed loads joints; a slow push loads nothing.
function ram(s, lib, mem, x, z, SELF) {
  const me = s.self, foe = s.enemy;
  if (mem.ramBack && s.t < mem.ramBack) {
    const b = lib.to(s, foe.x, foe.z), g = lib.guard(s, -1, SELF);
    if (foe.distance > 5.5 || g.room < 0.3) mem.ramBack = 0;
    return { drive: g.drive, turn: lib.clamp(b.bearing * 2, -0.5, 0.5), braking: false, say: 'it will not budge: backing off for a run-up' };
  }
  mem.ramStall = foe.distance < 4.2 && me.speed < 0.4 ? (mem.ramStall || 0) + 1 : 0;
  if (mem.ramStall > 30) { mem.ramStall = 0; mem.ramBack = s.t + 1.5; }
  const b = lib.to(s, x, z), c = lib.steer(b.bearing, 9, {}), g = lib.guard(s, c.drive, SELF);
  return { drive: g.drive, turn: c.turn, braking: g.braking, say: null };
}

// ── Bulwark ────────────────────────────────────────────────────────────────
const bulwarkFrame = ladder({ width: 1.5, length: 2.4, wheels: 3, slickEnds: true });
export const BULWARK = {
  name: 'Bulwark',
  note: 'A six-wheeled shover. The plough is five separate blades on sprung hinges, so it rides over bumps and gives a little when it hits something. Side skirts keep things from getting under it.',
  parts: [
    ...bulwarkFrame.parts,
    plate('deck_f', [1.3, 0.06, 0.75], [0, -0.15, 0.8], 'spine'),
    plate('deck_m', [1.3, 0.06, 0.75], [0, -0.15, 0], 'spine'),
    plate('deck_r', [1.3, 0.06, 0.75], [0, -0.15, -0.8], 'spine'),
    beam('brow', [1.9, 0.14, 0.14], [0, -0.2, 1.3], 'spine', 'steel'),
    ...[-2, -1, 0, 1, 2].map((i) => ({ id: 'blade_' + (i + 2), type: 'wedge', material: 'steel', size: [0.36, 0.34, 0.5], pos: [i * 0.38, -0.27, 1.62], parent: 'brow', joint: { type: 'hinge', axis: [1, 0, 0], pivot: [i * 0.38, -0.2, 1.38], limits: [-45, 45], spring: 350 } })),
    ...['l', 'r'].flatMap((side) => { const sx = side === 'l' ? 1 : -1; return [0, 1, 2].map((i) => plate(`skirt_${side}${i}`, [0.05, 0.3, 0.7], [sx * 1.32, -0.3, -0.8 + i * 0.8], 'rail_' + side, 'plastic')); }),
    block('ballast', [0.5, 0.25, 0.5], [0, -0.02, -0.75], 'deck_r', 'steel'),
  ],
};
export function bulwarkProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 1.9, top: 4.5, margin: 2.0, mem };
  const drive = (d, t) => { mem.push = Math.abs(d) + Math.abs(t); for (const id of ['wl_0', 'wl_1', 'wl_2']) out[id] = lib.clamp(d - t); for (const id of ['wr_0', 'wr_1', 'wr_2']) out[id] = lib.clamp(d + t); };
  // Go somewhere by a planned route, braking in time for edges. Returns what the route planner found.
  const go = (x, z, opts = {}) => { const n = lib.nav(s, x, z, { reverse: true, ...SELF, ...opts }); drive(n.drive, n.turn); if (n.braking) out.say = 'braking for the edge'; return n; };
  // Charge at a point in a straight line, but never faster than I can stop before the floor ends.
  const charge = (x, z) => { const b = lib.to(s, x, z), c = lib.steer(b.bearing, 9, {}), g = lib.guard(s, c.drive, SELF); drive(g.drive, c.turn); return g; };
  // Stuck against something for a second: remember it and wriggle free.
  // (Only counts when I was trying to move: standing still on purpose is not being stuck.)
  mem.stuck = Math.abs(me.forwardSpeed) < 0.15 && Math.abs(me.turnRate) < 0.2 && s.t > 2 && (mem.push || 0) > 0.1 ? (mem.stuck || 0) + 1 : 0;
  // Pushing on the enemy and getting nowhere is different: give it three seconds, then come at it from another side.
  const shoving = foe.distance < 3.4;
  if (mem.stuck > (shoving ? 90 : 40)) { mem.freeUntil = s.t + (shoving ? 1.8 : 1.0); mem.freeTurn = mem.freeTurn > 0 ? -0.7 : 0.7; mem.stuck = 0; mem.freeWhy = shoving ? 'it will not budge, backing off to hit it from another side' : 'stuck, backing out'; }
  if (me.upright < 0.2) { out.say = 'on my back, rocking to roll over'; drive(Math.sin(s.t * 6), 0); return; }
  if (s.t < (mem.freeUntil || 0)) { out.say = mem.freeWhy; drive(lib.guard(s, -0.8, SELF).drive, mem.freeTurn); mem.push = 0; return; }
  mem.planted = false;

  if (s.crate) {
    // Get behind the crate, on the far side from home, then shove it home in a straight line.
    const c = s.crate, home = s.homeSide;
    const behind = (me.z - c.z) * home < -1.0 && Math.abs(me.x - c.x) < 1.0;
    if (c.z * home > 3 && lib.run(s, c.x, c.z, 0, home, 6, 0) < 2.5) {
      // It is home. Stay between it and the enemy.
      out.say = 'crate is home, guarding it';
      const n = go((c.x + foe.x) / 2, c.z - home * 2.2, { stopAt: 0.6 }); if (n.arrived) { mem.planted = true; drive(0, lib.spin(s, lib.clamp(foe.bearing * 1.5, -0.5, 0.5), 1.9)); }
    } else if (behind) {
      out.say = 'shoving the crate home';
      const g = charge(c.x, c.z + home * 6); if (g.braking) out.say = 'easing off so I do not follow the crate over';
    } else {
      // Circle round the side the crate is not on, keeping clear of it.
      const side = me.x >= c.x ? 1 : -1, past = (me.z - c.z) * home < -1.0;
      out.say = 'getting behind the crate';
      go(past ? c.x : c.x + side * 2.6, c.z - home * 2.4);
    }
    return;
  }

  const tg = s.target, path = s.challenge.objective.path, toT = lib.to(s, tg.x, tg.z), foeToT = Math.hypot(foe.x - tg.x, foe.z - tg.z);
  const plan = lib.plan(s, tg.x, tg.z, { margin: SELF.margin });
  // If the point jumps soon and I will not get there in time, set off for where it goes next.
  if (path.kind === 'jump') {
    const left = path.every - (s.t % path.every), next = path.points[(Math.floor(s.t / path.every) + 1) % path.points.length];
    if (left < Math.min(4, plan.left / 3) || (left < 3 && foeToT < toT.distance && toT.distance > 2)) { out.say = 'heading for where the point goes next'; const n = go(next.x, next.z, { stopAt: 0.4 }); if (n.arrived) mem.planted = true; return; }
  }
  if (!plan.reachable) {
    // Cannot get onto it. Hold the nearest place I can reach, and say why.
    const high = lib.floorAt(s, tg.x, tg.z) && lib.stepAt(s, tg.x, tg.z) > lib.stepAt(s, me.x, me.z) + 0.15;
    out.say = high ? 'cannot climb that, holding the foot of it' : 'no way across, holding the nearest ground';
    const n = go(tg.x, tg.z, { stopAt: 0.4 });
    mem.idle = me.speed < 0.15 ? (mem.idle || 0) + 1 : 0;
    if (n.arrived || mem.idle > 45 || mem.hunting) {
      // Waiting here wins nothing if the enemy is as near as I am. Go and move it.
      const sh = shoveTarget(s, lib, { margin: 1.4 }); mem.hunting = !!sh;
      if (sh) { out.say = sh.charge ? 'cannot reach the point, so driving the enemy further from it' : 'cannot reach the point, getting between it and the enemy'; if (sh.charge) charge(sh.x, sh.z); else go(sh.x, sh.z, { margin: 1.4, stopAt: 0.5 }); return; }
      mem.planted = true; drive(0, lib.spin(s, lib.clamp(foe.bearing * 1.5, -0.5, 0.5), 1.9));
    }
    return;
  }
  // The enemy is on the point and I am not: hit it where it will be, if there is room to stop afterwards.
  if (foeToT < 2.4 && toT.distance > foeToT - 0.7 && lib.clear(s, foe.x, foe.z, 0.6)) {
    const hit = lib.intercept(s, foe, 3.5);
    const r = ram(s, lib, mem, hit.x, hit.z, SELF); drive(r.drive, r.turn); mem.push = 0;
    out.say = r.say || (r.braking ? 'not following it over the edge' : 'driving the enemy off the point');
    return;
  }
  out.say = path.kind === 'fixed' ? 'going for the point' : 'chasing the point';
  const n = go(tg.x, tg.z, { stopAt: 0.35 });
  if (n.arrived) {
    // On the point: keep the plough between me and the enemy.
    mem.planted = true;
    out.say = 'holding the point, plough to the enemy';
    drive(0, lib.spin(s, lib.clamp(foe.bearing * 1.5, -0.5, 0.5), 1.9));
  }
}

// ── Strider ────────────────────────────────────────────────────────────────
// Six legs, no wheels. Each leg is a hub on a motor with three spokes and rubber feet. Alternate legs are built
// a sixth of a turn apart, so three feet are always coming down as three lift. The middle legs sit further out
// than the corner ones so the spokes pass each other instead of clashing.
function leg(name, x, z, offsetDeg, parent) {
  const parts = [{ id: name, type: 'disc', material: 'aluminium', radius: 0.18, thickness: 0.14, pos: [x, 0, z], rot: [0, 0, 90], parent, joint: { type: 'motor', axis: [1, 0, 0], gear: 8, power: 0.6 } }];
  for (let k = 0; k < 3; k++) {
    const deg = offsetDeg + k * 120, a = (deg * Math.PI) / 180, dy = -Math.sin(a), dz = Math.cos(a);
    parts.push({ id: `${name}_s${k}`, type: 'beam', material: 'aluminium', size: [0.08, 0.08, 0.56], pos: [x, dy * 0.42, z + dz * 0.42], rot: [deg, 0, 0], parent: name });
    parts.push({ id: `${name}_f${k}`, type: 'block', material: 'rubber', size: [0.2, 0.14, 0.14], pos: [x, dy * 0.74, z + dz * 0.74], rot: [deg, 0, 0], parent: `${name}_s${k}` });
  }
  return parts;
}
export const STRIDER = {
  name: 'Strider',
  note: 'Walks on six spoked legs and can climb what wheels cannot. Its program keeps the legs in step by reading each hub angle, the way a walking animal keeps a gait.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine', [0.2, 0.16, 2.4], [0, 0, 0], 'core'),
    ...[-1, 0, 1].flatMap((i) => [beam('axle_' + (i + 1), [i === 0 ? 2.4 : 1.9, 0.12, 0.12], [0, 0, i * 1.0], 'spine')]),
    ...[-1, 0, 1].flatMap((i) => { const x = i === 0 ? 1.3 : 1.04; return [...leg('leg_l' + (i + 1), x, i * 1.0, i === 0 ? 60 : 0, 'axle_' + (i + 1)), ...leg('leg_r' + (i + 1), -x, i * 1.0, i === 0 ? 0 : 60, 'axle_' + (i + 1))]; }),
    plate('back_0', [0.9, 0.06, 0.7], [0, 0.2, -0.8], 'spine', 'plastic'),
    plate('back_1', [1.0, 0.06, 0.7], [0, 0.28, 0], 'spine', 'plastic'),
    plate('back_2', [0.9, 0.06, 0.7], [0, 0.2, 0.8], 'spine', 'plastic'),
    beam('beak', [0.16, 0.16, 0.7], [0, -0.05, 1.5], 'spine', 'steel'),
    { id: 'beak_tip', type: 'wedge', material: 'steel', size: [0.5, 0.3, 0.4], pos: [0, -0.1, 2.0], parent: 'beak' },
  ],
};
export function striderProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, TURN = (2 * Math.PI) / 3;
  const L = ['leg_l0', 'leg_l1', 'leg_l2'], R = ['leg_r0', 'leg_r1', 'leg_r2'];
  if (mem.pl === undefined) { mem.pl = 0; mem.pr = 0; }
  // Walk: each side has a phase that advances with the wanted speed, and every hub on that side is held to it.
  // Going straight, the two sides are also pulled into step with each other so the gait stays a tripod.
  const walk = (fwd, turn) => {
    // A walker turns badly with one side stopped: for a sharp turn, the two sides step in opposite directions.
    turn = lib.clamp(turn - me.turnRate * 0.5);
    if (Math.abs(turn) > 0.3) fwd *= 0.1;
    // In low gravity each step takes longer to come down, so the gait slows to match.
    const pace = 3.2 * Math.sqrt(s.challenge.gravity);
    const vl = lib.clamp(fwd - turn) * pace, vr = lib.clamp(fwd + turn) * pace;
    mem.pl += vl / 30; mem.pr += vr / 30;
    // Do not let the wanted leg position run away from the real one when the legs are held up.
    const lead = (ids, ph) => { let sum = 0, n = 0; for (const id of ids) { const j = me.joints[id]; if (j) { sum += j.angle; n++; } } return n ? lib.clamp(ph, sum / n - 0.5, sum / n + 0.5) : ph; };
    mem.pl = lead(L, mem.pl); mem.pr = lead(R, mem.pr);
    if (Math.abs(vl - vr) < 0.5) { let d = (mem.pl - mem.pr) % TURN; if (d > TURN / 2) d -= TURN; if (d < -TURN / 2) d += TURN; mem.pl -= d * 0.05; mem.pr += d * 0.05; }
    for (const [ids, ph, v] of [[L, mem.pl, vl], [R, mem.pr, vr]]) for (const id of ids) {
      const j = me.joints[id]; if (!j) continue;
      out[id] = lib.clamp((v + 6 * (ph - j.angle)) / 10);
    }
  };
  const CLIMB = 1.0, SELF = { length: 1.9, top: 2.4, margin: 2.0, climb: CLIMB, grip: 0.8, mem, feed: false };
  if (me.upright < 0.2) { out.say = 'on my back, kicking to roll over'; for (const id of L) out[id] = 1; for (const id of R) out[id] = -1; return; }
  let aim, say, stopAt = 0.4;
  if (s.crate) {
    const c = s.crate, home = s.homeSide, behind = (me.z - c.z) * home < -1.6 && Math.abs(me.x - c.x) < 1.0;
    if (c.z * home > 3 && lib.run(s, c.x, c.z, 0, home, 6, 0) < 2.5) { aim = { x: (c.x + foe.x) / 2, z: c.z - home * 2.4 }; say = 'crate is home, standing guard'; stopAt = 0.7; }
    else if (behind) {
      // Push straight, legs in step, but stop short of following it over.
      const b = lib.to(s, c.x, c.z + home * 6), ctl = lib.steer(b.bearing, 9, { gain: 1.6 }), g = lib.guard(s, ctl.drive, SELF);
      out.say = g.braking || g.drive < ctl.drive * 0.5 ? 'easing off at the edge' : 'walking the crate home'; walk(g.drive, ctl.turn); return;
    } else { const side = me.x >= c.x ? 1 : -1, past = (me.z - c.z) * home < -1.6; aim = { x: past ? c.x : c.x + side * 3, z: c.z - home * 3 }; say = 'getting behind the crate'; }
  } else {
    const tg = s.target; aim = tg;
    const up = lib.stepAt(s, tg.x, tg.z) - lib.stepAt(s, me.x, me.z);
    say = up > 0.15 ? 'climbing up to the point' : 'walking to the point';
    const foeToT = Math.hypot(foe.x - tg.x, foe.z - tg.z), d = lib.to(s, tg.x, tg.z).distance;
    const path = s.challenge.objective.path;
    if (path.kind === 'jump') {
      // I am slow. If I cannot reach the point before it moves, start for the next one now.
      const left = path.every - (s.t % path.every), next = path.points[(Math.floor(s.t / path.every) + 1) % path.points.length];
      if (d / 2.0 > left + 0.5) { aim = next; say = 'too far to make this one, walking to the next point'; }
    }
  }
  // Legs go either way round, so either end can lead: no need to turn about to come back.
  const n = lib.nav(s, aim.x, aim.z, { ...SELF, stopAt, reverse: true });
  mem.idle = me.speed < 0.15 ? (mem.idle || 0) + 1 : 0;
  if ((!n.reachable && (n.arrived || mem.idle > 45)) || mem.hunting) {
    const sh = !s.crate && shoveTarget(s, lib, { margin: 1.4, climb: CLIMB }); mem.hunting = !!sh;
    if (sh) { const h = lib.nav(s, sh.x, sh.z, { ...SELF, margin: 1.4, stopAt: sh.charge ? 0 : 0.5, reverse: true }); out.say = sh.charge ? 'cannot reach the point, so walking the enemy further from it' : 'cannot reach the point, getting between it and the enemy'; walk(h.drive, h.turn); return; }
  }
  if (n.arrived) { out.say = n.reachable ? 'standing on the point, facing the enemy' : 'no way across, standing at the nearest ground'; walk(0, lib.spin(s, lib.clamp(foe.bearing, -0.4, 0.4), 1.9)); return; }
  out.say = n.braking ? 'stopping short of the edge' : say;
  walk(n.drive, n.turn);
}

// ── Mangonel ───────────────────────────────────────────────────────────────
// A thrower. Three arms pivot on an axle between two braced towers. Each carries a steel ball on its long end.
// The program works out the launch speed for the range (allowing for the round's gravity), aims ahead of a
// moving target, swings one arm at exactly that speed and lets go of the ball part way up the swing.
const mangonelFrame = ladder({ width: 1.6, length: 2.4, wheels: 2, wheelOpts: { power: 0.2 } });
const ARM_X = [-0.38, 0, 0.38];
export const MANGONEL = {
  name: 'Mangonel',
  note: 'Throws steel balls from three swinging arms. It measures the range, sets the swing speed to match, leads a moving target, and when the balls are gone it uses the arms as clubs.',
  parts: [
    ...mangonelFrame.parts,
    plate('deck', [1.5, 0.06, 2.2], [0, -0.16, 0], 'spine'),
    ...['l', 'r'].flatMap((side) => { const sx = side === 'l' ? 1 : -1; return [
      beam('tower_' + side, [0.14, 1.3, 0.14], [sx * 0.66, 0.42, 0], 'rail_' + side),
      beam('brace_f' + side, [0.08, 1.25, 0.08], [sx * 0.66, 0.32, 0.45], 'tower_' + side, 'aluminium', { rot: [-38, 0, 0] }),
      beam('brace_b' + side, [0.08, 1.25, 0.08], [sx * 0.66, 0.32, -0.45], 'tower_' + side, 'aluminium', { rot: [38, 0, 0] }),
    ]; }),
    beam('axle', [1.46, 0.1, 0.1], [0, 1.0, 0], 'tower_l', 'steel'),
    ...ARM_X.flatMap((x, i) => [
      { id: 'arm_' + i, type: 'beam', material: 'aluminium', size: [0.1, 0.1, 2.0], pos: [x, 1.0, -0.5], parent: 'axle', joint: { type: 'motor', axis: [1, 0, 0], pivot: [x, 1.0, 0], gear: 6, power: 1, limits: [-14, 215] } },
      block('weight_' + i, [0.2, 0.3, 0.2], [x, 0.85, 0.4], 'arm_' + i, 'steel'),
      plate('cup_' + i, [0.3, 0.05, 0.3], [x, 1.07, -1.4], 'arm_' + i),
      { id: 'shot_' + i, type: 'ball', material: 'steel', radius: 0.17, pos: [x, 1.27, -1.4], parent: 'cup_' + i },
    ]),
    block('ballast', [0.6, 0.2, 0.6], [0, -0.05, 0.6], 'deck', 'steel'),
  ],
};
export function mangonelProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, ARM = 1.45, TOP = 20 / 1.5, RELEASE = 0.85;
  const drive = (d, t) => { for (const id of ['wl_0', 'wl_1']) out[id] = lib.clamp(d - t); for (const id of ['wr_0', 'wr_1']) out[id] = lib.clamp(d + t); };
  const loaded = [0, 1, 2].filter((i) => me.parts['shot_' + i].attached && me.parts['arm_' + i].attached);
  const g = 9.81 * s.challenge.gravity;
  out.release = [];
  // Arms not in use rest at the back.
  for (const i of [0, 1, 2]) { const j = me.joints['arm_' + i]; if (j && mem.firing !== i) out['arm_' + i] = lib.clamp((-0.2 - j.angle) * 0.8, -0.5, 0.5); }
  const SELF = { length: 1.8, top: 4.5, margin: 2.0, mem };
  if (me.upright < 0.2) { out.say = 'tipped over, swinging the arms to right myself'; for (const i of [0, 1, 2]) out['arm_' + i] = Math.sin(s.t * 3) > 0 ? 1 : -1; return; }

  // Launch speed for a ball let go at 49 degrees, about 2.4 m up, to come down d metres away.
  const speedFor = (d) => { const c = Math.cos(RELEASE), sn = Math.sin(RELEASE), h = 2.4; const den = 2 * c * c * (d * (sn / c) + h); return den > 0 ? Math.sqrt((g * d * d) / den) : 99; };
  const MAXV = 11.5;

  if (mem.firing !== undefined && mem.firing !== null) {
    const i = mem.firing, j = me.joints['arm_' + i];
    if (!j || !me.parts['shot_' + i].attached) { mem.firing = null; mem.cool = s.t + 0.8; }
    else {
      out['arm_' + i] = lib.clamp(mem.swing / (ARM * TOP), 0, 1);
      out.say = `throwing at ${mem.range.toFixed(0)} m`;
      drive(0, 0);
      if (j.angle >= RELEASE) { out.release.push('shot_' + i); mem.firing = null; mem.cool = s.t + 0.9; mem.thrown = (mem.thrown || 0) + 1; }
      return;
    }
  }

  if (loaded.length) {
    // Aim where the enemy will be when the ball lands, not where it is now.
    let lead = { x: foe.x, z: foe.z }, d = foe.distance, v = speedFor(d);
    for (let k = 0; k < 3; k++) { const flight = d / Math.max(1, v * Math.cos(RELEASE)) + 0.45; lead = lib.ahead(foe, flight); d = Math.hypot(lead.x - me.x, lead.z - me.z); v = speedFor(d); }
    const b = lib.to(s, lead.x, lead.z);
    const tooFar = v > MAXV, tooNear = d < 4.5;
    // Somewhere to throw from: the nearest reachable ground to the enemy that still leaves me in range.
    if (tooFar) {
      const n = lib.nav(s, lead.x, lead.z, { ...SELF, speed: 0.85 });
      if (n.arrived || (!n.reachable && n.left < 0.6)) { out.say = 'cannot get nearer, waiting for it to come into range'; drive(0, lib.clamp(b.bearing * 3 - me.turnRate * 0.5, -0.6, 0.6)); mem.wait = (mem.wait || 0) + 1; }
      else { out.say = n.braking ? 'braking for the edge' : n.reachable ? 'closing to throwing range' : 'closing as far as the floor goes'; drive(n.drive, n.turn); }
      // If it will never come into range, there is no use keeping the shot: go and play the objective.
      if ((mem.wait || 0) < 150) return;
      out.say = 'it is staying out of range, going for the objective';
    } else if (tooNear) {
      const g = lib.guard(s, -0.7, SELF), c = lib.steer(b.bearing, 9, {});
      if (g.room > 0.3) { out.say = 'too close to throw, backing off'; drive(g.drive, c.turn); return; }
      // No room to back off: use the arms as clubs instead.
      out.say = 'no room to back off, swinging at it';
      for (const i of loaded) { const j = me.joints['arm_' + i]; if (j) out['arm_' + i] = j.angle < 2.6 ? 1 : -1; }
      drive(0, lib.clamp(b.bearing * 3, -0.6, 0.6)); return;
    } else {
    // In range: stop, turn onto the line, wait until steady, then swing.
    const steady = Math.abs(b.bearing) < 0.035 && Math.abs(me.turnRate) < 0.25 && me.speed < 0.4;
    out.say = steady ? 'on target' : 'lining up the throw';
    drive(0, lib.clamp(b.bearing * 3.5 - me.turnRate * 0.5, -0.6, 0.6));
    mem.wait = 0;
    if (steady && s.t > (mem.cool || 1.2)) { mem.firing = loaded[0]; mem.swing = v; mem.range = d; }
    return;
    }
  }

  // Out of ammunition (or nothing to throw at): play the objective, and club anything within reach of the arms.
  const spent = !loaded.length, near = foe.distance < 2.6 && Math.abs(foe.bearing) < 0.5;
  if (spent) for (const i of [0, 1, 2]) { const j = me.joints['arm_' + i]; if (j) out['arm_' + i] = near ? (j.angle < 2.9 ? 1 : -1) : lib.clamp((-0.2 - j.angle) * 0.8, -0.5, 0.5); }
  let aim, stopAt = 0.4;
  if (s.crate) {
    const c = s.crate, home = s.homeSide, behind = (me.z - c.z) * home < -1.2 && Math.abs(me.x - c.x) < 1;
    if (c.z * home > 3 && lib.run(s, c.x, c.z, 0, home, 6, 0) < 2.5) { aim = { x: (c.x + foe.x) / 2, z: c.z - home * 2.4 }; stopAt = 0.7; out.say = 'crate is home, guarding it'; }
    else if (behind) {
      const b = lib.to(s, c.x, c.z + home * 6), ctl = lib.steer(b.bearing, 9, {}), g = lib.guard(s, ctl.drive, SELF);
      out.say = g.braking ? 'easing off at the edge' : 'pushing the crate home'; drive(g.drive, ctl.turn); return;
    } else { aim = { x: (me.z - c.z) * home < -1.2 ? c.x : c.x + (me.x >= c.x ? 2.6 : -2.6), z: c.z - home * 2.6 }; out.say = 'getting behind the crate'; }
  } else { aim = s.target; if (spent) out.say = near ? 'out of shot, clubbing with the arms' : 'out of shot, going for the point'; }
  const n = lib.nav(s, aim.x, aim.z, { ...SELF, stopAt, reverse: true });
  mem.idle = me.speed < 0.15 ? (mem.idle || 0) + 1 : 0;
  if ((!n.reachable && (n.arrived || mem.idle > 45)) || mem.hunting) {
    const sh = !s.crate && shoveTarget(s, lib, { margin: 1.4 }); mem.hunting = !!sh;
    if (sh) { const h = lib.nav(s, sh.x, sh.z, { ...SELF, margin: 1.4, stopAt: sh.charge ? 0 : 0.5 }); out.say = sh.charge ? 'cannot reach the point, so pushing the enemy further from it' : 'cannot reach the point, getting between it and the enemy'; drive(h.drive, h.turn); return; }
  }
  if (n.arrived) { out.say = n.reachable ? 'holding the point' : 'holding the nearest ground to the point'; drive(0, lib.spin(s, lib.clamp(foe.bearing * 1.5, -0.5, 0.5), 1.9)); return; }
  if (n.braking) out.say = 'braking for the edge';
  drive(n.drive, n.turn);
}

// ── Corral ─────────────────────────────────────────────────────────────────
// A walled pen on six wheels, open at the front, with two gates. It drives over a thing, shuts the gates
// behind it and carries it off. The walls are 68 separate blocks stacked three high, so a hard hit takes
// bricks out of the wall instead of bouncing off a solid box.
function wall() {
  const parts = [];
  const spots = [];
  for (let i = -4; i <= 4; i++) spots.push(['b' + (i + 4), i * 0.3, -0.3, 'sill']);
  for (let k = 0; k < 6; k++) { spots.push(['l' + k, 1.2, k * 0.3, 'rail_l']); spots.push(['r' + k, -1.2, k * 0.3, 'rail_r']); }
  for (const [name, x, z, base] of spots) for (let layer = 0; layer < 3; layer++) {
    if (name === 'b4' && layer < 2) continue; // the core sits here
    parts.push(block(`w${layer}_${name}`, [0.28, 0.28, 0.28], [x, -0.04 + layer * 0.3, z], layer === 0 || (name === 'b4' && layer === 2) ? (name === 'b4' ? 'core' : base) : `w${layer - 1}_${name}`, 'plastic'));
  }
  return parts;
}
export const CORRAL = {
  name: 'Corral',
  note: 'A rolling pen. It swallows the crate, shuts two gates behind it and hauls it home. Its walls are loose-stacked bricks that come away one at a time.',
  parts: [
    { id: 'core', type: 'core' },
    beam('sill', [2.4, 0.14, 0.22], [0, -0.25, -0.3], 'core', 'steel'),
    beam('rail_l', [0.22, 0.14, 2.0], [1.2, -0.25, 0.75], 'sill', 'steel'),
    beam('rail_r', [0.22, 0.14, 2.0], [-1.2, -0.25, 0.75], 'sill', 'steel'),
    ...[0, 1, 2].flatMap((i) => [wheel('wl_' + i, [1.62, -0.35, -0.1 + i * 0.85], 'rail_l', { power: 0.2 }), wheel('wr_' + i, [-1.62, -0.35, -0.1 + i * 0.85], 'rail_r', { power: 0.2 })]),
    ...wall(),
    { id: 'gate_l', type: 'beam', material: 'steel', size: [0.1, 0.3, 1.0], pos: [1.2, -0.1, 2.3], parent: 'rail_l', joint: { type: 'motor', axis: [0, 1, 0], pivot: [1.2, -0.1, 1.8], gear: 4, power: 0.3, limits: [-92, 0] } },
    { id: 'gate_r', type: 'beam', material: 'steel', size: [0.1, 0.3, 1.0], pos: [-1.2, -0.1, 2.3], parent: 'rail_r', joint: { type: 'motor', axis: [0, 1, 0], pivot: [-1.2, -0.1, 1.8], gear: 4, power: 0.3, limits: [0, 92] } },
  ],
};
export function corralProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy;
  const drive = (d, t) => { mem.push = Math.abs(d) + Math.abs(t); for (const id of ['wl_0', 'wl_1', 'wl_2']) out[id] = lib.clamp(d - t); for (const id of ['wr_0', 'wr_1', 'wr_2']) out[id] = lib.clamp(d + t); };
  const gates = (shut) => { out.gate_l = shut ? -0.6 : 0.6; out.gate_r = shut ? 0.6 : -0.6; };
  // Where something is in my own frame: ahead (+) or behind, and left (+) or right.
  const local = (p) => { const b = lib.to(s, p.x, p.z); return { ahead: Math.cos(b.bearing) * b.distance, left: Math.sin(b.bearing) * b.distance }; };
  // The pen reaches 2.4 m ahead of the core and 1.2 m behind, so the two ends need different room.
  const FWD = { length: 2.6, top: 4, margin: 2.8, mem }, BACK = { length: 1.4, top: 4, margin: 2.8, mem };
  const safe = (d) => lib.guard(s, d, d >= 0 ? FWD : BACK).drive;
  mem.stuck = Math.abs(me.forwardSpeed) < 0.12 && Math.abs(me.turnRate) < 0.15 && s.t > 2 && (mem.push || 0) > 0.1 ? (mem.stuck || 0) + 1 : 0;
  if (mem.stuck > 45) { mem.freeUntil = s.t + 1.2; mem.stuck = 0; mem.freeTurn = mem.freeTurn > 0 ? -0.6 : 0.6; }
  if (s.t < (mem.freeUntil || 0)) { out.say = 'jammed, backing off to try another line'; gates(false); drive(safe(-0.7), mem.freeTurn); return; }
  mem.parked = false;

  if (s.crate) {
    const c = local(s.crate), inside = c.ahead > 0.2 && c.ahead < 1.75 && Math.abs(c.left) < 0.85;
    if (inside) {
      // Take it right to the back wall first, or the gates will close on it instead of behind it.
      const half = s.challenge.objective.crate.size / 2, deep = c.ahead < half + 0.3;
      if (!deep && !mem.shutAt) { out.say = 'crate is in the pen, taking it to the back wall'; gates(false); drive(safe(0.45), lib.clamp(c.left * 1.5, -0.3, 0.3)); return; }
      gates(true);
      mem.shutAt = mem.shutAt || s.t;
      const j = me.joints.gate_l, shut = (j && j.angle < -1.2) || s.t - mem.shutAt > 2.5;
      const b = lib.to(s, me.x * 0.5, s.homeSide * 100);
      const atHome = s.crate.z * s.homeSide > 3 && lib.runAhead(s, Math.abs(b.bearing) < Math.PI / 2 ? 0 : Math.PI, 5, 0) < 3.2;
      if (!shut) { out.say = 'shutting the gates behind it'; drive(0, 0); return; }
      if (atHome) { out.say = 'crate is home, holding it here'; mem.parked = true; drive(0, 0); return; }
      out.say = 'hauling the crate home';
      const ctl = lib.steer(b.bearing, 9, { reverse: true, speed: 0.9 }); drive(safe(ctl.drive), ctl.turn); return;
    }
    mem.shutAt = 0;
    gates(false);
    // Line up on the crate from a little way off, then drive straight over it.
    const far = s.crate.distance > 3.2, b = s.crate.bearing;
    out.say = far ? 'heading for the crate' : 'lining the pen up on the crate';
    const ctl = lib.steer(b, s.crate.distance, { speed: far ? 1 : 0.5, stopAt: 0, gain: 2.6 });
    drive(safe(Math.abs(b) > 0.25 && !far ? 0 : ctl.drive), ctl.turn); return;
  }

  gates(true);
  const tg = s.target, g = lib.to(s, tg.x, tg.z), plan = lib.plan(s, tg.x, tg.z, { margin: 2.8 });
  const foeToT = Math.hypot(foe.x - tg.x, foe.z - tg.z), path = s.challenge.objective.path;
  let aim = tg, say = 'driving to the point';
  if (path.kind === 'jump') {
    const left = path.every - (s.t % path.every), next = path.points[(Math.floor(s.t / path.every) + 1) % path.points.length];
    if (plan.left / 3 > left + 0.5) { aim = next; say = 'cannot make this one, heading to the next point'; }
  }
  if (plan.reachable && aim === tg && foeToT < 2.6 && g.distance > foeToT - 0.7 && lib.clear(s, foe.x, foe.z, 0.8)) {
    const hit = lib.intercept(s, foe, 3), r = ram(s, lib, mem, hit.x, hit.z, FWD);
    out.say = r.say || 'ramming the enemy off the point with the gates shut'; drive(r.drive, r.turn); mem.push = 0; return;
  }
  const n = lib.nav(s, aim.x, aim.z, { ...FWD, stopAt: 0.4, reverse: true });
  mem.idle = me.speed < 0.15 ? (mem.idle || 0) + 1 : 0;
  if ((!n.reachable && (n.arrived || mem.idle > 45)) || mem.hunting) {
    const sh = shoveTarget(s, lib, { margin: 1.8 }); mem.hunting = !!sh;
    if (sh) { const h = lib.nav(s, sh.x, sh.z, { ...FWD, margin: 1.8, stopAt: sh.charge ? 0 : 0.5 }); out.say = sh.charge ? 'cannot reach the point, so ramming the enemy further from it' : 'cannot reach the point, getting between it and the enemy'; drive(h.drive, h.turn); return; }
  }
  if (n.arrived) { mem.parked = true; out.say = n.reachable ? 'parked on the point' : 'as near the point as the floor allows'; drive(0, lib.spin(s, lib.clamp(foe.bearing, -0.4, 0.4), 2.6)); return; }
  out.say = n.braking ? 'braking for the edge' : say;
  drive(n.drive, n.turn);
}

// ── Span ───────────────────────────────────────────────────────────────────
// A long machine that crosses gaps with its own body. Eight wheels on four axles, and two heavy weights on
// arms that swing over the top from tail to nose. With the weights at the tail it can hang its front half out
// over a gap; once the nose is down on the far side it swings them forward and brings the tail across.
const SPAN_AXLES = [-2.15, -0.75, 0.75, 2.15];
export const SPAN = {
  name: 'Span',
  note: 'Crosses gaps nothing else here can. It parks square to the edge with its weights at the tail, reaches its nose across, then swings the weights over the top to the nose and pulls its tail over.',
  parts: [
    { id: 'core', type: 'core' },
    beam('spine_f', [0.16, 0.12, 2.3], [0, -0.25, 1.15], 'core'),
    beam('spine_r', [0.16, 0.12, 2.3], [0, -0.25, -1.15], 'core'),
    ...['l', 'r'].flatMap((side) => { const sx = side === 'l' ? 1 : -1; return [
      beam(`rail_${side}f`, [0.12, 0.14, 2.3], [sx * 0.75, -0.25, 1.15], 'spine_f'),
      beam(`rail_${side}r`, [0.12, 0.14, 2.3], [sx * 0.75, -0.25, -1.15], 'spine_r'),
      // A truss over the top keeps the long frame from folding in the middle.
      beam(`post_${side}`, [0.1, 0.7, 0.1], [sx * 0.75, 0.1, 0], `rail_${side}f`),
      beam(`stay_${side}f`, [0.07, 0.07, 2.2], [sx * 0.75, 0.12, 1.05], `post_${side}`, 'aluminium', { rot: [18, 0, 0] }),
      beam(`stay_${side}r`, [0.07, 0.07, 2.2], [sx * 0.75, 0.12, -1.05], `post_${side}`, 'aluminium', { rot: [-18, 0, 0] }),
    ]; }),
    ...[-2.2, -1.1, 0, 1.1, 2.2].map((z, i) => beam('rung_' + i, [1.6, 0.1, 0.12], [0, -0.25, z], z > 0 ? 'spine_f' : 'spine_r')),
    ...SPAN_AXLES.flatMap((z, i) => [
      wheel('wl_' + i, [1.08, -0.35, z], z > 0 ? 'rail_lf' : 'rail_lr', { power: 0.16, material: Math.abs(z) > 1 ? 'plastic' : 'rubber' }),
      wheel('wr_' + i, [-1.08, -0.35, z], z > 0 ? 'rail_rf' : 'rail_rr', { power: 0.16, material: Math.abs(z) > 1 ? 'plastic' : 'rubber' }),
    ]),
    // The weights rest on these when they are down at either end.
    plate('rest_f', [1.3, 0.06, 0.7], [0, -0.14, 1.85], 'spine_f', 'plastic'),
    plate('rest_r', [1.3, 0.06, 0.7], [0, -0.14, -1.85], 'spine_r', 'plastic'),
    beam('axle', [1.2, 0.12, 0.12], [0, 0.2, 0], 'core', 'steel'),
    ...['l', 'r'].flatMap((side) => { const sx = side === 'l' ? 1 : -1; return [
      { id: 'arm_' + side, type: 'beam', material: 'aluminium', size: [0.1, 0.1, 1.7], pos: [sx * 0.36, 0.2, -0.9], parent: 'axle', joint: { type: 'motor', axis: [1, 0, 0], pivot: [sx * 0.36, 0.2, 0], gear: 8, power: 1, limits: [-2, 178] } },
      block('weight_' + side, [0.5, 0.4, 0.5], [sx * 0.36, 0.2, -1.85], 'arm_' + side, 'steel'),
    ]; }),
    { id: 'nose', type: 'wedge', material: 'steel', size: [1.4, 0.3, 0.3], pos: [0, -0.3, 2.42], parent: 'spine_f' },
  ],
};
export function spanProgram(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 2.7, top: 4, margin: 2.8, mem }, AX = 2.15, IN = 0.75;
  const drive = (d, t) => { for (let i = 0; i < 4; i++) { out['wl_' + i] = lib.clamp(d - t); out['wr_' + i] = lib.clamp(d + t); } };
  // Weights: 0 is at the tail, 1 at the nose. Both arms are held to the same angle so the machine stays level.
  const aj = me.joints.arm_l || me.joints.arm_r, at = aj ? lib.clamp(Math.abs(aj.angle) / Math.PI, 0, 1) : 0;
  // Swung too fast in low gravity, the weights would lift the whole machine, so the swing slows to suit.
  const swing = 0.14 * Math.sqrt(Math.min(1, s.challenge.gravity));
  const weights = (to) => { for (const id of ['arm_l', 'arm_r']) { const j = me.joints[id]; if (j) out[id] = lib.clamp((to * Math.PI * 0.99 - j.angle) * 1.2, -swing, swing); } };
  if (mem.w === undefined) mem.w = 0;
  if (me.upright < 0.2) { out.say = 'on my back, throwing the weights over to roll'; weights(Math.sin(s.t * 2) > 0 ? 1 : 0); drive(0, 0); return; }

  let goal, stopAt = 0.4, say;
  if (s.crate) {
    const c = s.crate, home = s.homeSide, behind = (me.z - c.z) * home < -2.9 && Math.abs(me.x - c.x) < 1.0;
    if (c.z * home > 3 && lib.run(s, c.x, c.z, 0, home, 6, 0) < 2.5) { goal = { x: (c.x + foe.x) / 2, z: c.z - home * 3.4 }; stopAt = 0.7; say = 'crate is home, guarding it'; }
    else if (behind) {
      const b = lib.to(s, c.x, c.z + home * 6), ctl = lib.steer(b.bearing, 9, {}), g = lib.guard(s, ctl.drive, SELF);
      out.say = g.braking ? 'easing off at the edge' : 'pushing the crate home'; weights(0); drive(g.drive, ctl.turn); return;
    } else { goal = { x: (me.z - c.z) * home < -2.9 ? c.x : c.x + (me.x >= c.x ? 3.4 : -3.4), z: c.z - home * 4.2 }; say = 'getting behind the crate'; }
  } else { goal = s.target; say = 'driving to the point'; }

  // A crossing in progress carries on until the tail is over, whatever else is happening.
  let X = mem.cross;
  if (!X) {
    const plan = lib.plan(s, goal.x, goal.z, { margin: SELF.margin });
    if (!plan.reachable) {
      // Look for a gap on the straight line back from the goal toward my side, along whichever axis is nearer.
      // The goal may be on the far side, or out over the gap itself, in which case I stop astride it.
      const dx = goal.x - me.x, dz = goal.z - me.z, alongZ = Math.abs(dz) >= Math.abs(dx), d = alongZ ? { x: 0, z: Math.sign(dz) } : { x: Math.sign(dx), z: 0 };
      const over = !lib.floorAt(s, goal.x, goal.z);
      let far = null, near = null, stop = null;
      if (over) { far = 0; for (let k = 0; k < 6; k += 0.1) if (lib.floorAt(s, goal.x + d.x * k, goal.z + d.z * k)) { far = -k; break; } if (far === 0) far = -99; }
      for (let k = 0; k < 40; k += 0.1) {
        const on = lib.floorAt(s, goal.x - d.x * k, goal.z - d.z * k);
        if (far === null) { if (!on) far = k; } else if (on && k > Math.max(0, far)) { near = k; break; }
      }
      if (over && near !== null) stop = near;
      const level = near !== null && lib.stepAt(s, goal.x - d.x * (near + 0.3), goal.z - d.z * (near + 0.3)) === lib.stepAt(s, goal.x - d.x * (far - 0.3), goal.z - d.z * (far - 0.3));
      if (near !== null && near - far <= 2.6 && level) {
        const edge = { x: goal.x - d.x * near, z: goal.z - d.z * near };
        mem.plan = { d, gap: near - far, edge, stop, stage: { x: edge.x - d.x * 3.4, z: edge.z - d.z * 3.4 }, heading: Math.atan2(d.x, d.z) };
      } else mem.plan = { tooWide: near === null ? 0 : near - far };
    } else mem.plan = null;
  }
  const P = mem.plan;
  if (X || (P && !P.tooWide && P.stage)) {
    const Q = X || P, along = (me.x - Q.edge.x) * Q.d.x + (me.z - Q.edge.z) * Q.d.z, off = (me.x - Q.edge.x) * Q.d.z - (me.z - Q.edge.z) * Q.d.x;
    const err = lib.wrap(Q.heading - me.heading);
    if (!X) {
      // Park square to the edge, a length back from it, with the weights at the tail.
      weights(0);
      const n = lib.nav(s, Q.stage.x, Q.stage.z, { ...SELF, margin: 1.6, stopAt: 0.3 });
      if (!n.arrived && !(along > -4.2 && along < -3.0 && Math.abs(off) < 0.5)) { out.say = `no way round: lining up to cross the ${Q.gap.toFixed(1)} m gap`; drive(n.drive, n.turn); return; }
      if (Math.abs(err) > 0.04 || Math.abs(me.turnRate) > 0.1) { out.say = 'squaring up to the edge'; drive(0, lib.clamp(err * 2.5 - me.turnRate * 0.6, -0.4, 0.4)); return; }
      if (at > 0.06) { out.say = 'weights to the tail first'; drive(0, 0); return; }
      mem.cross = X = Q; mem.noseAt = null; mem.holdAt = null;
    }
    // Where each axle is: before the gap, over it, or across. The weights go to whichever end is on the floor.
    // Once the nose is down it stays counted as down: swinging the weights forward shoves the frame back a little.
    if (along + AX > Q.gap + 0.35 && mem.noseAt == null) mem.noseAt = along;
    const noseDown = mem.noseAt != null, secondDown = along + IN > Q.gap + 0.35, thirdDown = along - IN > Q.gap + 0.35, tailDown = along - AX > Q.gap + 0.5;
    const want = noseDown ? 1 : 0;
    weights(want);
    const settled = Math.abs(at - want) < 0.08;
    // Hold still while the weights are in the air, and do not let the third axle leave until they are forward.
    const hold = (noseDown && !settled && along - IN > -0.5) || (!noseDown && !settled);
    out.say = tailDown ? 'across' : !noseDown ? 'weights at the tail, reaching the nose across' : !settled ? 'nose is down, swinging the weights forward' : secondDown && !thirdDown ? 'weights at the nose, pulling the tail over' : 'crossing';
    // If the point is out over the gap, ease up to it and hold there with an axle on each side.
    // Creep: never faster than I can stop within a metre on this floor.
    const brake = lib.braking(s, { mem }), creep = Math.min(0.3, Math.sqrt(2 * brake * 1.0) / 4);
    if (!hold) mem.holdAt = null; else if (mem.holdAt == null) mem.holdAt = along;
    let go = hold ? lib.clamp((mem.holdAt - along) * 0.6 - me.forwardSpeed * 0.6, -0.3, 0.3) : creep;
    if (X.stop !== null && noseDown && settled) {
      const left = X.stop - along, vmax = Math.sqrt(2 * brake * Math.abs(left)) * 0.7, v = me.forwardSpeed;
      go = Math.abs(left) < 0.15 ? lib.clamp(-v, -0.3, 0.3) : v * Math.sign(left) > vmax + 0.05 ? -Math.sign(v) * 0.6 : Math.sign(left) * Math.min(creep, vmax / 4 + 0.02);
      if (Math.abs(left) < 0.4) out.say = 'astride the gap, right on the point'; else if (left < 0) out.say = 'overshot, easing back onto the point';
    }
    drive(go, lib.clamp(err * 2 - off * 0.3 - me.turnRate * 0.4, -0.25, 0.25));
    if (tailDown && X.stop === null) { mem.cross = null; mem.plan = null; mem.noseAt = null; }
    return;
  }

  // No crossing to make: keep the weights low at the tail and play the objective like anyone else.
  weights(0);
  if (!s.crate) {
    const tg = s.target, foeToT = Math.hypot(foe.x - tg.x, foe.z - tg.z), d = lib.to(s, tg.x, tg.z).distance;
    if (P && P.tooWide !== undefined) say = P.tooWide ? `the ${P.tooWide.toFixed(1)} m gap is too wide for me, holding this side` : 'no way to the point, holding the nearest ground';
    else if (foeToT < 2.6 && d > foeToT - 0.7 && lib.clear(s, foe.x, foe.z, 0.8)) {
      const hit = lib.intercept(s, foe, 3), r = ram(s, lib, mem, hit.x, hit.z, SELF);
      out.say = r.say || (r.braking ? 'not following it over the edge' : 'shouldering the enemy off the point'); drive(r.drive, r.turn); return;
    }
  }
  const n = lib.nav(s, goal.x, goal.z, { ...SELF, stopAt, reverse: true });
  mem.idle = me.speed < 0.15 ? (mem.idle || 0) + 1 : 0;
  if ((!n.reachable && (n.arrived || mem.idle > 45)) || mem.hunting) {
    const sh = !s.crate && shoveTarget(s, lib, { margin: 1.8 }); mem.hunting = !!sh;
    if (sh) { const h = lib.nav(s, sh.x, sh.z, { ...SELF, margin: 1.8, stopAt: sh.charge ? 0 : 0.5 }); out.say = sh.charge ? 'cannot reach the point, so shouldering the enemy further from it' : 'cannot reach the point, getting between it and the enemy'; drive(h.drive, h.turn); return; }
  }
  if (n.arrived) { out.say = n.reachable ? 'holding the point' : say; drive(0, lib.spin(s, lib.clamp(foe.bearing, -0.4, 0.4), 2.7)); return; }
  out.say = n.braking ? 'braking for the edge' : say;
  drive(n.drive, n.turn);
}

export const ALL = [
  { build: BULWARK, program: bulwarkProgram },
  { build: STRIDER, program: striderProgram },
  { build: MANGONEL, program: mangonelProgram },
  { build: CORRAL, program: corralProgram },
  { build: SPAN, program: spanProgram },
];
export const ROSTER = ALL;
