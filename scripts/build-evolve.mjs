// Builds dist/evolve.html: the same page as dist/index.html, with every machine the design rounds admitted
// added to the list, so they can be watched. Run after a round: npm run round:page
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { kit } from '../evolve/kit.js';

const CDN = { three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', cannon: 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js' };
const at = (p) => new URL('../' + p, import.meta.url), read = (f) => readFileSync(at('src/' + f), 'utf8');
const strip = (code) => code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const rows = existsSync(at('evolve/results.jsonl')) ? readFileSync(at('evolve/results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const admitted = rows.filter((r) => r.type === 'verdict' && r.admitted).map((r) => r.name);
// Each design goes in a block of its own, so its names do not meet another design's, and adds itself to the list.
// A behaviour entry has no build: it takes its base machine's, under its own name.
const files = existsSync(at('evolve/designs/')) ? readdirSync(at('evolve/designs/')).filter((f) => f.endsWith('.js')) : [];
const designs = [];
for (const f of files) {
  const mod = await import(at('evolve/designs/' + f).href), name = mod.build ? mod.build.name : mod.name;
  if (!admitted.includes(name)) continue;
  const add = mod.build ? 'ALL.push({ build, program });' : 'ALL.push({ build: { ...ALL.find((m) => m.build.name === base).build, name, note: typeof note === "string" ? note : undefined }, program });';
  designs.push({ name, code: `{\n${strip(readFileSync(at('evolve/designs/' + f), 'utf8'))}\n${add}\n}` });
}
// In the order they were admitted, so a behaviour entry comes after its base.
designs.sort((a, b) => admitted.indexOf(a.name) - admitted.indexOf(b.name));
const script = [
  `import * as THREE from '${CDN.three}';`, `import * as CANNON from '${CDN.cannon}';`,
  strip(read('challenges.js')), strip(read('lib.js')), strip(read('sim.js')), strip(read('bots.js')),
  `const kit = { ${Object.keys(kit).join(', ')} };`, ...designs.map((d) => d.code), strip(read('viewer.js')),
].join('\n');
mkdirSync(at('dist/'), { recursive: true });
writeFileSync(at('dist/evolve.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body style="margin:0">\n${read('page.html')}\n<script type="module">\n${script}\n</script>\n</body>\n</html>\n`);
console.log(`built dist/evolve.html with ${admitted.join(', ') || 'no admitted designs'}`);
