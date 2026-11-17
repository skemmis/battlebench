// Two hand-written bots. Each is a build (the parts list a model would fill in)
// and a control program that runs 30 times a second.

export const DOORSTOP = {
  name: 'Doorstop',
  note: 'House bot. A low wedge on four wheels that gets under things and shoves.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.2, 0.08, 1.4], pos: [0, -0.15, 0], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.72, -0.2, 0.45], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.72, -0.2, 0.45], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.72, -0.2, -0.45], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.72, -0.2, -0.45], parent: 'deck' },
    { id: 'scoop', type: 'wedge', material: 'aluminium', size: [1.2, 0.34, 0.6], pos: [0, -0.31, 1.0], parent: 'deck' },
  ],
};

export function doorstopProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let drive = 1;
  let turn = clamp(s.enemy.bearing * 2);
  // Stay on the floor: near an edge, head back toward the middle first.
  if (s.arena.edgeDistance < 1.4 && Math.abs(s.arena.centerBearing) > 0.9) {
    turn = clamp(s.arena.centerBearing * 2.5);
    drive = 0.25;
  }
  // If we have been pushing without moving, back off and come again.
  mem.still = s.self.speed < 0.25 ? (mem.still || 0) + 1 : 0;
  if (mem.still > 45) { mem.reverseUntil = s.t + 0.9; mem.still = 0; }
  if (s.t < (mem.reverseUntil || 0)) { drive = -1; turn = 0.5; }
  out.wheel_fl = out.wheel_rl = clamp(drive - turn);
  out.wheel_fr = out.wheel_rr = clamp(drive + turn);
}

export const LAWNMOWER = {
  name: 'Lawnmower',
  note: 'A heavy steel bar on a fast motor, carried on the nose. Nothing in the kit is called a weapon; this is one built from a beam.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.1, 0.08, 1.6], pos: [0, -0.15, 0.2], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.67, -0.2, 0.55], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.67, -0.2, 0.55], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.67, -0.2, -0.45], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.67, -0.2, -0.45], parent: 'deck' },
    { id: 'blade', type: 'beam', material: 'steel', size: [1.0, 0.14, 0.26], pos: [0, -0.04, 0.95], parent: 'deck', joint: { type: 'motor', axis: [0, 1, 0] } },
  ],
};

export function lawnmowerProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  out.blade = 1;
  // Let the blade spin up before closing in.
  let drive = s.t < 1.5 ? 0 : 0.7;
  let turn = clamp(s.enemy.bearing * 2.5);
  if (Math.abs(s.enemy.bearing) > 0.8) drive = 0.15;
  if (s.arena.edgeDistance < 1.6 && Math.abs(s.arena.centerBearing) > 0.9) {
    turn = clamp(s.arena.centerBearing * 2.5);
    drive = 0.25;
  }
  mem.still = s.t > 2 && s.self.speed < 0.2 ? (mem.still || 0) + 1 : 0;
  if (mem.still > 60) { mem.reverseUntil = s.t + 1.0; mem.still = 0; }
  if (s.t < (mem.reverseUntil || 0)) { drive = -1; turn = -0.4; }
  out.wheel_fl = out.wheel_rl = clamp(drive - turn);
  out.wheel_fr = out.wheel_rr = clamp(drive + turn);
}

// Shared driving: chase the enemy, stay off the edge, back off when stuck.
// Returns { drive, turn } and leaves the wheels to the caller.
function chase(s, mem, { speed = 1, edge = 1.5, patience = 50 } = {}) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let drive = speed;
  let turn = clamp(s.enemy.bearing * 2.2);
  if (Math.abs(s.enemy.bearing) > 0.9) drive = speed * 0.2;
  if (s.arena.edgeDistance < edge && Math.abs(s.arena.centerBearing) > 0.9) { turn = clamp(s.arena.centerBearing * 2.5); drive = 0.25; }
  mem.still = s.t > 2 && s.self.speed < 0.2 ? (mem.still || 0) + 1 : 0;
  if (mem.still > patience) { mem.reverseUntil = s.t + 1.0; mem.reverseTurn = mem.reverseTurn === 0.6 ? -0.6 : 0.6; mem.still = 0; }
  if (s.t < (mem.reverseUntil || 0)) { drive = -1; turn = mem.reverseTurn; }
  return { drive, turn };
}
function tank(out, drive, turn) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  out.wheel_fl = out.wheel_rl = clamp(drive - turn);
  out.wheel_fr = out.wheel_rr = clamp(drive + turn);
}

export const PANCAKE = {
  name: 'Pancake',
  note: 'A flipper. A flat plate on a geared-down motor, hinged at its back edge, that slides under the other bot and throws it.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.2, 0.08, 1.3], pos: [0, -0.2, -0.1], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.72, -0.2, 0.3], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.72, -0.2, 0.3], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.72, -0.2, -0.55], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.72, -0.2, -0.55], parent: 'deck' },
    { id: 'ballast', type: 'block', material: 'steel', size: [0.4, 0.2, 0.3], pos: [0, -0.06, -0.6], parent: 'deck' },
    { id: 'flipper', type: 'plate', material: 'aluminium', size: [1.0, 0.05, 0.9], pos: [0, -0.42, 1.0], parent: 'deck', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, -0.42, 0.55], gear: 6 } },
  ],
};
export function pancakeProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const { drive, turn } = chase(s, mem);
  tank(out, drive, turn);
  const angle = s.self.joints.flipper ? s.self.joints.flipper.angle : 0;
  // Negative angle lifts the front edge. Fire when the enemy is over the plate, then reset.
  if (s.t > (mem.readyAt || 0) && s.enemy.distance < 1.75 && Math.abs(s.enemy.bearing) < 0.4) { mem.fireUntil = s.t + 0.35; mem.readyAt = s.t + 1.3; }
  const target = s.t < (mem.fireUntil || 0) ? -1.2 : 0;
  out.flipper = clamp((target - angle) * 8);
}

