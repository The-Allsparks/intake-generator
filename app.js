import { forPrint, RECIPES, stl, validate } from './geometry.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
const worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });
const flags = new Set(['joined', 'barbs', 'flange']);
const keys = ['layout', 'sweep', 'diameter', 'width', 'count', 'plate', 'id', 'od', 'material', 'plug', 'clearance', 'slots', 'slotwidth', 'slotstart', 'slotend', 'shaft', 'screw', 'joined', 'barbs', 'barbcount', 'barbheight', 'barbwidth', 'flange', 'flangethick', 'flangedepth'];
const openEnds = new Set(['slotstart', 'slotend']);
let applying = false;
let focused = '';

let requestId = 0;
let current = null;
let framed = '';
let renderer;
let scene;
let camera;
let orbit;
let plateMat;
let plugMat;
let tubeMat;
let plateGroup;
let plugGroup;
let tubeGroup;
const pose = { plates: [], plugs: [], tubes: [] };

function read() {
  const config = {};
  for (const key of keys) {
    if (flags.has(key)) config[key] = $(key).checked;
    else if (openEnds.has(key)) config[key] = $(key).value === '' ? null : Number($(key).value);
    else if (['layout', 'material', 'shaft'].includes(key)) config[key] = $(key).value;
    else config[key] = Number($(key).value);
  }
  const recipe = RECIPES.find((item) => item.id === $('recipe').value);
  if (config.slotstart == null && config.slotend == null && recipe) config.flexlen = recipe.config.flexlen;
  return config;
}

function formatValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

function writeForm(config, skip = '') {
  applying = true;
  for (const key of keys) {
    if (key === skip) continue;
    const field = $(key);
    if (openEnds.has(key) && config[key] == null) {
      if (field.value !== '') field.value = '';
      continue;
    }
    if (config[key] == null) continue;
    if (flags.has(key)) {
      const next = config[key] === true;
      if (field.checked !== next) field.checked = next;
    } else if (['layout', 'material', 'shaft'].includes(key)) {
      if (field.value !== String(config[key])) field.value = config[key];
    } else {
      const next = formatValue(config[key]);
      if (field.value !== next) field.value = next;
    }
  }
  applying = false;
  layoutNotes();
  matchPreset();
}

function applyPreset() {
  const custom = $('preset').value === 'custom';
  $('id').disabled = !custom;
  $('od').disabled = !custom;
  if (!custom) {
    const [id, od] = $('preset').value.split(',');
    $('id').value = id;
    $('od').value = od;
  }
}

function matchPreset() {
  const pair = `${$('id').value},${$('od').value}`;
  const known = [...$('preset').options].some((option) => option.value === pair);
  $('preset').value = known ? pair : 'custom';
  $('id').disabled = known;
  $('od').disabled = known;
}

function layoutNotes() {
  const hub = $('layout').value !== 'axial';
  const tangential = $('layout').value === 'tangential';
  const joined = $('joined').checked;
  $('width').disabled = hub;
  $('sweep-label').hidden = !tangential;
  $('sweep-note').hidden = !tangential;
  $('joined-label').textContent = hub
    ? 'Print the plugs as one piece with the hub'
    : 'Print the plugs as one piece with each end plate';
  $('width-note').textContent = tangential
    ? 'Diameter is the outside of the tube tips. Width is unused.'
    : (hub
      ? 'Width is unused for radial spokes. Diameter is the outside of the tubes.'
      : 'Width is the full roller, from outer face to outer face.');
  $('plate-name').textContent = joined ? (hub ? 'Hub with plugs' : 'Plate with plugs') : (hub ? 'Hub' : 'End plate');
  const barbed = $('barbs').checked;
  for (const id of ['barbcount', 'barbheight', 'barbwidth']) $(id).disabled = !barbed;
  $('barb-fields').classList.toggle('is-off', !barbed);
  const flanged = $('flange').checked;
  for (const id of ['flangethick', 'flangedepth']) $(id).disabled = !flanged;
  $('flange-fields').classList.toggle('is-off', !flanged);
  const flex = Number($('slots').value) > 0;
  for (const id of ['slotwidth', 'slotstart', 'slotend']) $(id).disabled = !flex;
  $('flex-fields').classList.toggle('is-off', !flex);
  $('flex-note').textContent = flex
    ? 'Start and end are measured from the plug base. The slots begin where the tube ends and stop before the tip flange.'
    : 'Slot position sits out while the plug is solid.';
  $('plug-title').textContent = flex ? 'Flexure plug' : 'Plug';
  $('plate-note').textContent = hub
    ? 'Print one. Axle vertical, nut pockets open upward'
    : 'Print two. Axle vertical, outer face on the bed';
  $('plug-note').textContent = joined ? 'Included in the plate STL' : 'Screw hole is horizontal. Lay it on its side';
  $('download-plug').hidden = joined;
  $('show-plugs').disabled = joined;
  $('show-plugs').parentElement.style.opacity = joined ? '0.45' : '1';
  $('download-copy').textContent = joined
    ? 'The plate STL includes the plugs. Downloads stay off until the solid checks pass.'
    : (hub
      ? 'Print the hub once and one plug per spoke. Downloads stay off until the solid checks pass.'
      : 'Print the plate twice. Print one plug for every tube end. Downloads stay off until the solid checks pass.');
}

