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
  if (s.arena.edgeDistance < 1.4 && Math.abs(goal(s).bearing) > 0.9) {
    turn = clamp(goal(s).bearing * 2.5);
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
    { id: 'blade', type: 'beam', material: 'steel', size: [1.0, 0.14, 0.26], pos: [0, -0.04, 1.1], parent: 'deck', joint: { type: 'motor', axis: [0, 1, 0] } },
  ],
};

export function lawnmowerProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  out.blade = 1;
  // Let the blade spin up before closing in.
  let drive = s.t < 1.5 ? 0 : 0.7;
  let turn = clamp(s.enemy.bearing * 2.5);
  if (Math.abs(s.enemy.bearing) > 0.8) drive = 0.15;
  if (s.arena.edgeDistance < 1.6 && Math.abs(goal(s).bearing) > 0.9) {
    turn = clamp(goal(s).bearing * 2.5);
    drive = 0.25;
  }
  mem.still = s.t > 2 && s.self.speed < 0.2 ? (mem.still || 0) + 1 : 0;
  if (mem.still > 60) { mem.reverseUntil = s.t + 1.0; mem.still = 0; }
  if (s.t < (mem.reverseUntil || 0)) { drive = -1; turn = -0.4; }
  out.wheel_fl = out.wheel_rl = clamp(drive - turn);
  out.wheel_fr = out.wheel_rr = clamp(drive + turn);
}

// Where a bot that "holds the middle" should go under the round's objective: the point to hold, or, when
// the objective is a crate, the far side of the crate and then through it toward home.
function goal(s) {
  if (s.target) return s.target;
  if (!s.crate) return { bearing: s.arena.centerBearing, distance: s.arena.centerDistance };
  const c = s.crate, behind = (s.self.z - c.z) * s.homeSide < -0.4;
  const x = behind ? c.x : c.x + (s.self.x >= c.x ? 1.3 : -1.3), z = behind ? c.z + s.homeSide * 0.6 : c.z - s.homeSide * 1.5;
  let b = Math.atan2(x - s.self.x, z - s.self.z) - s.self.heading;
  while (b > Math.PI) b -= 2 * Math.PI; while (b < -Math.PI) b += 2 * Math.PI;
  return { bearing: b, distance: Math.hypot(x - s.self.x, z - s.self.z) };
}

// Shared driving: chase the enemy, stay off the edge, back off when stuck.
// Returns { drive, turn } and leaves the wheels to the caller.
function chase(s, mem, { speed = 1, edge = 1.5, patience = 50 } = {}) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let drive = speed;
  let turn = clamp(s.enemy.bearing * 2.2);
  if (Math.abs(s.enemy.bearing) > 0.9) drive = speed * 0.2;
  if (s.arena.edgeDistance < edge && Math.abs(goal(s).bearing) > 0.9) { turn = clamp(goal(s).bearing * 2.5); drive = 0.25; }
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
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.1, 0.08, 1.8], pos: [0, -0.2, -0.15], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.67, -0.2, 0.5], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.67, -0.2, 0.5], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.67, -0.2, -0.85], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.67, -0.2, -0.85], parent: 'deck' },
    { id: 'tower', type: 'block', material: 'aluminium', size: [0.3, 0.4, 0.3], pos: [0, 0.4, 0], parent: 'core' },
    { id: 'arm', type: 'beam', material: 'steel', size: [0.1, 0.1, 1.3], pos: [0, 0.6, -0.65], parent: 'tower', joint: { type: 'motor', axis: [1, 0, 0], pivot: [0, 0.6, 0], gear: 2 } },
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

// The next three are not battlebots. They are here to check that the rules leave room for other ideas.

