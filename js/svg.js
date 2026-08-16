// Tiny SVG toolkit shared by the widgets. No dependencies.
import { mag, scale, sub } from "./model.js";

const NS = "http://www.w3.org/2000/svg";

export function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function makeSvg(mount, w, h, extraClass = "") {
  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    class: `widget-svg ${extraClass}`.trim(),
    role: "img",
  });
  mount.appendChild(svg);
  return svg;
}

// A labeled arrow drawn as a group: shaft + solid head + optional text.
// Returns an object with .update(from, to) so widgets can re-aim it cheaply.
export function arrow(parent, { color, width = 2.5, dash = null, label = null, labelClass = "vec-label", labelAnchor = "start" }) {
  const g = el("g", {}, parent);
  const shaft = el("line", {
    stroke: color, "stroke-width": width, "stroke-linecap": "round",
    ...(dash ? { "stroke-dasharray": dash } : {}),
  }, g);
  const head = el("path", { fill: color }, g);
  const text = label !== null
    ? el("text", { class: labelClass, fill: color, "text-anchor": labelAnchor, text: label })
    : null;
  if (text) g.appendChild(text);

  function update(from, to, labelText = null) {
    const v = sub(to, from);
    const len = mag(v);
    if (len < 6) {
      g.setAttribute("visibility", "hidden");
      return;
    }
    g.removeAttribute("visibility");
    const u = scale(v, 1 / len);
    const headLen = Math.min(11, len * 0.5);
    const base = { x: to.x - u.x * headLen, y: to.y - u.y * headLen };
    shaft.setAttribute("x1", from.x); shaft.setAttribute("y1", from.y);
    shaft.setAttribute("x2", base.x); shaft.setAttribute("y2", base.y);
    const p = { x: -u.y, y: u.x };
    const wHalf = headLen * 0.42;
    head.setAttribute("d",
      `M ${to.x} ${to.y} L ${base.x + p.x * wHalf} ${base.y + p.y * wHalf} ` +
      `L ${base.x - p.x * wHalf} ${base.y - p.y * wHalf} Z`);
    if (text) {
      if (labelText !== null) text.textContent = labelText;
      // Nudge the label off the arrow tip, away from the shaft.
      text.setAttribute("x", to.x + u.x * 10 + p.x * 4);
      text.setAttribute("y", to.y + u.y * 10 + p.y * 4);
    }
  }
  return { g, update, setVisible: (v) => g.setAttribute("visibility", v ? "visible" : "hidden") };
}

// Convert a pointer event to SVG user-space coordinates.
export function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// Generic drag helper: calls onDrag(point) with SVG coords while dragging.
// `target` is the element that starts the drag (use a generous hit area).
export function draggable(svg, target, onDrag, onStateChange = null) {
  const move = (evt) => {
    evt.preventDefault();
    onDrag(svgPoint(svg, evt));
  };
  const up = (evt) => {
    target.releasePointerCapture?.(evt.pointerId);
    svg.removeEventListener("pointermove", move);
    if (onStateChange) onStateChange(false);
  };
  target.addEventListener("pointerdown", (evt) => {
    evt.preventDefault();
    target.setPointerCapture?.(evt.pointerId);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up, { once: true });
    svg.addEventListener("pointercancel", up, { once: true });
    if (onStateChange) onStateChange(true);
    onDrag(svgPoint(svg, evt));
  });
  target.classList.add("draggable");
}

// A labeled range slider with a live value readout. Returns the input.
export function slider(mount, { label, min, max, step = 1, value, unit = "", onInput }) {
  const wrap = document.createElement("label");
  wrap.className = "ctl-slider";
  const name = document.createElement("span");
  name.className = "ctl-name";
  name.textContent = label;
  const out = document.createElement("output");
  out.textContent = `${value}${unit}`;
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min, max, step, value });
  input.addEventListener("input", () => {
    out.textContent = `${input.value}${unit}`;
    onInput(parseFloat(input.value));
  });
  wrap.append(name, input, out);
  mount.appendChild(wrap);
  return {
    input,
    set(v) { input.value = v; out.textContent = `${v}${unit}`; },
  };
}

// A row of readout chips: make(["AWS", …]) → set("AWS", "14.2 kn").
export function readouts(mount, keys) {
  const row = document.createElement("div");
  row.className = "readouts";
  const map = {};
  for (const k of keys) {
    const chip = document.createElement("div");
    chip.className = "readout";
    const kk = document.createElement("span");
    kk.className = "readout-k";
    kk.textContent = k;
    const vv = document.createElement("span");
    vv.className = "readout-v";
    map[k] = vv;
    chip.append(kk, vv);
    row.appendChild(chip);
  }
  mount.appendChild(row);
  return { set: (k, v) => { map[k].textContent = v; } };
}

// Hull outline path for a little top-down boat, bow at (0,-len/2).
export function hullPath(len = 64, beam = 24) {
  const l = len / 2, b = beam / 2;
  return `M 0 ${-l}
    C ${b} ${-l * 0.45} ${b} ${l * 0.35} ${b * 0.8} ${l}
    L ${-b * 0.8} ${l}
    C ${-b} ${l * 0.35} ${-b} ${-l * 0.45} 0 ${-l} Z`;
}