function setStatus(text, ready) {
  $('status').textContent = text;
  $('status-pill').textContent = ready ? 'Ready' : 'Check';
}

function setDownloads(on) {
  for (const id of ['download-plate', 'download-plug', 'download-scad', 'download-json']) $(id).disabled = !on;
}

function schedule() {
  layoutNotes();
  setDownloads(false);
  const id = ++requestId;
  window.clearTimeout(schedule.timer);
  schedule.timer = window.setTimeout(() => {
    setStatus('Building and checking the solids…', false);
    worker.postMessage({ id, config: read() });
  }, 180);
}

worker.onmessage = (event) => {
  if (event.data.id !== requestId) return;
  if (event.data.error) {
    current = null;
    if (plateGroup) {
      clearGroup(plateGroup);
      clearGroup(plugGroup);
      clearGroup(tubeGroup);
      pose.plates = [];
      pose.plugs = [];
      pose.tubes = [];
    }
    $('error').textContent = event.data.error;
    setStatus(event.data.error, false);
    for (const id of ['wall', 'cut', 'parts', 'fastener']) $(id).textContent = '—';
    $('shaft-line').textContent = '';
    $('adjust').textContent = '';
    $('bite-note').textContent = 'Plug length is the whole printed plug. Part of the base stays in the collar or hub socket. The rest slides into the tube.';
    return;
  }
  current = event.data.result;
  $('error').textContent = '';
  writeForm(current.config, focused);
  const info = current.derived;
  $('wall').textContent = `${info.wall.toFixed(2)} mm`;
  $('cut').textContent = `${info.tubeLength.toFixed(1)} mm`;
  $('parts').textContent = info.parts;
  $('fastener').textContent = `M${current.config.screw} nut`;
  $('bite-note').textContent = `${info.tubeBite.toFixed(1)} mm of the plug slides into the tube. ${info.seatBite.toFixed(1)} mm of the base stays in the ${info.seatName}. Plug length is the whole printed part.`;
  if (current.config.slots > 0) {
    $('flex-note').textContent = `The tube ends at ${info.tubeStop.toFixed(1)} mm from the plug base. Slots run from ${info.slotStart.toFixed(1)} to ${info.slotEnd.toFixed(1)} mm. The flange, when it is on, is the disk on the plug tip.`;
  }
  $('adjust').textContent = (current.adjustments || []).join(' ');
  const sweepLine = current.config.layout === 'tangential' ? ` Tubes trail ${Number(info.sweep).toFixed(0)}° off a straight spoke.` : '';
  const extra = [info.flangeNote, info.barbNote].filter(Boolean).join('. ');
  $('shaft-line').textContent = extra
    ? `${info.shaft}. ${info.screwNote}. ${extra}.${sweepLine}`
    : `${info.shaft}. ${info.screwNote}.${sweepLine}`;
  setStatus('Ready. Plate and plug are each one solid, and they do not overlap.', true);
  setDownloads(true);
  showAssembly(current);
};

worker.onerror = () => {
  setDownloads(false);
  setStatus('Model engine could not load. Reload the page in a browser with WebAssembly.', false);
  $('error').textContent = 'Model engine could not load.';
};

