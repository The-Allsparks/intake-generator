import Module from 'manifold-3d';

// Printable intake roller. Units are millimeters.
// Axial: two end plates, tubes parallel to the shaft, one plug in each tube end.
// Radial: one hub, tubes sticking out like spokes, each plug pinned through the hub face.
// Shaft openings are the real profile plus SHAFT_FIT on each side. Downloads are blocked
// unless both solids are single closed meshes and the assembled parts do not occupy the same space.

export const SHAFT_FIT = 0.15;
const BOSS = 2;
const COLLAR_GAP = 0.25;
const SEAT = 0.05;

const SHAFTS = new Set(['rex', 'hex', 'round', 'd']);
const LAYOUTS = new Set(['axial', 'radial']);
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

export async function init(locateFile) {
  const m = await Module(locateFile ? { locateFile } : {});
  m.setup();
  return m;
}

export function validate(raw) {
  const c = normalize(raw);
  if (!(c.od > c.id && c.id > 0)) throw Error('Tube OD must be larger than tube ID.');
  if (c.id < 5) throw Error('This flexure plug needs a tube ID of at least 5 mm.');
  if (c.diameter < 30 || c.diameter > 220) throw Error('Roller diameter must stay between 30 and 220 mm.');
  if (c.width < 20 || c.width > 300) throw Error('Roller width must stay between 20 and 300 mm.');
  if (!Number.isInteger(c.count) || c.count < 3 || c.count > 16) throw Error('Use 3 to 16 tubing positions.');
  if (c.plate < 4 || c.plate > 20) throw Error('Plate thickness must stay between 4 and 20 mm.');
  if (c.plug < 5 || c.plug > 30) throw Error('Plug insertion must stay between 5 and 30 mm.');
  if (c.clearance < 0 || c.clearance > 1) throw Error('Plug undersize must stay between 0 and 1 mm.');
  if (!Number.isInteger(c.slots) || c.slots < 3 || c.slots > 8) throw Error('Use 3 to 8 flexure slots.');
  if (c.slotwidth < 0.4 || c.slotwidth > 2) throw Error('Slot width must stay between 0.4 and 2 mm.');
  const d = derive(c);
  if (d.plugR - d.boreStart < 0.7) throw Error('Tube ID is too small for this screw and the plug wall. Use larger tubing or a smaller screw.');
  const finger = (2 * Math.PI * d.plugR) / c.slots;
  if (c.slotwidth > finger * 0.45) throw Error('Those slots would cut the fingers off the plug. Narrow the slots or use fewer of them.');
  if (c.plug - d.root < 2.5) throw Error('Increase plug insertion so the slotted fingers extend past the solid root.');
  if (d.tubeOrbit < 10) throw Error('Increase the roller diameter or use smaller tubing.');
  if (c.plate < d.nutDepth + 2) throw Error('Increase plate thickness so the captured nut and its lip fit.');
  if (d.coneR < d.screwHoleR + 0.25) throw Error('Tube ID is too small for this screw head to spread the fingers.');
  if (c.layout === 'axial') {
    if (d.tubeLength < 8) throw Error('Increase width, or reduce plate thickness, so a tube fits between the end plates.');
    if (d.tipGap < 2) throw Error('Increase width or shorten the plugs so the two plugs do not meet inside the tube.');
    if (d.tubeOrbit - d.padR < d.shaft.outerR + 1.5) throw Error('Increase the roller diameter or use smaller tubing so the shaft opening fits inside the plate.');
  } else {
    const nutInner = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth;
    if (!(d.hubR > d.shaft.outerR + d.socketDepth + d.nutDepth + 3)) throw Error('Increase the roller diameter or shorten the plugs so the hub clears the shaft.');
    if (nutInner < d.shaft.outerR + 1.5) throw Error('The captured nut would break into the shaft opening. Increase the diameter or use a smaller screw.');
    if (d.nutR * 2 > c.plate - 0.8) throw Error('Increase plate thickness so the nut drops in through the hub face.');
  }
  return { config: c, derived: d };
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Settings are missing.');
  const layout = String(raw.layout || '');
  const shaft = String(raw.shaft || '');
  if (!LAYOUTS.has(layout)) throw Error('Choose an axial or radial layout.');
  if (!SHAFTS.has(shaft)) throw Error('Choose a shaft interface.');
  const screw = Number(raw.screw);
  if (!(screw === 2 || screw === 3 || screw === 4)) throw Error('Choose an M2, M3, or M4 fastener.');
  const flag = (key) => raw[key] === true || raw[key] === 'true' || raw[key] === 'on' || raw[key] === 1 || raw[key] === '1';
  const joined = flag('joined');
  const barbs = flag('barbs');
  const material = String(raw.material || 'Silicone').replace(/[^\w .+-]/g, '').slice(0, 40);
  const num = (key) => {
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) throw Error('Enter a number for every dimension.');
    return value;
  };
  const optional = (key, fallback) => {
    if (raw[key] == null || raw[key] === '') return fallback;
    return num(key);
  };
  return {
    layout, shaft, screw, material, joined, barbs,
    diameter: num('diameter'), width: num('width'), count: num('count'), plate: num('plate'),
    id: num('id'), od: num('od'), plug: num('plug'), clearance: num('clearance'),
    slots: num('slots'), slotwidth: num('slotwidth'),
    barbcount: optional('barbcount', 3),
    barbheight: optional('barbheight', 0.45),
    barbwidth: optional('barbwidth', 1.2)
  };
}

