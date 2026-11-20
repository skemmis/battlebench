// Design rounds: new machines are written (by a model or by hand) into evolve/designs/, put through a short
// ladder of tests, and the ones that hold their own join the league. Every fight is appended to
// evolve/results.jsonl with a short account of what happened, which is what the next round's designer reads.
//
//   npm run round -- league            the table as it stands
//   npm run round -- baseline [n=2]    seed the table: every league machine fights n others
//   npm run round -- brief             write evolve/brief.md, the page a designer reads before a round
//   npm run round -- design [n=6]      ask a model for n new machines (needs an Anthropic credential)
//   npm run round -- test [names...]   run the ladder on the named designs, or on every design not yet tested
//
// The ladder, cheapest first: 1 build check, 2 six seconds alone to see that it moves and holds together,
// 3 one fight against the champion, 4 three more fights for those that were not knocked out in step 3.
import { spawn } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMatch, validateBuild, CONFIG } from '../src/sim.js';
import { ALL } from '../src/bots.js';
import { NAMED, edgeDistance } from '../src/challenges.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), EV = join(ROOT, 'evolve'), DESIGNS = join(EV, 'designs');
const RESULTS = join(EV, 'results.jsonl'), SELF = fileURLToPath(import.meta.url);
const MAPS = ['Valley', 'High ground', 'Downs'];
const MODEL = process.env.ROUND_MODEL || 'claude-opus-5-5';
const r1 = (x) => Math.round(x * 10) / 10;

// ── Machines ───────────────────────────────────────────────────────────────
const designFiles = () => (existsSync(DESIGNS) ? readdirSync(DESIGNS).filter((f) => f.endsWith('.js')).sort() : []);
async function loadDesign(file) {
  try {
    const mod = await import(pathToFileURL(join(DESIGNS, file)).href);
    if (!mod.build || typeof mod.program !== 'function') return { file, error: 'The file must export "build" and a "program" function.' };
    return { file, name: mod.build.name, build: mod.build, program: mod.program, idea: mod.idea || '', target: mod.target || null, still: !!mod.still };
  } catch (e) { return { file, error: `It does not load: ${e.message}` }; }
}
async function machines() {
  const map = new Map(ALL.map((m) => [m.build.name, { name: m.build.name, build: m.build, program: m.program, roster: true }]));
  const designs = await Promise.all(designFiles().map(loadDesign));
  for (const d of designs) if (!d.error && !map.has(d.name)) map.set(d.name, d);
  return { map, designs };
}