function download(filename, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function pushBack() {
  try {
    const prepared = validate(read());
    writeForm(prepared.config);
    $('adjust').textContent = prepared.adjustments.join(' ');
  } catch {
    // The model still cannot build. Ranged fields are corrected when the solid succeeds.
  }
}

function onEdit() {
  if (applying) return;
  $('recipe').value = 'custom';
  schedule();
}

$('form').onsubmit = (event) => event.preventDefault();
$('preset').onchange = () => { if (!applying) { applyPreset(); $('recipe').value = 'custom'; schedule(); } };
$('recipe').onchange = () => {
  const recipe = RECIPES.find((item) => item.id === $('recipe').value);
  if (!recipe) return;
  writeForm(recipe.config);
  schedule();
};
for (const key of keys) {
  $(key).addEventListener('focus', () => { focused = key; });
  $(key).addEventListener('input', onEdit);
  $(key).addEventListener('change', () => {
    if (applying) return;
    focused = '';
    $('recipe').value = 'custom';
    pushBack();
    schedule();
  });
}
$('reset').onclick = () => {
  $('recipe').value = 'axial';
  writeForm(RECIPES[0].config);
  applyPreset();
  schedule();
};
$('share').onclick = async () => {
  const url = new URL(location.href);
  for (const key of keys) {
    url.searchParams.set(key, flags.has(key) ? ($(key).checked ? '1' : '0') : $(key).value);
  }
  try {
    await navigator.clipboard.writeText(url.href);
    $('share').textContent = 'Link copied';
  } catch {
    $('error').textContent = url.href;
  }
  setTimeout(() => { $('share').textContent = 'Copy configuration link'; }, 2000);
};
$('load').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    for (const key of keys) {
      if (data[key] == null) continue;
      if (flags.has(key)) $(key).checked = data[key] === true || data[key] === '1' || data[key] === 'true' || data[key] === 1;
      else $(key).value = data[key];
    }
    matchPreset();
    $('recipe').value = 'custom';
    pushBack();
    schedule();
  } catch {
    $('error').textContent = 'That file is not settings JSON from this page.';
  }
};
$('download-plate').onclick = () => {
  if (!current) return;
  const joined = current.config.joined ? '-with-plugs' : '';
  const name = current.config.layout === 'axial' ? 'end-plate' : 'hub';
  const mesh = forPrint(current.plate, 'plate');
  download(`allsparks-intake-${name}${joined}.stl`, stl(mesh, 'Allsparks intake plate'), 'model/stl');
};
$('download-plug').onclick = () => {
  if (!current) return;
  const mesh = forPrint(current.plug, 'plug', current.config.slots);
  download('allsparks-intake-plug.stl', stl(mesh, 'Allsparks intake plug'), 'model/stl');
};
$('download-scad').onclick = () => current && download('allsparks-intake.scad', current.scad, 'text/plain');
$('download-json').onclick = () => current && download('allsparks-intake-settings.json', JSON.stringify(current.config, null, 2), 'application/json');

function meshFrom(data, material) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(data.vertices.length / data.stride * 3);
  for (let i = 0; i < pos.length / 3; i++) pos.set(data.vertices.subarray(i * data.stride, i * data.stride + 3), i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  // Smooth the rims, keep the nut pockets and plate edges crisp.
  const smooth = toCreasedNormals(geo, Math.PI / 9);
  geo.dispose();
  return new THREE.Mesh(smooth, material);
}

function axialMatrix(part, explode) {
  const shift = part.end === 'far' ? explode : -explode;
  const z = part.z + (part.end === 'hub' ? 0 : shift);
  if (!part.mirror) return new THREE.Matrix4().makeTranslation(part.x, part.y, part.end === 'hub' ? part.z : z);
  const matrix = new THREE.Matrix4().makeScale(1, 1, -1);
  matrix.premultiply(new THREE.Matrix4().makeTranslation(part.x, part.y, z));
  return matrix;
}

function hubPlugMatrix(part, explode) {
  const sweep = (part.sweep || 0) * Math.PI / 180;
  const matrix = new THREE.Matrix4();
  matrix.multiply(new THREE.Matrix4().makeRotationZ(part.deg * Math.PI / 180));
  matrix.multiply(new THREE.Matrix4().makeTranslation(part.hubR, 0, 0));
  matrix.multiply(new THREE.Matrix4().makeRotationZ(sweep));
  matrix.multiply(new THREE.Matrix4().makeTranslation(explode, 0, 0));
  matrix.multiply(new THREE.Matrix4().makeTranslation(part.radius - part.hubR, 0, part.z));
  matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  return matrix;
}

function applyPoses() {
  if (!current) return;
  const explode = Number($('explode').value);
  const hub = current.config.layout !== 'axial';
  pose.plates.forEach((item, index) => {
    item.matrixAutoUpdate = false;
    item.matrix.copy(axialMatrix(current.placements.plates[index], explode));
  });
  pose.plugs.forEach((item, index) => {
    const part = current.placements.plugs[index];
    item.matrixAutoUpdate = false;
    item.matrix.copy(hub ? hubPlugMatrix(part, explode) : axialMatrix(part, explode));
  });
  pose.tubes.forEach((item, index) => {
    const tube = current.placements.tubes[index];
    if (tube.axis === 'z') {
      item.position.set(tube.x, tube.y, tube.z);
      item.rotation.set(Math.PI / 2, 0, 0);
    } else {
      const dir = tube.dir;
      item.position.set(tube.x + Math.cos(dir) * explode, tube.y + Math.sin(dir) * explode, tube.z);
      item.rotation.set(0, 0, dir - Math.PI / 2);
    }
  });
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry.dispose();
  }
  return group;
}

