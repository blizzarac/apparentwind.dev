import { mountApparent } from "./apparent.js";
import { mountSail } from "./sail.js";
import { mountPoints } from "./points.js";
import { mountPolar } from "./polar.js";
import { mountMob } from "./mob.js";

const widgets = {
  "widget-apparent": mountApparent,
  "widget-sail": mountSail,
  "widget-points": mountPoints,
  "widget-polar": mountPolar,
  "widget-mob": mountMob,
};

for (const [id, mount] of Object.entries(widgets)) {
  const root = document.getElementById(id);
  if (root) mount(root);
}
