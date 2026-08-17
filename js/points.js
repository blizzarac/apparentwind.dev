// Widget 3: points of sail. Drag the boat's heading around a fixed wind;
// the sail trims itself, and the aerodynamic force splits into the part
// that drives you forward and the part that just heels you over.
import {
  apparentWind, sailForce, polarSpeed, pointOfSail,
  angleOf, dir, add, scale, dot, clamp, fmt,
} from "./model.js";
import { makeSvg, el, arrow, draggable, readouts, hullPath } from "./svg.js";
import { S } from "./strings.js";

const T = S.points;
const TWS = 12;

export function mountPoints(root) {
  const W = 680, H = 640;
  const C = { x: W / 2, y: H / 2 + 10 };
  const RING = 236;

  const state = { heading: 100 };

  const svg = makeSvg(root.querySelector(".widget-stage"), W, H);
  const css = getComputedStyle(document.documentElement);
  const col = (name) => css.getPropertyValue(name).trim();

  // --- scenery: wind, no-go cone, ring, labels ------------------------------
  const scenery = el("g", {}, svg);
  for (let i = 0; i < 7; i++) {
    const x = 100 + i * ((W - 200) / 6);
    el("line", { x1: x, y1: 12, x2: x, y2: 40 + (i % 3) * 8, class: "wind-streak" }, scenery);
  }
  el("text", { x: W / 2, y: 12, class: "diagram-note", "text-anchor": "middle", text: T.trueWindNote }, svg);

  const cone = 38;
  const cl = add(C, scale(dir(-cone), RING));
  const cr = add(C, scale(dir(cone), RING));
  el("path", {
    class: "nogo-zone",
    d: `M ${C.x} ${C.y} L ${fmt(cl.x, 1)} ${fmt(cl.y, 1)} A ${RING} ${RING} 0 0 1 ${fmt(cr.x, 1)} ${fmt(cr.y, 1)} Z`,
  }, scenery);
  el("circle", { cx: C.x, cy: C.y, r: RING, class: "guide-ring" }, scenery);

  const LABELS = [
    [0, T.ring.nogo], [45, T.ring.closehauled], [-45, T.ring.closehauled],
    [67, T.ring.closereach], [-67, T.ring.closereach], [90, T.ring.beamreach], [-90, T.ring.beamreach],
    [125, T.ring.broadreach], [-125, T.ring.broadreach], [180, T.ring.run],
  ];
  for (const [a, name] of LABELS) {
    const p = add(C, scale(dir(a), RING + 34));
    el("text", {
      x: fmt(p.x, 1), y: fmt(p.y, 1), class: "ring-label", "text-anchor": "middle",
      ...(a === 0 ? { class: "ring-label ring-label-nogo" } : {}),
      text: name,
    }, scenery);
  }

  // --- boat + sail ----------------------------------------------------------
  const boatG = el("g", {}, svg);
  el("path", { d: hullPath(116, 40), class: "hull" }, boatG);
  el("line", { x1: 0, y1: 44, x2: 0, y2: -46, class: "centerline" }, boatG);
  const sailCloth = el("path", { class: "sail-cloth sail-cloth-plan" }, boatG);
  const boom = el("line", { class: "boom" }, boatG);
  el("circle", { cx: 0, cy: -10, r: 4, class: "mast-dot" }, boatG);

  const hullHit = el("circle", { r: 78, class: "handle-hit" }, boatG);

  // Drag handle out on the ring.
  const handleG = el("g", {}, svg);
  const handleHit = el("circle", { r: 30, class: "handle-hit" }, handleG);
  el("circle", { r: 10, class: "handle" }, handleG);
  el("path", { class: "handle-glyph", d: "M -4.5 -2 L 0 -7 L 4.5 -2 M -4.5 2 L 0 7 L 4.5 2" }, handleG);

  const steer = (p) => {
    const v = { x: p.x - C.x, y: p.y - C.y };
    if (Math.hypot(v.x, v.y) < 24) return; // too close to center to mean anything
    state.heading = Math.round(angleOf(v));
    update();
  };
  draggable(svg, handleHit, steer);
  draggable(svg, hullHit, steer);

  // --- vectors --------------------------------------------------------------
  const vecLayer = el("g", { "pointer-events": "none" }, svg);
  const aApp = arrow(vecLayer, { color: col("--c-apparent"), width: 3, label: T.vecApparent });
  const aTotal = arrow(vecLayer, { color: col("--c-force"), width: 3, dash: "5 5", label: T.vecForce });
  const aDrive = arrow(vecLayer, { color: col("--c-drive"), width: 4.5, label: T.vecDrive });
  const aHeel = arrow(vecLayer, { color: col("--c-heel"), width: 4.5, label: T.vecHeel });

  // --- meters + readouts ----------------------------------------------------
  const meters = document.createElement("div");
  meters.className = "meters";
  root.querySelector(".widget-controls").appendChild(meters);
  function meter(name, cssVar) {
    const row = document.createElement("div");
    row.className = "meter";
    row.innerHTML =
      `<span class="meter-name">${name}</span>` +
      `<span class="meter-track"><span class="meter-fill" style="background:var(${cssVar})"></span></span>` +
      `<span class="meter-val"></span>`;
    meters.appendChild(row);
    return {
      fill: row.querySelector(".meter-fill"),
      val: row.querySelector(".meter-val"),
    };
  }
  const mDrive = meter(T.meterDrive, "--c-drive");
  const mHeel = meter(T.meterHeel, "--c-heel");

  const posChip = document.createElement("div");
  posChip.className = "state-chip is-pos";
  root.querySelector(".widget-controls").appendChild(posChip);

  const out = readouts(root.querySelector(".widget-readouts"),
    [T.roTwa, T.roBsp, T.roAws, T.roSheet]);
  const caption = root.querySelector(".widget-live");

  function update() {
    const h = state.heading;
    const aw = apparentWind(0, TWS, h, polarSpeed(angDiffAbs(h), TWS));
    const awaAbs = Math.abs(aw.awa);
    const side = Math.sign(aw.awa) || 1; // +1: wind from starboard

    // Auto-trim: ease the boom until the sail meets the apparent wind at a
    // healthy ~20° — until the boom runs out of travel near a dead run.
    const sheet = clamp(awaAbs - 20, 6, 88);
    const aoa = awaAbs - sheet;
    const force = sailForce(aw.apparentFlow, side * aoa);

    const bsp = polarSpeed(angDiffAbs(h), TWS);
    const fwd = dir(h);
    const abeam = { x: -fwd.y, y: fwd.x }; // starboard beam
    const drive = dot(force.total, fwd);
    const heel = Math.abs(dot(force.total, abeam));

    // --- draw ---
    boatG.setAttribute("transform", `translate(${C.x} ${C.y}) rotate(${h})`);
    const hp = add(C, scale(dir(h), RING));
    handleG.setAttribute("transform", `translate(${hp.x} ${hp.y}) rotate(${h})`);

    // Boom swings to leeward; sail cloth bows out beyond it.
    const boomLen = 62;
    const bx = -side * boomLen * Math.sin(rad(sheet));
    const by = -10 + boomLen * Math.cos(rad(sheet));
    boom.setAttribute("x1", 0); boom.setAttribute("y1", -10);
    boom.setAttribute("x2", fmt(bx, 1)); boom.setAttribute("y2", fmt(by, 1));
    const bulge = 12 + 10 * (1 - Math.min(aoa, 20) / 20);
    const midx = bx / 2 - side * bulge, midy = (-10 + by) / 2;
    sailCloth.setAttribute("d", `M 0 -10 Q ${fmt(midx, 1)} ${fmt(midy, 1)} ${fmt(bx, 1)} ${fmt(by, 1)}`);

    // Apparent wind arrow flying toward the boat.
    const af = scale(aw.apparentFlow, 1 / Math.max(aw.aws, 1e-9));
    const tail = add(C, scale(af, -170));
    const head = add(C, scale(af, -78));
    aApp.update(tail, head);

    const FS = 30;
    const pTotal = add(C, scale(force.total, FS));
    aTotal.update(C, pTotal);
    aDrive.update(C, add(C, scale(fwd, drive * FS)));
    // The heel component shoves the boat to leeward.
    aHeel.update(C, add(C, scale(abeam, -side * heel * FS)));

    const MAXF = 6.5;
    mDrive.fill.style.width = `${clamp((Math.max(drive, 0) / MAXF) * 100, 0, 100)}%`;
    mDrive.val.textContent = drive > 0.02 ? `${Math.round((drive / MAXF) * 100)}%` : "—";
    mHeel.fill.style.width = `${clamp((heel / MAXF) * 100, 0, 100)}%`;
    mHeel.val.textContent = heel > 0.02 ? `${Math.round((heel / MAXF) * 100)}%` : "—";

    const twaAbs = angDiffAbs(h);
    posChip.textContent = S.pos[pointOfSail(twaAbs)];
    out.set(T.roTwa, `${S.n(twaAbs, 0)}°`);
    out.set(T.roBsp, `${S.n(bsp)} kn`);
    out.set(T.roAws, `${S.n(aw.aws)} kn`);
    out.set(T.roSheet, `${S.n(sheet, 0)}°`);

    let msg;
    if (twaAbs < 30) msg = T.msgNoGo;
    else if (twaAbs < 55) msg = T.msgCloseHauled;
    else if (twaAbs < 105) msg = T.msgReach;
    else if (twaAbs < 150) msg = T.msgBroad;
    else msg = T.msgRun;
    caption.innerHTML = msg;
  }

  update();
}

function angDiffAbs(heading) {
  let d = Math.abs(heading % 360);
  if (d > 180) d = 360 - d;
  return d;
}

function rad(d) { return (d * Math.PI) / 180; }
