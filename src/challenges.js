// ───────────────────────────────────────────────────────────────────────────
// CHALLENGES. A challenge is the conditions of one round: the floor, the surface, gravity and the
// objective. The kit and the physics stay fixed; the challenge is what changes from round to round.
// A challenge is plain data, and a bot's program receives it whole as s.challenge.
//
//   floor      slabs with their top at height 0: { x, z, w, d } (centre, width along x, depth along z)
//   walls      solid blocks standing on the floor: { x, z, w, d, h }
//   surface    multipliers on floor friction: grip (rubber and wheels) and slide (everything else)
//   gravity    multiplier on normal gravity
//   spawn      where each bot's core starts; bot 0's home end is -z, bot 1's is +z
//   objective  { type: 'hold', scoring, path } or { type: 'deliver', crate }
//
// A core that falls off the floor always loses. Otherwise:
//   hold, scoring 'final'    the core closer to the point when the round ends wins
//   hold, scoring 'time'     five times a second the closer core scores; most time closest wins
//   deliver                  the crate ends the round nearer your home end than the other bot's
// ───────────────────────────────────────────────────────────────────────────
const chRng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const chRound = (v) => Math.round(v * 100) / 100;

export const OPEN = {
  name: 'Open floor',
  brief: 'A plain square platform. Hold the centre.',
  floor: [{ x: 0, z: 0, w: 14, d: 14 }],
  walls: [],
  surface: { grip: 1, slide: 1 },
  gravity: 1,
  spawn: [{ x: 0, z: -3.5 }, { x: 0, z: 3.5 }],
  objective: { type: 'hold', scoring: 'final', path: { kind: 'fixed', x: 0, z: 0 } },
};

const LAYOUTS = {
  open: (r) => { const s = 12 + Math.round(r() * 8) / 2; return { text: `a ${s} m square platform`, floor: [{ x: 0, z: 0, w: s, d: s }], walls: [], spawnZ: s / 2 - 3.5, reach: s / 2 - 2.5 }; },
  small: (r) => { const s = 7 + Math.round(r() * 4) / 2; return { text: `a small ${s} m square platform`, floor: [{ x: 0, z: 0, w: s, d: s }], walls: [], spawnZ: s / 2 - 1.8, reach: s / 2 - 1.8 }; },
  bridge: (r) => {
    const w = chRound(2.6 + r() * 1.4), len = chRound(3 + r() * 2), isl = 6;
    const z = len / 2 + isl / 2;
    return { text: `two platforms joined by a bridge ${w} m wide and ${len} m long`, floor: [{ x: 0, z: -z, w: 10, d: isl }, { x: 0, z, w: 10, d: isl }, { x: 0, z: 0, w, d: len }], walls: [], spawnZ: z, reach: Math.min(w / 2 - 0.6, 1.2), narrow: true };
  },
  gap: (r) => {
    const g = chRound(0.5 + r() * 0.5), isl = 7;
    const z = g / 2 + isl / 2;
    return { text: `two platforms separated by a ${g} m gap`, floor: [{ x: 0, z: -z, w: 12, d: isl }, { x: 0, z, w: 12, d: isl }], walls: [], spawnZ: z + 0.5, reach: 0, split: true };
  },
  pillars: (r) => {
    const s = 14, walls = [];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + r() * 0.8, d = 2.2 + r() * 2; walls.push({ x: chRound(Math.cos(a) * d), z: chRound(Math.sin(a) * d * 0.6), w: chRound(0.6 + r() * 0.8), d: chRound(0.6 + r() * 0.8), h: 1 }); }
    return { text: 'a square platform with four solid pillars', floor: [{ x: 0, z: 0, w: s, d: s }], walls, spawnZ: 4.5, reach: 4 };
  },
};
const SURFACES = {
  normal: { text: '', grip: 1, slide: 1 },
  ice: { text: 'The floor is ice: wheels and rubber have a quarter of their usual grip.', grip: 0.25, slide: 0.2 },
  sticky: { text: 'The floor is sticky: everything grips, including bare metal.', grip: 1.3, slide: 3 },
};
const GRAVITIES = {
  normal: { text: '', g: 1 },
  low: { text: 'Gravity is a third of normal.', g: 0.33 },
  high: { text: 'Gravity is half again as strong as normal.', g: 1.5 },
};

