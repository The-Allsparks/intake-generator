import Module from 'manifold-3d';

// Printable intake roller. Units are millimeters.
// Axial: two end plates, tubes parallel to the shaft, one plug in each tube end.
// Radial: one hub, tubes sticking straight out like spokes, each plug pinned through the hub face.
// Tangential: the same hub and plug, but each tube trails off the spoke. The mouth stays
// on the rim; the axis is rotated in the hub plane so it does not point at the shaft.
// Shaft openings are the real profile plus SHAFT_FIT on each side. Downloads are blocked
// unless both solids are single closed meshes and the assembled parts do not occupy the same space.

export const SHAFT_FIT = 0.15;
const BOSS = 2;
const COLLAR_GAP = 0.25;
const SEAT = 0.05;
// How far a fused plug is pushed back into the plate or hub.
const AXIAL_EMBED = 1.2;
const HUB_EMBED = 0.8;

const SHAFTS = new Set(['rex', 'hex', 'round', 'd']);
const LAYOUTS = new Set(['axial', 'radial', 'tangential']);
const HEAD = { 2: 2.05, 3: 2.9, 4: 3.65 };
const NUT = { 2: { af: 4, thick: 1.6 }, 3: { af: 5.5, thick: 2.4 }, 4: { af: 7, thick: 3.2 } };
const NUT_LIP = 1;
// Outer rims need a fine circle or the hub reads as a polygon. Bores stay coarser.
const SEG_RIM = 160;
const SEG_BODY = 96;
const SEG_FEATURE = 72;
const SEG_BORE = 48;
const SEG_SHAFT = 128;
const SEG_REX = 32;

// Shop starts that already pass the solid checks. The page loads the first one.
export const RECIPES = [
  {
    id: 'axial',
    label: 'Axial roller · 90 mm · four flexures',
    config: {
      layout: 'axial', sweep: 45, diameter: 90, width: 120, count: 6, plate: 8,
      id: 6.35, od: 9.525, material: 'Silicone', plug: 12, clearance: 0.2,
      slots: 4, slotwidth: 0.8, flexlen: 8, slotstart: null, slotend: null, shaft: 'rex', screw: 3,
      joined: false, barbs: false, barbcount: 3, barbheight: 0.45, barbwidth: 1.2,
      flange: false, flangethick: 1.6, flangedepth: 1.2
    }
  },
  {
    id: 'radial',
    label: 'Radial hub · 120 mm · four flexures',
    config: {
      layout: 'radial', sweep: 45, diameter: 120, width: 120, count: 6, plate: 8,
      id: 6.35, od: 9.525, material: 'Silicone', plug: 12, clearance: 0.2,
      slots: 4, slotwidth: 0.8, flexlen: 8, slotstart: null, slotend: null, shaft: 'rex', screw: 3,
      joined: false, barbs: false, barbcount: 3, barbheight: 0.45, barbwidth: 1.2,
      flange: false, flangethick: 1.6, flangedepth: 1.2
    }
  },
  {
    id: 'tangential',
    label: 'Tangential hub · 140 mm · 45°',
    config: {
      layout: 'tangential', sweep: 45, diameter: 140, width: 140, count: 6, plate: 8,
      id: 6.35, od: 9.525, material: 'Silicone', plug: 12, clearance: 0.2,
      slots: 4, slotwidth: 0.8, flexlen: 8, slotstart: null, slotend: null, shaft: 'rex', screw: 3,
      joined: false, barbs: false, barbcount: 3, barbheight: 0.45, barbwidth: 1.2,
      flange: false, flangethick: 1.6, flangedepth: 1.2
    }
  },
  {
    id: 'two',
    label: 'Two flexures · 6 mm slots',
    config: {
      layout: 'axial', sweep: 45, diameter: 90, width: 120, count: 6, plate: 8,
      id: 6.35, od: 9.525, material: 'Silicone', plug: 12, clearance: 0.2,
      slots: 2, slotwidth: 0.8, flexlen: 6, slotstart: null, slotend: null, shaft: 'rex', screw: 3,
      joined: false, barbs: false, barbcount: 3, barbheight: 0.45, barbwidth: 1.2,
      flange: false, flangethick: 1.6, flangedepth: 1.2
    }
  },
  {
    id: 'solid',
    label: 'Solid plug · end flange · no slots',
    config: {
      layout: 'axial', sweep: 45, diameter: 90, width: 120, count: 6, plate: 8,
      id: 6.35, od: 9.525, material: 'Silicone', plug: 12, clearance: 0.2,
      slots: 0, slotwidth: 0.8, flexlen: 8, slotstart: null, slotend: null, shaft: 'rex', screw: 3,
      joined: false, barbs: false, barbcount: 3, barbheight: 0.45, barbwidth: 1.2,
      flange: true, flangethick: 1.6, flangedepth: 1.2
    }
  }
];

export async function init(locateFile) {
  const m = await Module(locateFile ? { locateFile } : {});
  m.setup();
  return m;
}

export function validate(raw) {
  const notes = [];
  const c = normalize(raw, notes);
  if (!(c.od > c.id && c.id > 0)) throw Error('Tube OD must be larger than tube ID.');
  const screwHoleR = c.screw / 2 + 0.2;
  const minId = Math.max(5, 2 * (screwHoleR + 0.85) + c.clearance);
  if (c.id < minId - 1e-6) {
    const next = roundUp(minId + 0.02, 0.05);
    if (!(c.od > next)) throw Error('Tube ID is too small for this screw and the plug wall. Use larger tubing or a smaller screw.');
    notes.push(`Tube ID set to ${next} mm so the screw head can spread the fingers.`);
    c.id = next;
  }
  const d = derive(c, notes);
  if (d.plugR - d.boreStart < 0.7) throw Error('Tube ID is too small for this screw and the plug wall. Use larger tubing or a smaller screw.');
  if (c.slots > 0 && c.slotwidth > ((2 * Math.PI * d.plugR) / c.slots) * 0.45) {
    throw Error('Those slots would cut the fingers off the plug. Narrow the slots or use fewer of them.');
  }
  if (c.slots > 0 && d.flexLen < 2) throw Error('Increase plug length so the flexures have room past the solid base.');
  if (d.tubeOrbit < 10) throw Error('Increase the roller diameter or use smaller tubing.');
  if (c.plate < d.nutDepth + 2) throw Error('Increase plate thickness so the captured nut and its lip fit.');
  if (d.coneR + 1e-4 < d.screwHoleR + 0.25) throw Error('Tube ID is too small for this screw head to spread the fingers.');
  if (c.layout === 'axial') {
    if (d.tubeLength < 8) throw Error('Increase width, or reduce plate thickness, so a tube fits between the end plates.');
    if (d.tipGap < 2) throw Error('Increase width or shorten the plugs so the two plugs do not meet inside the tube.');
    if (d.tubeOrbit - d.padR < d.shaft.outerR + 1.5) throw Error('Increase the roller diameter or use smaller tubing so the shaft opening fits inside the plate.');
  } else if (d.nutR * 2 > c.plate - 0.8) {
    throw Error('Increase plate thickness so the nut drops in through the hub face.');
  } else if (c.layout === 'radial') {
    const nutInner = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth;
    if (!(d.hubR > d.shaft.outerR + d.socketDepth + d.nutDepth + 3)) throw Error('Increase the roller diameter or shorten the plugs so the hub clears the shaft.');
    if (nutInner < d.shaft.outerR + 1.5) throw Error('The captured nut would break into the shaft opening. Increase the diameter or use a smaller screw.');
  } else {
    if (!(d.hubR > d.shaft.outerR + d.socketDepth + 2)) throw Error('Increase the roller diameter or reduce the sweep angle so the hub clears the shaft.');
    assertTangential(c, d);
  }
  return { config: c, derived: d, adjustments: notes };
}

