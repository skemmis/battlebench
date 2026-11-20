import * as THREE from 'three';
import { CONFIG, createMatch, partSpec } from './sim.js';
import { ALL } from './bots.js';
import { NAMED, drawChallenge, targetAt, floorHeight } from './challenges.js';

// The page: runs a whole fight up front, then replays the recording.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const TEAM = ['a', 'b'];
const FPS = CONFIG.physics.controlHz;

let cfg = structuredClone(CONFIG);
let match = null;
let playhead = 0;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let speed = 1;

// ── Scene ──────────────────────────────────────────────────────────────────
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.5);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(14, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
scene.add(hemi, sun);

const arena = new THREE.Group();
scene.add(arena);
let floorMat, wallMat, gridLines, edgeLine, contourLines, rockMats = new Map(), targetRing, propMeshes = [];
function buildArena() {
  arena.clear();
  const ch = match.challenge, t = cfg.arena.thickness;
  floorMat = new THREE.MeshStandardMaterial({ roughness: ch.surface.grip < 0.5 ? 0.25 : 0.9, metalness: 0.05 });
  wallMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
  const grid = [], edge = []; let contourPts = []; rockMats = new Map();
  for (const sl of ch.floor) {
    const top = sl.top || 0;
    // Rock ledges are shaded by height, so the lie of the ground reads at a glance.
    let mat = floorMat;
    if (sl.rock) { mat = rockMats.get(top); if (!mat) { mat = new THREE.MeshStandardMaterial({ roughness: floorMat.roughness, metalness: 0.03 }); rockMats.set(top, mat); } }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sl.w, t + top, sl.d), mat);
    slab.position.set(sl.x, (top - t) / 2, sl.z); slab.receiveShadow = true; slab.castShadow = top > 0;
    arena.add(slab);
    const x0 = sl.x - sl.w / 2, x1 = sl.x + sl.w / 2, z0 = sl.z - sl.d / 2, z1 = sl.z + sl.d / 2;
    const g = top + 0.005, e = top + 0.01;
    if (sl.rock) { grid.push(x0, g, z0, x1, g, z0, x1, g, z0, x1, g, z1, x1, g, z1, x0, g, z1, x0, g, z1, x0, g, z0); continue; }
    // Grid lines follow the ground, so hills read as hills.
    const hill = ch.terrain && !top, yy = (x, z) => (hill ? floorHeight(ch, x, z) : top) + 0.012;
    for (let x = Math.ceil(x0 / 2) * 2; x <= x1; x += 2) { if (!hill) { grid.push(x, g, z0, x, g, z1); continue; } for (let z = z0; z < z1; z += 0.5) { const zb = Math.min(z1, z + 0.5); if (yy(x, z) + yy(x, zb) < 0.05) grid.push(x, g, z, x, g, zb); } }
    for (let z = Math.ceil(z0 / 2) * 2; z <= z1; z += 2) { if (!hill) { grid.push(x0, g, z, x1, g, z); continue; } for (let x = x0; x < x1; x += 0.5) { const xb = Math.min(x1, x + 0.5); if (yy(x, z) + yy(xb, z) < 0.05) grid.push(x, g, z, xb, g, z); } }
    edge.push(x0, e, z0, x1, e, z0, x1, e, z0, x1, e, z1, x1, e, z1, x0, e, z1, x0, e, z1, x0, e, z0);
  }
  // The land: a surface over the grid of heights, coloured the way a game map is. Grass on walkable ground,
  // paler on the heights, bare rock where it is too steep to climb, sand under and beside the water.
  if (ch.terrain) {
    const t = ch.terrain, pos = [], col = [], idx = [], H = (ix, iz) => t.heights[Math.max(0, Math.min(t.nz - 1, iz)) * t.nx + Math.max(0, Math.min(t.nx - 1, ix))];
    const grass = new THREE.Color(css('--grass')), top = new THREE.Color(css('--hill')), rock = new THREE.Color(css('--rock')), sand = new THREE.Color(css('--sand'));
    const lvl = ch.water ? ch.water.level : -9, base = H(0, 0);
    for (let iz = 0; iz < t.nz; iz++) for (let ix = 0; ix < t.nx; ix++) {
      const h = H(ix, iz), steep = Math.hypot(H(ix + 1, iz) - H(ix - 1, iz), H(ix, iz + 1) - H(ix, iz - 1)) / (2 * t.cell);
      pos.push(t.x0 + ix * t.cell, h + 0.004, t.z0 + iz * t.cell);
      const c = grass.clone().lerp(top, Math.max(0, Math.min(1, (h - base) / Math.max(0.8, t.max - base))));
      c.lerp(rock, Math.max(0, Math.min(1, (steep - 0.45) / 0.3)));
      if (h < lvl + 0.12) c.lerp(sand, Math.min(1, (lvl + 0.12 - h) / 0.2));
      col.push(c.r, c.g, c.b);
    }
    for (let iz = 0; iz < t.nz - 1; iz++) for (let ix = 0; ix < t.nx - 1; ix++) { const a = iz * t.nx + ix, b = a + 1, c = a + t.nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    land.receiveShadow = true; land.castShadow = true; arena.add(land);
    // The cut edge of the land, down to the slab it stands on.
    const sp = [], si = [], rim = [];
    for (let ix = 0; ix < t.nx; ix++) rim.push([ix, 0]); for (let iz = 1; iz < t.nz; iz++) rim.push([t.nx - 1, iz]);
    for (let ix = t.nx - 2; ix >= 0; ix--) rim.push([ix, t.nz - 1]); for (let iz = t.nz - 2; iz >= 0; iz--) rim.push([0, iz]);
    rim.forEach(([ix, iz], k) => { const x = t.x0 + ix * t.cell, z = t.z0 + iz * t.cell; sp.push(x, H(ix, iz), z, x, 0, z); if (k < rim.length - 1) si.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3); });
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
    arena.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: css('--rock'), roughness: 1, side: THREE.DoubleSide })));
    // Water lies level wherever the ground is lower than it.
    if (ch.water) {
      const wp = [], wi = [];
      for (let iz = 0; iz < t.nz - 1; iz++) for (let ix = 0; ix < t.nx - 1; ix++) {
        if (Math.min(H(ix, iz), H(ix + 1, iz), H(ix, iz + 1), H(ix + 1, iz + 1)) >= lvl) continue;
        const k = wp.length / 3, x = t.x0 + ix * t.cell, z = t.z0 + iz * t.cell;
        wp.push(x, lvl, z, x + t.cell, lvl, z, x, lvl, z + t.cell, x + t.cell, lvl, z + t.cell); wi.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
      arena.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: css('--water'), transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.1 })));
    }
    // Contour lines every half metre, cut from the same triangles the physics uses.
    const cont = [], P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    for (let k = 0; k < idx.length; k += 3) {
      const tri = [P(idx[k]), P(idx[k + 1]), P(idx[k + 2])], lo2 = Math.min(tri[0][1], tri[1][1], tri[2][1]), hi2 = Math.max(tri[0][1], tri[1][1], tri[2][1]);
      for (let lv = Math.ceil(lo2 / 0.5) * 0.5 + 0.001; lv < hi2; lv += 0.5) {
        const cut = [];
        for (let e = 0; e < 3; e++) { const a = tri[e], b = tri[(e + 1) % 3]; if ((a[1] - lv) * (b[1] - lv) < 0) { const f = (lv - a[1]) / (b[1] - a[1]); cut.push(a[0] + (b[0] - a[0]) * f, lv + 0.015, a[2] + (b[2] - a[2]) * f); } }
        if (cut.length === 6) cont.push(...cut);
      }
    }
    contourPts = cont;
  }
  const lines = (pts, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return new THREE.LineSegments(g, mat); };
  gridLines = lines(grid, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }));
  edgeLine = lines(edge, new THREE.LineBasicMaterial());
  arena.add(gridLines, edgeLine);
  if (contourPts.length) { contourLines = lines(contourPts, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75 })); arena.add(contourLines); } else contourLines = null;
  for (const wl of ch.walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wl.w, wl.h, wl.d), wallMat);
    wall.position.set(wl.x, wl.h / 2, wl.z); wall.castShadow = true; wall.receiveShadow = true;
    arena.add(wall);
  }
  // The point to hold: a flat ring on the floor that moves with the objective.
  targetRing = null;
  if (targetAt(ch, 0)) {
    targetRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 48), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    targetRing.rotation.x = -Math.PI / 2;
    arena.add(targetRing);
  }
  propMeshes = match.props.map((pr) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...pr.size), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    arena.add(mesh);
    return mesh;
  });
}

