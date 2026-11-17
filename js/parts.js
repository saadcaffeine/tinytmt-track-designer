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

  const DEFAULT_PARTS = [...straights, ...curves, ...ramps];

  root.TinyTMTParts = {
    SOURCES: SRC,
    DEFAULT_PARTS,
    GROUPS: [
      { id: 'straight', label: 'Straights', hint: '← →' },
      { id: 'curve', label: 'Curves', hint: '↑ ↓' },
      { id: 'ramp', label: 'Ramps & levels', hint: '' }
    ],
    DEFAULT_STRAIGHT: 'S250',
    DEFAULT_CURVE: 'C45-R200'
  };
})(window);
