// Every bot against every other bot over several seeds. Usage: npm run tournament -- 6
import { CONFIG, createMatch, validateBuild } from '../src/sim.js';
import { ALL } from '../src/bots.js';
const seeds = Number(process.argv[2] || 6);
for (const r of ALL) { const c = validateBuild(r.build); console.log(r.build.name.padEnd(10), `mass ${c.mass}`.padEnd(12), `cost ${c.cost}`.padEnd(11), c.ok ? 'ok' : c.errors.join(' ')); }
const tally = ALL.map(() => ({ w: 0, l: 0, d: 0, lost: 0 })); const reasons = {}; const tot = { t: 0, hits: 0, lost: 0, flips: 0, air: 0, n: 0, quiet: 0 };
console.log();
for (let i = 0; i < ALL.length; i++) for (let j = i + 1; j < ALL.length; j++) {
  let line = `${ALL[i].build.name} v ${ALL[j].build.name}`.padEnd(24); let wi = 0, wj = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const m = createMatch({ builds: [ALL[i].build, ALL[j].build], programs: [ALL[i].program, ALL[j].program], seed, config: CONFIG }).run();
    const r = m.result; reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const ev = (t) => m.events.filter((e) => e.type === t).length;
    const lost = m.events.filter((e) => e.type === 'part_lost').reduce((n, e) => n + e.parts.length, 0);
    tot.t += r.t; tot.hits += ev('hit'); tot.lost += lost; tot.flips += ev('flipped'); tot.air += ev('airborne'); tot.n++; if (ev('hit') < 3 && !lost) tot.quiet++;
    if (r.winner === 0) { wi++; tally[i].w++; tally[j].l++; } else if (r.winner === 1) { wj++; tally[j].w++; tally[i].l++; } else { tally[i].d++; tally[j].d++; }
    m.bots.forEach((b, k) => { tally[k ? j : i].lost += b.parts.filter((p) => !p.live).length; });
    line += `${r.winner == null ? '=' : r.winner === 0 ? 'A' : 'B'}${r.reason.split('_').map((w) => w[0]).join('')}${String(Math.round(r.t)).padStart(3)}s `;
  }
  console.log(line, ` ${wi}-${wj}`);
}
console.log('\nBot         W   L   D  parts lost');
ALL.forEach((r, i) => console.log(r.build.name.padEnd(10), String(tally[i].w).padStart(3), String(tally[i].l).padStart(3), String(tally[i].d).padStart(3), String(tally[i].lost).padStart(6)));
console.log('\nEndings:', reasons);
console.log(`Per fight: ${(tot.t / tot.n).toFixed(1)} s, ${(tot.hits / tot.n).toFixed(1)} hard hits, ${(tot.lost / tot.n).toFixed(1)} parts lost, ${(tot.flips / tot.n).toFixed(2)} flips, ${(tot.air / tot.n).toFixed(2)} launches. Quiet fights (under 3 hits, nothing lost): ${tot.quiet} of ${tot.n}.`);