export const FLEA = {
  name: 'Flea',
  note: 'No wheels. Two spring-loaded legs kick down and back, so it travels by hopping and tries to come down on top of things.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [0.9, 0.08, 0.9], pos: [0, -0.2, 0], parent: 'core' },
    { id: 'belly', type: 'block', material: 'steel', size: [0.5, 0.2, 0.5], pos: [0, -0.34, 0.1], parent: 'deck' },
    { id: 'skid_fl', type: 'ball', material: 'steel', radius: 0.1, pos: [0.4, -0.35, 0.4], parent: 'deck' },
    { id: 'skid_fr', type: 'ball', material: 'steel', radius: 0.1, pos: [-0.4, -0.35, 0.4], parent: 'deck' },
    { id: 'skid_rl', type: 'ball', material: 'steel', radius: 0.1, pos: [0.4, -0.35, -0.4], parent: 'deck' },
    { id: 'skid_rr', type: 'ball', material: 'steel', radius: 0.1, pos: [-0.4, -0.35, -0.4], parent: 'deck' },
    { id: 'leg_l', type: 'block', material: 'steel', size: [0.2, 0.12, 0.25], pos: [0.3, -0.33, -0.3], parent: 'deck', joint: { type: 'piston', axis: [0, -0.9, -0.44], stroke: 0.06 } },
    { id: 'sole_l', type: 'block', material: 'rubber', size: [0.2, 0.04, 0.25], pos: [0.3, -0.41, -0.3], parent: 'leg_l' },
    { id: 'leg_r', type: 'block', material: 'steel', size: [0.2, 0.12, 0.25], pos: [-0.3, -0.33, -0.3], parent: 'deck', joint: { type: 'piston', axis: [0, -0.9, -0.44], stroke: 0.06 } },
    { id: 'sole_r', type: 'block', material: 'rubber', size: [0.2, 0.04, 0.25], pos: [-0.3, -0.41, -0.3], parent: 'leg_r' },
  ],
};
export function fleaProgram(s, out, mem) {
  if (mem.rest === undefined) mem.rest = s.self.y;
  const j = s.self.joints;
  // Settled on the floor, either way up. Kicking while on its back is how it rolls over again.
  const grounded = Math.abs(s.self.vy) < 0.3 && s.self.speed < 0.6 && s.self.y < mem.rest + 0.35;
  const ready = j.leg_l && j.leg_r && j.leg_l.charge > 0.98 && j.leg_r.charge > 0.98;
  if (grounded && ready && s.t > (mem.kickUntil || 0) + 0.3) {
    mem.kickUntil = s.t + 0.2;
    // Facing the target: kick with both legs. Otherwise kick with one, which twists the body round.
    const want = s.arena.edgeDistance < 2 ? goal(s).bearing : s.enemy.bearing;
    mem.legs = Math.abs(want) < 0.45 ? 'both' : want > 0 ? 'right' : 'left';
  }
  const kicking = s.t < (mem.kickUntil || 0);
  out.leg_l = kicking && mem.legs !== 'right' ? 1 : 0;
  out.leg_r = kicking && mem.legs !== 'left' ? 1 : 0;
}

export const SQUATTER = {
  name: 'Squatter',
  note: 'Does not fight. It drives to the middle, pushes three rubber pads into the floor to lift its wheels, and dares the other bot to move it.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.2, 0.08, 1.2], pos: [0, -0.2, 0], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.72, -0.2, 0.4], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.72, -0.2, 0.4], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.72, -0.2, -0.4], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.72, -0.2, -0.4], parent: 'deck' },
    { id: 'ramp_front', type: 'wedge', material: 'aluminium', size: [1.2, 0.3, 0.45], pos: [0, -0.33, 0.82], parent: 'deck' },
    { id: 'ramp_back', type: 'wedge', material: 'aluminium', size: [1.2, 0.3, 0.45], pos: [0, -0.33, -0.82], rot: [0, 180, 0], parent: 'deck' },
    { id: 'ballast_l', type: 'block', material: 'steel', size: [0.3, 0.18, 0.3], pos: [0.4, -0.07, 0], parent: 'deck' },
    { id: 'ballast_r', type: 'block', material: 'steel', size: [0.3, 0.18, 0.3], pos: [-0.4, -0.07, 0], parent: 'deck' },
    { id: 'pad_fl', type: 'block', material: 'rubber', size: [0.3, 0.1, 0.3], pos: [0.3, -0.3, 0.3], parent: 'deck', joint: { type: 'piston', axis: [0, -1, 0], stroke: 0.2, gear: 2 } },
    { id: 'pad_fr', type: 'block', material: 'rubber', size: [0.3, 0.1, 0.3], pos: [-0.3, -0.3, 0.3], parent: 'deck', joint: { type: 'piston', axis: [0, -1, 0], stroke: 0.2, gear: 2 } },
    { id: 'pad_rear', type: 'block', material: 'rubber', size: [0.3, 0.1, 0.3], pos: [0, -0.3, -0.35], parent: 'deck', joint: { type: 'piston', axis: [0, -1, 0], stroke: 0.2, gear: 2 } },
  ],
};
export function squatterProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const d = goal(s).distance;
  // Dig in once on the spot; pull the pads up and drive back if shoved well away from it.
  if (d < 0.35) mem.planted = true;
  if (d > 1.5) mem.planted = false;
  const pads = mem.planted ? 1 : 0;
  out.pad_fl = out.pad_fr = out.pad_rear = pads;
  if (mem.planted) { tank(out, 0, 0); return; }
  const b = goal(s).bearing;
  // Either end can lead, so reverse in if the middle is behind.
  const back = Math.abs(b) > Math.PI / 2;
  const err = back ? (b > 0 ? b - Math.PI : b + Math.PI) : b;
  tank(out, (back ? -1 : 1) * (Math.abs(err) > 0.7 ? 0.2 : Math.min(1, 0.3 + d * 0.5)), clamp(err * 2.5));
}

