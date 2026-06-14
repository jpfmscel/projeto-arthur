// Curated real lunar orbiters, offered as one-click circular-orbit presets
// (Celestrak/SGP4 only covers Earth orbiters, so there is no live feed here).
// Altitudes are in km above the surface; each builds a real two-body orbit via
// fromCircular(...) with the Moon's μ. Distinct RAANs spread the (mostly polar)
// orbits apart so they read as separate rings. Strongly elliptical missions
// (e.g. CAPSTONE's NRHO) are omitted rather than misrepresented as circular.
export const LUNAR_PRESETS = [
  { name: 'LRO',              note: '~50 km polar mapping orbit', altitudeKm: 50,  incDeg: 90, raanDeg: 0 },
  { name: 'Chandrayaan-2',    note: '~100 km polar',             altitudeKm: 100, incDeg: 90, raanDeg: 30 },
  { name: 'Danuri (KPLO)',    note: '~100 km polar',             altitudeKm: 100, incDeg: 90, raanDeg: 60 },
  { name: 'Lunar Prospector', note: '~100 km polar (1998–99)',   altitudeKm: 100, incDeg: 90, raanDeg: 90 },
  { name: 'Kaguya (SELENE)',  note: '~100 km polar (2007–09)',   altitudeKm: 100, incDeg: 90, raanDeg: 120 },
];

/**
 * Render the preset pick-list. Each row shows the mission and its approximate
 * real orbit, with an "Add" button that calls `onAdd(preset)`.
 */
export function renderPresetList(listEl, presets, onAdd) {
  listEl.innerHTML = '';
  for (const p of presets) {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
    meta.querySelector('.name').textContent = p.name;
    meta.querySelector('.coords').textContent = `${p.note} · ${p.altitudeKm} km · inc ${p.incDeg}°`;
    li.appendChild(meta);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add';
    btn.textContent = 'Add';
    btn.addEventListener('click', () => onAdd(p));
    li.appendChild(btn);

    listEl.appendChild(li);
  }
}