function partMesh(part, color) {
  const sp = part.spec;
  let geo;
  if (sp.kind === 'box') geo = new THREE.BoxGeometry(sp.half[0] * 2, sp.half[1] * 2, sp.half[2] * 2);
  else if (sp.kind === 'ball') geo = new THREE.SphereGeometry(sp.radius, 20, 14);
  else if (sp.kind === 'disc') geo = new THREE.CylinderGeometry(sp.radius, sp.radius, sp.thickness, 28);
  else if (sp.kind === 'wedge') {
    const [w, h, l] = sp.half;
    const v = [[-w, -h, -l], [w, -h, -l], [w, h, -l], [-w, h, -l], [-w, -h, l], [w, -h, l]];
    const tris = [[0, 3, 2], [0, 2, 1], [0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]];
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat().flatMap((i) => v[i]), 3));
    geo.computeVertexNormals();
  }
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, flatShading: sp.kind === 'wedge' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (sp.kind === 'ball' && part.jointType === 'motor') {
    // A pale band round a powered ball so you can see it turning.
    const band = new THREE.Mesh(new THREE.BoxGeometry(sp.radius * 0.5, sp.radius * 2.03, sp.radius * 0.45), new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.6 }));
    mesh.add(band);
  }
  return mesh;
}

const botsGroup = new THREE.Group();
scene.add(botsGroup);
let meshes = [];
function partColor(part) {
  const team = new THREE.Color(css(part.bot.index === 0 ? '--team-a' : '--team-b'));
  const t = part.def.type, m = part.def.material;
  if (t === 'core') return team;
  if (m === 'rubber') return new THREE.Color(0x2b2f36);
  const steel = new THREE.Color(0x6f7a88), alu = new THREE.Color(0xc4ccd6), plastic = new THREE.Color(0xe9e2cf);
  const base = m === 'steel' ? steel : m === 'plastic' ? plastic : alu;
  return base.lerp(team, m === 'steel' ? 0.35 : 0.5);
}
function buildMeshes() {
  botsGroup.clear();
  meshes = match.parts.map((p) => {
    const mesh = partMesh(p, partColor(p));
    mesh.userData.base = mesh.material.color.clone();
    botsGroup.add(mesh);
    return mesh;
  });
}
function applyTheme() {
  scene.background = new THREE.Color(css('--stage'));
  if (floorMat) {
    floorMat.color.set(css('--floor'));
    if (match && match.challenge.surface.grip < 0.5) floorMat.color.lerp(new THREE.Color(0x9fd0ee), 0.45);
    if (match && match.challenge.surface.slide > 1.5) floorMat.color.lerp(new THREE.Color(0x8a6f3c), 0.35);
    const peak = Math.max(1, ...rockMats.keys()), rock = new THREE.Color(css('--rock'));
    for (const [top, m] of rockMats) { m.color.copy(floorMat.color).lerp(rock, 0.25 + 0.75 * (top / peak)); if (Math.round(top * 20) % 2) m.color.multiplyScalar(0.94); }
    wallMat.color.set(css('--grid'));
    gridLines.material.color.set(css('--grid')); if (contourLines) contourLines.material.color.set(css('--contour'));
    edgeLine.material.color.set(css('--warn'));
    if (targetRing) targetRing.material.color.set(css('--warn'));
    propMeshes.forEach((mesh) => mesh.material.color.set(0xc9a35c));
  }
  if (match) meshes.forEach((mesh, i) => { mesh.userData.base = partColor(match.parts[i]); });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Camera: orbits the midpoint between the two cores ───────────────────────
const cam = { az: 0.7, el: 0.55, zoom: 1, target: new THREE.Vector3(), dist: 22 };
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.008; cam.el = Math.max(0.12, Math.min(1.45, cam.el + (e.clientY - drag.y) * 0.006));
  drag = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { drag = null; canvas.style.cursor = 'grab'; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = Math.max(0.45, Math.min(2.2, cam.zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), grey = new THREE.Color(0x7d848e), spark = new THREE.Color(0xfff2b0);
let flashes = [], lastSay = ['', ''];
function pose(time) {
  const n = match.frames.length;
  const f = Math.max(0, Math.min(n - 1, time * FPS));
  const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), k = f - i0;
  const A = match.frames[i0], B = match.frames[i1], flags = match.frameFlags[i0];
  const cores = [];
  meshes.forEach((mesh, i) => {
    const o = i * 7;
    mesh.position.set(A[o] + (B[o] - A[o]) * k, A[o + 1] + (B[o + 1] - A[o + 1]) * k, A[o + 2] + (B[o + 2] - A[o + 2]) * k);
    qa.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]); qb.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]);
    mesh.quaternion.slerpQuaternions(qa, qb, k);
    mesh.material.color.copy(mesh.userData.base);
    if (flags[i] & 1) mesh.material.color.lerp(grey, 0.6);
    if (match.parts[i].def.type === 'core') cores.push(mesh.position);
  });
  // Light up the two parts that touched in a hard hit, fading over a third of a second.
  for (const fl of flashes) {
    const age = time - fl.t;
    if (age < -0.03 || age > 0.35) continue;
    for (const i of fl.parts) meshes[i].material.color.lerp(spark, 0.9 * (1 - Math.max(0, age) / 0.35));
  }
  if (targetRing) { const tg = targetAt(match.challenge, time); targetRing.position.set(tg.x, floorHeight(match.challenge, tg.x, tg.z) + 0.02, tg.z); }
  const PA = match.propFrames[i0], PB = match.propFrames[i1];
  propMeshes.forEach((mesh, i) => {
    const o = i * 7;
    mesh.position.set(PA[o] + (PB[o] - PA[o]) * k, PA[o + 1] + (PB[o + 1] - PA[o + 1]) * k, PA[o + 2] + (PB[o + 2] - PA[o + 2]) * k);
    qa.set(PA[o + 3], PA[o + 4], PA[o + 5], PA[o + 6]); qb.set(PB[o + 3], PB[o + 4], PB[o + 5], PB[o + 6]);
    mesh.quaternion.slerpQuaternions(qa, qb, k);
  });
  const mid = cores[0].clone().add(cores[1]).multiplyScalar(0.5);
  mid.y = Math.max(0, mid.y);
  cam.target.lerp(mid, 0.08);
  const want = Math.max(13, cores[0].distanceTo(cores[1]) * 1.2 + 10);
  const say = match.frameSay[i0] || ['', ''];
  if (say[0] !== lastSay[0] || say[1] !== lastSay[1]) { lastSay = say; $('says').innerHTML = match.bots.map((b, i) => `<div class="${TEAM[i]}"><b>${esc(b.name)}</b><span>${esc(say[i] || '…')}</span></div>`).join(''); }
  cam.dist += (want - cam.dist) * 0.05;
}
function render() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const d = cam.dist * cam.zoom;
  camera.position.set(cam.target.x + d * Math.cos(cam.el) * Math.sin(cam.az), cam.target.y + d * Math.sin(cam.el), cam.target.z + d * Math.cos(cam.el) * Math.cos(cam.az));
  camera.lookAt(cam.target);
  renderer.render(scene, camera);
}