function roundTo(value, step) {
  return Math.round(Math.round(value / step) * step * 10000) / 10000;
}

function roundDown(value, step) {
  return Math.round(Math.floor((value + 1e-6) / step) * step * 10000) / 10000;
}

function roundUp(value, step) {
  return Math.round(Math.ceil((value - 1e-6) / step) * step * 10000) / 10000;
}

// Pull a number back inside the range the solid can use. Note it only when the
// user actually sent a value that had to move, so a missing key stays quiet.
function bound(notes, provided, before, min, max, step, message) {
  let next = roundTo(before, step);
  next = Math.min(max, Math.max(min, next));
  if (next < min) next = min;
  if (next > max) next = max;
  if (provided && Math.abs(before - next) > step * 0.51) notes.push(message(next));
  return next;
}

function normalize(raw, notes) {
  if (!raw || typeof raw !== 'object') throw Error('Settings are missing.');
  const layout = String(raw.layout || '');
  const shaft = String(raw.shaft || '');
  if (!LAYOUTS.has(layout)) throw Error('Choose an axial, radial, or tangential layout.');
  if (!SHAFTS.has(shaft)) throw Error('Choose a shaft interface.');
  const screw = Number(raw.screw);
  if (!(screw === 2 || screw === 3 || screw === 4)) throw Error('Choose an M2, M3, or M4 fastener.');
  const flag = (key) => raw[key] === true || raw[key] === 'true' || raw[key] === 'on' || raw[key] === 1 || raw[key] === '1';
  const joined = flag('joined');
  const barbs = flag('barbs');
  const flange = flag('flange');
  const material = String(raw.material || 'Silicone').replace(/[^\w .+-]/g, '').slice(0, 40);
  const given = (key) => raw[key] != null && raw[key] !== '';
  const num = (key) => {
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) throw Error('Enter a number for every dimension.');
    return value;
  };
  const pick = (key, fallback) => given(key) ? num(key) : fallback;
  const sweep = bound(notes, given('sweep'), pick('sweep', 45), 25, 75, 1, (next) => `Sweep set to ${next}°. It has to stay between 25° and 75°.`);
  const id = num('id');
  const nut = NUT[screw];
  let plate = bound(notes, given('plate'), num('plate'), 4, 20, 0.5, (next) => `Plate thickness set to ${next} mm.`);
  const minPlate = roundUp(nut.thick + 0.35 + 2, 0.5);
  if (plate < minPlate) {
    notes.push(`Plate thickness set to ${minPlate} mm so the captured nut and its lip fit.`);
    plate = minPlate;
  }
  if (layout !== 'axial') {
    const nutR = (nut.af + 0.35) / Math.sqrt(3);
    const minDrop = roundUp(nutR * 2 + 0.8, 0.5);
    if (plate < minDrop) {
      const next = Math.min(20, minDrop);
      notes.push(`Plate thickness set to ${next} mm so the nut can drop in through the hub face.`);
      plate = next;
    }
  }
  let slots = Math.round(pick('slots', 4));
  if (slots === 1) {
    if (given('slots')) notes.push('Flexure slots set to 2. A single slot does not leave fingers that can spread.');
    slots = 2;
  } else {
    const clamped = Math.min(8, Math.max(0, slots));
    if (given('slots') && clamped !== slots) notes.push(`Flexure slots set to ${clamped}. Use 0 for a solid plug, or 2 to 8 slots.`);
    slots = clamped;
  }
  return {
    layout, shaft, screw, material, joined, barbs, flange, sweep,
    diameter: bound(notes, given('diameter'), num('diameter'), 30, 220, 1, (next) => `Roller diameter set to ${next} mm.`),
    width: bound(notes, given('width'), num('width'), 20, 300, 1, (next) => `Roller width set to ${next} mm.`),
    count: bound(notes, given('count'), num('count'), 3, 16, 1, (next) => `Tubing positions set to ${next}.`),
    plate,
    id,
    od: num('od'),
    plug: bound(notes, given('plug'), num('plug'), 5, 30, 0.5, (next) => `Plug length set to ${next} mm.`),
    clearance: bound(notes, given('clearance'), num('clearance'), 0, 1, 0.05, (next) => `Plug undersize set to ${next} mm.`),
    slots,
    slotwidth: bound(notes, given('slotwidth'), pick('slotwidth', 0.8), 0.4, 2, 0.1, (next) => `Slot width set to ${next} mm.`),
    // Empty start/end means "begin at the tube end" and use flexlen as the slot length.
    slotstart: given('slotstart')
      ? bound(notes, true, num('slotstart'), 0, 30, 0.5, (next) => `Slot start set to ${next} mm.`)
      : null,
    slotend: given('slotend')
      ? bound(notes, true, num('slotend'), 0, 30, 0.5, (next) => `Slot end set to ${next} mm.`)
      : null,
    flexlen: given('flexlen')
      ? bound(notes, true, num('flexlen'), 2, 28, 0.5, (next) => `Flexure length set to ${next} mm.`)
      : null,
    barbcount: bound(notes, given('barbcount'), pick('barbcount', 3), 1, 6, 1, (next) => `Ridge count set to ${next}.`),
    barbheight: bound(notes, given('barbheight'), pick('barbheight', 0.45), 0.2, 1, 0.05, (next) => `Ridge height set to ${next} mm.`),
    barbwidth: bound(notes, given('barbwidth'), pick('barbwidth', 1.2), 0.6, 2.5, 0.1, (next) => `Ridge length set to ${next} mm.`),
    flangethick: bound(notes, given('flangethick'), pick('flangethick', 1.6), 0.8, 4, 0.1, (next) => `Flange thickness set to ${next} mm.`),
    flangedepth: bound(notes, given('flangedepth'), pick('flangedepth', 1.2), 0.4, 3, 0.1, (next) => `Flange depth set to ${next} mm.`)
  };
}

function shaftSpec(kind) {
  if (kind === 'round') return { kind, outerR: 4 + SHAFT_FIT, label: '8 mm round' };
  if (kind === 'hex') return { kind, outerR: (8 + 2 * SHAFT_FIT) / Math.sqrt(3), label: '8 mm hex across flats' };
  if (kind === 'rex') return { kind, outerR: 4.05 + SHAFT_FIT, label: '8 mm REX rounded hex' };
  return { kind, outerR: 3 + SHAFT_FIT, label: '6 mm D-shaft' };
}

