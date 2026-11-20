import { kit } from '../kit.js';
const { hunt } = kit;
export const base = 'Jack';
export const name = 'Jack-arc';
export const idea = 'A slow-motion look at the High ground stand-offs showed the cause: a six-wheeled machine with all its wheels on the ground cannot turn on the spot. The tyres grip too well to scrub sideways, so when the way to the enemy is round the hill it sits with its wheels fighting each other. Jack leads on draws because of this. Jack-arc keeps Jack as built and changes the steering: it never asks for a turn on the spot, and turns in a moving arc instead.';
export const target = 'Mantis';
export const note = 'Jack with a program that turns on the move, never on the spot.';

export function program(s, out, mem, lib) {
  const me = s.self, foe = s.enemy, SELF = { length: 3.1, top: 4.5, margin: 2.2, side: 0.6, climb: 0.15, grade: 0.4, wade: 0.2, mem };
  const L = ['wl_0', 'wl_1', 'wl_2'], R = ['wr_0', 'wr_1', 'wr_2'];
  // Never ask for a turn on the spot: six gripping wheels cannot scrub round. Turn on the move instead, in an arc.
  const drive = (d, t) => { if (Math.abs(t) > 0.25 && d >= 0 && d < 0.6 && s.self.upright > 0.2) { d = 0.6; t = lib.clamp(t, -0.4, 0.4); } for (const id of L) out[id] = lib.clamp(d - t); for (const id of R) out[id] = lib.clamp(d + t); };
  const fork = me.joints.fork, UP = -0.75;
  const hold = (to, max = 1) => { if (fork) out.fork = lib.clamp((to - fork.angle) * 4, -max, max); };
  if (me.upright < 0.2) { out.say = 'tipped, pushing off the ground with the fork'; hold(Math.sin(s.t * 3) > 0 ? UP : 0.05); drive(Math.sin(s.t * 5), 0.5); return; }
  const h = hunt(s, lib), under = foe.distance < 3.9 && Math.abs(foe.bearing) < 0.4;
  // Fork under it: lift, and keep driving. Count how long it has been under so a lift that gets nowhere is let go.
  mem.under = under ? (mem.under || 0) + 1 : 0;
  const lifting = under && mem.under > 6 && s.t > (mem.rest || 0);
  if (lifting && me.speed < 0.25 && mem.under > 240) { mem.rest = s.t + 1.2; mem.under = 0; }
  hold(lifting ? UP : 0.03, lifting ? 1 : 0.5);
  if (s.t < (mem.rest || 0)) { out.say = 'lift got nowhere, dropping the fork and backing out for another bite'; const g = lib.guard(s, -0.8, SELF); drive(g.drive, lib.clamp(foe.bearing, -0.3, 0.3)); return; }
  const n = lib.nav(s, h.x, h.z, { ...SELF, stopAt: h.charge ? 0 : 0.6, feed: !under });
  out.say = n.braking ? 'braking for the edge' : lifting ? `fork under it and lifting (${fork ? Math.round(-fork.angle * 57) : 0} degrees), carrying it out` : under ? 'sliding the fork under it' : h.say;
  drive(n.drive, n.turn);
}
