// Runs many seeds and prints how the fights came out. Usage: npm run sweep -- 20
import { CONFIG, createMatch } from '../src/sim.js';
import { ROSTER } from '../src/bots.js';
const n = Number(process.argv[2] || 20);
const wins = [0, 0, 0]; let total = 0, lost = 0;
for (let seed = 1; seed <= n; seed++) {
  const m = createMatch({ builds: ROSTER.map((r) => r.build), programs: ROSTER.map((r) => r.program), seed, config: CONFIG }).run();
  const s = m.summary(); wins[s.result.winner ?? 2]++; total += s.result.t; lost += s.bots[0].partsLost.length + s.bots[1].partsLost.length;
  console.log(String(seed).padStart(3), s.result.reason.padEnd(16), String(s.result.t).padStart(5) + ' s ', s.bots.map((b) => `${b.name}: ${b.partsLost.join(', ') || 'intact'}`).join(' | '));
}
console.log(`\n${ROSTER[0].build.name} ${wins[0]}, ${ROSTER[1].build.name} ${wins[1]}, draws ${wins[2]}. Average length ${(total / n).toFixed(1)} s. Parts lost: ${lost}.`);
