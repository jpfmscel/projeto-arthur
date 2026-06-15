// Adaptive Runge–Kutta–Fehlberg 7(8) integrator (Fehlberg 1968, 13 stages).
// Generic and domain-free: integrates y′ = deriv(t, y) from t0 to t1 with
// embedded 7th/8th-order error control. Advances with the 8th-order weights
// (local extrapolation); the step size is driven by the 7(8) error estimate.

// Nodes.
const C = [0, 2 / 27, 1 / 9, 1 / 6, 5 / 12, 1 / 2, 5 / 6, 1 / 6, 2 / 3, 1 / 3, 1, 0, 1];

// Stage coefficients (lower-triangular; row i has i entries).
const A = [
  [],
  [2 / 27],
  [1 / 36, 1 / 12],
  [1 / 24, 0, 1 / 8],
  [5 / 12, 0, -25 / 16, 25 / 16],
  [1 / 20, 0, 0, 1 / 4, 1 / 5],
  [-25 / 108, 0, 0, 125 / 108, -65 / 27, 125 / 54],
  [31 / 300, 0, 0, 0, 61 / 225, -2 / 9, 13 / 900],
  [2, 0, 0, -53 / 6, 704 / 45, -107 / 9, 67 / 90, 3],
  [-91 / 108, 0, 0, 23 / 108, -976 / 135, 311 / 54, -19 / 60, 17 / 6, -1 / 12],
  [2383 / 4100, 0, 0, -341 / 164, 4496 / 1025, -301 / 82, 2133 / 4100, 45 / 82, 45 / 164, 18 / 41],
  [3 / 205, 0, 0, 0, 0, -6 / 41, -3 / 205, -3 / 41, 3 / 41, 6 / 41, 0],
  [-1777 / 4100, 0, 0, -341 / 164, 4496 / 1025, -289 / 82, 2193 / 4100, 51 / 82, 33 / 164, 12 / 41, 0, 1],
];

// 8th-order solution weights.
const B8 = [0, 0, 0, 0, 0, 34 / 105, 9 / 35, 9 / 35, 9 / 280, 9 / 280, 0, 41 / 840, 41 / 840];

// Error estimate weights (b8 − b7), nonzero only at stages 0, 10, 11, 12.
const E0 = -41 / 840, E10 = -41 / 840, E11 = 41 / 840, E12 = 41 / 840;

/**
 * Integrate y′ = deriv(t, y) from t0 to t1.
 * @returns { t, y, steps, rejects }
 */
export function integrate(deriv, t0, y0, t1, opts = {}) {
  const { absTol = 1e-9, relTol = 1e-9, maxSteps = 10000 } = opts;
  const n = y0.length;
  const y = y0.slice();
  let t = t0;
  const total = t1 - t0;
  if (total === 0) return { t, y, steps: 0, rejects: 0 };

  const dir = Math.sign(total);
  const hMax = opts.hMax ?? Math.abs(total);
  const hMin = opts.hMin ?? Math.abs(total) * 1e-13 + Number.MIN_VALUE;
  let h = dir * Math.min(Math.abs(opts.hInit ?? total), hMax);

  const k = Array.from({ length: 13 }, () => new Array(n));
  const ytmp = new Array(n);
  const ynew = new Array(n);
  let steps = 0, rejects = 0;

  const done = () => (dir > 0 ? t >= t1 : t <= t1);

  while (!done() && steps < maxSteps) {
    if (Math.abs(h) > Math.abs(t1 - t)) h = t1 - t; // land exactly on t1

    // Evaluate the 13 stages.
    for (let s = 0; s < 13; s++) {
      const arow = A[s];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < arow.length; j++) {
          const aij = arow[j];
          if (aij !== 0) sum += aij * k[j][i];
        }
        ytmp[i] = y[i] + h * sum;
      }
      const d = deriv(t + C[s] * h, ytmp);
      for (let i = 0; i < n; i++) k[s][i] = d[i];
    }

    // 8th-order step + scaled error norm.
    let errNorm = 0;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let s = 0; s < 13; s++) {
        const b = B8[s];
        if (b !== 0) acc += b * k[s][i];
      }
      ynew[i] = y[i] + h * acc;
      const evec = h * (E0 * k[0][i] + E10 * k[10][i] + E11 * k[11][i] + E12 * k[12][i]);
      const scale = absTol + relTol * Math.max(Math.abs(y[i]), Math.abs(ynew[i]));
      const e = evec / scale;
      errNorm += e * e;
    }
    errNorm = Math.sqrt(errNorm / n);

    if (errNorm <= 1 || Math.abs(h) <= hMin) {
      t += h;
      for (let i = 0; i < n; i++) y[i] = ynew[i];
      steps++;
      const fac = errNorm === 0 ? 5 : Math.min(5, 0.9 * Math.pow(1 / errNorm, 1 / 8));
      h *= Math.max(0.2, fac);
    } else {
      rejects++;
      h *= Math.max(0.2, 0.9 * Math.pow(1 / errNorm, 1 / 8));
    }

    if (Math.abs(h) > hMax) h = dir * hMax;
    if (Math.abs(h) < hMin) h = dir * hMin;
  }

  return { t, y, steps, rejects };
}
