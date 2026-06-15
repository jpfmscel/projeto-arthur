// Force models for Cowell's method. Each returns a first-order derivative
// function deriv(t, y) for the state y = [x, y, z, vx, vy, vz] (km, km/s):
// position derivative is velocity, velocity derivative is acceleration.
// `t` is absolute sim-seconds (third bodies use it for their ephemeris).

/** Option 1 — central field only: a = −μ·r / |r|³. */
export function centralField(mu) {
  return function deriv(_t, y) {
    const x = y[0], yy = y[1], z = y[2];
    const r2 = x * x + yy * yy + z * z;
    const r = Math.sqrt(r2);
    const k = -mu / (r2 * r);
    return [y[3], y[4], y[5], k * x, k * yy, k * z];
  };
}

/**
 * General Cowell derivative summing the central field plus optional
 * perturbations:
 *   - J2 oblateness (needs J2 and the equatorial radius Req), and
 *   - third-body point masses (each { mu, positionAt(t) -> [x,y,z] km
 *     relative to the central body}).
 *
 * Terms are skipped when their inputs are absent, so:
 *   makeDeriv({ mu })                              // Option 1 (central)
 *   makeDeriv({ mu, J2, Req })                     // Option 2 (+J2)
 *   makeDeriv({ mu, J2, Req, thirdBodies })        // Option 3 (+third body)
 */
export function makeDeriv({ mu, J2 = 0, Req = 0, thirdBodies = [] }) {
  const hasJ2 = J2 !== 0 && Req !== 0;
  return function deriv(t, y) {
    const x = y[0], yy = y[1], z = y[2];
    const r2 = x * x + yy * yy + z * z;
    const r = Math.sqrt(r2);
    const invR3 = 1 / (r2 * r);

    let ax = -mu * x * invR3;
    let ay = -mu * yy * invR3;
    let az = -mu * z * invR3;

    if (hasJ2) {
      // a_J2 = -1.5 J2 μ Req² / r⁵ · [x(1−5z²/r²), y(1−5z²/r²), z(3−5z²/r²)]
      const k = -1.5 * J2 * mu * Req * Req / (r2 * r2 * r);
      const zr2 = (z * z) / r2;
      ax += k * x * (1 - 5 * zr2);
      ay += k * yy * (1 - 5 * zr2);
      az += k * z * (3 - 5 * zr2);
    }

    for (let i = 0; i < thirdBodies.length; i++) {
      const tb = thirdBodies[i];
      const s = tb.positionAt(t);
      const dx = s[0] - x, dy = s[1] - yy, dz = s[2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const invD3 = 1 / (d2 * Math.sqrt(d2));
      const s2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2];
      const invS3 = 1 / (s2 * Math.sqrt(s2));
      const mu3 = tb.mu;
      ax += mu3 * (dx * invD3 - s[0] * invS3);
      ay += mu3 * (dy * invD3 - s[1] * invS3);
      az += mu3 * (dz * invD3 - s[2] * invS3);
    }

    return [y[3], y[4], y[5], ax, ay, az];
  };
}
