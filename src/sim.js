import * as CANNON from 'cannon-es';

// ───────────────────────────────────────────────────────────────────────────
// SETTINGS. Every number we expect to tune lives here.
// Lengths are metres, masses kg, impulses N·s, angles in builds are degrees.
// A bot's frame: +z is forward, +y is up, +x is its left side.
// ───────────────────────────────────────────────────────────────────────────
export const CONFIG = {
  version: 'v0.1',
  physics: { hz: 240, controlHz: 30, gravity: 9.81, solverIterations: 12 },
  arena: { size: 14, thickness: 1, grip: 1.0, slide: 0.3, ringOutDepth: 1.2 },
  match: { maxSeconds: 60, countOutSeconds: 8, countOutRadius: 0.35, graceSeconds: 3 },
  budget: { mass: 150, cost: 100, box: [3, 2, 3], maxParts: 24 },
  // A joint's load = impulse x share of the bot it has to drag along x leverage x sharpness.
  // Sharpness: a hit at speedRef m/s counts 1.5x, faster hits count for more.
  breakage: { scale: 1, leverLength: 1.0, speedRef: 8, logImpulse: 45 },
  materials: {
    steel: { density: 780, strength: 1.5, costPerVolume: 70 },
    aluminium: { density: 270, strength: 1.0, costPerVolume: 90 },
    plastic: { density: 120, strength: 0.55, costPerVolume: 35 },
  },
  joints: {
    fixed: { strength: 500, cost: 0 },
    hinge: { strength: 500, cost: 2 },
    // A motor joint may set "gear": n. Speed is divided by n and torque multiplied by n (0.5 to 8).
    // Hinge and motor joints may set "pivot": [x, y, z] in the bot frame; without it they turn about the part's centre.
    motor: { strength: 1500, cost: 8, maxSpeed: 40, torque: 120, minGear: 0.5, maxGear: 8 },
  },
  parts: {
    core: { size: [0.4, 0.4, 0.4], mass: 20, cost: 0 },
    beam: { maxSize: [0.3, 0.3, 2.4] },
    plate: { maxSize: [2.0, 0.15, 2.0] },
    block: { maxSize: [0.6, 0.6, 0.6] },
    wedge: { maxSize: [2.0, 0.6, 1.0] },
    disc: { maxRadius: 0.6, maxThickness: 0.2 },
    ball: { maxRadius: 0.3 },
    // Shortcut: a wheel with its motor built in. Axle runs along the part's x axis.
    drive: { radius: 0.3, width: 0.24, mass: 6, cost: 9, maxSpeed: 12, torque: 60, strength: 320 },
  },
};

