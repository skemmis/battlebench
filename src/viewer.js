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
const camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.5);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(7, 14, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
scene.add(hemi, sun);

const arena = new THREE.Group();
scene.add(arena);
let floorMat, wallMat, gridLines, edgeLine, targetRing, propMeshes = [];
function buildArena() {
  arena.clear();
  const ch = match.challenge, t = cfg.arena.thickness;
  floorMat = new THREE.MeshStandardMaterial({ roughness: ch.surface.grip < 0.5 ? 0.25 : 0.9, metalness: 0.05 });
  wallMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
  const grid = [], edge = [];
  for (const sl of ch.floor) {
    const top = sl.top || 0;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sl.w, t + top, sl.d), floorMat);
    slab.position.set(sl.x, (top - t) / 2, sl.z); slab.receiveShadow = true; slab.castShadow = top > 0;
    arena.add(slab);
    const x0 = sl.x - sl.w / 2, x1 = sl.x + sl.w / 2, z0 = sl.z - sl.d / 2, z1 = sl.z + sl.d / 2;
    const g = top + 0.005, e = top + 0.01;
    for (let x = Math.ceil(x0); x <= x1; x++) grid.push(x, g, z0, x, g, z1);
    for (let z = Math.ceil(z0); z <= z1; z++) grid.push(x0, g, z, x1, g, z);
    edge.push(x0, e, z0, x1, e, z0, x1, e, z0, x1, e, z1, x1, e, z1, x0, e, z1, x0, e, z1, x0, e, z0);
  }
  const lines = (pts, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return new THREE.LineSegments(g, mat); };
  gridLines = lines(grid, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }));
  edgeLine = lines(edge, new THREE.LineBasicMaterial());
  arena.add(gridLines, edgeLine);
  for (const wl of ch.walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wl.w, wl.h, wl.d), wallMat);
    wall.position.set(wl.x, wl.h / 2, wl.z); wall.castShadow = true; wall.receiveShadow = true;
    arena.add(wall);
  }
  // The point to hold: a flat ring on the floor that moves with the objective.
  targetRing = null;
  if (targetAt(ch, 0)) {
    targetRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 40), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
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
  else if (sp.kind === 'wheel') { geo = new THREE.CylinderGeometry(sp.radius, sp.radius, sp.width, 22); geo.rotateZ(Math.PI / 2); }
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
  if (sp.kind === 'wheel') {
    // A pale stripe across the hub so you can see the wheel turning.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(sp.width * 1.04, sp.radius * 1.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.6 }));
    mesh.add(stripe);
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
  if (t === 'drive' || t === 'track') return new THREE.Color(0x2b2f36);
  if (t === 'thruster') return new THREE.Color(0x8d99a8);
  if (t === 'gripper') return new THREE.Color(0xd9b24a);
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
    wallMat.color.set(css('--grid'));
    gridLines.material.color.set(css('--grid'));
    edgeLine.material.color.set(css('--warn'));
    if (targetRing) targetRing.material.color.set(css('--warn'));
    propMeshes.forEach((mesh) => mesh.material.color.set(0xc9a35c));
  }
  if (match) meshes.forEach((mesh, i) => { mesh.userData.base = partColor(match.parts[i]); });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Camera: orbits the midpoint between the two cores ───────────────────────
