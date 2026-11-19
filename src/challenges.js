// ───────────────────────────────────────────────────────────────────────────
// CHALLENGES. A challenge is the conditions of one round: the floor, the surface, gravity and the
// objective. The kit and the physics stay fixed; the challenge is what changes from round to round.
// A challenge is plain data, and a bot's program receives it whole as s.challenge.
//
//   floor      slabs: { x, z, w, d, top } (centre, width along x, depth along z, height of the top, 0 if absent)
//   walls      solid blocks standing on the floor: { x, z, w, d, h }
//   terrain    topography on the base floor, or null: { cell, x0, z0, nx, nz, max, heights } where heights[iz * nx + ix]
//              is the height of the ground at (x0 + ix * cell, z0 + iz * cell)
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
  floor: [{ x: 0, z: 0, w: 30, d: 30 }],
  walls: [],
  surface: { grip: 1, slide: 1 },
  gravity: 1,
  spawn: [{ x: 0, z: -9 }, { x: 0, z: 9 }],
  objective: { type: 'hold', scoring: 'final', path: { kind: 'fixed', x: 0, z: 0 } },
};

const LAYOUTS = {
  open: (r) => { const s = 26 + Math.round(r() * 8); return { text: `a ${s} m square platform`, floor: [{ x: 0, z: 0, w: s, d: s }], walls: [], spawnZ: s / 2 - 6, reach: s / 2 - 5 }; },
  small: (r) => { const s = 14 + Math.round(r() * 4); return { text: `a small ${s} m square platform`, floor: [{ x: 0, z: 0, w: s, d: s }], walls: [], spawnZ: s / 2 - 3.5, reach: s / 2 - 3.5 }; },
  bridge: (r) => {
    const w = chRound(4.5 + r() * 2.5), len = chRound(6 + r() * 4), isl = 12;
    const z = len / 2 + isl / 2;
    return { text: `two platforms joined by a bridge ${w} m wide and ${len} m long`, floor: [{ x: 0, z: -z, w: 20, d: isl }, { x: 0, z, w: 20, d: isl }, { x: 0, z: 0, w, d: len }], walls: [], spawnZ: z, reach: Math.min(w / 2 - 1.2, 2), narrow: true };
  },
  gap: (r) => {
    const g = chRound(1 + r() * 2), isl = 13;
    const z = g / 2 + isl / 2;
    return { text: `two platforms separated by a ${g} m gap`, floor: [{ x: 0, z: -z, w: 24, d: isl }, { x: 0, z, w: 24, d: isl }], walls: [], spawnZ: z + 1, reach: 0, split: true };
  },
  plinth: (r) => {
    const w = chRound(6 + r() * 3), top = chRound(0.4 + r() * 0.5);
    return { text: `a square platform with a raised block in the middle, ${w} m across and ${top} m high`, floor: [{ x: 0, z: 0, w: 30, d: 30 }, { x: 0, z: 0, w, d: w, top }], walls: [], spawnZ: 10, reach: w / 2 - 1, only: ['fixed', 'deliver'], where: 'on top of the block' };
  },
  islands: (r) => {
    const g = chRound(1.5 + r() * 1.5), z = 4 + g + 5;
    return { text: `three platforms in a row with ${g} m gaps between them; the middle one is 8 m square`, floor: [{ x: 0, z: -z, w: 24, d: 10 }, { x: 0, z, w: 24, d: 10 }, { x: 0, z: 0, w: 8, d: 8 }], walls: [], spawnZ: z, reach: 3, only: ['fixed', 'deliver'], where: 'on the middle platform' };
  },
  ridges: (r) => {
    // Low steps right across the floor, each with one opening. Anything that can step up goes straight over;
    // anything that cannot has to weave through the openings.
    const top = chRound(0.25 + r() * 0.15), floor = [{ x: 0, z: 0, w: 30, d: 30 }];
    [-5, 5].forEach((z, i) => { const open = (i % 2 ? 1 : -1) * (6 + r() * 3), half = 3.6; floor.push({ x: (open - half - 15) / 2, z, w: open - half + 15, d: 0.7, top }, { x: (open + half + 15) / 2, z, w: 15 - open - half, d: 0.7, top }); });
    return { text: `a square platform crossed by two ridges ${top} m high, each with one opening 7.2 m wide`, floor, walls: [], spawnZ: 12, reach: 2.5, only: ['fixed', 'orbit', 'jump'] };
  },
  pillars: (r) => {
    const s = 30, walls = [];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + r() * 0.8, d = 5 + r() * 4; walls.push({ x: chRound(Math.cos(a) * d), z: chRound(Math.sin(a) * d * 0.6), w: chRound(1.2 + r() * 1.8), d: chRound(1.2 + r() * 1.8), h: 2 }); }
    return { text: 'a square platform with five solid pillars', floor: [{ x: 0, z: 0, w: s, d: s }], walls, spawnZ: 10, reach: 9 };
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
const GROUNDS = {
  rolling: 'The ground rolls: low rounded rises and dips all over the floor.',
  hills: 'There are hills on the floor, some too steep to drive straight up.',
  mound: 'The middle of the floor is a broad hill.',
  basin: 'A ring of high ground surrounds the middle, with passes through it.',
  ridge: 'A long ridge runs across the floor between the two starting places, with a low saddle somewhere along it.',
};
// Topography as a grid of heights with posts every metre. It is built from smooth rounded bumps and is flat
// at the starting places, along every edge and around anything standing on the floor.
function drawTerrain(L, kind, r, spawnZ, crate) {
  const base = L.floor.filter((f) => !f.top && Math.min(f.w, f.d) >= 9);
  if (!base.length) return null;
  const bumps = [], add = (x, z, h, rx, rz = rx, rot = 0) => bumps.push({ x, z, h, rx, rz, c: Math.cos(rot), s: Math.sin(rot) });
  const scatter = (f, n, h0, h1, r0, r1) => { for (let i = 0; i < n; i++) add(f.x + (r() - 0.5) * (f.w - 4), f.z + (r() - 0.5) * (f.d - 4), h0 + r() * (h1 - h0), r0 + r() * (r1 - r0), r0 + r() * (r1 - r0), r() * 3.14); };
  for (const f of base) {
    const area = f.w * f.d, half = Math.min(f.w, f.d) / 2, mid = Math.abs(f.x) < f.w / 2 - 3 && Math.abs(f.z) < f.d / 2 - 3;
    if (kind === 'rolling') scatter(f, Math.round(area / 35), 0.3, 0.8, 3, 5.5);
    else if (kind === 'hills' || !mid) scatter(f, Math.round(area / 110) + 2, 0.9, 1.9, 3.2, 5.5);
    else if (kind === 'mound') { add(0, 0, 1.2 + r() * 0.8, Math.min(8, half * 0.6)); scatter(f, Math.round(area / 150), 0.4, 1, 3, 5); }
    else if (kind === 'basin') {
      const ring = Math.min(8, half * 0.55), n = 10, gap = Math.floor(r() * n), gap2 = (gap + 4 + Math.floor(r() * 3)) % n;
      for (let i = 0; i < n; i++) if (i !== gap && i !== gap2) add(Math.cos((i / n) * 6.283) * ring, Math.sin((i / n) * 6.283) * ring, 1.1 + r() * 0.7, 3 + r() * 0.8);
    } else if (kind === 'ridge') {
      const zr = (r() - 0.5) * 3, h = 1.2 + r() * 0.7;
      add(f.x, zr, h, f.w * 0.5, 2.6 + r() * 1.2);
      add(f.x + (r() - 0.5) * (f.w - 10), zr, -h * (0.6 + r() * 0.25), 2.5 + r() * 1, 4);
      scatter(f, Math.round(area / 200), 0.4, 0.9, 3, 5);
    }
  }
  const ease = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  const away = (o, x, z, h) => Math.hypot(Math.max(0, Math.abs(x - o.x) - o.w / 2), Math.max(0, Math.abs(z - o.z) - (h ? o.d : o.d) / 2));
  const height = (x, z) => {
    let inside = -1;
    for (const f of base) inside = Math.max(inside, Math.min(f.w / 2 - Math.abs(x - f.x), f.d / 2 - Math.abs(z - f.z)));
    if (inside <= 1) return 0;
    let h = 0;
    for (const b of bumps) { const dx = x - b.x, dz = z - b.z, u = (dx * b.c + dz * b.s) / b.rx, v = (-dx * b.s + dz * b.c) / b.rz, q = Math.hypot(u, v); if (q < 1) h += b.h * 0.5 * (1 + Math.cos(Math.PI * q)); }
    let k = ease((inside - 1) / 2.5) * ease((Math.hypot(x, Math.abs(z) - spawnZ) - 2) / 2.5);
    for (const o of L.floor) if (o.top) k *= ease((away(o, x, z) - 1) / 2);
    for (const o of L.walls) k *= ease((away(o, x, z) - 1) / 2);
    if (crate) k *= ease((Math.hypot(x, z) - 1.5) / 2);
    return Math.max(0, h) * k;
  };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of base) { x0 = Math.min(x0, f.x - f.w / 2); x1 = Math.max(x1, f.x + f.w / 2); z0 = Math.min(z0, f.z - f.d / 2); z1 = Math.max(z1, f.z + f.d / 2); }
  x0 = Math.floor(x0); z0 = Math.floor(z0);
  const nx = Math.ceil(x1) - x0 + 1, nz = Math.ceil(z1) - z0 + 1, heights = [];
  let max = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const h = chRound(height(x0 + ix, z0 + iz)); heights.push(h); max = Math.max(max, h); }
  if (max < 0.2) return null;
  return { cell: 1, x0, z0, nx, nz, max, heights };
}

