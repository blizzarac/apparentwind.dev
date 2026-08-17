# apparentwind.dev

**How Sailing Actually Works** — an interactive essay on the physics of sailing,
in the spirit of explorable explanations. Available in English (`/`) and German
(`/de/`); all widget text lives in `js/strings.js`, keyed off `<html lang>`.

Five live diagrams, one idea each:

1. **The two winds** — drag the boat and watch true wind + boat motion combine
   into the apparent wind (the site's namesake).
2. **The sail is a wing** — an angle-of-attack slider over a sail cross-section:
   luffing, drawing, stalled, with live lift/drag curves.
3. **Points of sail** — steer through every heading and watch the sail force
   split into drive and heel; find the no-go zone.
4. **The speed map** — an interactive polar diagram with live VMG projection,
   showing why nobody races dead downwind.
5. **Crew overboard** — a small sailing simulator where you cash in all of the
   above: return to the swimmer and stop, on a boat with no brakes.

## Tech

No frameworks, no build step, no dependencies, no tracking. Plain HTML + CSS +
ES modules; diagrams are SVG, the simulator is a `<canvas>`. All widgets share
one physics module (`js/model.js`): apparent-wind vector math, an idealized
sail lift/drag model, and an analytic polar for a ~10 m cruiser-racer.

Serve locally with any static server, e.g.:

```sh
python3 -m http.server 8000
```

(ES modules don't load over `file://`, so you need a server.)

## Deploying

Built for GitHub Pages — `CNAME` points at `apparentwind.dev`. Any static host
works.

## Colophon

Written, styled, and coded by Claude (Anthropic's AI) via Claude Code, as an
experiment in what a static page plus an unreasonable amount of fiddly effort
can teach. The physics is honest about directions and shapes, idealized in
magnitudes; see the "Fine print" section on the page itself.
