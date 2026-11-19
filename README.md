# TinyTMT track designer — by SalvageGarden Makerspace

**▶ Live app: [saadcaffeine.github.io/tinytmt-track-designer](https://saadcaffeine.github.io/tinytmt-track-designer/)** — runs in any modern browser, works offline once loaded, and can be installed as an app.

A browser-based layout tool for **Mini TMT obstacle courses**: scaled-down, motorised, 3D-printed versions of the open-source *Toddler Mobility Trainer* (TMT) wheelchair for kids, raced remotely around a course. The obstacles stand in for the everyday barriers wheelchair users face. The course is used for corporate team-building and outreach, and it raises awareness and funds for SalvageGarden's assistive-tech projects.

Tracks are built from 3D-printable pieces in the **Tamiya Mini 4WD form factor** (115 mm lane, 50 mm walls), based on rucdoc's single-lane packs:

- [Mini 4WD Single Lane Modular Ramp Set](https://makerworld.com/en/models/1134169-mini-4wd-single-lane-modular-ramp-set)
- [Mini4wd Single Lane Curve Track Pack](https://makerworld.com/en/models/1132759-mini4wd-single-lane-curve-track-pack)

It's plain HTML/CSS/JS with no build step, and it works offline. The only third-party code is a trimmed copy of [three.js](https://threejs.org) for the optional 3D view, which ships in `vendor/` and loads only when you open that view.

## Features

- A 1.5 m × 2 m workspace grid with a 50 % overflow area around it. Sizes are configurable.
- Click to place, or drag pieces from the palette. Pieces snap to the grid or to the nearest open track end.
- **Auto loop:** one click (or `L`) suggests pieces that close your track, greyed out when the ends are too far apart.
- **Colour-coded families:** straights, each curve radius and ramps each have their own colour in the palette, on the canvas and in the BoM. Curves are grouped by inner radius, widest turn (90°) first.
- **Arrow keys:** ↑/↓ cycle through curves and ←/→ through straight lengths. The default pieces are the 250 mm straight and the 45° curve.
- **Enter** adds the current piece to the end you last built, so you can lay a whole track from the keyboard.
- Select a piece and press an arrow key to swap it for another size. The rest of the chain moves to fit.
- Single or double width (two lanes with no separator), plus left/right curves and ramps with automatic support counting.
- Live totals for track length, piece count, estimated FDM print time and estimated PETG (grams and metres of filament).
- Warnings for overlaps, closed loops and open ends, pieces outside the workspace, and joints where widths don't match.
- A bill of materials grouped by printable part, with a CSV export and links to the source models.
- Random kart-racing-style track titles. Click the title to edit it, or press 🎲 for a new one.
- Save and load designs in the browser (localStorage, offline). You can also import and export `.tinytmt.json` files.
- **Blueprint PNG** export at any stage, with a title block, dimensions, a scale bar and the BoM.
- Settings for the workspace, grid, snapping, track geometry, print estimation and the parts catalogue (show/hide pieces, arrow-key cycles, slicer overrides, custom pieces).
- **View in 3D**: a live 3D preview with an exploded view, a chair-height ride-along camera, and PNG / GLB / STL export. It is built as an add-on, so you can write your own the same way.

## Sample tracks

Eight sample layouts ship with the app (**? menu → Sample tracks…**) and as files in `examples/`:

| Track | What it shows | Pieces |
|---|---|---|
| Rubber Duck Lagoon Loop | Beginner oval | 12 |
| Sprocket Slalom Speedway | Swerves — steering precision | 16 |
| Curb Cut Canyon Climb | Ramp up, raised deck, ramp down | 18 + 2 supports |
| Big Wheel Boulevard | Double width, two chairs side by side | 11 (double) |
| Figure Eight Overpass Speedway | Over/under crossing using lower-level straights | 24 + 4 supports |
| Kerbside Notch Circuit | L-shape with an inside corner, closed by S121 adapters | 17 |
| Everyday Barriers Loop | All five obstacle inserts | 14 |
| Chamfer Plaza Sprint | 45° cut corners kept on grid by D141 diagonals | 16 |

## Closure adapters

With only 50 mm-step straights, a loop closes only if it is a rounded shape turning one way, or symmetric. These odd-length straights unlock more layouts. **The print models are still to be designed and published.**

| Part | Length | Why |
|---|---|---|
| S121 | 121 mm | One single-lane track width. Every inside corner (a turn against the loop's direction, as in L, U or T shapes) leaves exactly one track width to make up. |
| S236 | 236 mm | The same for double width. |
| D71 | 70.7 mm (50√2) | At 45° it moves exactly 50 mm on both axes. |
| D141 | 141.4 mm (100√2) | C45 + D141 + C45 lands exactly 100 mm beyond a plain C90 corner on both axes, so chamfered corners stay on the 50 mm grid. |

## Obstacle inserts

Drop-in replacements for a 250 mm straight, so they never affect whether a loop closes. Each one recreates an everyday barrier that wheelchair users meet. **The print models are still to be designed and published**, and the material estimates include a nominal extra allowance per insert.

| Part | Barrier |
|---|---|
| Doorway pinch | Lane narrows to about 90 mm for 40 mm, like a narrow doorway |
| Threshold bump | Low raised strip across the lane, like a door sill |
| Rough surface | Textured floor, like gravel or cobbles |
| Kerb step (no curb cut) | Raised kerb block across the lane — pair with ramps to show why curb cuts matter |
| Cross-slope | Floor tilts sideways, like a driveway crossing a pavement |

## Auto loop

**Auto loop** (toolbar, or press `L`) finds pieces that join the two loose ends of your track and previews up to three options. Use ←/→ to compare them, Enter to add one, and Esc to cancel.

The button is greyed out, with the reason shown on hover, when a closure can't work:
- there aren't exactly two loose ends on one run of track;
- the ends are different widths or at different heights (it doesn't add ramps);
- the ends are **too far apart**: further than the allowed number of added pieces could reach, counting the curves needed to line the ends up. Raise the limit under **Settings → Auto loop**.

How it works: every curve turns a multiple of 15°, so the solver first lists curve sequences that produce the right total turn. With the curves fixed, the direction of every straight run is known, so closing the gap becomes two small equations that it solves using the available straight lengths (and closure adapters, if allowed). Candidates are ranked by piece count, adapters used and whether they reuse curve sizes already in the design, then checked for overlaps and workspace limits. It runs in a background Web Worker with no dependencies, so it works offline.

## View in 3D

Press **🧊 View in 3D** in the top bar. The 3D view is rebuilt from the design, so it always matches the 2D plan. Floors and walls come from the track settings, ramps tilt between their entry and exit heights, supports appear under every raised joint (the same ones the BoM counts), and obstacle inserts appear as raised yellow shapes.

| Control | What it does |
|---|---|
| Drag / right-drag / scroll | Orbit, pan and zoom |
| **Iso · Top · Side** (`1` `2` `3`) | Camera presets that frame the whole track |
| **▶ Ride along** (`R`) | Rides the connected track at Mini TMT chair eye height. It loops on a closed track. |
| **Explode** (`E`) | Pulls the pieces apart so you can see the joints and supports |
| **Export → Image (.png)** | Saves the current view |
| **Export → 3D scene (.glb)** | For Blender, online viewers or AR |
| **Export → Preview mesh (.stl)** | Z-up and in millimetres. Commit it to a repo and GitHub shows it in 3D. It is a preview of the layout, **not** the print files. |
| `Esc` | Stops the ride, or closes the 3D view |

The 3D view uses [three.js](https://threejs.org), the same WebGL library GitHub uses for its STL viewer. To keep the app working offline, and to avoid a CDN, `vendor/three-view3d.min.js` contains only the parts of three.js the viewer needs (≈650 kB, ≈165 kB gzipped). It is fetched the first time you open the 3D view. The standalone single-file build embeds it as well. To rebuild it, or to upgrade the three.js version, run `tools/three-bundle/build.sh` (it needs Node). Edit `tools/three-bundle/entry.js` if an add-on needs more classes.

## Keyboard

| Action | Keys |
|---|---|
| Place / Select tool | `P` / `V` |
| Cycle curves / straights | `↑ ↓` / `← →` |
| Rotate | `R` / `Shift R` |
| Flip curve direction | `F` |
| Single ↔ double width | `W` |
| Add piece at active end | `Enter` |
| Delete | `Del` / `Backspace` |
| Undo / Redo | `Ctrl Z` / `Ctrl Shift Z` |
| Save / Open / Blueprint PNG | `Ctrl S` / `Ctrl O` / `Ctrl E` |
| Pan / Zoom | Space-drag or right-drag / wheel |
| Fit workspace / fit track | `0` / `9` |

## Accuracy of parts and estimates

Some piece dimensions are **nominal** and are marked that way in the app: the curve inner radii and the straight lengths outside the ramp set. Ramp geometry is derived from the set's 250/150 mm beds and its 246/147 mm lower-level sections, which gives a slope of about 10° and a rise of about 45 mm per 250 mm bed. Measure your STLs and correct the values in **Settings → Parts**, or edit `js/parts.js`.

Material and time are estimated from piece geometry: floor and wall volume × solidity × PETG density, then divided by a print throughput in g/h. For exact BoM numbers, enter your slicer's grams and minutes per part in **Settings → Parts**.

## Deploy on GitHub Pages

1. Push this folder to a repository (the files live at the repo root).
2. Go to **Settings → Pages → Deploy from a branch**, then choose `main` and `/ (root)`.
3. Open `https://<user>.github.io/<repo>/` (this repo is live at https://saadcaffeine.github.io/tinytmt-track-designer/). After the first visit, the service worker (`sw.js`) caches the app for offline use. Bump `VERSION` in `sw.js` when you release changes.

`tinytmt-standalone.html` is a single-file build that you can open straight from disk with no server.
To rebuild it after changing anything, run `python3 tools/build_standalone.py`.

## Project layout

```
index.html                 app shell
css/styles.css
js/parts.js                parts catalogue (edit / extend here)
js/geometry.js             piece geometry (poses, arcs, hit tests)
js/marks.js                obstacle insert markings
js/solver.js               auto-loop solver (runs in a Web Worker)
js/blueprint.js            blueprint PNG + thumbnails
js/names.js                random title generator
js/samples.js              built-in sample tracks
examples/                  sample tracks as .tinytmt.json
js/addons.js               add-on registry and API docs
js/app.js                  editor
addons/view3d.js           View in 3D add-on (three.js)
vendor/three-view3d.min.js three.js slice used by the 3D view (MIT)
sw.js, manifest.webmanifest, icon.svg
tools/build_standalone.py
tools/three-bundle/        entry + build script for the three.js slice
```

## Writing an add-on

```js
TinyTMT.addons.register({
  id: 'view3d', label: 'View in 3D', icon: '🧊',
  run(api) {
    const { pieces } = api.getDerived(); // pose, outline, centre line, z / zExit, colours per piece
    api.toast(`${pieces.length} pieces`);
  }
});
```

Load the script after `js/app.js` in `index.html`. See `js/addons.js` for the full API, and `addons/view3d.js` for a complete example. Also add the new file to `FILES` in `sw.js` so it works offline.

## Prior art

We looked at existing tools before building this one. The closest match is [Mini4WD Track Planner](https://github.com/filippocobelli/Mini4WD-Track-Manager) (MIT). It targets Tamiya 2-lane kits and adds pieces by appending them to the chain; it doesn't have a grid or drag-and-drop placement. We wanted a single-lane, grid-based, keyboard-driven designer with no dependencies, so TinyTMT is a separate, smaller tool.

## License

The code is MIT-licensed (see `LICENSE`). three.js is © the three.js authors, under the MIT licence. The 3D models belong to their authors and are covered by their own licences on MakerWorld.