function shaftSpec(kind) {
  if (kind === 'round') return { kind, outerR: 4 + SHAFT_FIT, label: '8 mm round' };
  if (kind === 'hex') return { kind, outerR: (8 + 2 * SHAFT_FIT) / Math.sqrt(3), label: '8 mm hex across flats' };
  if (kind === 'rex') return { kind, outerR: 4.05 + SHAFT_FIT, label: '8 mm REX rounded hex' };
  return { kind, outerR: 3 + SHAFT_FIT, label: '6 mm D-shaft' };
}

function derive(c) {
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
    const seated = c.joined ? 1.2 + BOSS : BOSS - SEAT;
    return withBarbs(c, {
      layout: 'axial', tubeOrbit, plugR, bossR, boss: BOSS, collarGap: COLLAR_GAP, shaft, screwHoleR, headR,
      boreStart: screwHoleR, coneR, coneLen: Math.min(coneLen, c.plug - root - 0.6), nutAf, nutDepth, nutR, padR, root, tubeLength, tipGap, screwNote, seated
    });
  }
  const socketDepth = Math.min(4.5, Math.max(3, c.plug * 0.22));
  const hubR = tubeOrbit - 2 * c.plug;
  const root = Math.max(2, c.screw * 0.65);
  const seated = c.joined ? socketDepth + 0.8 : socketDepth;
  return withBarbs(c, {
    layout: 'radial', tubeOrbit, plugR, bossR, boss: 0, collarGap: 0.3, shaft, screwHoleR, headR,
    boreStart: screwHoleR, coneR, coneLen: Math.min(coneLen, c.plug - root - 0.6), nutAf, nutDepth, nutR, padR, root,
    socketDepth, hubR, pinRadius: hubR - socketDepth - NUT_LIP - nutDepth / 2,
    tubeLength: 2 * c.plug, screwNote, seated
  });
}

