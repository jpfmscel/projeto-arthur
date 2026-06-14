import { fromCircular, fromKeplerian, fromStateVector } from './orbit.js';

// Shared "Add satellite" form with three input modes. Rendered into `mount`
// (so the markup isn't duplicated across pages), validated, and emitting a
// valid orbit via onAdd(orbit, name). Defaults adapt to the central body so the
// seeded state-vector is always a valid circular orbit.
//
// @param mount  container element to render the form into
// @param body   { muKm3s2, radiusKm, name }
// @param onAdd  (orbit, name) => void   — called with a valid orbit
export function initSatelliteForm({ mount, body, onAdd }) {
  const altDef = Math.round(body.radiusKm * 0.06);          // ~LEO-ish altitude
  const aDef = body.radiusKm + altDef;
  const vCirc = Math.sqrt(body.muKm3s2 / aDef);             // circular speed at aDef
  const incDef = 51.6;
  const num = (v) => Number(v.toFixed(3));

  mount.innerHTML = `
    <form id="sat-form" novalidate>
      <label>Name <input name="name" type="text" maxlength="40" placeholder="optional" /></label>

      <div class="seg" role="tablist">
        <button type="button" data-mode="circular" class="active">Circular</button>
        <button type="button" data-mode="keplerian">Keplerian</button>
        <button type="button" data-mode="state">State vector</button>
      </div>

      <div data-group="circular">
        <div class="row">
          <label>Altitude (km) <input name="altitudeKm" type="number" step="any" value="${altDef}" /></label>
          <label>Inclination (deg) <input name="c_inc" type="number" step="any" value="${incDef}" /></label>
        </div>
        <label>RAAN (deg) <input name="c_raan" type="number" step="any" value="0" /></label>
      </div>

      <div data-group="keplerian" hidden>
        <div class="row">
          <label>Semi-major axis (km) <input name="aKm" type="number" step="any" value="${num(aDef)}" /></label>
          <label>Eccentricity <input name="e" type="number" step="any" min="0" value="0" /></label>
        </div>
        <div class="row">
          <label>Inclination (deg) <input name="k_inc" type="number" step="any" value="${incDef}" /></label>
          <label>RAAN (deg) <input name="k_raan" type="number" step="any" value="0" /></label>
        </div>
        <div class="row">
          <label>Arg. of pericenter (deg) <input name="argp" type="number" step="any" value="0" /></label>
          <label>True anomaly (deg) <input name="nu" type="number" step="any" value="0" /></label>
        </div>
      </div>

      <div data-group="state" hidden>
        <div class="row">
          <label>X (km) <input name="x" type="number" step="any" value="${num(aDef)}" /></label>
          <label>Vx (km/s) <input name="vx" type="number" step="any" value="0" /></label>
        </div>
        <div class="row">
          <label>Y (km) <input name="y" type="number" step="any" value="0" /></label>
          <label>Vy (km/s) <input name="vy" type="number" step="any" value="${num(vCirc)}" /></label>
        </div>
        <div class="row">
          <label>Z (km) <input name="z" type="number" step="any" value="0" /></label>
          <label>Vz (km/s) <input name="vz" type="number" step="any" value="0" /></label>
        </div>
      </div>

      <div class="form-error" hidden></div>
      <button type="submit">Add satellite</button>
    </form>
  `;

  const form = mount.querySelector('#sat-form');
  const errEl = form.querySelector('.form-error');
  const segBtns = [...form.querySelectorAll('.seg button')];
  const groups = [...form.querySelectorAll('[data-group]')];
  let mode = 'circular';

  function showMode(m) {
    mode = m;
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    groups.forEach((g) => { g.hidden = g.dataset.group !== m; });
    setError('');
  }
  segBtns.forEach((b) => b.addEventListener('click', () => showMode(b.dataset.mode)));

  function setError(msg) {
    errEl.textContent = msg;
    errEl.hidden = !msg;
  }

  const f = (name) => parseFloat(form.elements[name].value);

  function buildOrbit() {
    const mu = body.muKm3s2;
    if (mode === 'circular') {
      return fromCircular({ altitudeKm: f('altitudeKm'), incDeg: f('c_inc'), raanDeg: f('c_raan') }, mu, body.radiusKm);
    }
    if (mode === 'keplerian') {
      return fromKeplerian({
        aKm: f('aKm'), e: f('e'), incDeg: f('k_inc'), raanDeg: f('k_raan'), argpDeg: f('argp'), nuDeg: f('nu'),
      }, mu);
    }
    return fromStateVector({
      rKm: [f('x'), f('y'), f('z')], vKmS: [f('vx'), f('vy'), f('vz')],
    }, mu);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const orbit = buildOrbit();
    if (!orbit.valid) {
      setError('Not a bound elliptical orbit — check the values.');
      return;
    }
    const { aKm, e: ecc } = orbit.elements;
    if (aKm * (1 - ecc) < body.radiusKm) {
      setError(`Perigee is below the ${body.name || 'body'}'s surface.`);
      return;
    }
    setError('');
    onAdd(orbit, form.elements.name.value.trim());
    form.elements.name.value = '';
  });

  showMode('circular');
}
