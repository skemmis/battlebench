// ───────────────────────────────────────────────────────────────────────────
// HELPERS for control programs, passed in as the fourth argument: program(s, out, mem, lib).
// Plumbing only: geometry, steering and prediction. Strategy is the program's job.
// This library does not count toward a program's size limit.
// ───────────────────────────────────────────────────────────────────────────
const LIB_GRIDS = new WeakMap();
export const LIB = {
  clamp(v, lo = -1, hi = 1) { return Math.max(lo, Math.min(hi, v)); },
  wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; },
  // Bearing (radians, relative to the machine's nose, positive to its left) and distance to a point.
  to(s, x, z) { return { bearing: LIB.wrap(Math.atan2(x - s.self.x, z - s.self.z) - s.self.heading), distance: Math.hypot(x - s.self.x, z - s.self.z) }; },
  // Where something moving will be after t seconds if it keeps going as it is.
  ahead(thing, t) { return { x: thing.x + (thing.vx || 0) * t, z: thing.z + (thing.vz || 0) * t }; },
  // The point to head for to meet something moving, given your own speed. Falls back to its current place.
  intercept(s, thing, speed) {
    let t = Math.hypot(thing.x - s.self.x, thing.z - s.self.z) / Math.max(0.1, speed);
    for (let i = 0; i < 3; i++) { const p = LIB.ahead(thing, t); t = Math.hypot(p.x - s.self.x, p.z - s.self.z) / Math.max(0.1, speed); }
    t = Math.min(t, 3);
    return { ...LIB.ahead(thing, t), t };
  },
  // Is there floor under this point, and how high is it?
  floorAt(s, x, z) { for (const f of s.challenge.floor) if (Math.abs(x - f.x) <= f.w / 2 && Math.abs(z - f.z) <= f.d / 2) return true; return false; },
  // How high the ground is at a point: the slab plus any hills on it.
  heightAt(s, x, z) { return LIB.stepAt(s, x, z) + LIB.hillAt(s, x, z); },
  hillAt(s, x, z) {
    const t = s.challenge.terrain; if (!t) return 0;
    const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell, ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= t.nx - 1 || iz >= t.nz - 1) return 0;
    const u = fx - ix, v = fz - iz, H = t.heights, k = iz * t.nx + ix;
    return H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + t.nx] * (1 - u) * v + H[k + t.nx + 1] * u * v;
  },
  // The slope of the ground along a world direction at a point: rise over run, uphill positive.
  gradeAt(s, x, z, dx, dz) { const n = Math.hypot(dx, dz) || 1, e = 0.5; return (LIB.hillAt(s, x + (dx / n) * e, z + (dz / n) * e) - LIB.hillAt(s, x - (dx / n) * e, z - (dz / n) * e)) / (2 * e); },
  // How high a flat-topped slab stands at a point, ignoring hills: steps are what a machine has to climb in one go.
  stepAt(s, x, z) { let h = 0; for (const f of s.challenge.floor) if (Math.abs(x - f.x) <= f.w / 2 && Math.abs(z - f.z) <= f.d / 2) h = Math.max(h, f.top || 0); return h; },
  inWall(s, x, z, margin = 0) { for (const w of s.challenge.walls) if (Math.abs(x - w.x) <= w.w / 2 + margin && Math.abs(z - w.z) <= w.d / 2 + margin) return true; return false; },
  // How far the floor runs from a point along a world direction before a drop, a wall or a step up, up to max.
  // "climb" is the highest step up the machine can take in its stride.
  run(s, x, z, dx, dz, max = 6, margin = 0.8, climb = 0.15) {
    let h0 = LIB.stepAt(s, x, z); const n = Math.hypot(dx, dz) || 1;
    // Each step up is judged from the ledge before it, so a staircase of small steps is a way through.
    for (let d = 0.25; d <= max; d += 0.25) { const px = x + (dx / n) * d, pz = z + (dz / n) * d; if (!LIB.floorAt(s, px, pz) || LIB.inWall(s, px, pz, margin)) return d - 0.25; const h = LIB.stepAt(s, px, pz); if (h > h0 + climb) return d - 0.25; h0 = h; }
    return max;
  },
  // How far the floor runs ahead of the machine along a bearing relative to its nose.
  runAhead(s, bearing = 0, max = 6, margin = 0.8, climb = 0.15) { const a = s.self.heading + bearing; return LIB.run(s, s.self.x, s.self.z, Math.sin(a), Math.cos(a), max, margin, climb); },
  // Can the machine go straight from where it is to a point without leaving the floor or meeting a wall?
  clear(s, x, z, margin = 0.8, climb = 0.15) { const d = Math.hypot(x - s.self.x, z - s.self.z); return d < 0.3 || LIB.run(s, s.self.x, s.self.z, x - s.self.x, z - s.self.z, d, margin, climb) >= d - 0.3; },
  // A point to steer for on the way to (x, z): the point itself if the way is clear, otherwise a sidestep
  // around whatever is in the way, picked from a fan of directions by how far it gets toward the goal.
  route(s, x, z, margin = 0.8, climb = 0.15) {
    if (LIB.clear(s, x, z, margin, climb)) return { x, z, direct: true };
    const base = Math.atan2(x - s.self.x, z - s.self.z);
    let best = null;
    for (const off of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
      const a = base + off, reach = LIB.run(s, s.self.x, s.self.z, Math.sin(a), Math.cos(a), 5, margin, climb);
      if (reach < 1.2) continue;
      const step = Math.min(reach, 3), px = s.self.x + Math.sin(a) * step, pz = s.self.z + Math.cos(a) * step;
      const score = Math.hypot(x - px, z - pz) + Math.abs(off) * 0.5;
      if (!best || score < best.score) best = { x: px, z: pz, score, direct: false };
    }
    return best || { x, z, direct: false };
  },
  // A map of the floor in half-metre squares, worked out once per round: how high each square is and how far
  // it is from the nearest drop or wall.
  grid(s) {
    let g = LIB_GRIDS.get(s.challenge);
    if (g) return g;
    const ch = s.challenge, C = 0.5;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const f of ch.floor) { x0 = Math.min(x0, f.x - f.w / 2); x1 = Math.max(x1, f.x + f.w / 2); z0 = Math.min(z0, f.z - f.d / 2); z1 = Math.max(z1, f.z + f.d / 2); }
    const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C), n = nx * nz;
    const h = new Float32Array(n), y = new Float32Array(n), edge = new Float32Array(n).fill(99), queue = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i % nx) + 0.5) * C, z = z0 + (Math.floor(i / nx) + 0.5) * C;
      if (!LIB.floorAt(s, x, z) || LIB.inWall(s, x, z)) { h[i] = -1; edge[i] = 0; queue.push(i); } else { h[i] = LIB.stepAt(s, x, z); y[i] = LIB.hillAt(s, x, z); }
    }
    // Squares on the rim of the map border the void too.
    for (let i = 0; i < n; i++) if (h[i] >= 0) { const cx = i % nx, cz = Math.floor(i / nx); if (cx === 0 || cz === 0 || cx === nx - 1 || cz === nz - 1) { edge[i] = C / 2; queue.push(i); } }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], cx = i % nx, cz = Math.floor(i / nx);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const ax = cx + dx, az = cz + dz; if ((!dx && !dz) || ax < 0 || az < 0 || ax >= nx || az >= nz) continue;
        const j = az * nx + ax, d = edge[i] + C * (dx && dz ? 1.41 : 1);
        if (d < edge[j]) { edge[j] = d; queue.push(j); }
      }
    }
    g = { x0, z0, nx, nz, C, h, y, edge, steps: new Map(), cell: (x, z) => { const cx = Math.floor((x - x0) / C), cz = Math.floor((z - z0) / C); return cx < 0 || cz < 0 || cx >= nx || cz >= nz ? -1 : cz * nx + cx; }, pos: (i) => ({ x: x0 + ((i % nx) + 0.5) * C, z: z0 + (Math.floor(i / nx) + 0.5) * C }) };
    LIB_GRIDS.set(s.challenge, g);
    return g;
  },
  // How far each square is from the foot of the nearest step up that is too high to take ("limit" metres or more
  // above the square next to it).
  stepClear(g, limit) {
    const key = Math.round(limit * 100);
    let d = g.steps.get(key); if (d) return d;
    const n = g.nx * g.nz, queue = []; d = new Float32Array(n).fill(99);
    for (let i = 0; i < n; i++) {
      if (g.h[i] < 0) continue;
      const cx = i % g.nx, cz = Math.floor(i / g.nx);
      let foot = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = cx + dx, az = cz + dz; if (ax < 0 || az < 0 || ax >= g.nx || az >= g.nz) continue; if (g.h[az * g.nx + ax] - g.h[i] > limit) foot = true; }
      if (foot) { d[i] = g.C / 2; queue.push(i); }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], cx = i % g.nx, cz = Math.floor(i / g.nx);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const ax = cx + dx, az = cz + dz; if ((!dx && !dz) || ax < 0 || az < 0 || ax >= g.nx || az >= g.nz) continue;
        const j = az * g.nx + ax, v = d[i] + g.C * (dx && dz ? 1.41 : 1);
        if (g.h[j] >= 0 && Math.abs(g.h[j] - g.h[i]) <= limit && v < d[j] && v < 4) { d[j] = v; queue.push(j); }
      }
    }
    g.steps.set(key, d); return d;
  },
  // Plan a way across the floor to (x, z), keeping "margin" metres from drops and walls and taking no step up
  // higher than "climb". Returns the next point to steer for, the place the plan ends, and whether that is the
  // goal itself. If the goal cannot be reached, the plan ends at the nearest place that can.
  // "grade" is the steepest slope it will take uphill (rise over run); it is cut down on a slippery surface,
  // where wheels cannot hold a steep slope.
  plan(s, x, z, { margin = 1.5, climb = 0.15, grade = 0.5, side = Math.min(margin, 1.5) } = {}) {
    grade = Math.min(grade, 0.75 * s.challenge.surface.grip);
    const g = LIB.grid(s), start = g.cell(s.self.x, s.self.z);
    if (start < 0 || g.h[start] < 0) return { x, z, end: { x, z }, reachable: false, off: true, left: 0 };
    // Keep clear of steps too high to climb as well, by the same margin.
    // Keep clear of the foot of steps too high to climb as well, by "side" metres.
    const step = LIB.stepClear(g, climb);
    const from = new Int32Array(g.nx * g.nz).fill(-2), queue = [start];
    from[start] = -1;
    let best = start, bestD = Math.hypot(x - s.self.x, z - s.self.z);
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], cx = i % g.nx, cz = Math.floor(i / g.nx);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const ax = cx + dx, az = cz + dz; if ((!dx && !dz) || ax < 0 || az < 0 || ax >= g.nx || az >= g.nz) continue;
        const j = az * g.nx + ax;
        if (from[j] !== -2 || g.h[j] < 0 || g.h[j] - g.h[i] > climb) continue;
        if (g.y[j] - g.y[i] > grade * g.C * (dx && dz ? 1.41 : 1) && g.y[j] > g.y[start] - 0.3) continue;
        // Keep the margin, except that a machine already inside it may move toward open floor.
        if (g.edge[j] < margin && !(g.edge[i] < margin && g.edge[j] > g.edge[i])) continue;
        if (step[j] < side && !(step[i] < side && step[j] > step[i])) continue;
        from[j] = i; queue.push(j);
        const p = g.pos(j), d = Math.hypot(x - p.x, z - p.z);
        if (d < bestD - 1e-6) { bestD = d; best = j; }
      }
    }
    // A goal on the floor but inside the margin counts as reached from the nearest safe spot beside it.
    const reachable = bestD < 0.6 || (LIB.floorAt(s, x, z) && !LIB.inWall(s, x, z) && bestD <= margin + 0.8 && Math.abs(LIB.stepAt(s, x, z) - g.h[best]) <= climb), end = bestD < 0.6 ? { x, z } : g.pos(best);
    // Walk the plan back from its end and steer for the furthest point on it that is in a straight clear line.
    const chain = []; for (let i = best; i !== -1 && i !== -2; i = from[i]) chain.push(i);
    // A straight run to a point on the plan must also keep its distance from steps too high to climb.
    const wide = (p) => { const d = Math.hypot(p.x - s.self.x, p.z - s.self.z); for (let t = 1; t < d; t += 0.4) { const c = g.cell(s.self.x + ((p.x - s.self.x) * t) / d, s.self.z + ((p.z - s.self.z) * t) / d); if (c >= 0 && step[c] < side && step[c] < step[start]) return false; } if (s.challenge.terrain) for (let t = 0.5; t < d; t += 0.5) { const f0 = (t - 0.5) / d, f1 = t / d; if (LIB.hillAt(s, s.self.x + (p.x - s.self.x) * f1, s.self.z + (p.z - s.self.z) * f1) - LIB.hillAt(s, s.self.x + (p.x - s.self.x) * f0, s.self.z + (p.z - s.self.z) * f0) > grade * 0.5) return false; } return true; };
    let way = end, left = 0;
    for (let k = 0; k < chain.length; k++) {
      const p = k === 0 ? end : g.pos(chain[k]);
      if (LIB.clear(s, p.x, p.z, margin * 0.7, climb) && wide(p)) { way = p; break; }
      way = p;
    }
    for (let k = 1; k < chain.length; k++) { const a = g.pos(chain[k - 1]), b = g.pos(chain[k]); left += Math.hypot(a.x - b.x, a.z - b.z); }
    return { x: way.x, z: way.z, end, reachable, off: false, left };
  },
  // The fastest it is safe to be going with "room" metres of floor left ahead, given the round's grip and gravity.
  safeSpeed(s, room, grip = 1) { const a = 0.3 * grip * s.challenge.surface.grip * 9.81 * s.challenge.gravity; return Math.sqrt(2 * a * Math.max(0, room)); },
  // How hard the machine can brake, in m/s2, from the round's grip and gravity. Cautious: a little over half
  // of what a perfect stop on rubber would give.
  braking(s, { grip = 1 } = {}) { return 0.55 * grip * s.challenge.surface.grip * 9.81 * s.challenge.gravity; },
  // Take a wanted drive (-1 to 1) and return one that will not take the machine off the floor: slowed when the
  // floor ahead is short, and reversed to brake when it is already going too fast to stop, or sliding sideways
  // toward a drop. "length" is how far the machine reaches ahead of its core, "top" its top speed.
  guard(s, want, { grip = 1, length = 1.5, top = 4, climb = 0.15, mem = null, feed = true } = {}) {
    const me = s.self; let drive = want, braking = false;
    let decel = 0;
    decel = LIB.braking(s, { grip });
    const safe = (room) => Math.sqrt(2 * decel * Math.max(0, room));
    const dir = drive < 0 || (drive === 0 && me.forwardSpeed < 0) ? Math.PI : 0;
    // Only drops and walls are worth braking for. A step up is something to bump into, not fall off.
    const roomAhead = LIB.runAhead(s, dir, 9, 0, 99) - length;
    const along = Math.abs(me.forwardSpeed), limit = safe(roomAhead);
    if (along > limit + 0.3 && (me.forwardSpeed > 0) === (dir === 0)) { drive = me.forwardSpeed > 0 ? -1 : 1; braking = true; }
    else if (Math.abs(drive) * top > limit) drive = Math.sign(drive) * Math.min(Math.abs(drive), limit / top);
    if (!braking && me.speed > 0.8) {
      const roomSlide = LIB.run(s, me.x, me.z, me.vx, me.vz, 9, 0, 99) - length;
      if (me.speed > safe(roomSlide) + 0.3) { drive = me.forwardSpeed > 0 ? -1 : 1; braking = true; }
    }
    // Feed the power in: a tyre that spins or locks grips less, so never ask the wheels to turn much faster or
    // slower than the ground is passing. Full grip is kept for pulling away, for braking and for shoving.
    if (feed) drive = LIB.clamp(drive * top, me.forwardSpeed - 0.7, me.forwardSpeed + 0.7) / top;
    return { drive, braking, room: roomAhead };
  },
  // How far a point is from the nearest drop or wall (to the nearest half metre or so).
  edgeAt(s, x, z) { const g = LIB.grid(s), i = g.cell(x, z); return i < 0 ? 0 : g.edge[i]; },
  // A turn-on-the-spot command that is only passed on where there is room to swing a machine of this reach.
  spin(s, turn, reach) { return LIB.edgeAt(s, s.self.x, s.self.z) > reach * 0.8 ? turn : 0; },
  // Drive to (x, z) and stay on the floor. Plans a way round gaps and walls, slows for corners and on arrival,
  // and brakes in time for an edge, allowing for how slippery the floor is and how long the machine is.
  // Returns { drive, turn, arrived, reachable, braking, left } where left is the distance still to go.
  nav(s, x, z, { margin = 1.5, grade = 0.5, side, climb = 0.15, stopAt = 0.35, reverse = false, speed = 1, grip = 1, length = 1.5, top = 4, mem = null, feed = true } = {}) {
    const me = s.self, p = LIB.plan(s, x, z, side === undefined ? { margin, climb, grade } : { margin, climb, grade, side });
    const w = LIB.to(s, p.x, p.z), endD = Math.hypot(p.end.x - me.x, p.end.z - me.z), last = Math.hypot(p.x - p.end.x, p.z - p.end.z) < 0.3;
    // Once arrived, stay arrived until well off the spot, so the machine does not fidget.
    const held = mem && mem._at && Math.hypot(mem._at.x - p.end.x, mem._at.z - p.end.z) < 0.5 && endD < stopAt * 3 + 0.3;
    const c = held ? { drive: 0, turn: 0, arrived: true } : LIB.steer(w.bearing, last ? endD : 9, { stopAt, reverse, speed });
    if (mem) mem._at = c.arrived && last ? (held ? mem._at : { x: p.end.x, z: p.end.z }) : null;
    // Nose jammed against something: asked to move, not moving, not turning. Back off a little and come again.
    if (mem) {
      if (s.t < (mem._back || 0)) { const g2 = LIB.guard(s, -0.6 * (mem._backDir || 1), { grip, length, top, climb, feed }); return { drive: g2.drive, turn: LIB.clamp(c.turn * 1.5), arrived: false, reachable: p.reachable, braking: false, backing: true, left: endD, end: p.end }; }
      mem._jam = !c.arrived && Math.abs(c.drive) + Math.abs(c.turn) > 0.25 && me.speed < 0.12 && Math.abs(me.turnRate) < 0.08 && s.t > 1.5 ? (mem._jam || 0) + 1 : 0;
      if (mem._jam > 30) { mem._jam = 0; mem._back = s.t + 1.1; mem._backDir = c.drive >= 0 ? 1 : -1; }
    }
    const gd = LIB.guard(s, c.drive, { grip, length, top, climb, mem, feed }), drive = gd.drive, braking = gd.braking;
    // While the wheels are being fed in gently, steer gently too, so neither side is asked to stand still.
    if (feed && Math.abs(c.drive) > 0.6 && Math.abs(drive) < Math.abs(c.drive) && !braking) c.turn = LIB.clamp(c.turn, -0.5 * Math.abs(drive), 0.5 * Math.abs(drive));
    return { drive, turn: c.turn, arrived: c.arrived && last, reachable: p.reachable, braking, left: endD, end: p.end };
  },
  // Turn a bearing and distance into drive and turn for a machine that steers by driving its two sides at
  // different speeds. It slows for sharp turns and on arrival; with reverse, either end may lead.
  steer(bearing, distance, { speed = 1, stopAt = 0.3, slowAt = 2.5, reverse = false, gain = 2.2 } = {}) {
    let b = bearing, dir = 1;
    if (reverse && Math.abs(b) > Math.PI / 2) { b = b > 0 ? b - Math.PI : b + Math.PI; dir = -1; }
    if (distance < stopAt) return { drive: 0, turn: 0, arrived: true };
    const face = Math.max(0, Math.cos(b)) ** 2;
    const drive = dir * speed * face * Math.min(1, 0.25 + distance / slowAt);
    return { drive, turn: LIB.clamp(b * gain), arrived: false };
  },
};
