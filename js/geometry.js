/*
 * TinyTMT geometry. Units: millimetres. World axes: +x right, +y down (screen).
 * Heading `a` in degrees: 0 = +x, positive = clockwise on screen.
 * A placed piece stores its ENTRY pose {x, y, a} and entry elevation z.
 */
(function (root) {
  const D2R = Math.PI / 180;
  const norm = (a) => ((a % 360) + 360) % 360;
  const angDiff = (a, b) => { const d = norm(a - b); return d > 180 ? 360 - d : d; };
  const rot = (x, y, a) => { const r = a * D2R, c = Math.cos(r), s = Math.sin(r); return { x: x * c - y * s, y: x * s + y * c }; };
  const compose = (pose, local) => { const p = rot(local.x, local.y, pose.a); return { x: pose.x + p.x, y: pose.y + p.y, a: norm(pose.a + local.a) }; };
  /** Pose of a piece whose local transform `local` must land on world pose `target`. */
  const solveEntry = (target, local) => { const a = norm(target.a - local.a); const p = rot(local.x, local.y, a); return { x: target.x - p.x, y: target.y - p.y, a }; };
  const toLocal = (pose, wx, wy) => rot(wx - pose.x, wy - pose.y, -pose.a);

  /** Overall track width for a width mode, from settings. Double = 2 lanes, no separator. */
  function trackWidth(settings, widthMode) {
    const lanes = widthMode === 'double' ? 2 : 1;
    return lanes * settings.laneWidth + 2 * settings.wallThickness;
  }

  function centerRadius(part, W) { return part.ir + W / 2; }

  /** Exit transform in the piece's local frame. */
  function exitLocal(part, dir, W) {
    if (part.type === 'straight') return { x: part.length, y: 0, a: 0 };
    const R = centerRadius(part, W), t = part.angle * D2R;
    const x = R * Math.sin(t), y = R - R * Math.cos(t);
    return dir === 'L' ? { x, y: -y, a: -part.angle } : { x, y, a: part.angle };
  }

  /** Centre-line length (what a car travels). Ramps use their sloped bed length. */
  function pieceLength(part, W) {
    if (part.type === 'straight') return part.bedLength || part.length;
    return centerRadius(part, W) * part.angle * D2R;
  }

  /** Outline as a polygon in local coords (arcs tessellated). */
  function outlineLocal(part, dir, W) {
    const h = W / 2;
    if (part.type === 'straight') return [{ x: 0, y: -h }, { x: part.length, y: -h }, { x: part.length, y: h }, { x: 0, y: h }];
    const R = centerRadius(part, W), ri = R - h, ro = R + h;
    const sgn = dir === 'L' ? -1 : 1;
    const steps = part.style === 'digital' ? Math.max(2, Math.round(part.angle / 7.5)) : Math.max(6, Math.ceil(part.angle / 3));
    const pts = [];
    const at = (r, t) => ({ x: r * Math.sin(t), y: sgn * (R - r * Math.cos(t)) });
    for (let i = 0; i <= steps; i++) pts.push(at(ro, (part.angle * D2R * i) / steps));
    for (let i = steps; i >= 0; i--) pts.push(at(ri, (part.angle * D2R * i) / steps));
    return pts;
  }

  /** Points along an offset of the centre line (offset>0 = right side). */
  function railLocal(part, dir, W, offset, stepMm) {
    stepMm = stepMm || 10;
    if (part.type === 'straight') {
      const n = Math.max(1, Math.ceil(part.length / stepMm)), pts = [];
      for (let i = 0; i <= n; i++) pts.push({ x: (part.length * i) / n, y: offset, t: i / n });
      return pts;
    }
    const R = centerRadius(part, W), sgn = dir === 'L' ? -1 : 1;
    const r = R - sgn * offset; // right-turn: right side is inside
    const arc = r * part.angle * D2R;
    const n = part.style === 'digital' ? Math.max(2, Math.round(part.angle / 7.5)) : Math.max(2, Math.ceil(arc / stepMm));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = (part.angle * D2R * i) / n; pts.push({ x: r * Math.sin(t), y: sgn * (R - r * Math.cos(t)), t: i / n }); }
    return pts;
  }

  function hitLocal(part, dir, W, lx, ly) {
    const h = W / 2;
    if (part.type === 'straight') return lx >= 0 && lx <= part.length && Math.abs(ly) <= h;
    const R = centerRadius(part, W), sgn = dir === 'L' ? -1 : 1;
    const cy = sgn * R; // centre of curvature
    const dx = lx, dy = ly - cy, d = Math.hypot(dx, dy);
    if (d < R - h || d > R + h) return false;
    // angle swept from start vector (0,-sgn)
    let t = Math.atan2(dx, -sgn * dy); // 0 at start, increasing along travel
    return t >= -1e-6 && t <= part.angle * D2R + 1e-6;
  }

  function pointInPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  root.TinyTMTGeom = { D2R, norm, angDiff, rot, compose, solveEntry, toLocal, trackWidth, centerRadius, exitLocal, pieceLength, outlineLocal, railLocal, hitLocal, pointInPoly };
})(window);
