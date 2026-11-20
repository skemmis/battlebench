import { kit } from '../kit.js';
const { hexFrame, hunt, righting, beam, block, LEGS_L, LEGS_R, WALKER } = kit;

export const idea = 'A walker that runs. Same six spoked legs as the league, but a light frame, full-size motors and a gait driven at more than twice the league\'s pace, with a steel lance held out ahead. It strikes at a run, where a blow breaks joints, and is gone before the enemy has turned.';
export const target = 'Dreadnought';

export const build = {
  name: 'Hare',
  note: 'A light six-legged runner with a steel lance. It gallops in, strikes at speed, wheels away and comes again. It never stands and trades blows.',
  parts: [
    ...hexFrame({ frame: 'aluminium', power: 1 }),
    beam('lance', [0.2, 0.2, 1.7], [0, 0, 2.0], 'spine', 'steel'),
    { id: 'tip', type: 'wedge', material: 'steel', size: [0.4, 0.3, 0.5], pos: [0, 0, 3.05], parent: 'lance' },
    block('keel', [0.3, 0.2, 0.5], [0, -0.16, -0.5], 'spine', 'steel'),
  ],
};

// The league's gait, at a pace this machine chooses: each side has a phase, every hub is held to it by its
// measured angle, and going straight the two sides are pulled into step so three feet are always down.
function run(s, out, mem, lib, fwd, turn, pace) {
  const me = s.self, TURN = (2 * Math.PI) / 3;
  if (mem.pl === undefined) { mem.pl = 0; mem.pr = 0; }
  if (me.upright < 0) fwd = -fwd;
  turn = lib.clamp(turn - me.turnRate * 0.35);
  if (Math.abs(turn) > 0.45) fwd *= 0.35;
  const vl = lib.clamp(fwd - turn) * pace, vr = lib.clamp(fwd + turn) * pace;
  mem.pl += vl / 30; mem.pr += vr / 30;
  const lead = (ids, ph) => { let sum = 0, n = 0; for (const id of ids) { const j = me.joints[id]; if (j) { sum += j.angle; n++; } } return n ? lib.clamp(ph, sum / n - 0.6, sum / n + 0.6) : ph; };
  mem.pl = lead(LEGS_L, mem.pl); mem.pr = lead(LEGS_R, mem.pr);
  if (Math.abs(vl - vr) < 0.5) { let d = (mem.pl - mem.pr) % TURN; if (d > TURN / 2) d -= TURN; if (d < -TURN / 2) d += TURN; mem.pl -= d * 0.05; mem.pr += d * 0.05; }
  for (const [ids, ph, v] of [[LEGS_L, mem.pl, vl], [LEGS_R, mem.pr, vr]]) for (const id of ids) { const j = me.joints[id]; if (j) out[id] = lib.clamp((v + 6 * (ph - j.angle)) / 10); }
}

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, PACE = 7.5, SELF = { ...WALKER, length: 3.3, top: 5.5, margin: 2.4, mem };
  if (righting(s, out)) return;
  const h = hunt(s, lib);
  // After a strike: wheel away to open five metres, then turn and run in again.
  if (s.t < (mem.away || 0)) {
    out.say = 'struck, wheeling away for another run';
    const g = lib.guard(s, -1, SELF);
    run(s, out, mem, lib, g.drive, g.braking ? 0 : mem.side * 0.3, PACE);
    if (foe.distance > 6) mem.away = 0;
    return;
  }
  const onIt = foe.distance < 4.2 && Math.abs(foe.bearing) < 0.5;
  mem.press = onIt && me.speed < 0.8 ? (mem.press || 0) + 1 : 0;
  const nearOut = lib.edgeAt(s, foe.x, foe.z) < 1.6 && h.charge;
  if (mem.press > (nearOut ? 40 : 6)) { mem.press = 0; mem.away = s.t + 1.6; mem.side = (mem.side || 1) * -1; }
  const n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6 });
  out.say = n.backing ? 'jammed, backing off' : n.braking ? 'pulling up short of the edge' : nearOut && onIt ? 'it is on the brink, keeping the lance on it' : h.charge ? `running in at ${me.speed.toFixed(1)} m/s` : h.say;
  run(s, out, mem, lib, n.drive, n.turn, PACE);
}