export const SLINGSHOT = {
  name: 'Slingshot',
  note: 'Keeps its distance. Three steel balls sit on fast pistons; it lines up, fires one and lets go of it at full stroke. Out of balls, it goes to hold the middle.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.1, 0.08, 1.3], pos: [0, -0.2, 0], parent: 'core' },
    { id: 'wheel_fl', type: 'drive', pos: [0.67, -0.2, 0.45], parent: 'deck' },
    { id: 'wheel_fr', type: 'drive', pos: [-0.67, -0.2, 0.45], parent: 'deck' },
    { id: 'wheel_rl', type: 'drive', pos: [0.67, -0.2, -0.45], parent: 'deck' },
    { id: 'wheel_rr', type: 'drive', pos: [-0.67, -0.2, -0.45], parent: 'deck' },
    { id: 'shot_1', type: 'ball', material: 'steel', radius: 0.15, pos: [0.35, 0.02, 0.2], parent: 'deck', joint: { type: 'piston', axis: [0, 0.12, 1], stroke: 0.5, gear: 0.5 } },
    { id: 'shot_2', type: 'ball', material: 'steel', radius: 0.15, pos: [-0.35, 0.02, 0.2], parent: 'deck', joint: { type: 'piston', axis: [0, 0.12, 1], stroke: 0.5, gear: 0.5 } },
    { id: 'shot_3', type: 'ball', material: 'steel', radius: 0.15, pos: [0, 0.37, 0], parent: 'core', joint: { type: 'piston', axis: [0, 0.12, 1], stroke: 0.5, gear: 0.5 } },
  ],
};
export function slingshotProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const shots = ['shot_1', 'shot_2', 'shot_3'].filter((id) => s.self.parts[id].attached);
  out.release = [];
  for (const id of shots) {
    const j = s.self.joints[id];
    out[id] = mem.firing === id ? 1 : 0;
    if (mem.firing === id && j.extension > j.stroke * 0.9) { out.release.push(id); mem.firing = null; mem.nextShot = s.t + 1.5; }
  }
  if (!shots.length) {
    // Nothing left to throw: go and sit on the centre.
    const b = goal(s).bearing, d = goal(s).distance;
    tank(out, d < 0.4 ? 0 : Math.abs(b) > 0.7 ? 0.2 : 0.8, d < 0.4 ? 0 : clamp(b * 2.5));
    return;
  }
  const e = s.enemy;
  let drive = e.distance > 5.5 ? 0.7 : e.distance < 3 ? -0.7 : 0;
  let turn = clamp(e.bearing * 3);
  // Cornered: stop keeping range and break out toward the middle.
  if (s.arena.edgeDistance < 2) mem.escapeUntil = s.t + 1.5;
  if (s.t < (mem.escapeUntil || 0)) { turn = clamp(goal(s).bearing * 2.5); drive = Math.abs(goal(s).bearing) > 1 ? 0.3 : 1; }
  tank(out, drive, turn);
  if (!mem.firing && s.t > (mem.nextShot || 1) && Math.abs(e.bearing) < 0.08 && e.distance < 7 && Math.abs(s.self.turnRate) < 0.8) mem.firing = shots[0];
}

