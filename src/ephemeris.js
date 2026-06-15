import { EARTH, MOON, SUN } from './bodies.js';

// Simplified analytic ephemeris for third-body perturbations. Bodies move on
// circular mean orbits in the central frame's equatorial (XY) plane — this
// ignores the ~5° lunar-orbit inclination and the obliquities, and the phase at
// t = 0 is arbitrary (NOT aligned to a real epoch). It is meant to demonstrate
// the perturbation, not to predict real positions.
//
// `t` is absolute sim-seconds, as passed by the integrator to deriv(t, y).

const AU = 1.495978707e8;        // km
const D_EM = 384400;             // km, mean Earth–Moon distance
const DAY = 86400;
const W_MOON = (2 * Math.PI) / (27.321661 * DAY); // sidereal month
const W_YEAR = (2 * Math.PI) / (365.25636 * DAY); // sidereal year

const sunRelEarth = (t) => [AU * Math.cos(W_YEAR * t), AU * Math.sin(W_YEAR * t), 0];
const moonRelEarth = (t) => [D_EM * Math.cos(W_MOON * t), D_EM * Math.sin(W_MOON * t), 0];
const earthRelMoon = (t) => { const m = moonRelEarth(t); return [-m[0], -m[1], -m[2]]; };
const sunRelMoon = (t) => { const s = sunRelEarth(t), m = moonRelEarth(t); return [s[0] - m[0], s[1] - m[1], s[2] - m[2]]; };

/**
 * Third bodies for a given central body, each as
 * { name, mu (km³/s²), positionAt(t) -> [x,y,z] km relative to the central body }.
 *   Moon  -> Earth + Sun     (the user's "Terra e Sol")
 *   Earth -> Moon + Sun      (natural analog)
 */
export function thirdBodiesFor(body) {
  if (body.name === 'Moon') {
    return [
      { name: 'Earth', mu: EARTH.muKm3s2, positionAt: earthRelMoon },
      { name: 'Sun', mu: SUN.muKm3s2, positionAt: sunRelMoon },
    ];
  }
  return [
    { name: 'Moon', mu: MOON.muKm3s2, positionAt: moonRelEarth },
    { name: 'Sun', mu: SUN.muKm3s2, positionAt: sunRelEarth },
  ];
}