// ── Panels ─────────────────────────────────────────────────────────────────
function duration() { return match ? match.frameTimes[match.frameTimes.length - 1] : 0; }
function seek(t) { playhead = Math.max(0, Math.min(duration(), t)); }

function fightData() {
  return { summary: match.summary(), events: match.events, motionTrack: { samplesPerSecond: 5, fields: 'x, y, z in metres; heading in radians; upright is 1 when level and -1 when upside down; speed in m/s', samples: match.track } };
}
function renderLog() {
  const r = match.result, s = match.summary();
  $('result').innerHTML = esc(r.text);
  $('brief').textContent = match.challenge.brief;
  renderVerdict(); lastHud = '';
  $('cond').innerHTML = s.bots.map((b, i) => `<div class="${TEAM[i]}"><b>${esc(b.name)}</b><span>${Math.round(b.massLeft * 100)}% of its mass still attached</span><span>${b.partsLost.length ? 'Lost ' + esc(b.partsLost.join(', ')) : 'No parts lost'}</span><span>${b.hitsTaken} hard hits taken</span></div>`).join('');
  $('events').innerHTML = match.events.map((e, i) => `<li class="${e.type}" data-i="${i}" data-t="${e.t}" tabindex="0"><time>${e.t.toFixed(1)}</time><span><i class="who ${e.bot == null ? '' : TEAM[e.bot]}"></i>${esc(e.text)}</span></li>`).join('');
  const d = duration();
  $('ticks').innerHTML = match.events.filter((e) => e.type === 'part_lost' || e.type === 'hit' || e.type === 'flipped' || e.type === 'released' || e.type === 'gripped').map((e) => `<i class="${e.type === 'part_lost' ? 'lost' : ''}" style="left:${(e.t / d) * 100}%"></i>`).join('');
  const data = fightData();
  const shown = { ...data, motionTrack: { ...data.motionTrack, samples: data.motionTrack.samples.slice(0, 3).concat([`… ${data.motionTrack.samples.length - 3} more samples; Copy JSON includes them all`]) } };
  $('json').textContent = JSON.stringify(shown, null, 1);
}
function renderBots() {
  $('tab-bots').innerHTML = `<p class="note">A machine is two things: a parts list and a control program. Nothing in the kit is ready-made: wheels, legs, throwing arms and gates are all assembled from plain pieces. The program sees the whole fight and sets motors and pistons ${cfg.physics.controlHz} times a second. Positions are in metres from the core; +z is forward, +y is up.</p>` + match.bots.map((b, i) => {
    const c = b.check;
    return `<div class="bot"><div><h3 class="${TEAM[i]}">${esc(b.name)}</h3><p>${esc(b.build.note || '')}</p>
      <div class="meter"><span>mass ${c.mass} / ${cfg.budget.mass} kg</span><span>cost ${c.cost} / ${cfg.budget.cost}</span><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? 'build passes checks' : esc(c.errors.join(' '))}</span></div></div>
      <details><summary>Build (${b.build.parts.length} parts)</summary><pre>${esc('{\n "name": ' + JSON.stringify(b.build.name) + ',\n "parts": [\n' + b.build.parts.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n ]\n}')}</pre></details>
      <details><summary>Control program</summary><pre>${esc(b.program.toString())}</pre></details></div>`;
  }).join('');
}
function renderConfig() { $('config').textContent = JSON.stringify(cfg, null, 1); $('version').textContent = 'prototype ' + cfg.version; }