// ── Bots built on the other ways of getting about ───────────────────────────
export const TREAD = {
  name: 'Tread',
  note: 'No wheels. Two long tracks carry a low slab. The tracks are long enough to reach across a narrow gap and they do not slide sideways, so it is hard to shove off its line.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.0, 0.08, 1.5], pos: [0, -0.1, 0], parent: 'core' },
    { id: 'track_l', type: 'track', size: [0.28, 0.3, 1.7], pos: [0.62, -0.2, 0], parent: 'deck' },
    { id: 'track_r', type: 'track', size: [0.28, 0.3, 1.7], pos: [-0.62, -0.2, 0], parent: 'deck' },
    { id: 'plough', type: 'wedge', material: 'aluminium', size: [1.0, 0.3, 0.5], pos: [0, -0.2, 1.0], parent: 'deck' },
  ],
};
export function treadProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  // Go to the objective and stay on it. If the enemy is nearer the objective, go through the enemy.
  const g = goal(s);
  const b = g.distance < 0.5 ? s.enemy.bearing : g.bearing;
  const drive = g.distance < 0.35 ? 0 : Math.abs(b) > 0.5 ? 0 : Math.min(1, 0.1 + g.distance * 0.5);
  const turn = clamp(b * 2);
  out.track_l = clamp(drive - turn); out.track_r = clamp(drive + turn);
}

export const COMET = {
  name: 'Comet',
  note: 'It flies. Four thrusters point down at the corners and each one holds its own corner at a set height, which keeps the whole thing level. Four more push it forward, back and to either side. It can only stay up for a few seconds, so it travels in hops and lands on the objective.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'plastic', size: [1.3, 0.06, 1.3], pos: [0, -0.23, 0], parent: 'core' },
    { id: 'lift_fl', type: 'thruster', dir: [0, 1, 0], pos: [0.55, -0.1, 0.55], parent: 'deck' },
    { id: 'lift_fr', type: 'thruster', dir: [0, 1, 0], pos: [-0.55, -0.1, 0.55], parent: 'deck' },
    { id: 'lift_rl', type: 'thruster', dir: [0, 1, 0], pos: [0.55, -0.1, -0.55], parent: 'deck' },
    { id: 'lift_rr', type: 'thruster', dir: [0, 1, 0], pos: [-0.55, -0.1, -0.55], parent: 'deck' },
    { id: 'go_fwd', type: 'thruster', dir: [0, 0, 1], pos: [0, -0.05, -0.45], parent: 'deck' },
    { id: 'go_back', type: 'thruster', dir: [0, 0, -1], pos: [0, -0.05, 0.45], parent: 'deck' },
    { id: 'go_left', type: 'thruster', dir: [1, 0, 0], pos: [-0.45, -0.05, 0], parent: 'deck' },
    { id: 'go_right', type: 'thruster', dir: [-1, 0, 0], pos: [0.45, -0.05, 0], parent: 'deck' },
  ],
};
export function cometProgram(s, out, mem) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lifts = ['lift_fl', 'lift_fr', 'lift_rl', 'lift_rr'];
  const g = goal(s);
  const fuel = Math.min(...lifts.map((id) => (s.self.joints[id] ? s.self.joints[id].charge : 0)));
  if (mem.rest === undefined) { mem.rest = s.self.parts.lift_fl.y; mem.prev = {}; }
  // Take off with full tanks when there is somewhere to go; come down when they run low or on arrival.
  if (!mem.flying && fuel > 0.95 && g.distance > 0.7) mem.flying = true;
  if (mem.flying && (fuel < 0.12 || (g.distance < 0.35 && s.self.speed < 0.6))) mem.flying = false;
  const height = mem.rest + 0.85;
  for (const id of lifts) {
    const y = s.self.parts[id].y, vy = (y - (mem.prev[id] ?? y)) * 30;
    mem.prev[id] = y;
    // Each corner looks after its own height. Coming down, it still cushions the landing a little.
    out[id] = mem.flying ? clamp01(0.37 + 1.2 * (height - y) - 0.45 * vy) : clamp01(y > mem.rest + 0.15 ? -0.3 * vy - 0.1 : 0);
  }
  // Which way it faces does not matter. Work out where the objective is in its own frame and how fast it is
  // drifting each way, then push toward the objective and against the drift.
  const h = s.self.heading;
  const vf = s.self.vx * Math.sin(h) + s.self.vz * Math.cos(h), vl = s.self.vx * Math.cos(h) - s.self.vz * Math.sin(h);
  const reach = Math.min(g.distance, 3.5);
  const af = mem.flying ? 0.5 * reach * Math.cos(g.bearing) - 0.55 * vf : 0, al = mem.flying ? 0.5 * reach * Math.sin(g.bearing) - 0.55 * vl : 0;
  out.go_fwd = clamp01(af); out.go_back = clamp01(-af); out.go_left = clamp01(al); out.go_right = clamp01(-al);
}

