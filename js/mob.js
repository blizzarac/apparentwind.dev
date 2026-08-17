// Widget 5: crew overboard. A little top-down sailing simulator driven by
// the same polar and apparent-wind model as the rest of the essay.
// Steer with ← / → (or the buttons), get back to the swimmer, arrive slowly.
import { polarSpeed, apparentWind, dir, clamp, fmt } from "./model.js";
import { readouts } from "./svg.js";
import { S } from "./strings.js";

const T = S.mob;

const TWS = 12;
const KN = 0.514;      // knots → m/s
const TIME_SCALE = 2.6; // sim seconds per real second
const SCALE = 2.6;      // px per metre
const RESCUE_RADIUS = 10; // metres
const RESCUE_SPEED = 2.0; // knots

export function mountMob(root) {
  const W = 680, H = 480;
  const stage = root.querySelector(".widget-stage");
  const canvas = document.createElement("canvas");
  canvas.className = "sim-canvas";
  canvas.width = W * 2; // crisp on hidpi
  canvas.height = H * 2;
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);

  const banner = document.createElement("div");
  banner.className = "sim-banner";
  stage.appendChild(banner);

  // --- controls -------------------------------------------------------------
  const controls = root.querySelector(".widget-controls");
  const btnRow = document.createElement("div");
  btnRow.className = "sim-buttons";
  controls.appendChild(btnRow);
  const held = { left: false, right: false };
  function steerBtn(label, key) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sim-btn";
    b.textContent = label;
    const on = (e) => { e.preventDefault(); held[key] = true; };
    const off = () => { held[key] = false; };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointerleave", off);
    b.addEventListener("pointercancel", off);
    btnRow.appendChild(b);
    return b;
  }
  steerBtn(T.btnPort, "left");
  steerBtn(T.btnStarboard, "right");
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "sim-btn sim-btn-reset";
  resetBtn.textContent = T.btnRestart;
  resetBtn.addEventListener("click", () => reset());
  btnRow.appendChild(resetBtn);

  window.addEventListener("keydown", (e) => {
    if (!inView) return;
    if (e.key === "ArrowLeft" || e.key === "a") { held.left = true; e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === "d") { held.right = true; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") held.left = false;
    if (e.key === "ArrowRight" || e.key === "d") held.right = false;
  });

  const out = readouts(root.querySelector(".widget-readouts"),
    [T.roBsp, T.roTwa, T.roDist, T.roClock]);
  const caption = root.querySelector(".widget-live");

  // --- state ----------------------------------------------------------------
  let boat, mob, phase, simClock, trail, trailTimer, windPhase;
  function reset() {
    boat = { x: 60, y: H / SCALE / 2, heading: 100, speed: 6 };
    mob = null;
    phase = "sailing"; // sailing → rescue → saved
    simClock = 0;
    trail = [];
    trailTimer = 0;
    banner.textContent = "";
    banner.className = "sim-banner";
  }
  reset();

  // Theme colors, re-read when the scheme flips.
  let theme = {};
  function readTheme() {
    const s = getComputedStyle(document.documentElement);
    const v = (n) => s.getPropertyValue(n).trim();
    theme = {
      water: v("--sim-water"), streak: v("--sim-streak"), trail: v("--sim-trail"),
      hull: v("--sim-hull"), sail: v("--sim-sail"), mob: v("--c-heel"),
      ring: v("--c-drive"), ink: v("--ink-2"),
    };
  }
  readTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readTheme);

  // --- simulation -----------------------------------------------------------
  function twaOf(heading) {
    let d = Math.abs(heading % 360);
    if (d > 180) d = 360 - d;
    return d;
  }

  function step(dt) {
    simClock += dt;
    windPhase += dt;

    const turnAuthority = clamp(boat.speed / 2.5, 0.2, 1);
    const turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    boat.heading += turn * 30 * turnAuthority * dt;

    const twa = twaOf(boat.heading);
    const target = polarSpeed(twa, TWS);
    const tau = target > boat.speed ? 4.5 : 6.5; // coasting outlasts accelerating
    boat.speed += ((target - boat.speed) / tau) * dt;
    if (turn !== 0) boat.speed *= 1 - 0.06 * dt; // turns scrub speed

    const v = dir(boat.heading);
    boat.x += v.x * boat.speed * KN * dt;
    boat.y += v.y * boat.speed * KN * dt;
    boat.x = clamp(boat.x, 6, W / SCALE - 6);
    boat.y = clamp(boat.y, 6, H / SCALE - 6);

    trailTimer += dt;
    if (trailTimer > 0.4) {
      trailTimer = 0;
      trail.push({ x: boat.x, y: boat.y });
      if (trail.length > 260) trail.shift();
    }

    if (phase === "sailing" && simClock > 7) {
      phase = "rescue";
      const back = dir(boat.heading + 155);
      mob = { x: clamp(boat.x + back.x * 12, 15, W / SCALE - 15), y: clamp(boat.y + back.y * 12, 15, H / SCALE - 15), t: simClock };
      banner.textContent = T.bannerAlarm;
      banner.className = "sim-banner is-alarm";
      setTimeout(() => { if (phase === "rescue") banner.className = "sim-banner is-alarm is-fading"; }, 2500);
    }

    if (phase === "rescue") {
      const dist = Math.hypot(boat.x - mob.x, boat.y - mob.y);
      if (dist < RESCUE_RADIUS && boat.speed < RESCUE_SPEED) {
        phase = "saved";
        const secs = Math.round(simClock - mob.t);
        banner.textContent = T.bannerSaved(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
        banner.className = "sim-banner is-saved";
      }
    }
  }

  // --- rendering ------------------------------------------------------------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.water;
    ctx.fillRect(0, 0, W, H);

    // Drifting wind streaks so the wind direction is always legible.
    ctx.strokeStyle = theme.streak;
    ctx.lineWidth = 1.5;
    const drift = (windPhase * TWS * KN * SCALE * 0.6) % 90;
    for (let x = 30; x < W; x += 72) {
      for (let y = -90; y < H; y += 90) {
        const yy = y + drift + (x % 144 === 30 ? 24 : 0);
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x, yy + 22);
        ctx.stroke();
      }
    }

    // Wake trail.
    if (trail.length > 1) {
      ctx.strokeStyle = theme.trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * SCALE, p.y * SCALE);
        else ctx.lineTo(p.x * SCALE, p.y * SCALE);
      });
      ctx.lineTo(boat.x * SCALE, boat.y * SCALE);
      ctx.stroke();
    }

    // The swimmer + rescue circle.
    if (mob) {
      const mx = mob.x * SCALE, my = mob.y * SCALE;
      ctx.strokeStyle = theme.ring;
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, RESCUE_RADIUS * SCALE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const pulse = 5 + 2.5 * Math.sin(windPhase * 4);
      ctx.strokeStyle = theme.mob;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = theme.mob;
      ctx.beginPath();
      ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // The boat: hull + auto-trimmed boom, same trim rule as the essay above.
    const bx = boat.x * SCALE, by = boat.y * SCALE;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate((boat.heading * Math.PI) / 180);
    ctx.scale(1.35, 1.35);
    ctx.fillStyle = theme.hull;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.bezierCurveTo(5.5, -6, 5.5, 6, 4.2, 12);
    ctx.lineTo(-4.2, 12);
    ctx.bezierCurveTo(-5.5, 6, -5.5, -6, 0, -13);
    ctx.fill();
    const aw = apparentWind(0, TWS, boat.heading, boat.speed);
    const awaAbs = Math.abs(aw.awa);
    const side = Math.sign(aw.awa) || 1;
    const sheet = clamp(awaAbs - 20, 6, 88) * (Math.PI / 180);
    ctx.strokeStyle = theme.sail;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-side * 15 * Math.sin(sheet), -3 + 15 * Math.cos(sheet));
    ctx.stroke();
    ctx.restore();
  }

  // --- loop, only while on screen ------------------------------------------
  windPhase = 0;
  let inView = false;
  let last = null;
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    if (!inView) { held.left = held.right = false; last = null; }
  }, { threshold: 0.15 }).observe(canvas);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!inView) return;
    if (last === null) last = now;
    const dt = Math.min((now - last) / 1000, 0.05) * TIME_SCALE;
    last = now;
    if (phase !== "saved") step(dt);
    else windPhase += dt; // keep the water alive behind the banner
    draw();
    hud();
  }
  requestAnimationFrame(frame);

  function hud() {
    const twa = twaOf(boat.heading);
    out.set(T.roBsp, `${S.n(boat.speed)} kn`);
    out.set(T.roTwa, `${S.n(twa, 0)}°`);
    const dist = mob ? Math.hypot(boat.x - mob.x, boat.y - mob.y) : null;
    out.set(T.roDist, mob ? `${S.n(dist, 0)} m` : "—");
    const secs = Math.floor(mob ? simClock - mob.t : simClock);
    out.set(T.roClock, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);

    let msg;
    if (phase === "sailing") {
      msg = T.msgSailing;
    } else if (phase === "saved") {
      msg = T.msgSaved;
    } else if (twa < 27) {
      msg = T.msgIrons;
    } else if (dist !== null && dist < 32 && boat.speed > 3) {
      msg = T.msgTooFast;
    } else {
      msg = T.msgGeneral(S.n(RESCUE_SPEED, 0));
    }
    if (caption.dataset.msg !== msg) {
      caption.dataset.msg = msg;
      caption.innerHTML = msg;
    }
  }
}
