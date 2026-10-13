import { init, generate, validate, stl } from './geometry.js';

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
expectThrow({ ...base, id: 4, od: 7 }, '5 mm');
expectThrow({ ...base, slotwidth: 2, slots: 8, id: 8, od: 12 }, 'slots');
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

expectThrow({ ...base, screw: 4, plate: 4 }, 'thickness');
expectThrow({ ...base, layout: 'radial', diameter: 40 }, 'diameter');
expectThrow({ ...base, shaft: 'spline' }, 'shaft');

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

expectThrow({ ...base, barbs: true, barbcount: 6, barbwidth: 2.5, plug: 8 }, 'ridges');
expectThrow({ ...base, barbs: true, barbheight: 0.2, clearance: 1 }, 'undersize');
expectThrow({ ...base, barbs: true, barbheight: 1, barbwidth: 1.6, clearance: 0 }, 'too tall');
const ignored = generate(manifold, { ...base, barbs: false, barbheight: 5, barbcount: 9 });
if (Math.abs(ignored.volumes[1] - smoothPlug.volumes[1]) > 0.1) throw Error('Ridges should stay off when the option is off');
console.log('Input validation passed');
