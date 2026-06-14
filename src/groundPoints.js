import * as THREE from 'three';
import { createViewCone } from './viewCone.js';
import { makeSwatch, makeRemoveButton } from './uiHelpers.js';

const DEFAULT_PALETTE = [
  0x6ec1ff, 0xffb86c, 0x9af07a, 0xff79c6,
  0xf1fa8c, 0xbd93f9, 0xff5555, 0x8be9fd,
];

const _up = new THREE.Vector3(0, 1, 0);

/**
 * Manage the collection of ground points and their view cones: add/remove,
 * the THREE objects (added under `parent`, typically the rotating body frame),
 * the `<ul>` list view, and the per-frame cone world-states the visibility
 * hit-test consumes.
 *
 * @param parent  THREE.Object3D the cones are added to (rotates with the body)
 * @param listEl  the <ul> element to render rows into
 * @param palette optional color cycle for new points
 * @returns { add, remove, getConeStates, count }
 */
export function createGroundPoints({ parent, listEl, palette = DEFAULT_PALETTE }) {
  const points = [];
  let colorIdx = 0;
  let nextId = 1;

  function add({ lat, lon, halfAngle, label }) {
    const color = palette[colorIdx++ % palette.length];
    const id = nextId++;
    const cone = createViewCone({ lat, lon, halfAngleDeg: halfAngle, color });
    parent.add(cone.group);
    points.push({ id, lat, lon, halfAngle, label, color, cone });
    renderList();
    return id;
  }

  function remove(id) {
    const idx = points.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [removed] = points.splice(idx, 1);
    parent.remove(removed.cone.group);
    removed.cone.dispose();
    renderList();
  }

  // One entry per cone, recomputed each frame from its current world transform.
  function getConeStates() {
    return points.map((p) => {
      const apex = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      p.cone.cone.getWorldPosition(apex);
      p.cone.cone.getWorldQuaternion(quat);
      const axis = _up.clone().applyQuaternion(quat).normalize();
      return {
        apex,
        axis,
        cosHalfAngle: p.cone.cosHalfAngle,
        setActive: (on) => p.cone.setActive(on),
      };
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    for (const p of points) {
      const li = document.createElement('li');
      li.appendChild(makeSwatch(p.color));
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
      meta.querySelector('.name').textContent = p.label || `Point ${p.id}`;
      meta.querySelector('.coords').textContent =
        `${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}° · FOV ${p.halfAngle}°`;
      li.appendChild(meta);
      li.appendChild(makeRemoveButton(() => remove(p.id)));
      listEl.appendChild(li);
    }
  }

  return {
    add,
    remove,
    getConeStates,
    get count() { return points.length; },
  };
}
