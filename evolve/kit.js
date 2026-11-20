// The building helpers the hand-built machines use (hexFrame, pedeFrame, walk, stalk, hunt, righting, WALKER
// and the rest), made available to design files. src/bots.js keeps them private, so this reads that file and
// loads a copy with every top-level name exported. Whatever bots.js has today is what a design gets.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/bots.js', import.meta.url), 'utf8').replace(/^(function|const) /gm, 'export $1 ');
export const kit = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
export const KIT_NAMES = Object.keys(kit).filter((k) => !/^[A-Z]+$/.test(k) || ['WALKER', 'LEGS_L', 'LEGS_R', 'PEDE_L', 'PEDE_R', 'PEDE_Z'].includes(k)).filter((k) => !k.endsWith('Program'));
