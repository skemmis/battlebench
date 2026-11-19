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
  brief: 'A plain square platform. Win by breaking more than half of the enemy off its core, or by putting its core off the floor.',
  floor: [{ x: 0, z: 0, w: 30, d: 30 }],
  walls: [],
  surface: { grip: 1, slide: 1 },
  gravity: 1,
  spawn: [{ x: 0, z: -9 }, { x: 0, z: 9 }],
  objective: { type: 'knockout' },
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
  crags: { text: 'The ground is craggy rock: stepped ledges and outcrops all over, up to {max} m high, with steps of up to {step} m between neighbouring ledges.', amp: 1.7, q: 0.2, maxStep: 0.6, fine: 0.4, jut: 0.14 },
  terraces: { text: 'The ground is terraced: broad level shelves, up to {max} m high, with a step of {q} m or more from each to the next.', amp: 1.5, q: 0.35, maxStep: 0.35, fine: 0.1, jut: 0 },
  rubble: { text: 'The ground is rubble: small uneven steps everywhere, up to {max} m high, none more than {step} m.', amp: 0.55, q: 0.1, maxStep: 0.3, fine: 0.75, jut: 0.2 },
  flat: { text: '' },
};
// Broken ground, as flat-topped ledges of rock standing on the base floor. Heights come from smooth noise cut
// into steps, so there are shelves, ledges and outcrops and not a scatter of separate obstacles. No step
// between neighbouring ledges is higher than maxStep, so nothing is walled in, but most steps are too high
// for a small wheel. Each ledge is a floor slab with a "top", like any other raised block.
function drawCrags(L, G, r, spawnZ) {
  const out = [];
  let max = 0, step = 0;
  const lattice = (period, nx, nz) => { const w = Math.ceil(nx / period) + 2, d = Math.ceil(nz / period) + 2, v = Array.from({ length: w * d }, () => r()); return (x, z) => { const fx = x / period, fz = z / period, ix = Math.floor(fx), iz = Math.floor(fz); let u = fx - ix, t = fz - iz; u = u * u * (3 - 2 * u); t = t * t * (3 - 2 * t); const a = v[iz * w + ix], b = v[iz * w + ix + 1], c = v[(iz + 1) * w + ix], e = v[(iz + 1) * w + ix + 1]; return a * (1 - u) * (1 - t) + b * u * (1 - t) + c * (1 - u) * t + e * u * t; }; };
  for (const f of L.floor) {
    if (f.top || Math.min(f.w, f.d) < 6) continue;
    const nx = Math.round(f.w), nz = Math.round(f.d), cw = f.w / nx, cd = f.d / nz, x0 = f.x - f.w / 2, z0 = f.z - f.d / 2;
    const broad = lattice(5 + r() * 2, nx, nz), mid = lattice(2.4, nx, nz);
    const h = new Float32Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      let v = (1 - G.fine) * broad(ix, iz) + G.fine * (0.6 * mid(ix, iz) + 0.4 * r());
      v = Math.max(0, v - 0.25) / 0.75;
      h[iz * nx + ix] = G.amp * v + (r() < G.jut ? G.q * (1 + Math.floor(r() * 2)) : 0);
    }
    // Each starting place is a level pad.
    for (const sgn of [-1, 1]) { const cx = Math.floor((0 - x0) / cw), cz = Math.floor((sgn * spawnZ - z0) / cd); if (cx < 0 || cz < 0 || cx >= nx || cz >= nz) continue; const lvl = h[cz * nx + cx]; for (let iz = cz - 3; iz <= cz + 3; iz++) for (let ix = cx - 3; ix <= cx + 3; ix++) if (ix >= 0 && iz >= 0 && ix < nx && iz < nz) h[iz * nx + ix] = lvl; }
    const lv = new Int32Array(nx * nz), cap = Math.round(G.maxStep / G.q);
    let low = Infinity;
    for (let i = 0; i < nx * nz; i++) { lv[i] = Math.round(h[i] / G.q); low = Math.min(low, lv[i]); }
    for (let i = 0; i < nx * nz; i++) lv[i] -= low;
    // Wear down any step higher than the limit.
    for (let pass = 0, changed = true; changed && pass < 40; pass++) {
      changed = false;
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const i = iz * nx + ix; let m = Infinity; if (ix > 0) m = Math.min(m, lv[i - 1]); if (ix < nx - 1) m = Math.min(m, lv[i + 1]); if (iz > 0) m = Math.min(m, lv[i - nx]); if (iz < nz - 1) m = Math.min(m, lv[i + nx]); if (lv[i] > m + cap) { lv[i] = m + cap; changed = true; } }
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const i = iz * nx + ix; if (ix < nx - 1) step = Math.max(step, Math.abs(lv[i] - lv[i + 1]) * G.q); if (iz < nz - 1) step = Math.max(step, Math.abs(lv[i] - lv[i + nx]) * G.q); }
    // Join neighbouring squares at the same level into as few ledges as possible.
    const used = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix; if (used[i] || !lv[i]) continue;
      let w = 1; while (ix + w < nx && !used[i + w] && lv[i + w] === lv[i]) w++;
      let d = 1; grow: while (iz + d < nz) { for (let k = 0; k < w; k++) { const j = (iz + d) * nx + ix + k; if (used[j] || lv[j] !== lv[i]) break grow; } d++; }
      for (let a = 0; a < d; a++) for (let k = 0; k < w; k++) used[(iz + a) * nx + ix + k] = 1;
      const top = chRound(lv[i] * G.q); max = Math.max(max, top);
      out.push({ x: chRound(x0 + (ix + w / 2) * cw), z: chRound(z0 + (iz + d / 2) * cd), w: chRound(w * cw), d: chRound(d * cd), top, rock: true });
    }
  }
  return { ledges: out, max, step: chRound(step) };
}

