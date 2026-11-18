// Builds dist/index.html: one page with the simulator, the bots and the viewer inlined.
// The two libraries load from a CDN at fixed versions, so the file opens with a double-click.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CDN = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'cannon-es': 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js',
};
const read = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const strip = (code) => code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const script = [
  `import * as THREE from '${CDN.three}';`,
  `import * as CANNON from '${CDN['cannon-es']}';`,
  strip(read('challenges.js')), strip(read('sim.js')), strip(read('bots.js')), strip(read('viewer.js')),
].join('\n');
const fragment = `${read('page.html')}\n<script type="module">\n${script}\n</script>\n`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
// index.html is a complete document; page.fragment.html is the same page without the wrapper.
writeFileSync(new URL('../dist/index.html', import.meta.url), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body style="margin:0">\n${fragment}</body>\n</html>\n`);
writeFileSync(new URL('../dist/page.fragment.html', import.meta.url), fragment);
console.log('built dist/index.html', (fragment.length / 1024).toFixed(1) + ' KB');