export function drawChallenge(seed, force = {}) {
  const r = chRng(seed * 7919 + 13);
  const pick = (obj, weights) => { const keys = Object.keys(weights); let t = r() * keys.reduce((n, k) => n + weights[k], 0); for (const k of keys) { t -= weights[k]; if (t <= 0) return k; } return keys[0]; };
  const layoutKey = force.layout || pick(LAYOUTS, { open: 2.5, small: 1.5, bridge: 2, gap: 1.5, pillars: 1.5, plinth: 2, islands: 2, ridges: 2 });
  const surfaceKey = force.surface || pick(SURFACES, { normal: 3, ice: 2, sticky: 1 });
  const gravityKey = force.gravity || pick(GRAVITIES, { normal: 3, low: 1.5, high: 1 });
  let objKey = force.objective || pick({}, { fixed: 2, orbit: 2, jump: 2, deliver: 2 });
  const L = LAYOUTS[layoutKey](r), S = SURFACES[surfaceKey], G = GRAVITIES[gravityKey];
  if (L.split && objKey !== 'fixed') objKey = 'fixed';
  if (L.only && !L.only.includes(objKey)) objKey = 'fixed';
  if (L.narrow && objKey === 'orbit') objKey = 'jump';
  let objective, text;
  if (objKey === 'fixed') {
    objective = { type: 'hold', scoring: 'final', path: { kind: 'fixed', x: 0, z: 0 } };
    text = L.split ? 'The point to hold is in the middle of the gap. The core closer to it at the end wins.' : `Hold the marked point${L.where ? ', which is ' + L.where : ''}. The core closer to it at the end wins.`;
  } else if (objKey === 'orbit') {
    const radius = chRound(Math.max(2, L.reach * (0.5 + r() * 0.4))), period = Math.round(20 + r() * 15);
    objective = { type: 'hold', scoring: 'time', path: { kind: 'orbit', radius, period, phase: chRound(r() * 6.28) } };
    text = `The marked point circles the centre at ${radius} m, once every ${period} seconds. Whoever spends longer closest to it wins.`;
  } else if (objKey === 'jump') {
    const every = Math.round(9 + r() * 6), points = [];
    for (let i = 0; i < 8; i++) points.push(L.narrow ? { x: 0, z: chRound((r() - 0.5) * 2 * (L.floor[2].d / 2 + 4)) } : { x: chRound((r() - 0.5) * 2 * L.reach), z: chRound((r() - 0.5) * 2 * L.reach) });
    objective = { type: 'hold', scoring: 'time', path: { kind: 'jump', every, points } };
    text = `The marked point jumps to a new place every ${every} seconds. Whoever spends longer closest to it wins.`;
  } else {
    const size = chRound(1 + r() * 0.6), mass = Math.round(40 + r() * 120);
    objective = { type: 'deliver', crate: { size, mass, x: 0, z: 0 } };
    text = `A ${mass} kg crate starts ${L.where || 'in the middle'}. Whoever has it nearer their own end when the round stops wins.`;
  }
  const spawnZ = chRound(L.spawnZ);
  // Ground. Most rounds have real topography: hills, ridges, basins or rolling ground, as a grid of heights.
  // Drawn last, so it does not change what the rest of a round is.
  const groundKey = force.ground || (force.layout ? 'flat' : pick({}, { rolling: 2, hills: 2, mound: 2, basin: 1, ridge: 1, flat: 2 }));
  let terrain = null, groundText = '';
  if (groundKey !== 'flat') {
    terrain = drawTerrain(L, groundKey, r, spawnZ, objKey === 'deliver');
    if (terrain) groundText = `${GROUNDS[groundKey]} The highest ground is ${terrain.max} m above the flat. The heights are in the terrain grid, one every ${terrain.cell} m.`;
  }
  const floor = L.floor;
  const brief = [`The arena is ${L.text}.`, groundText, S.text, G.text, text].filter(Boolean).join(' ');
  return {
    name: `Round ${seed}`, brief, keys: { layout: layoutKey, ground: groundKey, surface: surfaceKey, gravity: gravityKey, objective: objKey },
    floor, walls: L.walls, terrain, surface: { grip: S.grip, slide: S.slide }, gravity: G.g,
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

// Height of a flat-topped slab under a point (0 on the base floor, more on a raised block), without the terrain.
export function slabHeight(ch, x, z) {
  let h = 0;
  for (const s of ch.floor) if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) h = Math.max(h, s.top || 0);
  return h;
}
// Height of the terrain at a point, read off the grid of heights between its four nearest posts.
export function terrainHeight(ch, x, z) {
  const t = ch.terrain; if (!t) return 0;
  const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell, ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= t.nx - 1 || iz >= t.nz - 1) return 0;
  const u = fx - ix, v = fz - iz, H = t.heights, k = iz * t.nx + ix;
  return H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + t.nx] * (1 - u) * v + H[k + t.nx + 1] * u * v;
}
// Height of the ground under a point: the slab plus any terrain on it.
export function floorHeight(ch, x, z) { return slabHeight(ch, x, z) + terrainHeight(ch, x, z); }
export function onFloor(ch, x, z) {
  for (const s of ch.floor) if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) return true;
  return false;
}
// Distance from a point to the nearest drop, looking in 16 directions out to 6 m.
export function edgeDistance(ch, x, z) {
  if (!onFloor(ch, x, z)) return 0;
  let best = 6;
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
  { ...drawChallenge(109, { layout: 'plinth', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'The plinth' },
  { ...drawChallenge(113, { layout: 'ridges', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'Ridges' },
  { ...drawChallenge(121, { layout: 'open', ground: 'rolling', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'Rolling ground' },
  { ...drawChallenge(122, { layout: 'open', ground: 'mound', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'King of the hill' },
  { ...drawChallenge(123, { layout: 'open', ground: 'hills', surface: 'normal', gravity: 'normal', objective: 'jump' }), name: 'Hill country' },
  { ...drawChallenge(124, { layout: 'open', ground: 'basin', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'The basin' },
  { ...drawChallenge(125, { layout: 'open', ground: 'ridge', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'The ridge' },
  { ...drawChallenge(126, { layout: 'open', ground: 'hills', surface: 'ice', gravity: 'normal', objective: 'fixed' }), name: 'Icy hills' },
  { ...drawChallenge(110, { layout: 'islands', surface: 'normal', gravity: 'normal', objective: 'fixed' }), name: 'Islands' },
  { ...drawChallenge(111, { layout: 'plinth', surface: 'normal', gravity: 'normal', objective: 'deliver' }), name: 'Crate on the plinth' },
];
