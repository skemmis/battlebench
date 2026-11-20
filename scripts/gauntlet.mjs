// Every bot against every other bot in each of N drawn challenges. Usage: npm run gauntlet -- 12
// Shows who holds up when the conditions change, not who is best in one arena.
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createMatch } from '../src/sim.js';
import { ALL } from '../src/bots.js';
import { drawChallenge } from '../src/challenges.js';

const rounds = Number(process.argv[2] || 12);
if (process.argv[3] === 'worker') {
  // Worker: play the rounds whose number falls in this worker's share and print one JSON line per fight.
  const [k, n] = process.argv[4].split('/').map(Number);
  for (let round = 1; round <= rounds; round++) {
    if (round % n !== k) continue;
    const ch = drawChallenge(round);
    for (let i = 0; i < ALL.length; i++) for (let j = i + 1; j < ALL.length; j++) {
      const m = createMatch({ builds: [ALL[i].build, ALL[j].build], programs: [ALL[i].program, ALL[j].program], seed: round, challenge: ch }).run();
      const lost = m.events.filter((e) => e.type === 'part_lost').reduce((a, e) => a + e.parts.length, 0);
      console.log(JSON.stringify({ round, i, j, winner: m.result.winner, reason: m.result.reason, t: m.result.t, hits: m.events.filter((e) => e.type === 'hit').length, lost }));
    }
  }
} else {
  const n = Math.max(1, Math.min(cpus().length, rounds));
  const self = fileURLToPath(import.meta.url);
  const fights = (await Promise.all(Array.from({ length: n }, (_, k) => new Promise((done) => {
    let buf = '';
    const p = spawn(process.execPath, [self, String(rounds), 'worker', `${k}/${n}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => { buf += d; });
    p.on('close', () => done(buf.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))));
  })))).flat();
  const names = ALL.map((r) => r.build.name);
  const pts = (f, k) => (f.winner == null ? 0.5 : (f.winner === 0) === (k === f.i) ? 1 : 0);
  console.log('Rounds:');
  const perRound = [];
  for (let round = 1; round <= rounds; round++) {
    const ch = drawChallenge(round), fs = fights.filter((f) => f.round === round);
    const score = names.map((_, k) => fs.filter((f) => f.i === k || f.j === k).reduce((a, f) => a + pts(f, k), 0));
    perRound.push(score);
    const best = Math.max(...score);
    console.log(`${String(round).padStart(3)}  ${Object.values(ch.keys).join(', ').padEnd(34)} best: ${names.filter((_, k) => score[k] === best).join(', ')} (${best} of ${names.length - 1})`);
  }
  console.log('\nBot          points   W   L   D   best round  worst round  rounds won');
  names.forEach((name, k) => {
    const mine = fights.filter((f) => f.i === k || f.j === k);
    const w = mine.filter((f) => pts(f, k) === 1).length, d = mine.filter((f) => f.winner == null).length;
    const rs = perRound.map((s) => s[k]);
    const won = perRound.filter((s) => s[k] === Math.max(...s)).length;
    console.log(name.padEnd(11), String(w + d / 2).padStart(7), String(w).padStart(4), String(mine.length - w - d).padStart(3), String(d).padStart(3), String(Math.max(...rs)).padStart(9), String(Math.min(...rs)).padStart(12), String(won).padStart(11));
  });
  const reasons = {}; for (const f of fights) reasons[f.reason] = (reasons[f.reason] || 0) + 1;
  const avg = (key) => (fights.reduce((a, f) => a + f[key], 0) / fights.length).toFixed(1);
  console.log('\nEndings:', reasons);
  console.log(`Per fight: ${avg('t')} s, ${avg('hits')} hard hits, ${avg('lost')} parts lost. Quiet fights (under 3 hits, nothing lost): ${fights.filter((f) => f.hits < 3 && !f.lost).length} of ${fights.length}.`);
}