// Draw one challenge from the family. The same seed always gives the same challenge.
export function drawChallenge(seed, force = {}) {
  const r = chRng(seed * 7919 + 13);
  const pick = (obj, weights) => { const keys = Object.keys(weights); let t = r() * keys.reduce((n, k) => n + weights[k], 0); for (const k of keys) { t -= weights[k]; if (t <= 0) return k; } return keys[0]; };
  const layoutKey = force.layout || pick(LAYOUTS, { open: 3, small: 2, bridge: 1.5, gap: 1, pillars: 1.5, islands: 1.5 });
  const surfaceKey = force.surface || pick(SURFACES, { normal: 3, ice: 1.5, sticky: 1 });
  const gravityKey = force.gravity || pick(GRAVITIES, { normal: 3, low: 1.5, high: 1 });
  const L = LAYOUTS[layoutKey](r), S = SURFACES[surfaceKey], G = GRAVITIES[gravityKey];
  const spawnZ = chRound(L.spawnZ);
  // Ground. Most rounds are fought over broken rock. Drawn last, so it does not change the rest of a round.
  const groundKey = force.ground || (force.layout ? 'flat' : pick({}, { crags: 3, terraces: 2, rubble: 2, flat: 1 }));
  let floor = L.floor, groundText = '';
  if (groundKey !== 'flat') {
    const c = drawCrags(L, GROUNDS[groundKey], r, spawnZ);
    floor = [...L.floor, ...c.ledges];
    groundText = GROUNDS[groundKey].text.replace('{max}', c.max).replace('{step}', c.step).replace('{q}', GROUNDS[groundKey].q);
  }
  const text = 'Win by breaking more than half of the enemy off its core, or by putting its core off the floor. If neither happens in time, the machine with more of itself still attached wins.';
  const brief = [`The arena is ${L.text}.`, groundText, S.text, G.text, text].filter(Boolean).join(' ');
  return {
    name: `Round ${seed}`, brief, keys: { layout: layoutKey, ground: groundKey, surface: surfaceKey, gravity: gravityKey },
    floor, walls: L.walls, terrain: null, surface: { grip: S.grip, slide: S.slide }, gravity: G.g,
    spawn: [{ x: 0, z: -spawnZ }, { x: 0, z: spawnZ }], objective: { type: 'knockout' },
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
  { ...drawChallenge(201, { layout: 'open', ground: 'crags' }), name: 'Crags' },
  { ...drawChallenge(202, { layout: 'open', ground: 'terraces' }), name: 'Terraces' },
  { ...drawChallenge(203, { layout: 'open', ground: 'rubble' }), name: 'Rubble' },
  { ...drawChallenge(204, { layout: 'small', ground: 'crags' }), name: 'Small crag' },
  { ...drawChallenge(205, { layout: 'islands', ground: 'crags' }), name: 'Crag islands' },
  { ...drawChallenge(206, { layout: 'bridge', ground: 'rubble' }), name: 'Bridge' },
  { ...drawChallenge(105, { layout: 'gap' }), name: 'The gap' },
  { ...drawChallenge(308, { layout: 'gap', ground: 'flat', surface: 'normal', gravity: 'normal' }), name: 'Narrow gap' },
  { ...drawChallenge(207, { layout: 'pillars', ground: 'terraces' }), name: 'Pillars' },
  { ...drawChallenge(208, { layout: 'open', ground: 'crags', surface: 'ice' }), name: 'Icy crags' },
  { ...drawChallenge(209, { layout: 'open', ground: 'crags', gravity: 'low' }), name: 'Low gravity crags' },
  { ...drawChallenge(109, { layout: 'plinth' }), name: 'The plinth' },
];
