import { predictPasses, makeRk78Sampler } from './passPrediction.js';
import { makeDeriv } from './forceModel.js';

// "Passes" panel: on demand, predict each ground station's upcoming visibility
// windows for every synthetic satellite, both without perturbations (analytic
// Kepler) and with them (RK78 + J2 + third body), and show the difference.
//
// @param mount        container element
// @param getConeDefs  () -> [{ name, apexBody, axisBody, cosHalfAngle }]
// @param getOrbitDefs () -> [{ name, orbit, epochSec }]
// @param rotationAt   (simSec) -> body rotation (rad about Y) — same model as the sim
// @param body         { muKm3s2, radiusKm, j2 }
// @param thirdBodies  [{ name, mu, positionAt }]  (the full set for "with perturbations")
// @param nowSec       () -> current sim seconds
// @param formatClock  (simSec) -> absolute time string (for the "computed at" note)
export function initPassesPanel({ mount, getConeDefs, getOrbitDefs, rotationAt, body, thirdBodies, nowSec, formatClock }) {
  mount.innerHTML = `
    <div class="row">
      <label>Horizon (h) <input id="passHorizon" type="number" min="1" max="240" step="1" value="24" /></label>
      <button id="passCompute" type="button" class="add" style="align-self:end">Compute passes</button>
    </div>
    <div id="pass-meta" class="hint"></div>
    <div id="pass-results"></div>
  `;
  const horizonInput = mount.querySelector('#passHorizon');
  const meta = mount.querySelector('#pass-meta');
  const results = mount.querySelector('#pass-results');
  mount.querySelector('#passCompute').addEventListener('click', compute);

  const relTime = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `+${h ? h + 'h ' : ''}${(h || m) ? m + 'm ' : ''}${s}s`;
  };
  const dur = (sec) => (sec == null ? '—' : sec < 60 ? `${Math.round(sec)} s` : `${(sec / 60).toFixed(1)} min`);
  const delta = (sec) => {
    const a = Math.abs(sec), sign = sec >= 0 ? '+' : '−';
    return a < 60 ? `${sign}${a.toFixed(0)} s` : `${sign}${(a / 60).toFixed(1)} min`;
  };

  function compute() {
    const horizonH = Math.max(1, parseFloat(horizonInput.value) || 24);
    const horizonSec = horizonH * 3600;
    const t0 = nowSec();
    const cones = getConeDefs();
    const sats = getOrbitDefs();
    const deriv = makeDeriv({ mu: body.muKm3s2, J2: body.j2 || 0, Req: body.radiusKm, thirdBodies });

    results.innerHTML = '';
    if (!cones.length || !sats.length) {
      meta.textContent = 'Add at least one ground point and one satellite first.';
      return;
    }

    for (const cone of cones) {
      const station = document.createElement('div');
      station.className = 'pass-station';
      const h = document.createElement('div');
      h.className = 'pass-station-name';
      h.textContent = cone.name;
      station.appendChild(h);

      for (const sat of sats) {
        const common = {
          apexBody: cone.apexBody, axisBody: cone.axisBody, cosHalfAngle: cone.cosHalfAngle,
          rotationAt, t0, horizonSec, stepSec: 30, maxPasses: 6,
        };
        const analyticPos = (t, out) => {
          const p = sat.orbit.positionEciKm(t - sat.epochSec);
          return out.set(p[0] / body.radiusKm, p[2] / body.radiusKm, -p[1] / body.radiusKm);
        };
        const st = sat.orbit.stateAt(t0 - sat.epochSec); // seed perturbed from "now"
        const pertPos = makeRk78Sampler({ deriv, rKm: st.rKm, vKmS: st.vKmS, t0, radiusKm: body.radiusKm });

        const aPasses = predictPasses({ ...common, positionSceneAt: analyticPos });
        const pPasses = predictPasses({ ...common, positionSceneAt: pertPos });

        const satEl = document.createElement('div');
        satEl.className = 'pass-sat';
        const sn = document.createElement('div');
        sn.className = 'pass-sat-name';
        sn.textContent = sat.name;
        satEl.appendChild(sn);

        const list = document.createElement('ul');
        list.className = 'pass-list';
        const n = Math.max(aPasses.length, pPasses.length);
        if (n === 0) {
          const li = document.createElement('li');
          li.className = 'pass-none';
          li.textContent = 'no passes in horizon';
          list.appendChild(li);
        } else {
          for (let i = 0; i < n; i++) {
            const a = aPasses[i], p = pPasses[i];
            const li = document.createElement('li');
            const base = a ? `${relTime(a.enter - t0)} · ${dur(a.durationSec)}` : '—';
            let d = '';
            if (a && p) d = ` · J2 ${delta(p.enter - a.enter)}`;
            else if (p && !a) d = ` · only w/ J2: ${relTime(p.enter - t0)}`;
            else if (a && !p) d = ' · only Kepler';
            li.innerHTML = `<span class="pass-idx">#${i + 1}</span> ${base}${d}`;
            list.appendChild(li);
          }
        }
        satEl.appendChild(list);
        station.appendChild(satEl);
      }
      results.appendChild(station);
    }
    meta.textContent = `Computed at ${formatClock(t0)} · horizon ${horizonH} h · Kepler vs J2+3rd-body`;
  }
}