function derive(c, notes) {
  const tubeOrbit = c.diameter / 2 - c.od / 2 - 1.5;
  const plugR = (c.id - c.clearance) / 2;
  const bossR = c.id / 2 + 1.5;
  const shaft = shaftSpec(c.shaft);
  const screwHoleR = c.screw / 2 + 0.2;
  const headR = HEAD[c.screw];
  const nut = NUT[c.screw];
  const nutAf = nut.af + 0.35;
  const nutDepth = nut.thick + 0.35;
  const nutR = nutAf / Math.sqrt(3);
  const coneR = Math.min(headR, plugR - 0.6);
  const coneLen = Math.min(Math.max(2.2, c.screw * 0.8), Math.max(1.5, c.plug * 0.28));
  const padR = Math.max(bossR, nutR + 1.35);
  const screwNote = `M${c.screw} × ${Math.ceil(c.plate + c.plug)} mm into a captured M${c.screw} nut`;
  if (c.layout === 'axial') {
    const root = Math.max(2, c.screw * 0.65);
    const tubeLength = c.width - 2 * (c.plate + BOSS);
    const tipGap = c.width - 2 * c.plate - 2 * c.plug - 2 * SEAT;
    const seated = c.joined ? AXIAL_EMBED + BOSS : BOSS - SEAT;
    return withFeatures(c, notes, {
      layout: 'axial', tubeOrbit, plugR, bossR, boss: BOSS, collarGap: COLLAR_GAP, shaft, screwHoleR, headR,
      boreStart: screwHoleR, coneR, coneLen: Math.min(coneLen, c.plug - root - 0.6), nutAf, nutDepth, nutR, padR, root, tubeLength, tipGap, screwNote, seated
    });
  }
  const socketDepth = Math.min(4.5, Math.max(3, c.plug * 0.22));
  const root = Math.max(2, c.screw * 0.65);
  const seated = c.joined ? socketDepth + HUB_EMBED : socketDepth;
  const tubeLength = 2 * c.plug;
  const sweep = c.layout === 'tangential' ? c.sweep : 0;
  // The tube tip stays on the same circle as a radial spoke. Sweeping the axis
  // off the radius shortens the radial reach, so the hub grows to make the tip up.
  let hubR = tubeOrbit - tubeLength;
  if (sweep) {
    const radians = sweep * Math.PI / 180;
    const offset = tubeLength * Math.sin(radians);
    if (!(offset < tubeOrbit - 2)) throw Error('Reduce the sweep angle or increase the roller diameter so the tubes can reach the outside.');
    hubR = Math.sqrt(tubeOrbit * tubeOrbit - offset * offset) - tubeLength * Math.cos(radians);
  }
  return withFeatures(c, notes, {
    layout: c.layout, tubeOrbit, plugR, bossR, boss: 0, collarGap: 0.3, shaft, screwHoleR, headR,
    boreStart: screwHoleR, coneR, coneLen: Math.min(coneLen, c.plug - root - 0.6), nutAf, nutDepth, nutR, padR, root,
    socketDepth, hubR, sweep, pinRadius: hubR - socketDepth - NUT_LIP - nutDepth / 2,
    tubeLength, screwNote, seated
  });
}

// Sweep rotates the spoke axis around the mouth. The mouth stays on the rim.
// The plug leaves on a slant, so its flank still clips the round disk after the
// mouth. The socket has to keep going until that flank is outside the disk.
function socketCutLength(d) {
  if (!d.sweep) return (d.socketDepth || 0) + 0.3;
  const sweepRad = (d.sweep * Math.PI) / 180;
  const flank = d.plugR;
  let t = 0;
  for (; t < d.tubeLength; t += 0.25) {
    const x = d.hubR + t;
    const clips = sweptRadius(d.hubR, sweepRad, x, flank) < d.hubR + 0.15
      || sweptRadius(d.hubR, sweepRad, x, -flank) < d.hubR + 0.15;
    if (!clips && t > 0) break;
  }
  return d.socketDepth + t + 0.8;
}

function sweptRadius(hubR, sweepRad, x, y) {
  const dx = x - hubR;
  const px = hubR + dx * Math.cos(sweepRad) - y * Math.sin(sweepRad);
  const py = dx * Math.sin(sweepRad) + y * Math.cos(sweepRad);
  return Math.hypot(px, py);
}

function spokeAxis(d, index, count) {
  const theta = (2 * Math.PI * index) / count;
  const dir = theta + (d.sweep * Math.PI) / 180;
  return {
    mouth: [d.hubR * Math.cos(theta), d.hubR * Math.sin(theta)],
    dir: [Math.cos(dir), Math.sin(dir)]
  };
}

function pointAt(axis, t) {
  return [axis.mouth[0] + axis.dir[0] * t, axis.mouth[1] + axis.dir[1] * t];
}

function segmentGap(a0, a1, b0, b1) {
  const ux = a1[0] - a0[0];
  const uy = a1[1] - a0[1];
  const vx = b1[0] - b0[0];
  const vy = b1[1] - b0[1];
  const wx = a0[0] - b0[0];
  const wy = a0[1] - b0[1];
  const aa = ux * ux + uy * uy;
  const bb = ux * vx + uy * vy;
  const cc = vx * vx + vy * vy;
  const dd = ux * wx + uy * wy;
  const ee = vx * wx + vy * wy;
  const denom = aa * cc - bb * bb;
  let sn;
  let tn;
  let sd;
  let td;
  if (denom < 1e-9) {
    sn = 0;
    sd = 1;
    tn = ee;
    td = cc;
  } else {
    sn = bb * ee - cc * dd;
    tn = aa * ee - bb * dd;
    sd = denom;
    td = denom;
    if (sn < 0) {
      sn = 0;
      tn = ee;
      td = cc;
    } else if (sn > sd) {
      sn = sd;
      tn = ee + bb;
      td = cc;
    }
  }
  if (tn < 0) {
    tn = 0;
    if (-dd < 0) sn = 0;
    else if (-dd > aa) sn = sd;
    else {
      sn = -dd;
      sd = aa;
    }
  } else if (tn > td) {
    tn = td;
    if (-dd + bb < 0) sn = 0;
    else if (-dd + bb > aa) sn = sd;
    else {
      sn = -dd + bb;
      sd = aa;
    }
  }
  const sc = Math.abs(sn) < 1e-9 ? 0 : sn / (sd || 1);
  const tc = Math.abs(tn) < 1e-9 ? 0 : tn / (td || 1);
  return Math.hypot(wx + sc * ux - tc * vx, wy + sc * uy - tc * vy);
}

function assertTangential(c, d) {
  const sweepRad = (d.sweep * Math.PI) / 180;
  // The disk alone cannot wrap an angled bore, so each spoke gets a root ear.
  // The ear's inner end has to miss the shaft opening.
  const earR = Math.max(d.plugR + d.collarGap, d.nutR) + 1.25;
  const x0 = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth - 0.4;
  if (sweptRadius(d.hubR, sweepRad, x0, 0) - earR < d.shaft.outerR + 0.8) {
    throw Error('Increase the sweep angle or the roller diameter so the spoke roots clear the shaft.');
  }
  const axes = [];
  for (let i = 0; i < c.count; i++) axes.push(spokeAxis(d, i, c.count));
  const plugR = d.plugR + (d.barbs ? d.barbs.height : 0);
  const t0 = -d.socketDepth;
  const t1 = t0 + c.plug;
  for (let i = 0; i < c.count; i++) {
    for (let j = i + 1; j < c.count; j++) {
      const a = axes[i];
      const b = axes[j];
      const plugs = segmentGap(pointAt(a, t0), pointAt(a, t1), pointAt(b, t0), pointAt(b, t1));
      if (plugs < plugR * 2 + 0.8) throw Error('Those plugs hit each other. Reduce the sweep angle or use fewer tubing positions.');
      const tubes = segmentGap(pointAt(a, 0), pointAt(a, d.tubeLength), pointAt(b, 0), pointAt(b, d.tubeLength));
      if (tubes < c.od + 0.8) throw Error('Those tubes hit each other. Reduce the sweep angle, use fewer positions, or increase the diameter.');
      const nutT = -(d.socketDepth + NUT_LIP + d.nutDepth / 2);
      const an = pointAt(a, nutT);
      const bn = pointAt(b, nutT);
      if (Math.hypot(an[0] - bn[0], an[1] - bn[1]) < d.nutR * 2 + 0.8) {
        throw Error('Those nut pockets would run together. Reduce the sweep angle or use fewer tubing positions.');
      }
    }
  }
}

