// Curated real lunar orbiters, offered as one-click synthetic-orbit presets
// (Celestrak/SGP4 only covers Earth orbiters, so there is no live feed here).
//
// Each preset maps directly onto syntheticSats.add(). Altitudes are in
// Moon-radii (R_Moon ≈ 1737.4 km). `omega` is an arbitrary sim-time deg/s
// chosen for visible motion — the same convention as the Earth page's
// synthetic defaults, NOT a real mean motion. The orbits modelled here are
// circular; missions with strongly elliptical orbits (e.g. CAPSTONE's NRHO)
// are intentionally omitted rather than misrepresented. Distinct RAAN values
// spread the (mostly polar) orbits apart so they read as separate rings.
export const LUNAR_PRESETS = [
  { name: 'LRO',              note: '~50 km polar mapping orbit', altitude: 0.029, inclination: 90, raan:   0, omega: 28, alpha: 0 },
  { name: 'Chandrayaan-2',    note: '~100 km polar',             altitude: 0.058, inclination: 90, raan:  30, omega: 24, alpha: 0 },
  { name: 'Danuri (KPLO)',    note: '~100 km polar',             altitude: 0.058, inclination: 90, raan:  60, omega: 24, alpha: 0 },
  { name: 'Lunar Prospector', note: '~100 km polar (1998–99)',   altitude: 0.058, inclination: 90, raan:  90, omega: 24, alpha: 0 },
  { name: 'Kaguya (SELENE)',  note: '~100 km polar (2007–09)',   altitude: 0.058, inclination: 90, raan: 120, omega: 24, alpha: 0 },
];

/**
 * Render the preset pick-list. Each row shows the mission and its approximate
 * real orbit, with an "Add" button that calls `onAdd(preset)`.
 *
 * @param listEl  the <ul> to render into
 * @param presets array of preset objects (see LUNAR_PRESETS)
 * @param onAdd   callback invoked with the chosen preset
 */
export function renderPresetList(listEl, presets, onAdd) {
  listEl.innerHTML = '';
  for (const p of presets) {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div class="name"></div><div class="coords"></div>`;
    meta.querySelector('.name').textContent = p.name;
    meta.querySelector('.coords').textContent =
      `${p.note} · alt ${p.altitude} R☾ · inc ${p.inclination}°`;
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
