// Physical constants per central body, used by the orbital engine.
//   muKm3s2  — standard gravitational parameter GM (km^3/s^2)
//   radiusKm — equatorial radius (km); the body is normalized to 1 scene unit,
//              so scene = ECI_km / radiusKm. Also serves as Req for J2.
//   j2       — second zonal harmonic (oblateness) coefficient (dimensionless)
export const EARTH = { name: 'Earth', muKm3s2: 398600.4418, radiusKm: 6378.137, j2: 1.08263e-3 };
export const MOON  = { name: 'Moon',  muKm3s2: 4902.800,    radiusKm: 1737.4,   j2: 2.0330e-4 };

// The Sun as a perturbing third body (no radius/J2 needed here).
export const SUN = { name: 'Sun', muKm3s2: 1.32712440018e11 };
