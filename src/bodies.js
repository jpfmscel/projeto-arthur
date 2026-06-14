// Physical constants per central body, used by the orbital engine.
//   muKm3s2  — standard gravitational parameter GM (km^3/s^2)
//   radiusKm — equatorial radius (km); the body is normalized to 1 scene unit,
//              so scene = ECI_km / radiusKm.
export const EARTH = { name: 'Earth', muKm3s2: 398600.4418, radiusKm: 6378.137 };
export const MOON  = { name: 'Moon',  muKm3s2: 4902.800,    radiusKm: 1737.4 };
