/*
 * TinyTMT track designer — parts catalogue
 *
 * Pieces follow the Tamiya Mini 4WD form factor (115 mm lane, 50 mm walls)
 * and the two rucdoc single-lane packs on MakerWorld:
 *   - Mini 4WD Single Lane Modular Ramp Set   https://makerworld.com/en/models/1134169
 *   - Mini4wd Single Lane Curve track pack    https://makerworld.com/en/models/1132759
 *
 * NOTE: dimensions marked `nominal` are best estimates from the model
 * descriptions (e.g. "IR" = inner radius, 250/150 mm ramp beds, 246/147 mm
 * lower-level sections). Measure your printed parts / STLs and adjust in
 * Settings → Parts, or edit this file and open a pull request.
 *
 * Fields
 *   id        unique id (also used in saved designs and the BoM)
 *   name      display name
 *   group     palette group: 'straight' | 'curve' | 'ramp'
 *   type      geometry: 'straight' | 'curve'
 *   length    straight: plan (top-view) length in mm
 *   ir        curve: inner radius in mm (inside edge of the track)
 *   angle     curve: sweep in degrees
 *   style     curve: 'smooth' | 'digital' (faceted)
 *   rise      mm of elevation change across the piece (ramps)
 *   bedLength ramps: actual (sloped) length of the track bed
 *   bomAs     print this part id instead (e.g. a ramp bed is a normal straight)
 *   source    'ramp' | 'curve' | 'custom'
 *   cycleStraight / cycleCurve  included in ←/→ or ↑/↓ arrow cycling
 *   gramsOverride / minutesOverride  optional slicer values per single-width piece
 */