// ── Results and the league ─────────────────────────────────────────────────
const rows = () => (existsSync(RESULTS) ? readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const save = (list) => { mkdirSync(EV, { recursive: true }); appendFileSync(RESULTS, list.map((r) => JSON.stringify(r)).join('\n') + '\n'); };
// League members: the hand-built roster, plus every design a round admitted.
function members(all, map) {
  const verdict = new Map(); for (const r of all) if (r.type === 'verdict') verdict.set(r.name, r.admitted);
  return [...map.values()].filter((m) => m.roster || verdict.get(m.name)).map((m) => m.name);
}
// Ratings from every recorded fight, gone over a few times so the order they were fought in matters little.
function league(all, names) {
  const t = new Map(names.map((n) => [n, { name: n, rating: 1000, w: 0, d: 0, l: 0, ko: 0, fights: 0 }]));
  const fights = all.filter((r) => r.type === 'fight' && t.has(r.a) && t.has(r.b));
  for (let pass = 0; pass < 4; pass++) for (const f of fights) {
    const a = t.get(f.a), b = t.get(f.b), sa = f.winner == null ? 0.5 : f.winner === f.a ? 1 : 0;
    const ea = 1 / (1 + 10 ** ((b.rating - a.rating) / 400)), k = 24 / (pass + 1);
    a.rating += k * (sa - ea); b.rating -= k * (sa - ea);
  }
  for (const f of fights) for (const [me, other] of [[f.a, f.b], [f.b, f.a]]) {
    const e = t.get(me); e.fights++;
    if (f.winner == null) e.d++; else if (f.winner === me) { e.w++; if (f.reason === 'ring_out' || f.reason === 'destroyed') e.ko++; } else e.l++;
    void other;
  }
  return [...t.values()].sort((x, y) => y.rating - x.rating);
}
// Top speed is from the movement test: the most ground covered in any half second of a six second run.
const table = (lg, all = []) => lg.map((e, i) => { const mv = [...all].reverse().find((r) => r.type === 'move' && r.a === e.name); return `${String(i + 1).padStart(2)}. ${e.name.padEnd(14)} ${String(Math.round(e.rating)).padStart(5)}   won ${e.w} (${e.ko} by knockout), drew ${e.d}, lost ${e.l}${mv && mv.speed != null ? `   top speed ${mv.speed} m/s` : ''}`; }).join('\n');

// ── One fight, and the account of it ───────────────────────────────────────
// The account is what a designer reads instead of watching: who said what, what came off whom and what took it
// off, how near each got to the edge, and how it ended. Short enough that twenty of them fit on a page.
function account(m) {
  const n = m.bots.map((b) => b.name), lines = [], last = [new Map(), new Map()], hits = new Map();
  let nextMark = 10;
  const where = (t) => {
    const row = m.track.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), m.track[0]); if (!row) return '';
    const p = [row[0], row[1]], gap = Math.hypot(p[0].x - p[1].x, p[0].z - p[1].z);
    return `${r1(gap)} m apart; from the edge: ${n[0]} ${r1(edgeDistance(m.challenge, p[0].x, p[0].z))} m, ${n[1]} ${r1(edgeDistance(m.challenge, p[1].x, p[1].z))} m`;
  };
  for (const e of m.events) {
    while (e.t >= nextMark) { lines.push(`${nextMark} s: ${where(nextMark)}`); nextMark += 10; }
    if (e.type === 'intent') { const key = e.text.replace(/[\d.]+/g, '#'), seen = last[e.bot].get(key); if (seen === undefined || e.t - seen > 12) lines.push(`${r1(e.t)} s: ${e.text}`); last[e.bot].set(key, e.t); }  // the same words with a new number are not news
    else if (e.type === 'hit') { const k = `${e.striker} on ${n[e.bot]}`, h = hits.get(k) || { count: 0, max: 0 }; h.count++; h.max = Math.max(h.max, e.impulse || 0); hits.set(k, h); }
    else if (e.type === 'part_lost') lines.push(`${r1(e.t)} s: ${n[e.bot]} lost ${e.parts.length > 4 ? e.parts.slice(0, 4).join(', ') + ` and ${e.parts.length - 4} more` : e.parts.join(', ')} to ${e.by || 'a blow'}`);
    else if (['flipped', 'righted', 'airborne', 'program_error'].includes(e.type)) lines.push(`${r1(e.t)} s: ${e.text}`);
  }
  const top = [...hits.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([k, h]) => `${k} x${h.count} (hardest ${Math.round(h.max)})`);
  if (top.length) lines.push(`Blows: ${top.join('; ')}`);
  lines.push(`End, ${m.result.t} s: ${m.result.text} (${where(m.result.t)})`);
  return lines.length > 40 ? [...lines.slice(0, 18), `... ${lines.length - 36} lines left out ...`, ...lines.slice(-18)] : lines;
}
function runFight(spec, map) {
  const A = map.get(spec.a), B = map.get(spec.b), t0 = Date.now();
  const m = createMatch({ builds: [A.build, B.build], programs: [A.program, B.program], seed: spec.seed, challenge: NAMED.find((c) => c.name === spec.map) });
  while (!m.done) m.step();
  const whole = m.bots.map((b) => Math.round(100 * (1 - (b.brokenMass || 0) / b.startMass)));
  return { type: 'fight', ...spec, winner: m.result.winner == null ? null : [spec.a, spec.b][m.result.winner], reason: m.result.reason, t: m.result.t, intact: whole, wall: Math.round((Date.now() - t0) / 1000), account: account(m) };
}
// Alone on the open floor with a parked machine to walk at: does it cover ground, and does it hold together?
function runMove(spec, map) {
  const A = map.get(spec.a), park = ALL.find((x) => x.build.name === 'Rover') || ALL[0];
  const m = createMatch({ builds: [A.build, park.build], programs: [A.program, () => {}], seed: 1, challenge: NAMED[0] });
  const p0 = m.bots[0].core.body.position.clone(); let far = 0, mark = { t: 0, x: p0.x, z: p0.z }, speed = 0;
  while (!m.done && m.t < 6) {
    m.step(); const p = m.bots[0].core.body.position; far = Math.max(far, Math.hypot(p.x - p0.x, p.z - p0.z));
    // Top speed: the most ground covered in any half second.
    if (m.t - mark.t >= 0.5) { speed = Math.max(speed, Math.hypot(p.x - mark.x, p.z - mark.z) / (m.t - mark.t)); mark = { t: m.t, x: p.x, z: p.z }; }
  }
  const lost = m.events.filter((e) => e.type === 'part_lost' && e.bot === 0).flatMap((e) => e.parts);
  const err = m.events.find((e) => e.type === 'program_error' && e.bot === 0);
  return { type: 'move', a: spec.a, moved: r1(far), speed: r1(speed), lost, error: err ? err.text : null, said: [...new Set(m.events.filter((e) => e.type === 'intent' && e.bot === 0).map((e) => e.text))].slice(0, 4) };
}
// Run a list of jobs over the cores. Each worker is this same script, handed its share of the list.
async function runAll(specs) {
  if (!specs.length) return [];
  const n = Math.max(1, Math.min(cpus().length, specs.length)), file = join(tmpdir(), `round-${process.pid}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(specs));
  const out = (await Promise.all(Array.from({ length: n }, (_, w) => new Promise((done) => {
    let buf = '';
    const p = spawn(process.execPath, [SELF, 'worker', file, `${w}/${n}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => { buf += d; });
    p.on('close', () => done(buf.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))));
  })))).flat();
  return specs.map((_, k) => out.find((o) => o.k === k) || { k, type: 'crash', ...specs[k] });
}
const line = (f) => `${f.map.padEnd(12)} ${f.a.padEnd(13)} v ${f.b.padEnd(13)} ${(f.winner || 'draw').padEnd(13)} ${f.reason.padEnd(14)} ${String(f.t).padStart(5)} s  intact ${f.intact.join('/')}`;