// Draw one challenge from the family. The same seed always gives the same challenge.
export function drawChallenge(seed, force = {}) {
  const r = chRng(seed * 7919 + 13);
  const pick = (obj, weights) => { const keys = Object.keys(weights); let t = r() * keys.reduce((n, k) => n + weights[k], 0); for (const k of keys) { t -= weights[k]; if (t <= 0) return k; } return keys[0]; };
  const layoutKey = force.layout || pick(LAYOUTS, { open: 3, small: 2, bridge: 2, gap: 1.5, pillars: 2 });
  const surfaceKey = force.surface || pick(SURFACES, { normal: 3, ice: 2, sticky: 1 });
  const gravityKey = force.gravity || pick(GRAVITIES, { normal: 3, low: 1.5, high: 1 });
  let objKey = force.objective || pick({}, { fixed: 2, orbit: 2, jump: 2, deliver: 2 });
  const L = LAYOUTS[layoutKey](r), S = SURFACES[surfaceKey], G = GRAVITIES[gravityKey];
  if (L.split && objKey !== 'fixed') objKey = 'fixed';
  if (L.narrow && objKey === 'orbit') objKey = 'jump';
  let objective, text;
  if (objKey === 'fixed') {
    objective = { type: 'hold', scoring: 'final', path: { kind: 'fixed', x: 0, z: 0 } };
    text = L.split ? 'The point to hold is in the middle of the gap. The core closer to it at the end wins.' : 'Hold the marked point. The core closer to it at the end wins.';
  } else if (objKey === 'orbit') {
    const radius = chRound(Math.max(1, L.reach * (0.5 + r() * 0.4))), period = Math.round(14 + r() * 12);
    objective = { type: 'hold', scoring: 'time', path: { kind: 'orbit', radius, period, phase: chRound(r() * 6.28) } };
    text = `The marked point circles the centre at ${radius} m, once every ${period} seconds. Whoever spends longer closest to it wins.`;
  } else if (objKey === 'jump') {
    const every = Math.round(7 + r() * 5), points = [];
    for (let i = 0; i < 8; i++) points.push(L.narrow ? { x: 0, z: chRound((r() - 0.5) * 2 * (L.floor[2].d / 2 + 2)) } : { x: chRound((r() - 0.5) * 2 * L.reach), z: chRound((r() - 0.5) * 2 * L.reach) });
    objective = { type: 'hold', scoring: 'time', path: { kind: 'jump', every, points } };
    text = `The marked point jumps to a new place every ${every} seconds. Whoever spends longer closest to it wins.`;
  } else {
    const size = chRound(0.5 + r() * 0.4), mass = Math.round(10 + r() * 40);
    objective = { type: 'deliver', crate: { size, mass, x: 0, z: 0 } };
    text = `A ${mass} kg crate starts in the middle. Whoever has it nearer their own end when the round stops wins.`;
  }
  const spawnZ = chRound(L.spawnZ);
  const brief = [`The arena is ${L.text}.`, S.text, G.text, text].filter(Boolean).join(' ');
  return {
    name: `Round ${seed}`, brief, keys: { layout: layoutKey, surface: surfaceKey, gravity: gravityKey, objective: objKey },
    floor: L.floor, walls: L.walls, surface: { grip: S.grip, slide: S.slide }, gravity: G.g,
    spawn: [{ x: 0, z: -spawnZ }, { x: 0, z: spawnZ }], objective,
  };
}

// Where the point to hold is at time t.
export function targetAt(ch, t) {
  const p = ch.objective.path;
  if (!p) return null;
  if (p.kind === 'orbit') { const a = p.phase + (t / p.period) * Math.PI * 2; return { x: Math.cos(a) * p.radius, z: Math.sin(a) * p.radius }; }
  if (p.kind === 'jump') return p.points[Math.floor(t / p.every) % p.points.length];
  return { x: p.x, z: p.z };
}

export function onFloor(ch, x, z) {
  for (const s of ch.floor) if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) return true;
  return false;
}
// Distance from a point to the nearest drop, looking in 16 directions out to 4 m.
export function edgeDistance(ch, x, z) {
  if (!onFloor(ch, x, z)) return 0;
  let best = 4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    for (let d = 0.2; d < best; d += 0.2) if (!onFloor(ch, x + cx * d, z + cz * d)) { best = d; break; }
  }
  return best;
}

// A few fixed challenges to look at by name, plus the generator for everything else.
export const NAMED = [
  OPEN,
  { ...drawChallenge(101, { layout: 'open', surface: 'ice', gravity: 'normal', objective: 'fixed' }), name: 'Ice' },
  { ...drawChallenge(102, { layout: 'open', surface: 'normal', gravity: 'low', objective: 'fixed' }), name: 'Low gravity' },
  { ...drawChallenge(103, { layout: 'open', surface: 'normal', gravity: 'normal', objective: 'orbit' }), name: 'Wandering point' },
  { ...drawChallenge(104, { layout: 'bridge', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'Bridge' },
  { ...drawChallenge(105, { layout: 'gap', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'The gap' },
  { ...drawChallenge(106, { layout: 'pillars', surface: 'normal', gravity: 'normal', objective: 'jump' }), name: 'Pillars' },
  { ...drawChallenge(107, { layout: 'open', surface: 'normal', gravity: 'normal', objective: 'deliver' }), name: 'Bring it home' },
  { ...drawChallenge(108, { layout: 'small', surface: 'ice', gravity: 'normal', objective: 'deliver' }), name: 'Crate on ice' },
];