(function (root) {
  const SRC = {
    ramp: {
      label: 'Single Lane Modular Ramp Set (rucdoc)',
      url: 'https://makerworld.com/en/models/1134169-mini-4wd-single-lane-modular-ramp-set'
    },
    curve: {
      label: 'Single Lane Curve Track Pack (rucdoc)',
      url: 'https://makerworld.com/en/models/1132759-mini4wd-single-lane-curve-track-pack'
    },
    straight: {
      label: 'Single Lane Mini 4wd Track, 50–400 mm (rucdoc)',
      url: 'https://thangs.com/designer/rucdoc/3d-model/Single%20Lane%20Mini%204wd%20Track-921509'
    },
    adapter: {
      label: 'TinyTMT closure adapter (model to be published)',
      url: 'https://github.com/saadcaffeine/tinytmt-track-designer#closure-adapters'
    },
    obstacle: {
      label: 'TinyTMT obstacle insert (model to be published)',
      url: 'https://github.com/saadcaffeine/tinytmt-track-designer#obstacle-inserts'
    },
    custom: { label: 'Custom part', url: '' }
  };

  const straights = [50, 100, 150, 200, 250, 300, 400].map((L) => ({
    id: 'S' + L,
    name: 'Straight ' + L,
    group: 'straight',
    type: 'straight',
    length: L,
    source: L === 150 || L === 250 ? 'ramp' : 'straight',
    cycleStraight: [100, 150, 200, 250, 300].includes(L),
    nominal: L !== 150 && L !== 250
  }));

  const curves = [];
  [150, 200, 250, 300].forEach((ir) => {
    [15, 30, 45, 90].forEach((ang) => {
      curves.push({
        id: `C${ang}-R${ir}`,
        name: `Curve ${ang}° IR${ir}`,
        group: 'curve',
        type: 'curve',
        ir,
        angle: ang,
        style: 'smooth',
        source: 'curve',
        cycleCurve: ir === 200 || (ang === 45 && (ir === 150 || ir === 300)),
        nominal: true
      });
    });
  });
  curves.push({
    id: 'C45-R200-D', name: 'Curve 45° IR200 (digital)', group: 'curve', type: 'curve',
    ir: 200, angle: 45, style: 'digital', source: 'curve', cycleCurve: false, nominal: true
  });

  // Ramp beds are the standard 250/150 straights laid on angled supports.
  // The set's lower-level sections are 246/147 mm "due to how triangles work",
  // i.e. the plan projection of a sloped bed: cos θ = 246/250 → θ ≈ 10.3°.
  const rampRise250 = Math.round(Math.sqrt(250 * 250 - 246 * 246)); // ≈ 44 mm
  const rampRise150 = Math.round(Math.sqrt(150 * 150 - 147 * 147)); // ≈ 30 mm
  const ramps = [
    { id: 'RU250', name: 'Ramp up (250 bed)', group: 'ramp', type: 'straight', length: 246, bedLength: 250, rise: rampRise250, bomAs: 'S250', source: 'ramp', nominal: true },
    { id: 'RD250', name: 'Ramp down (250 bed)', group: 'ramp', type: 'straight', length: 246, bedLength: 250, rise: -rampRise250, bomAs: 'S250', source: 'ramp', nominal: true },
    { id: 'RU150', name: 'Ramp up (150 bed)', group: 'ramp', type: 'straight', length: 147, bedLength: 150, rise: rampRise150, bomAs: 'S150', source: 'ramp', nominal: true },
    { id: 'RD150', name: 'Ramp down (150 bed)', group: 'ramp', type: 'straight', length: 147, bedLength: 150, rise: -rampRise150, bomAs: 'S150', source: 'ramp', nominal: true },
    { id: 'L246', name: 'Lower-level straight 246', group: 'ramp', type: 'straight', length: 246, source: 'ramp' },
    { id: 'L147', name: 'Lower-level straight 147', group: 'ramp', type: 'straight', length: 147, source: 'ramp' }
  ];

  // Closure adapters: odd-length straights that make more layouts close exactly.
  //  S121 / S236 = one track width (single / double): needed once per inside corner (L, U, T shapes).
  //  D71 / D141 = 50√2 / 100√2: a C45 + D141 + C45 chamfered corner lands exactly 100 mm further than a C90
  //  in both axes, so 45° cut corners return to the 50 mm grid.
  const adapters = [
    { id: 'S121', name: 'Straight 121 · track width', short: 'S121', group: 'adapter', type: 'straight', length: 121, source: 'adapter',
      note: 'One single-lane track width (115 lane + 2 × 3 wall). Use one per inside corner so L/U/T-shaped loops close.' },
    { id: 'S236', name: 'Straight 236 · double width', short: 'S236', group: 'adapter', type: 'straight', length: 236, source: 'adapter',
      note: 'One double-lane track width. The double-width equivalent of S121.' },
    { id: 'D71', name: 'Diagonal 70.7 (50√2)', short: 'D71', group: 'adapter', type: 'straight', length: 70.711, source: 'adapter',
      note: 'At 45° it moves exactly 50 mm on both axes.' },
    { id: 'D141', name: 'Diagonal 141.4 (100√2)', short: 'D141', group: 'adapter', type: 'straight', length: 141.421, source: 'adapter',
      note: 'C45 + D141 + C45 lands exactly 100 mm beyond a C90 corner on both axes — chamfered corners stay on grid.' }
  ];

  // Obstacle inserts: drop-in 250 mm straights that recreate everyday barriers. Same footprint as S250,
  // so they never affect whether a loop closes. extraG = estimated extra material over a plain straight.
  const obstacles = [
    { id: 'OB-DOOR', name: 'Doorway pinch', short: 'DOOR', obstacle: 'doorway', extraG: 25, note: 'Lane narrows to ~90 mm for 40 mm — like a narrow doorway.' },
    { id: 'OB-SILL', name: 'Threshold bump', short: 'SILL', obstacle: 'sill', extraG: 6, note: 'A low raised strip across the lane, like a door sill.' },
    { id: 'OB-ROUGH', name: 'Rough surface', short: 'ROUGH', obstacle: 'rough', extraG: 18, note: 'Textured floor, like gravel or cobbles.' },
    { id: 'OB-KERB', name: 'Kerb step (no curb cut)', short: 'KERB', obstacle: 'kerb', extraG: 40, note: 'A raised kerb block across the lane — pair with ramps to show why curb cuts matter.' },
    { id: 'OB-SLOPE', name: 'Cross-slope', short: 'SLOPE', obstacle: 'slope', extraG: 30, note: 'Floor tilts sideways, like a driveway crossing a pavement.' }
  ].map((o) => Object.assign({ group: 'obstacle', type: 'straight', length: 250, source: 'obstacle', nominal: true }, o));

  const DEFAULT_PARTS = [...straights, ...adapters, ...curves, ...ramps, ...obstacles];

  root.TinyTMTParts = {
    SOURCES: SRC,
    DEFAULT_PARTS,
    GROUPS: [
      { id: 'straight', label: 'Straights', hint: '← →' },
      { id: 'adapter', label: 'Closure adapters', hint: '' },
      { id: 'curve', label: 'Curves', hint: '↑ ↓' },
      { id: 'ramp', label: 'Ramps & levels', hint: '' },
      { id: 'obstacle', label: 'Obstacle inserts', hint: '' }
    ],
    DEFAULT_STRAIGHT: 'S250',
    DEFAULT_CURVE: 'C45-R200'
  };
})(window);