// How far past the hub mouth an angled flank still clips the disk.
function mouthClear(d, flank) {
  if (!d.sweep) return 0;
  const sweepRad = (d.sweep * Math.PI) / 180;
  let t = 0;
  for (; t < d.tubeLength; t += 0.25) {
    const x = d.hubR + t;
    const clips = sweptRadius(d.hubR, sweepRad, x, flank) < d.hubR + 0.2
      || sweptRadius(d.hubR, sweepRad, x, -flank) < d.hubR + 0.2;
    if (!clips && t > 0) break;
  }
  return t + 0.45;
}

// The flange is the disk on the plug tip. Slots are measured from the plug
// base and cannot begin before the tube ends at the collar or hub.
function withFeatures(c, notes, d) {
  d.flange = null;
  d.flangeNote = '';
  const naturalTubeEnd = c.layout === 'axial' ? BOSS - SEAT : d.socketDepth;
  if (c.flange) {
    let thick = c.flangethick;
    const depth = c.flangedepth;
    const room = c.plug - naturalTubeEnd - (c.slots > 0 ? 2 : 0.4);
    if (room < 0.8) {
      notes.push('End flange turned off because the plug is too short for it.');
      c.flange = false;
    } else {
      if (thick > room) {
        thick = roundDown(room, 0.1);
        notes.push(`Flange thickness set to ${thick.toFixed(1)} mm so it stays on the tip.`);
      }
      c.flangethick = thick;
      const z = c.plug - thick;
      d.flange = { z, thick, depth };
      d.flangeNote = `End flange on the plug tip, ${thick.toFixed(2)} mm thick and ${depth.toFixed(2)} mm past the body`;
    }
  }
  const tubeStop = naturalTubeEnd;
  d.tubeStop = tubeStop;
  d.slotStart = tubeStop;
  d.flexLen = 0;
  d.slotCut = 0;
  if (c.slots > 0) {
    let start = c.slotstart == null ? tubeStop : c.slotstart;
    if (start < tubeStop - 0.001) {
      notes.push(`Slot start set to ${tubeStop.toFixed(1)} mm so the slots begin at the tube end.`);
      start = tubeStop;
    }
    const maxEnd = d.flange ? d.flange.z : c.plug;
    let end = c.slotend;
    if (end == null) {
      const length = c.flexlen == null ? Math.min(8, maxEnd - start) : c.flexlen;
      end = Math.min(maxEnd, start + length);
    }
    if (end > maxEnd + 0.001) {
      notes.push(`Slot end set to ${Number(maxEnd.toFixed(1))} mm so it stops before the plug tip.`);
      end = maxEnd;
    }
    if (end < start + 2) {
      if (start + 2 <= maxEnd + 0.001) {
        end = Math.min(maxEnd, start + 2);
        notes.push(`Slot end set to ${Number(end.toFixed(1))} mm so the fingers have length.`);
      } else if (maxEnd - tubeStop >= 2) {
        start = maxEnd - 2;
        end = maxEnd;
        notes.push(`Slot start set to ${start.toFixed(1)} mm so the fingers fit before the tip.`);
      } else {
        notes.push('Flexure slots turned off because the plug is too short for fingers.');
        c.slots = 0;
      }
    }
    if (c.slots > 0) {
      c.slotstart = Number(start.toFixed(2));
      c.slotend = Number(end.toFixed(2));
      c.flexlen = Number((end - start).toFixed(2));
      d.slotStart = c.slotstart;
      d.flexLen = c.flexlen;
      const through = d.slotStart + d.flexLen >= c.plug - 0.2;
      d.slotCut = through ? c.plug - d.slotStart + 0.5 : d.flexLen;
      const finger = (2 * Math.PI * d.plugR) / c.slots;
      const maxW = finger * 0.44;
      if (c.slotwidth > maxW) {
        const next = Math.max(0.4, roundDown(maxW, 0.1));
        notes.push(`Slot width set to ${next.toFixed(1)} mm so the fingers stay attached.`);
        c.slotwidth = next;
      }
    }
  }
  if (c.slots === 0) {
    if (c.slotstart == null) c.slotstart = Number(tubeStop.toFixed(2));
    if (c.slotend == null) c.slotend = c.slotstart;
    if (c.flexlen == null) c.flexlen = 0;
  }

  d.seatBite = c.layout === 'axial' ? BOSS - SEAT : d.socketDepth;
  d.tubeBite = c.plug - d.seatBite;
  return withBarbs(c, notes, d);
}

// Ridges sit on the plug outside, past the collar or socket, and stop before the tip flange or cone.
function withBarbs(c, notes, d) {
  d.barbs = null;
  d.barbNote = '';
  if (!c.barbs) return d;
  let count = c.barbcount;
  let height = c.barbheight;
  let width = c.barbwidth;
  if (width < height + 0.3) {
    const wider = Math.min(2.5, roundTo(height + 0.3, 0.1));
    if (wider >= height + 0.3) {
      notes.push(`Ridge length set to ${wider.toFixed(1)} mm so the ramp can be printed.`);
      width = wider;
    } else {
      height = Math.max(0.2, roundDown(width - 0.3, 0.05));
      notes.push(`Ridge height set to ${height.toFixed(2)} mm so the ramp can be printed.`);
    }
  }
  if (height <= c.clearance / 2 + 0.05) {
    const taller = Math.min(1, roundUp(c.clearance / 2 + 0.06, 0.05));
    if (taller > c.clearance / 2 + 0.05) {
      notes.push(`Ridge height set to ${taller.toFixed(2)} mm so the ridges reach the tube.`);
      height = taller;
    } else {
      notes.push('Barbs turned off because the ridges cannot reach the tube.');
      c.barbs = false;
      return d;
    }
  }
  if (width < height + 0.3) {
    const wider = Math.min(2.5, roundUp(height + 0.3, 0.1));
    if (wider >= height + 0.3) {
      notes.push(`Ridge length set to ${wider.toFixed(1)} mm so the ramp can be printed.`);
      width = wider;
    }
  }
  const maxHeight = c.id / 2 + 0.65 - d.plugR;
  if (height > maxHeight) {
    const shorter = roundDown(maxHeight, 0.05);
    if (shorter >= 0.2 && shorter > c.clearance / 2 + 0.05) {
      notes.push(`Ridge height set to ${shorter.toFixed(2)} mm so the ridges fit in the tube.`);
      height = shorter;
    } else {
      notes.push('Barbs turned off because the ridges cannot fit this tube.');
      c.barbs = false;
      return d;
    }
  }
  const start = Math.max(d.root, d.seated, c.slots > 0 ? d.slotStart : 0) + 0.4;
  const tipLimit = (d.flange ? d.flange.z : c.plug - d.coneLen) - 0.25;
  const end = Math.min(c.slots > 0 ? d.slotStart + d.flexLen - 0.2 : c.plug - d.coneLen - 0.5, tipLimit);
  let guard = 0;
  while (count >= 1 && guard++ < 30) {
    const gap = (end - start - count * width) / (count + 1);
    if (gap >= 0.3) break;
    if (width > 0.6 + 1e-6) width = Math.max(0.6, roundDown(width - 0.1, 0.1));
    else count -= 1;
  }
  const gap = count >= 1 ? (end - start - count * width) / (count + 1) : 0;
  if (!(count >= 1 && gap >= 0.3)) {
    notes.push('Barbs turned off because the ridges do not fit on the plug.');
    c.barbs = false;
    return d;
  }
  if (count !== c.barbcount) notes.push(`Ridge count set to ${count} so the ridges fit on the plug.`);
  if (Math.abs(width - c.barbwidth) > 0.001 && !(c.barbwidth < c.barbheight + 0.3)) {
    notes.push(`Ridge length set to ${width.toFixed(1)} mm so the ridges fit on the plug.`);
  }
  c.barbcount = count;
  c.barbheight = Number(height.toFixed(2));
  c.barbwidth = Number(width.toFixed(2));
  const trail = Math.min(0.55, Math.max(0.25, width * 0.28));
  const teeth = [];
  for (let i = 0; i < count; i++) teeth.push(start + gap * (i + 1) + width * i);
  d.barbs = { count, height, width, lead: width - trail, teeth };
  d.barbNote = `${count} ridges, ${height.toFixed(2)} mm tall and ${width.toFixed(2)} mm long, on the outside of each plug`;
  return d;
}

