import * as THREE from 'three';
import { createViewCone } from './viewCone.js';
import { makeSwatch, makeRemoveButton } from './uiHelpers.js';

const DEFAULT_PALETTE = [
  0x6ec1ff, 0xffb86c, 0x9af07a, 0xff79c6,
  0xf1fa8c, 0xbd93f9, 0xff5555, 0x8be9fd,
];

const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

/**
 * Manage the collection of ground points and their view cones: add/remove, the
 * THREE objects (added under `parent`, the rotating body frame), the `<ul>`
 * list view, and the per-frame cone world-states the visibility hit-test
 * consumes.
 *
 * The cone-state objects are allocated once per point (not per frame) and
 * updated in place by `getConeStates()`, so the hot path stays allocation-free.
 */
export function createGroundPoints({ parent, listEl, palette = DEFAULT_PALETTE }) {
  const points = [];
  const coneStates = [];   // parallel to `points`, reused every frame
  const labelTargets = []; // parallel; consumed by the label overlay
  let colorIdx = 0;
  let nextId = 1;

  function add({ lat, lon, halfAngle, label }) {
    const color = palette[colorIdx++ % palette.length];
    const id = nextId++;
    const cone = createViewCone({ lat, lon, halfAngleDeg: halfAngle, color });
    parent.add(cone.group);
    points.push({ id, lat, lon, halfAngle, label, color, cone });
    const coneState = {
      apex: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      cosHalfAngle: cone.cosHalfAngle,
      count: 0, // satellites currently inside (set by visibility)
      setActive: (on) => cone.setActive(on),
    };
    coneStates.push(coneState);
    labelTargets.push({
      getWorldPosition: (out) => cone.cone.getWorldPosition(out),
      name: label || `Point ${id}`,
      details: () => `${lat.toFixed(2)}°, ${lon.toFixed(2)}° · FOV ${halfAngle}° · in view: ${coneState.count}`,
    });
    renderList();
    return id;
  }

  function remove(id) {
    const idx = points.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [removed] = points.splice(idx, 1);
    coneStates.splice(idx, 1);
    labelTargets.splice(idx, 1);
    parent.remove(removed.cone.group);
    removed.cone.dispose();
    renderList();
  }

  // Update each cached cone-state in place from its current world transform.
  function getConeStates() {
    for (let i = 0; i < points.length; i++) {
      const cone = points[i].cone.cone;
      cone.getWorldPosition(coneStates[i].apex);
      cone.getWorldQuaternion(_quat);
      coneStates[i].axis.copy(_up).applyQuaternion(_quat).normalize();
    }
    return coneStates;
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
    getLabelTargets: () => labelTargets,
    get count() { return points.length; },
  };
}