// What the stage says over the fight: a bar for each machine that shrinks as parts come off (the mark is the half
// below which it counts as destroyed), a line whenever something breaks or goes over, and at the end what decided it.
const lossAt = (i, t) => match.events.reduce((sum, e) => sum + (e.type === 'part_lost' && e.bot === i && e.t <= t ? e.share || 0 : 0), 0);
const plain = (e) => {
  const n = match.bots[e.bot].name, what = e.parts.length > 3 ? `${e.parts.length} parts (${e.parts.slice(0, 2).join(', ')}, …)` : e.parts.join(', ');
  return `${n} lost ${what}${e.share >= 0.01 ? `, ${Math.round(e.share * 100)}% of its weight` : ''}, to ${e.by}`;
};
let lastHud = '';
function renderHud() {
  const html = match.bots.map((b, i) => { const left = Math.max(0, 1 - lossAt(i, playhead)); return `<div class="${TEAM[i]}"><b>${esc(b.name)}</b><span>${Math.round(left * 100)}% intact</span><div class="bar"><i style="width:${left * 100}%"></i><u></u></div><small>${Math.round(b.startMass)} kg at the start. Destroyed below the mark.</small></div>`; }).join('');
  if (html !== lastHud) { lastHud = html; $('hud').innerHTML = html; }
  let cap = '';
  for (const e of match.events) { if (e.t > playhead) break; if (playhead - e.t < 3 && e.type === 'part_lost') cap = plain(e); else if (playhead - e.t < 3 && e.type === 'flipped') cap = e.text; }
  if ($('caption').textContent !== cap) $('caption').textContent = cap;
}
function renderVerdict() {
  const r = match.result, n = match.bots.map((b) => b.name);
  const head = r.winner == null ? 'Draw' : `${n[r.winner]} wins`;
  const how = { ring_out: 'by ring-out', destroyed: 'by breaking the other apart', time_damage: 'on damage when time ran out', stalemate_damage: 'on damage after both stopped' }[r.reason] || '';
  const big = match.events.filter((e) => e.type === 'part_lost' && e.share >= 0.02).sort((x, y) => y.share - x.share).slice(0, 3).sort((x, y) => x.t - y.t);
  const total = match.bots.map((b, i) => Math.round(100 * Math.max(0, 1 - lossAt(i, 1e9))));
  $('verdict').innerHTML = `<h3 class="${r.winner == null ? '' : TEAM[r.winner]}">${esc(head)} ${esc(how)}</h3><p>${esc(r.text)}</p><ul>${big.map((e) => `<li><time>${e.t.toFixed(1)} s</time>${esc(plain(e))}</li>`).join('')}<li>At the end: ${esc(n[0])} ${total[0]}% intact, ${esc(n[1])} ${total[1]}% intact.</li></ul>`;
}

