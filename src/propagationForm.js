// The Propagation panel's UI (its own dock tile, since it can get involved):
// choose the propagation method and, for the numerical (RK78 · Cowell) path,
// toggle the perturbation terms. Emits a config to `onChange`:
//   { numerical: boolean, useJ2: boolean, thirdBodyNames: string[] }
//
// The three named options map to combinations:
//   Central field = numerical, no perturbations
//   Option 2 (J2) = + J2
//   Option 3       = + J2 + all third bodies
//
// @param mount          container element
// @param thirdBodyNames available third bodies for this central body (e.g. ['Earth','Sun'])
// @param onChange       called with the config whenever it changes
export function initPropagationForm({ mount, thirdBodyNames = [], onChange }) {
  mount.innerHTML = `
    <div class="seg" id="prop-mode">
      <button type="button" data-m="analytic" class="active">Analytic (Kepler)</button>
      <button type="button" data-m="numerical">Numerical (RK78)</button>
    </div>

    <div id="prop-perturb" hidden>
      <div class="label">Perturbations · Cowell</div>
      <label class="chk"><input type="checkbox" id="ptJ2" /> J2 oblateness</label>
      ${thirdBodyNames.map((n) => `<label class="chk"><input type="checkbox" data-tb="${n}" /> Third body: ${n}</label>`).join('')}
    </div>

    <div id="prop-info" class="hint"></div>
  `;

  const modeSeg = mount.querySelector('#prop-mode');
  const modeBtns = [...modeSeg.querySelectorAll('button')];
  const perturb = mount.querySelector('#prop-perturb');
  const j2Box = mount.querySelector('#ptJ2');
  const tbBoxes = [...mount.querySelectorAll('[data-tb]')];
  const info = mount.querySelector('#prop-info');
  let numerical = false;

  function config() {
    return {
      numerical,
      useJ2: j2Box.checked,
      thirdBodyNames: tbBoxes.filter((b) => b.checked).map((b) => b.dataset.tb),
    };
  }

  function describe(c) {
    if (!c.numerical) return 'Analytic Kepler — exact two-body, constant elements.';
    const terms = ['central field'];
    if (c.useJ2) terms.push('J2');
    if (c.thirdBodyNames.length) terms.push(`3rd body: ${c.thirdBodyNames.join(' + ')}`);
    return `RK78 7(8) adaptive · ${terms.join(' + ')}`;
  }

  function emit() {
    const c = config();
    info.textContent = describe(c);
    onChange(c);
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => {
    numerical = b.dataset.m === 'numerical';
    modeBtns.forEach((x) => x.classList.toggle('active', x === b));
    perturb.hidden = !numerical;
    emit();
  }));
  j2Box.addEventListener('change', emit);
  tbBoxes.forEach((b) => b.addEventListener('change', emit));

  emit(); // initial (analytic)
}