// ── The page a designer reads ──────────────────────────────────────────────
function brief(all, map, designs) {
  const names = members(all, map), lg = league(all, names), b = CONFIG.budget, mt = CONFIG.match;
  const fights = all.filter((r) => r.type === 'fight'), lastRound = Math.max(0, ...all.map((r) => r.round || 0));
  const acct = (f) => `### ${f.a} v ${f.b} on ${f.map}: ${f.winner ? f.winner + ' won' : 'draw'} (${f.reason})\n${f.account.map((l) => '- ' + l).join('\n')}`;
  const verdicts = all.filter((r) => r.type === 'verdict');
  const top = lg.slice(0, 3).map((e) => e.name);
  // For each of the top three: its latest win and its latest loss, so the designer sees how it wins and what beats it.
  const shown = new Set();
  for (const nm of top) for (const want of [true, false]) { const f = [...fights].reverse().find((x) => (x.a === nm || x.b === nm) && x.winner && (x.winner === nm) === want && !shown.has(x)); if (f) shown.add(f); }
  for (const f of fights.filter((x) => x.round === lastRound && x.stage)) shown.add(f);
  return `# Design round ${lastRound + 1}: brief

You are designing fighting machines for BattleBotBench. Read README.md for how machines are built and how fights
are judged. This page is the state of play.

## The rules that matter
- A fight lasts at most ${mt.maxSeconds} s. Win by ring-out (the enemy's core goes off the floor) or by breaking more than ${Math.round(mt.wreckShare * 100)}% of the enemy's mass off its core. Otherwise the more intact machine wins if the gap is over ${Math.round(mt.intactMargin * 100)}%, else a draw.
- Limits: ${b.mass} kg, cost ${b.cost}, ${b.maxParts} parts, a ${b.box.join(' x ')} m box around the core, program at most ${CONFIG.program.maxChars} characters.
- No ready-made parts. Plain pieces, four materials, fixed, hinge, motor and piston joints.
- Maps this round: ${MAPS.join(', ')}. Rings are ${NAMED.filter((c) => MAPS.includes(c.name)).map((c) => c.floor[0].w).join(', ')} m across.

## The league
${table(lg, all)}

${lg.map((e) => `- **${e.name}**: ${map.get(e.name).build.note || map.get(e.name).idea || ''}`).join('\n')}

## What earlier rounds tried
${verdicts.length ? verdicts.map((v) => `- Round ${v.round}, ${v.name}: ${v.admitted ? 'admitted' : 'not admitted'}. ${v.why}${v.idea ? ' Idea: ' + v.idea : ''}`).join('\n') : 'Nothing yet. This is the first round.'}

## Fights worth reading
${[...shown].map(acct).join('\n\n') || 'No fights recorded yet.'}

## What to hand in
One file per machine in evolve/designs/, named after the machine in lower case. Each file:

\`\`\`js
import { kit } from '../kit.js';
const { hexFrame, walk, stalk, righting, WALKER, beam, plate, block } = kit;   // any helper from src/bots.js
export const idea = 'One or two sentences: what this machine does that nothing in the league does, and why it should work.';
export const target = '${top[0] || 'Ox'}';        // optional: the league machine it is built to beat
export const build = { name: 'Name', note: 'What it is, for the viewer.', parts: [ /* ... */ ] };
export function program(s, out, mem, lib) { /* ... */ }
\`\`\`

What makes a good entry:
- Quick and exact beats big and slow. The league's machines are clumsy and lumbering, and the aim of these rounds is machines that move fast, turn sharply, stop where they mean to and strike on time. The league table gives each machine's top speed over open ground; beat it. Spend mass on motors and stiffness before armour, and close every motion on a measured angle or distance, not on a timer.
- A mechanism the league does not have, not a tuned copy of a machine in it. Say in "idea" what is new.
- It must walk. A machine that cannot cover a metre in six seconds, or sheds parts standing still, is dropped before it fights.
- The program should react to the fight: where the edge is, what the enemy is doing, what it has lost. Use out.say so the account shows its reasoning.
- Different entries should try different things. At least one should go after the champion, ${top[0] || 'the top machine'}, by name.
`;
}

