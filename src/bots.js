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

export const ROSTER = [
  { build: LAWNMOWER, program: lawnmowerProgram },
  { build: DOORSTOP, program: doorstopProgram },
];