const V = (a) => new CANNON.Vec3(a[0], a[1], a[2]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const r2 = (v) => Math.round(v * 100) / 100;
const BOX_TYPES = ['beam', 'plate', 'block'];

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
  if (t === 'drive') {
    const d = cfg.parts.drive;
    return { kind: 'wheel', radius: d.radius, width: d.width, half: [d.width / 2, d.radius, d.radius], volume: 0, mass: d.mass, cost: d.cost, strength: 1 };
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
  if (spec.kind === 'wheel') return new CANNON.Sphere(spec.radius);
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
    if (p.type !== 'core' && p.type !== 'drive' && !cfg.materials[p.material]) {
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
      const jt = p.type === 'drive' ? 'motor' : (p.joint && p.joint.type) || 'fixed';
      if (!cfg.joints[jt]) errors.push(`${where}: unknown joint type "${jt}". Use fixed, hinge or motor.`);
      if (p.type !== 'drive' && (jt === 'hinge' || jt === 'motor')) {
        const ax = p.joint.axis;
        if (!Array.isArray(ax) || ax.length !== 3 || Math.hypot(...ax) < 1e-6) errors.push(`${where}: a ${jt} joint needs an "axis" such as [0, 1, 0].`);
        const pv = p.joint.pivot;
        if (pv !== undefined && (!Array.isArray(pv) || pv.length !== 3 || pv.some((x) => typeof x !== 'number'))) errors.push(`${where}: "pivot" must be three numbers [x, y, z] measured from the core.`);
        const g = p.joint.gear;
        if (g !== undefined && !(g >= cfg.joints.motor.minGear && g <= cfg.joints.motor.maxGear)) errors.push(`${where}: "gear" must be between ${cfg.joints.motor.minGear} and ${cfg.joints.motor.maxGear}.`);
      }
      const b = cfg.budget.box;
      if (Math.abs(p.pos[0]) > b[0] / 2 || Math.abs(p.pos[1]) > b[1] / 2 || Math.abs(p.pos[2]) > b[2] / 2) errors.push(`${where}: its centre is outside the build box of ${JSON.stringify(b)} around the core.`);
    }
    try { const s = partSpec(p, cfg); mass += s.mass; cost += s.cost + (p.type === 'core' || p.type === 'drive' ? 0 : cfg.joints[(p.joint && p.joint.type) || 'fixed']?.cost || 0); } catch (e) { /* reported above */ }
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
  if (!build.parts.some((p) => p.type === 'drive' || (p.joint && p.joint.type === 'motor'))) warnings.push('Nothing in this build is powered, so it cannot move.');
  return { ok: errors.length === 0, errors, warnings, mass: r2(mass), cost: r2(cost) };
}

// ── Match ──────────────────────────────────────────────────────────────────
const GROUND = 1, DEBRIS = 8;
const BOT_BIT = [2, 4];

export function createMatch({ builds, programs, seed = 1, config = CONFIG }) {
  const cfg = config;
  const dt = 1 / cfg.physics.hz;
  const stepsPerControl = Math.round(cfg.physics.hz / cfg.physics.controlHz);
  const rng = mulberry32(seed);
  const world = new CANNON.World();
  world.gravity.set(0, -cfg.physics.gravity, 0);
  world.solver.iterations = cfg.physics.solverIterations;
  world.allowSleep = false;
  world.defaultContactMaterial.friction = cfg.arena.slide;
  world.defaultContactMaterial.restitution = 0.15;

  const matFloor = new CANNON.Material('floor');
  const matRubber = new CANNON.Material('rubber');
  const matHard = new CANNON.Material('hard');
  world.addContactMaterial(new CANNON.ContactMaterial(matFloor, matRubber, { friction: cfg.arena.grip, restitution: 0.05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matFloor, matHard, { friction: cfg.arena.slide, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matHard, matHard, { friction: 0.3, restitution: 0.2 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matRubber, matHard, { friction: 0.6, restitution: 0.1 }));

  const half = cfg.arena.size / 2;
  const floor = new CANNON.Body({ mass: 0, material: matFloor, collisionFilterGroup: GROUND, collisionFilterMask: -1 });
  floor.addShape(new CANNON.Box(new CANNON.Vec3(half, cfg.arena.thickness / 2, half)));
  floor.position.set(0, -cfg.arena.thickness / 2, 0);
  world.addBody(floor);

  const m = {
    config: cfg, seed, t: 0, steps: 0, done: false, result: null,
    events: [], track: [], frames: [], frameFlags: [], frameTimes: [],
    bots: [], parts: [], world,
  };
  const log = (type, bot, text, data = {}) => m.events.push({ t: r2(m.t), type, bot, text, ...data });

  // Spawn: opposite ends, roughly facing each other, with a little seeded variation.
  const spawns = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const x = (rng() - 0.5) * 3, z = side * (half - 3.5);
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
    const origin = new CANNON.Vec3(sp.x, -lowest + 0.02, sp.z);
    build.parts.forEach((def, k) => {
      const spec = specs[k];
      const lq = new CANNON.Quaternion();
      if (def.rot) lq.setFromEuler((def.rot[0] * Math.PI) / 180, (def.rot[1] * Math.PI) / 180, (def.rot[2] * Math.PI) / 180, 'XYZ');
      const lp = def.pos ? V(def.pos) : new CANNON.Vec3();
      const jt = def.type === 'core' ? null : def.type === 'drive' ? 'motor' : (def.joint && def.joint.type) || 'fixed';
      const axis = def.type === 'drive' ? [1, 0, 0] : (def.joint && def.joint.axis) || [0, 1, 0];
      const shape = makeShape(spec);
      const gear = def.type === 'drive' ? 1 : clamp(Number(def.joint && def.joint.gear) || 1, cfg.joints.motor.minGear, cfg.joints.motor.maxGear);
      const pivotLocal = def.joint && def.joint.pivot && jt !== 'fixed' ? lq.inverse().vmult(V(def.joint.pivot).vsub(lp)) : new CANNON.Vec3();
      const p = {
        pivotLocal, angle: 0, lastRaw: 0,
        id: def.id, def, spec, bot, index: m.parts.length, shape, mass: spec.mass,
        jointType: jt, axisLocal: V(axis).unit(), intact: def.type !== 'core', live: true, lostAt: null,
        wpos: origin.vadd(q0.vmult(lp)), wquat: q0.mult(lq), wvel: new CANNON.Vec3(), wang: new CANNON.Vec3(),
        parent: null, children: [], anchorLocal: new CANNON.Vec3(), body: null, localPos: null, localQuat: null, subMass: 0,
        maxSpeed: def.type === 'drive' ? cfg.parts.drive.maxSpeed : cfg.joints.motor.maxSpeed / gear,
        torque: def.type === 'drive' ? cfg.parts.drive.torque : cfg.joints.motor.torque * gear,
      };
      shape.material = def.type === 'drive' ? matRubber : matHard;
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
      const base = p.def.type === 'drive' ? cfg.parts.drive.strength : cfg.joints[p.jointType].strength;
      p.strength = base * Math.min(p.spec.strength, p.parent.spec.strength);
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
      const body = new CANNON.Body({ mass: M, angularDamping: 0.02, linearDamping: 0.01 });
      body.position.copy(com); body.quaternion.copy(g.wquat);
      const qi = g.wquat.inverse();
      for (const p of list) {
        p.localPos = qi.vmult(p.wpos.vsub(com)); p.localQuat = qi.mult(p.wquat); p.body = body;
        body.addShape(p.shape, p.localPos, p.localQuat);
      }
      body.velocity.copy(vel); body.angularVelocity.copy(heavy.wang);
      body.pv = vel.clone(); body.pw = heavy.wang.clone();
      body.live = g.live; body.bot = bot; body.rootPart = g;
      const other = BOT_BIT[1 - bot.index], own = BOT_BIT[bot.index];
      if (g.live) { body.collisionFilterGroup = own; body.collisionFilterMask = GROUND | other | DEBRIS; }
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
      const c = new CANNON.HingeConstraint(A, B, {
        pivotA: A.quaternion.inverse().vmult(pivW.vsub(A.position)), pivotB: B.quaternion.inverse().vmult(pivW.vsub(B.position)),
        axisA: A.quaternion.inverse().vmult(axisW), axisB: B.quaternion.inverse().vmult(axisW), collideConnected: false,
      });
      if (p.jointType === 'motor' && p.live) { c.enableMotor(); c.setMotorMaxForce(p.torque * dt); /* the solver limits impulse per step, so torque x dt */ c.setMotorSpeed(0); }
      c.part = p;
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

  function sense(bot) {
    const foe = m.bots[1 - bot.index];
    const b = bot.core.body, f = foe.core.body;
    const fwd = b.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const heading = Math.atan2(fwd.x, fwd.z);
    const dx = f.position.x - b.position.x, dz = f.position.z - b.position.z;
    const fup = f.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const parts = {}, joints = {};
    for (const p of bot.parts) {
      parts[p.id] = p.live;
      if (p.live && p.def.type !== 'drive' && (p.jointType === 'motor' || p.jointType === 'hinge')) joints[p.id] = { angle: p.angle };
    }
    return {
      t: m.t,
      self: {
        x: b.position.x, y: b.position.y, z: b.position.z, heading, upright: up.y,
        speed: Math.hypot(b.velocity.x, b.velocity.z), forwardSpeed: b.velocity.x * fwd.x + b.velocity.z * fwd.z,
        turnRate: b.angularVelocity.y, massLeft: bot.liveMass / bot.startMass, parts, joints,
      },
      enemy: { bearing: wrap(Math.atan2(dx, dz) - heading), distance: Math.hypot(dx, dz), height: f.position.y - b.position.y, upright: fup.y, massLeft: foe.liveMass / foe.startMass },
      arena: {
        halfSize: half, edgeDistance: half - Math.max(Math.abs(b.position.x), Math.abs(b.position.z)),
        centerBearing: wrap(Math.atan2(-b.position.x, -b.position.z) - heading), centerDistance: Math.hypot(b.position.x, b.position.z),
      },
    };
  }

  function control() {
    for (const bot of m.bots) {
      if (!bot.alive) continue;
      for (const p of bot.parts) if (p.live && p.parent && p.intact && p.def.type !== 'drive' && p.jointType !== 'fixed') updateAngle(p);
      const out = {};
      try { bot.program(sense(bot), out, bot.mem); bot.out = out; }
      catch (e) { if (!bot.programFailed) { bot.programFailed = true; log('program_error', bot.index, `${bot.name}'s control program threw an error: ${e.message}`); } }
      for (const c of bot.constraints) {
        const p = c.part;
        if (p.jointType !== 'motor' || !p.live) continue;
        const v = clamp(Number(out[p.id]) || 0, -1, 1);
        c.setMotorSpeed(-v * p.maxSpeed);
      }
    }
  }

  // After each physics step, see whether any hit was hard enough to snap a joint.
  const cp = new CANNON.Vec3(), pp = new CANNON.Vec3(), hitLog = new Map();
  // Velocity of a contact point as it was just before the step, i.e. before the hit changed it.
  const pointVel = (b, r) => (b.pv ? b.pv.vadd(b.pw.cross(r)) : new CANNON.Vec3());
  function stress() {
    const breaks = new Map();
    // One log line per hard hit between two parts. The faster part is named as the one doing the hitting.
    const noteHit = (p, q, sp, sq, J, speed) => {
      if (!p || !q || J < cfg.breakage.logImpulse || (!p.live && !q.live)) return;
      const [striker, target] = (sp >= sq ? [p, q] : [q, p]);
      const key = [p.index, q.index].sort().join('-');
      if (m.t - (hitLog.get(key) ?? -9) < 0.4) return;
      hitLog.set(key, m.t);
      const name = (x) => (x.live ? `${x.bot.name}'s ${x.id}` : `a loose ${x.id}`);
      log('hit', target.live ? target.bot.index : striker.bot.index, `${name(striker)} hit ${name(target)} (impulse ${Math.round(J)}, closing at ${Math.round(speed)} m/s).`, { striker: striker.id, target: target.id, impulse: Math.round(J), speed: r2(speed) });
    };
    const side = (body, shape, r, J, speed, otherShape) => {
      const part = shape && shape.partRef;
      if (!part || !part.live || !body.live) return;
      body.position.vadd(r, cp);
      const bot = part.bot;
      const op = otherShape && otherShape.partRef;
      let cur = part, best = null;
      while (cur.parent && cur.intact) {
        partWorld(cur, pp);
        const a = cur.body.quaternion.vmult(cur.localQuat.vmult(cur.anchorLocal)); pp.vadd(a, pp);
        const lever = pp.distanceTo(cp);
        const share = (bot.liveMass - cur.subMass) / bot.liveMass;
        const load = J * share * (1 + lever / cfg.breakage.leverLength) * (0.5 + speed / cfg.breakage.speedRef);
        const ratio = load / (cur.strength * cfg.breakage.scale);
        if (ratio > 1 && (!best || ratio > best.ratio)) best = { part: cur, ratio, load };
        cur = cur.parent;
      }
      if (best) { const prev = breaks.get(best.part); if (!prev || prev.ratio < best.ratio) breaks.set(best.part, { ...best, by: op }); }
    };
    for (const eq of world.contacts) {
      const J = Math.abs(eq.multiplier) * dt;
      if (J < 20) continue;
      const vi = pointVel(eq.bi, eq.ri), vj = pointVel(eq.bj, eq.rj);
      const speed = Math.abs(vi.vsub(vj).dot(eq.ni));
      noteHit(eq.si && eq.si.partRef, eq.sj && eq.sj.partRef, vi.length(), vj.length(), J, speed);
      side(eq.bi, eq.si, eq.ri, J, speed, eq.sj);
      side(eq.bj, eq.sj, eq.rj, J, speed, eq.si);
    }
    if (!breaks.size) return;
    const dirty = new Set();
    for (const [part, info] of breaks) {
      if (!part.intact) continue;
      part.intact = false;
      const lost = [];
      const mark = (p) => { lost.push(p.id); p.lostAt = m.t; for (const c of p.children) if (c.intact) mark(c); };
      mark(part);
      const cause = info.by ? (info.by.bot === part.bot ? 'its own parts' : info.by.live ? `${info.by.bot.name}'s ${info.by.id}` : `loose ${info.by.id}`) : 'the floor';
      log('part_lost', part.bot.index, `${part.bot.name} lost ${lost.join(', ')}: the ${part.jointType} joint on ${part.id} took a load of ${Math.round(info.load)} from ${cause}, above its limit of ${Math.round(part.strength * cfg.breakage.scale)}.`, { parts: lost, load: Math.round(info.load) });
      dirty.add(part.bot);
    }
    for (const bot of dirty) assemble(bot);
  }

  function record() {
    const f = new Float32Array(m.parts.length * 7), flags = new Uint8Array(m.parts.length);
    const pos = new CANNON.Vec3(), q = new CANNON.Quaternion();
    m.parts.forEach((p, i) => { partWorld(p, pos, q); f.set([pos.x, pos.y, pos.z, q.x, q.y, q.z, q.w], i * 7); flags[i] = p.live ? 0 : 1; });
    m.frames.push(f); m.frameFlags.push(flags); m.frameTimes.push(m.t);
  }

  function observe() {
    for (const bot of m.bots) {
      const b = bot.core.body;
      const up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;
      if (!bot.flipped && up < -0.3) { bot.flipped = true; log('flipped', bot.index, `${bot.name} is upside down.`); }
      else if (bot.flipped && up > 0.5) { bot.flipped = false; log('righted', bot.index, `${bot.name} is back on its wheels.`); }
      const high = b.position.y > bot.restHeight + 0.5;
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
    const stuck = m.bots.map((bot) => {
      if (m.t < cfg.match.graceSeconds + cfg.match.countOutSeconds) return false;
      const h = bot.history, now = h[h.length - 1];
      let reach = 0;
      for (let i = h.length - 1; i >= 0 && now[0] - h[i][0] <= cfg.match.countOutSeconds; i--) reach = Math.max(reach, Math.hypot(h[i][1] - now[1], h[i][2] - now[2], h[i][3] - now[3]));
      if (!bot.warned && reach < cfg.match.countOutRadius && m.t > cfg.match.graceSeconds + cfg.match.countOutSeconds * 0.5) { /* placeholder for a future warning event */ }
      return reach < cfg.match.countOutRadius;
    });
    const end = (winner, reason, text) => { m.done = true; m.result = { winner, reason, t: r2(m.t), text }; log('end', winner, text); };
    const n = m.bots.map((b) => b.name);
    if (out[0] || out[1]) {
      if (out[0] && out[1]) return end(null, 'double_ring_out', 'Both bots left the arena. Draw.');
      const w = out[0] ? 1 : 0;
      return end(w, 'ring_out', `${n[1 - w]} fell out of the arena. ${n[w]} wins by ring-out.`);
    }
    if (stuck[0] || stuck[1]) {
      if (stuck[0] && stuck[1]) return end(null, 'both_stuck', `Neither bot moved for ${cfg.match.countOutSeconds} seconds. Draw.`);
      const w = stuck[0] ? 1 : 0;
      return end(w, 'count_out', `${n[1 - w]} did not move for ${cfg.match.countOutSeconds} seconds and was counted out. ${n[w]} wins.`);
    }
    if (m.t >= cfg.match.maxSeconds) {
      const left = m.bots.map((b) => b.liveMass / b.startMass);
      if (Math.abs(left[0] - left[1]) < 0.02) return end(null, 'time_draw', 'Time ran out with both bots about equally intact. Draw.');
      const w = left[0] > left[1] ? 0 : 1;
      return end(w, 'time_decision', `Time ran out. ${n[w]} wins on condition, with ${Math.round(left[w] * 100)}% of its mass still attached against ${Math.round(left[1 - w] * 100)}%.`);
    }
  }

  m.bots.forEach((bot) => { bot.restHeight = bot.core.body.position.y; });
  log('start', null, `${m.bots[0].name} against ${m.bots[1].name}, seed ${seed}.`);
  record(); sampleTrack();

  m.step = () => {
    if (m.done) return;
    if (m.steps % stepsPerControl === 0) control();
    for (const bot of m.bots) for (const b of bot.bodies) { b.pv.copy(b.velocity); b.pw.copy(b.angularVelocity); }
    world.step(dt);
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
    seed, result: m.result,
    bots: m.bots.map((b) => ({ name: b.name, massLeft: r2(b.liveMass / b.startMass), partsLost: b.parts.filter((p) => !p.live).map((p) => p.id), hitsTaken: m.events.filter((e) => e.type === 'hit' && e.bot === b.index).length })),
  });
  return m;
}