// ── Asking a model for designs ─────────────────────────────────────────────
async function design(count, all, map, designs) {
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); } catch { console.error('The Anthropic SDK is not installed. Run npm install.'); process.exit(1); }
  const client = new Anthropic();
  const read = (p) => readFileSync(join(ROOT, p), 'utf8'), sim = read('src/sim.js');
  const prompt = `${brief(all, map, designs)}

## Reference: README.md
${read('README.md')}

## Reference: the settings (src/sim.js, CONFIG)
\`\`\`js
${sim.slice(sim.indexOf('export const CONFIG'), sim.indexOf('export function partSpec'))}
\`\`\`

## Reference: the helper library passed to every program as "lib" (src/lib.js)
\`\`\`js
${read('src/lib.js')}
\`\`\`

## Reference: every machine in the roster, and the building helpers (src/bots.js)
\`\`\`js
${read('src/bots.js')}
\`\`\`

## Your task
Design ${count} new machines for this round. Think about what wins in this ring and what the league is missing
before you write anything, and make the ${count} different from each other. Names already taken: ${[...map.keys(), ...designs.map((d) => d.name)].filter(Boolean).join(', ')}.

Reply with ${count} complete files and nothing else between them. Start each with a line of the form
\`=== evolve/designs/<name>.js ===\` and follow it with the file's contents in a js code block.`;
  console.log(`Asking ${MODEL} for ${count} designs (${Math.round(prompt.length / 1000)} thousand characters of brief and reference)...`);
  let msg;
  try {
    msg = await client.beta.messages.stream({
      model: MODEL, max_tokens: 64000, output_config: { effort: 'high' },
      // If the model declines, the API reruns the request on its fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    }).finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error('No working Anthropic credential. Set ANTHROPIC_API_KEY or run "ant auth login".');
    else if (e instanceof Anthropic.RateLimitError) console.error('Rate limited. Try again in a minute.');
    else if (e instanceof Anthropic.APIError) console.error(`API error ${e.status}: ${e.message}`);
    else console.error(e.message);
    process.exit(1);
  }
  if (msg.stop_reason === 'refusal') { console.error('The model declined the request.'); process.exit(1); }
  if (msg.stop_reason === 'max_tokens') console.error('The reply was cut off at the length limit; the last file may be incomplete.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const written = [];
  for (const mm of text.matchAll(/=== evolve\/designs\/([a-z0-9_-]+)\.js ===\s*```(?:js|javascript)?\n([\s\S]*?)\n```/g)) {
    const file = join(DESIGNS, mm[1] + '.js');
    if (existsSync(file)) { console.log(`${mm[1]}.js already exists, left alone.`); continue; }
    mkdirSync(DESIGNS, { recursive: true }); writeFileSync(file, mm[2] + '\n'); written.push(mm[1]);
  }
  console.log(`Wrote ${written.length} designs: ${written.join(', ') || 'none'}. Tokens: ${msg.usage.input_tokens} in, ${msg.usage.output_tokens} out. Served by ${msg.model}.`);
  if (!written.length) { writeFileSync(join(EV, 'last-reply.txt'), text); console.log('No files found in the reply; it is saved in evolve/last-reply.txt.'); }
}

// ── The ladder ─────────────────────────────────────────────────────────────
async function baseline(per, all, map) {
  const names = members(all, map), specs = [];
  names.forEach((a, i) => { for (let j = 1; j <= per; j++) { const b = names[(i + j * 3 + 1) % names.length]; if (b !== a) specs.push({ a, b, map: MAPS[(i + j) % MAPS.length], seed: 1, round: 0 }); } });
  console.log(`Baseline: ${specs.length} fights among ${names.length} machines...`);
  const out = (await runAll(specs)).filter((f) => f.type === 'fight');
  const moves = (await runAll(names.map((a) => ({ kind: 'move', a })))).filter((m) => m.type === 'move');
  save([...out, ...moves]);
  out.forEach((f) => console.log(line(f)));
  return [...out, ...moves];
}
async function test(wanted, all, map, designs) {
  const tested = new Set(all.filter((r) => r.type === 'verdict').map((r) => r.name));
  const pick = designs.filter((d) => (wanted.length ? wanted.includes(d.name) || wanted.includes(d.file.replace('.js', '')) : !tested.has(d.name)));
  if (!pick.length) { console.log('No untested designs in evolve/designs/.'); return; }
  if (!all.some((r) => r.type === 'fight')) all = [...all, ...(await baseline(2, all, map))];
  const round = 1 + Math.max(0, ...all.map((r) => r.round || 0)), verdicts = [], t0 = Date.now(), log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = (d, why) => { verdicts.push({ type: 'verdict', round, name: d.name || d.file, admitted: false, why, idea: d.idea || '' }); say(`  ${d.name || d.file}: out. ${why}`); };
  say(`Round ${round}: ${pick.length} designs.\n\nStep 1, build check`);
  let alive = [];
  for (const d of pick) {
    if (d.error) { out(d, d.error); continue; }
    if (map.get(d.name) !== d) { out(d, `The name "${d.name}" is already taken.`); continue; }
    const v = validateBuild(d.build);
    if (!v.ok) { out(d, v.errors.slice(0, 4).join(' ')); continue; }
    say(`  ${d.name}: ${d.build.parts.length} parts, ${v.mass} kg, cost ${v.cost}`); alive.push(d);
  }
  say('\nStep 2, moving alone for six seconds');
  const moves = await runAll(alive.map((d) => ({ kind: 'move', a: d.name })));
  save(moves.filter((m) => m.type === 'move').map((m) => ({ ...m, round })));
  alive = alive.filter((d, i) => {
    const mv = moves[i];
    if (mv.type === 'crash') { out(d, 'The simulator crashed running it.'); return false; }
    if (mv.error) { out(d, mv.error); return false; }
    if (mv.lost.length) { out(d, `It lost ${mv.lost.slice(0, 5).join(', ')} with nothing touching it.`); return false; }
    if (mv.moved < 1 && !d.still) { out(d, `It covered ${mv.moved} m in six seconds. It said: ${mv.said.join(' / ') || 'nothing'}.`); return false; }
    say(`  ${d.name}: covered ${mv.moved} m, top speed ${mv.speed} m/s`); return true;
  });
  const lg = league(all, members(all, map)).map((e) => e.name), champ = lg[0];
  say(`\nStep 3, one fight against the champion, ${champ}`);
  const first = (await runAll(alive.map((d, i) => ({ a: d.name, b: champ, map: MAPS[(round + i) % MAPS.length], seed: round, round, stage: 3 })))).filter((f) => f.type === 'fight');
  first.forEach((f) => say('  ' + line(f)));
  const fights = [...first];
  const through = alive.filter((d) => { const f = first.find((x) => x.a === d.name); if (!f) { out(d, 'The simulator crashed in its first fight.'); return false; } const ko = f.winner === champ && (f.reason === 'ring_out' || f.reason === 'destroyed'); if (ko) out(d, `Knocked out by ${champ} in ${f.t} s (${f.reason}).`); return !ko; });
  say('\nStep 4, three more fights each');
  const more = [];
  through.forEach((d, i) => {
    const foes = [...new Set([d.target, lg[1], lg[Math.floor(lg.length / 2)], lg[2], lg[3]].filter((x) => x && x !== champ && x !== d.name))].slice(0, 3);
    foes.forEach((b, j) => more.push({ a: d.name, b, map: MAPS[(round + i + j + 1) % MAPS.length], seed: round, round, stage: 4 }));
  });
  const rest = (await runAll(more)).filter((f) => f.type === 'fight'); rest.forEach((f) => say('  ' + line(f))); fights.push(...rest);
  say('\nVerdicts');
  for (const d of through) {
    const mine = fights.filter((f) => f.a === d.name), wins = mine.filter((f) => f.winner === d.name), beatChamp = wins.some((f) => f.b === champ);
    const admitted = beatChamp || wins.length >= 2, why = `Won ${wins.length} of ${mine.length}${wins.length ? ' (beat ' + wins.map((f) => f.b).join(', ') + ')' : ''}${beatChamp ? ', including the champion' : ''}.`;
    verdicts.push({ type: 'verdict', round, name: d.name, admitted, why, idea: d.idea });
    say(`  ${d.name}: ${admitted ? 'ADMITTED' : 'not admitted'}. ${why}`);
  }
  save([...fights, ...verdicts]);
  const after = rows();
  say(`\n${fights.length} fights in ${Math.round((Date.now() - t0) / 1000)} s.\n\nLeague after round ${round}\n${table(league(after, members(after, map)), after)}`);
  mkdirSync(join(EV, 'rounds'), { recursive: true });
  writeFileSync(join(EV, 'rounds', `round-${round}.md`), `# Round ${round}\n\n\`\`\`\n${log.join('\n')}\n\`\`\`\n\n## Accounts\n\n${fights.map((f) => `### ${f.a} v ${f.b} on ${f.map}: ${f.winner ? f.winner + ' won' : 'draw'} (${f.reason})\n${f.account.map((l) => '- ' + l).join('\n')}`).join('\n\n')}\n`);
}

// ── Commands ───────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'worker') {
  const specs = JSON.parse(readFileSync(args[0], 'utf8')), [w, n] = args[1].split('/').map(Number), { map } = await machines();
  for (let k = 0; k < specs.length; k++) {
    if (k % n !== w) continue;
    try { console.log(JSON.stringify({ k, ...(specs[k].kind === 'move' ? runMove(specs[k], map) : runFight(specs[k], map)) })); }
    catch (e) { console.error(`${specs[k].a}${specs[k].b ? ' v ' + specs[k].b : ''}: ${e.message}`); }
  }
} else {
  const { map, designs } = await machines(), all = rows();
  if (cmd === 'league') console.log(table(league(all, members(all, map)), all));
  else if (cmd === 'baseline') { await baseline(Number(args[0] || 2), all, map); const a = rows(); console.log('\n' + table(league(a, members(a, map)), a)); }
  else if (cmd === 'brief') { writeFileSync(join(EV, 'brief.md'), brief(all, map, designs)); console.log('Wrote evolve/brief.md'); }
  else if (cmd === 'design') await design(Number(args[0] || 6), all, map, designs);
  else if (cmd === 'test') await test(args, all, map, designs);
  else console.log('Usage: npm run round -- league | baseline [n] | brief | design [n] | test [names...]');
}