// Working a fight out takes a while, so the stage says so in the middle of the screen, and a fight that has been
// worked out once is kept, so going back to it is immediate.
let runId = 0;
const kept = new Map();
function showFight(sim) {
  $('busy').hidden = true;
  match = sim;
  flashes = sim.events.filter((e) => e.type === 'hit' && e.flash).map((e) => ({ t: e.t, parts: e.flash }));
  buildArena(); buildMeshes(); applyTheme();
  playhead = 0; lastEvent = -1;
  pose(0); cam.target.set(0, 0, 0);
  renderLog(); renderBots(); renderConfig();
  window.__fight = fightData();
}
function runFight() {
  const seed = Math.max(1, Math.floor(Number($('seed').value) || 1));
  $('seed').value = seed;
  const id = ++runId;
  const pick = [ALL[Number($('botA').value)], ALL[Number($('botB').value)]];
  const chosen = $('challenge').value;
  const key = [$('botA').value, $('botB').value, chosen, seed, JSON.stringify(cfg)].join('|');
  window.__fight = null;
  if (kept.has(key)) { showFight(kept.get(key)); return; }
  const challenge = chosen === 'draw' ? drawChallenge(seed) : NAMED[Number(chosen)];
  const sim = createMatch({ builds: pick.map((r) => r.build), programs: pick.map((r) => r.program), seed, config: structuredClone(cfg), challenge });
  const title = `${pick[0].build.name} v ${pick[1].build.name}`, t0 = performance.now();
  const busy = () => {
    const share = sim.t / cfg.match.maxSeconds, spent = (performance.now() - t0) / 1000, left = share > 0.04 ? Math.ceil((spent / share) * (1 - share)) : null;
    $('busy').hidden = false;
    $('busy').innerHTML = `<b>${esc(title)}</b><span>Working out the fight in your browser: ${sim.t.toFixed(0)} of up to ${cfg.match.maxSeconds} seconds of fighting${left == null ? '' : `, about ${left} s to go`}.</span><div class="bar"><i style="width:${Math.min(100, share * 100)}%"></i></div><span>The replay starts by itself when it is ready.</span>`;
    $('result').textContent = 'Working out the fight.';
  };
  playing = false; busy();
  // Simulate in slices so the page stays responsive, then swap the finished fight in.
  const slice = () => {
    if (id !== runId) return;
    const until = performance.now() + 45;
    while (!sim.done && performance.now() < until) sim.step();
    if (!sim.done) { busy(); setTimeout(slice, 0); return; }
    kept.set(key, sim); if (kept.size > 8) kept.delete(kept.keys().next().value);
    playing = true; showFight(sim);
  };
  setTimeout(slice, 30);
}

