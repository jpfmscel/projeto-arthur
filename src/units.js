// The rendered celestial body (Earth or Moon) is always normalized to a radius
// of 1 scene unit. Altitudes, cone heights, and orbit radii are expressed in
// these body-radii, so the same geometry code works for any body — only the
// real-world scale a unit represents differs (R_E ≈ 6378 km, R_Moon ≈ 1737 km).
export const BODY_RADIUS = 1;
