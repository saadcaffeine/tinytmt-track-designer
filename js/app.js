/*
 * TinyTMT track designer by SalvageGarden Makerspace
 * Single-page, dependency-free, offline-capable track layout editor.
 * License: MIT (see LICENSE)
 */
(function () {
  'use strict';
  const G = window.TinyTMTGeom, P = window.TinyTMTParts, BP = window.TinyTMTBlueprint, NAMES = window.TinyTMTNames;
  const TinyTMT = window.TinyTMT;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------- storage (wrapped: storage can be unavailable) ---------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const KEYS = { settings: 'tinytmt.settings.v1', current: 'tinytmt.current.v1', library: 'tinytmt.library.v1', ui: 'tinytmt.ui.v1' };

  const DEFAULT_SETTINGS = {
    workspaceW: 2000, workspaceH: 1500, overflowPct: 50,
    gridSize: 50, majorEvery: 10, snapToGrid: true, snapPx: 28, rotationStep: 45, wheel: 'zoom',
    showLabels: true, showCenterline: true,
    laneWidth: 115, wallThickness: 3, wallHeight: 50, floorThickness: 2.5,
    defaultWidth: 'single', defaultStraight: P.DEFAULT_STRAIGHT, defaultCurve: P.DEFAULT_CURVE, clearance: 55,
    density: 1.27, filamentDiameter: 1.75, solidity: 0.7, jointVolume: 4, gramsPerHour: 18, overheadMin: 6,
    supportBaseG: 12, supportGPerMm: 0.35, clipsPerJoint: 0, clipGrams: 2, costPerKg: 0, currency: '$',
    autoMaxPieces: 8, autoMaxCurves: 6, autoCurves: 'design', autoAdapters: true, autoTimeLimit: 4,
    partOverrides: {}, customParts: []
  };

  /* ---------- state ---------- */
  let settings = Object.assign(clone(DEFAULT_SETTINGS), LS.get(KEYS.settings, {}));
  let parts = [], partMap = {};
  let design = null;
  let derived = null;
  const ui = Object.assign({ activePart: settings.defaultStraight, width: settings.defaultWidth, dir: 'R', rotation: 0, tool: 'place' }, LS.get(KEYS.ui, {}));
  let selection = new Set();
  let activeEnd = null; // {pid, end}
  let ghost = null;
  let hoverPid = null;
  let undoStack = [], redoStack = [];
  let dirty = false;
  const view = { s: 0.3, ox: 0, oy: 0, fit: 0.3 };
  let pointerWorld = null, pointerOnCanvas = false, spaceDown = false;
  let drag = null;
  let paletteDrag = null;

  const canvas = $('#canvas'), ctx = canvas.getContext('2d');

  /* ---------- parts ---------- */
  function buildParts() {
    const ov = settings.partOverrides || {};
    parts = P.DEFAULT_PARTS.map((p) => Object.assign({}, p, ov[p.id] || {}));
    (settings.customParts || []).forEach((c) => parts.push(Object.assign({ source: 'custom', group: c.type === 'curve' ? 'curve' : 'straight' }, c, ov[c.id] || {})));
    partMap = {};
    parts.forEach((p) => { partMap[p.id] = p; });
    if (!partMap[ui.activePart]) ui.activePart = settings.defaultStraight in partMap ? settings.defaultStraight : parts[0].id;
  }
  const visibleParts = () => parts.filter((p) => !p.hidden);
  const W = (width) => G.trackWidth(settings, width);

  /* ---------- design ---------- */
  function newDesign() {
    const t = new Date().toISOString();
    return { format: 'tinytmt-design', version: 1, id: uid(), title: NAMES.randomTitle(), created: t, modified: t, pieces: [] };
  }

  /* ---------- geometry per piece ---------- */
  function pieceGeom(p) {
    const part = partMap[p.part] || { id: p.part, name: 'Unknown ' + p.part, type: 'straight', length: 100, group: 'straight' };
    const w = W(p.width);
    const pose = { x: p.x, y: p.y, a: p.a };
    const exL = G.exitLocal(part, p.dir, w);
    const ex = G.compose(pose, exL);
    const rise = part.rise || 0, z0 = p.z || 0, z1 = z0 + rise;
    const tf = (q) => { const r = G.rot(q.x, q.y, p.a); return { x: p.x + r.x, y: p.y + r.y, t: q.t }; };
    const off = w / 2 - settings.wallThickness / 2;
    const d = {
      p, part, W: w, wallT: settings.wallThickness, z0, z1,
      outline: G.outlineLocal(part, p.dir, w).map(tf),
      railL: G.railLocal(part, p.dir, w, -off).map(tf),
      railR: G.railLocal(part, p.dir, w, off).map(tf),
      center: G.railLocal(part, p.dir, w, 0, 10).map(tf),
      length: G.pieceLength(part, w),
      headingMid: G.norm(p.a + (part.type === 'curve' ? (p.dir === 'L' ? -1 : 1) * part.angle / 2 : 0))
    };
    d.samples = [];
    [-(w / 2 - 1.5), 0, w / 2 - 1.5].forEach((o) => G.railLocal(part, p.dir, w, o, 8).forEach((q) => { const r = tf(q); d.samples.push({ x: r.x, y: r.y, z: z0 + rise * q.t }); }));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    d.outline.forEach((q) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    d.bbox = { x0, y0, x1, y1 };
    d.conns = [
      { pid: p.id, end: 0, x: p.x, y: p.y, out: G.norm(p.a + 180), z: z0, width: p.width },
      { pid: p.id, end: 1, x: ex.x, y: ex.y, out: ex.a, z: z1, width: p.width }
    ];
    d.shortLabel = shortLabel(part, p);
    return d;
  }
  function shortLabel(part, p) {
    if (part.rise) return (part.rise > 0 ? '▲' : '▼') + (part.bedLength || part.length);
    if (part.short) return part.short;
    if (part.type === 'straight') return (part.id.startsWith('L') ? 'L' : 'S') + part.length;
    return `${part.angle}°${p.dir === 'L' ? '↰' : '↱'}${part.ir}${part.style === 'digital' ? 'D' : ''}`;
  }
  /** Returns position fraction (0..1) along piece if world point is inside (shrunk) footprint, else -1. */
  function localHit(d, wx, wy, shrink) {
    const part = d.part, l = G.toLocal({ x: d.p.x, y: d.p.y, a: d.p.a }, wx, wy), h = d.W / 2 - (shrink || 0), e = shrink ? 0.75 : 0;
    if (part.type === 'straight') return l.x > e && l.x < part.length - e && Math.abs(l.y) <= h ? l.x / part.length : -1;
    const R = G.centerRadius(part, d.W), sgn = d.p.dir === 'L' ? -1 : 1;
    const dy = l.y - sgn * R, dist = Math.hypot(l.x, dy);
    if (dist < R - h || dist > R + h) return -1;
    const t = Math.atan2(l.x, -sgn * dy), T = part.angle * G.D2R, et = e / R;
    return t > et - 1e-9 && t < T - et + 1e-9 ? t / T : -1;
  }
  function overlaps(a, b) {
    const pad = 2;
    if (a.bbox.x1 < b.bbox.x0 - pad || b.bbox.x1 < a.bbox.x0 - pad || a.bbox.y1 < b.bbox.y0 - pad || b.bbox.y1 < a.bbox.y0 - pad) return false;
    const zr = (d) => [Math.min(d.z0, d.z1), Math.max(d.z0, d.z1)];
    const [a0, a1] = zr(a), [b0, b1] = zr(b);
    if (a0 - b1 >= settings.clearance || b0 - a1 >= settings.clearance) return false;
    const test = (A, B) => A.samples.some((q) => { const f = localHit(B, q.x, q.y, 1); if (f < 0) return false; const zb = B.z0 + (B.z1 - B.z0) * f; return Math.abs(q.z - zb) < settings.clearance; });
    return test(a, b) || test(b, a);
  }

  /* ---------- derive everything from design ---------- */
  function overflowRect() {
    const mx = settings.workspaceW * settings.overflowPct / 200, my = settings.workspaceH * settings.overflowPct / 200;
    return { x0: -mx, y0: -my, x1: settings.workspaceW + mx, y1: settings.workspaceH + my };
  }
  function derive() {
    const out = { pieces: [], byId: {}, connectors: [], joints: [], openConnectors: [], partner: {}, collisions: new Set(), outside: new Set(), oob: new Set(), mismatch: [], zMin: 0, zMax: 0 };
    out.workspace = { x0: 0, y0: 0, x1: settings.workspaceW, y1: settings.workspaceH };
    out.overflow = overflowRect();
    design.pieces.forEach((p) => { const d = pieceGeom(p); out.pieces.push(d); out.byId[p.id] = d; out.connectors.push(...d.conns); out.zMin = Math.min(out.zMin, d.z0, d.z1); out.zMax = Math.max(out.zMax, d.z0, d.z1); });
    const cs = out.connectors;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (out.partner[a.pid + ':' + a.end]) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (b.pid === a.pid || out.partner[b.pid + ':' + b.end]) continue;
        if (Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5 && G.angDiff(a.out, b.out + 180) < 2 && Math.abs(a.z - b.z) < 3) {
          out.partner[a.pid + ':' + a.end] = b; out.partner[b.pid + ':' + b.end] = a; out.joints.push([a, b]);
          if (a.width !== b.width) out.mismatch.push(a);
          break;
        }
      }
    }
    out.openConnectors = cs.filter((c) => !out.partner[c.pid + ':' + c.end]);
    const joined = (a, b) => [0, 1].some((e) => { const q = out.partner[a + ':' + e]; return q && q.pid === b; });
    for (let i = 0; i < out.pieces.length; i++) for (let j = i + 1; j < out.pieces.length; j++) {
      const A = out.pieces[i], B = out.pieces[j];
      if (joined(A.p.id, B.p.id)) continue;
      if (overlaps(A, B)) { out.collisions.add(A.p.id); out.collisions.add(B.p.id); }
    }
    const ws = out.workspace, ov = out.overflow, inside = (r, q) => q.x >= r.x0 - 0.5 && q.x <= r.x1 + 0.5 && q.y >= r.y0 - 0.5 && q.y <= r.y1 + 0.5;
    out.pieces.forEach((d) => {
      if (!d.outline.every((q) => inside(ws, q))) out.outside.add(d.p.id);
      if (!d.outline.every((q) => inside(ov, q))) out.oob.add(d.p.id);
    });
    out.below = out.pieces.filter((d) => d.z0 < -0.5 || d.z1 < -0.5).map((d) => d.p.id);
    out.bom = computeBom(out);
    out.stats = computeStats(out);
    return out;
  }

  /* ---------- estimates ---------- */
  function rawEstimate(part, width) {
    const w = W(width), s = settings;
    let area, wallLen;
    if (part.type === 'straight') { const L = part.bedLength || part.length; area = L * w; wallLen = 2 * L; }
    else { const R = G.centerRadius(part, w), ri = R - w / 2, ro = R + w / 2, th = part.angle * G.D2R; area = th / 2 * (ro * ro - ri * ri); wallLen = th * (ri + ro); }
    const mm3 = area * s.floorThickness + wallLen * s.wallHeight * s.wallThickness + s.jointVolume * 1000;
    const grams = mm3 / 1000 * s.density * s.solidity + (part.extraG || 0) * (width === 'double' ? 1.8 : 1);
    return { grams, minutes: grams / s.gramsPerHour * 60 + s.overheadMin };
  }
  function estimate(part, width) {
    const e = rawEstimate(part, width);
    if (part.gramsOverride > 0 || part.minutesOverride > 0) {
      const base = rawEstimate(part, 'single');
      if (part.gramsOverride > 0) e.grams = part.gramsOverride * (e.grams / base.grams);
      if (part.minutesOverride > 0) e.minutes = part.minutesOverride * (e.minutes / base.minutes);
    }
    return e;
  }
  function supportEstimate(h, width) {
    const k = width === 'double' ? 1.7 : 1;
    const grams = (settings.supportBaseG + settings.supportGPerMm * h) * k;
    return { grams, minutes: grams / settings.gramsPerHour * 60 + settings.overheadMin };
  }
  function computeBom(out) {
    const rows = {};
    const add = (key, base) => { if (!rows[key]) rows[key] = Object.assign({ key, qty: 0, L: 0, R: 0 }, base); rows[key].qty++; return rows[key]; };
    out.pieces.forEach((d) => {
      const printId = d.part.bomAs || d.part.id;
      const pp = partMap[printId] || d.part;
      const e = estimate(pp, d.p.width);
      const r = add(`${printId}|${d.p.width}`, { printId, name: pp.name, part: pp, width: d.p.width, gramsEach: e.grams, minutesEach: e.minutes, source: pp.source, sort: sortKey(pp) });
      if (pp.type === 'curve') r[d.p.dir === 'L' ? 'L' : 'R']++;
      if (d.part.bomAs) r.usedAsRamp = (r.usedAsRamp || 0) + 1;
    });
    // ramp supports at every raised joint / end
    const spots = [];
    out.joints.forEach(([a, b]) => { if (a.z > 0.5) spots.push({ z: a.z, width: a.width === 'double' || b.width === 'double' ? 'double' : 'single' }); });
    out.openConnectors.forEach((c) => { if (c.z > 0.5) spots.push({ z: c.z, width: c.width }); });
    spots.forEach((sp) => {
      const h = Math.round(sp.z);
      const e = supportEstimate(h, sp.width);
      add(`SUP${h}|${sp.width}`, { printId: 'SUP', name: `Ramp support · h≈${h} mm`, width: sp.width, gramsEach: e.grams, minutesEach: e.minutes, source: 'ramp', support: true, sort: 'z' + String(h).padStart(5, '0') });
    });
    if (settings.clipsPerJoint > 0 && out.joints.length) {
      const n = out.joints.length * settings.clipsPerJoint;
      rows.CLIP = { key: 'CLIP', printId: 'CLIP', name: 'Track joint clip', width: 'single', qty: n, L: 0, R: 0, gramsEach: settings.clipGrams, minutesEach: settings.clipGrams / settings.gramsPerHour * 60, source: 'custom', sort: 'zz' };
    }
    const list = Object.values(rows).sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.width < b.width ? -1 : 1));
    list.forEach((r) => { r.gramsTotal = r.gramsEach * r.qty; r.minutesTotal = r.minutesEach * r.qty; });
    return { rows: list, supports: spots.length };
  }
  function sortKey(p) {
    const g = { straight: 'a', adapter: 'b', curve: 'c', ramp: 'd', obstacle: 'e' }[p.group] || 'f';
    // curves: by inner radius, then widest turn first (90° → 15°), smooth before digital
    return p.type === 'curve' ? `${g}${String(p.ir).padStart(4, '0')}${p.style === 'digital' ? 1 : 0}${String(999 - p.angle).padStart(3, '0')}` : `${g}${String(p.length).padStart(4, '0')}`;
  }
  /* ---------- colour families: one hue per piece family, used in palette, canvas and BoM ---------- */
  const IR_HUES = { 150: 172, 200: 265, 250: 325, 300: 122 };
  function familyOf(part) {
    if (part && part.type === 'curve') return { key: 'ir' + part.ir, label: `IR ${part.ir} mm`, hue: IR_HUES[part.ir] != null ? IR_HUES[part.ir] : (part.ir * 47) % 360 };
    if (part && part.group === 'ramp') return { key: 'ramp', label: 'Ramps & levels', hue: 45 };
    if (part && part.group === 'adapter') return { key: 'adapter', label: 'Closure adapters', hue: 205, sat: 0.3 };
    if (part && part.group === 'obstacle') return { key: 'obstacle', label: 'Obstacle inserts', hue: 16 };
    return { key: 'straight', label: 'Straights', hue: 218 };
  }
  const famCache = {};
  function famColors(part) {
    const f = familyOf(part);
    return famCache[f.key + f.hue] || (famCache[f.key + f.hue] = {
      hue: f.hue, accent: `hsl(${f.hue} ${62 * (f.sat || 1)}% 45%)`, floor: `hsl(${f.hue} ${78 * (f.sat || 1)}% 91%)`, wall: `hsl(${f.hue} ${55 * (f.sat || 1)}% 28%)`, soft: `hsl(${f.hue} ${80 * (f.sat || 1)}% 96%)`, edge: `hsla(${f.hue} ${55 * (f.sat || 1)}% 28% / .45)`
    });
  }
  function computeStats(out) {
    const s = { length: 0, pieces: out.pieces.length, supports: out.bom.supports, grams: 0, minutes: 0 };
    out.pieces.forEach((d) => { s.length += d.length; });
    out.bom.rows.forEach((r) => { s.grams += r.gramsTotal; s.minutes += r.minutesTotal; });
    const r = settings.filamentDiameter / 2;
    s.filamentM = (s.grams / settings.density) * 1000 / (Math.PI * r * r) / 1000;
    s.cost = settings.costPerKg > 0 ? s.grams / 1000 * settings.costPerKg : 0;
    s.openEnds = out.openConnectors.length;
    s.collisions = out.collisions.size;
    s.outside = out.outside.size;
    return s;
  }

  /* ---------- history ---------- */
  const snap = () => JSON.stringify(design.pieces);
  function mutate(fn, opts) {
    const before = snap();
    fn();
    if (snap() === before) { refresh(); return; }
    pushUndo(before);
    afterChange();
    if (!opts || !opts.keepGhost) updateGhost();
  }
  function pushUndo(before) { undoStack.push(before); if (undoStack.length > 200) undoStack.shift(); redoStack = []; }
  function afterChange() {
    if (suggest) suggest = null;
    dirty = true; design.modified = new Date().toISOString();
    refresh();
    autosave();
    TinyTMT._emit('change', { design: clone(design) });
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); design.pieces = JSON.parse(undoStack.pop()); cleanupRefs(); afterChange(); updateGhost(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); design.pieces = JSON.parse(redoStack.pop()); cleanupRefs(); afterChange(); updateGhost(); }
  function cleanupRefs() {
    const ids = new Set(design.pieces.map((p) => p.id));
    selection = new Set([...selection].filter((id) => ids.has(id)));
    if (activeEnd && !ids.has(activeEnd.pid)) activeEnd = null;
  }
  let autosaveT = 0;
  function autosave() { clearTimeout(autosaveT); autosaveT = setTimeout(() => LS.set(KEYS.current, { design, dirty }), 300); }
  function saveUi() { LS.set(KEYS.ui, { activePart: ui.activePart, width: ui.width, dir: ui.dir, rotation: ui.rotation, tool: ui.tool }); }

  /* ---------- placement ---------- */
  function makePiece(partId, conn, freePose) {
    const part = partMap[partId];
    const p = { id: uid(), part: partId, dir: ui.dir, width: ui.width, x: 0, y: 0, a: 0, z: 0 };
    if (conn) {
      if (conn.end === 1) Object.assign(p, { x: conn.x, y: conn.y, a: conn.out, z: conn.z });
      else { Object.assign(p, G.solveEntry({ x: conn.x, y: conn.y, a: G.norm(conn.out + 180) }, G.exitLocal(part, p.dir, W(p.width)))); p.z = conn.z - (part.rise || 0); }
    } else Object.assign(p, freePose);
    p.x = round3(p.x); p.y = round3(p.y); p.a = round3(G.norm(p.a)); p.z = round3(p.z);
    return p;
  }
  const round3 = (v) => Math.round(v * 1000) / 1000;
  function snapGrid(v) { const g = settings.gridSize; return settings.snapToGrid ? Math.round(v / g) * g : v; }
  function nearestOpen(w, excludePids, list) {
    const lim = settings.snapPx / view.s;
    let best = null, bd = lim;
    (list || derived.openConnectors).forEach((c) => { if (excludePids && excludePids.has(c.pid)) return; const dd = Math.hypot(c.x - w.x, c.y - w.y); if (dd < bd) { bd = dd; best = c; } });
    return best;
  }
  function evaluateGhost(p, attachPid) {
    const d = pieceGeom(p);
    d.invalid = d.z0 < -0.5 || d.z1 < -0.5;
    d.collides = derived.pieces.some((o) => o.p.id !== attachPid && overlaps(d, o));
    return d;
  }
  function updateGhost() {
    ghost = null;
    if (ui.tool !== 'place' && !paletteDrag) { render(); return; }
    if (pointerWorld && (pointerOnCanvas || paletteDrag)) {
      const c = nearestOpen(pointerWorld);
      const p = makePiece(ui.activePart, c, { x: snapGrid(pointerWorld.x), y: snapGrid(pointerWorld.y), a: ui.rotation, z: 0 });
      ghost = { piece: p, attach: c, d: evaluateGhost(p, c && c.pid) };
    }
    render();
  }
  function placeGhost() {
    if (!ghost) return;
    const g = ghost;
    mutate(() => { design.pieces.push(g.piece); });
    activeEnd = { pid: g.piece.id, end: g.attach && g.attach.end === 0 ? 0 : 1 };
    if (g.d.collides) toast('Placed — but it overlaps another piece (shown in red).');
    updateGhost();
  }
  function activeConn() {
    if (!activeEnd || !derived.byId[activeEnd.pid]) return null;
    return derived.byId[activeEnd.pid].conns[activeEnd.end];
  }
  function appendAtActiveEnd() {
    let c = activeConn();
    if (c && derived.partner[c.pid + ':' + c.end]) { toast('That end is already connected — click an open end (green dot) to continue from it.'); return; }
    let p;
    if (c) p = makePiece(ui.activePart, c);
    else if (!design.pieces.length) p = makePiece(ui.activePart, null, { x: snapGrid(settings.workspaceW * 0.2), y: snapGrid(settings.workspaceH * 0.75), a: ui.rotation, z: 0 });
    else { const oc = derived.openConnectors.find((q) => q.end === 1) || derived.openConnectors[0]; if (!oc) { toast('No open ends left — the track is a closed loop.'); return; } c = oc; p = makePiece(ui.activePart, oc); }
    mutate(() => design.pieces.push(p));
    activeEnd = { pid: p.id, end: c && c.end === 0 ? 0 : 1 };
    render();
  }

  /* ---------- editing ops ---------- */
  function neighbors(pid) { return [0, 1].map((e) => derived.partner[pid + ':' + e]).filter(Boolean).map((c) => c.pid); }
  function componentFrom(startPid, excludePid) {
    const seen = new Set([startPid]), q = [startPid];
    while (q.length) { const id = q.shift(); neighbors(id).forEach((n) => { if (n !== excludePid && !seen.has(n)) { seen.add(n); q.push(n); } }); }
    return seen;
  }
  function chainOf(pid) { return componentFrom(pid, null); }
  /** Replace a piece's part/dir/width keeping its entry, and carry the downstream chain along. */
  function replacePiece(pid, changes) {
    const p = design.pieces.find((q) => q.id === pid); if (!p) return;
    const d0 = derived.byId[pid], oldExit = d0.conns[1];
    const nextConn = derived.partner[pid + ':1'];
    let down = null;
    if (nextConn) {
      down = componentFrom(nextConn.pid, pid);
      const prev = derived.partner[pid + ':0'];
      if (prev && down.has(prev.pid)) down = null; // closed loop: can't reflow
    }
    mutate(() => {
      Object.assign(p, changes);
      const nd = pieceGeom(p), ne = nd.conns[1];
      if (down) {
        const da = ne.out - oldExit.out, dz = ne.z - oldExit.z;
        design.pieces.forEach((q) => {
          if (!down.has(q.id)) return;
          const r = G.rot(q.x - oldExit.x, q.y - oldExit.y, da);
          q.x = round3(ne.x + r.x); q.y = round3(ne.y + r.y); q.a = round3(G.norm(q.a + da)); q.z = round3((q.z || 0) + dz);
        });
      }
    });
  }
  function deleteSelection() {
    if (!selection.size) {
      if (ui.tool === 'place' && activeEnd) { selection = new Set([activeEnd.pid]); }
      else return;
    }
    let newActive = null;
    if (activeEnd && selection.has(activeEnd.pid)) {
      const back = derived.partner[activeEnd.pid + ':' + (activeEnd.end === 1 ? 0 : 1)];
      if (back && !selection.has(back.pid)) newActive = { pid: back.pid, end: back.end };
    }
    const del = new Set(selection);
    mutate(() => { design.pieces = design.pieces.filter((p) => !del.has(p.id)); });
    selection.clear();
    if (activeEnd && del.has(activeEnd.pid)) activeEnd = newActive;
    refresh(); updateGhost();
  }
  function rotateSelection(sign) {
    const step = settings.rotationStep * sign;
    if (!selection.size) { ui.rotation = G.norm(ui.rotation + step); saveUi(); updateGhost(); refreshHud(); return; }
    const ds = [...selection].map((id) => derived.byId[id]).filter(Boolean);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ds.forEach((d) => { x0 = Math.min(x0, d.bbox.x0); y0 = Math.min(y0, d.bbox.y0); x1 = Math.max(x1, d.bbox.x1); y1 = Math.max(y1, d.bbox.y1); });
    const cx = snapGrid((x0 + x1) / 2), cy = snapGrid((y0 + y1) / 2);
    mutate(() => design.pieces.forEach((p) => {
      if (!selection.has(p.id)) return;
      const r = G.rot(p.x - cx, p.y - cy, step);
      p.x = round3(cx + r.x); p.y = round3(cy + r.y); p.a = round3(G.norm(p.a + step));
    }));
  }
  function flip() {
    const curves = [...selection].filter((id) => { const d = derived.byId[id]; return d && d.part.type === 'curve'; });
    if (!curves.length) { ui.dir = ui.dir === 'L' ? 'R' : 'L'; saveUi(); syncControls(); updateGhost(); return; }
    if (curves.length === 1) { const p = design.pieces.find((q) => q.id === curves[0]); replacePiece(p.id, { dir: p.dir === 'L' ? 'R' : 'L' }); return; }
    mutate(() => design.pieces.forEach((p) => { if (curves.includes(p.id)) p.dir = p.dir === 'L' ? 'R' : 'L'; }));
  }
  function setWidth(width) {
    ui.width = width; saveUi(); syncControls();
    if (selection.size === 1) { const id = [...selection][0]; replacePiece(id, { width }); }
    else if (selection.size) mutate(() => design.pieces.forEach((p) => { if (selection.has(p.id)) p.width = width; }));
    updateGhost();
  }
  function cycleList(kind) {
    return visibleParts().filter((p) => (kind === 'curve' ? p.type === 'curve' && p.cycleCurve : p.group === 'straight' && p.cycleStraight)).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  }
  function cycle(kind, delta) {
    const list = cycleList(kind);
    if (!list.length) { toast('No pieces in this arrow-key cycle — enable some in Settings → Parts.'); return; }
    const single = selection.size === 1 && ui.tool === 'select' ? design.pieces.find((p) => p.id === [...selection][0]) : null;
    const cur = single ? single.part : ui.activePart;
    let i = list.findIndex((p) => p.id === cur), next;
    if (i < 0) { const def = kind === 'curve' ? settings.defaultCurve : settings.defaultStraight; next = list.find((p) => p.id === def) || list[0]; }
    else next = list[(i + delta + list.length) % list.length];
    if (single) { replacePiece(single.id, { part: next.id }); toast(`Swapped to ${next.name}`, 900); }
    setActivePart(next.id, true);
  }
  function setActivePart(id, keepTool) {
    if (!partMap[id]) return;
    ui.activePart = id; saveUi();
    if (!keepTool) setTool('place');
    $$('.pcard').forEach((c) => c.classList.toggle('on', c.dataset.part === id));
    const card = $(`.pcard[data-part="${id}"]`);
    if (card) { const det = card.closest('details'); if (det && !det.open) det.open = true; card.scrollIntoView({ block: 'nearest' }); }
    updateGhost(); refreshHud();
  }
  function setTool(t) {
    ui.tool = t; saveUi();
    $$('.tool[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    canvas.style.cursor = t === 'place' ? 'crosshair' : 'default';
    if (t === 'place') { selection.clear(); refreshSide(); }
    updateGhost(); refreshHud();
  }

  /* ---------- view ---------- */
  function sizeCanvas() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return r;
  }
  function fitView(rect) {
    const r = sizeCanvas(), b = rect || overflowRect();
    const s = Math.min((r.width - 40) / (b.x1 - b.x0), (r.height - 90) / (b.y1 - b.y0));
    view.s = Math.max(0.02, s);
    view.ox = r.width / 2 - ((b.x0 + b.x1) / 2) * view.s;
    view.oy = r.height / 2 + 20 - ((b.y0 + b.y1) / 2) * view.s;
    render(); refreshZoom();
  }
  function zoomAt(sx, sy, f) {
    const ns = Math.min(10, Math.max(0.02, view.s * f));
    const wx = (sx - view.ox) / view.s, wy = (sy - view.oy) / view.s;
    view.s = ns; view.ox = sx - wx * ns; view.oy = sy - wy * ns;
    render(); refreshZoom(); updateGhost();
  }
  function workspaceFit() { const r = canvas.getBoundingClientRect(), b = overflowRect(); return Math.max(0.02, Math.min((r.width - 40) / (b.x1 - b.x0), (r.height - 90) / (b.y1 - b.y0))); }
  function refreshZoom() { $('#tZoomFit').textContent = Math.round((view.s / workspaceFit()) * 100) + '%'; }
  const toWorld = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s });
  function eventWorld(e) { const r = canvas.getBoundingClientRect(); return toWorld(e.clientX - r.left, e.clientY - r.top); }

  /* ---------- rendering ---------- */
  let rafPending = false;
  function render() { if (!rafPending) { rafPending = true; requestAnimationFrame(draw); } }
  const COL = {
    outside: '#e2e7ee', overflow: '#f3f5f9', ws: '#ffffff', grid: '#edf0f5', gridMajor: '#d5dce7', wsBorder: '#14213d',
    floor: '#dce7fb', wall: '#22407a', center: '#9fb3d9', upFloor: '#fde8c2', upWall: '#9a5b00',
    badFloor: '#ffd9d9', badWall: '#c62828', sel: '#2f7cf6', open: '#2e9e6a', active: '#2f7cf6'
  };
  function poly(pts) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); }
  function draw() {
    rafPending = false;
    const r = sizeCanvas(), dpr = window.devicePixelRatio || 1, s = view.s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.outside; ctx.fillRect(0, 0, r.width, r.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.ox, dpr * view.oy);
    const px = 1 / s;
    const ov = derived.overflow, ws = derived.workspace;
    ctx.fillStyle = COL.overflow; ctx.fillRect(ov.x0, ov.y0, ov.x1 - ov.x0, ov.y1 - ov.y0);
    ctx.fillStyle = COL.ws; ctx.fillRect(ws.x0, ws.y0, ws.x1 - ws.x0, ws.y1 - ws.y0);
    // grid
    const g = settings.gridSize, major = g * settings.majorEvery;
    const vis = { x0: Math.max(ov.x0, -view.ox / s), y0: Math.max(ov.y0, -view.oy / s), x1: Math.min(ov.x1, (r.width - view.ox) / s), y1: Math.min(ov.y1, (r.height - view.oy) / s) };
    const lines = (step, color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width * px; ctx.beginPath();
      for (let x = Math.ceil(vis.x0 / step) * step; x <= vis.x1; x += step) { ctx.moveTo(x, vis.y0); ctx.lineTo(x, vis.y1); }
      for (let y = Math.ceil(vis.y0 / step) * step; y <= vis.y1; y += step) { ctx.moveTo(vis.x0, y); ctx.lineTo(vis.x1, y); }
      ctx.stroke();
    };
    if (g * s >= 6) lines(g, COL.grid, 1);
    if (major * s >= 6) lines(major, COL.gridMajor, 1);
    ctx.setLineDash([6 * px, 5 * px]); ctx.strokeStyle = '#b9c3d3'; ctx.lineWidth = px; ctx.strokeRect(ov.x0, ov.y0, ov.x1 - ov.x0, ov.y1 - ov.y0); ctx.setLineDash([]);
    ctx.strokeStyle = COL.wsBorder; ctx.lineWidth = 2 * px; ctx.strokeRect(ws.x0, ws.y0, ws.x1 - ws.x0, ws.y1 - ws.y0);
    drawRulers(ws, s);

    [...derived.pieces].sort((a, b) => Math.max(a.z0, a.z1) - Math.max(b.z0, b.z1)).forEach((d) => drawPiece(d, {
      sel: selection.has(d.p.id), hover: hoverPid === d.p.id, bad: derived.collisions.has(d.p.id) || derived.below.includes(d.p.id),
      outside: derived.outside.has(d.p.id), oob: derived.oob.has(d.p.id)
    }));
    if (design.pieces.length) drawStart(derived.byId[design.pieces[0].id]);
    // connectors
    const showConns = true;
    if (showConns) {
      derived.openConnectors.forEach((c) => {
        ctx.beginPath(); ctx.arc(c.x, c.y, 5.5 * px, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 2.2 * px; ctx.strokeStyle = COL.open; ctx.stroke();
        const v = G.rot(1, 0, c.out); ctx.beginPath(); ctx.moveTo(c.x + v.x * 7 * px, c.y + v.y * 7 * px); ctx.lineTo(c.x + v.x * 14 * px, c.y + v.y * 14 * px); ctx.stroke();
      });
      derived.mismatch.forEach((c) => { ctx.beginPath(); ctx.arc(c.x, c.y, 6 * px, 0, Math.PI * 2); ctx.fillStyle = '#e69500'; ctx.fill(); });
    }
    const ac = activeConn();
    if (ac && !derived.partner[ac.pid + ':' + ac.end]) {
      ctx.beginPath(); ctx.arc(ac.x, ac.y, 10 * px, 0, Math.PI * 2); ctx.lineWidth = 2.5 * px; ctx.strokeStyle = COL.active; ctx.stroke();
      if (ui.tool === 'place' && !(ghost && pointerOnCanvas)) {
        const p = makePiece(ui.activePart, ac); const d = pieceGeom(p);
        ctx.setLineDash([5 * px, 4 * px]); poly(d.outline); ctx.closePath(); ctx.strokeStyle = 'rgba(47,124,246,.7)'; ctx.lineWidth = 1.5 * px; ctx.stroke(); ctx.setLineDash([]);
        labelAt(d, 'Enter ↵', 'rgba(47,124,246,.9)');
      }
    }
    if (ghost) drawGhost(ghost.d);
    if (suggest) drawSuggestion(suggest.options[suggest.idx].ds);
    if (drag && drag.type === 'band') {
      const a = drag.start, b = drag.cur;
      ctx.fillStyle = 'rgba(47,124,246,.08)'; ctx.strokeStyle = COL.sel; ctx.lineWidth = px;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
  }
  function drawRulers(ws, s) {
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = '#5b6b85'; ctx.textBaseline = 'bottom';
    const sx = (x) => x * s + view.ox, sy = (y) => y * s + view.oy;
    const step = s * 500 > 70 ? 500 : 1000;
    ctx.textAlign = 'center';
    for (let x = 0; x <= ws.x1 + 0.1; x += step) ctx.fillText(x === 0 ? '0' : (x / 1000).toFixed(1) + ' m', sx(x), sy(0) - 5);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = step; y <= ws.y1 + 0.1; y += step) ctx.fillText((y / 1000).toFixed(1) + ' m', sx(0) - 6, sy(y));
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#14213d'; ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`Workspace ${settings.workspaceW} × ${settings.workspaceH} mm`, sx(0), sy(0) - 20);
    ctx.restore();
  }
  function drawPiece(d, st) {
    const px = 1 / view.s, up = d.z0 > 0.5 || d.z1 > 0.5;
    poly(d.outline); ctx.closePath();
    if (st.sel) { ctx.save(); ctx.strokeStyle = COL.sel; ctx.lineWidth = 6 * px; ctx.globalAlpha = 0.35; ctx.stroke(); ctx.restore(); }
    const fam = famColors(d.part), raisedFlat = up && d.part.group !== 'ramp';
    ctx.fillStyle = st.bad ? COL.badFloor : raisedFlat ? COL.upFloor : fam.floor; ctx.fill();
    ctx.lineWidth = px; ctx.strokeStyle = st.bad ? COL.badWall : fam.edge; ctx.stroke();
    const wall = st.bad ? COL.badWall : raisedFlat ? COL.upWall : fam.wall;
    ctx.strokeStyle = wall; ctx.lineWidth = Math.max(d.wallT, 1.6 * px); ctx.lineCap = 'butt';
    poly(d.railL); ctx.stroke(); poly(d.railR); ctx.stroke();
    if (d.part.obstacle) { ctx.save(); ctx.translate(d.p.x, d.p.y); ctx.rotate(d.p.a * G.D2R); window.TinyTMTMarks.draw(ctx, d.part, d.W, { wallT: d.wallT, px, color: wall, laneWidth: settings.laneWidth }); ctx.restore(); }
    if (settings.showCenterline && d.W * view.s > 18 && !d.part.obstacle) { ctx.setLineDash([5 * px, 5 * px]); ctx.lineWidth = px; ctx.strokeStyle = COL.center; poly(d.center); ctx.stroke(); ctx.setLineDash([]); }
    if (d.part.rise) {
      const m = d.center[Math.floor(d.center.length * 0.22)], dirUp = d.part.rise > 0 ? 1 : -1, L = d.W * 0.2;
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(d.headingMid * G.D2R); ctx.strokeStyle = wall; ctx.lineWidth = 2 * px;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * L - dirUp * L * 0.45, -L); ctx.lineTo(k * L + dirUp * L * 0.45, 0); ctx.lineTo(k * L - dirUp * L * 0.45, L); ctx.stroke(); }
      ctx.restore();
    }
    if (st.outside || st.oob) { poly(d.outline); ctx.closePath(); ctx.setLineDash([4 * px, 3 * px]); ctx.lineWidth = 2 * px; ctx.strokeStyle = st.oob ? COL.badWall : '#e69500'; ctx.stroke(); ctx.setLineDash([]); }
    if (st.hover && !st.sel) { poly(d.outline); ctx.closePath(); ctx.lineWidth = 2 * px; ctx.strokeStyle = 'rgba(47,124,246,.6)'; ctx.stroke(); }
    if (st.sel) { poly(d.outline); ctx.closePath(); ctx.lineWidth = 2 * px; ctx.strokeStyle = COL.sel; ctx.stroke(); }
    if (settings.showLabels && d.W * view.s > 34) labelAt(d, d.shortLabel + (up ? `  z${Math.round(d.z1)}` : ''), st.bad ? COL.badWall : wall);
  }
  function labelAt(d, text, color) {
    const m = d.center[Math.floor(d.center.length / 2)], dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = m.x * view.s + view.ox, y = m.y * view.s + view.oy;
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; roundRect(x - w / 2, y - 8, w, 16, 4); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawStart(d) {
    if (!d) return;
    const n = 6, w = d.W, sq = w / n;
    ctx.save(); ctx.translate(d.p.x, d.p.y); ctx.rotate(d.p.a * G.D2R);
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#14213d' : '#ffffff'; ctx.fillRect(j * sq * 0.6, -w / 2 + i * sq, sq * 0.6, sq); }
    ctx.restore();
  }
  function drawGhost(d) {
    const px = 1 / view.s, bad = d.collides || d.invalid;
    poly(d.outline); ctx.closePath();
    ctx.fillStyle = bad ? 'rgba(214,69,69,.22)' : 'rgba(47,124,246,.20)'; ctx.fill();
    ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = 1.8 * px; ctx.strokeStyle = bad ? '#d64545' : '#2f7cf6'; ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = Math.max(d.wallT, 1.4 * px); ctx.strokeStyle = bad ? 'rgba(214,69,69,.7)' : 'rgba(34,64,122,.55)';
    poly(d.railL); ctx.stroke(); poly(d.railR); ctx.stroke();
    // entry arrow
    const c = d.conns[0], v = G.rot(1, 0, d.p.a);
    ctx.beginPath(); ctx.arc(c.x, c.y, 4 * px, 0, Math.PI * 2); ctx.fillStyle = bad ? '#d64545' : '#2f7cf6'; ctx.fill();
    const m = d.center[Math.floor(d.center.length / 2)], hv = G.rot(1, 0, d.headingMid), L = 14 * px;
    ctx.beginPath(); ctx.moveTo(m.x - hv.x * L, m.y - hv.y * L); ctx.lineTo(m.x + hv.x * L, m.y + hv.y * L);
    const n1 = G.rot(-8 * px, -6 * px, d.headingMid), n2 = G.rot(-8 * px, 6 * px, d.headingMid);
    ctx.moveTo(m.x + hv.x * L + n1.x, m.y + hv.y * L + n1.y); ctx.lineTo(m.x + hv.x * L, m.y + hv.y * L); ctx.lineTo(m.x + hv.x * L + n2.x, m.y + hv.y * L + n2.y);
    ctx.lineWidth = 2 * px; ctx.strokeStyle = bad ? '#d64545' : '#2f7cf6'; ctx.stroke();
    void v;
  }

  /* ---------- UI refresh ---------- */
  function refresh() {
    derived = derive();
    render(); refreshStats(); refreshSide(); refreshHud();
    $('#dirtyDot').classList.toggle('on', dirty);
    $('#tUndo').disabled = !undoStack.length; $('#tRedo').disabled = !redoStack.length;
    refreshAutoButton();
  }
  function fmtLen(mm) { return (mm / 1000).toFixed(2) + ' m'; }
  function fmtG(g) { return g >= 1000 ? (g / 1000).toFixed(2) + ' kg' : Math.round(g) + ' g'; }
  function refreshStats() {
    const s = derived.stats;
    $('#stLength').textContent = fmtLen(s.length);
    $('#stPieces').textContent = s.pieces + (s.supports ? ` + ${s.supports} supports` : '');
    $('#stTime').textContent = BP.fmtTime(s.minutes);
    $('#stMaterial').textContent = `${fmtG(s.grams)} · ${s.filamentM.toFixed(0)} m` + (s.cost ? ` · ${settings.currency}${s.cost.toFixed(2)}` : '');
    const flags = [];
    if (s.pieces) flags.push(s.openEnds === 0 ? '<span class="flag ok">✓ Closed loop</span>' : `<span class="flag">${s.openEnds} open end${s.openEnds === 1 ? '' : 's'}</span>`);
    if (s.collisions) flags.push(`<span class="flag bad">${s.collisions} overlapping</span>`);
    if (s.outside) flags.push(`<span class="flag warn">${s.outside} outside workspace</span>`);
    if (derived.mismatch.length) flags.push(`<span class="flag warn">${derived.mismatch.length} width mismatch</span>`);
    if (derived.below.length) flags.push(`<span class="flag bad">${derived.below.length} below floor</span>`);
    $('#stFlags').innerHTML = flags.join('');
  }
  function refreshHud() {
    const p = partMap[ui.activePart];
    const hud = $('#hud');
    if (solving) { hud.innerHTML = '<b>Auto loop</b> · searching for pieces that close the track…<br><kbd>Esc</kbd> cancel'; return; }
    if (suggest) {
      const o = suggest.options[suggest.idx], n = suggest.options.length;
      const names = {};
      o.pieces.forEach((pc) => { const pp = partMap[pc.part]; const k = shortLabel(pp, pc).replace(/[↰↱]/g, ''); names[k] = (names[k] || 0) + 1; });
      hud.innerHTML = `<b>Auto loop</b> · option ${suggest.idx + 1} of ${n} · ${o.pieces.length} piece${o.pieces.length === 1 ? '' : 's'}${o.adapters ? ` incl. ${o.adapters} adapter${o.adapters === 1 ? '' : 's'}` : ''}${o.outside ? ` · ${o.outside} outside workspace` : ''}<br>` +
        `${Object.entries(names).map(([k, v]) => `${v}× ${esc(k)}`).join(', ')}<br>` +
        `${n > 1 ? '<kbd>←</kbd><kbd>→</kbd> other options · ' : ''}<kbd>Enter</kbd> add these pieces · <kbd>Esc</kbd> cancel`;
      return;
    }
    if (ui.tool === 'place') {
      hud.innerHTML = `Placing <b>${esc(p ? p.name : '?')}</b> · ${ui.width} · ${p && p.type === 'curve' ? (ui.dir === 'L' ? 'left' : 'right') + ' · ' : ''}${Math.round(ui.rotation)}°<br>` +
        `Click to place · <kbd>↑</kbd><kbd>↓</kbd> curves · <kbd>←</kbd><kbd>→</kbd> straights · <kbd>R</kbd> rotate · <kbd>F</kbd> flip · <kbd>Enter</kbd> add to end · <kbd>V</kbd> select`;
    } else {
      hud.innerHTML = selection.size
        ? `<b>${selection.size}</b> selected · drag to move · <kbd>Del</kbd> delete · <kbd>R</kbd> rotate · <kbd>F</kbd> flip${selection.size === 1 ? ' · arrows swap piece' : ''} · double-click selects chain`
        : `Click a piece to select · drag to box-select · drag empty space with <kbd>Space</kbd> or right mouse to pan · <kbd>P</kbd> place`;
    }
  }
  function sourceLink(src) { const s = P.SOURCES[src]; return s && s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc((s && s.label) || 'Custom'); }
  function refreshSide() {
    const rows = derived.bom.rows, st = derived.stats;
    const bom = $('#tab-bom');
    if (!rows.length) bom.innerHTML = '<div class="empty">No pieces yet.<br>Pick a piece on the left and click the grid — or press <kbd>Enter</kbd> to start a track.</div>';
    else {
      bom.innerHTML = `<table class="bom-table"><thead><tr><th>Qty</th><th>Part</th><th class="n">g</th><th class="n">Time</th></tr></thead><tbody>` +
        rows.map((r) => `<tr><td><span class="qty" style="background:${famColors(r.part || { group: 'ramp' }).accent}">${r.qty}</span></td><td>${esc(r.name)}${r.width === 'double' ? ' <b>· double</b>' : ''}
          <span class="sub">${r.L || r.R ? [r.L ? `${r.L}× left` : '', r.R ? `${r.R}× right` : ''].filter(Boolean).join(', ') + ' · ' : ''}${r.usedAsRamp ? `${r.usedAsRamp}× as ramp bed · ` : ''}${sourceLink(r.source)}</span></td>
          <td class="n">${Math.round(r.gramsTotal)}<span class="sub">${Math.round(r.gramsEach)} ea</span></td><td class="n">${BP.fmtTime(r.minutesTotal)}</td></tr>`).join('') +
        `</tbody><tfoot><tr><td>${rows.reduce((a, r) => a + r.qty, 0)}</td><td>Total to print</td><td class="n">${fmtG(st.grams)}</td><td class="n">${BP.fmtTime(st.minutes)}</td></tr></tfoot></table>
        <div class="row-btns"><button class="sbtn" data-act="csv">Download CSV</button><button class="sbtn" data-act="copybom">Copy as text</button><button class="sbtn" data-act="png">Blueprint PNG</button></div>
        <p class="note">PETG estimates use ${settings.wallThickness} mm walls, ${settings.floorThickness} mm floor, ${Math.round(settings.solidity * 100)}% solidity and ${settings.gramsPerHour} g/h. Enter slicer values per part in Settings → Parts for exact numbers. Supports are counted at every raised joint.</p>`;
    }
    const ins = $('#tab-inspect');
    if (selection.size === 1) {
      const d = derived.byId[[...selection][0]]; if (!d) return;
      const p = d.p, e = estimate(partMap[d.part.bomAs] || d.part, p.width);
      const opts = visibleParts().map((q) => `<option value="${q.id}" ${q.id === p.part ? 'selected' : ''}>${esc(q.name)}</option>`).join('');
      ins.innerHTML = `<dl class="kv">
        <dt>Piece</dt><dd><select id="insPart" style="width:100%">${opts}</select></dd>
        <dt>Width</dt><dd><div class="seg" id="insWidth"><button data-v="single" class="${p.width === 'single' ? 'on' : ''}">Single</button><button data-v="double" class="${p.width === 'double' ? 'on' : ''}">Double</button></div></dd>
        ${d.part.type === 'curve' ? `<dt>Direction</dt><dd><div class="seg" id="insDir"><button data-v="L" class="${p.dir === 'L' ? 'on' : ''}">Left</button><button data-v="R" class="${p.dir === 'R' ? 'on' : ''}">Right</button></div></dd>` : ''}
        <dt>Position</dt><dd>${Math.round(p.x)}, ${Math.round(p.y)} mm</dd>
        <dt>Heading</dt><dd>${Math.round(p.a * 10) / 10}°</dd>
        <dt>Elevation</dt><dd>${Math.round(d.z0)} → ${Math.round(d.z1)} mm</dd>
        <dt>Run length</dt><dd>${Math.round(d.length)} mm</dd>
        <dt>Est. print</dt><dd>${Math.round(e.grams)} g · ${BP.fmtTime(e.minutes)}</dd>
        <dt>Source</dt><dd>${sourceLink(d.part.source)}</dd>
        ${d.part.note ? `<dt></dt><dd class="note">${esc(d.part.note)}</dd>` : ''}
        ${d.part.nominal ? '<dt></dt><dd class="note">Nominal dimensions — verify against the STL.</dd>' : ''}
      </dl>
      <div class="row-btns"><button class="sbtn" data-act="rotate">⟳ Rotate</button>${d.part.type === 'curve' ? '<button class="sbtn" data-act="flip">⇋ Flip</button>' : ''}<button class="sbtn" data-act="chain">Select chain</button><button class="sbtn danger" data-act="delete">Delete</button></div>`;
      $('#insPart').onchange = (ev) => replacePiece(p.id, { part: ev.target.value });
      $$('#insWidth button').forEach((b) => (b.onclick = () => replacePiece(p.id, { width: b.dataset.v })));
      $$('#insDir button').forEach((b) => (b.onclick = () => replacePiece(p.id, { dir: b.dataset.v })));
    } else if (selection.size > 1) {
      let L = 0; selection.forEach((id) => { const d = derived.byId[id]; if (d) L += d.length; });
      ins.innerHTML = `<p><b>${selection.size}</b> pieces selected · ${fmtLen(L)} of track.</p><div class="row-btns"><button class="sbtn" data-act="rotate">⟳ Rotate group</button><button class="sbtn" data-act="flip">⇋ Flip curves</button><button class="sbtn danger" data-act="delete">Delete</button></div>`;
    } else {
      ins.innerHTML = `<dl class="kv"><dt>Title</dt><dd>${esc(design.title)}</dd><dt>Created</dt><dd>${new Date(design.created).toLocaleString()}</dd>
        <dt>Modified</dt><dd>${new Date(design.modified).toLocaleString()}</dd><dt>Lane</dt><dd>${settings.laneWidth} mm, walls ${settings.wallHeight} mm</dd>
        <dt>Width</dt><dd>single ${W('single')} mm · double ${W('double')} mm</dd><dt>Elevation</dt><dd>${Math.round(derived.zMin)} → ${Math.round(derived.zMax)} mm</dd></dl>
        <p class="note">Select a piece (press <kbd>V</kbd>) to edit it here.</p>`;
    }
  }
  function syncControls() {
    $$('[data-width]').forEach((b) => b.classList.toggle('on', b.dataset.width === ui.width));
    $$('[data-dir]').forEach((b) => b.classList.toggle('on', b.dataset.dir === ui.dir));
    $('#trackTitle').value = design.title;
    refreshHud();
  }

  /* ---------- palette ---------- */
  function buildPalette() {
    const host = $('#paletteGroups'), q = ($('#partSearch').value || '').toLowerCase();
    host.innerHTML = '';
    const makeCard = (p) => {
      const b = document.createElement('button'), fam = famColors(p);
      b.className = 'pcard' + (p.id === ui.activePart ? ' on' : ''); b.dataset.part = p.id; b.title = p.name + (p.nominal ? ' (nominal dimensions)' : '');
      b.style.setProperty('--fam', fam.accent); b.style.setProperty('--fam-soft', fam.soft);
      const meta = p.type === 'curve' ? `${p.angle}° · IR ${p.ir}${p.style === 'digital' ? ' · digital' : ''}` : p.rise ? `${p.rise > 0 ? '+' : ''}${p.rise} mm · ${p.length} plan` : p.obstacle ? `${p.length} mm insert` : `${Math.round(p.length * 10) / 10} mm`;
      if (p.note) b.title += ' — ' + p.note;
      const title = p.type === 'curve' ? `${p.angle}° curve` : p.name;
      b.innerHTML = `${p.id === settings.defaultStraight || p.id === settings.defaultCurve ? '<span class="pdef">DEFAULT</span>' : ''}<canvas></canvas><div class="pname">${esc(title)}</div><div class="pmeta">${meta}</div>`;
      requestAnimationFrame(() => drawThumb($('canvas', b), p));
      b.addEventListener('pointerdown', (e) => startPaletteDrag(e, p.id));
      return b;
    };
    const section = (parent, label, fam, items, note) => {
      const head = document.createElement('div'); head.className = 'psub';
      head.style.setProperty('--fam', fam.accent);
      head.innerHTML = `<i></i><span>${esc(label)}</span>${note ? `<small>${esc(note)}</small>` : ''}`;
      const grid = document.createElement('div'); grid.className = 'pgrid';
      items.forEach((p) => grid.appendChild(makeCard(p)));
      parent.appendChild(head); parent.appendChild(grid);
    };
    P.GROUPS.forEach((grp) => {
      const items = visibleParts().filter((p) => p.group === grp.id && (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)))
        .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
      if (!items.length) return;
      const det = document.createElement('details'); det.className = 'pgroup'; det.open = true;
      det.innerHTML = `<summary><span class="grp-label">${grp.label}</span>${grp.hint ? `<kbd>${grp.hint}</kbd>` : ''}</summary><div class="pbody"></div>`;
      const body = $('.pbody', det);
      if (grp.id === 'curve') {
        const irs = [...new Set(items.map((p) => p.ir))].sort((a, b) => a - b);
        irs.forEach((ir) => { const its = items.filter((p) => p.ir === ir); section(body, `Inner radius ${ir} mm`, famColors(its[0]), its, `Ø ${ir * 2}`); });
      } else {
        const lbl = { ramp: 'Ramp beds & lower-level runs', adapter: 'Odd lengths that make loops close', obstacle: 'Everyday barriers · S250 footprint' }[grp.id] || 'Straight lengths';
        section(body, lbl, famColors(items[0]), items);
      }
      host.appendChild(det);
    });
  }
  function drawThumb(cv, part) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(10, r.width * dpr); cv.height = Math.max(10, r.height * dpr);
    const c = cv.getContext('2d'), w = W('single');
    const fake = { id: 't', part: part.id, x: 0, y: 0, a: part.type === 'curve' ? -part.angle / 2 : 0, z: 0, dir: 'R', width: 'single' };
    const d = pieceGeom(fake);
    const b = d.bbox, pad = 6 * dpr, sc = Math.min((cv.width - 2 * pad) / (b.x1 - b.x0), (cv.height - 2 * pad) / (b.y1 - b.y0));
    c.setTransform(sc, 0, 0, sc, cv.width / 2 - ((b.x0 + b.x1) / 2) * sc, cv.height / 2 - ((b.y0 + b.y1) / 2) * sc);
    const pl = (pts) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); };
    const fam = famColors(part);
    pl(d.outline); c.closePath(); c.fillStyle = fam.floor; c.fill();
    c.strokeStyle = fam.wall; c.lineWidth = Math.max(w * 0.05, 1.5 / sc);
    pl(d.railL); c.stroke(); pl(d.railR); c.stroke();
    if (part.obstacle) window.TinyTMTMarks.draw(c, part, w, { wallT: settings.wallThickness, px: 1 / sc, color: fam.wall, laneWidth: settings.laneWidth });
  }
  function startPaletteDrag(e, partId) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, card = e.currentTarget;
    card.setPointerCapture(e.pointerId);
    let started = false, label = null;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        started = true; paletteDrag = { partId }; ui.activePart = partId; setActivePart(partId, true);
        label = document.createElement('div'); label.className = 'drag-ghost'; label.textContent = partMap[partId].name; document.body.appendChild(label);
      }
      if (!started) return;
      label.style.left = ev.clientX + 'px'; label.style.top = ev.clientY + 'px';
      const r = canvas.getBoundingClientRect();
      const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      pointerOnCanvas = over; pointerWorld = over ? toWorld(ev.clientX - r.left, ev.clientY - r.top) : null;
      label.style.display = over ? 'none' : '';
      updateGhost();
    };
    const up = (ev) => {
      card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up);
      if (label) label.remove();
      if (!started) { setActivePart(partId); canvas.focus(); return; }
      const r = canvas.getBoundingClientRect();
      const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (over && ghost) placeGhost();
      paletteDrag = null; setTool('place'); pointerOnCanvas = over; updateGhost(); canvas.focus();
    };
    card.addEventListener('pointermove', move); card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
  }

  /* ---------- canvas input ---------- */
  function hitPiece(w) { for (let i = derived.pieces.length - 1; i >= 0; i--) if (localHit(derived.pieces[i], w.x, w.y, 0) >= 0) return derived.pieces[i].p.id; return null; }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (suggest) cancelSuggest();
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    const w = eventWorld(e), r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (e.button === 1 || e.button === 2 || spaceDown) { drag = { type: 'pan', sx, sy, ox: view.ox, oy: view.oy }; canvas.style.cursor = 'grabbing'; return; }
    if (e.button !== 0) return;
    if (ui.tool === 'place') { pointerWorld = w; pointerOnCanvas = true; updateGhost(); drag = { type: 'place', sx, sy, ox: view.ox, oy: view.oy }; return; }
    const hit = hitPiece(w);
    const oc = nearestOpen(w);
    if (oc && (!hit || Math.hypot(oc.x - w.x, oc.y - w.y) < 12 / view.s)) { activeEnd = { pid: oc.pid, end: oc.end }; render(); toast('Active end set — press P then Enter to add pieces here.', 1600); }
    if (hit) {
      if (e.shiftKey) { selection.has(hit) ? selection.delete(hit) : selection.add(hit); refresh(); return; }
      if (!selection.has(hit)) { selection = new Set([hit]); }
      const moving = new Set(selection);
      const targets = derived.connectors.filter((c) => !moving.has(c.pid) && (!derived.partner[c.pid + ':' + c.end] || moving.has(derived.partner[c.pid + ':' + c.end].pid)));
      const movers = [];
      moving.forEach((id) => [0, 1].forEach((end) => { const q = derived.partner[id + ':' + end]; if (!q || !moving.has(q.pid)) movers.push(derived.byId[id].conns[end]); }));
      drag = { type: 'move', start: w, before: snap(), orig: design.pieces.filter((p) => moving.has(p.id)).map((p) => ({ id: p.id, x: p.x, y: p.y, a: p.a, z: p.z })), moving, targets, movers, moved: false };
      refresh();
    } else {
      if (!e.shiftKey) selection.clear();
      drag = { type: 'band', start: w, cur: w, add: e.shiftKey, base: new Set(selection) };
      refresh();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, w = toWorld(sx, sy);
    pointerWorld = w; pointerOnCanvas = true;
    $('#stCursor').textContent = `x ${Math.round(w.x)} · y ${Math.round(w.y)} mm`;
    if (!drag) {
      if (ui.tool === 'place') updateGhost();
      else { const h = hitPiece(w); if (h !== hoverPid) { hoverPid = h; canvas.style.cursor = h ? 'move' : 'default'; render(); } }
      return;
    }
    if (drag.type === 'place' && Math.hypot(sx - drag.sx, sy - drag.sy) > 5) { drag.type = 'pan'; canvas.style.cursor = 'grabbing'; ghost = null; }
    if (drag.type === 'pan') { view.ox = drag.ox + (sx - drag.sx); view.oy = drag.oy + (sy - drag.sy); render(); return; }
    if (drag.type === 'band') {
      drag.cur = w;
      const x0 = Math.min(drag.start.x, w.x), x1 = Math.max(drag.start.x, w.x), y0 = Math.min(drag.start.y, w.y), y1 = Math.max(drag.start.y, w.y);
      selection = new Set(drag.base);
      derived.pieces.forEach((d) => { if (d.bbox.x0 <= x1 && d.bbox.x1 >= x0 && d.bbox.y0 <= y1 && d.bbox.y1 >= y0 && d.center.some((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)) selection.add(d.p.id); });
      render(); return;
    }
    if (drag.type === 'move') moveDrag(w);
  });
  function moveDrag(w) {
    let dx = w.x - drag.start.x, dy = w.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * view.s < 3) return;
    drag.moved = true;
    const lim = settings.snapPx / view.s;
    const byId = {}; design.pieces.forEach((p) => { byId[p.id] = p; });
    if (drag.orig.length === 1) {
      const o = drag.orig[0], p = byId[o.id], part = partMap[p.part];
      const cand = Object.assign({}, p, { x: o.x + dx, y: o.y + dy, a: o.a, z: o.z });
      const cd = pieceGeom(cand);
      let best = null, bd = lim;
      cd.conns.forEach((mc) => drag.targets.forEach((t) => { const dd = Math.hypot(mc.x - t.x, mc.y - t.y); if (dd < bd) { bd = dd; best = { mc, t }; } }));
      if (best) {
        const t = best.t;
        if (best.mc.end === 0) Object.assign(p, { x: t.x, y: t.y, a: t.out, z: t.z });
        else { Object.assign(p, G.solveEntry({ x: t.x, y: t.y, a: G.norm(t.out + 180) }, G.exitLocal(part, p.dir, W(p.width)))); p.z = t.z - (part.rise || 0); }
      } else Object.assign(p, { x: snapGrid(cand.x), y: snapGrid(cand.y), a: o.a, z: o.z });
      p.x = round3(p.x); p.y = round3(p.y); p.a = round3(G.norm(p.a));
    } else {
      let best = null, bd = lim;
      drag.movers.forEach((mc) => drag.targets.forEach((t) => {
        if (G.angDiff(mc.out, t.out + 180) > 1) return;
        const dd = Math.hypot(mc.x + dx - t.x, mc.y + dy - t.y); if (dd < bd) { bd = dd; best = { mc, t }; }
      }));
      if (best) { dx = best.t.x - best.mc.x; dy = best.t.y - best.mc.y; }
      else if (settings.snapToGrid) { const g = settings.gridSize; dx = Math.round(dx / g) * g; dy = Math.round(dy / g) * g; }
      drag.orig.forEach((o) => { const p = byId[o.id]; p.x = round3(o.x + dx); p.y = round3(o.y + dy); });
    }
    derived = derive(); render(); refreshStats();
  }
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.type === 'place') placeGhost();
    else if (d.type === 'move' && d.moved) { if (snap() !== d.before) { pushUndo(d.before); afterChange(); } }
    else if (d.type === 'band') refresh();
    canvas.style.cursor = ui.tool === 'place' ? 'crosshair' : 'default';
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    updateGhost();
  });
  canvas.addEventListener('pointerleave', () => { pointerOnCanvas = false; if (!drag) { ghost = null; hoverPid = null; render(); } });
  canvas.addEventListener('dblclick', (e) => { if (ui.tool !== 'select') return; const h = hitPiece(eventWorld(e)); if (h) { selection = chainOf(h); refresh(); } });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (settings.wheel === 'zoom' || e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    else { view.ox -= e.deltaX; view.oy -= e.deltaY; render(); }
  }, { passive: false });
  new ResizeObserver(() => render()).observe(canvas);

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) { if (e.key === 'Enter' && e.target.id === 'trackTitle') e.target.blur(); return; }
    if (!$('#modalBackdrop').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (solving && e.key === 'Escape') { if (window.TinyTMTSolver.solveAsync.cancel) window.TinyTMTSolver.solveAsync.cancel(); return; }
    if (suggest) {
      const k2 = e.key, n = suggest.options.length;
      if (k2 === 'ArrowRight' || k2 === 'ArrowDown') { e.preventDefault(); suggest.idx = (suggest.idx + 1) % n; refreshHud(); render(); return; }
      if (k2 === 'ArrowLeft' || k2 === 'ArrowUp') { e.preventDefault(); suggest.idx = (suggest.idx - 1 + n) % n; refreshHud(); render(); return; }
      if (k2 === 'Enter') { e.preventDefault(); acceptSuggest(); return; }
      if (k2 === 'Escape') { cancelSuggest(); return; }
      if (!['Shift', 'Control', 'Meta', 'Alt'].includes(k2)) cancelSuggest();
    }
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); saveToLibrary(); return; }
    if (mod && k.toLowerCase() === 'o') { e.preventDefault(); openLibrary(); return; }
    if (mod && k.toLowerCase() === 'e') { e.preventDefault(); exportPng(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setTool('select'); selection = new Set(design.pieces.map((p) => p.id)); refresh(); return; }
    if (mod) return;
    switch (k) {
      case 'ArrowUp': e.preventDefault(); cycle('curve', 1); break;
      case 'ArrowDown': e.preventDefault(); cycle('curve', -1); break;
      case 'ArrowRight': e.preventDefault(); cycle('straight', 1); break;
      case 'ArrowLeft': e.preventDefault(); cycle('straight', -1); break;
      case 'r': case 'R': rotateSelection(e.shiftKey ? -1 : 1); break;
      case 'f': case 'F': flip(); break;
      case 'w': case 'W': setWidth(ui.width === 'single' ? 'double' : 'single'); break;
      case 'v': case 'V': setTool('select'); break;
      case 'l': case 'L': runAutoLoop(); break;
      case 'p': case 'P': setTool('place'); break;
      case 'Enter': e.preventDefault(); if (ui.tool !== 'place') setTool('place'); appendAtActiveEnd(); break;
      case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(); break;
      case 'Escape': if (selection.size) { selection.clear(); refresh(); } else if (ui.tool === 'place') setTool('select'); break;
      case ' ': if (!spaceDown) { spaceDown = true; canvas.style.cursor = 'grab'; } e.preventDefault(); break;
      case '0': fitView(); break;
      case '9': fitToTrack(); break;
      case '+': case '=': { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); break; }
      case '-': case '_': { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); break; }
      case '?': showHelp(); break;
      default: return;
    }
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; canvas.style.cursor = ui.tool === 'place' ? 'crosshair' : 'default'; } });
  function fitToTrack() {
    if (!derived.pieces.length) return fitView();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    derived.pieces.forEach((d) => { x0 = Math.min(x0, d.bbox.x0); y0 = Math.min(y0, d.bbox.y0); x1 = Math.max(x1, d.bbox.x1); y1 = Math.max(y1, d.bbox.y1); });
    fitView({ x0: x0 - 150, y0: y0 - 150, x1: x1 + 150, y1: y1 + 150 });
  }

  /* ---------- auto loop ---------- */
  let suggest = null; // { options: [{pieces, ds, adapters, outside}], idx, st }
  let solving = false;
  function autoCurveDefs() {
    const vis = visibleParts().filter((p) => p.type === 'curve' && p.style !== 'digital');
    const def = partMap[settings.defaultCurve];
    const used = new Set(design.pieces.map((p) => p.part));
    let list;
    if (settings.autoCurves === 'all') list = vis;
    else if (settings.autoCurves === 'cycle') list = cycleList('curve').filter((p) => p.style !== 'digital');
    else if (settings.autoCurves === 'defaultIR') list = vis.filter((p) => def && p.ir === def.ir);
    else {
      const irs = new Set(design.pieces.map((p) => partMap[p.part]).filter((p) => p && p.type === 'curve').map((p) => p.ir));
      if (def) irs.add(def.ir);
      list = vis.filter((p) => irs.has(p.ir));
    }
    return list.map((p) => ({ id: p.id, ir: p.ir, angle: p.angle, pref: used.has(p.id) || p.id === settings.defaultCurve }));
  }
  function autoStraightDefs() {
    return visibleParts().filter((p) => p.type === 'straight' && !p.rise && !p.obstacle && (p.group === 'straight' || (settings.autoAdapters && p.group === 'adapter')))
      .map((p) => ({ id: p.id, length: p.length, adapter: p.group === 'adapter' }));
  }
  function effectiveMaxCurves(nTypes) {
    let M = settings.autoMaxCurves; const b = Math.max(2, 2 * nTypes);
    while (M > 2 && Math.pow(b, M) > 4e6) M--;
    return M;
  }
  /** Picks the two loose ends to join and decides, cheaply, whether a closure is even possible. */
  function autoLoopEnds() {
    if (!design.pieces.length) return { reason: 'Place some track first.' };
    if (!derived.openConnectors.length) return { reason: 'The track is already a closed loop.' };
    const comps = [], seen = new Set();
    derived.pieces.forEach((d) => { if (seen.has(d.p.id)) return; const c = chainOf(d.p.id); c.forEach((id) => seen.add(id)); comps.push(c); });
    const opensOf = (comp) => derived.openConnectors.filter((c) => comp.has(c.pid));
    const ac = activeConn();
    let ends = null;
    if (ac) { const comp = comps.find((c) => c.has(ac.pid)); if (comp) { const o = opensOf(comp); if (o.length === 2) ends = o; } }
    if (!ends) { const two = comps.map(opensOf).filter((o) => o.length === 2); if (two.length === 1 || (two.length && comps.length === 1)) ends = two[0]; else if (two.length) ends = two.sort((x, y) => y.length - x.length)[0]; }
    if (!ends) return { reason: comps.length > 1 ? 'Auto loop joins the two loose ends of one run of track — connect or remove the separate pieces first.' : 'Auto loop needs exactly two loose ends.' };
    let [a, b] = ends;
    if (ac && b.pid === ac.pid && b.end === ac.end) [a, b] = [b, a];
    else if (!(ac && a.pid === ac.pid && a.end === ac.end) && a.end === 0 && b.end === 1) [a, b] = [b, a];
    if (a.width !== b.width) return { reason: 'The two loose ends are different widths.' };
    if (Math.abs(a.z - b.z) > 0.5) return { reason: `The loose ends are at different heights (${Math.round(a.z)} mm and ${Math.round(b.z)} mm) — auto loop doesn't add ramps.` };
    const curves = autoCurveDefs(), straights = autoStraightDefs();
    const tw = W(a.width), startH = a.out, targetH = G.norm(b.out + 180);
    const diff = G.norm(targetH - startH);
    let turn = Math.min(diff, 360 - diff);
    // Same heading but the target is behind the start: the track has to come all the way round (360°).
    const ux = Math.cos(startH * G.D2R), uy = Math.sin(startH * G.D2R);
    if (turn < 1e-6 && ((b.x - a.x) * ux + (b.y - a.y) * uy) < -1) turn = 360;
    if (turn > 1e-6 && !curves.length) return { reason: 'No curves are available to the solver — check Settings → Auto loop.' };
    const maxAng = curves.reduce((m, c) => Math.max(m, c.angle), 0);
    const nC = turn < 1e-6 ? 0 : Math.ceil(turn / maxAng - 1e-9);
    const budget = settings.autoMaxPieces, maxC = effectiveMaxCurves(curves.length);
    if (nC > Math.min(budget, maxC)) return { reason: `The loose ends need at least ${nC} curves to line up — more than the ${Math.min(budget, maxC)} allowed.` };
    const chordMax = curves.reduce((m, c) => Math.max(m, 2 * (c.ir + tw / 2) * Math.sin(c.angle * G.D2R / 2)), 0);
    const Lmax = straights.reduce((m, s) => Math.max(m, s.length), 0);
    const reach = nC * chordMax + (budget - nC) * Math.max(Lmax, chordMax);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist > reach + 1) return { tooFar: true, reason: `The loose ends are ${(dist / 1000).toFixed(2)} m apart — further than ${budget} added pieces can reach (about ${(reach / 1000).toFixed(2)} m). Build closer, or raise the limit in Settings → Auto loop.` };
    return { a, b, dist, curves, straights, startH, targetH, W: tw, maxCurves: maxC, Lmax };
  }
  function refreshAutoButton() {
    const btn = $('#tAutoLoop'); if (!btn) return;
    const st = autoLoopEnds();
    btn.classList.toggle('is-disabled', !!st.reason);
    btn.setAttribute('aria-disabled', String(!!st.reason));
    btn.title = st.reason ? `Auto loop unavailable — ${st.reason}` : `Auto loop (L) — find pieces that join the two loose ends (${(st.dist / 1000).toFixed(2)} m apart)`;
  }
  function buildChain(items, a, width) {
    let pose = { x: a.x, y: a.y, a: a.out };
    const pieces = [], ds = [];
    for (const it of items) {
      if (!partMap[it.id]) return null;
      const p = { id: uid(), part: it.id, x: round3(pose.x), y: round3(pose.y), a: round3(G.norm(pose.a)), z: a.z, dir: it.dir < 0 ? 'L' : 'R', width };
      const d = pieceGeom(p); pieces.push(p); ds.push(d);
      pose = { x: d.conns[1].x, y: d.conns[1].y, a: d.conns[1].out };
    }
    return { pieces, ds, end: pose };
  }
  function validateChain(built, st) {
    const e = built.end;
    if (Math.hypot(e.x - st.b.x, e.y - st.b.y) > 1.4 || G.angDiff(e.a, st.targetH) > 0.5) return { ok: false };
    const ds = built.ds;
    const ws = derived.workspace, ov = derived.overflow;
    const inside = (r, q) => q.x >= r.x0 - 0.5 && q.x <= r.x1 + 0.5 && q.y >= r.y0 - 0.5 && q.y <= r.y1 + 0.5;
    let outside = 0;
    for (const d of ds) { if (!d.outline.every((q) => inside(ov, q))) return { ok: false }; if (!d.outline.every((q) => inside(ws, q))) outside++; }
    for (let i = 0; i < ds.length; i++) {
      for (const o of derived.pieces) {
        if ((i === 0 && o.p.id === st.a.pid) || (i === ds.length - 1 && o.p.id === st.b.pid)) continue;
        if (overlaps(ds[i], o)) return { ok: false };
      }
      for (let j = i + 2; j < ds.length; j++) if (overlaps(ds[i], ds[j])) return { ok: false };
    }
    return { ok: true, outside };
  }
  async function runAutoLoop() {
    if (solving) return;
    const st = autoLoopEnds();
    if (st.reason) { toast(st.reason, 4000); return; }
    cancelSuggest();
    solving = true; $('#tAutoLoop').classList.add('busy'); refreshHud();
    const before = snap();
    const params = {
      start: { x: st.a.x, y: st.a.y, a: st.a.out }, target: { x: st.b.x, y: st.b.y, a: st.targetH },
      curves: st.curves, straights: st.straights, W: st.W, maxPieces: settings.autoMaxPieces, maxCurves: st.maxCurves,
      maxGap: settings.autoMaxPieces * st.Lmax, tol: 1.2, timeLimit: settings.autoTimeLimit * 1000, maxResults: 150
    };
    let out;
    try { out = await window.TinyTMTSolver.solveAsync(params); }
    catch (err) { solving = false; $('#tAutoLoop').classList.remove('busy'); refreshHud(); if (err.message !== 'cancelled') toast('Auto loop stopped: ' + err.message); else toast('Auto loop cancelled.'); return; }
    solving = false; $('#tAutoLoop').classList.remove('busy');
    if (snap() !== before) { refreshHud(); toast('The design changed while searching — press Auto loop again.'); return; }
    const opts = [];
    for (const r of out.results) {
      const built = buildChain(r.items, st.a, st.a.width);
      if (!built) continue;
      const v = validateChain(built, st);
      if (!v.ok) continue;
      opts.push({ pieces: built.pieces, ds: built.ds, adapters: r.adapters, outside: v.outside, score: r.score + v.outside * 15 });
      if (opts.length >= 15) break;
    }
    opts.sort((x, y) => x.score - y.score);
    if (!opts.length) {
      let msg;
      if (out.results.length) msg = 'Closures exist, but every one found would overlap existing track or run off the overflow area.';
      else if (out.nearest != null && out.nearest < 40) msg = `No exact closure with these pieces — the nearest leaves a ${out.nearest.toFixed(1)} mm gap.` + (settings.autoAdapters ? ' Try allowing more pieces or curve sizes in Settings → Auto loop.' : ' Try allowing closure adapters in Settings → Auto loop.');
      else msg = 'No closure found within the piece and curve limits in Settings → Auto loop.';
      if (out.timedOut) msg += ' (The search hit its time limit.)';
      refreshHud(); toast(msg, 6000); return;
    }
    suggest = { options: opts.slice(0, 3), idx: 0, st };
    refreshHud(); render();
  }
  function acceptSuggest() {
    if (!suggest) return;
    const o = suggest.options[suggest.idx];
    suggest = null;
    mutate(() => design.pieces.push(...o.pieces));
    activeEnd = null;
    toast(derived.stats.openEnds === 0 ? `Loop closed — ${o.pieces.length} piece${o.pieces.length === 1 ? '' : 's'} added.` : `${o.pieces.length} pieces added.`);
    refresh();
  }
  function cancelSuggest() { if (suggest) { suggest = null; refreshHud(); render(); } }
  function drawSuggestion(ds) {
    const px = 1 / view.s;
    ds.forEach((d) => {
      poly(d.outline); ctx.closePath();
      ctx.fillStyle = 'rgba(46,158,106,.20)'; ctx.fill();
      ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = 1.8 * px; ctx.strokeStyle = '#2e9e6a'; ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = Math.max(d.wallT, 1.4 * px); ctx.strokeStyle = 'rgba(29,122,79,.7)';
      poly(d.railL); ctx.stroke(); poly(d.railR); ctx.stroke();
      if (settings.showLabels && d.W * view.s > 34) labelAt(d, d.shortLabel, '#1d7a4f');
    });
  }

  /* ---------- modal / toast ---------- */
  let modalOnClose = null;
  function modal({ title, html, node, buttons, small, onClose }) {
    $('#modalTitle').textContent = title;
    const body = $('#modalBody'); body.innerHTML = html || ''; if (node) body.appendChild(node);
    $('.modal').classList.toggle('small', !!small);
    const foot = $('#modalFoot'); foot.innerHTML = '';
    (buttons || []).forEach((b) => {
      const el = document.createElement('button'); el.className = 'sbtn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''); el.textContent = b.label;
      el.onclick = () => { if (!b.onClick || b.onClick() !== false) closeModal(); };
      foot.appendChild(el);
    });
    modalOnClose = onClose || null;
    $('#modalBackdrop').hidden = false;
    return body;
  }
  function closeModal() { $('#modalBackdrop').hidden = true; $('#modalBody').innerHTML = ''; const f = modalOnClose; modalOnClose = null; if (f) f(); canvas.focus(); }
  function ask(title, msg, ok, danger) { return new Promise((res) => modal({ title, html: `<p>${msg}</p>`, small: true, onClose: () => res(false), buttons: [{ label: 'Cancel' }, { label: ok, primary: !danger, danger, onClick: () => { modalOnClose = null; res(true); } }] })); }
  $('#modalClose').onclick = closeModal;
  $('#modalBackdrop').addEventListener('pointerdown', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  let toastT = 0;
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms || 2600); }

  /* ---------- save / load / export ---------- */
  function library() { return LS.get(KEYS.library, {}); }
  function partsUsed() { const ids = new Set(); design.pieces.forEach((p) => { ids.add(p.part); const pp = partMap[p.part]; if (pp && pp.bomAs) ids.add(pp.bomAs); }); return [...ids].map((id) => partMap[id]).filter(Boolean); }
  function exportDesign() { return Object.assign(clone(design), { app: 'TinyTMT track designer', geometry: { laneWidth: settings.laneWidth, wallThickness: settings.wallThickness, wallHeight: settings.wallHeight }, partsUsed: clone(partsUsed()) }); }
  function saveToLibrary() {
    const lib = library();
    design.modified = new Date().toISOString();
    let thumb = '';
    try { thumb = BP.render(derived, design, settings, { mini: true, width: 320 }).toDataURL('image/jpeg', 0.75); } catch (e) { /* ignore */ }
    lib[design.id] = { design: clone(design), thumb, savedAt: design.modified, stats: { length: derived.stats.length, pieces: derived.stats.pieces } };
    if (LS.set(KEYS.library, lib)) { dirty = false; autosave(); refresh(); toast(`Saved “${design.title}” to this browser.`); }
    else toast('Could not save — browser storage is full or unavailable. Use Export → Design file instead.', 4000);
  }
  async function loadDesign(d, opts) {
    if (dirty && !(opts && opts.force) && design.pieces.length && !(await ask('Discard unsaved changes?', `“${esc(design.title)}” has unsaved changes.`, 'Discard', true))) return false;
    (d.partsUsed || []).forEach((pp) => {
      if (!partMap[pp.id]) { settings.customParts.push(Object.assign({}, pp, { source: 'custom' })); }
    });
    if (d.partsUsed && d.partsUsed.some((pp) => !P.DEFAULT_PARTS.find((q) => q.id === pp.id))) { LS.set(KEYS.settings, settings); buildParts(); buildPalette(); }
    design = { format: 'tinytmt-design', version: 1, id: d.id || uid(), title: d.title || NAMES.randomTitle(), created: d.created || new Date().toISOString(), modified: d.modified || new Date().toISOString(), pieces: (d.pieces || []).map((p) => ({ id: p.id || uid(), part: p.part, x: +p.x || 0, y: +p.y || 0, a: +p.a || 0, z: +p.z || 0, dir: p.dir === 'L' ? 'L' : 'R', width: p.width === 'double' ? 'double' : 'single' })) };
    undoStack = []; redoStack = []; selection.clear(); activeEnd = null; dirty = !!(opts && opts.dirty);
    syncControls(); refresh(); autosave();
    if (design.pieces.length) { const last = design.pieces[design.pieces.length - 1]; activeEnd = { pid: last.id, end: 1 }; }
    render();
    return true;
  }
  async function newTrack() {
    if (dirty && design.pieces.length && !(await ask('Start a new design?', 'Unsaved changes to the current design will be lost.', 'Start new', true))) return;
    await loadDesign(newDesign(), { force: true }); fitView(); toast(`New track: “${design.title}”`);
  }
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const slug = (s) => (s || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'track';
  function exportJson() { download(`${slug(design.title)}.tinytmt.json`, new Blob([JSON.stringify(exportDesign(), null, 2)], { type: 'application/json' })); }
  function bomCsv() {
    const rows = [['Qty', 'Part', 'Part ID', 'Width', 'Left', 'Right', 'g each', 'g total', 'min each', 'min total', 'Source']];
    derived.bom.rows.forEach((r) => rows.push([r.qty, r.name, r.printId, r.width, r.L || '', r.R || '', r.gramsEach.toFixed(1), r.gramsTotal.toFixed(1), r.minutesEach.toFixed(0), r.minutesTotal.toFixed(0), (P.SOURCES[r.source] || {}).url || '']));
    rows.push([]); rows.push(['Track', design.title]); rows.push(['Length (m)', (derived.stats.length / 1000).toFixed(3)]); rows.push(['Total g', derived.stats.grams.toFixed(0)]); rows.push(['Total print min', derived.stats.minutes.toFixed(0)]);
    return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
  }
  function exportCsv() { download(`${slug(design.title)}-bom.csv`, new Blob([bomCsv()], { type: 'text/csv' })); }
  function exportPng() {
    const cv = BP.render(derived, design, settings, {});
    cv.toBlob((b) => { download(`${slug(design.title)}-blueprint.png`, b); toast('Blueprint PNG downloaded.'); }, 'image/png');
  }
  function copyBom() {
    const txt = `${design.title}\n` + derived.bom.rows.map((r) => `${r.qty} × ${r.name}${r.width === 'double' ? ' (double)' : ''} — ${Math.round(r.gramsTotal)} g`).join('\n') + `\nTotal: ${fmtG(derived.stats.grams)}, ${BP.fmtTime(derived.stats.minutes)}`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('BoM copied.'), () => toast('Clipboard unavailable.'));
  }
  async function importFile(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.pieces)) throw new Error('not a design');
      if (await loadDesign(d, { dirty: true })) { fitToTrack(); toast(`Imported “${design.title}”.`); }
    } catch (e) { toast('That file is not a TinyTMT design (.json).', 3500); }
  }
  function openLibrary() {
    const lib = library(), entries = Object.values(lib).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    const node = document.createElement('div');
    node.innerHTML = `<div class="row-btns" style="margin:0 0 14px"><button class="sbtn primary" data-l="import">Import design file…</button><span class="note" style="align-self:center">Designs are stored in this browser only. Export files to back them up or share.</span></div>` +
      (entries.length ? `<div class="lib-grid">${entries.map((en) => `<div class="lib-card" data-id="${en.design.id}">${en.thumb ? `<img src="${en.thumb}" alt="">` : '<img alt="">'}
        <div class="meta"><strong>${esc(en.design.title)}</strong>${new Date(en.savedAt).toLocaleString()}<br>${en.stats ? `${en.stats.pieces} pieces · ${fmtLen(en.stats.length)}` : ''}</div>
        <div class="row-btns"><button class="sbtn primary" data-l="open">Open</button><button class="sbtn" data-l="dup">Duplicate</button><button class="sbtn" data-l="dl" title="Download .json">⬇</button><button class="sbtn danger" data-l="del">Delete</button></div></div>`).join('')}</div>`
        : '<div class="empty">No saved designs yet. Press <kbd>Ctrl S</kbd> to save the current one.</div>');
    node.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      if (b.dataset.l === 'import') { closeModal(); $('#fileInput').click(); return; }
      const id = b.closest('.lib-card').dataset.id, en = library()[id]; if (!en) return;
      if (b.dataset.l === 'open') { closeModal(); if (await loadDesign(en.design)) { fitToTrack(); toast(`Opened “${design.title}”.`); } }
      if (b.dataset.l === 'dup') { const d = clone(en.design); d.id = uid(); d.title = d.title + ' (copy)'; closeModal(); if (await loadDesign(d, { dirty: true })) fitToTrack(); }
      if (b.dataset.l === 'dl') download(`${slug(en.design.title)}.tinytmt.json`, new Blob([JSON.stringify(en.design, null, 2)], { type: 'application/json' }));
      if (b.dataset.l === 'del') {
        if (b.dataset.confirm) { const l = library(); delete l[id]; LS.set(KEYS.library, l); b.closest('.lib-card').remove(); toast('Deleted.'); }
        else { b.dataset.confirm = '1'; b.textContent = 'Sure?'; }
      }
    });
    modal({ title: 'Saved designs', node });
  }

  function openSamples() {
    const list = window.TinyTMTSamples || [];
    const node = document.createElement('div');
    const saved = design;
    const thumbs = list.map((sm) => { try { design = sm; const dv = derive(); return BP.render(dv, sm, settings, { mini: true, width: 320 }).toDataURL('image/jpeg', 0.8); } catch (e) { return ''; } finally { design = saved; } });
    derived = derive();
    node.innerHTML = `<p class="note" style="margin-top:0">Ready-made courses to start from. Opening one replaces the current design (you'll be asked first if it has unsaved changes).</p>
      <div class="lib-grid">${list.map((sm, i) => `<div class="lib-card">${thumbs[i] ? `<img src="${thumbs[i]}" alt="">` : ''}<div class="meta"><strong>${esc(sm.title)}</strong>${esc(sm.blurb || '')}<br>${sm.pieces.length} pieces${sm.pieces[0] && sm.pieces[0].width === 'double' ? ' · double width' : ''}</div>
      <div class="row-btns"><button class="sbtn primary" data-sample="${i}">Open</button></div></div>`).join('')}</div>`;
    node.addEventListener('click', async (e) => {
      const sb = e.target.closest('[data-sample]'); if (!sb) return;
      const d = clone(list[+sb.dataset.sample]); d.id = uid(); delete d.blurb; closeModal();
      if (await loadDesign(d, { dirty: true })) { fitToTrack(); toast(`Opened sample “${design.title}” — save it to keep your changes.`); }
    });
    modal({ title: 'Sample tracks', node });
  }

  /* ---------- settings ---------- */
  const FIELDS = {
    General: [
      ['workspaceW', 'Workspace width', 'mm'], ['workspaceH', 'Workspace depth', 'mm'], ['overflowPct', 'Overflow area', '% extra around workspace'],
      ['gridSize', 'Grid size', 'mm'], ['majorEvery', 'Major grid every', 'cells'], ['snapToGrid', 'Snap to grid', 'bool'],
      ['snapPx', 'Snap distance', 'screen px'], ['rotationStep', 'Rotation step', 'deg', [15, 22.5, 30, 45, 90]],
      ['wheel', 'Mouse wheel', '', ['zoom', 'pan']], ['showLabels', 'Show piece labels', 'bool'], ['showCenterline', 'Show centre line', 'bool']
    ],
    Track: [
      ['laneWidth', 'Lane width', 'mm (Tamiya: 115)'], ['wallThickness', 'Wall thickness', 'mm'], ['wallHeight', 'Wall height', 'mm (Tamiya: 50)'],
      ['floorThickness', 'Floor thickness', 'mm'], ['defaultWidth', 'Default width', '', ['single', 'double']],
      ['defaultStraight', 'Default straight', '', 'straights'], ['defaultCurve', 'Default curve', '', 'curves'], ['clearance', 'Pass-under clearance', 'mm between levels']
    ],
    'Auto loop': [
      ['autoMaxPieces', 'Max pieces to add', 'pieces · also sets how far apart the ends can be'],
      ['autoMaxCurves', 'Max curves to add', 'curves (lowered automatically if the search would be too big)'],
      ['autoCurves', 'Curves the solver may use', '', [['design', 'Curve sizes already in the design'], ['defaultIR', 'Default curve size only'], ['cycle', 'Arrow-key cycle curves'], ['all', 'All curves (slower)']]],
      ['autoAdapters', 'Allow closure adapters (S121, S236, D71, D141)', 'bool'],
      ['autoTimeLimit', 'Search time limit', 'seconds']
    ],
    Printing: [
      ['density', 'Material density', 'g/cm³ (PETG ≈ 1.27)'], ['filamentDiameter', 'Filament diameter', 'mm'], ['solidity', 'Solidity factor', '0–1 (walls/infill)'],
      ['jointVolume', 'Connector allowance', 'cm³ per piece'], ['gramsPerHour', 'Print throughput', 'g per hour'], ['overheadMin', 'Per-plate overhead', 'min (heat-up, purge)'],
      ['supportBaseG', 'Ramp support base', 'g'], ['supportGPerMm', 'Ramp support per mm height', 'g/mm'], ['clipsPerJoint', 'Clips per joint', 'qty (0 = none)'],
      ['clipGrams', 'Clip weight', 'g'], ['costPerKg', 'Filament cost', 'per kg (0 = hide)'], ['currency', 'Currency symbol', 'text']
    ]
  };
  function openSettings() {
    const work = clone(settings);
    const node = document.createElement('div');
    const tabs = [...Object.keys(FIELDS), 'Parts'];
    node.innerHTML = `<div class="settings-tabs">${tabs.map((t, i) => `<button data-t="${t}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div><div id="setBody"></div>`;
    const body = $('#setBody', node);
    const straightsOpts = () => parts.filter((p) => p.type === 'straight' && p.group === 'straight').map((p) => [p.id, p.name]);
    const curveOpts = () => parts.filter((p) => p.type === 'curve').map((p) => [p.id, p.name]);
    function showTab(t) {
      $$('.settings-tabs button', node).forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      if (t === 'Parts') return showParts();
      body.innerHTML = `<div class="form-grid">${FIELDS[t].map(([k, label, unit, opt]) => {
        if (unit === 'bool') return `<div class="field check"><input type="checkbox" id="f_${k}" ${work[k] ? 'checked' : ''}><label for="f_${k}">${label}</label></div>`;
        if (opt) {
          const list = opt === 'straights' ? straightsOpts() : opt === 'curves' ? curveOpts() : opt.map((v) => (Array.isArray(v) ? v : [v, v]));
          return `<div class="field"><label for="f_${k}">${label}</label><select id="f_${k}">${list.map(([v, l]) => `<option value="${v}" ${String(work[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${unit ? `<small>${unit}</small>` : ''}</div>`;
        }
        const type = unit === 'text' ? 'text' : 'number';
        return `<div class="field"><label for="f_${k}">${label}</label><input id="f_${k}" type="${type}" step="any" value="${esc(work[k])}"><small>${unit}</small></div>`;
      }).join('')}</div>`;
      FIELDS[t].forEach(([k, , unit, opt]) => {
        const el = $('#f_' + k, body);
        const firstOpt = Array.isArray(opt) ? (Array.isArray(opt[0]) ? opt[0][0] : opt[0]) : null;
        el.onchange = () => { work[k] = unit === 'bool' ? el.checked : unit === 'text' || (opt && typeof opt === 'string') || typeof firstOpt === 'string' ? el.value : parseFloat(el.value); };
      });
    }
    function showParts() {
      const all = [...P.DEFAULT_PARTS, ...work.customParts];
      const ov = work.partOverrides;
      const get = (p, k) => (ov[p.id] && k in ov[p.id] ? ov[p.id][k] : p[k]);
      const set = (p, k, v) => { if (work.customParts.includes(p)) p[k] = v; else { ov[p.id] = ov[p.id] || {}; ov[p.id][k] = v; } };
      body.innerHTML = `<p class="note">Show/hide pieces, choose which ones the arrow keys cycle through, and enter slicer weights/times for exact BoM numbers (single-width values; double width is scaled). Geometry edits apply to existing designs too.</p>
        <table class="parts-table"><thead><tr><th>Show</th><th title="Arrow-key cycle">Cycle</th><th>Part</th><th>Length / IR</th><th>Angle</th><th>g</th><th>min</th><th></th></tr></thead><tbody>
        ${all.map((p, i) => `<tr data-i="${i}"><td><input type="checkbox" data-k="show" ${get(p, 'hidden') ? '' : 'checked'}></td>
          <td>${p.group === 'straight' ? `<input type="checkbox" data-k="cycleStraight" ${get(p, 'cycleStraight') ? 'checked' : ''} title="←/→">` : p.type === 'curve' ? `<input type="checkbox" data-k="cycleCurve" ${get(p, 'cycleCurve') ? 'checked' : ''} title="↑/↓">` : ''}</td>
          <td>${esc(get(p, 'name'))}<br><span class="note">${p.id}${p.nominal ? ' · nominal' : ''}</span></td>
          <td><input type="number" data-k="${p.type === 'curve' ? 'ir' : 'length'}" value="${get(p, p.type === 'curve' ? 'ir' : 'length')}"></td>
          <td>${p.type === 'curve' ? `<input type="number" data-k="angle" value="${get(p, 'angle')}">` : p.rise ? `<span class="note">rise ${get(p, 'rise')}</span>` : ''}</td>
          <td><input type="number" data-k="gramsOverride" placeholder="auto" value="${get(p, 'gramsOverride') || ''}"></td>
          <td><input type="number" data-k="minutesOverride" placeholder="auto" value="${get(p, 'minutesOverride') || ''}"></td>
          <td>${work.customParts.includes(p) ? '<button class="sbtn danger" data-del>✕</button>' : ''}</td></tr>`).join('')}
        </tbody></table>
        <h3 style="font-size:14px;margin:18px 0 8px">Add a custom piece</h3>
        <div class="form-grid"><div class="field"><label>Type</label><select id="cpType"><option value="straight">Straight</option><option value="curve">Curve</option></select></div>
        <div class="field"><label>Length / inner radius (mm)</label><input id="cpLen" type="number" value="180"></div>
        <div class="field"><label>Angle (curves, °)</label><input id="cpAng" type="number" value="22.5"></div>
        <div class="field"><label>Name</label><input id="cpName" type="text" placeholder="auto"></div></div>
        <div class="row-btns"><button class="sbtn primary" id="cpAdd">Add piece</button><button class="sbtn danger" id="cpReset">Reset all part edits</button></div>`;
      $$('tbody tr', body).forEach((tr) => {
        const p = all[+tr.dataset.i];
        $$('input', tr).forEach((inp) => (inp.onchange = () => {
          const k = inp.dataset.k;
          if (k === 'show') set(p, 'hidden', !inp.checked);
          else if (inp.type === 'checkbox') set(p, k, inp.checked);
          else { const v = parseFloat(inp.value); set(p, k, isFinite(v) && v > 0 ? v : (k.endsWith('Override') ? 0 : p[k])); }
        }));
        const del = $('[data-del]', tr); if (del) del.onclick = () => { work.customParts.splice(work.customParts.indexOf(p), 1); showParts(); };
      });
      $('#cpAdd', body).onclick = () => {
        const type = $('#cpType', body).value, len = parseFloat($('#cpLen', body).value), ang = parseFloat($('#cpAng', body).value);
        if (!(len > 0) || (type === 'curve' && !(ang > 0 && ang <= 180))) return toast('Enter a valid size.');
        const id = type === 'curve' ? `X-C${ang}-R${len}` : `X-S${len}`;
        if (all.some((p) => p.id === id)) return toast('That piece already exists.');
        work.customParts.push(type === 'curve'
          ? { id, name: $('#cpName', body).value || `Curve ${ang}° IR${len}`, type, group: 'curve', ir: len, angle: ang, style: 'smooth', source: 'custom', cycleCurve: true }
          : { id, name: $('#cpName', body).value || `Straight ${len}`, type, group: 'straight', length: len, source: 'custom', cycleStraight: true });
        showParts();
      };
      $('#cpReset', body).onclick = () => { work.partOverrides = {}; showParts(); };
    }
    node.addEventListener('click', (e) => { const b = e.target.closest('.settings-tabs button'); if (b) showTab(b.dataset.t); });
    showTab('General');
    modal({
      title: 'Settings', node, buttons: [
        { label: 'Reset to defaults', danger: true, onClick: () => { Object.assign(work, clone(DEFAULT_SETTINGS)); showTab('General'); toast('Defaults restored — press Save to apply.'); return false; } },
        { label: 'Cancel' },
        { label: 'Save', primary: true, onClick: () => applySettings(work) }
      ]
    });
  }
  function applySettings(work) {
    ['workspaceW', 'workspaceH', 'gridSize', 'laneWidth', 'wallHeight', 'density', 'filamentDiameter', 'gramsPerHour'].forEach((k) => { if (!(work[k] > 0)) work[k] = DEFAULT_SETTINGS[k]; });
    work.solidity = Math.min(1, Math.max(0.05, work.solidity || DEFAULT_SETTINGS.solidity));
    work.autoMaxPieces = Math.round(Math.min(16, Math.max(1, work.autoMaxPieces || DEFAULT_SETTINGS.autoMaxPieces)));
    work.autoMaxCurves = Math.round(Math.min(10, Math.max(0, isFinite(work.autoMaxCurves) ? work.autoMaxCurves : DEFAULT_SETTINGS.autoMaxCurves)));
    work.autoTimeLimit = Math.min(30, Math.max(1, work.autoTimeLimit || DEFAULT_SETTINGS.autoTimeLimit));
    settings = work; LS.set(KEYS.settings, settings);
    buildParts(); buildPalette(); refresh(); fitView(); toast('Settings saved.');
  }

  function showHelp() {
    const sc = [
      ['Place tool / Select tool', 'P / V'], ['Cycle curves', '↑ ↓'], ['Cycle straight lengths', '← →'], ['Rotate (ghost or selection)', 'R / Shift R'],
      ['Flip curve direction', 'F'], ['Toggle single / double width', 'W'], ['Add piece at active end', 'Enter'], ['Delete selection / last piece', 'Del / ⌫'],
      ['Undo / Redo', 'Ctrl Z / Ctrl ⇧ Z'], ['Save / Open', 'Ctrl S / Ctrl O'], ['Blueprint PNG', 'Ctrl E'], ['Select all', 'Ctrl A'],
      ['Auto loop — close the track', 'L'], ['Pan', 'Space-drag · right/middle drag'], ['Sample tracks', '? menu'], ['Zoom', 'Wheel · + / −'], ['Fit workspace / fit track', '0 / 9'], ['Select connected chain', 'Double-click']
    ];
    modal({
      title: 'TinyTMT track designer — how to', html: `
      <p><b>Build a course:</b> pick a piece in the palette (or use the arrow keys), then click on the grid. Move the mouse near a green open end and the piece snaps onto it. Press <kbd>Enter</kbd> to keep adding the selected piece to the end you last built — the fastest way to lay a whole track.</p>
      <p><b>Edit:</b> switch to Select (<kbd>V</kbd>), click a piece, and use the arrow keys to swap it for another size — the rest of the chain follows along. Drag pieces to move them; they snap to nearby open ends.</p>
      <div class="shortcuts">${sc.map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>
      <p class="note" style="margin-top:14px">Pieces follow the Tamiya Mini 4WD format (115 mm lane, 50 mm walls) using rucdoc's single-lane <a href="${P.SOURCES.ramp.url}" target="_blank" rel="noopener">modular ramp set</a> and <a href="${P.SOURCES.curve.url}" target="_blank" rel="noopener">curve track pack</a>. Dimensions marked nominal should be checked against the STLs. Everything runs in your browser and works offline; designs are stored locally.</p>
      <p class="note">TinyTMT is an outreach project by SalvageGarden Makerspace — a mini, motorised take on the open-source Toddler Mobility Trainer wheelchair. Open source under the MIT licence.</p>`,
      buttons: [{ label: 'Got it', primary: true }]
    });
  }

  /* ---------- add-ons ---------- */
  TinyTMT.api = {
    getDesign: () => clone(design), getParts: () => clone(parts), getSettings: () => clone(settings), geom: G,
    getDerived: () => ({ pieces: derived.pieces.map((d) => ({ id: d.p.id, part: d.part.id, partDef: clone(d.part), width: d.p.width, W: d.W, dir: d.p.dir, pose: { x: d.p.x, y: d.p.y, a: d.p.a }, z: d.z0, zExit: d.z1, outline: d.outline.map((q) => ({ x: q.x, y: q.y })), center: d.center.map((q) => ({ x: q.x, y: q.y })), length: d.length })), stats: clone(derived.stats), bom: clone(derived.bom.rows.map((r) => Object.assign({}, r, { part: undefined }))), zMin: derived.zMin, zMax: derived.zMax, workspace: derived.workspace }),
    on: (ev, fn) => TinyTMT._on(ev, fn), modal: (o) => modal(o), toast: (m) => toast(m)
  };
  function renderAddon(a) {
    const b = document.createElement('button'); b.className = 'btn addon-btn'; b.title = a.label;
    b.innerHTML = `${a.icon ? `<span>${a.icon}</span>` : ''}<span>${esc(a.label)}</span>${a.badge ? `<span class="pill">${esc(a.badge)}</span>` : ''}`;
    b.onclick = () => { try { a.run(TinyTMT.api); } catch (e) { console.error(e); toast('Add-on error: ' + e.message); } };
    $('#addonSlot').appendChild(b);
    if (typeof a.init === 'function') a.init(TinyTMT.api);
  }
  TinyTMT.addons.list.forEach(renderAddon);
  TinyTMT._on('addon-registered', (a) => { if (TinyTMT.api) { const init = a.init; a.init = null; renderAddon(a); a.init = init; } });

  /* ---------- wiring ---------- */
  $('#trackTitle').addEventListener('input', (e) => { design.title = e.target.value || 'Untitled track'; dirty = true; $('#dirtyDot').classList.add('on'); autosave(); });
  $('#trackTitle').addEventListener('blur', () => { if (!design.title.trim()) { design.title = NAMES.randomTitle(); syncControls(); } refreshSide(); });
  $('#btnRerollTitle').onclick = () => { design.title = NAMES.randomTitle(); dirty = true; syncControls(); refresh(); autosave(); };
  $('#btnNew').onclick = newTrack;
  $('#btnOpen').onclick = openLibrary;
  $('#btnSave').onclick = saveToLibrary;
  $('#btnSettings').onclick = openSettings;
  const helpMenu = $('#helpMenu');
  $('#btnHelp').onclick = (e) => { e.stopPropagation(); exportMenu.hidden = true; helpMenu.hidden = !helpMenu.hidden; $('#btnHelp').setAttribute('aria-expanded', String(!helpMenu.hidden)); };
  helpMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help]'); if (!b) return;
    helpMenu.hidden = true;
    ({ help: showHelp, samples: openSamples, repo: () => window.open('https://github.com/saadcaffeine/tinytmt-track-designer', '_blank', 'noopener') })[b.dataset.help]();
  });
  document.addEventListener('click', () => { helpMenu.hidden = true; });
  const exportMenu = $('#exportMenu');
  $('#btnExport').onclick = (e) => { e.stopPropagation(); helpMenu.hidden = true; exportMenu.hidden = !exportMenu.hidden; $('#btnExport').setAttribute('aria-expanded', String(!exportMenu.hidden)); };
  document.addEventListener('click', () => { exportMenu.hidden = true; });
  exportMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-export]'); if (!b) return;
    ({ png: exportPng, json: exportJson, csv: exportCsv, import: () => $('#fileInput').click() })[b.dataset.export]();
  });
  $('#fileInput').onchange = (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; };
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importFile(f); });
  $$('[data-width]').forEach((b) => (b.onclick = () => setWidth(b.dataset.width)));
  $$('[data-dir]').forEach((b) => (b.onclick = () => { if (selection.size) { const want = b.dataset.dir; const curves = [...selection].filter((id) => derived.byId[id] && derived.byId[id].part.type === 'curve' && derived.byId[id].p.dir !== want); if (curves.length === 1) replacePiece(curves[0], { dir: want }); } ui.dir = b.dataset.dir; saveUi(); syncControls(); updateGhost(); }));
  $$('.tool[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('#tRotate').onclick = () => rotateSelection(1);
  $('#tFlip').onclick = flip;
  $('#tDelete').onclick = deleteSelection;
  $('#tAutoLoop').onclick = () => runAutoLoop();
  $('#tUndo').onclick = undo; $('#tRedo').onclick = redo;
  $('#tZoomIn').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); };
  $('#tZoomOut').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); };
  $('#tZoomFit').onclick = () => fitView();
  $('#partSearch').addEventListener('input', buildPalette);
  $$('.tabs [data-tab]').forEach((b) => (b.onclick = () => { $$('.tabs [data-tab]').forEach((x) => x.classList.toggle('on', x === b)); $('#tab-bom').hidden = b.dataset.tab !== 'bom'; $('#tab-inspect').hidden = b.dataset.tab !== 'inspect'; }));
  $('.side').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    ({ csv: exportCsv, copybom: copyBom, png: exportPng, rotate: () => rotateSelection(1), flip, delete: deleteSelection, chain: () => { selection = chainOf([...selection][0]); refresh(); } })[b.dataset.act]();
  });
  window.addEventListener('beforeunload', () => LS.set(KEYS.current, { design, dirty }));

  /* ---------- boot ---------- */
  buildParts();
  const saved = LS.get(KEYS.current, null);
  design = saved && saved.design && Array.isArray(saved.design.pieces) ? saved.design : newDesign();
  dirty = !!(saved && saved.dirty);
  derived = derive();
  buildPalette(); syncControls(); setTool(ui.tool === 'select' ? 'select' : 'place');
  requestAnimationFrame(() => { design.pieces.length ? fitToTrack() : fitView(); refresh(); if (design.pieces.length) activeEnd = { pid: design.pieces[design.pieces.length - 1].id, end: 1 }; render(); });
  if (!LS.get('tinytmt.seenHelp', false)) { LS.set('tinytmt.seenHelp', true); setTimeout(showHelp, 400); }
  window.__tinytmt = { refresh: () => { cleanupRefs(); refresh(); }, runAutoLoop, acceptSuggest, autoLoopEnds, get suggest() { return suggest; }, get solving() { return solving; }, get design() { return design; }, get derived() { return derived; }, appendAtActiveEnd, setActivePart, cycle, undo, redo, exportPng, saveToLibrary, view, fitView, toWorld, placeGhost, updateGhost, setTool, get ghost() { return ghost; } };
})();
