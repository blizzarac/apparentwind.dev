// Widget 2: a sail cross-section in the apparent wind.
// One slider — angle of attack — drives streamlines, lift/drag vectors,
// and a marker on the Cl/Cd curves. Flow runs left → right.
import { sailCoeffs, rad, fmt, smoothstep, clamp } from "./model.js";
import { makeSvg, el, arrow, slider, readouts } from "./svg.js";
import { S } from "./strings.js";

const T = S.sail;

export function mountSail(root) {
  const W = 680, H = 470;
  const FX = 320, FY = 235; // foil quarter-chord point
  const CHORD = 210;

  const state = { aoa: 18 };

  const svg = makeSvg(root.querySelector(".widget-stage"), W, H);
  const css = getComputedStyle(document.documentElement);
  const col = (name) => css.getPropertyValue(name).trim();
  const C_LIFT = col("--c-true"), C_DRAG = col("--c-boat"), C_TOTAL = col("--c-force");

  el("text", { x: 24, y: FY - 4, class: "diagram-note", text: T.noteLine1 }, svg);
  el("text", { x: 24, y: FY + 12, class: "diagram-note", text: T.noteLine2 }, svg);

  // --- streamlines ----------------------------------------------------------
  const flowLayer = el("g", { class: "flow-layer" }, svg);
  const OFFSETS = [-150, -118, -86, -56, -30, 30, 56, 86, 118, 150];
  const lines = OFFSETS.map(() => el("path", { class: "streamline" }, flowLayer));
  const swirls = [0, 1, 2].map(() => el("path", { class: "swirl" }, flowLayer));

  function streamPath(y0, aoa, stalled) {
    // Lift deflects the flow downward behind the foil (that's the momentum
    // exchange lift comes from). Upwash ahead, downwash astern — all faked
    // with smooth bumps, but faked in the physically honest direction.
    const proximity = Math.exp(-((y0 / 105) ** 2));
    const cl = sailCoeffs(aoa).cl;
    const down = proximity * cl * 26;
    const isLee = y0 < 0; // lee side is above the foil (lift points up)
    let d = "";
    for (let x = 30; x <= W - 20; x += 14) {
      const after = smoothstep(FX - 80, FX + 90, x);
      const before = 1 - smoothstep(FX - 170, FX - 20, x);
      let y = FY + y0 - before * proximity * cl * 9 + after * down;
      // Keep lines from slicing through the foil itself.
      const nearFoil = Math.exp(-(((x - FX - 40) / 130) ** 2));
      if (Math.abs(y0) < 44) y += Math.sign(y0) * nearFoil * (44 - Math.abs(y0)) * 0.85;
      // Separated flow: the lee-side wake goes ragged behind a stalled sail.
      if (stalled > 0.02 && isLee && x > FX - 10) {
        y += stalled * proximity * 13 * Math.sin((x - FX) / 16 + y0 * 0.35);
      }
      d += (d ? " L " : "M ") + `${fmt(x, 1)} ${fmt(y, 1)}`;
    }
    return d;
  }

  // --- the foil -------------------------------------------------------------
  const foilG = el("g", {}, svg);
  // A thin cambered plate: sail cloth seen from above. Chord along +x,
  // camber bulging to the lee (up) side.
  const camber = 0.09 * CHORD;
  const x0 = -CHORD * 0.25, x1 = CHORD * 0.75;
  el("path", {
    class: "sail-cloth",
    d: `M ${x0} 0 Q ${(x0 + x1) / 2} ${-2 * camber} ${x1} 0`,
  }, foilG);
  el("circle", { cx: x0, cy: 0, r: 5, class: "mast-dot" }, foilG);
  el("line", { x1: x0, y1: 0, x2: x1, y2: 0, class: "chord-line" }, foilG);

  // Angle-of-attack wedge between flow and chord.
  const aoaArc = el("path", { class: "aoa-arc" }, svg);
  const aoaText = el("text", { class: "aoa-text" }, svg);

  // --- force vectors --------------------------------------------------------
  const vecLayer = el("g", {}, svg);
  const aDrag = arrow(vecLayer, { color: C_DRAG, width: 3, label: T.vecDrag });
  const aLift = arrow(vecLayer, { color: C_LIFT, width: 3, label: T.vecLift, labelAnchor: "end" });
  const aTotal = arrow(vecLayer, { color: C_TOTAL, width: 4.5, label: T.vecTotal });

  // --- mini chart: Cl and Cd vs α ------------------------------------------
  const chart = el("g", { transform: `translate(${W - 216} ${H - 166})`, class: "mini-chart" }, svg);
  const CW = 196, CH = 116;
  el("rect", { x: -10, y: -8, width: CW + 26, height: CH + 40, class: "mini-chart-bg", rx: 8 }, chart);
  el("line", { x1: 0, y1: CH, x2: CW, y2: CH, class: "axis-line" }, chart);
  const ax = (a) => (a / 50) * CW;
  const cy = (c) => CH - (c / 2.1) * CH;
  for (const t of [0, 25, 50]) {
    el("text", { x: ax(t), y: CH + 14, class: "tick-label", "text-anchor": "middle", text: `${t}°` }, chart);
  }
  let dCl = "", dCd = "";
  for (let a = 0; a <= 50; a += 1) {
    const c = sailCoeffs(a);
    dCl += (dCl ? " L " : "M ") + `${fmt(ax(a), 1)} ${fmt(cy(c.cl), 1)}`;
    dCd += (dCd ? " L " : "M ") + `${fmt(ax(a), 1)} ${fmt(cy(c.cd), 1)}`;
  }
  el("path", { d: dCl, class: "curve", stroke: C_LIFT }, chart);
  el("path", { d: dCd, class: "curve", stroke: C_DRAG }, chart);
  el("text", { x: ax(23), y: cy(1.95), class: "vec-label", fill: C_LIFT, text: T.chartLift }, chart);
  el("text", { x: ax(44), y: cy(1.45), class: "vec-label", "text-anchor": "end", fill: C_DRAG, text: T.chartDrag }, chart);
  const markCl = el("circle", { r: 4.5, class: "chart-marker", fill: C_LIFT }, chart);
  const markCd = el("circle", { r: 4.5, class: "chart-marker", fill: C_DRAG }, chart);

  // --- controls -------------------------------------------------------------
  const controls = root.querySelector(".widget-controls");
  slider(controls, {
    label: T.slAoa, min: 0, max: 50, step: 0.5, value: state.aoa, unit: "°",
    onInput: (v) => { state.aoa = v; update(); },
  });

  const stateChip = document.createElement("div");
  stateChip.className = "state-chip";
  controls.appendChild(stateChip);

  const out = readouts(root.querySelector(".widget-readouts"),
    [T.roCl, T.roCd, T.roLd]);
  const caption = root.querySelector(".widget-live");

  function update() {
    const a = state.aoa;
    const c = sailCoeffs(a);

    // Positive AoA: rotate the foil nose-up into the flow (counterclockwise
    // on screen), so the windward side faces the oncoming wind from below-left.
    foilG.setAttribute("transform", `translate(${FX + CHORD * 0.25} ${FY}) rotate(${-a})`);

    for (let i = 0; i < OFFSETS.length; i++) {
      lines[i].setAttribute("d", streamPath(OFFSETS[i], a, c.stalled));
    }
    // Recirculation curls in the separated zone.
    swirls.forEach((s, i) => {
      if (c.stalled < 0.25) { s.setAttribute("visibility", "hidden"); return; }
      s.removeAttribute("visibility");
      const sx = FX + 55 + i * 58, sy = FY - 34 - i * 9;
      const r = 11 + i * 2;
      s.setAttribute("opacity", fmt(c.stalled * 0.9, 2));
      s.setAttribute("d",
        `M ${sx - r} ${sy} a ${r} ${r} 0 1 1 ${r} ${r} a ${r * 0.62} ${r * 0.62} 0 1 0 ${r * 0.55} ${-r * 0.7}`);
    });

    // AoA wedge at the mast.
    const mx = FX, my = FY;
    const arcR = 74;
    const tipX = mx + arcR * Math.cos(rad(a)), tipY = my - arcR * Math.sin(rad(a));
    aoaArc.setAttribute("d",
      `M ${mx + arcR} ${my} A ${arcR} ${arcR} 0 0 0 ${fmt(tipX, 1)} ${fmt(tipY, 1)}`);
    aoaText.setAttribute("x", mx + arcR - 14);
    aoaText.setAttribute("y", my + 22);
    aoaText.textContent = `α = ${fmt(a, 0)}°`;

    // Forces from roughly the center of effort.
    const ce = { x: FX + 42, y: FY - camber * 0.9 };
    const K = 78;
    const lift = { x: 0, y: -c.cl * K };
    const drag = { x: c.cd * K, y: 0 };
    aLift.update(ce, { x: ce.x + lift.x, y: ce.y + lift.y });
    aDrag.update(ce, { x: ce.x + drag.x, y: ce.y + drag.y });
    aTotal.update(ce, { x: ce.x + lift.x + drag.x, y: ce.y + lift.y + drag.y });

    markCl.setAttribute("cx", ax(a)); markCl.setAttribute("cy", cy(Math.max(c.cl, 0)));
    markCd.setAttribute("cx", ax(a)); markCd.setAttribute("cy", cy(c.cd));

    const ld = c.cd > 0 ? c.cl / c.cd : 0;
    out.set(T.roCl, S.n(c.cl, 2));
    out.set(T.roCd, S.n(c.cd, 2));
    out.set(T.roLd, S.n(ld, 1));

    let label, cls, msg;
    if (c.luffing > 0.4) {
      label = T.chipLuffing; cls = "is-luffing";
      msg = T.msgLuffing;
    } else if (c.stalled > 0.5) {
      label = T.chipStalled; cls = "is-stalled";
      msg = T.msgStalled;
    } else if (c.stalled > 0.05) {
      label = T.chipEdge; cls = "is-edge";
      msg = T.msgEdge;
    } else {
      label = T.chipDrawing; cls = "is-drawing";
      msg = T.msgDrawing(S.n(ld, 0));
    }
    stateChip.textContent = label;
    stateChip.className = `state-chip ${cls}`;
    caption.innerHTML = msg;
  }

  update();
}
