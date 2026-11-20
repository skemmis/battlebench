// A quick look at how the machines are doing: each machine fights two others on a few maps, a dozen or so
// fights in all, spread over the cores. Usage: npm run quick -- [fights=12] [seed=1]
// For the full every-pair table use the gauntlet; this is for iterating.
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createMatch } from '../src/sim.js';
import { ALL } from '../src/bots.js';
import { NAMED } from '../src/challenges.js';

const MAPS = ['Valley', 'High ground', 'Downs', 'Open floor'];
const count = Number(process.argv[2] || 12), seed = Number(process.argv[3] || 1);
// Fight k pairs machine k with the machine (1 + k / n) places after it, so the pairings change as the list goes on.
const fight = (k) => { const n = ALL.length, i = k % n, j = (i + 1 + (Math.floor(k / n) % (n - 1))) % n; return { i, j, map: MAPS[(k + Math.floor(k / n)) % MAPS.length] }; };
if (process.argv[4] === 'worker') {
  const [w, n] = process.argv[5].split('/').map(Number);
  for (let k = 0; k < count; k++) {
    if (k % n !== w) continue;
    const f = fight(k), t0 = Date.now();
    const m = createMatch({ builds: [ALL[f.i].build, ALL[f.j].build], programs: [ALL[f.i].program, ALL[f.j].program], seed, challenge: NAMED.find((c) => c.name === f.map) });
    // Count the seconds the two spend at close quarters (cores within 3.5 m), and what broke while they were.
    let close = 0, sec = -1, closeNow = false, closeBreaks = 0, seen = 0;
    while (!m.done) {
      m.step();
      if (Math.floor(m.t) !== sec) { sec = Math.floor(m.t); const a = m.bots[0].core.body.position, b = m.bots[1].core.body.position; closeNow = Math.hypot(a.x - b.x, a.z - b.z) < 3.5; if (closeNow) close++; }
      for (; seen < m.events.length; seen++) if (m.events[seen].type === 'part_lost' && closeNow) closeBreaks++;
    }
    console.log(JSON.stringify({ k, ...f, winner: m.result.winner, reason: m.result.reason, t: m.result.t, whole: m.bots.map((b) => Math.round(100 * (1 - (b.brokenMass || 0) / b.startMass))), lost: m.events.filter((e) => e.type === 'part_lost').length, close, closeBreaks, wall: Math.round((Date.now() - t0) / 1000) }));
  }
} else {
  const n = Math.max(1, Math.min(cpus().length, count)), self = fileURLToPath(import.meta.url), t0 = Date.now();
  const rows = (await Promise.all(Array.from({ length: n }, (_, w) => new Promise((done) => {
    let buf = '';
    const p = spawn(process.execPath, [self, String(count), String(seed), 'worker', `${w}/${n}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => { buf += d; });
    p.on('close', () => done(buf.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))));
  })))).flat().sort((a, b) => a.k - b.k);
  const name = (i) => ALL[i].build.name, ends = {};
  for (const r of rows) {
    ends[r.reason] = (ends[r.reason] || 0) + 1;
    console.log(`${r.map.padEnd(12)} ${name(r.i).padEnd(12)} v ${name(r.j).padEnd(12)} ${r.reason.padEnd(15)} ${(r.winner == null ? 'draw' : name(r.winner === 0 ? r.i : r.j)).padEnd(12)} ${String(r.t).padStart(5)} s  intact ${r.whole.join('/')}  breaks ${r.lost}  close ${r.close} s`);
  }
  const ko = (ends.destroyed || 0) + (ends.ring_out || 0), draws = Object.entries(ends).filter(([k]) => k.includes('draw') || k.includes('double')).reduce((a, [, v]) => a + v, 0);
  const cs = rows.reduce((a, r) => a + r.close, 0), cb = rows.reduce((a, r) => a + r.closeBreaks, 0);
  console.log(`\nAt close quarters: ${cs} s in all, ${cb} breaks, one every ${cb ? (cs / cb).toFixed(1) : '-'} s.`);
  console.log(`${rows.length} fights in ${Math.round((Date.now() - t0) / 1000)} s. Knockouts ${ko}, on damage ${rows.length - ko - draws}, draws ${draws}.`);
}