export const LIMPET = {
  name: 'Limpet',
  note: 'It holds on. A gripper on the nose takes hold of the crate, or of the other bot, and a second one underneath clamps it to the floor once it is where it wants to be.',
  parts: [
    { id: 'core', type: 'core' },
    { id: 'deck', type: 'plate', material: 'aluminium', size: [1.0, 0.08, 1.2], pos: [0, -0.1, 0], parent: 'core' },
    { id: 'track_l', type: 'track', size: [0.25, 0.3, 1.3], pos: [0.6, -0.2, 0], parent: 'deck' },
    { id: 'track_r', type: 'track', size: [0.25, 0.3, 1.3], pos: [-0.6, -0.2, 0], parent: 'deck' },
    { id: 'claw', type: 'gripper', pos: [0, -0.05, 0.75], parent: 'deck' },
    { id: 'anchor', type: 'gripper', pos: [0, -0.2, -0.2], parent: 'deck', joint: { type: 'piston', axis: [0, -1, 0], stroke: 0.12 } },
  ],
};
export function limpetProgram(s, out, mem) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const j = s.self.joints;
  const holding = j.claw && j.claw.holding;
  let b, d, hold = false;
  if (s.crate) {
    // Get hold of the crate from any side, then haul it to the home end.
    out.claw = 1;
    if (holding) { b = Math.atan2(-s.self.x * 0.2, s.homeSide * 20 - s.self.z) - s.self.heading; while (b > Math.PI) b -= 2 * Math.PI; while (b < -Math.PI) b += 2 * Math.PI; d = Math.abs(s.homeSide * (s.challenge.floor[0].d / 2) - s.self.z); if (s.arena.edgeDistance < 1.8 && s.self.z * s.homeSide > 1.5) hold = true; }
    else { b = s.crate.bearing; d = s.crate.distance; }
  } else {
    const g = goal(s);
    b = g.bearing; d = g.distance; out.claw = 0;
    if (d < 0.35) hold = true;
  }
  // Clamp to the floor when in place: push the anchor down and switch it on.
  out.anchor = hold ? 1 : 0;
  if (hold) { out.track_l = out.track_r = 0; return; }
  // Either end can lead. With the crate held on the nose, backing up is how it gets hauled home.
  const back = Math.abs(b) > Math.PI / 2, err = back ? (b > 0 ? b - Math.PI : b + Math.PI) : b;
  const drive = (back ? -1 : 1) * (Math.abs(err) > 0.6 ? 0 : Math.min(1, 0.3 + d * 0.5)), turn = clamp(err * 2);
  out.track_l = clamp(drive - turn); out.track_r = clamp(drive + turn);
}

export const ALL = [
  { build: LAWNMOWER, program: lawnmowerProgram },
  { build: DOORSTOP, program: doorstopProgram },
  { build: PANCAKE, program: pancakeProgram },
  { build: GAVEL, program: gavelProgram },
  { build: EGGBEATER, program: eggbeaterProgram },
  { build: CAROUSEL, program: carouselProgram },
  { build: FLEA, program: fleaProgram },
  { build: SQUATTER, program: squatterProgram },
  { build: SLINGSHOT, program: slingshotProgram },
  { build: TREAD, program: treadProgram },
  { build: COMET, program: cometProgram },
  { build: LIMPET, program: limpetProgram },
];

export const ROSTER = [
  { build: LAWNMOWER, program: lawnmowerProgram },
  { build: DOORSTOP, program: doorstopProgram },
];