export function placements(c, d) {
  const plates = [];
  const plugs = [];
  const tubes = [];
  if (c.layout === 'axial') {
    plates.push({ end: 'near', x: 0, y: 0, z: 0, mirror: false });
    plates.push({ end: 'far', x: 0, y: 0, z: c.width, mirror: true });
    for (let i = 0; i < c.count; i++) {
      const a = (2 * Math.PI * i) / c.count;
      const x = d.tubeOrbit * Math.cos(a);
      const y = d.tubeOrbit * Math.sin(a);
      if (!c.joined) {
        plugs.push({ end: 'near', x, y, z: c.plate + SEAT, mirror: false });
        plugs.push({ end: 'far', x, y, z: c.width - c.plate - SEAT, mirror: true });
      }
      const z0 = c.plate + d.boss;
      const z1 = c.width - c.plate - d.boss;
      tubes.push({ x, y, z: (z0 + z1) / 2, length: z1 - z0, radius: c.od / 2, axis: 'z' });
    }
    return { plates, plugs, tubes };
  }
  plates.push({ end: 'hub', x: 0, y: 0, z: 0, mirror: false });
  const sweepRad = (d.sweep * Math.PI) / 180;
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    const rad = (deg * Math.PI) / 180;
    const dir = rad + sweepRad;
    if (!c.joined) plugs.push({
      end: 'spoke', deg, sweep: d.sweep, radius: d.hubR - d.socketDepth, hubR: d.hubR, z: c.plate / 2
    });
    const half = d.tubeLength / 2;
    tubes.push({
      x: d.hubR * Math.cos(rad) + Math.cos(dir) * half,
      y: d.hubR * Math.sin(rad) + Math.sin(dir) * half,
      z: c.plate / 2,
      length: d.tubeLength, radius: c.od / 2, axis: 'spoke', deg, dir
    });
  }
  return { plates, plugs, tubes };
}

export function scad(c, d) {
  const n = (v) => Number(v.toFixed(4));
  const hubR = d.hubR || 0;
  const socketDepth = d.socketDepth || 0;
  const barbLines = d.barbs
    ? d.barbs.teeth.map((y0) => `      translate([0, 0, ${n(y0)}]) rotate_extrude($fn = ${SEG_BODY}) polygon(points = [[${n(d.plugR - 0.05)}, 0], [${n(d.plugR + d.barbs.height)}, ${n(d.barbs.lead)}], [${n(d.plugR - 0.05)}, ${n(d.barbs.width)}]]);`).join('\n')
    : '';
  const flangeOn = Boolean(d.flange);
  return `// Allsparks Intake Lab — companion to the validated STL.
// ${d.shaft.label}. Fastener: ${d.screwNote}. Joined plugs: ${c.joined ? 'yes' : 'no'}.
// ${d.barbNote || 'Plug outside is smooth.'}
// ${d.flangeNote || 'No end flange.'}
// Shaft holes include ${SHAFT_FIT} mm clearance per side.
// The plate and hub STLs stand with the axle vertical. The plug STL is laid on its side so the screw hole is horizontal.
$fn = 128;
layout = "${c.layout}";
sweep = ${n(d.sweep || 0)};
hub_r = ${n(hubR)};
socket_depth = ${n(socketDepth)};
diameter = ${n(c.diameter)};
width = ${n(c.width)};
count = ${c.count};
plate = ${n(c.plate)};
tube_id = ${n(c.id)};
tube_od = ${n(c.od)};
insertion = ${n(c.plug)};
clearance = ${n(c.clearance)};
slots = ${c.slots};
slot_width = ${n(c.slotwidth)};
slot_start = ${n(d.slotStart || 0)};
flex_length = ${n(d.slotCut || 0)};
flange = ${flangeOn ? 'true' : 'false'};
flange_z = ${n(flangeOn ? d.flange.z : 0)};
flange_thick = ${n(flangeOn ? d.flange.thick : 0)};
flange_depth = ${n(flangeOn ? d.flange.depth : 0)};
screw = ${c.screw};
shaft = "${c.shaft}";
fit = ${SHAFT_FIT};
plug_r = ${n(d.plugR)};
root = ${n(d.root)};
nut_af = ${n(d.nutAf)};
nut_depth = ${n(d.nutDepth)};
joined = ${c.joined ? 'true' : 'false'};
barbs = ${c.barbs ? 'true' : 'false'};
barb_count = ${c.barbs ? d.barbs.count : 0};
barb_height = ${n(c.barbs ? d.barbs.height : 0)};
barb_width = ${n(c.barbs ? d.barbs.width : 0)};

// Mouth stays on the rim. sweep rotates the spoke off a straight radial line.
module place_spoke() {
  translate([hub_r, 0, 0])
    rotate([0, 0, sweep])
      translate([-hub_r, 0, 0])
        children();
}

module shaft_profile() {
  if (shaft == "hex") circle(r = ${(8 + 2 * SHAFT_FIT).toFixed(4)} / sqrt(3), $fn = 6);
  else if (shaft == "rex") offset(r = fit) offset(r = 0.5) offset(r = -0.5) circle(r = 4.05, $fn = 6);
  else if (shaft == "d") difference() { circle(r = ${n(3 + SHAFT_FIT)}); translate([${n(2.5 + SHAFT_FIT)}, -6]) square([8, 12]); }
  else circle(r = ${n(4 + SHAFT_FIT)});
}

module flexure_plug() {
  difference() {
    union() {
      cylinder(h = insertion, r = plug_r);
      if (flange) translate([0, 0, flange_z]) cylinder(h = flange_thick, r = plug_r + flange_depth);
${barbLines}
    }
    translate([0, 0, -0.2]) cylinder(h = insertion + 0.4, r1 = screw / 2 + 0.35, r2 = max(0.45, screw / 2 - 0.08));
    if (slots > 0) for (i = [0 : slots - 1]) rotate([0, 0, i * 360 / slots])
      translate([0, -slot_width / 2, slot_start]) cube([plug_r + 2, slot_width, flex_length]);
    if (layout != "axial") translate([0, 0, socket_depth / 2]) rotate([0, 90, 0])
      cylinder(h = plug_r * 2 + 4, r = screw / 2 + 0.2, center = true);
  }
}

module roller_plate() {
  difference() {
    union() {
      cylinder(h = plate, r = ${c.layout === 'axial' ? n(d.tubeOrbit) : n(hubR)});
      if (layout == "tangential") for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count])
        place_spoke()
          union() {
            translate([${n(hubR - socketDepth - 1 - d.nutDepth - 0.4)}, 0, 0]) cylinder(h = plate, r = ${n(Math.max(d.plugR + (d.collarGap || 0.3), d.nutR) + 1.25)});
            translate([${n(hubR - socketDepth - 1 - d.nutDepth - 0.4)}, ${n(-(Math.max(d.plugR + (d.collarGap || 0.3), d.nutR) + 1.25))}, 0])
              cube([${n(socketDepth + 1 + d.nutDepth + 0.4)}, ${n(2 * (Math.max(d.plugR + (d.collarGap || 0.3), d.nutR) + 1.25))}, plate]);
          }
      if (layout == "axial") for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count])
        translate([${n(d.tubeOrbit)}, 0, plate]) difference() {
          cylinder(h = ${n(BOSS)}, r = ${n(d.bossR)});
          translate([0, 0, -0.1]) cylinder(h = ${n(BOSS + 0.2)}, r = ${n(d.plugR + COLLAR_GAP)});
        }
    }
    translate([0, 0, -1]) linear_extrude(plate + 4) shaft_profile();
    if (layout != "axial") for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count])
      place_spoke()
        translate([hub_r - socket_depth, 0, plate / 2]) rotate([0, 90, 0])
          cylinder(h = ${n(socketCutLength(d))}, r = ${n(d.plugR + (d.collarGap || 0.3))});
    for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count]) {
      if (layout == "axial") {
        translate([${n(d.tubeOrbit)}, 0, 0]) cylinder(h = nut_depth, r = nut_af / sqrt(3), $fn = 6);
        translate([${n(d.tubeOrbit)}, 0, nut_depth]) cylinder(h = plate, r = screw / 2 + 0.2);
      } else {
        place_spoke()
          translate([hub_r - socket_depth - 1 - nut_depth, 0, plate / 2])
            rotate([0, 90, 0]) cylinder(h = nut_depth, r = nut_af / sqrt(3), $fn = 6);
      }
    }
  }
}

roller_plate();
translate([diameter / 2 + 24, 0, 0]) flexure_plug();
`;
}