const cam = { az: 0.7, el: 0.62, zoom: 1, target: new THREE.Vector3(), dist: 16 };
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

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), grey = new THREE.Color(0x7d848e), spark = new THREE.Color(0xfff2b0), glow = new THREE.Color(0xff7a1a);
let flashes = [];
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
    // A thruster that is firing or a gripper that is holding glows.
    if (flags[i] & 2) mesh.material.color.lerp(glow, 0.85);
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
  const want = Math.max(9, cores[0].distanceTo(cores[1]) * 1.25 + 7);
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
  $('verdict').textContent = '';
  $('cond').innerHTML = s.bots.map((b, i) => `<div class="${TEAM[i]}"><b>${esc(b.name)}</b><span>${Math.round(b.massLeft * 100)}% of its mass still attached</span><span>${b.partsLost.length ? 'Lost ' + esc(b.partsLost.join(', ')) : 'No parts lost'}</span><span>${b.hitsTaken} hard hits taken</span></div>`).join('');
  $('events').innerHTML = match.events.map((e, i) => `<li class="${e.type}" data-i="${i}" data-t="${e.t}" tabindex="0"><time>${e.t.toFixed(1)}</time><span><i class="who ${e.bot == null ? '' : TEAM[e.bot]}"></i>${esc(e.text)}</span></li>`).join('');
  const d = duration();
  $('ticks').innerHTML = match.events.filter((e) => e.type === 'part_lost' || e.type === 'hit' || e.type === 'flipped' || e.type === 'released' || e.type === 'gripped').map((e) => `<i class="${e.type === 'part_lost' ? 'lost' : ''}" style="left:${(e.t / d) * 100}%"></i>`).join('');
  const data = fightData();
  const shown = { ...data, motionTrack: { ...data.motionTrack, samples: data.motionTrack.samples.slice(0, 3).concat([`… ${data.motionTrack.samples.length - 3} more samples; Copy JSON includes them all`]) } };
  $('json').textContent = JSON.stringify(shown, null, 1);
}
function renderBots() {
  $('tab-bots').innerHTML = `<p class="note">A bot is two things: a parts list and a control program. The program reads sensors and sets motors ${cfg.physics.controlHz} times a second. Positions are in metres from the core; +z is forward, +y is up.</p>` + match.bots.map((b, i) => {
    const c = b.check;
    return `<div class="bot"><div><h3 class="${TEAM[i]}">${esc(b.name)}</h3><p>${esc(b.build.note || '')}</p>
      <div class="meter"><span>mass ${c.mass} / ${cfg.budget.mass} kg</span><span>cost ${c.cost} / ${cfg.budget.cost}</span><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? 'build passes checks' : esc(c.errors.join(' '))}</span></div></div>
      <details><summary>Build (${b.build.parts.length} parts)</summary><pre>${esc('{\n "name": ' + JSON.stringify(b.build.name) + ',\n "parts": [\n' + b.build.parts.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n ]\n}')}</pre></details>
      <details><summary>Control program</summary><pre>${esc(b.program.toString())}</pre></details></div>`;
  }).join('');
}
function renderConfig() { $('config').textContent = JSON.stringify(cfg, null, 1); $('version').textContent = 'prototype ' + cfg.version; }

let runId = 0;
function runFight() {
  const seed = Math.max(1, Math.floor(Number($('seed').value) || 1));
  $('seed').value = seed;
  const id = ++runId;
  const pick = [ALL[Number($('botA').value)], ALL[Number($('botB').value)]];
  const chosen = $('challenge').value;
  const challenge = chosen === 'draw' ? drawChallenge(seed) : NAMED[Number(chosen)];
  const sim = createMatch({ builds: pick.map((r) => r.build), programs: pick.map((r) => r.program), seed, config: structuredClone(cfg), challenge });
  // Simulate in short slices so the page stays responsive, then swap the finished fight in.
  const slice = () => {
    if (id !== runId) return;
    const until = performance.now() + 14;
    while (!sim.done && performance.now() < until) sim.step();
    if (!sim.done) { $('result').textContent = `Simulating the fight: ${sim.t.toFixed(0)} of up to ${cfg.match.maxSeconds} seconds.`; setTimeout(slice, 0); return; }
    match = sim;
    flashes = sim.events.filter((e) => e.type === 'hit' && e.flash).map((e) => ({ t: e.t, parts: e.flash }));
    buildArena(); buildMeshes(); applyTheme();
    playhead = 0; lastEvent = -1;
    pose(0); cam.target.set(0, 0, 0);
    renderLog(); renderBots(); renderConfig();
    window.__fight = fightData();
  };
  window.__fight = null;
  setTimeout(slice, 0);
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
$('challenge').value = '9';
$('challenge').addEventListener('change', () => { playing = true; runFight(); });
for (const [id, def] of [['botA', 10], ['botB', 9]]) {
  $(id).innerHTML = ALL.map((r, i) => `<option value="${i}">${esc(r.build.name)}</option>`).join('');
  $(id).value = def;
  $(id).addEventListener('change', () => { playing = true; runFight(); });
}
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
    $('verdict').textContent = playhead >= d - 0.01 ? match.result.text : '';
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
runFight();
requestAnimationFrame(frame);
