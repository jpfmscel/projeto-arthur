import { createSatellite } from './satellite.js';
import { makeSwatch, makeRemoveButton } from './uiHelpers.js';

const DEFAULT_PALETTE = [
  0xffd166, 0x06d6a0, 0xef476f, 0x118ab2,
  0x8338ec, 0xfb5607, 0x80ed99, 0xff006e,
];

/**
 * Manage the collection of synthetic (circular-orbit) satellites: add/remove,
 * the THREE objects (added under `parent`, the inertial frame), the `<ul>`
 * list view, per-frame `tick`, `reset`, and the targets the visibility
 * hit-test consumes.
 *
 * @param parent  THREE.Object3D the orbits are added to (inertial frame)
 * @param listEl  the <ul> element to render rows into
 * @param palette optional color cycle for new satellites
 * @returns { add, remove, reset, tick, getTargets, count }
 */
export function createSyntheticSats({ parent, listEl, palette = DEFAULT_PALETTE }) {
  const sats = [];
  let colorIdx = 0;
  let nextId = 1;

  function add({ name, altitude, inclination, raan, omega, alpha }) {
    const color = palette[colorIdx++ % palette.length];
    const id = nextId++;
    const sat = createSatellite({
      altitude,
      inclinationDeg: inclination,
      raanDeg: raan,
      omegaDegPerSec: omega,
      alphaDegPerSec2: alpha,
      color,
    });
    parent.add(sat.group);
    sats.push({
      id, color, sat,
      name: name || `Sat ${id}`,
      params: { altitude, inclination, raan, omega, alpha },
    });
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

  function reset() {
    for (const s of sats) s.sat.reset();
  }

  function tick(dt) {
    for (const s of sats) s.sat.tick(dt);
  }

  // Adapters so the generic visibility hit-test can read each satellite.
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
      const { altitude, inclination, raan, omega, alpha } = s.params;
      meta.querySelector('.coords').textContent =
        `alt ${altitude} · inc ${inclination}° · RAAN ${raan}° · ω ${omega}°/s${alpha ? ` · α ${alpha}°/s²` : ''}`;
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
