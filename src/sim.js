import * as CANNON from 'cannon-es';
import { OPEN, targetAt, floorHeight, terrainHeight, edgeDistance } from './challenges.js';
import { LIB } from './lib.js';

// ───────────────────────────────────────────────────────────────────────────
// SETTINGS. Every number we expect to tune lives here.
// Lengths are metres, masses kg, impulses N·s, angles in builds are degrees.
// A bot's frame: +z is forward, +y is up, +x is its left side.
// ───────────────────────────────────────────────────────────────────────────
export const CONFIG = {
  version: 'v0.7',
  physics: { hz: 480, controlHz: 30, gravity: 9.81, solverIterations: 12 },
  // The world the fight happens in. Rolling resistance is the fraction of the load a rolling thing loses as
  // drag (a tyre on rough ground is about 0.05). Sliding grip is this fraction of grip at rest. Air is real
  // air: density in kg per cubic metre and a blunt-body drag figure. Loose pieces that have stopped stay stopped.
  ground: { rollRubber: 0.05, rollHard: 0.06, kinetic: 0.8, slideSpeed: 0.1, airDensity: 1.2, waterDensity: 1000, dragShape: 1.0, restSpeed: 0.12, restSeconds: 0.6 },
  arena: { size: 30, thickness: 1, grip: 1.0, slide: 0.3, ringOutDepth: 1.2, slipSpeed: 0.8, spinGrip: 0.6 },
  // A fight ends when a core leaves the arena, when a machine has lost wreckShare of its mass, when nothing has
  // moved for stalemateSeconds, or at maxSeconds. In the last two cases the more intact machine wins.
  // If no core has left, the core closer to the point wins (by at least centerMargin metres). If they are level,
  // the machine that has had less broken off it wins (by at least intactMargin of its mass). Otherwise a draw.
  // Nothing here rewards damage or movement for their own sake, so sitting still or shedding parts is allowed.
  match: { maxSeconds: 90, stalemateSeconds: 10, stalemateRadius: 0.35, graceSeconds: 3, wreckShare: 0.5, intactMargin: 0.05 },
  budget: { mass: 1200, cost: 800, box: [8, 5, 9], maxParts: 300 },
  // Limits on the control program itself. It may see everything, but it has to be small.
  program: { maxChars: 20000 },
  // A joint's load = impulse x share of the bot it has to drag along x leverage x sharpness.
  // Sharpness: a hit at speedRef m/s counts 1.5x, faster hits count for more.
  // A joint's load = impulse of the whole blow x share of the machine the joint drags x leverage x sharpness.
  // Sharpness is closing speed / speedRef, capped at maxSharp. Blows against the floor count for floorFactor.
  breakage: { scale: 1, leverLength: 1.0, speedRef: 4, maxSharp: 2.5, floorFactor: 0.4, maxLever: 1.2, window: 0.05, deadMotorDrag: 0.3, logImpulse: 60 },
  materials: {
    steel: { density: 780, strength: 1.5, costPerVolume: 70 },
    aluminium: { density: 270, strength: 1.0, costPerVolume: 90 },
    plastic: { density: 120, strength: 0.55, costPerVolume: 35 },
    // Grips the floor as well as a wheel does. Everything else slides.
    rubber: { density: 110, strength: 0.8, costPerVolume: 50 },
  },
  joints: {
    // Joint strengths below are for a part 0.12 m square in section. Thicker parts make stronger joints, by the
    // square root of the section, up to maxThick times. Thinner parts are not weaker than the figures given.
    section: 0.0144, maxThick: 2.5,
    fixed: { strength: 500, cost: 0 },
    // A hinge turns freely about "axis". It may set "limits": [low, high] in degrees from its built position,
    // and "spring": stiffness in N·m per radian pulling it back toward "rest" degrees (default 0).
    hinge: { strength: 500, cost: 2, maxSpring: 4000, stopStiffness: 6000, stopDamping: 150, stopRate: 60 },
    // A motor joint may set "gear": n. Speed is divided by n and torque multiplied by n (0.5 to 8).
    // Hinge and motor joints may set "pivot": [x, y, z] in the bot frame; without it they turn about the part's centre.
    // "power" from 0.02 to 1 picks the size of the motor: torque and cost scale with it. A wheel is a rubber
    // ball or a disc on a small, geared-down motor. Motor joints may also set "limits" and "spring" like a hinge.
    motor: { strength: 1500, cost: 8, maxSpeed: 80, torque: 300, minGear: 0.5, maxGear: 8, minPower: 0.02 },
    // A piston slides its part along "axis" by up to "stroke" metres. It stores energy: pushing out is fast and
    // strong but drains its charge (a full stroke uses all of it), pulling back is slow and free, and the charge
    // refills over rechargeSeconds. "gear" trades speed for force as on a motor.
    piston: { strength: 1500, cost: 10, force: 5000, speed: 8, retractSpeed: 1, maxStroke: 0.6, rechargeSeconds: 2.5, lead: 0.15 },
  },
  parts: {
    core: { size: [0.4, 0.4, 0.4], mass: 20, cost: 0 },
    beam: { maxSize: [0.3, 0.3, 2.4] },
    plate: { maxSize: [2.4, 0.15, 2.4] },
    block: { maxSize: [0.6, 0.6, 0.6] },
    wedge: { maxSize: [2.0, 0.6, 1.0] },
    disc: { maxRadius: 0.6, maxThickness: 0.2 },
    ball: { maxRadius: 0.3 },
    // There are no ready-made wheels, weapons or grabbers. Everything else is assembled from these.
  },
};