// Ridges sit on the plug outside, past the collar or socket, and stop before the tip cone.
function withBarbs(c, d) {
  d.barbs = null;
  if (!c.barbs) return d;
  const count = c.barbcount;
  const height = c.barbheight;
  const width = c.barbwidth;
  if (!Number.isInteger(count) || count < 1 || count > 6) throw Error('Use 1 to 6 ridges on the plug.');
  if (height < 0.2 || height > 1) throw Error('Ridge height must stay between 0.2 and 1 mm.');
  if (width < 0.6 || width > 2.5) throw Error('Ridge length must stay between 0.6 and 2.5 mm.');
  if (width < height + 0.3) throw Error('Lengthen the ridges so the ramp can be printed from the plug base.');
  if (height <= c.clearance / 2 + 0.05) throw Error('Increase ridge height or reduce plug undersize so the ridges reach the tube.');
  if (d.plugR + height > c.id / 2 + 0.65) throw Error('Those ridges are too tall for the tube ID. Lower the ridge height.');
  const start = Math.max(d.root, d.seated) + 0.4;
  const end = c.plug - d.coneLen - 0.5;
  const gap = (end - start - count * width) / (count + 1);
  if (!(gap >= 0.3)) throw Error('Use fewer or shorter ridges, or a longer plug, so they fit on the fingers.');
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
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    const rad = (deg * Math.PI) / 180;
    if (!c.joined) plugs.push({
      end: 'spoke', deg, radius: d.hubR - d.socketDepth, z: c.plate / 2
    });
    const mid = d.hubR + d.tubeLength / 2;
    tubes.push({
      x: mid * Math.cos(rad), y: mid * Math.sin(rad), z: c.plate / 2,
      length: d.tubeLength, radius: c.od / 2, axis: 'radial', deg
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
  return `// Allsparks Intake Lab — companion to the validated STL.
// ${d.shaft.label}. Fastener: ${d.screwNote}. Joined plugs: ${c.joined ? 'yes' : 'no'}.
// ${d.barbNote || 'Plug outside is smooth.'}
// Shaft holes include ${SHAFT_FIT} mm clearance per side. Print the STL if you want the checked mesh.
$fn = 128;
layout = "${c.layout}";
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
${barbLines}
    }
    translate([0, 0, -0.2]) cylinder(h = insertion + 0.4, r1 = screw / 2 + 0.35, r2 = max(0.45, screw / 2 - 0.08));
    for (i = [0 : slots - 1]) rotate([0, 0, i * 360 / slots])
      translate([0, -slot_width / 2, root]) cube([plug_r + 2, slot_width, insertion - root + 0.5]);
    if (layout == "radial") translate([0, 0, ${n(socketDepth)} / 2]) rotate([0, 90, 0])
      cylinder(h = plug_r * 2 + 4, r = screw / 2 + 0.2, center = true);
  }
}

module roller_plate() {
  difference() {
    union() {
      cylinder(h = plate, r = ${c.layout === 'axial' ? n(d.tubeOrbit) : n(hubR)});
      if (layout == "axial") for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count])
        translate([${n(d.tubeOrbit)}, 0, plate]) difference() {
          cylinder(h = ${n(BOSS)}, r = ${n(d.bossR)});
          translate([0, 0, -0.1]) cylinder(h = ${n(BOSS + 0.2)}, r = ${n(d.plugR + COLLAR_GAP)});
        }
    }
    translate([0, 0, -1]) linear_extrude(plate + 4) shaft_profile();
    if (layout == "radial") for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count])
      translate([${n(hubR - socketDepth)}, 0, plate / 2]) rotate([0, 90, 0])
        cylinder(h = ${n(socketDepth + 0.3)}, r = ${n(d.plugR + (d.collarGap || 0.3))});
    for (i = [0 : count - 1]) rotate([0, 0, i * 360 / count]) {
      if (layout == "axial") {
        translate([${n(d.tubeOrbit)}, 0, 0]) cylinder(h = nut_depth, r = nut_af / sqrt(3), $fn = 6);
        translate([${n(d.tubeOrbit)}, 0, nut_depth]) cylinder(h = plate, r = screw / 2 + 0.2);
      } else {
        translate([${n((d.hubR || 0) - (d.socketDepth || 0) - 1 - d.nutDepth)}, 0, plate / 2])
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
  const { config: c, derived: d } = validate(raw);
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
      volumes: [parts[0].volume(), parts[1].volume()]
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
    plugR: d.plugR,
    shaft: d.shaft.label,
    screwNote: d.screwNote,
    barbNote: d.barbNote || '',
    joined: c.joined,
    parts: c.joined
      ? (c.layout === 'axial' ? '2 plates with plugs' : '1 hub with plugs')
      : (c.layout === 'axial' ? `2 plates + ${c.count * 2} plugs` : `1 hub + ${c.count} plugs`)
  };
}

function makePlug(M, C, keep, cyl, uni, c, d) {
  const parts = [cyl(c.plug, d.plugR, d.plugR, SEG_BODY)];
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
  const slotH = c.plug - d.root + 0.45;
  const reach = d.plugR + (d.barbs ? d.barbs.height + 0.9 : 1.6);
  for (let s = 0; s < c.slots; s++) {
    let box = keep(M.cube([reach, c.slotwidth, slotH], false));
    box = keep(box.translate([0, -c.slotwidth / 2, d.root - 0.05]));
    box = keep(box.rotate([0, 0, (360 * s) / c.slots]));
    tools.push(box);
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

function makeHub(M, C, keep, cyl, uni, c, d) {
  const bodies = [cyl(c.plate, d.hubR, d.hubR, SEG_RIM)];
  const holes = [];
  let shaft = keep(shaftProfile(C, keep, c.shaft).extrude(c.plate + 2));
  holes.push(keep(shaft.translate([0, 0, -1])));
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    const nutX = d.hubR - d.socketDepth - NUT_LIP - d.nutDepth;
    if (!c.joined) {
      let socket = cyl(d.socketDepth + 0.3, d.plugR + d.collarGap, d.plugR + d.collarGap, SEG_FEATURE);
      socket = keep(socket.rotate([0, 90, 0]));
      socket = keep(socket.translate([d.hubR - d.socketDepth, 0, c.plate / 2]));
      holes.push(keep(socket.rotate([0, 0, deg])));
    }
    let pocket = keep(hexPrism(C, keep, d.nutAf, d.nutDepth).rotate([0, 90, 0]));
    pocket = keep(pocket.translate([nutX, 0, c.plate / 2]));
    holes.push(keep(pocket.rotate([0, 0, deg])));
    let chute = keep(M.cube([d.nutDepth, d.nutAf, c.plate / 2 + d.nutR + 0.8], false));
    chute = keep(chute.translate([nutX, -d.nutAf / 2, c.plate / 2 - 0.2]));
    holes.push(keep(chute.rotate([0, 0, deg])));
    let screw = cyl(d.nutDepth + NUT_LIP + d.socketDepth + 3, d.screwHoleR, d.screwHoleR, SEG_BORE);
    screw = keep(screw.rotate([0, 90, 0]));
    screw = keep(screw.translate([nutX - 0.4, 0, c.plate / 2]));
    holes.push(keep(screw.rotate([0, 0, deg])));
  }
  return keep(uni(bodies).subtract(uni(holes)));
}

function fusePlugs(M, keep, uni, c, d, plate, plug) {
  const parts = [plate];
  if (c.layout === 'axial') {
    for (let i = 0; i < c.count; i++) {
      const a = (2 * Math.PI * i) / c.count;
      parts.push(keep(plug.translate([d.tubeOrbit * Math.cos(a), d.tubeOrbit * Math.sin(a), c.plate - 1.2])));
    }
    return uni(parts);
  }
  for (let i = 0; i < c.count; i++) {
    const deg = (360 * i) / c.count;
    let spoke = keep(plug.rotate([0, 90, 0]));
    spoke = keep(spoke.translate([d.hubR - d.socketDepth - 0.8, 0, c.plate / 2]));
    parts.push(keep(spoke.rotate([0, 0, deg])));
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
    spoke = keep(spoke.rotate([0, 0, deg]));
    plugs.push(spoke);
    overlap += keep(plate.intersect(spoke)).volume();
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
      return keep(tool.rotate([0, 0, deg]));
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
