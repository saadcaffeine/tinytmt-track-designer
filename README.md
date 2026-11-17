# TinyTMT track designer — by SalvageGarden Makerspace

A browser-based layout tool for **Mini TMT obstacle courses**: scaled-down, motorised, 3D-printed versions of the open-source *Toddler Mobility Trainer* (TMT) wheelchair for kids, raced remotely around a course. The obstacles stand in for the everyday barriers wheelchair users face. The course is used for corporate team-building and outreach, and it raises awareness and funds for SalvageGarden's assistive-tech projects.

Tracks are built from 3D-printable pieces in the **Tamiya Mini 4WD form factor** (115 mm lane, 50 mm walls), based on rucdoc's single-lane packs:

- [Mini 4WD Single Lane Modular Ramp Set](https://makerworld.com/en/models/1134169-mini-4wd-single-lane-modular-ramp-set)
- [Mini4wd Single Lane Curve Track Pack](https://makerworld.com/en/models/1132759-mini4wd-single-lane-curve-track-pack)

It's plain HTML/CSS/JS with no build step and no dependencies, and it works offline.

## Features

- A 1.5 m × 2 m workspace grid with a 50 % overflow area around it. Sizes are configurable.
- Click to place, or drag pieces from the palette. Pieces snap to the grid or to the nearest open track end.
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
- An add-on hook, with a placeholder **View in 3D** button.

## Sample tracks

Five sample layouts ship with the app (**? menu → Sample tracks…**) and as files in `examples/`:

| Track | What it teaches | Pieces |
|---|---|---|
| Rubber Duck Lagoon Loop | Beginner oval | 12 |
| Sprocket Slalom Speedway | Swerves — steering precision | 16 |
| Curb Cut Canyon Climb | Ramp up, raised deck, ramp down | 18 + 2 supports |
| Big Wheel Boulevard | Double width, two chairs side by side | 11 (double) |
| Figure Eight Overpass Speedway | Over/under crossing using lower-level straights | 24 + 4 supports |

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
3. Open `https://<user>.github.io/<repo>/`. After the first visit, the service worker (`sw.js`) caches the app for offline use. Bump `VERSION` in `sw.js` when you release changes.

`tinytmt-standalone.html` is a single-file build that you can open straight from disk with no server.
To rebuild it after changing anything, run `python3 tools/build_standalone.py`.

## Project layout

```
index.html                 app shell
css/styles.css
js/parts.js                parts catalogue (edit / extend here)
js/geometry.js             piece geometry (poses, arcs, hit tests)
js/blueprint.js            blueprint PNG + thumbnails
js/names.js                random title generator
js/samples.js              built-in sample tracks
examples/                  sample tracks as .tinytmt.json
js/addons.js               add-on registry and API docs
js/app.js                  editor
addons/view3d-placeholder.js
sw.js, manifest.webmanifest, icon.svg
tools/build_standalone.py
```

## Writing an add-on

```js
TinyTMT.addons.register({
  id: 'view3d', label: 'View in 3D', icon: '🧊',
  run(api) {
    const { pieces } = api.getDerived(); // outlines, centre lines, z / zExit per piece
    // build a three.js scene here…
  }
});
```

Load the script after `js/app.js` in `index.html`. See `js/addons.js` for the full API. The MIT-licensed [Mini4WD Track Planner](https://github.com/filippocobelli/Mini4WD-Track-Manager) has a 3D engine that would be worth looking at for the 3D view.

## Prior art

We looked at existing tools before building this one. The closest match is [Mini4WD Track Planner](https://github.com/filippocobelli/Mini4WD-Track-Manager) (MIT). It targets Tamiya 2-lane kits and adds pieces by appending them to the chain; it doesn't have a grid or drag-and-drop placement. We wanted a single-lane, grid-based, keyboard-driven designer with no dependencies, so TinyTMT is a separate, smaller tool.

## License

The code is MIT-licensed (see `LICENSE`). The 3D models belong to their authors and are covered by their own licences on MakerWorld.