function polygon(C, keep, sides, radius) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return keep(new C([pts]));
}

function shaftProfile(C, keep, kind) {
  if (kind === 'round') return keep(C.circle(4 + SHAFT_FIT, SEG_SHAFT));
  if (kind === 'hex') return polygon(C, keep, 6, (8 + 2 * SHAFT_FIT) / Math.sqrt(3));
  if (kind === 'rex') {
    const hex = polygon(C, keep, 6, 4.05);
    return keep(keep(hex.offset(-0.5, 'Round', 2, SEG_REX)).offset(0.5 + SHAFT_FIT, 'Round', 2, SEG_REX));
  }
  const r = 3 + SHAFT_FIT;
  const flat = 2.5 + SHAFT_FIT;
  const disk = keep(C.circle(r, SEG_SHAFT));
  const cut = keep(keep(C.square([8, r * 2 + 4], false)).translate([flat, -(r + 2)]));
  return keep(disk.subtract(cut));
}

export function generate(m, raw) {
  const { config: c, derived: d, adjustments } = validate(raw);
  const owned = [];
  const keep = (x) => { owned.push(x); return x; };
  const M = m.Manifold;
  const C = m.CrossSection;
  const cyl = (h, r0, r1 = r0, n = 48) => keep(M.cylinder(h, r0, r1, n, false));
  const uni = (list) => list.length === 1 ? list[0] : keep(M.union(list));
  try {
    const plug = makePlug(M, C, keep, cyl, uni, c, d);
    let plate = c.layout === 'axial'
      ? makeAxialPlate(M, C, keep, cyl, uni, c, d)
      : makeHub(M, C, keep, cyl, uni, c, d);
    if (c.joined) plate = fusePlugs(M, keep, uni, c, d, plate, plug);
    const placed = place(M, keep, c, d, plate, plug);
    assertFit(M, keep, cyl, c, d, plate, plug, placed);
    const parts = [plate, plug].map((solid, index) => {
      const label = index === 0 ? (c.layout === 'axial' ? 'Plate' : 'Hub') : 'Plug';
      if (solid.status() !== 'NoError' || solid.isEmpty()) throw Error(label + ' geometry is not a valid solid.');
      const pieces = solid.decompose();
      pieces.forEach(keep);
      if (pieces.length !== 1) throw Error(label + ' is not one connected solid. Adjust the slots, screw, or diameter.');
      return pieces[0];
    });
    const plateMesh = toMesh(keep, parts[0]);
    const plugMesh = toMesh(keep, parts[1]);
    return {
      config: c,
      derived: publicDerived(c, d),
      placements: placements(c, d),
      scad: scad(c, d),
      plate: plateMesh,
      plug: plugMesh,
      overlap: placed.overlap,
      triangles: [plateMesh.indices.length / 3, plugMesh.indices.length / 3],
      components: [1, 1],
      volumes: [parts[0].volume(), parts[1].volume()],
      adjustments
    };
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
  }
}

function publicDerived(c, d) {
  return {
    layout: d.layout,
    wall: (c.od - c.id) / 2,
    tubeLength: d.tubeLength,
    tubeOrbit: d.tubeOrbit,
    hubR: d.hubR || 0,
    sweep: d.sweep || 0,
    plugR: d.plugR,
    shaft: d.shaft.label,
    screwNote: d.screwNote,
    barbNote: d.barbNote || '',
    flangeNote: d.flangeNote || '',
    seatBite: d.seatBite,
    tubeBite: d.tubeBite,
    tubeStop: d.tubeStop || 0,
    slotStart: d.slotStart || 0,
    slotEnd: (d.slotStart || 0) + (d.flexLen || 0),
    seatName: c.layout === 'axial' ? 'plate collar' : 'hub socket',
    flexLen: d.flexLen || 0,
    joined: c.joined,
    parts: c.joined
      ? (c.layout === 'axial' ? '2 plates with plugs' : '1 hub with plugs')
      : (c.layout === 'axial' ? `2 plates + ${c.count * 2} plugs` : `1 hub + ${c.count} plugs`)
  };
}

function makePlug(M, C, keep, cyl, uni, c, d) {
  const parts = [cyl(c.plug, d.plugR, d.plugR, SEG_BODY)];
  if (d.flange) {
    parts.push(keep(cyl(d.flange.thick, d.plugR + d.flange.depth, d.plugR + d.flange.depth, SEG_BODY).translate([0, 0, d.flange.z])));
  }
  if (d.barbs) {
    const r0 = d.plugR - 0.05;
    const r1 = d.plugR + d.barbs.height;
    for (const y0 of d.barbs.teeth) {
      const profile = keep(new C([[[r0, y0], [r1, y0 + d.barbs.lead], [r0, y0 + d.barbs.width]]]));
      parts.push(keep(profile.revolve(SEG_BODY)));
    }
  }
  let body = uni(parts);
  const tools = [keep(cyl(c.plug + 0.4, d.screwHoleR, d.screwHoleR, SEG_BORE).translate([0, 0, -0.2]))];
  if (d.coneLen > 0.8 && d.coneR > d.screwHoleR) {
    tools.push(keep(cyl(d.coneLen + 0.05, d.screwHoleR, d.coneR, SEG_BORE).translate([0, 0, c.plug - d.coneLen])));
  }
  if (c.slots > 0 && d.slotCut > 0.2) {
    const through = d.slotStart + d.flexLen >= c.plug - 0.2;
    const z0 = through ? d.slotStart - 0.05 : d.slotStart;
    const reach = d.plugR + (d.barbs ? d.barbs.height + 0.9 : 1.6);
    for (let s = 0; s < c.slots; s++) {
      let box = keep(M.cube([reach, c.slotwidth, d.slotCut], false));
      box = keep(box.translate([0, -c.slotwidth / 2, z0]));
      box = keep(box.rotate([0, 0, (360 * s) / c.slots]));
      tools.push(box);
    }
  }
  return keep(body.subtract(uni(tools)));
}

