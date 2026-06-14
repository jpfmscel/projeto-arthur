import { createSatellite } from './satellite.js';
import { makeSwatch, makeRemoveButton } from './uiHelpers.js';

const DEFAULT_PALETTE = [
  0xffd166, 0x06d6a0, 0xef476f, 0x118ab2,
  0x8338ec, 0xfb5607, 0x80ed99, 0xff006e,
];

/**
 * Manage the collection of two-body (Keplerian) satellites: add/remove, the
 * THREE objects (added under `parent`, the inertial frame), the `<ul>` list
 * view, per-frame `tick(simSec)`, `reset(simSec)`, and the visibility targets.
 *
 * @param parent  THREE.Object3D the orbits are added to (inertial frame)
 * @param listEl  the <ul> element to render rows into
 * @param body    { muKm3s2, radiusKm } — used for scene scaling
 * @param palette optional color cycle
 */
export function createSyntheticSats({ parent, listEl, body, palette = DEFAULT_PALETTE }) {
  const sats = [];
  let colorIdx = 0;
  let nextId = 1;

  // `orbit` is an orbit.js object (assumed valid); epochSec is the sim time at
  // creation so propagation is epoch-relative.
  function add({ name, orbit, epochSec = 0 }) {
    const color = palette[colorIdx++ % palette.length];
    const id = nextId++;
    const sat = createSatellite({ orbit, color, radiusKm: body.radiusKm, epochSec });
    parent.add(sat.group);
    sats.push({ id, color, sat, orbit, name: name || `Sat ${id}` });
    renderList();
    return id;
  }

  function remove(id) {
    const idx = sats.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const [removed] = sats.splice(idx, 1);
    parent.remove(removed.sat.group);
    removed.sat.dispose();
    renderList();
  }

  function reset(simSec) {
    for (const s of sats) s.sat.reset(simSec);
  }

  function tick(simSec) {
    for (const s of sats) s.sat.tick(simSec);
  }

  function getTargets() {
    return sats.map((s) => ({
      getWorldPosition: (out) => s.sat.satMesh.getWorldPosition(out),
      setHighlighted: (on) => s.sat.setHighlighted(on),
    }));
  }

  function renderList() {
    listEl.innerHTML = '';
    for (const s of sats) {
      const li = document.createElement('li');
      li.appendChild(makeSwatch(s.color));
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
      meta.querySelector('.name').textContent = s.name;
      const { aKm, e, incDeg, periodSec } = s.orbit.elements;
      meta.querySelector('.coords').textContent =
        `a ${aKm.toFixed(0)} km · e ${e.toFixed(3)} · i ${incDeg.toFixed(1)}° · T ${(periodSec / 60).toFixed(1)} min`;
      li.appendChild(meta);
      li.appendChild(makeRemoveButton(() => remove(s.id)));
      listEl.appendChild(li);
    }
  }

  return {
    add,
    remove,
    reset,
    tick,
    getTargets,
    get count() { return sats.length; },
  };
}
