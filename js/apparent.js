// Widget 1: true wind + boat motion → apparent wind, as a live vector sum.
import {
  apparentWind, angleOf, dir, scale, add, fmt, clamp,
} from "./model.js";
import {
  makeSvg, el, arrow, draggable, slider, readouts, hullPath, svgPoint,
} from "./svg.js";

export function mountApparent(root) {
  const W = 680, H = 520;
  const C = { x: W / 2, y: H / 2 + 14 };
  const PX_PER_KN = 9;

  const state = { heading: 110, bsp: 6, tws: 12, windFrom: 0 };

  const svg = makeSvg(root.querySelector(".widget-stage"), W, H);

  // --- static scenery -------------------------------------------------------
  // Faint compass ring + wind streaks from the top so "wind from north" reads.
  const scenery = el("g", { class: "scenery" }, svg);
  el("circle", { cx: C.x, cy: C.y, r: 178, class: "guide-ring" }, scenery);
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * ((W - 120) / 6);
    el("line", {
      x1: x, y1: 16, x2: x, y2: 52 + (i % 3) * 10,
      class: "wind-streak",
    }, scenery);
  }
  el("text", { x: W / 2, y: 14, class: "diagram-note", "text-anchor": "middle", text: "true wind" }, svg);

  // --- vector triangle ------------------------------------------------------
  const vecLayer = el("g", { "pointer-events": "none" }, svg);
  const css = getComputedStyle(document.documentElement);
  const col = (name) => css.getPropertyValue(name).trim();
  const C_TRUE = col("--c-true"), C_BOAT = col("--c-boat"), C_APP = col("--c-apparent");

  const aTrue = arrow(vecLayer, { color: C_TRUE, width: 3, label: "true wind" });
  const aBoat = arrow(vecLayer, { color: C_BOAT, width: 3, label: "wind you make" });
  const aTrueGhost = arrow(vecLayer, { color: C_TRUE, width: 1.6, dash: "4 5" });
  const aBoatGhost = arrow(vecLayer, { color: C_BOAT, width: 1.6, dash: "4 5" });
  const aApp = arrow(vecLayer, { color: C_APP, width: 4.5, label: "apparent wind" });

  // --- the boat (drawn beneath the vectors) --------------------------------
  const boatG = el("g", {}, svg);
  svg.insertBefore(boatG, vecLayer);
  el("path", { d: hullPath(88, 30), class: "hull" }, boatG);
  el("line", { x1: 0, y1: 30, x2: 0, y2: -34, class: "centerline" }, boatG);
  // Masthead wind indicator: a little fly that streams with the apparent wind.
  const fly = el("path", { class: "burgee", d: "M 0 0 L 0 -20 L 7 -16 L 0 -12" }, boatG);

  // Drag handle ahead of the bow.
  const handleG = el("g", {}, svg);
  const handleHit = el("circle", { r: 26, class: "handle-hit" }, handleG);
  el("circle", { r: 9, class: "handle" }, handleG);
  el("path", { class: "handle-glyph", d: "M -4 -1.5 L 0 -6 L 4 -1.5 M -4 1.5 L 0 6 L 4 1.5" }, handleG);

  draggable(svg, handleHit, (p) => {
    state.heading = Math.round(angleOf({ x: p.x - C.x, y: p.y - C.y }));
    update();
  });
  // Dragging the hull itself also steers — a bigger target on touch screens.
  const hullHit = el("circle", { cx: 0, cy: 0, r: 52, class: "handle-hit" }, boatG);
  draggable(svg, hullHit, (p) => {
    state.heading = Math.round(angleOf({ x: p.x - C.x, y: p.y - C.y }));
    update();
  });

  // --- controls + readouts --------------------------------------------------
  const controls = root.querySelector(".widget-controls");
  slider(controls, {
    label: "Boat speed", min: 0, max: 16, step: 0.5, value: state.bsp, unit: " kn",
    onInput: (v) => { state.bsp = v; update(); },
  });
  slider(controls, {
    label: "True wind", min: 2, max: 25, step: 0.5, value: state.tws, unit: " kn",
    onInput: (v) => { state.tws = v; update(); },
  });

  const out = readouts(root.querySelector(".widget-readouts"),
    ["True wind", "Boat speed", "Apparent wind", "Apparent angle"]);
  const caption = root.querySelector(".widget-live");

  function update() {
    const aw = apparentWind(state.windFrom, state.tws, state.heading, state.bsp);

    boatG.setAttribute("transform", `translate(${C.x} ${C.y}) rotate(${state.heading})`);
    const hp = add(C, scale(dir(state.heading), 118));
    handleG.setAttribute("transform", `translate(${hp.x} ${hp.y}) rotate(${state.heading})`);

    const pTrue = add(C, scale(aw.trueFlow, PX_PER_KN));
    const pBoat = add(C, scale(aw.inducedFlow, PX_PER_KN));
    const pApp = add(C, scale(aw.apparentFlow, PX_PER_KN));
    aTrue.update(C, pTrue);
    aBoat.update(C, pBoat);
    aTrueGhost.update(pBoat, pApp);   // parallelogram completion
    aBoatGhost.update(pTrue, pApp);
    aApp.update(C, pApp);

    // The masthead fly streams downwind of the apparent wind (boat frame).
    fly.setAttribute("transform",
      `translate(0 -14) rotate(${angleOf(aw.apparentFlow) - state.heading})`);

    out.set("True wind", `${fmt(state.tws)} kn`);
    out.set("Boat speed", `${fmt(state.bsp)} kn`);
    out.set("Apparent wind", `${fmt(aw.aws)} kn`);
    const side = aw.awa >= 0 ? "starboard" : "port";
    out.set("Apparent angle", `${fmt(Math.abs(aw.awa), 0)}° ${side}`);

    // A sentence that names what the reader is seeing right now.
    const twaAbs = Math.abs(aw.twa);
    const shift = Math.abs(aw.awa) - twaAbs;
    let msg;
    if (state.bsp < 0.25) {
      msg = "The boat is stopped, so the apparent wind <em>is</em> the true wind. Speed up and watch them split apart.";
    } else if (twaAbs < 25) {
      msg = "Pointing almost dead upwind: your own motion just adds to the true wind on the nose. Sails can’t work here — this is the no-go zone.";
    } else if (twaAbs > 155 && state.bsp > 0.5) {
      msg = `Running downwind, your boat speed <em>subtracts</em>: only ${fmt(aw.aws)} kn of apparent wind is left to work with. This is why dead downwind feels calm — and is slow.`;
    } else if (shift < -8) {
      msg = `The apparent wind has swung ${fmt(-shift, 0)}° <em>forward</em> of the true wind and blows at ${fmt(aw.aws)} kn. The faster you go, the more wind seems to come from ahead.`;
    } else {
      msg = `True wind ${fmt(state.tws)} kn at ${fmt(twaAbs, 0)}° off the bow; moving at ${fmt(state.bsp)} kn bends it to ${fmt(aw.aws)} kn at ${fmt(Math.abs(aw.awa), 0)}°. The sail only ever meets this teal vector.`;
    }
    caption.innerHTML = msg;
  }

  update();
}