function hexPrism(C, keep, acrossFlats, height) {
  return keep(polygon(C, keep, 6, acrossFlats / Math.sqrt(3)).extrude(height));
}

function makeAxialPlate(M, C, keep, cyl, uni, c, d) {
  const bodies = [cyl(c.plate, d.tubeOrbit, d.tubeOrbit, SEG_RIM)];
  const holes = [];
  let shaft = keep(shaftProfile(C, keep, c.shaft).extrude(c.plate + d.boss + 2));
  holes.push(keep(shaft.translate([0, 0, -1])));
  for (let i = 0; i < c.count; i++) {
    const a = (2 * Math.PI * i) / c.count;
    const x = d.tubeOrbit * Math.cos(a);
    const y = d.tubeOrbit * Math.sin(a);
    const ring = keep(keep(C.circle(d.bossR, SEG_FEATURE)).subtract(keep(C.circle(d.plugR + d.collarGap, SEG_FEATURE))));
    let collar = keep(ring.extrude(d.boss));
    bodies.push(keep(collar.translate([x, y, c.plate])));
    bodies.push(keep(cyl(c.plate, d.padR, d.padR, SEG_FEATURE).translate([x, y, 0])));
    holes.push(keep(hexPrism(C, keep, d.nutAf, d.nutDepth).translate([x, y, 0])));
    holes.push(keep(cyl(c.plate - d.nutDepth + 2, d.screwHoleR, d.screwHoleR, SEG_BORE).translate([x, y, d.nutDepth - 0.05])));
  }
  return keep(uni(bodies).subtract(uni(holes)));
}

function transformSpoke(keep, solid, d, deg) {
  let placed = solid;
  if (d.sweep) {
    placed = keep(placed.translate([-d.hubR, 0, 0]));
    placed = keep(placed.rotate([0, 0, d.sweep]));
    placed = keep(placed.translate([d.hubR, 0, 0]));
  }
  return keep(placed.rotate([0, 0, deg]));
}

function placeProfile(keep, profile, hubR, sweep, deg) {
  let placed = profile;
  if (sweep) {
    placed = keep(placed.translate([-hubR, 0]));
    placed = keep(placed.rotate(sweep));
    placed = keep(placed.translate([hubR, 0]));
  }
  return keep(placed.rotate(deg));
}

function makeHub(M, C, keep, cyl, uni, c, d) {
  const holes = [];
  // Angled bores walk out of a plain disk. The root is drawn in the hub outline,
  // then extruded once, so the top face stays a single flat.
  const earR = d.sweep ? Math.max(d.plugR + d.collarGap, d.nutR) + 1.25 : 0;
  let profile = keep(C.circle(d.hubR, SEG_RIM));
  if (earR) {
    const nutX0 = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth;
    const x0 = nutX0 - 0.4;
    const inner = keep(C.circle(earR, SEG_FEATURE).translate([x0, 0]));
    const bar = keep(C.square([d.hubR - x0, earR * 2], false).translate([x0, -earR]));
    const ear = keep(inner.add(bar));
    for (let i = 0; i < c.count; i++) {
      profile = keep(profile.add(placeProfile(keep, ear, d.hubR, d.sweep, (360 * i) / c.count)));
    }
  }
  const bodies = [keep(profile.extrude(c.plate))];
  let shaft = keep(shaftProfile(C, keep, c.shaft).extrude(c.plate + 2));
  holes.push(keep(shaft.translate([0, 0, -1])));
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    const nutX = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth;
    if (!c.joined) {
      const cut = socketCutLength(d);
      let socket = cyl(Math.min(cut, d.socketDepth + 0.3), d.plugR + d.collarGap, d.plugR + d.collarGap, SEG_FEATURE);
      socket = keep(socket.rotate([0, 90, 0]));
      socket = keep(socket.translate([d.hubR - d.socketDepth, 0, c.plate / 2]));
      holes.push(transformSpoke(keep, socket, d, deg));
      if (cut > d.socketDepth + 0.35) {
        const proud = d.barbs ? d.barbs.height + 0.15 : 0;
        const reliefR = d.plugR + Math.max(d.collarGap, proud);
        let relief = cyl(cut - d.socketDepth, reliefR, reliefR, SEG_FEATURE);
        relief = keep(relief.rotate([0, 90, 0]));
        relief = keep(relief.translate([d.hubR, 0, c.plate / 2]));
        holes.push(transformSpoke(keep, relief, d, deg));
      }
    }
    if (d.sweep) {
      // The tube is a separate part. On the side that leans into the hub, the
      // disk would otherwise fill space the tube occupies. Cut that room out.
      const tubeR = c.od / 2 + 0.45;
      const reach = Math.max(mouthClear(d, tubeR), c.od);
      let room = cyl(reach, tubeR, tubeR, SEG_BODY);
      room = keep(room.rotate([0, 90, 0]));
      room = keep(room.translate([d.hubR - 0.35, 0, c.plate / 2]));
      holes.push(transformSpoke(keep, room, d, deg));
    }
    let pocket = keep(hexPrism(C, keep, d.nutAf, d.nutDepth).rotate([0, 90, 0]));
    pocket = keep(pocket.translate([nutX, 0, c.plate / 2]));
    holes.push(transformSpoke(keep, pocket, d, deg));
    let chute = keep(M.cube([d.nutDepth, d.nutAf, c.plate / 2 + d.nutR + 0.8], false));
    chute = keep(chute.translate([nutX, -d.nutAf / 2, c.plate / 2 - 0.2]));
    holes.push(transformSpoke(keep, chute, d, deg));
    let screw = cyl(d.nutDepth + NUT_LIP + d.socketDepth + 3, d.screwHoleR, d.screwHoleR, SEG_BORE);
    screw = keep(screw.rotate([0, 90, 0]));
    screw = keep(screw.translate([nutX - 0.4, 0, c.plate / 2]));
    holes.push(transformSpoke(keep, screw, d, deg));
  }
  return keep(uni(bodies).subtract(uni(holes)));
}

function fusePlugs(M, keep, uni, c, d, plate, plug) {
  const parts = [plate];
  if (c.layout === 'axial') {
    for (let i = 0; i < c.count; i++) {
      const a = (2 * Math.PI * i) / c.count;
      parts.push(keep(plug.translate([d.tubeOrbit * Math.cos(a), d.tubeOrbit * Math.sin(a), c.plate - AXIAL_EMBED])));
    }
    return uni(parts);
  }
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    let spoke = keep(plug.rotate([0, 90, 0]));
    spoke = keep(spoke.translate([d.hubR - d.socketDepth - HUB_EMBED, 0, c.plate / 2]));
    parts.push(transformSpoke(keep, spoke, d, deg));
  }
  return uni(parts);
}

