// Shared physics + geometry for all widgets.
//
// Conventions (used everywhere):
//   - Angles in degrees. 0° = north (up on screen), increasing clockwise.
//   - Screen coordinates: x right, y down. dir(0) = (0,-1).
//   - Wind angles are "from" directions, the way sailors say them.
//   - Vectors {x, y} are flow/velocity directions ("to"), in knots.

export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Unit vector for a compass angle (screen coords, y down).
export const dir = (a) => ({ x: Math.sin(rad(a)), y: -Math.cos(rad(a)) });

// Compass angle of a screen vector.
export const angleOf = (v) => (deg(Math.atan2(v.x, -v.y)) + 360) % 360;

export const mag = (v) => Math.hypot(v.x, v.y);
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v, s) => ({ x: v.x * s, y: v.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;

// Signed smallest difference a-b, in (-180, 180].
export const angleDiff = (a, b) => {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
};

export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Apparent wind.
// windFrom: direction the true wind blows FROM. tws: its speed.
// heading/bsp: boat course and speed through the water.
// Returns vectors (flow directions, knots) and the angles sailors care about.
export function apparentWind(windFrom, tws, heading, bsp) {
  const trueFlow = scale(dir(windFrom + 180), tws); // air velocity over ground
  const boatVel = scale(dir(heading), bsp);
  const inducedFlow = scale(boatVel, -1); // "wind you make" by moving
  const apparentFlow = add(trueFlow, inducedFlow);
  const aws = mag(apparentFlow);
  const apparentFrom = aws < 1e-9 ? windFrom : (angleOf(apparentFlow) + 180) % 360;
  return {
    trueFlow,
    inducedFlow,
    apparentFlow,
    aws,
    apparentFrom,
    twa: angleDiff(windFrom, heading), // signed: + means wind from starboard
    awa: aws < 1e-9 ? 0 : angleDiff(apparentFrom, heading),
  };
}

// ---------------------------------------------------------------------------
// Sail section aerodynamics: lift/drag coefficients vs angle of attack (deg).
// A soft cambered foil: dead zone (luffing), a linear working range,
// stall around 25°, then flat-plate behaviour out to 90°.
export function sailCoeffs(aoaDeg) {
  const a = Math.abs(aoaDeg);
  const s = Math.sign(aoaDeg) || 1;
  const ar = rad(a);

  // Below ~3° the cloth flogs and makes no useful lift.
  const luffFactor = smoothstep(1.5, 6, a);

  const clPre = 1.9 * (Math.min(a, 24) / 24) * luffFactor;
  const cdPre = 0.05 + 0.45 * Math.pow(Math.min(a, 30) / 30, 2);

  const clPost = 1.15 * Math.sin(2 * ar); // flat plate, zero again at 90°
  const cdPost = 0.1 + 1.9 * Math.sin(ar) ** 2;

  const t = smoothstep(22, 30, a); // stall transition
  return {
    cl: s * (clPre * (1 - t) + clPost * t),
    cd: cdPre * (1 - t) + cdPost * t,
    stalled: t,
    luffing: 1 - luffFactor,
  };
}

// Aerodynamic force on the sail, in "force units" (∝ AWS²), world frame.
// flow: apparent flow vector. aoaSign: +1 if flow hits the windward side
// such that lift points to leeward of the flow... callers pass the signed AoA.
export function sailForce(apparentFlow, aoaDeg) {
  const aws = mag(apparentFlow);
  if (aws < 1e-9) return { lift: { x: 0, y: 0 }, drag: { x: 0, y: 0 }, total: { x: 0, y: 0 }, coeffs: sailCoeffs(aoaDeg) };
  const c = sailCoeffs(aoaDeg);
  const q = aws * aws * 0.01; // dynamic pressure, arbitrary units
  const f = scale(apparentFlow, 1 / aws); // unit flow direction
  const perp = { x: -f.y, y: f.x }; // 90° clockwise from flow
  const lift = scale(perp, c.cl * q);
  const drag = scale(f, c.cd * q);
  return { lift, drag, total: add(lift, drag), coeffs: c };
}

// ---------------------------------------------------------------------------
// Polar model: boat speed (knots) for a ~10 m cruiser-racer.
// Idealized but shaped like the real thing: a no-go zone, a broad sweet
// spot past a beam reach, and a slow dead run.
const POLAR_SHAPE = [
  [27, 0.30], [36, 0.62], [45, 0.78], [60, 0.92], [75, 0.99],
  [90, 1.03], [105, 1.06], [120, 1.04], [135, 0.97], [150, 0.85],
  [165, 0.67], [180, 0.52],
];
const HULL_MAX = 8.4;

export function polarSpeed(twaDeg, tws) {
  const t = clamp(Math.abs(twaDeg), 0, 180);
  const shapeAt = (x) => {
    for (let i = 1; i < POLAR_SHAPE.length; i++) {
      const [x0, y0] = POLAR_SHAPE[i - 1];
      const [x1, y1] = POLAR_SHAPE[i];
      if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return POLAR_SHAPE[POLAR_SHAPE.length - 1][1];
  };
  const g = t < 27 ? POLAR_SHAPE[0][1] * Math.pow(t / 27, 1.7) : shapeAt(t);
  // Saturating response: light air is roughly linear, then hull speed bites.
  return HULL_MAX * (1 - Math.exp(-(tws * g) / (HULL_MAX * 0.9)));
}

// Best VMG angles for a given wind speed. Returns {up, down} in degrees.
export function bestVmg(tws) {
  let up = { twa: 45, vmg: 0 };
  let down = { twa: 150, vmg: 0 };
  for (let t = 28; t <= 180; t += 0.5) {
    const v = polarSpeed(t, tws);
    const vmg = v * Math.cos(rad(t));
    if (vmg > up.vmg) up = { twa: t, vmg };
    if (-vmg > down.vmg) down = { twa: t, vmg: -vmg };
  }
  return { up, down };
}

export function pointOfSail(twaDeg) {
  const t = Math.abs(twaDeg);
  if (t < 30) return "In irons — the no-go zone";
  if (t < 50) return "Close-hauled";
  if (t < 80) return "Close reach";
  if (t < 110) return "Beam reach";
  if (t < 150) return "Broad reach";
  return "Run";
}

export const fmt = (n, digits = 1) => n.toFixed(digits);
