import { stl } from './geometry.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
const worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });
const keys = ['layout', 'diameter', 'width', 'count', 'plate', 'id', 'od', 'material', 'plug', 'clearance', 'slots', 'slotwidth', 'shaft', 'screw', 'joined', 'barbs', 'barbcount', 'barbheight', 'barbwidth'];
const defaults = Object.fromEntries(keys.map((key) => [key, $(key).value]));
defaults.preset = $('preset').value;

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
    if (key === 'joined') config.joined = $('joined').checked;
    else if (key === 'barbs') config.barbs = $('barbs').checked;
    else if (['layout', 'material', 'shaft'].includes(key)) config[key] = $(key).value;
    else config[key] = Number($(key).value);
  }
  return config;
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
  const radial = $('layout').value === 'radial';
  const joined = $('joined').checked;
  $('width').disabled = radial;
  $('joined-label').textContent = radial
    ? 'Print the plugs as one piece with the hub'
    : 'Print the plugs as one piece with each end plate';
  $('width-note').textContent = radial
    ? 'Width is unused for radial spokes. Diameter is the outside of the tubes.'
    : 'Width is the full roller, from outer face to outer face.';
  $('plate-name').textContent = joined ? (radial ? 'Hub with plugs' : 'Plate with plugs') : (radial ? 'Hub' : 'End plate');
  $('plate-note').textContent = joined
    ? (radial ? 'Print one. Nut pockets open on the top face' : 'Print two. Nut pockets open on the outer face')
    : (radial ? 'Print one. Nut pockets open on the top face' : 'Print two, outer face on the bed');
  $('plug-note').textContent = joined ? 'Included in the plate STL' : (radial ? 'Print one per spoke, base on the bed' : 'Print one per tube end, base on the bed');
  const barbed = $('barbs').checked;
  for (const id of ['barbcount', 'barbheight', 'barbwidth']) $(id).disabled = !barbed;
  $('barb-fields').classList.toggle('is-off', !barbed);
  $('download-plug').hidden = joined;
  $('show-plugs').disabled = joined;
  $('show-plugs').parentElement.style.opacity = joined ? '0.45' : '1';
  $('download-copy').textContent = joined
    ? 'The plate STL includes the plugs. Downloads stay off until the solid checks pass.'
    : (radial
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
    return;
  }
  current = event.data.result;
  $('error').textContent = '';
  const info = current.derived;
  $('wall').textContent = `${info.wall.toFixed(2)} mm`;
  $('cut').textContent = `${info.tubeLength.toFixed(1)} mm`;
  $('parts').textContent = info.parts;
  $('fastener').textContent = `M${current.config.screw} nut`;
  $('shaft-line').textContent = info.barbNote
    ? `${info.shaft}. ${info.screwNote}. ${info.barbNote}.`
    : `${info.shaft}. ${info.screwNote}.`;
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

$('form').onsubmit = (event) => event.preventDefault();
$('preset').onchange = () => { applyPreset(); schedule(); };
$('layout').onchange = schedule;
$('joined').onchange = schedule;
$('barbs').onchange = schedule;
for (const key of keys) {
  if (key !== 'layout' && key !== 'joined') $(key).addEventListener('input', schedule);
}
$('reset').onclick = () => {
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'joined' || key === 'barbs') $(key).checked = false;
    else $(key).value = value;
  }
  applyPreset();
  schedule();
};
$('share').onclick = async () => {
  const url = new URL(location.href);
  for (const key of keys) {
    const flag = key === 'joined' || key === 'barbs';
    url.searchParams.set(key, flag ? ($(key).checked ? '1' : '0') : $(key).value);
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
      if (key === 'joined' || key === 'barbs') $(key).checked = data[key] === true || data[key] === '1' || data[key] === 'true';
      else $(key).value = data[key];
    }
    matchPreset();
    schedule();
  } catch {
    $('error').textContent = 'That file is not settings JSON from this page.';
  }
};
$('download-plate').onclick = () => {
  if (!current) return;
  const joined = current.config.joined ? '-with-plugs' : '';
  const name = current.config.layout === 'axial' ? 'end-plate' : 'hub';
  download(`allsparks-intake-${name}${joined}.stl`, stl(current.plate, 'Allsparks intake plate'), 'model/stl');
};
$('download-plug').onclick = () => current && download('allsparks-intake-plug.stl', stl(current.plug, 'Allsparks intake plug'), 'model/stl');
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

function radialPlugMatrix(part, explode) {
  const matrix = new THREE.Matrix4();
  matrix.multiply(new THREE.Matrix4().makeRotationZ(part.deg * Math.PI / 180));
  matrix.multiply(new THREE.Matrix4().makeTranslation(part.radius + explode, 0, part.z));
  matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  return matrix;
}

function applyPoses() {
  if (!current) return;
  const explode = Number($('explode').value);
  const radial = current.config.layout === 'radial';
  pose.plates.forEach((item, index) => {
    item.matrixAutoUpdate = false;
    item.matrix.copy(axialMatrix(current.placements.plates[index], explode));
  });
  pose.plugs.forEach((item, index) => {
    const part = current.placements.plugs[index];
    item.matrixAutoUpdate = false;
    item.matrix.copy(radial ? radialPlugMatrix(part, explode) : axialMatrix(part, explode));
  });
  pose.tubes.forEach((item, index) => {
    const tube = current.placements.tubes[index];
    item.position.set(tube.x, tube.y, tube.z);
    if (tube.axis === 'z') {
      item.rotation.set(Math.PI / 2, 0, 0);
    } else {
      const extra = explode;
      const rad = tube.deg * Math.PI / 180;
      const mid = Math.hypot(tube.x, tube.y) + extra;
      item.position.set(mid * Math.cos(rad), mid * Math.sin(rad), tube.z);
      item.rotation.set(0, 0, rad - Math.PI / 2);
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
  const key = result.config.layout + ':' + Math.round(result.config.diameter) + ':' + Math.round(result.config.width);
  if (framed !== result.config.layout) {
    framed = result.config.layout;
    const size = result.config.diameter;
    orbit.target.set(0, 0, result.config.layout === 'axial' ? result.config.width / 2 : result.config.plate / 2);
    camera.up.set(0, 0, 1);
    camera.position.set(size * 0.2, -size * 1.2, result.config.layout === 'axial' ? result.config.width * 0.65 : size * 0.45);
    camera.near = 0.1;
    camera.far = 5000;
    camera.updateProjectionMatrix();
    orbit.update();
  }
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
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  $('canvas').append(renderer.domElement);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
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

const incoming = new URL(location.href).searchParams;
if ([...incoming.keys()].some((key) => keys.includes(key))) {
  for (const key of keys) {
    if (!incoming.has(key)) continue;
    if (key === 'joined') $('joined').checked = incoming.get(key) === '1' || incoming.get(key) === 'true';
    else $(key).value = incoming.get(key);
  }
  matchPreset();
}
layoutNotes();
schedule();