function place(M, keep, c, d, plate, plug) {
  if (c.layout === 'axial') {
    const farPlate = keep(keep(plate.mirror([0, 0, 1])).translate([0, 0, c.width]));
    const plugs = [];
    let overlap = keep(plate.intersect(farPlate)).volume();
    if (!c.joined) {
      for (let i = 0; i < c.count; i++) {
        const a = (2 * Math.PI * i) / c.count;
        const x = d.tubeOrbit * Math.cos(a);
        const y = d.tubeOrbit * Math.sin(a);
        const near = keep(plug.translate([x, y, c.plate + SEAT]));
        const far = keep(keep(plug.mirror([0, 0, 1])).translate([x, y, c.width - c.plate - SEAT]));
        plugs.push(near, far);
        overlap += keep(plate.intersect(near)).volume() + keep(plate.intersect(far)).volume();
        overlap += keep(farPlate.intersect(near)).volume() + keep(farPlate.intersect(far)).volume();
      }
    }
    return { plates: [plate, farPlate], plugs, overlap };
  }
  if (c.joined) return { plates: [plate], plugs: [], overlap: 0 };
  const plugs = [];
  let overlap = 0;
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    let spoke = keep(plug.rotate([0, 90, 0]));
    spoke = keep(spoke.translate([d.hubR - d.socketDepth, 0, c.plate / 2]));
    spoke = transformSpoke(keep, spoke, d, deg);
    plugs.push(spoke);
    overlap += keep(plate.intersect(spoke)).volume();
  }
  if (c.layout === 'tangential') {
    for (let i = 0; i < plugs.length; i++) {
      for (let j = i + 1; j < plugs.length; j++) {
        if (keep(plugs[i].intersect(plugs[j])).volume() > 0.05) {
          throw Error('Those plugs hit each other. Reduce the sweep angle or use fewer tubing positions.');
        }
      }
    }
  }
  return { plates: [plate], plugs, overlap };
}

function assertFit(M, keep, cyl, c, d, plate, plug, placed) {
  if (placed.overlap > 0.05) throw Error(`Assembly clearance check failed (${placed.overlap.toFixed(3)} mm³ overlap).`);
  const probeR = (d.screwHoleR + d.nutAf / 2) / 2;
  if (c.layout === 'axial') {
    for (let i = 0; i < c.count; i++) {
      const a = (2 * Math.PI * i) / c.count;
      const x = d.tubeOrbit * Math.cos(a);
      const y = d.tubeOrbit * Math.sin(a);
      const body = c.joined ? placed.plates[0] : plate;
      const screw = keep(cyl(c.plate - d.nutDepth + 2.4, d.screwHoleR * 0.45).translate([x, y, d.nutDepth + 0.15]));
      if (keep(screw.intersect(body)).volume() > 0.02) throw Error('Screw path hits the plate.');
      if (!c.joined && keep(screw.intersect(placed.plugs[i * 2])).volume() > 0.02) throw Error('Screw path hits the plug.');
      const pocket = keep(cyl(Math.max(0.4, d.nutDepth - 0.5), probeR).translate([x, y, 0.2]));
      if (keep(pocket.intersect(body)).volume() > 0.02) throw Error('Captured nut pocket is blocked.');
    }
    return;
  }
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    const nutX = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth;
    const along = (length, radius, x0) => {
      let tool = keep(cyl(length, radius).rotate([0, 90, 0]));
      tool = keep(tool.translate([x0, 0, c.plate / 2]));
      return transformSpoke(keep, tool, d, deg);
    };
    const body = c.joined ? plate : plate;
    const screw = along(d.nutDepth + NUT_LIP + 3, d.screwHoleR * 0.45, nutX + 0.15);
    if (keep(screw.intersect(body)).volume() > 0.02) throw Error('Screw path hits the hub.');
    if (!c.joined && keep(screw.intersect(placed.plugs[i])).volume() > 0.02) throw Error('Screw path hits the plug.');
    const pocket = along(Math.max(0.4, d.nutDepth - 0.45), probeR, nutX + 0.2);
    if (keep(pocket.intersect(body)).volume() > 0.02) throw Error('Captured nut pocket is blocked.');
    const seat = along(d.nutDepth + NUT_LIP + d.socketDepth + 2, d.screwHoleR + 0.35, nutX - 0.2);
    const seated = c.joined ? body : placed.plugs[i];
    if (keep(seat.intersect(seated)).volume() < 0.05) throw Error('Flexure plug is not on the screw path.');
    if (d.sweep && !c.joined) {
      const tubeR = Math.max(0.6, c.od / 2 - 0.2);
      const reach = Math.min(d.tubeLength - 0.5, Math.max(6, mouthClear(d, c.od / 2 + 0.45)));
      const tube = along(reach, tubeR, d.hubR - 0.15);
      if (keep(tube.intersect(body)).volume() > 3) throw Error('The hub still fills the tube on the tangential side.');
    }
  }
}

function toMesh(keep, solid) {
  const simplified = keep(solid.simplify(0.0004));
  const g = simplified.getMesh();
  const vertices = new Float32Array(g.vertProperties);
  const indices = [];
  for (let k = 0; k < vertices.length; k++) vertices[k] = Math.round(vertices[k] * 10000) / 10000;
  for (let i = 0; i < g.triVerts.length; i += 3) {
    const p = [];
    for (let j = 0; j < 3; j++) {
      const k = g.triVerts[i + j] * g.numProp;
      p.push([vertices[k], vertices[k + 1], vertices[k + 2]]);
    }
    const u = p[1].map((value, k) => value - p[0][k]);
    const v = p[2].map((value, k) => value - p[0][k]);
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (area > 1e-10) indices.push(g.triVerts[i], g.triVerts[i + 1], g.triVerts[i + 2]);
  }
  return { vertices, indices: new Uint32Array(indices), stride: g.numProp };
}

// STL orientation is the suggested print pose.
// Plates and hubs keep the axle on Z so it stands vertical on the bed.
// Plugs are rolled onto their side so the screw hole runs horizontal.
export function forPrint(mesh, part, slots = 0) {
  if (part === 'plug') return layPlugDown(mesh, slots);
  return mesh;
}

function layPlugDown(mesh, slots) {
  // A finger, not a slot, faces the bed. Slot centers are every 360/slots degrees.
  const spin = slots > 0 ? -Math.PI / slots : 0;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const out = new Float32Array(mesh.vertices);
  for (let i = 0; i < out.length; i += mesh.stride) {
    let x = out[i];
    let y = out[i + 1];
    const z = out[i + 2];
    if (spin) {
      const nx = x * cos - y * sin;
      const ny = x * sin + y * cos;
      x = nx;
      y = ny;
    }
    // Former screw axis (+Z) becomes +X. Former +X becomes down.
    out[i] = z;
    out[i + 1] = y;
    out[i + 2] = -x;
  }
  let minZ = Infinity;
  for (let i = 2; i < out.length; i += mesh.stride) minZ = Math.min(minZ, out[i]);
  if (Number.isFinite(minZ)) {
    for (let i = 2; i < out.length; i += mesh.stride) out[i] -= minZ;
  }
  return { vertices: out, indices: mesh.indices, stride: mesh.stride };
}

export function stl(mesh, label = 'Allsparks intake') {
  const n = mesh.indices.length / 3;
  const b = new ArrayBuffer(84 + n * 50);
  const v = new DataView(b);
  for (let i = 0; i < label.length && i < 80; i++) v.setUint8(i, label.charCodeAt(i));
  v.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const p = [];
    for (let j = 0; j < 3; j++) {
      const k = mesh.indices[i * 3 + j] * mesh.stride;
      p.push([mesh.vertices[k], mesh.vertices[k + 1], mesh.vertices[k + 2]]);
    }
    const u = p[1].map((value, k) => value - p[0][k]);
    const w = p[2].map((value, k) => value - p[0][k]);
    const normal = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...normal) || 1;
    const values = [...normal.map((value) => value / len), ...p.flat()];
    values.forEach((value, j) => v.setFloat32(84 + i * 50 + j * 4, value, true));
  }
  return b;
}
