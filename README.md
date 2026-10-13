# Intake Lab — The Allsparks

A browser-only generator for a printable intake roller: end plates or a hub, plus a slotted flexure plug. Tubing is cut to the length shown on the page. It is not included in the STL.

This follows the same shape as Plate Lab. Geometry runs in a browser Web Worker on local Manifold WebAssembly. There is no API, database, login, or server compute. `dist/` is what Cloudflare serves.

## Run and deploy

```sh
npm ci
npm test
npm run build
```

Deploy with Wrangler to your own free Cloudflare Workers account:

```sh
npx wrangler login
npx wrangler deploy
```

`wrangler.jsonc` uses Workers Static Assets and no Worker script. The Worker name is `intake-generator`. Static asset requests are free and unlimited under Cloudflare's current policy: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

For local use, serve `dist/` over HTTP (`npx wrangler dev` after a build, or `python3 -m http.server 8000 --directory dist`). Opening `index.html` as a file URL will not load the module worker.

## What you get

- Axial layout: two end plates, tubes parallel to the shaft, a plug in each tube end.
- Radial layout: one hub, spoke tubes, one plug per spoke pinned through the hub face.
- Shaft openings for 8 mm REX (rounded hex), 8 mm hex across flats, 8 mm round, and 6 mm D-shaft. Each hole is the nominal profile plus 0.15 mm per side.
- A collar around each axial plug, a captured hex nut pocket in the plate or hub, and a cone at the plug tip so the screw head can spread the fingers.
- An option to print the plugs as one piece with the plate or hub.
- Optional barbs on the outside of each plug: ridge count, height, and length. The ramp faces the tip so the tube can slide on. The shoulder faces the base. They are not a measured pull-out test.
- Binary STL for the plate/hub and for one plug, an OpenSCAD companion, and settings JSON.
- The 3D view orbits the checked assembly. Tubes in that view are there so you can see the cut length. They are not a third solid.

Downloads stay disabled if the plate or plug is not one closed solid, or if the assembled parts overlap.

## Print

Print axial plates with the flat outer face on the bed and the collars up. The nut pocket opens on that face. Print two of the same STL. Do not mirror it. Print separate plugs with the solid base on the bed. On a radial hub, drop each nut in from the top face. Use the fastener length shown next to the preview.

The plug is undersized by the clearance you set. Retention depends on the screw spreading the fingers inside the tube. Threads are not modeled. Print one station, test the grip, and only then print the full set.

## Limits

This is a shop prototype, not a certified intake. There is no measured clamp load, no thread form, and no FTC legality check. Confirm the current game manual and have the installed intake inspected. Fit will move with filament, the slicer, and the screw you actually use.

The OpenSCAD file carries the same settings and shaft profiles so a student can keep editing. The STL is the model this page validated.

## Source

- `geometry.js`: shaft profiles, plates, plugs, assembly checks, binary STL.
- `mesh-worker.js`: browser worker.
- `app.js`: form, downloads, orbit view.
- `index.html`, `style.css`: page, copied into `dist/` by the build.
- `build.mjs`: bundle and asset copy.
- `test.mjs`: closed meshes, shaft profiles, radial hub, and rejected inputs.

The site is an independent team tool, not an official FIRST product.
