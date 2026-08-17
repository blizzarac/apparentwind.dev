// Widget 4: the polar diagram. Speed curves for several wind strengths;
// drag around the active curve to read boat speed, and watch the VMG
// projection onto the upwind/downwind axis.
import { polarSpeed, bestVmg, dir, add, scale, angleOf, clamp, fmt, rad } from "./model.js";
import { makeSvg, el, draggable, readouts } from "./svg.js";
import { S } from "./strings.js";

const T = S.polar;
const WINDS = [6, 10, 16, 22];
const PXKN = 26.5;

export function mountPolar(root) {
  const W = 680, H = 600;
  const C = { x: 180, y: H / 2 };

  const state = { tws: 10, twa: 110 };

  const svg = makeSvg(root.querySelector(".widget-stage"), W, H);
  const css = getComputedStyle(document.documentElement);
  const col = (name) => css.getPropertyValue(name).trim();

  const pt = (twa, kn) => add(C, scale(dir(twa), kn * PXKN));

  // --- grid: rings, spokes, no-go ------------------------------------------
  const grid = el("g", {}, svg);
  for (const kn of [2, 4, 6, 8]) {
    const r = kn * PXKN;
    el("path", {
      class: "polar-ring",
      d: `M ${C.x} ${C.y - r} A ${r} ${r} 0 0 1 ${C.x} ${C.y + r}`,
    }, grid);
    el("text", { x: C.x + 6, y: C.y - r - 4, class: "tick-label", text: `${kn} kn` }, grid);
  }
  const RMAX = 8.9 * PXKN;
  for (let a = 0; a <= 180; a += 30) {
    const p = pt(a, 8.9);
    el("line", { x1: C.x, y1: C.y, x2: fmt(p.x, 1), y2: fmt(p.y, 1), class: "polar-spoke" }, grid);
    if (a === 0 || a === 180) continue; // the axis notes label these ends
    const lp = pt(a, 9.6);
    el("text", {
      x: fmt(lp.x, 1), y: fmt(lp.y + 4, 1), class: "tick-label",
      "text-anchor": "start", text: `${a}°`,
    }, grid);
  }
  el("line", { x1: C.x, y1: C.y - RMAX, x2: C.x, y2: C.y + RMAX, class: "polar-axis" }, grid);
  const ng = pt(27, 8.9);
  el("path", {
    class: "nogo-zone",
    d: `M ${C.x} ${C.y} L ${C.x} ${C.y - RMAX} A ${RMAX} ${RMAX} 0 0 1 ${fmt(ng.x, 1)} ${fmt(ng.y, 1)} Z`,
  }, grid);
  el("text", { x: C.x + 34, y: C.y - RMAX + 26, class: "diagram-note", text: T.nogo }, grid);
  el("text", { x: C.x, y: C.y - RMAX - 22, class: "diagram-note", "text-anchor": "middle", text: T.upwind }, svg);
  el("text", { x: C.x, y: C.y + RMAX + 30, class: "diagram-note", "text-anchor": "middle", text: T.downwind }, svg);

  // --- curves ---------------------------------------------------------------
  const curveLayer = el("g", {}, svg);
  const curves = WINDS.map((tws, i) => {
    let d = "";
    for (let t = 8; t <= 180; t += 1.5) {
      const p = pt(t, polarSpeed(t, tws));
      d += (d ? " L " : "M ") + `${fmt(p.x, 1)} ${fmt(p.y, 1)}`;
    }
    const path = el("path", { d, class: "polar-curve", stroke: `var(--polar-${i + 1})` }, curveLayer);
    // Stagger each curve's label at its own bearing so they never stack.
    const labelAngle = 96 + i * 20;
    const lp = pt(labelAngle, polarSpeed(labelAngle, tws) + 0.6);
    const label = el("text", {
      x: fmt(lp.x, 1), y: fmt(lp.y + 4, 1), class: "vec-label polar-curve-label",
      fill: `var(--polar-${i + 1})`, text: T.curveLabel(tws),
    }, curveLayer);
    return { tws, path, label };
  });

  // --- VMG projection + marker ---------------------------------------------
  const projDrop = el("line", { class: "vmg-drop" }, svg);
  const projAxis = el("line", { class: "vmg-axis", stroke: col("--c-drive") }, svg);
  const projLabel = el("text", { class: "vec-label", fill: col("--c-drive"), text: T.vmg }, svg);
  const radial = el("line", { class: "polar-radial" }, svg);
  const bestUpDot = el("circle", { r: 5, class: "best-dot" }, svg);
  const bestDownDot = el("circle", { r: 5, class: "best-dot" }, svg);
  const bestUpText = el("text", { class: "tick-label", text: T.bestUp }, svg);
  const bestDownText = el("text", { class: "tick-label", "text-anchor": "end", text: T.bestDown }, svg);

  const markerG = el("g", {}, svg);
  const markerHit = el("circle", { r: 30, class: "handle-hit" }, markerG);
  el("circle", { r: 9, class: "handle" }, markerG);

  draggable(svg, markerHit, (p) => {
    state.twa = clamp(angleOf({ x: Math.abs(p.x - C.x), y: p.y - C.y }), 0, 180);
    update();
  });
  // Dragging anywhere on the plot moves the marker: a transparent rect on
  // top of everything (the wind-speed chips live outside the SVG).
  const bgHit = el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" }, svg);
  draggable(svg, bgHit, (p) => {
    state.twa = clamp(angleOf({ x: Math.abs(p.x - C.x), y: p.y - C.y }), 0, 180);
    update();
  });

  // --- controls -------------------------------------------------------------
  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  chipRow.setAttribute("role", "group");
  chipRow.setAttribute("aria-label", T.chipGroup);
  const chips = WINDS.map((tws) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = T.chip(tws);
    b.addEventListener("click", () => { state.tws = tws; update(); });
    chipRow.appendChild(b);
    return { tws, b };
  });
  root.querySelector(".widget-controls").appendChild(chipRow);

  const out = readouts(root.querySelector(".widget-readouts"),
    [T.roTwa, T.roBsp, T.roVmg]);
  const caption = root.querySelector(".widget-live");

  function update() {
    const { twa, tws } = state;
    const v = polarSpeed(twa, tws);
    const vmg = v * Math.cos(rad(twa));
    const best = bestVmg(tws);

    for (const c of curves) {
      c.path.classList.toggle("is-active", c.tws === tws);
      c.label.classList.toggle("is-active", c.tws === tws);
    }
    for (const c of chips) c.b.classList.toggle("is-active", c.tws === tws);

    const p = pt(twa, v);
    markerG.setAttribute("transform", `translate(${fmt(p.x, 1)} ${fmt(p.y, 1)})`);
    radial.setAttribute("x1", C.x); radial.setAttribute("y1", C.y);
    radial.setAttribute("x2", fmt(p.x, 1)); radial.setAttribute("y2", fmt(p.y, 1));

    // Project the speed vector onto the wind axis: that's VMG.
    projDrop.setAttribute("x1", fmt(p.x, 1)); projDrop.setAttribute("y1", fmt(p.y, 1));
    projDrop.setAttribute("x2", C.x); projDrop.setAttribute("y2", fmt(p.y, 1));
    projAxis.setAttribute("x1", C.x); projAxis.setAttribute("y1", C.y);
    projAxis.setAttribute("x2", C.x); projAxis.setAttribute("y2", fmt(C.y - vmg * PXKN, 1));
    projLabel.setAttribute("x", C.x - 12);
    projLabel.setAttribute("y", fmt(C.y - (vmg * PXKN) / 2 + 4, 1));
    projLabel.setAttribute("text-anchor", "end");

    const bu = pt(best.up.twa, polarSpeed(best.up.twa, tws));
    const bd = pt(best.down.twa, polarSpeed(best.down.twa, tws));
    bestUpDot.setAttribute("cx", fmt(bu.x, 1)); bestUpDot.setAttribute("cy", fmt(bu.y, 1));
    bestDownDot.setAttribute("cx", fmt(bd.x, 1)); bestDownDot.setAttribute("cy", fmt(bd.y, 1));
    bestUpText.setAttribute("x", fmt(bu.x + 12, 1)); bestUpText.setAttribute("y", fmt(bu.y - 8, 1));
    bestDownText.setAttribute("x", fmt(bd.x - 12, 1)); bestDownText.setAttribute("y", fmt(bd.y + 18, 1));

    out.set(T.roTwa, `${S.n(twa, 0)}°`);
    out.set(T.roBsp, `${S.n(v)} kn`);
    out.set(T.roVmg, vmg >= 0 ? T.vmgUp(S.n(vmg)) : T.vmgDown(S.n(-vmg)));

    let msg;
    if (twa < 27) {
      msg = T.msgNoGo;
    } else if (Math.abs(twa - best.up.twa) < 4) {
      msg = T.msgBestUp(S.n(best.up.twa, 0), S.n(best.up.vmg));
    } else if (twa >= 168) {
      const gain = ((best.down.vmg / Math.max(-vmg, 0.01)) - 1) * 100;
      msg = T.msgDeadRun(S.n(v), S.n(best.down.twa, 0), S.n(gain, 0));
    } else if (twa > 80 && twa < 130) {
      msg = T.msgFat(twa < 100);
    } else {
      msg = T.msgGeneral(S.n(twa, 0), S.n(tws, 0), S.n(v));
    }
    caption.innerHTML = msg;
  }

  update();
}
