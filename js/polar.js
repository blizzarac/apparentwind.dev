// Widget 4: the polar diagram. Speed curves for several wind strengths;
// drag around the active curve to read boat speed, and watch the VMG
// projection onto the upwind/downwind axis.
import { polarSpeed, bestVmg, dir, add, scale, angleOf, clamp, fmt, rad } from "./model.js";
import { makeSvg, el, draggable, readouts } from "./svg.js";

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
  el("text", { x: C.x + 34, y: C.y - RMAX + 26, class: "diagram-note", text: "no-go" }, grid);
  el("text", { x: C.x, y: C.y - RMAX - 22, class: "diagram-note", "text-anchor": "middle", text: "↑ upwind" }, svg);
  el("text", { x: C.x, y: C.y + RMAX + 30, class: "diagram-note", "text-anchor": "middle", text: "↓ downwind" }, svg);

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
      fill: `var(--polar-${i + 1})`, text: `${tws} kn wind`,
    }, curveLayer);
    return { tws, path, label };
  });

  // --- VMG projection + marker ---------------------------------------------
  const projDrop = el("line", { class: "vmg-drop" }, svg);
  const projAxis = el("line", { class: "vmg-axis", stroke: col("--c-drive") }, svg);
  const projLabel = el("text", { class: "vec-label", fill: col("--c-drive"), text: "VMG" }, svg);
  const radial = el("line", { class: "polar-radial" }, svg);
  const bestUpDot = el("circle", { r: 5, class: "best-dot" }, svg);
  const bestDownDot = el("circle", { r: 5, class: "best-dot" }, svg);
  const bestUpText = el("text", { class: "tick-label", text: "best VMG upwind" }, svg);
  const bestDownText = el("text", { class: "tick-label", "text-anchor": "end", text: "best VMG downwind" }, svg);

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
  chipRow.setAttribute("aria-label", "True wind speed");
  const chips = WINDS.map((tws) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = `${tws} kn`;
    b.addEventListener("click", () => { state.tws = tws; update(); });
    chipRow.appendChild(b);
    return { tws, b };
  });
  root.querySelector(".widget-controls").appendChild(chipRow);

  const out = readouts(root.querySelector(".widget-readouts"),
    ["Wind angle", "Boat speed", "VMG"]);
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
    projLabel.textContent = "VMG";

    const bu = pt(best.up.twa, polarSpeed(best.up.twa, tws));
    const bd = pt(best.down.twa, polarSpeed(best.down.twa, tws));
    bestUpDot.setAttribute("cx", fmt(bu.x, 1)); bestUpDot.setAttribute("cy", fmt(bu.y, 1));
    bestDownDot.setAttribute("cx", fmt(bd.x, 1)); bestDownDot.setAttribute("cy", fmt(bd.y, 1));
    bestUpText.setAttribute("x", fmt(bu.x + 12, 1)); bestUpText.setAttribute("y", fmt(bu.y - 8, 1));
    bestDownText.setAttribute("x", fmt(bd.x - 12, 1)); bestDownText.setAttribute("y", fmt(bd.y + 18, 1));

    out.set("Wind angle", `${fmt(twa, 0)}°`);
    out.set("Boat speed", `${fmt(v)} kn`);
    out.set("VMG", vmg >= 0
      ? `${fmt(vmg)} kn upwind`
      : `${fmt(-vmg)} kn downwind`);

    let msg;
    if (twa < 27) {
      msg = "Inside the no-go zone the polar collapses to zero — the sail can’t work here. The route upwind is the pair of dots: sail close-hauled, tack, repeat.";
    } else if (Math.abs(twa - best.up.twa) < 4) {
      msg = `The upwind groove: ${fmt(best.up.twa, 0)}° isn’t the closest you can point, but it’s the angle that makes the most progress <em>toward</em> the wind — ${fmt(best.up.vmg)} kn of VMG.`;
    } else if (twa >= 168) {
      const gain = ((best.down.vmg / Math.max(-vmg, 0.01)) - 1) * 100;
      msg = `Dead downwind: ${fmt(v)} kn. But heat it up to ${fmt(best.down.twa, 0)}° and gybe your way there instead — the extra boat speed beats the longer path by about ${fmt(gain, 0)}%.`;
    } else if (twa > 80 && twa < 130) {
      msg = `The fat part of the polar. Around here the apparent wind is still strong and fully usable — this is why a ${twa < 100 ? "beam" : "broad"} reach is the fastest point of sail.`;
    } else {
      msg = `At ${fmt(twa, 0)}° in ${tws} kn of wind this boat makes ${fmt(v)} kn. Drag around the curve, and try the other wind speeds — notice how the curves bunch up as the hull runs out of waterline.`;
    }
    caption.innerHTML = msg;
  }

  update();
}
