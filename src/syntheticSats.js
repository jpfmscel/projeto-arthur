import { createSatelliteField } from './satelliteField.js';
import { makeSwatch, makeRemoveButton } from './uiHelpers.js';

const DEFAULT_PALETTE = [
  0xffd166, 0x06d6a0, 0xef476f, 0x118ab2,
  0x8338ec, 0xfb5607, 0x80ed99, 0xff006e,
];

/**
 * Manage the collection of two-body satellites: identity + list view, on top of
 * an instanced `satelliteField` that owns the rendering and propagation. The
 * visibility `targets` array is cached (rebuilt only on add/remove), so the
 * per-frame hit-test allocates nothing.
 *
 * @param parent  THREE.Object3D the field is added to (inertial frame)
 * @param listEl  the <ul> element to render rows into
 * @param body    { muKm3s2, radiusKm } — radius used for scene scaling
 * @param palette optional color cycle
 */
export function createSyntheticSats({ parent, listEl, body, palette = DEFAULT_PALETTE }) {
  const field = createSatelliteField({ parent, radiusKm: body.radiusKm });
  const sats = [];      // { id, fieldIndex, name, color, orbit }
  const targets = [];   // parallel to `sats`, reused every frame
  let colorIdx = 0;
  let nextId = 1;

  function addOne({ name, orbit, epochSec = 0 }) {
    const color = palette[colorIdx++ % palette.length];
    const id = nextId++;
    const fieldIndex = field.add({ orbit, colorHex: color, epochSec });
    sats.push({ id, fieldIndex, color, orbit, name: name || `Sat ${id}` });
    targets.push({
      getWorldPosition: (out) => field.getPosition(fieldIndex, out),
      setHighlighted: (on) => field.setHighlighted(fieldIndex, on),
    });
    return id;
  }

  function add(spec) {
    const id = addOne(spec);
    renderList();
    return id;
  }

  // Bulk add with a single list render (avoids O(n²) DOM churn).
  function addMany(specs) {
    for (const s of specs) addOne(s);
    renderList();
  }

  function remove(id) {
    const idx = sats.findIndex((s) => s.id === id);
    if (idx === -1) return;
    field.remove(sats[idx].fieldIndex);
    sats.splice(idx, 1);
    targets.splice(idx, 1);
    renderList();
  }

  const reset = (simSec) => field.reset(simSec);
  const tick = (simSec) => field.tick(simSec);
  const getTargets = () => targets;

  const MAX_ROWS = 100; // keep the list DOM bounded when there are many sats

  function renderList() {
    listEl.innerHTML = '';
    const shown = Math.min(sats.length, MAX_ROWS);
    for (let i = 0; i < shown; i++) {
      const s = sats[i];
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
    if (sats.length > MAX_ROWS) {
      const li = document.createElement('li');
      li.style.color = 'var(--muted)';
      li.style.fontStyle = 'italic';
      li.textContent = `…and ${sats.length - MAX_ROWS} more (${sats.length} total)`;
      listEl.appendChild(li);
    }
  }

  return {
    add,
    addMany,
    remove,
    reset,
    tick,
    getTargets,
    get count() { return sats.length; },
  };
}
