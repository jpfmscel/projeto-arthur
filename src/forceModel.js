// Force models for Cowell's method. Each returns a first-order derivative
// function deriv(t, y) for the state y = [x, y, z, vx, vy, vz] (km, km/s):
// position derivative is velocity, velocity derivative is acceleration.
//
// Option 1 — central field (two-body): a = −μ·r / |r|³. Future options add
// perturbations (J2, drag, third-body, SRP) by summing extra accelerations.

export function centralField(mu) {
  return function deriv(_t, y) {
    const x = y[0], yy = y[1], z = y[2];
    const r2 = x * x + yy * yy + z * z;
    const r = Math.sqrt(r2);
    const k = -mu / (r2 * r); // −μ / r³
    return [y[3], y[4], y[5], k * x, k * yy, k * z];
  };
}
