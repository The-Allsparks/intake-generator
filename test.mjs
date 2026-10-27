import { init, generate, validate, stl, forPrint, RECIPES } from './geometry.js';

function closed(mesh) {
  const edges = new Map();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = [];
    for (let j = 0; j < 3; j++) {
      const k = mesh.indices[i + j] * mesh.stride;
      p.push(Array.from(mesh.vertices.slice(k, k + 3)).join(','));
    }
    for (let j = 0; j < 3; j++) {
      const key = [p[j], p[(j + 1) % 3]].sort().join('|');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  if ([...edges.values()].some((count) => count !== 2)) throw Error('Exported mesh is not closed');
}

const base = {
  layout: 'axial', diameter: 90, width: 120, count: 6, plate: 8,
  id: 6.35, od: 9.525, material: 'Silicone', plug: 12, clearance: 0.2,
  slots: 4, slotwidth: 0.8, shaft: 'rex', screw: 3
};

function expectThrow(config, text) {
  try {
    validate(config);
    throw Error('Accepted invalid settings');
  } catch (error) {
    if (error.message === 'Accepted invalid settings' || !error.message.toLowerCase().includes(text)) {
      throw Error(`Expected "${text}" but got: ${error.message}`);
    }
  }
}

const manifold = await init();
const volumes = {};
for (const shaft of ['rex', 'hex', 'round', 'd']) {
  const result = generate(manifold, { ...base, shaft });
  closed(result.plate);
  closed(result.plug);
  if (result.overlap > 0.05) throw Error(`${shaft} overlap ${result.overlap}`);
  if (result.components.some((count) => count !== 1)) throw Error(shaft);
  if (result.volumes.some((volume) => !(volume > 0))) throw Error(`${shaft} empty`);
  const bytes = stl(result.plate, 'Allsparks intake plate');
  const view = new DataView(bytes);
  if (view.getUint32(80, true) !== result.triangles[0]) throw Error('STL count');
  if (view.getUint8(0) === 115 && view.getUint8(1) === 111) throw Error('STL header looks like ASCII');
  volumes[shaft] = result.volumes[0];
  console.log(shaft, result.triangles, result.volumes.map((v) => v.toFixed(1)), 'cut', result.derived.tubeLength.toFixed(1));
}
if (volumes.hex === volumes.round || volumes.d === volumes.round || volumes.rex === volumes.hex) {
  throw Error(`Shaft profiles did not change the plate volume: ${JSON.stringify(volumes)}`);
}

const radialDefault = generate(manifold, { ...base, layout: 'radial' });
closed(radialDefault.plate);
closed(radialDefault.plug);
if (Math.abs(radialDefault.derived.hubR - (radialDefault.derived.tubeOrbit - 24)) > 0.01) throw Error('Radial hub radius changed');
const radialRay = radialDefault.placements.tubes[0];
if (Math.abs(radialRay.dir - radialRay.deg * Math.PI / 180) > 1e-9) throw Error('Radial tube left the spoke');
console.log('radial default', radialDefault.derived.parts, 'hub', radialDefault.derived.hubR.toFixed(1));

const radial = generate(manifold, { ...base, layout: 'radial', diameter: 140, plug: 10 });
closed(radial.plate);
closed(radial.plug);
if (radial.overlap > 0.05) throw Error(`radial overlap ${radial.overlap}`);
if (!radial.scad.includes('layout = "radial"') || !radial.scad.includes('shaft = "rex"')) throw Error('OpenSCAD export');
console.log('radial', radial.triangles, radial.derived.parts, 'hub', radial.derived.hubR.toFixed(1));

const busy = generate(manifold, { ...base, count: 16, diameter: 180, width: 220, id: 8, od: 12, plug: 8, screw: 2 });
closed(busy.plate);
closed(busy.plug);
console.log('16-up', busy.triangles);

expectThrow({ ...base, od: 6, id: 6.35 }, 'od');
expectThrow({ ...base, width: 30, plug: 12 }, 'width');
const bumpedId = generate(manifold, { ...base, id: 4, od: 7 });
closed(bumpedId.plate);
if (!(bumpedId.config.id >= 5)) throw Error(`Tube ID should be pushed up so the screw fits, got ${bumpedId.config.id}`);
const wideSlots = generate(manifold, { ...base, slotwidth: 2, slots: 8, id: 8, od: 12 });
closed(wideSlots.plug);
if (!(wideSlots.config.slotwidth < 2)) throw Error('Wide slots should be narrowed so the fingers stay attached');
const joined = generate(manifold, { ...base, joined: true });
closed(joined.plate);
closed(joined.plug);
if (!(joined.volumes[0] > volumes.rex + 500)) throw Error('Joined plate should include the plugs');
if (!joined.derived.parts.includes('with plugs')) throw Error(joined.derived.parts);
console.log('joined axial', joined.triangles[0], joined.volumes[0].toFixed(0));

const joinedRadial = generate(manifold, { ...base, layout: 'radial', joined: true });
closed(joinedRadial.plate);
if (!(joinedRadial.volumes[0] > radialDefault.volumes[0] + 200)) throw Error('Joined hub should include the plugs');
console.log('joined radial', joinedRadial.triangles[0], joinedRadial.volumes[0].toFixed(0));

const thicker = generate(manifold, { ...base, screw: 4, plate: 4 });
closed(thicker.plate);
if (!(thicker.config.plate >= 6)) throw Error(`Plate should grow so the M4 nut fits, got ${thicker.config.plate}`);
expectThrow({ ...base, layout: 'radial', diameter: 40 }, 'diameter');
expectThrow({ ...base, shaft: 'spline' }, 'shaft');
const mildSweep = generate(manifold, { ...base, layout: 'tangential', sweep: 10 });
closed(mildSweep.plate);
if (mildSweep.config.sweep !== 25) throw Error(`Sweep should be pushed to 25°, got ${mildSweep.config.sweep}`);

const tangential = generate(manifold, { ...base, layout: 'tangential', sweep: 45 });
closed(tangential.plate);
closed(tangential.plug);
if (tangential.overlap > 0.05) throw Error(`tangential overlap ${tangential.overlap}`);
if (!(tangential.derived.hubR > radialDefault.derived.hubR + 1)) throw Error('Swept tubes should grow the hub');
if (!(tangential.volumes[0] > radialDefault.volumes[0])) throw Error('Tangential hub should be larger than the radial hub');
const trailed = tangential.placements.tubes[0];
const tipR = Math.hypot(
  trailed.x + Math.cos(trailed.dir) * trailed.length / 2,
  trailed.y + Math.sin(trailed.dir) * trailed.length / 2
);
if (Math.abs(tipR - tangential.derived.tubeOrbit) > 0.05) throw Error(`tip ${tipR} vs orbit ${tangential.derived.tubeOrbit}`);
if (Math.abs(trailed.dir - 45 * Math.PI / 180) > 1e-6) throw Error('sweep direction');
if (trailed.y < 1) throw Error('tube should trail off the radial line');
if (!tangential.scad.includes('layout = "tangential"') || !tangential.scad.includes('sweep = 45')) throw Error('OpenSCAD sweep');
console.log('tangential', tangential.triangles, 'hub', tangential.derived.hubR.toFixed(1), 'tip', tipR.toFixed(1));

const joinedTangential = generate(manifold, { ...base, layout: 'tangential', sweep: 45, joined: true });
closed(joinedTangential.plate);
if (!(joinedTangential.volumes[0] > tangential.volumes[0] + 200)) throw Error('Joined tangential hub should include the plugs');
console.log('joined tangential', joinedTangential.triangles[0], joinedTangential.volumes[0].toFixed(0));

expectThrow({ ...base, layout: 'tangential', sweep: 70, count: 12 }, 'hit each other');

function maxRadius(mesh) {
  let radius = 0;
  for (let i = 0; i < mesh.vertices.length; i += mesh.stride) {
    radius = Math.max(radius, Math.hypot(mesh.vertices[i], mesh.vertices[i + 1]));
  }
  return radius;
}

const smoothPlug = generate(manifold, base);
const barbed = generate(manifold, { ...base, barbs: true, barbcount: 3, barbheight: 0.45, barbwidth: 1.2 });
closed(barbed.plate);
closed(barbed.plug);
if (barbed.overlap > 0.05) throw Error(`barbed overlap ${barbed.overlap}`);
if (!(barbed.volumes[1] > smoothPlug.volumes[1] + 5)) throw Error('Barbs should add plug volume');
if (!(maxRadius(barbed.plug) > barbed.derived.plugR + 0.3)) throw Error('Barbs should stand proud of the plug');
if (!barbed.scad.includes('barbs = true') || !barbed.scad.includes('rotate_extrude')) throw Error('OpenSCAD barbs');
if (!barbed.derived.barbNote.includes('3 ridges')) throw Error(barbed.derived.barbNote);
console.log('barbed plug', barbed.triangles[1], barbed.volumes[1].toFixed(1), 'r', maxRadius(barbed.plug).toFixed(2));

const barbedRadial = generate(manifold, { ...base, layout: 'radial', barbs: true, joined: true });
closed(barbedRadial.plate);
if (barbedRadial.overlap > 0.05) throw Error(`barbed radial overlap ${barbedRadial.overlap}`);
console.log('barbed radial joined', barbedRadial.triangles[0]);

const crowded = generate(manifold, { ...base, barbs: true, barbcount: 6, barbwidth: 2.5, plug: 8 });
closed(crowded.plug);
if (crowded.config.barbs && crowded.config.barbcount >= 6) throw Error('Too many ridges should be reduced or turned off');
const shy = generate(manifold, { ...base, barbs: true, barbheight: 0.2, clearance: 1 });
closed(shy.plug);
if (shy.config.barbs && !(shy.config.barbheight > 0.5)) throw Error('Short ridges should be raised so they reach the tube');
const tall = generate(manifold, { ...base, barbs: true, barbheight: 1, barbwidth: 1.6, clearance: 0 });
closed(tall.plug);
if (tall.config.barbs && !(tall.config.barbheight < 0.9)) throw Error('Ridges that are too tall should be shortened');
const ignored = generate(manifold, { ...base, barbs: false, barbheight: 5, barbcount: 9 });
if (Math.abs(ignored.volumes[1] - smoothPlug.volumes[1]) > 0.1) throw Error('Ridges should stay off when the option is off');
console.log('Input validation passed');

const solid = generate(manifold, { ...base, slots: 0, slotwidth: 2, flexlen: 20 });
closed(solid.plug);
if (solid.config.slots !== 0) throw Error('Zero flexures should stay solid');
if (!(solid.volumes[1] > smoothPlug.volumes[1] + 5)) throw Error('A solid plug should keep the material the slots would remove');
if (solid.scad.includes('slots = 0') === false) throw Error('OpenSCAD should record zero slots');

const two = generate(manifold, { ...base, slots: 2, flexlen: 6 });
closed(two.plug);
if (two.config.slots !== 2 || two.config.flexlen !== 6) throw Error(`Two flexures changed: ${two.config.slots} / ${two.config.flexlen}`);
if (!(two.volumes[1] > smoothPlug.volumes[1])) throw Error('Shorter flexures should leave more plug material');

const oneSlot = validate({ ...base, slots: 1 });
if (oneSlot.config.slots !== 2) throw Error('One slot should be pushed to 2');

const atTube = validate({ ...base, slotstart: 0, slotend: 10 });
if (Math.abs(atTube.config.slotstart - atTube.derived.tubeStop) > 0.05) {
  throw Error(`Slots should start at the tube end (${atTube.derived.tubeStop}), got ${atTube.config.slotstart}`);
}
if (!(atTube.config.slotend > atTube.config.slotstart + 1)) throw Error('Slot end should stay past the start');

const flanged = generate(manifold, { ...base, flange: true, flangethick: 1.6, flangedepth: 1.2, slots: 0 });
closed(flanged.plug);
if (flanged.overlap > 0.05) throw Error(`flange overlap ${flanged.overlap}`);
if (!(maxRadius(flanged.plug) > flanged.derived.plugR + 1)) throw Error('Flange should stand out past the plug');
let flangeMaxZ = -1;
let flangeMinZ = 99;
for (let i = 0; i < flanged.plug.vertices.length; i += flanged.plug.stride) {
  const radius = Math.hypot(flanged.plug.vertices[i], flanged.plug.vertices[i + 1]);
  if (radius > flanged.derived.plugR + 0.8) {
    flangeMaxZ = Math.max(flangeMaxZ, flanged.plug.vertices[i + 2]);
    flangeMinZ = Math.min(flangeMinZ, flanged.plug.vertices[i + 2]);
  }
}
if (Math.abs(flangeMaxZ - flanged.config.plug) > 0.15) {
  throw Error(`Flange should sit on the plug tip (${flanged.config.plug}), got ${flangeMaxZ.toFixed(2)}`);
}
if (flangeMinZ < flanged.config.plug - flanged.config.flangethick - 0.2) {
  throw Error(`Flange should stay on the tip, but it reaches back to ${flangeMinZ.toFixed(2)}`);
}
if (!flanged.scad.includes('flange = true')) throw Error('OpenSCAD flange');
if (!flanged.derived.flangeNote.includes('End flange')) throw Error(flanged.derived.flangeNote);

const flangedHub = generate(manifold, { ...base, layout: 'radial', flange: true, joined: true });
closed(flangedHub.plate);
if (flangedHub.overlap > 0.05) throw Error(`flanged hub overlap ${flangedHub.overlap}`);
const flangedSweep = generate(manifold, { ...base, layout: 'tangential', sweep: 45, flange: true });
closed(flangedSweep.plate);
closed(flangedSweep.plug);
if (flangedSweep.overlap > 0.05) throw Error(`flanged sweep overlap ${flangedSweep.overlap}`);

for (const recipe of RECIPES) {
  const result = generate(manifold, recipe.config);
  closed(result.plate);
  closed(result.plug);
  if (result.overlap > 0.05) throw Error(`${recipe.id} overlap ${result.overlap}`);
  console.log('recipe', recipe.id, result.derived.parts, 'flex', result.config.flexlen, 'slots', result.config.slots);
}

function axisSpan(mesh, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < mesh.vertices.length; i += mesh.stride) {
    const value = mesh.vertices[i + axis];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max, span: max - min };
}

const hubSpan = axisSpan(radialDefault.plate, 2);
const hubWide = axisSpan(radialDefault.plate, 0);
if (!(hubSpan.span + 0.2 < hubWide.span)) throw Error('Hub should be a flat disk with a vertical axle');
if (Math.abs(hubSpan.min) > 0.05) throw Error('Hub bed face should sit at z = 0');
if (Math.abs(hubSpan.span - radialDefault.config.plate) > 0.3) throw Error(`Hub height ${hubSpan.span} should match plate thickness`);

const printedPlug = forPrint(smoothPlug.plug, 'plug', smoothPlug.config.slots);
closed(printedPlug);
const plugLength = axisSpan(printedPlug, 0);
const plugHeight = axisSpan(printedPlug, 2);
if (!(plugLength.span > plugHeight.span + 1)) throw Error(`Plug screw hole should be horizontal (x ${plugLength.span.toFixed(2)} z ${plugHeight.span.toFixed(2)})`);
if (Math.abs(plugHeight.min) > 0.05) throw Error('Printed plug should sit on the bed');
console.log('print pose', 'hub z', hubSpan.span.toFixed(2), 'plug x', plugLength.span.toFixed(2), 'plug z', plugHeight.span.toFixed(2));