function showAssembly(result) {
  try {
    drawAssembly(result);
  } catch {
    $('error').textContent = '3D preview is unavailable on this device. STL downloads still work.';
  }
}

function drawAssembly(result) {
  if (!renderer) init3D();
  clearGroup(plateGroup);
  clearGroup(plugGroup);
  clearGroup(tubeGroup);
  pose.plates = result.placements.plates.map(() => plateGroup.add(meshFrom(result.plate, plateMat)));
  pose.plugs = result.placements.plugs.map(() => plugGroup.add(meshFrom(result.plug, plugMat)));
  pose.tubes = result.placements.tubes.map((tube) => {
    const geo = new THREE.CylinderGeometry(tube.radius, tube.radius, Math.max(tube.length, 0.2), 80, 1, true);
    return tubeGroup.add(new THREE.Mesh(geo, tubeMat));
  });
  applyVisibility();
  applyPoses();
  if (framed !== result.config.layout) {
    framed = result.config.layout;
    setView('iso-fr');
  }
}

function markView(name) {
  for (const button of $('views').querySelectorAll('button')) {
    button.classList.toggle('is-on', button.dataset.view === name);
  }
}

function setView(name) {
  if (!camera || !orbit || !current) return;
  const targetZ = current.config.layout === 'axial' ? current.config.width / 2 : current.config.plate / 2;
  const span = Math.max(
    current.config.diameter,
    current.config.layout === 'axial' ? current.config.width : current.config.diameter
  );
  const dist = span * 1.55;
  const corner = dist * 0.72;
  const lift = dist * 0.62;
  const poses = {
    front: [0, -dist, targetZ],
    back: [0, dist, targetZ],
    left: [-dist, 0, targetZ],
    right: [dist, 0, targetZ],
    top: [0, -span * 0.04, targetZ + dist],
    bottom: [0, span * 0.04, targetZ - dist],
    'iso-fr': [corner, -corner, targetZ + lift],
    'iso-fl': [-corner, -corner, targetZ + lift],
    'iso-br': [corner, corner, targetZ + lift],
    'iso-bl': [-corner, corner, targetZ + lift]
  };
  const pose = poses[name];
  if (!pose) return;
  orbit.target.set(0, 0, targetZ);
  camera.up.set(0, 0, 1);
  camera.position.set(pose[0], pose[1], pose[2]);
  const damping = orbit.enableDamping;
  orbit.enableDamping = false;
  orbit.update();
  orbit.enableDamping = damping;
  markView(name);
}

function applyVisibility() {
  if (!plateGroup) return;
  plateGroup.visible = $('show-plates').checked;
  plugGroup.visible = $('show-plugs').checked;
  tubeGroup.visible = $('show-tubes').checked;
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc5d0dc);
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  $('canvas').append(renderer.domElement);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.addEventListener('start', () => markView(''));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d0d0, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 2.6);
  light.position.set(80, -120, 160);
  scene.add(light);
  plateMat = new THREE.MeshStandardMaterial({ color: 0x2f6fbe, roughness: 0.5, metalness: 0.04, side: THREE.DoubleSide });
  plugMat = new THREE.MeshStandardMaterial({ color: 0xe39b12, roughness: 0.46, metalness: 0.02, side: THREE.DoubleSide });
  tubeMat = new THREE.MeshStandardMaterial({ color: 0x1f8a70, transparent: true, opacity: 0.55, roughness: 0.35, depthWrite: false, side: THREE.DoubleSide });
  plateGroup = new THREE.Group();
  plugGroup = new THREE.Group();
  tubeGroup = new THREE.Group();
  scene.add(plateGroup, plugGroup, tubeGroup);
  const resize = () => {
    const width = $('canvas').clientWidth;
    const height = $('canvas').clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe($('canvas'));
  resize();
  renderer.setAnimationLoop(() => {
    orbit.update();
    renderer.render(scene, camera);
  });
}

$('explode').oninput = applyPoses;
for (const id of ['show-plates', 'show-plugs', 'show-tubes']) $(id).onchange = applyVisibility;
$('views').onclick = (event) => {
  const button = event.target.closest('button');
  if (button) setView(button.dataset.view);
};

const incoming = new URL(location.href).searchParams;
if ([...incoming.keys()].some((key) => keys.includes(key))) {
  for (const key of keys) {
    if (!incoming.has(key)) continue;
    if (flags.has(key)) $(key).checked = incoming.get(key) === '1' || incoming.get(key) === 'true';
    else $(key).value = incoming.get(key);
  }
  matchPreset();
  $('recipe').value = 'custom';
}
layoutNotes();
schedule();