const V = (a) => new CANNON.Vec3(a[0], a[1], a[2]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const r2 = (v) => Math.round(v * 100) / 100;
const BOX_TYPES = ['beam', 'plate', 'block'];
const READY_MADE = ['core'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Part geometry ──────────────────────────────────────────────────────────
// Returns what the physics and the viewer both need to know about one part.
export function partSpec(def, cfg = CONFIG) {
  const t = def.type;
  if (t === 'core') {
    const s = cfg.parts.core.size;
    return { kind: 'box', size: s, half: s.map((x) => x / 2), volume: s[0] * s[1] * s[2], mass: cfg.parts.core.mass, cost: 0, strength: 1.5 };
  }
  const mat = cfg.materials[def.material] || cfg.materials.aluminium;
  let kind, volume, half, extra = {};
  if (BOX_TYPES.includes(t)) {
    kind = 'box'; volume = def.size[0] * def.size[1] * def.size[2]; half = def.size.map((x) => x / 2); extra.size = def.size;
  } else if (t === 'wedge') {
    kind = 'wedge'; volume = (def.size[0] * def.size[1] * def.size[2]) / 2; half = def.size.map((x) => x / 2); extra.size = def.size;
  } else if (t === 'disc') {
    kind = 'disc'; volume = Math.PI * def.radius * def.radius * def.thickness; half = [def.radius, def.thickness / 2, def.radius];
    extra.radius = def.radius; extra.thickness = def.thickness;
  } else if (t === 'ball') {
    kind = 'ball'; volume = (4 / 3) * Math.PI * def.radius ** 3; half = [def.radius, def.radius, def.radius]; extra.radius = def.radius;
  }
  return { kind, half, volume, mass: volume * mat.density, cost: volume * mat.costPerVolume, strength: mat.strength, ...extra };
}

function makeShape(spec) {
  if (spec.kind === 'box') return new CANNON.Box(V(spec.half));
  if (spec.kind === 'ball') return new CANNON.Sphere(spec.radius);
  if (spec.kind === 'disc') return new CANNON.Cylinder(spec.radius, spec.radius, spec.thickness, 12);
  if (spec.kind === 'wedge') {
    const [w, h, l] = spec.half;
    return new CANNON.ConvexPolyhedron({
      vertices: [V([-w, -h, -l]), V([w, -h, -l]), V([w, h, -l]), V([-w, h, -l]), V([-w, -h, l]), V([w, -h, l])],
      faces: [[0, 3, 2, 1], [0, 1, 5, 4], [3, 4, 5, 2], [0, 4, 3], [1, 2, 5]],
    });
  }
  throw new Error('unknown shape ' + spec.kind);
}

// ── Build checking ─────────────────────────────────────────────────────────
// Forgiving on purpose: it reports every problem it can find in plain words.
export function validateBuild(build, cfg = CONFIG) {
  const errors = [];
  const warnings = [];
  let mass = 0, cost = 0;
  if (!build || !Array.isArray(build.parts)) return { ok: false, errors: ['The build needs a "parts" list.'], warnings, mass, cost };
  const ids = new Map();
  const cores = build.parts.filter((p) => p.type === 'core');
  if (cores.length !== 1) errors.push(`A bot needs exactly one core part; this build has ${cores.length}.`);
  if (build.parts.length > cfg.budget.maxParts) errors.push(`Too many parts: ${build.parts.length}, the limit is ${cfg.budget.maxParts}.`);
  for (const p of build.parts) {
    const where = `Part "${p.id}"`;
    if (!p.id || typeof p.id !== 'string') { errors.push('Every part needs a text "id".'); continue; }
    if (ids.has(p.id)) errors.push(`${where}: this id is used twice.`);
    ids.set(p.id, p);
    if (!cfg.parts[p.type]) { errors.push(`${where}: unknown type "${p.type}". Use one of ${Object.keys(cfg.parts).join(', ')}.`); continue; }
    if (!READY_MADE.includes(p.type) && !cfg.materials[p.material]) {
      errors.push(`${where}: unknown material "${p.material}". Use one of ${Object.keys(cfg.materials).join(', ')}.`); continue;
    }
    const lim = cfg.parts[p.type];
    if (BOX_TYPES.includes(p.type) || p.type === 'wedge') {
      if (!Array.isArray(p.size) || p.size.length !== 3 || p.size.some((x) => !(x > 0.02))) { errors.push(`${where}: "size" must be three lengths, each above 0.02.`); continue; }
      const a = [...p.size].sort((x, y) => x - y), b = [...lim.maxSize].sort((x, y) => x - y);
      if (a.some((x, i) => x > b[i] + 1e-9)) errors.push(`${where}: size ${JSON.stringify(p.size)} is larger than a ${p.type} may be (${JSON.stringify(lim.maxSize)}).`);
    }
    if (p.type === 'disc') {
      if (!(p.radius > 0.05) || !(p.thickness > 0.02)) { errors.push(`${where}: a disc needs "radius" above 0.05 and "thickness" above 0.02.`); continue; }
      if (p.radius > lim.maxRadius || p.thickness > lim.maxThickness) errors.push(`${where}: a disc may be at most radius ${lim.maxRadius} and thickness ${lim.maxThickness}.`);
    }
    if (p.type === 'ball') {
      if (!(p.radius > 0.03)) { errors.push(`${where}: a ball needs "radius" above 0.03.`); continue; }
      if (p.radius > lim.maxRadius) errors.push(`${where}: a ball may be at most radius ${lim.maxRadius}.`);
    }
    if (p.type !== 'core') {
      if (!Array.isArray(p.pos) || p.pos.length !== 3 || p.pos.some((x) => typeof x !== 'number')) { errors.push(`${where}: "pos" must be three numbers [x, y, z] measured from the core.`); continue; }
      const jt = (p.joint && p.joint.type) || 'fixed';
      if (!cfg.joints[jt]) errors.push(`${where}: unknown joint type "${jt}". Use fixed, hinge, motor or piston.`);
      if (jt === 'piston' && !(p.joint.stroke > 0 && p.joint.stroke <= cfg.joints.piston.maxStroke)) errors.push(`${where}: a piston needs a "stroke" above 0 and at most ${cfg.joints.piston.maxStroke}.`);
      if (jt === 'hinge' || jt === 'motor' || jt === 'piston') {
        const ax = p.joint.axis;
        if (!Array.isArray(ax) || ax.length !== 3 || Math.hypot(...ax) < 1e-6) errors.push(`${where}: a ${jt} joint needs an "axis" such as [0, 1, 0].`);
        const pv = p.joint.pivot;
        if (pv !== undefined && (!Array.isArray(pv) || pv.length !== 3 || pv.some((x) => typeof x !== 'number'))) errors.push(`${where}: "pivot" must be three numbers [x, y, z] measured from the core.`);
        // The pivot has to be on the part it turns. Otherwise a weight could swing about a point it is not joined to.
        else if (pv !== undefined && Array.isArray(p.pos)) {
          const reach = Array.isArray(p.size) ? Math.hypot(...p.size) / 2 : (p.radius || 0.3) + (p.thickness || 0) / 2;
          if (Math.hypot(pv[0] - p.pos[0], pv[1] - p.pos[1], pv[2] - p.pos[2]) > reach + 0.1) errors.push(`${where}: the "pivot" must be on the part itself, not away from it.`);
        }
        const g = p.joint.gear;
        if (g !== undefined && !(g >= cfg.joints.motor.minGear && g <= cfg.joints.motor.maxGear)) errors.push(`${where}: "gear" must be between ${cfg.joints.motor.minGear} and ${cfg.joints.motor.maxGear}.`);
        const pw = p.joint.power;
        if (pw !== undefined && !(pw >= cfg.joints.motor.minPower && pw <= 1)) errors.push(`${where}: "power" must be between ${cfg.joints.motor.minPower} and 1.`);
        const lm = p.joint.limits;
        if (lm !== undefined && (!Array.isArray(lm) || lm.length !== 2 || !(lm[0] <= 0 && lm[1] >= 0))) errors.push(`${where}: "limits" must be [low, high] in degrees with low at or below 0 and high at or above 0.`);
        const sp = p.joint.spring;
        if (sp !== undefined && !(sp > 0 && sp <= cfg.joints.hinge.maxSpring)) errors.push(`${where}: "spring" must be above 0 and at most ${cfg.joints.hinge.maxSpring}.`);
      }
      const b = cfg.budget.box;
      if (Math.abs(p.pos[0]) > b[0] / 2 || Math.abs(p.pos[1]) > b[1] / 2 || Math.abs(p.pos[2]) > b[2] / 2) errors.push(`${where}: its centre is outside the build box of ${JSON.stringify(b)} around the core.`);
    }
    try { const s = partSpec(p, cfg); mass += s.mass; cost += s.cost + (p.type === 'core' ? 0 : (cfg.joints[(p.joint && p.joint.type) || 'fixed']?.cost || 0) * (p.joint && p.joint.type === 'motor' ? Math.max(0.25, Number(p.joint.power) || 1) : 1)); } catch (e) { /* reported above */ }
  }
  for (const p of build.parts) {
    if (p.type === 'core' || !p.id) continue;
    if (!ids.has(p.parent)) { errors.push(`Part "${p.id}": its "parent" is "${p.parent}", which is not a part in this build.`); continue; }
    let cur = p, hops = 0;
    while (cur && cur.type !== 'core' && hops++ < 100) cur = ids.get(cur.parent);
    if (!cur || cur.type !== 'core') errors.push(`Part "${p.id}": following its parents never reaches the core.`);
  }
  if (mass > cfg.budget.mass) errors.push(`Over the mass allowance: ${r2(mass)} kg, the limit is ${cfg.budget.mass} kg.`);
  if (cost > cfg.budget.cost) errors.push(`Over the cost allowance: ${r2(cost)}, the limit is ${cfg.budget.cost}.`);
  if (!build.parts.some((p) => (p.joint && (p.joint.type === 'motor' || p.joint.type === 'piston')))) warnings.push('Nothing in this build is powered, so it cannot move.');
  return { ok: errors.length === 0, errors, warnings, mass: r2(mass), cost: r2(cost) };
}

// ── Match ──────────────────────────────────────────────────────────────────
const GROUND = 1, DEBRIS = 8;
const BOT_BIT = [2, 4];

export function createMatch({ builds, programs, seed = 1, config = CONFIG, challenge = OPEN }) {
  const cfg = config, ch = challenge;
  const dt = 1 / cfg.physics.hz;
  const stepsPerControl = Math.round(cfg.physics.hz / cfg.physics.controlHz);
  const rng = mulberry32(seed);
  const world = new CANNON.World();
  world.gravity.set(0, -cfg.physics.gravity * ch.gravity, 0);
  world.solver.iterations = cfg.physics.solverIterations;
  world.allowSleep = true;   // only loose pieces are ever allowed to come to rest; see assemble()
  world.defaultContactMaterial.friction = cfg.arena.slide * ch.surface.slide;
  world.defaultContactMaterial.restitution = 0.15;

  // Friction. The engine's own limit lets a contact point resist sliding with far more than friction x weight
  // (it treats a force as an impulse per step, and gives every point the body's whole weight), so in practice
  // nothing ever slid. Set the limit to what it should be: friction x weight, as an impulse over one step,
  // shared between the points the two bodies touch at.
  const findContacts = world.narrowphase.getContacts.bind(world.narrowphase);
  world.narrowphase.getContacts = (p1, p2, w, result, old, frictionResult, frictionPool) => {
    findContacts(p1, p2, w, result, old, frictionResult, frictionPool);
    // Parts of one machine collide with each other, except pairs that were built overlapping or share a joint.
    const dropped = new Set();
    const tag = (e) => `${e.bi.id}:${e.bj.id}:${e.ri.x}:${e.ri.y}:${e.ri.z}`;
    for (let i = result.length - 1; i >= 0; i--) {
      const e = result[i], p = e.si.partRef, q = e.sj.partRef;
      // That holds after they break apart too: two pieces built overlapping would otherwise be thrown apart
      // with great force the moment they became separate bodies.
      if (!p || !q || p.bot !== q.bot) continue;
      if (p.parent === q || q.parent === p || p.bot.clash.has(p.index * 100000 + q.index)) { dropped.add(tag(e)); result.splice(i, 1); }
    }
    if (dropped.size) for (let i = frictionResult.length - 1; i >= 0; i--) if (dropped.has(tag(frictionResult[i]))) frictionResult.splice(i, 1);
    const count = new Map();
    const key = (e) => e.bi.id * 100000 + e.bj.id;
    for (const e of result) count.set(key(e), (count.get(key(e)) || 0) + 1);
    // Grip depends on how hard the two bodies are pressed together, not on how heavy the lighter one is: a wheel
    // carries the machine above it. Use the pressing force the solver found for this pair on the last step. A
    // pair that has only just touched has no such figure yet and falls back to the lighter body's weight.
    const gAbs = Math.abs(world.gravity.y) || 1;
    // A rubber tyre that is spinning or skidding grips less than one that is rolling: above a small slip speed
    // its grip drops to cfg.arena.spinGrip of normal. Driving the wheels no faster than the ground is passing
    // keeps full grip, so a machine that feeds its power in wins a shove against one that just floors it.
    const rubberAt = new Set();
    for (const e of result) if ((e.si.material === matRubber) !== (e.sj.material === matRubber) && (e.si.material === matFloor || e.sj.material === matFloor)) rubberAt.add(tag(e));
    for (let i = 0; i + 1 < frictionResult.length; i += 2) {
      const a1 = frictionResult[i], a2 = frictionResult[i + 1];
      if (a1.bi !== a2.bi || a1.bj !== a2.bj || !rubberAt.has(tag(a1))) continue;
      const vi = a1.bi.velocity.vadd(a1.bi.angularVelocity.cross(a1.ri)), vj = a1.bj.velocity.vadd(a1.bj.angularVelocity.cross(a1.rj)), rel = vi.vsub(vj);
      const slip = Math.hypot(rel.dot(a1.t), rel.dot(a2.t));
      a1.spin = a2.spin = slip > cfg.arena.slipSpeed ? cfg.arena.spinGrip : 1;
    }
    // Everything else also grips a little less once it is sliding than it does at rest.
    for (let i = 0; i + 1 < frictionResult.length; i += 2) {
      const a1 = frictionResult[i], a2 = frictionResult[i + 1];
      if (a1.bi !== a2.bi || a1.bj !== a2.bj || rubberAt.has(tag(a1))) continue;
      const vi = a1.bi.velocity.vadd(a1.bi.angularVelocity.cross(a1.ri)), vj = a1.bj.velocity.vadd(a1.bj.angularVelocity.cross(a1.rj)), rel = vi.vsub(vj);
      if (Math.hypot(rel.dot(a1.t), rel.dot(a2.t)) > cfg.ground.slideSpeed) a1.spin = a2.spin = cfg.ground.kinetic;
    }
    for (const e of frictionResult) {
      const k = count.get(key(e)) || 1, press = pressed.get(key(e)), spin = e.spin || 1; e.spin = 1;
      if (press === undefined) { e.minForce *= (dt / k) * spin; e.maxForce *= (dt / k) * spin; continue; }
      const reduced = 1 / ((e.bi.invMass + e.bj.invMass) || 1), mu = e.maxForce / (gAbs * reduced), lim = (mu * press * dt * spin) / k;
      e.minForce = -lim; e.maxForce = lim;
    }
  };
  // After each step, note how hard each pair of bodies was pressed together (smoothed over a few steps).
  let pressed = new Map();
  const notePressure = () => {
    const now = new Map();
    for (const e of world.contacts) { const k2 = e.bi.id * 100000 + e.bj.id; now.set(k2, (now.get(k2) || 0) + Math.max(0, e.multiplier || 0)); }
    for (const [k2, v] of now) { const was = pressed.get(k2); now.set(k2, was === undefined ? v : was * 0.6 + v * 0.4); }
    pressed = now;
  };

  // Rolling and air. A thing that rolls or pivots on another loses a little to the contact: a torque against
  // its turning of (rolling resistance x pressing force x distance from its centre to the contact). And
  // everything moving through the air is slowed by drag that grows with the square of its speed.
  const tmpT = new CANNON.Vec3(), tmpW = new CANNON.Vec3();
  const groundAndAir = () => {
    const G = cfg.ground, soft = Math.max(0.5, Math.min(2, ch.surface.slide));
    for (const e of world.contacts) {
      const N = Math.max(0, e.multiplier || 0); if (N <= 0) continue;
      const rubber = e.si.material === matRubber || e.sj.material === matRubber, onFloor = e.bi === floor || e.bj === floor;
      const c = (rubber ? G.rollRubber : G.rollHard) * (onFloor ? soft : 1);
      e.bi.angularVelocity.vsub(e.bj.angularVelocity, tmpW);
      const w = tmpW.length(); if (w < 1e-4) continue;
      for (const [b, r, sign] of [[e.bi, e.ri, -1], [e.bj, e.rj, 1]]) {
        if (b.type !== CANNON.Body.DYNAMIC || b.sleepState === CANNON.Body.SLEEPING) continue;
        const torque = c * N * Math.min(0.6, r.length());
        tmpW.scale((sign * torque * dt) / w, tmpT);
        b.invInertiaWorld.vmult(tmpT, tmpT);
        const dw = tmpT.length(); if (dw > 0.5 * w) tmpT.scale((0.5 * w) / dw, tmpT);
        b.angularVelocity.vadd(tmpT, b.angularVelocity);
      }
    }
    // Water: whatever stands in it is dragged on by the part of it that is under, and borne up by the weight
    // of water that part pushes aside. Steel sinks and wades; rubber and plastic float.
    if (ch.water) for (const b of world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC || b.sleepState === CANNON.Body.SLEEPING || !b.dragArea) continue;
      const lvl = ch.water.level;
      if (b.position.y > lvl + 1.5 || terrainHeight(ch, b.position.x, b.position.z) >= lvl) continue;
      b.updateAABB();
      const lo = b.aabb.lowerBound.y, hi = b.aabb.upperBound.y; if (lo >= lvl) continue;
      const sub = Math.min(1, (lvl - lo) / Math.max(0.05, hi - lo));
      b.velocity.y += (G.waterDensity * cfg.physics.gravity * ch.gravity * (b.volume || 0) * sub * dt) / b.mass;
      const v = b.velocity.length();
      b.velocity.scale(1 - Math.min(0.5, (0.5 * G.waterDensity * G.dragShape * b.dragArea * sub * v * dt) / b.mass), b.velocity);
      b.angularVelocity.scale(1 - Math.min(0.5, 2 * sub * dt), b.angularVelocity);
    }
    for (const b of world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC || b.sleepState === CANNON.Body.SLEEPING || !b.dragArea) continue;
      const v = b.velocity.length(); if (v < 0.5) continue;
      const k = Math.min(0.5, (0.5 * G.airDensity * G.dragShape * b.dragArea * v * dt) / b.mass);
      b.velocity.scale(1 - k, b.velocity);
    }
  };
  // The area a body shows to the air: for a convex shape seen from all sides, a quarter of its surface.
  const faceArea = (sh) => (sh.type === CANNON.Shape.types.SPHERE ? Math.PI * sh.radius * sh.radius : sh.halfExtents ? 2 * (sh.halfExtents.x * sh.halfExtents.y + sh.halfExtents.y * sh.halfExtents.z + sh.halfExtents.z * sh.halfExtents.x) : Math.PI * sh.boundingSphereRadius * sh.boundingSphereRadius * 0.5);

  const matFloor = new CANNON.Material('floor');
  const matRubber = new CANNON.Material('rubber');
  const matHard = new CANNON.Material('hard');
  world.addContactMaterial(new CANNON.ContactMaterial(matRubber, matRubber, { friction: 1.0, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matFloor, matRubber, { friction: cfg.arena.grip * ch.surface.grip, restitution: 0.05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matFloor, matHard, { friction: cfg.arena.slide * ch.surface.slide, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matHard, matHard, { friction: 0.3, restitution: 0.2 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matRubber, matHard, { friction: 0.6, restitution: 0.1 }));

  // The floor: slabs with their top at height 0, plus any walls standing on them. An unchanged Open floor
  // follows the arena size in the settings.
  const slabs = ch === OPEN ? [{ x: 0, z: 0, w: cfg.arena.size, d: cfg.arena.size }] : ch.floor;
  const geo = { ...ch, floor: slabs };
  const floor = new CANNON.Body({ mass: 0, material: matFloor, collisionFilterGroup: GROUND, collisionFilterMask: -1 });
  // Every shape carries its own material: the engine only looks up a pair's friction when both shapes have one.
  for (const sl of slabs) { const top = sl.top || 0; const sh = new CANNON.Box(new CANNON.Vec3(sl.w / 2, (cfg.arena.thickness + top) / 2, sl.d / 2)); sh.material = matFloor; floor.addShape(sh, new CANNON.Vec3(sl.x, (top - cfg.arena.thickness) / 2, sl.z)); }
  for (const wl of ch.walls) { const sh = new CANNON.Box(new CANNON.Vec3(wl.w / 2, wl.h / 2, wl.d / 2)); sh.label = 'a wall'; sh.material = matFloor; floor.addShape(sh, new CANNON.Vec3(wl.x, wl.h / 2, wl.z)); }
  // Topography: one height field per base slab, cut from the challenge's grid of heights. The slab stays
  // underneath, so flat ground is the slab and the height field only rises out of it.
  if (ch.terrain) {
    const t = ch.terrain;
    for (const sl of slabs) {
      if (sl.top) continue;
      const i0 = Math.max(0, Math.ceil((sl.x - sl.w / 2 - t.x0) / t.cell)), i1 = Math.min(t.nx - 1, Math.floor((sl.x + sl.w / 2 - t.x0) / t.cell));
      const j0 = Math.max(0, Math.ceil((sl.z - sl.d / 2 - t.z0) / t.cell)), j1 = Math.min(t.nz - 1, Math.floor((sl.z + sl.d / 2 - t.z0) / t.cell));
      if (i1 - i0 < 2 || j1 - j0 < 2) continue;
      const data = []; let any = false;
      for (let i = i0; i <= i1; i++) { const col = []; for (let j = j1; j >= j0; j--) { const h = t.heights[j * t.nx + i]; if (h > 0.05) any = true; const k = Math.min(1, h / 0.3); col.push(h - 0.05 * (1 - k * k * (3 - 2 * k))); } data.push(col); }
      if (!any) continue;
      const sh = new CANNON.Heightfield(data, { elementSize: t.cell }); sh.material = matFloor;
      floor.addShape(sh, new CANNON.Vec3(t.x0 + i0 * t.cell, 0, t.z0 + j1 * t.cell), new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0));
    }
  }
  world.addBody(floor);
  // Loose objects that belong to the arena, not to a bot.
  const props = [];
  if (ch.objective.type === 'deliver') {
    const c = ch.objective.crate, sh = new CANNON.Box(new CANNON.Vec3(c.size / 2, c.size / 2, c.size / 2));
    sh.label = 'the crate'; sh.material = matHard;
    const body = new CANNON.Body({ mass: c.mass, collisionFilterGroup: DEBRIS, collisionFilterMask: -1, angularDamping: 0.01 });
    body.addShape(sh); body.position.set(c.x, floorHeight(geo, c.x, c.z) + c.size / 2 + 0.02, c.z);
    body.pv = new CANNON.Vec3(); body.pw = new CANNON.Vec3();
    world.addBody(body);
    props.push({ id: 'crate', kind: 'box', size: [c.size, c.size, c.size], body, lost: false });
  }
  const crate = props[0] || null;

  const m = {
    config: cfg, seed, t: 0, steps: 0, done: false, result: null,
    events: [], track: [], frames: [], frameFlags: [], frameTimes: [], frameSay: [],
    bots: [], parts: [], world, challenge: geo, props, propFrames: [], score: [0, 0],
  };
  const log = (type, bot, text, data = {}) => m.events.push({ t: r2(m.t), type, bot, text, ...data });

  // Spawn: opposite ends, roughly facing each other, with a little seeded variation.
  const spawns = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const sp = ch === OPEN ? { x: 0, z: side * (cfg.arena.size / 2 - 6) } : ch.spawn[i];
    const x = sp.x + (rng() - 0.5) * 4, z = sp.z;
    const yaw = Math.atan2(-x, -z) + (rng() - 0.5) * 0.5;
    return { x, z, yaw };
  });

  builds.forEach((build, i) => {
    const check = validateBuild(build, cfg);
    const bot = {
      index: i, name: build.name || `Bot ${i + 1}`, build, check, program: programs[i], mem: {},
      parts: [], byId: new Map(), bodies: [], constraints: [], out: {}, alive: true,
      startMass: 0, liveMass: 0, flipped: false, airborne: false, warned: false, history: [],
    };
    const sp = spawns[i];
    const q0 = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), sp.yaw);
    // Find the lowest point of the build so it starts resting just above the floor.
    let lowest = 0;
    const specs = build.parts.map((def) => partSpec(def, cfg));
    build.parts.forEach((def, k) => {
      const y = (def.pos ? def.pos[1] : 0) - (def.rot ? Math.max(...specs[k].half) : specs[k].half[1]);
      lowest = Math.min(lowest, y);
    });
    let ground = 0; for (let ax = -2.5; ax <= 2.5; ax += 0.5) for (let az = -2.5; az <= 2.5; az += 0.5) ground = Math.max(ground, floorHeight(geo, sp.x + ax, sp.z + az));   // clear of any ledge under the machine
    const origin = new CANNON.Vec3(sp.x, -lowest + 0.02 + ground, sp.z);
    build.parts.forEach((def, k) => {
      const spec = specs[k];
      const lq = new CANNON.Quaternion();
      if (def.rot) lq.setFromEuler((def.rot[0] * Math.PI) / 180, (def.rot[1] * Math.PI) / 180, (def.rot[2] * Math.PI) / 180, 'XYZ');
      const lp = def.pos ? V(def.pos) : new CANNON.Vec3();
      const jt = def.type === 'core' ? null : (def.joint && def.joint.type) || 'fixed';
      const axis = (def.joint && def.joint.axis) || [0, 1, 0];
      const shape = makeShape(spec);
      const gear = clamp(Number(def.joint && def.joint.gear) || 1, cfg.joints.motor.minGear, cfg.joints.motor.maxGear);
      const power = clamp(Number(def.joint && def.joint.power) || 1, cfg.joints.motor.minPower, 1);
      const jd = def.joint || {};
      const pivotLocal = def.joint && def.joint.pivot && jt !== 'fixed' ? lq.inverse().vmult(V(def.joint.pivot).vsub(lp)) : new CANNON.Vec3();
      const p = {
        pivotLocal, angle: 0, lastRaw: 0, ext: 0, target: 0, charge: 1, stroke: jt === 'piston' ? Number(def.joint.stroke) || 0.2 : 0, gear,
        id: def.id, def, spec, bot, index: m.parts.length, shape, mass: spec.mass,
        jointType: jt, axisLocal: lq.inverse().vmult(V(axis).unit()), intact: def.type !== 'core', live: true, lostAt: null,
        wpos: origin.vadd(q0.vmult(lp)), wquat: q0.mult(lq), wvel: new CANNON.Vec3(), wang: new CANNON.Vec3(),
        parent: null, children: [], anchorLocal: new CANNON.Vec3(), body: null, localPos: null, localQuat: null, subMass: 0,
        maxSpeed: cfg.joints.motor.maxSpeed / gear,
        torque: cfg.joints.motor.torque * gear * power,
        limits: (jt === 'hinge' || jt === 'motor') && Array.isArray(jd.limits) ? [(jd.limits[0] * Math.PI) / 180, (jd.limits[1] * Math.PI) / 180] : null,
        spring: (jt === 'hinge' || jt === 'motor') && jd.spring > 0 ? Math.min(jd.spring, cfg.joints.hinge.maxSpring) : 0, springRest: ((Number(jd.rest) || 0) * Math.PI) / 180,
      };
      shape.material = def.material === 'rubber' ? matRubber : matHard;
      shape.partRef = p;
      bot.parts.push(p); bot.byId.set(p.id, p); m.parts.push(p);
      bot.startMass += p.mass;
    });
    for (const p of bot.parts) {
      if (p.def.type === 'core') { bot.core = p; continue; }
      p.parent = bot.byId.get(p.def.parent);
      p.parent.children.push(p);
      if (p.jointType === 'fixed') {
        // Anchor: the point of this part closest to its parent's centre.
        const rel = p.wquat.inverse().vmult(p.parent.wpos.vsub(p.wpos));
        p.anchorLocal.set(clamp(rel.x, -p.spec.half[0], p.spec.half[0]), clamp(rel.y, -p.spec.half[1], p.spec.half[1]), clamp(rel.z, -p.spec.half[2], p.spec.half[2]));
      }
      else p.anchorLocal.copy(p.pivotLocal);
      p.rel0 = p.parent.wquat.inverse().mult(p.wquat);
      p.axisParent = p.rel0.vmult(p.axisLocal);
      const base = cfg.joints[p.jointType].strength;
      // A joint is as strong as the weaker of the two materials, and stronger the thicker the part it holds:
      // a heavy beam makes a heavier joint. The thickness is the part's cross-section across its length.
      const hs = [...p.spec.half].sort((a, b) => a - b), thick = Math.sqrt((4 * hs[0] * hs[1]) / cfg.joints.section);
      p.strength = base * Math.min(p.spec.strength, p.parent.spec.strength) * Math.max(1, Math.min(cfg.joints.maxThick, thick));
    }
    // Parts that overlap (or all but touch) as built never collide with each other.
    bot.clash = new Set();
    const reach = (p) => (p.def.rot ? [0, 1, 2].map(() => Math.max(...p.spec.half)) : p.spec.half);
    for (const p of bot.parts) for (const q of bot.parts) {
      if (p === q) continue;
      const a = reach(p), b = reach(q), dp = p.def.pos || [0, 0, 0], dq = q.def.pos || [0, 0, 0];
      if ([0, 1, 2].every((k) => Math.abs(dp[k] - dq[k]) < a[k] + b[k] + 0.04)) bot.clash.add(p.index * 100000 + q.index);
    }
    m.bots.push(bot);
    assemble(bot);
    if (!check.ok) log('build_error', i, `${bot.name} has build problems: ${check.errors.join(' ')}`);
  });

  function partWorld(p, pos, quat) {
    p.body.quaternion.vmult(p.localPos, pos); pos.vadd(p.body.position, pos);
    if (quat) p.body.quaternion.mult(p.localQuat, quat);
  }

  // Rebuild a bot's rigid bodies from its parts and whichever joints are still intact.
  function assemble(bot) {
    for (const p of bot.parts) {
      if (!p.body) continue;
      const pos = new CANNON.Vec3(), quat = new CANNON.Quaternion();
      partWorld(p, pos, quat);
      const rel = pos.vsub(p.body.position);
      p.wvel = p.body.velocity.vadd(p.body.angularVelocity.cross(rel));
      p.wang = p.body.angularVelocity.clone();
      p.wpos = pos; p.wquat = quat;
    }
    for (const c of bot.constraints) world.removeConstraint(c);
    for (const b of bot.bodies) world.removeBody(b);
    bot.constraints = []; bot.bodies = [];

    // Which parts still reach the core through intact joints?
    for (const p of bot.parts) p.live = false;
    const stack = [bot.core];
    bot.core.live = true;
    while (stack.length) { const p = stack.pop(); for (const c of p.children) if (c.intact) { c.live = true; stack.push(c); } }
    const sub = (p) => { p.subMass = p.mass; for (const c of p.children) if (c.intact) p.subMass += sub(c); return p.subMass; };
    for (const p of bot.parts) if (!p.parent || !p.intact) sub(p);
    bot.liveMass = bot.core.subMass;

    // Group parts joined by intact fixed joints into one rigid body each.
    const root = (p) => { while (p.parent && p.intact && p.jointType === 'fixed') p = p.parent; return p; };
    const groups = new Map();
    for (const p of bot.parts) { const g = root(p); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
    for (const [g, list] of groups) {
      let M = 0; const com = new CANNON.Vec3(), vel = new CANNON.Vec3();
      let heavy = list[0];
      for (const p of list) { M += p.mass; com.vadd(p.wpos.scale(p.mass), com); vel.vadd(p.wvel.scale(p.mass), vel); if (p.mass > heavy.mass) heavy = p; }
      com.scale(1 / M, com); vel.scale(1 / M, vel);
      // No blanket damping: what slows things is contact (friction, rolling resistance) and air. A piece that
      // has broken off may come to rest for good; a live machine never sleeps.
      const body = new CANNON.Body({ mass: M, angularDamping: 0.01, linearDamping: 0, allowSleep: !g.live, sleepSpeedLimit: cfg.ground.restSpeed, sleepTimeLimit: cfg.ground.restSeconds });
      body.position.copy(com); body.quaternion.copy(g.wquat);
      const qi = g.wquat.inverse();
      for (const p of list) {
        p.localPos = qi.vmult(p.wpos.vsub(com)); p.localQuat = qi.mult(p.wquat); p.body = body;
        body.addShape(p.shape, p.localPos, p.localQuat);
      }
      body.dragArea = 0.7 * list.reduce((n, p) => n + faceArea(p.shape), 0);
      body.volume = list.reduce((n, p) => n + (p.spec.volume || 0), 0);
      body.velocity.copy(vel); body.angularVelocity.copy(heavy.wang);
      body.pv = vel.clone(); body.pw = heavy.wang.clone();
      body.live = g.live; body.bot = bot; body.rootPart = g;
      const other = BOT_BIT[1 - bot.index], own = BOT_BIT[bot.index];
      if (g.live) { body.collisionFilterGroup = own; body.collisionFilterMask = GROUND | other | DEBRIS | own; }
      else {
        body.collisionFilterGroup = DEBRIS; body.collisionFilterMask = GROUND | other | DEBRIS;
        body.rejoinAt = Math.max(...list.map((p) => p.lostAt ?? m.t)) + 0.4;
      }
      world.addBody(body); bot.bodies.push(body);
    }
    for (const p of bot.parts) {
      if (!p.parent || !p.intact || p.jointType === 'fixed') continue;
      const A = p.parent.body, B = p.body;
      const axisW = p.wquat.vmult(p.axisLocal);
      const pivW = p.wpos.vadd(p.wquat.vmult(p.pivotLocal));
      if (p.jointType === 'piston') {
        // A lock whose anchor on the parent slides along the axis. Moving the anchor is what pushes the part.
        const c = new CANNON.LockConstraint(A, B, { maxForce: cfg.joints.piston.force * p.gear * dt });
        c.pivotB.copy(B.quaternion.inverse().vmult(pivW.vsub(B.position)));
        p.baseA = A.quaternion.inverse().vmult(pivW.vsub(axisW.scale(p.ext)).vsub(A.position));
        p.axisA = A.quaternion.inverse().vmult(axisW);
        c.pivotA.copy(p.baseA.vadd(p.axisA.scale(p.ext)));
        c.collideConnected = true; c.part = p;
        for (const e of c.equations) e.setSpookParams(1e7, 3, dt);
        world.addConstraint(c); bot.constraints.push(c);
        continue;
      }
      const c = new CANNON.HingeConstraint(A, B, {
        pivotA: A.quaternion.inverse().vmult(pivW.vsub(A.position)), pivotB: B.quaternion.inverse().vmult(pivW.vsub(B.position)),
        axisA: A.quaternion.inverse().vmult(axisW), axisB: B.quaternion.inverse().vmult(axisW), collideConnected: true,
      });
      // A motor with no power still resists being turned, so wheels on a broken-off piece drag instead of freewheeling.
      if (p.jointType === 'motor') { c.enableMotor(); c.setMotorMaxForce(p.torque * dt * (p.live ? 1 : cfg.breakage.deadMotorDrag)); /* the solver limits impulse per step, so torque x dt */ c.setMotorSpeed(0); }
      c.part = p;
      // The library tunes joint stiffness for 60 steps a second unless told the real step.
      for (const e of c.equations) if (e !== c.motorEquation) e.setSpookParams(1e7, 3, dt);
      world.addConstraint(c); bot.constraints.push(c);
    }
  }

  // How far a hinge or motor joint has turned from its built position, in radians, counted
  // continuously (it does not wrap at a half turn). Positive is right-handed about the joint's axis.
  const qP = new CANNON.Quaternion(), qC = new CANNON.Quaternion(), tmpV = new CANNON.Vec3();
  function updateAngle(p) {
    partWorld(p.parent, tmpV, qP); partWorld(p, tmpV, qC);
    const d = qP.inverse().mult(qC).mult(p.rel0.inverse());
    const a = p.axisParent;
    const raw = wrap(2 * Math.atan2(d.x * a.x + d.y * a.y + d.z * a.z, d.w));
    p.angle += wrap(raw - p.lastRaw); p.lastRaw = raw;
  }

  // What a program is told each tick: the whole state of the fight. Positions are in arena coordinates
  // (the centre is 0, 0; y is height above the floor), in metres. Bearings are relative to the bot's own nose.
  function describe(bot, heading, origin) {
    const b = bot.core.body;
    const fwd = b.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const parts = {}, joints = {};
    const pos = new CANNON.Vec3();
    for (const p of bot.parts) {
      partWorld(p, pos);
      parts[p.id] = { type: p.def.type, attached: p.live, x: pos.x, y: pos.y, z: pos.z };
      if (!p.live) continue;
      if (p.jointType === 'motor' || p.jointType === 'hinge') joints[p.id] = { angle: p.angle };
      if (p.jointType === 'piston') joints[p.id] = { extension: p.ext, stroke: p.stroke, charge: p.charge };
    }
    return {
      x: b.position.x, y: b.position.y, z: b.position.z, heading: Math.atan2(fwd.x, fwd.z), upright: up.y,
      vx: b.velocity.x, vy: b.velocity.y, vz: b.velocity.z,
      speed: Math.hypot(b.velocity.x, b.velocity.z), forwardSpeed: b.velocity.x * fwd.x + b.velocity.z * fwd.z,
      turnRate: b.angularVelocity.y, massLeft: bot.liveMass / bot.startMass,
      centerDistance: Math.hypot(b.position.x, b.position.z), edgeDistance: edgeDistance(geo, b.position.x, b.position.z),
      parts, joints,
    };
  }
  function sense(bot) {
    const foe = m.bots[1 - bot.index];
    const self = describe(bot), enemy = describe(foe);
    const rel = (x, z) => ({ bearing: wrap(Math.atan2(x - self.x, z - self.z) - self.heading), distance: Math.hypot(x - self.x, z - self.z) });
    Object.assign(enemy, rel(enemy.x, enemy.z), { height: enemy.y - self.y });
    const loose = [];
    for (const owner of m.bots) for (const body of owner.bodies) {
      if (body.live) continue;
      loose.push({ id: body.rootPart.id, mine: owner === bot, x: body.position.x, y: body.position.y, z: body.position.z, speed: body.velocity.length(), ...rel(body.position.x, body.position.z) });
    }
    loose.sort((a, b) => a.distance - b.distance);
    const tg = targetAt(ch, m.t);
    const side = bot.index === 0 ? -1 : 1;
    return {
      t: m.t, timeLeft: cfg.match.maxSeconds - m.t, self, enemy, loose,
      // The round's conditions, whole, exactly as drawn. Read s.challenge.brief for them in words.
      challenge: geo,
      // The point to hold right now (null when the objective is the crate), and the crate if there is one.
      target: tg && { x: tg.x, z: tg.z, ...rel(tg.x, tg.z) },
      crate: crate && { x: crate.body.position.x, y: crate.body.position.y, z: crate.body.position.z, vx: crate.body.velocity.x, vz: crate.body.velocity.z, ...rel(crate.body.position.x, crate.body.position.z) },
      // Your own end of the arena is at z = homeSide x (far edge). Score is time spent closest, when that is the rule.
      homeSide: side, score: { mine: m.score[bot.index], theirs: m.score[1 - bot.index] },
      arena: { edgeDistance: self.edgeDistance, centerBearing: wrap(Math.atan2(-self.x, -self.z) - self.heading), centerDistance: self.centerDistance },
    };
  }

  function control() {
    for (const bot of m.bots) {
      if (!bot.alive) continue;
      for (const p of bot.parts) if (p.live && p.parent && p.intact && (p.jointType === 'hinge' || p.jointType === 'motor')) updateAngle(p);
      const out = {};
      try { bot.program(sense(bot), out, bot.mem, LIB); bot.out = out; }
      catch (e) { if (!bot.programFailed) { bot.programFailed = true; log('program_error', bot.index, `${bot.name}'s control program threw an error: ${e.message}`); } }
      // A program may say what it is doing: out.say = 'a few words'. It is shown on screen and logged when it changes.
      const say = typeof out.say === 'string' ? out.say.slice(0, 80) : '';
      if (say !== bot.say && m.t - (bot.saidAt ?? -9) >= 0.5) { bot.say = say; bot.saidAt = m.t; if (say) log('intent', bot.index, `${bot.name}: ${say}`); }
      for (const c of bot.constraints) {
        const p = c.part;
        if (p.jointType === 'piston' && p.live) { p.target = clamp(Number(out[p.id]) || 0, 0, 1) * p.stroke; continue; }
        if (p.jointType !== 'motor' || !p.live) continue;
        const v = clamp(Number(out[p.id]) || 0, -1, 1);
        c.setMotorSpeed(-v * p.maxSpeed);
        // Like a real electric motor, torque is highest at a standstill and fades to a tenth at top speed.
        // A spinner's punch comes from the energy stored in the spinning part, not from the motor pushing
        // through the hit. Braking always gets full torque.
        const eq = c.motorEquation;
        const rate = eq.axisA.dot(c.bodyA.angularVelocity) - eq.axisB.dot(c.bodyB.angularVelocity);
        const want = eq.targetVelocity - rate;
        const fade = want * rate > 0 ? 1 - Math.min(0.9, Math.abs(rate) / p.maxSpeed) : 1;
        c.setMotorMaxForce(p.torque * fade * dt);
      }
      // A program may let go of parts on purpose: out.release = ['id', ...].
      if (Array.isArray(out.release)) {
        let any = false;
        for (const id of out.release) {
          const p = bot.byId.get(id);
          if (!p || !p.parent || !p.intact || !p.live) continue;
          p.intact = false; any = true;
          const gone = [];
          const mark = (q) => { gone.push(q.id); q.lostAt = m.t; for (const ch of q.children) if (ch.intact) mark(ch); };
          mark(p);
          log('released', bot.index, `${bot.name} let go of ${gone.join(', ')}.`, { parts: gone });
        }
        if (any) assemble(bot);
      }
    }
  }

  // Hinge stops and springs. Run once per physics step, before the engine moves anything.
  const hAxis = new CANNON.Vec3(), hT = new CANNON.Vec3();
  function driveHinges() {
    const H = cfg.joints.hinge;
    for (const bot of m.bots) for (const p of bot.parts) {
      if (!p.live || !p.intact || !p.parent || (!p.limits && !p.spring)) continue;
      updateAngle(p);
      p.body.quaternion.vmult(p.localQuat.vmult(p.axisLocal), hAxis);
      const A = p.parent.body, B = p.body;
      const rate = hAxis.dot(B.angularVelocity) - hAxis.dot(A.angularVelocity);
      let torque = 0;
      if (p.spring) torque += -p.spring * (p.angle - p.springRest) - 0.04 * p.spring * rate;
      if (p.limits && (p.angle < p.limits[0] || p.angle > p.limits[1])) {
        // A stop has to be hard enough for what hits it: a heavy arm needs a stiffer stop than a light flap, or
        // it swings on through. Stiffness and damping follow the arm's inertia about its pivot.
        if (p.stopBody !== B) {
          const inv = B.invInertiaWorld.vmult(hAxis).dot(hAxis), piv = new CANNON.Vec3(); partWorld(p, piv, qC); piv.vadd(qC.vmult(p.anchorLocal), piv);
          const d = B.position.vsub(piv), off2 = d.lengthSquared() - d.dot(hAxis) ** 2;
          p.stopInertia = (inv > 0 ? 1 / inv : 0) + B.mass * Math.max(0, off2); p.stopBody = B;
        }
        const k = Math.max(H.stopStiffness, p.stopInertia * H.stopRate * H.stopRate), c = Math.max(H.stopDamping, 1.4 * p.stopInertia * H.stopRate);
        if (p.angle < p.limits[0]) torque += k * (p.limits[0] - p.angle) - c * rate;
        else torque += -k * (p.angle - p.limits[1]) - c * rate;
      }
      if (!torque) continue;
      hAxis.scale(torque, hT);
      B.torque.vadd(hT, B.torque); A.torque.vsub(hT, A.torque);
    }
  }

  // Pistons. The joint is a lock whose anchor on the parent slides along the axis; the lock can pull the
  // part toward the anchor with at most the piston's force. Pushing out moves the anchor fast and spends
  // charge. Pulling back is slow and free. If the part is blocked the anchor waits for it.
  const pa = new CANNON.Vec3(), pb = new CANNON.Vec3();
  function drivePistons() {
    const pc = cfg.joints.piston;
    for (const bot of m.bots) for (const c of bot.constraints) {
      const p = c.part;
      if (p.jointType !== 'piston') continue;
      p.charge = Math.min(1, p.charge + dt / pc.rechargeSeconds);
      const A = c.bodyA, B = c.bodyB;
      A.pointToWorldFrame(p.baseA, pa); B.pointToWorldFrame(c.pivotB, pb);
      const actual = pb.vsub(pa).dot(A.quaternion.vmult(p.axisA));
      const target = p.live ? p.target : p.ext;
      if (target > p.ext && p.charge > 0) {
        p.ext = Math.min(target, p.ext + (pc.speed / p.gear) * dt, Math.max(p.ext, actual + pc.lead));
        // Charge is spent as work: the force the joint is carrying times how far the part moved under it.
        // Moving through free air costs almost nothing; a full stroke against full resistance uses it all.
        const axW = A.quaternion.vmult(p.axisA), e = c.equations;
        const force = Math.abs(e[0].multiplier * axW.x + e[1].multiplier * axW.y + e[2].multiplier * axW.z);
        p.charge = Math.max(0, p.charge - (force * Math.max(0, actual - (p.lastActual ?? actual))) / (pc.force * p.gear * p.stroke));
      } else if (target < p.ext) p.ext = Math.max(target, p.ext - pc.retractSpeed * dt);
      p.lastActual = actual;
      c.pivotA.copy(p.baseA.vadd(p.axisA.scale(p.ext)));
    }
  }

  // After each physics step, see whether any hit was hard enough to snap a joint.
  const cp = new CANNON.Vec3(), pp = new CANNON.Vec3(), pq = new CANNON.Quaternion(), hitLog = new Map();
  // Velocity of a contact point as it was just before the step, i.e. before the hit changed it.
  const pointVel = (b, r) => (b.pv ? b.pv.vadd(b.pw.cross(r)) : new CANNON.Vec3());
  const blows = new Map();
  function stress() {
    const breaks = new Map();
    // One log line per hard hit between two parts. The faster part is named as the one doing the hitting.
    const noteHit = (p, q, sp, sq, J, speed) => {
      if (!p || !q || J < cfg.breakage.logImpulse || speed < 1 || (!p.live && !q.live)) return;
      if (p.bot !== q.bot && p.live && q.live) m.lastBlow = m.t;
      const [striker, target] = (sp >= sq ? [p, q] : [q, p]);
      const key = [p.index, q.index].sort().join('-');
      if (m.t - (hitLog.get(key) ?? -9) < 0.4) return;
      hitLog.set(key, m.t);
      const name = (x) => (x.live ? `${x.bot.name}'s ${x.id}` : `a loose ${x.id}`);
      log('hit', target.live ? target.bot.index : striker.bot.index, `${name(striker)} hit ${name(target)} (impulse ${Math.round(J)}, closing at ${Math.round(speed)} m/s).`, { striker: striker.id, target: target.id, impulse: Math.round(J), speed: r2(speed), flash: [striker.index, target.index] });
    };
    const side = (body, shape, r, J, speed, otherShape, n) => {
      const part = shape && shape.partRef;
      if (!part || !part.live || !body.live) return;
      body.position.vadd(r, cp);
      const bot = part.bot;
      const op = otherShape && otherShape.partRef;
      const label = (otherShape && otherShape.label) || 'the floor';
      // The blow as a vector, and the point where it enters the structure. Both change when it passes a pivot.
      let Jv = n.scale(J), at = cp;
      let cur = part, best = null;
      while (cur.parent && cur.intact) {
        partWorld(cur, pp, pq);
        const a = pq.vmult(cur.anchorLocal); pp.vadd(a, pp);
        const lever = Math.min(cfg.breakage.maxLever, pp.distanceTo(at));
        const share = (bot.liveMass - cur.subMass) / bot.liveMass;
        const load = Jv.length() * share * (1 + lever / cfg.breakage.leverLength) * Math.min(cfg.breakage.maxSharp, speed / cfg.breakage.speedRef) * (op ? 1 : cfg.breakage.floorFactor);
        const ratio = load / (cur.strength * cfg.breakage.scale);
        // The joint nearest the blow that cannot take it is the one that goes, so machines lose their outer
        // pieces first and come apart a piece at a time.
        if (ratio > 1) { best = { part: cur, ratio, load }; break; }
        // A part on a hinge or a motor swings when it is struck, and what swings takes up some of the blow
        // itself: only the rest goes through the pivot into whatever carries it. A weight on the end of an arm
        // takes nearly all of a blow on the weight (a hammer does not hurt the hand); a balanced rotor takes
        // none, so a spinner's mounting feels every hit. A motor holds against the swing with its torque.
        if ((cur.jointType === 'motor' || cur.jointType === 'hinge') && cur.body !== cur.parent.body) {
          const B = cur.body, ax = pq.vmult(cur.axisLocal);
          let L = at.vsub(pp).cross(Jv).dot(ax);
          const hold = cur.jointType === 'motor' ? cur.torque * cfg.breakage.window : 0;
          L = Math.sign(L) * Math.max(0, Math.abs(L) - hold);
          // Hard against its stop, it cannot swing any further that way.
          const stopped = cur.limits && ((L > 0 && cur.angle >= cur.limits[1]) || (L < 0 && cur.angle <= cur.limits[0]));
          if (L && !stopped) {
            const d = B.position.vsub(pp), off = d.vsub(ax.scale(d.dot(ax)));
            const inv = B.invInertiaWorld.vmult(ax).dot(ax);
            const I = (inv > 0 ? 1 / inv : 0) + B.mass * off.lengthSquared();
            if (I > 0) Jv = Jv.vsub(ax.cross(off).scale((B.mass * L) / I));
          }
          at = pp.clone();
        }
        cur = cur.parent;
      }
      if (best) { const prev = breaks.get(best.part); if (!prev || prev.ratio < best.ratio) breaks.set(best.part, { ...best, by: op, label }); }
    };
    // A hit lasts several physics steps. Add up the impulse between two parts over the length of the hit (up to
    // a twentieth of a second) and judge the joints on the whole blow at the speed the parts met. Parts that are
    // only resting or pushing on each other meet at no speed, so they load nothing.
    for (const eq of world.contacts) {
      const Jstep = Math.abs(eq.multiplier) * dt;
      if (Jstep < 1) continue;
      const P = eq.si && eq.si.partRef, Q = eq.sj && eq.sj.partRef;
      const key = (P ? P.bot.index + ':' + P.index : 'f' + eq.bi.id) + '|' + (Q ? Q.bot.index + ':' + Q.index : 'f' + eq.bj.id);
      const vi = pointVel(eq.bi, eq.ri), vj = pointVel(eq.bj, eq.rj);
      const closing = Math.abs(vi.vsub(vj).dot(eq.ni));
      let blow = blows.get(key);
      if (!blow || m.t - blow.last > 0.02 || m.t - blow.t0 > cfg.breakage.window) { blow = { J: 0, speed: 0, t0: m.t, last: m.t }; blows.set(key, blow); }
      blow.J += Jstep; blow.speed = Math.max(blow.speed, closing); blow.last = m.t;
      const J = blow.J, speed = blow.speed;
      if (J < 20) continue;
      noteHit(P, Q, vi.length(), vj.length(), J, speed);
      side(eq.bi, eq.si, eq.ri, J, speed, eq.sj, eq.ni.scale(-1));
      side(eq.bj, eq.sj, eq.rj, J, speed, eq.si, eq.ni);
    }
    if (blows.size > 4000) for (const [k, b] of blows) if (m.t - b.last > 0.1) blows.delete(k);
    if (!breaks.size) return;
    const dirty = new Set();
    for (const [part, info] of breaks) {
      if (!part.intact) continue;
      part.intact = false;
      part.bot.brokenMass = (part.bot.brokenMass || 0) + part.subMass;
      const lost = [];
      const mark = (p) => { lost.push(p.id); p.lostAt = m.t; for (const c of p.children) if (c.intact) mark(c); };
      mark(part);
      const cause = info.by ? (info.by.bot === part.bot ? 'its own parts' : info.by.live ? `${info.by.bot.name}'s ${info.by.id}` : `loose ${info.by.id}`) : info.label;
      log('part_lost', part.bot.index, `${part.bot.name} lost ${lost.join(', ')}: the ${part.jointType} joint on ${part.id} took a load of ${Math.round(info.load)} from ${cause}, above its limit of ${Math.round(part.strength * cfg.breakage.scale)}.`, { parts: lost, load: Math.round(info.load) });
      dirty.add(part.bot);
    }
    for (const bot of dirty) assemble(bot);
  }

  function record() {
    const f = new Float32Array(m.parts.length * 7), flags = new Uint8Array(m.parts.length);
    const pos = new CANNON.Vec3(), q = new CANNON.Quaternion();
    m.parts.forEach((p, i) => { partWorld(p, pos, q); f.set([pos.x, pos.y, pos.z, q.x, q.y, q.z, q.w], i * 7); flags[i] = p.live ? 0 : 1; });
    m.frames.push(f); m.frameFlags.push(flags); m.frameTimes.push(m.t); m.frameSay.push(m.bots.map((b) => b.say || ''));
    const pf = new Float32Array(props.length * 7);
    props.forEach((pr, i) => { const b = pr.body; pf.set([b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * 7); });
    m.propFrames.push(pf);
  }

  function observe() {
    for (const bot of m.bots) {
      const b = bot.core.body;
      const up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;
      if (!bot.flipped && up < -0.3) { bot.flipped = true; log('flipped', bot.index, `${bot.name} is upside down.`); }
      else if (bot.flipped && up > 0.5) { bot.flipped = false; log('righted', bot.index, `${bot.name} is the right way up again.`); }
      const high = b.position.y - floorHeight(geo, b.position.x, b.position.z) > bot.restHeight + 0.5;
      if (high && !bot.airborne && b.position.y > 0) log('airborne', bot.index, `${bot.name} was thrown into the air.`);
      bot.airborne = high;
    }
  }

  function sampleTrack() {
    const row = { t: r2(m.t) };
    m.bots.forEach((bot) => {
      const b = bot.core.body;
      const fwd = b.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      row[bot.index] = { x: r2(b.position.x), y: r2(b.position.y), z: r2(b.position.z), heading: r2(Math.atan2(fwd.x, fwd.z)), upright: r2(up.y), speed: r2(Math.hypot(b.velocity.x, b.velocity.z)) };
      bot.history.push([m.t, b.position.x, b.position.y, b.position.z]);
    });
    m.track.push(row);
  }

  function judge() {
    const out = m.bots.map((bot) => bot.core.body.position.y < -cfg.arena.ringOutDepth);
    const still = m.bots.map((bot) => {
      if (m.t < cfg.match.graceSeconds + cfg.match.stalemateSeconds) return false;
      const h = bot.history, now = h[h.length - 1];
      let reach = 0;
      for (let i = h.length - 1; i >= 0 && now[0] - h[i][0] <= cfg.match.stalemateSeconds; i--) reach = Math.max(reach, Math.hypot(h[i][1] - now[1], h[i][2] - now[2], h[i][3] - now[3]));
      return reach < cfg.match.stalemateRadius;
    });
    const end = (winner, reason, text) => { m.done = true; m.result = { winner, reason, t: r2(m.t), text }; log('end', winner, text); };
    const n = m.bots.map((b) => b.name);
    if (out[0] || out[1]) {
      if (out[0] && out[1]) return end(null, 'double_ring_out', 'Both bots left the arena. Draw.');
      const w = out[0] ? 1 : 0;
      return end(w, 'ring_out', `${n[1 - w]} fell out of the arena. ${n[w]} wins by ring-out.`);
    }
    // Destroyed: more than the set share of a machine, by mass, has been broken off its core.
    const whole = m.bots.map((b) => 1 - (b.brokenMass || 0) / b.startMass), pct = (i) => Math.round(whole[i] * 100);
    const wrecked = whole.map((v) => v < 1 - cfg.match.wreckShare);
    if (wrecked[0] || wrecked[1]) {
      if (wrecked[0] && wrecked[1]) return end(null, 'double_wreck', 'Both machines were broken apart. Draw.');
      const w = wrecked[0] ? 1 : 0;
      return end(w, 'destroyed', `${n[1 - w]} was broken apart: only ${pct(1 - w)}% of it is still attached to its core. ${n[w]} wins.`);
    }
    // Standing still is not a stalemate while one machine is still landing blows on the other.
    const over = m.t >= cfg.match.maxSeconds, settled = still[0] && still[1] && m.t - (m.lastBlow ?? -99) > cfg.match.stalemateSeconds;
    if (!(settled || over)) return;
    // Nobody was destroyed or put out. The machine that is more intact wins, if the difference is clear.
    const why = settled ? `Neither machine has moved or landed a blow for ${cfg.match.stalemateSeconds} seconds.` : 'Time ran out.';
    const kind = settled ? 'settled' : 'time';
    if (Math.abs(whole[0] - whole[1]) < cfg.match.intactMargin) return end(null, kind + '_draw', `${why} Neither machine was destroyed or put out, and they are about equally intact. Draw.`);
    const w = whole[0] > whole[1] ? 0 : 1;
    return end(w, kind + '_damage', `${why} ${n[w]} wins on damage: ${pct(w)}% of it is still attached against ${pct(1 - w)}%.`);
  }

  m.bots.forEach((bot) => { bot.restHeight = bot.core.body.position.y; });
  log('start', null, `${m.bots[0].name} against ${m.bots[1].name}, seed ${seed}.${ch === OPEN ? '' : ' ' + ch.brief}`);
  m.bots.forEach((bot, i) => { const len = String(bot.program).length; if (len > cfg.program.maxChars) { bot.program = () => {}; log('program_error', i, `${bot.name}'s control program is ${len} characters, over the limit of ${cfg.program.maxChars}. It will not run.`); } });
  record(); sampleTrack();

  m.step = () => {
    if (m.done) return;
    if (m.steps % stepsPerControl === 0) control();
    for (const bot of m.bots) for (const b of bot.bodies) { b.pv.copy(b.velocity); b.pw.copy(b.angularVelocity); }
    for (const pr of props) { pr.body.pv.copy(pr.body.velocity); pr.body.pw.copy(pr.body.angularVelocity); }
    drivePistons();
    driveHinges();
    world.step(dt); notePressure(); groundAndAir();
    m.steps++; m.t = m.steps * dt;
    stress();
    // A broken-off part ignores the bot it came from until the two are clear of each other,
    // so nothing gets flung by starting out overlapped.
    if (m.steps % stepsPerControl === 0) for (const bot of m.bots) for (const b of bot.bodies) {
      if (b.live || !b.rejoinAt || m.t < b.rejoinAt) continue;
      b.updateAABB();
      const clear = bot.bodies.every((o) => { if (!o.live) return true; o.updateAABB(); return !b.aabb.overlaps(o.aabb); });
      if (clear) { b.collisionFilterMask |= BOT_BIT[bot.index]; b.rejoinAt = null; }
    }
    if (m.steps % stepsPerControl === 0) { record(); observe(); }
    if (m.steps % Math.round(cfg.physics.hz / 5) === 0) { sampleTrack(); judge(); }
  };
  m.run = () => { while (!m.done) m.step(); return m; };
  m.summary = () => ({
    seed, challenge: ch === OPEN ? ch.name : ch.brief, result: m.result,
    bots: m.bots.map((b) => ({ name: b.name, massLeft: r2(b.liveMass / b.startMass), partsLost: b.parts.filter((p) => !p.live).map((p) => p.id), hitsTaken: m.events.filter((e) => e.type === 'hit' && e.bot === b.index).length })),
  });
  return m;
}