export const GAVEL = {
  name: 'Gavel',
  note: 'A hammer. A steel block on a long arm that rests pointing backward and swings over the top to land in front.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.1, 0.08, 1.4], pos: [0, -0.2, 0], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.67, -0.2, 0.5], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.67, -0.2, 0.5], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.67, -0.2, -0.5], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.67, -0.2, -0.5], parent: 'deck' },
    { id: 'tower', type: 'block', material: 'aluminium', size: [0.3, 0.4, 0.3], pos: [0, 0.4, 0], parent: 'core' },
    { id: 'arm', type: 'beam', material: 'steel', size: [0.1, 0.1, 1.3], pos: [0, 0.6, -0.65], parent: 'tower', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, 0.6, 0], gear: 3 } },
    { id: 'head', type: 'block', material: 'steel', size: [0.3, 0.25, 0.3], pos: [0, 0.6, -1.4], parent: 'arm' },
  ],
};
export function gavelProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const { drive, turn } = chase(s, mem, { speed: 0.85 });
  tank(out, drive, turn);
  const angle = s.self.joints.arm ? s.self.joints.arm.angle : 0;
  // Positive angle swings the head up and over. Past 3.1 it is coming down in front.
  if (s.t > (mem.readyAt || 0) && s.enemy.distance < 2.0 && Math.abs(s.enemy.bearing) < 0.3) { mem.swingUntil = s.t + 0.6; mem.readyAt = s.t + 1.8; }
  // Power the swing only to the top of the arc and let the head's weight carry it down, then pull back
  // before it can wedge itself under the bot.
  out.arm = s.t < (mem.swingUntil || 0) && angle < 2.6 ? 1 : clamp((0 - angle) * 1.5);
}

export const EGGBEATER = {
  name: 'Eggbeater',
  note: 'A vertical spinner. A thick steel disc on edge at the nose, turning so its front rises and kicks things upward.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.1, 0.08, 1.3], pos: [0, -0.2, -0.1], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.67, -0.2, 0.45], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.67, -0.2, 0.45], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.67, -0.2, -0.6], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.67, -0.2, -0.6], parent: 'deck' },
    { id: 'fork_l', type: 'beam', material: 'aluminium', size: [0.1, 0.12, 0.7], pos: [0.25, -0.2, 0.85], parent: 'deck' },
    { id: 'fork_r', type: 'beam', material: 'aluminium', size: [0.1, 0.12, 0.7], pos: [-0.25, -0.2, 0.85], parent: 'deck' },
    { id: 'disc', type: 'disc', material: 'steel', radius: 0.3, thickness: 0.14, pos: [0, -0.18, 1.0], rot: [0, 0, 90], parent: 'deck', joint: { type: 'motor', axis: [0, 1, 0] } },
  ],
};
export function eggbeaterProgram(s, out, mem) {
  const { drive, turn } = chase(s, mem, { speed: s.t < 1.5 ? 0 : 0.8 });
  tank(out, drive, turn);
  out.disc = 1;
}

export const CAROUSEL = {
  name: 'Carousel',
  note: 'A full-body spinner. A long rotor above the wheels with a steel weight hanging from each end, so the whole outline is a weapon.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [0.8, 0.08, 0.8], pos: [0, -0.2, 0], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.5, -0.2, 0.3], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.5, -0.2, 0.3], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.5, -0.2, -0.3], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.5, -0.2, -0.3], parent: 'deck' },
    { id: 'mast', type: 'block', material: 'steel', size: [0.2, 0.3, 0.2], pos: [0, 0.35, 0], parent: 'core' },
    { id: 'rotor', type: 'beam', material: 'steel', size: [2.2, 0.08, 0.14], pos: [0, 0.55, 0], parent: 'mast', joint: { type: 'motor', axis: [0, 1, 0], gear: 3 } },
    { id: 'weight_l', type: 'beam', material: 'steel', size: [0.18, 0.75, 0.18], pos: [1.0, 0.15, 0], parent: 'rotor' },
    { id: 'weight_r', type: 'beam', material: 'steel', size: [0.18, 0.75, 0.18], pos: [-1.0, 0.15, 0], parent: 'rotor' },
  ],
};
export function carouselProgram(s, out, mem) {
  const { drive, turn } = chase(s, mem, { speed: s.t < 2 ? 0 : 0.55, edge: 2.2 });
  tank(out, drive, turn);
  out.rotor = 1;
}

export const ALL = [
  { build: LAWNMOWER, program: lawnmowerProgram },
  { build: DOORSTOP, program: doorstopProgram },
  { build: PANCAKE, program: pancakeProgram },
  { build: GAVEL, program: gavelProgram },
  { build: EGGBEATER, program: eggbeaterProgram },
  { build: CAROUSEL, program: carouselProgram },
];

export const ROSTER = [
  { build: LAWNMOWER, program: lawnmowerProgram },
  { build: DOORSTOP, program: doorstopProgram },
];