// ── Controls ───────────────────────────────────────────────────────────────
$('play').addEventListener('click', () => { if (!playing && playhead >= duration() - 0.01) playhead = 0; playing = !playing; });
$('scrub').addEventListener('input', (e) => { playing = false; seek(Number(e.target.value) * duration()); });
$('speed').addEventListener('change', (e) => { speed = Number(e.target.value); });
$('next').addEventListener('click', () => { $('seed').value = Number($('seed').value) + 1; playing = true; runFight(); });
$('seed').addEventListener('change', () => { playing = true; runFight(); });
$('events').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) { seek(Number(li.dataset.t) - 0.4); playing = true; } });
$('events').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.click(); });
$('copy').addEventListener('click', async () => {
  const text = JSON.stringify(fightData());
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; }
  catch { $('json').textContent = JSON.stringify(fightData(), null, 1); $('copied').textContent = 'Copy was blocked here, so the full data is shown below to select.'; }
});
document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
  for (const t of ['log', 'bots', 'settings']) $('tab-' + t).hidden = t !== btn.dataset.tab;
}));
$('challenge').innerHTML = NAMED.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('') + '<option value="draw">Random round (from seed)</option>';
$('challenge').value = '0';
$('challenge').addEventListener('change', () => { playing = true; runFight(); });
for (const [id, def] of [['botA', 2], ['botB', 0]]) {
  $(id).innerHTML = ALL.map((r, i) => `<option value="${i}">${esc(r.build.name)}</option>`).join('');
  $(id).value = def;
  $(id).addEventListener('change', () => { playing = true; runFight(); });
}
// Curated fights, each picked to show one idea. Choosing a machine, challenge or seed by hand leaves the showcase.
const SHOWS = [
  { label: 'Sumo', a: 'Ox', b: 'Strider', ch: 'Downs', seed: 1, watch: 'Ox has no weapon. It is nearly a tonne on ten legs with a plough on a piston: it gets inboard of the enemy, leans in and shoves it toward the edge.' },
  { label: 'Hit and run', a: 'Hornet', b: 'Strider', ch: 'Open floor', seed: 1, watch: 'Hornet is the quick one: 6 m/s on two wheels, about three times a walker\'s pace. Its fist sits on a turret that stays pointed at the enemy whichever way the body is going. It runs in, punches, and gets out to open ground.' },
  { label: 'The ram', a: 'Slinger', b: 'Rover', ch: 'Open floor', seed: 1, watch: 'Rover is the fastest thing here. Its steel ram is on a piston, so when it arrives it shoves as well as hits.' },
  { label: 'Fist and clubs', a: 'Dreadnought', b: 'Warden', ch: 'Open floor', seed: 1, watch: 'Warden keeps the enemy out of its legs with fenders, punches it back with a piston fist, and brings two long clubs down on it. Watch the bars at the top: Dreadnought is taken apart a piece at a time.' },
  { label: 'The rotor', a: 'Thresher', b: 'Slinger', ch: 'Downs', seed: 1, watch: 'Thresher carries a steel bar spinning flat over its nose and walks it into legs and towers.' },
  { label: 'Winning the tangle', a: 'Scorpion', b: 'Bramble', ch: 'Downs', seed: 1, watch: 'Bramble has a rotor at each end and a saw bar on each flank, so whatever is locked against it is being hit. Scorpion answers with two claws and a tail club that comes over the top.' },
  { label: 'Clubs', a: 'Strider', b: 'Mantis', ch: 'Valley', seed: 1, watch: 'Mantis brings two steel clubs over and down. Two flat-topped hills stand either side of the middle, each with one ramp.' },
  { label: 'High ground', a: 'Mantis', b: 'Slinger', ch: 'High ground', seed: 1, watch: 'A flat-topped hill with steep sides and two ramps. Slinger allows for the difference in height when it throws; Mantis has to come to it.' },
  { label: 'Two giants', a: 'Scorpion', b: 'Dreadnought', ch: 'Downs', seed: 1, watch: 'The two largest fighting machines. Dreadnought carries a spinning bar at each end under an armoured shell.' },
  { label: 'Across the gap', a: 'Centipede', b: 'Rover', ch: 'Narrow gap', seed: 1, watch: 'A 1.5 m gap separates the two machines, and neither wheels nor six legs can cross it. Centipede is long enough to walk straight over.' },
  { label: 'Icy heights', a: 'Dreadnought', b: 'Mantis', ch: 'Icy heights', seed: 1, watch: 'The hill again with a quarter of the usual grip. Ramps that were easy are now a slide, and a shove goes a long way.' },
  { label: 'Low gravity', a: 'Slinger', b: 'Thresher', ch: 'Low gravity valley', seed: 1, watch: 'A third of normal gravity. Throws carry three times as far and a hit sends a machine a long way.' },
];
let showing = -1;
function markShow(i) { showing = i; document.querySelectorAll('#shows button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i))); $('watch').textContent = i >= 0 ? SHOWS[i].watch : ''; }
function playShow(i) {
  const sh = SHOWS[i], idx = (n) => ALL.findIndex((r) => r.build.name === n);
  $('botA').value = idx(sh.a); $('botB').value = idx(sh.b);
  $('challenge').value = String(NAMED.findIndex((c) => c.name === sh.ch)); $('seed').value = sh.seed;
  markShow(i); playing = true; runFight();
}
$('shows').innerHTML = SHOWS.map((sh, i) => `<button data-i="${i}" aria-pressed="false">${esc(sh.label)}</button>`).join('');
$('shows').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) playShow(Number(b.dataset.i)); });
for (const id of ['botA', 'botB', 'challenge', 'seed']) $(id).addEventListener('change', () => markShow(-1));
$('next').addEventListener('click', () => markShow(-1));
const knobs = [
  ['k-break', 'o-break', (v) => { cfg.breakage.scale = v; }, (v) => v.toFixed(1) + 'x', () => CONFIG.breakage.scale],
  ['k-grav', 'o-grav', (v) => { cfg.physics.gravity = v; }, (v) => v.toFixed(1), () => CONFIG.physics.gravity],
  ['k-grip', 'o-grip', (v) => { cfg.arena.grip = v; }, (v) => v.toFixed(2), () => CONFIG.arena.grip],
  // Weapon power scales motor-joint speed and torque together. Fast weapons need finer time steps.
  ['k-power', 'o-power', (v) => { cfg.joints.motor.maxSpeed = CONFIG.joints.motor.maxSpeed * v; cfg.joints.motor.torque = CONFIG.joints.motor.torque * v * (v > 1 ? 1.25 : 1); }, (v) => v.toFixed(1) + 'x', () => 1],
];
for (const [id, out, set, fmt] of knobs) $(id).addEventListener('input', (e) => { const v = Number(e.target.value); set(v); $(out).textContent = fmt(v); renderConfig(); });
$('rerun').addEventListener('click', () => { playing = true; runFight(); });
$('reset').addEventListener('click', () => { cfg = structuredClone(CONFIG); for (const [id, out, , fmt, def] of knobs) { $(id).value = def(); $(out).textContent = fmt(def()); } playing = true; runFight(); });

let last = performance.now(), lastEvent = -1;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (match) {
    const d = duration();
    if (playing) { playhead += dt * speed; if (playhead >= d) { playhead = d; playing = false; } }
    pose(playhead);
    $('scrub').value = d ? playhead / d : 0;
    $('clock').textContent = `${playhead.toFixed(1)} / ${d.toFixed(1)} s`;
    $('play').textContent = playing ? 'Pause' : playhead >= d - 0.01 ? 'Replay' : 'Play';
    $('verdict').hidden = !(playhead >= d - 0.01); renderHud();
    let cur = -1;
    match.events.forEach((e, i) => { if (e.t <= playhead + 0.05) cur = i; });
    if (cur !== lastEvent) {
      lastEvent = cur;
      const items = $('events').children;
      for (let i = 0; i < items.length; i++) items[i].classList.toggle('now', i === cur);
      if (playing && items[cur] && !$('tab-log').hidden) { const pane = $('tab-log'), li = items[cur]; if (li.offsetTop > pane.scrollTop + pane.clientHeight - 60 || li.offsetTop < pane.scrollTop) pane.scrollTop = li.offsetTop - pane.clientHeight / 2; }
    }
    render();
  }
  requestAnimationFrame(frame);
}
playShow(0);
requestAnimationFrame(frame);
