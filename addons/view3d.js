/*
 * TinyTMT add-on: View in 3D
 *
 * A live three.js preview of the current design, built only from the public add-on API
 * (api.getDerived / api.getSettings / api.geom). three.js is the same WebGL library GitHub
 * uses for its STL viewer. A trimmed bundle (vendor/three-view3d.min.js) is loaded the first
 * time the button is pressed, so the 2D app stays light and everything still works offline.
 *
 * Features: orbit / zoom / pan, iso · top · side views, exploded view, a chair-height
 * "ride along" camera, live updates while you edit, and PNG / GLB / STL export.
 *
 * Coordinates: designer world is mm with +x right, +y down the screen, z = elevation.
 * In three.js that becomes (x, z, y): Y is up and the top view matches the 2D canvas.
 */
(function () {
  'use strict';
  const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
  const LIB_URL = SELF_SRC ? new URL('../vendor/three-view3d.min.js', SELF_SRC).href : 'vendor/three-view3d.min.js';
  const D2R = Math.PI / 180;

  /* ---------------- library loader ---------------- */
  let libPromise = null;
  function loadLib() {
    if (window.TinyTMTThree) return Promise.resolve(window.TinyTMTThree);
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const inline = document.getElementById('tinytmt-three-src'); // standalone build embeds the bundle as text
      if (inline) s.textContent = inline.textContent;
      else { s.src = LIB_URL; s.onerror = () => { libPromise = null; reject(new Error('Could not load the 3D library (vendor/three-view3d.min.js).')); }; }
      s.onload = () => resolve(window.TinyTMTThree);
      document.head.appendChild(s);
      if (inline) window.TinyTMTThree ? resolve(window.TinyTMTThree) : reject(new Error('3D library failed to start.'));
    });
    return libPromise;
  }

  /* ---------------- styles + DOM ---------------- */
  const CSS = `
  .v3d { position: fixed; inset: 0; z-index: 58; display: flex; flex-direction: column; background: #e9eef6; font: 14px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink, #1b2333); }
  .v3d[hidden] { display: none; }
  .v3d-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; background: var(--navy, #14213d); color: #fff; }
  .v3d-bar h2 { font-size: 15px; margin: 0 8px 0 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 32vw; }
  .v3d-bar .grow { flex: 1; }
  .v3d-btn { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.22); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
  .v3d-btn:hover { background: rgba(255,255,255,.2); }
  .v3d-btn.on { background: var(--accent, #2f7cf6); border-color: var(--accent, #2f7cf6); }
  .v3d-seg { display: inline-flex; }
  .v3d-seg .v3d-btn { border-radius: 0; margin-left: -1px; }
  .v3d-seg .v3d-btn:first-child { border-radius: 8px 0 0 8px; margin-left: 0; }
  .v3d-seg .v3d-btn:last-child { border-radius: 0 8px 8px 0; }
  .v3d-range { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
  .v3d-range input { width: 110px; accent-color: var(--accent, #2f7cf6); }
  .v3d-menu { position: relative; }
  .v3d-menu-list { position: absolute; right: 0; top: calc(100% + 4px); background: #fff; color: var(--ink, #1b2333); border-radius: 8px; box-shadow: 0 6px 24px rgba(16,24,40,.25); padding: 4px; min-width: 210px; z-index: 2; }
  .v3d-menu-list[hidden] { display: none; }
  .v3d-menu-list button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 7px 10px; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; }
  .v3d-menu-list button:hover { background: var(--accent-soft, #e6efff); }
  .v3d-menu-list small { display: block; color: var(--muted, #667085); font-size: 11px; }
  .v3d-stage { position: relative; flex: 1; min-height: 0; }
  .v3d-stage canvas { display: block; width: 100%; height: 100%; outline: none; touch-action: none; }
  .v3d-hud { position: absolute; left: 12px; bottom: 12px; background: rgba(255,255,255,.88); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--muted, #667085); pointer-events: none; box-shadow: 0 1px 4px rgba(16,24,40,.12); }
  .v3d-hud b { color: var(--ink, #1b2333); }
  .v3d-msg { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; color: var(--muted, #667085); }
  .v3d-msg[hidden] { display: none; }
  @media (max-width: 720px) { .v3d-bar h2 { max-width: 60vw; } .v3d-hint { display: none; } }
  `;
  let ui = null;
  function buildUI() {
    if (ui) return ui;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div');
    el.className = 'v3d'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'View in 3D');
    el.innerHTML = `
      <div class="v3d-bar">
        <h2 id="v3dTitle">3D view</h2>
        <div class="v3d-seg" role="group" aria-label="Camera">
          <button class="v3d-btn" data-view="iso" title="Iso view (1)">Iso</button>
          <button class="v3d-btn" data-view="top" title="Top view (2)">Top</button>
          <button class="v3d-btn" data-view="side" title="Side view (3)">Side</button>
        </div>
        <button class="v3d-btn" id="v3dRide" title="Ride along at chair height (R)">▶ Ride along</button>
        <label class="v3d-range" title="Pull the pieces apart to show joints and supports (E)">Explode <input type="range" id="v3dExplode" min="0" max="100" value="0" /></label>
        <span class="grow"></span>
        <div class="v3d-menu">
          <button class="v3d-btn" id="v3dExportBtn" aria-haspopup="true" aria-expanded="false">Export ▾</button>
          <div class="v3d-menu-list" id="v3dExportMenu" role="menu" hidden>
            <button role="menuitem" data-x="png">Image (.png)<small>The current view</small></button>
            <button role="menuitem" data-x="glb">3D scene (.glb)<small>For Blender, web viewers and AR</small></button>
            <button role="menuitem" data-x="stl">Preview mesh (.stl)<small>GitHub shows STL files in 3D. This is a preview, not print files.</small></button>
          </div>
        </div>
        <button class="v3d-btn" id="v3dClose" title="Close (Esc)" aria-label="Close">✕</button>
      </div>
      <div class="v3d-stage" id="v3dStage">
        <div class="v3d-msg" id="v3dMsg">Loading 3D view…</div>
        <div class="v3d-hud" id="v3dHud"></div>
      </div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    ui = { el, stage: q('#v3dStage'), msg: q('#v3dMsg'), hud: q('#v3dHud'), title: q('#v3dTitle'), ride: q('#v3dRide'), explode: q('#v3dExplode'), exportBtn: q('#v3dExportBtn'), exportMenu: q('#v3dExportMenu'), close: q('#v3dClose'), views: [...el.querySelectorAll('[data-view]')] };
    return ui;
  }

  /* ---------------- helpers ---------------- */
  function hslColor(T, str, fallbackHue) {
    const c = new T.Color();
    const m = /hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(str || '');
    if (m) c.setHSL(+m[1] / 360, +m[2] / 100, +m[3] / 100, T.SRGBColorSpace);
    else c.setHSL((fallbackHue || 218) / 360, 0.6, 0.5, T.SRGBColorSpace);
    return c;
  }
  const slug = (s) => (s || 'tinytmt-track').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tinytmt-track';
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /**
   * Maps a point on a piece to three.js world space.
   *   s: 0..1 along the piece, o: lateral offset in mm (+ = right of travel), h: mm above the piece's base.
   */
  function pieceMapper(T, pc, G) {
    const part = pc.partDef, W = pc.W, pose = pc.pose, z0 = pc.z, rise = pc.zExit - pc.z;
    const curve = part.type === 'curve', sgn = pc.dir === 'L' ? -1 : 1;
    const R = curve ? G.centerRadius(part, W) : 0, T0 = curve ? part.angle * D2R : 0, L = part.length;
    return function (s, o, h, out) {
      let lx, ly;
      if (curve) { const t = s * T0, r = R - sgn * o; lx = r * Math.sin(t); ly = sgn * (R - r * Math.cos(t)); }
      else { lx = s * L; ly = o; }
      const w = G.rot(lx, ly, pose.a);
      return (out || new T.Vector3()).set(pose.x + w.x, z0 + rise * s + h, pose.y + w.y);
    };
  }
  /** Bend a geometry built in piece-local space (x = mm or fraction along, y = height, z = lateral) onto the piece. */
  function bend(geo, map, alongScale) {
    const p = geo.attributes.position, v = { x: 0, y: 0, z: 0 }, tmp = map(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      v.x = p.getX(i); v.y = p.getY(i); v.z = p.getZ(i);
      map(Math.min(1, Math.max(0, v.x / alongScale)), v.z, v.y, tmp);
      p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    return geo;
  }
  /** Box in piece-local space: along [x0,x1], height [y0,y1], lateral [z0,z1]. */
  function localBox(T, x0, x1, y0, y1, z0, z1, segs) {
    const g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, segs || 1, 1, 1);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  }

  /* ---------------- scene building ---------------- */
  function endpoints(api, pc) {
    const G = api.geom, ex = G.compose(pc.pose, G.exitLocal(pc.partDef, pc.dir, pc.W));
    return [{ x: pc.pose.x, y: pc.pose.y, z: pc.z, a: pc.pose.a }, { x: ex.x, y: ex.y, z: pc.zExit, a: ex.a }];
  }
  function connectivity(api, pieces) {
    const ends = pieces.map((pc) => endpoints(api, pc));
    const partner = {}; // "i:e" -> [j, e2]
    for (let i = 0; i < pieces.length; i++) for (let e = 0; e < 2; e++) {
      if (partner[i + ':' + e]) continue;
      const A = ends[i][e];
      for (let j = i + 1; j < pieces.length && !partner[i + ':' + e]; j++) for (let f = 0; f < 2; f++) {
        if (partner[j + ':' + f]) continue;
        const B = ends[j][f];
        if (Math.abs(A.x - B.x) < 1.5 && Math.abs(A.y - B.y) < 1.5 && Math.abs(A.z - B.z) < 3) { partner[i + ':' + e] = [j, f]; partner[j + ':' + f] = [i, e]; break; }
      }
    }
    return { ends, partner };
  }

  function buildTrack(T, api) {
    const G = api.geom, S = api.getSettings(), D = api.getDerived();
    const wallT = S.wallThickness || 3, wallH = S.wallHeight || 50, floorT = Math.max(1.5, S.floorThickness || 2.5);
    const root = new T.Group(); root.name = 'TinyTMT track';
    const mats = {};
    const mat = (key, color, extra) => mats[key] || (mats[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.02 }, extra || {})));
    const pieceGroups = [];

    D.pieces.forEach((pc, idx) => {
      const part = pc.partDef, col = pc.colors || {};
      const map = pieceMapper(T, pc, G);
      const g = new T.Group(); g.name = `${part.name || pc.part} #${idx + 1}`;
      const half = pc.W / 2;
      const segs = part.type === 'curve' ? (part.style === 'digital' ? Math.max(2, Math.round(part.angle / 7.5)) : Math.max(6, Math.ceil(part.angle / 3))) : 1;
      const hue = col.hue != null ? col.hue : 218;
      const floorM = mat('f' + hue, hslColor(T, col.floor, hue).lerp(new T.Color(0xffffff), 0.1));
      const wallM = mat('w' + hue, hslColor(T, col.accent, hue));
      const mesh = (geo, m) => { const me = new T.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
      mesh(bend(localBox(T, 0, 1, 0, floorT, -half, half, segs), map, 1), floorM);
      mesh(bend(localBox(T, 0, 1, 0, wallH, -half, -half + wallT, segs), map, 1), wallM);
      mesh(bend(localBox(T, 0, 1, 0, wallH, half - wallT, half, segs), map, 1), wallM);
      if (part.obstacle) addObstacle(T, g, part, pc, map, { wallT, wallH, floorT, laneWidth: S.laneWidth || 115 }, mat);
      const c = map(0.5, 0, 0); g.userData.center = new T.Vector3(c.x, 0, c.z);
      root.add(g); pieceGroups.push(g);
    });

    // Supports under every raised joint and raised open end (same rule as the BoM).
    const { ends, partner } = connectivity(api, D.pieces);
    const supM = mat('sup', new T.Color().setHSL(45 / 360, 0.35, 0.62, T.SRGBColorSpace));
    const supports = [];
    D.pieces.forEach((pc, i) => [0, 1].forEach((e) => {
      const q = partner[i + ':' + e];
      if (q && (q[0] < i)) return; // count each joint once
      const p = ends[i][e]; if (p.z <= 0.5) return;
      const w = Math.max(pc.W, q ? D.pieces[q[0]].W : 0) + 8;
      const geo = new T.BoxGeometry(22, p.z, w); geo.translate(0, p.z / 2, 0);
      const m = new T.Mesh(geo, supM); m.castShadow = m.receiveShadow = true;
      m.position.set(p.x, 0, p.y); m.rotation.y = -p.a * D2R; m.name = `Support h≈${Math.round(p.z)} mm`;
      m.userData.center = new T.Vector3(p.x, 0, p.y); m.userData.base = m.position.clone();
      root.add(m); supports.push(m);
    }));

    const box = new T.Box3().setFromObject(root);
    return { root, pieceGroups, supports, box, D, S, mats, connectivity: { ends, partner } };
  }

  function addObstacle(T, g, part, pc, map, o, mat) {
    const L = part.length, inner = pc.W / 2 - o.wallT, mid = L / 2, f = o.floorT;
    const m = mat('ob', new T.Color(0xf2b705), { roughness: 0.55 }); // hazard yellow so barriers stand out
    const add = (geo, mm) => { const me = new T.Mesh(bend(geo, map, L), mm || m); me.castShadow = me.receiveShadow = true; g.add(me); };
    switch (part.obstacle) {
      case 'doorway': {
        const n = Math.max(6, (2 * inner - 2 * inner * 90 / o.laneWidth) / 2);
        add(localBox(T, mid - 20, mid + 20, f, o.wallH, -inner, -inner + n));
        add(localBox(T, mid - 20, mid + 20, f, o.wallH, inner - n, inner));
        add(localBox(T, mid - 20, mid + 20, o.wallH - 6, o.wallH, -inner, inner)); // lintel
        break;
      }
      case 'sill': add(localBox(T, mid - 6, mid + 6, f, f + 4, -inner, inner)); break;
      case 'kerb': add(localBox(T, mid - 40, mid + 40, f, f + 15, -inner, inner)); break;
      case 'rough': {
        const lib = window.TinyTMTThree, parts = [];
        for (let x = 25; x <= L - 25; x += 18) for (let y = -inner + 9; y <= inner - 9; y += 18) {
          const off = (Math.round(x / 18) % 2) * 9, yy = y + off > inner - 4 ? y : y + off;
          const s = new T.SphereGeometry(3.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); s.translate(x, f, yy); parts.push(s);
        }
        if (parts.length) add(lib.mergeGeometries(parts));
        break;
      }
      case 'slope': {
        const sh = new T.Shape(); sh.moveTo(-inner, 0); sh.lineTo(inner, 0); sh.lineTo(inner, 14); sh.lineTo(-inner, 0.5);
        const x0 = L * 0.15, geo = new T.ExtrudeGeometry(sh, { depth: L * 0.7, bevelEnabled: false });
        // shape (x = lateral, y = height), extruded along +z → swap to (x = along, y = height, z = lateral)
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) { const lat = p.getX(i), h = p.getY(i), al = p.getZ(i); p.setXYZ(i, x0 + al, f + h, lat); }
        add(geo);
        break;
      }
    }
  }

  /* ---------------- viewer ---------------- */
  let V = null; // live viewer state

  function makeViewer(T, u) {
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    renderer.domElement.tabIndex = 0;
    u.stage.insertBefore(renderer.domElement, u.stage.firstChild);
    const scene = new T.Scene(); scene.background = new T.Color(0xe9eef6);
    const camera = new T.PerspectiveCamera(40, 1, 5, 60000);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    scene.add(new T.HemisphereLight(0xffffff, 0xb9c3d3, 1.6));
    const sun = new T.DirectionalLight(0xffffff, 2.0); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);
    const env = new T.Group(); scene.add(env);
    return { T, renderer, scene, camera, controls, sun, env, track: null, ride: null, explode: 0, view: 'iso', raf: 0, open: false, unsub: null, dirty: false };
  }

  function buildEnvironment(v) {
    const T = v.T, env = v.env, D = v.track.D, ws = D.workspace;
    env.children.slice().forEach((c) => { env.remove(c); c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); });
    const tb = v.track.box;
    const x0 = Math.min(ws.x0, tb.min.x) - 400, x1 = Math.max(ws.x1, tb.max.x) + 400, z0 = Math.min(ws.y0, tb.min.z) - 400, z1 = Math.max(ws.y1, tb.max.z) + 400;
    const floor = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshStandardMaterial({ color: 0xdfe5ee, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, -1.2, (z0 + z1) / 2); floor.receiveShadow = true; env.add(floor);
    const wsm = new T.Mesh(new T.PlaneGeometry(ws.x1 - ws.x0, ws.y1 - ws.y0), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
    wsm.rotation.x = -Math.PI / 2; wsm.position.set((ws.x0 + ws.x1) / 2, -0.8, (ws.y0 + ws.y1) / 2); wsm.receiveShadow = true; env.add(wsm);
    const S = v.track.S, step = S.gridSize || 50, major = step * (S.majorEvery || 10);
    const minor = [], maj = [];
    for (let x = ws.x0; x <= ws.x1 + 0.1; x += step) (Math.abs(x % major) < 0.1 ? maj : minor).push(x, -0.5, ws.y0, x, -0.5, ws.y1);
    for (let y = ws.y0; y <= ws.y1 + 0.1; y += step) (Math.abs(y % major) < 0.1 ? maj : minor).push(ws.x0, -0.5, y, ws.x1, -0.5, y);
    const lines = (arr, color) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color })); };
    env.add(lines(minor, 0xe6eaf1), lines(maj, 0xc9d2e0));
    const Y = -0.4, border = [ws.x0, Y, ws.y0, ws.x1, Y, ws.y0, ws.x1, Y, ws.y0, ws.x1, Y, ws.y1, ws.x1, Y, ws.y1, ws.x0, Y, ws.y1, ws.x0, Y, ws.y1, ws.x0, Y, ws.y0];
    env.add(lines(border, 0x14213d));
    // light + shadow frustum sized to the scene
    const c = new T.Vector3(); tb.isEmpty() ? c.set((ws.x0 + ws.x1) / 2, 0, (ws.y0 + ws.y1) / 2) : tb.getCenter(c);
    const r = Math.max(800, tb.isEmpty() ? 1200 : tb.getSize(new T.Vector3()).length() * 0.75);
    v.sun.position.set(c.x - r * 0.6, r * 1.4, c.z - r * 0.9); v.sun.target.position.copy(c);
    const sc = v.sun.shadow.camera; sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.near = 10; sc.far = r * 4; sc.updateProjectionMatrix();
  }

  function disposeTrack(v) {
    if (!v.track) return;
    v.scene.remove(v.track.root);
    v.track.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    Object.values(v.track.mats).forEach((m) => m.dispose());
    v.track = null;
  }

  function rebuild(v, api, keepCamera) {
    disposeTrack(v);
    v.track = buildTrack(v.T, api);
    v.scene.add(v.track.root);
    buildEnvironment(v);
    applyExplode(v);
    if (!keepCamera) setView(v, v.view);
    const D = v.track.D, s = D.stats || {};
    ui.title.textContent = (api.getDesign().title || 'Untitled track') + ' — 3D';
    ui.msg.hidden = D.pieces.length > 0;
    if (!D.pieces.length) ui.msg.textContent = 'This design has no pieces yet. Add some track and it will appear here.';
    ui.hud.innerHTML = `<b>${D.pieces.length}</b> pieces${v.track.supports.length ? ` · <b>${v.track.supports.length}</b> supports` : ''} · <b>${((s.length || 0) / 1000).toFixed(2)} m</b> of track · height <b>${Math.round(D.zMin)}–${Math.round(D.zMax + (v.track.S.wallHeight || 50))} mm</b><span class="v3d-hint"> · drag to orbit, right-drag to pan, scroll to zoom</span>`;
  }

  function sceneFocus(v) {
    const T = v.T, b = v.track && !v.track.box.isEmpty() ? v.track.box : null;
    const ws = v.track.D.workspace;
    const box = b ? b.clone() : new T.Box3(new T.Vector3(ws.x0, 0, ws.y0), new T.Vector3(ws.x1, 50, ws.y1));
    if (v.explode > 0) box.expandByScalar(box.getSize(new T.Vector3()).length() * 0.25 * v.explode);
    return { center: box.getCenter(new T.Vector3()), size: box.getSize(new T.Vector3()) };
  }
  function setView(v, name) {
    stopRide(v);
    v.view = name;
    ui.views.forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    const T = v.T, { center, size } = sceneFocus(v), cam = v.camera;
    const aspect = cam.aspect || 1, vfov = cam.fov * D2R;
    const fitDist = (w, h) => Math.max(h / 2 / Math.tan(vfov / 2), w / 2 / (Math.tan(vfov / 2) * aspect)) * 1.12;
    let dir;
    if (name === 'top') { dir = new T.Vector3(0, 1, 0.0001); cam.position.copy(center).addScaledVector(dir, fitDist(size.x, size.z) + size.y); }
    else if (name === 'side') { dir = new T.Vector3(0, 0.28, 1).normalize(); cam.position.copy(center).addScaledVector(dir, fitDist(size.x, size.y + size.z * 0.3) + size.z / 2); }
    else { dir = new T.Vector3(-0.55, 0.75, 1).normalize(); cam.position.copy(center).addScaledVector(dir, fitDist(Math.hypot(size.x, size.z) * 0.85, Math.hypot(size.x, size.z) * 0.55 + size.y) * 1.0); }
    cam.up.set(0, 1, 0);
    v.controls.target.copy(center); v.controls.update();
  }

  function applyExplode(v) {
    if (!v.track) return;
    const T = v.T, k = v.explode, C = sceneFocus({ T, track: v.track, explode: 0 }).center; C.y = 0;
    const off = (o) => o.userData.center.clone().sub(C).multiplyScalar(0.35 * k).add(new T.Vector3(0, 30 * k, 0));
    v.track.pieceGroups.forEach((g) => g.position.copy(off(g)));
    v.track.supports.forEach((m) => m.position.copy(m.userData.base).add(off(m)).setY(0));
  }

  /* ----- ride along: follow the connected run at chair eye height ----- */
  function ridePath(v, api) {
    const T = v.T, D = v.track.D, G = api.geom, { partner } = v.track.connectivity;
    const n = D.pieces.length; if (!n) return null;
    const eye = (v.track.S.floorThickness || 2.5) + 34;
    // start from an open end if there is one, otherwise from piece 0's entry
    let start = [0, 0];
    outer: for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) if (!partner[i + ':' + e]) { start = [i, e]; break outer; }
    const pts = [], seen = new Set();
    let cur = start, closed = false;
    while (cur && !seen.has(cur[0])) {
      const [i, e] = cur, pc = D.pieces[i]; seen.add(i);
      const map = pieceMapper(T, pc, G), steps = pc.partDef.type === 'curve' ? Math.max(4, Math.ceil(pc.partDef.angle / 5)) : Math.max(2, Math.ceil(pc.length / 60));
      for (let k = 0; k <= steps; k++) { const s = e === 0 ? k / steps : 1 - k / steps; const p = map(s, 0, eye); if (!pts.length || pts[pts.length - 1].distanceTo(p) > 2) pts.push(p); }
      const nx = partner[i + ':' + (1 - e)];
      if (nx && nx[0] === start[0] && seen.size > 1) { closed = true; break; }
      cur = nx || null;
    }
    if (pts.length < 2) return null;
    if (closed && pts[0].distanceTo(pts[pts.length - 1]) < 5) pts.pop();
    const curve = new T.CatmullRomCurve3(pts, closed, 'centripetal');
    return { curve, closed, len: curve.getLength(), u: 0, last: performance.now(), pieces: seen.size, of: n };
  }
  function startRide(v, api) {
    if (v.explode > 0) { v.explode = 0; ui.explode.value = 0; applyExplode(v); }
    const r = ridePath(v, api); if (!r) { api.toast('Add some connected track to ride along.'); return; }
    v.ride = r; v.controls.enabled = false;
    v.camera.fov = 68; v.camera.near = 1; v.camera.updateProjectionMatrix();
    ui.ride.classList.add('on'); ui.ride.textContent = '■ Stop ride';
    ui.views.forEach((b) => b.classList.remove('on'));
    if (r.pieces < r.of) api.toast(`Riding the connected run (${r.pieces} of ${r.of} pieces).`);
  }
  function stopRide(v) {
    if (!v || !v.ride) return;
    v.ride = null; v.controls.enabled = true;
    v.camera.fov = 40; v.camera.near = 5; v.camera.updateProjectionMatrix();
    ui.ride.classList.remove('on'); ui.ride.textContent = '▶ Ride along';
  }
  function stepRide(v, now) {
    const r = v.ride, dt = Math.min(0.1, Math.max(0, (now - r.last) / 1000)); r.last = now; // rAF time can trail performance.now()
    const speed = 260; // mm per second — a brisk walking pace at Mini TMT scale
    r.u += (speed * dt) / r.len;
    if (r.u >= 1) { if (r.closed) r.u -= 1; else { const keep = v.view; stopRide(v); setView(v, keep); return; } }
    const p = r.curve.getPointAt(r.u), ahead = r.curve.getPointAt(r.closed ? (r.u + 140 / r.len) % 1 : Math.min(1, r.u + 140 / r.len));
    v.camera.position.copy(p); ahead.y -= 6; v.camera.lookAt(ahead);
  }

  /* ----- loop + sizing ----- */
  function resize(v) {
    const r = ui.stage.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    v.renderer.setSize(w, h, false); v.camera.aspect = w / h; v.camera.updateProjectionMatrix();
  }
  function loop(now) {
    if (!V || !V.open) return;
    V.raf = requestAnimationFrame(loop);
    if (V.dirty) { V.dirty = false; rebuild(V, V.api, true); }
    if (V.ride) stepRide(V, now); else V.controls.update();
    V.renderer.render(V.scene, V.camera);
  }

  /* ----- export ----- */
  function exportAs(v, api, kind) {
    const T = v.T, base = slug(api.getDesign().title);
    if (kind === 'png') {
      v.renderer.render(v.scene, v.camera);
      v.renderer.domElement.toBlob((b) => { download(b, base + '-3d.png'); api.toast('Saved 3D image.'); }, 'image/png');
      return;
    }
    if (!v.track || !v.track.pieceGroups.length) { api.toast('Nothing to export yet.'); return; }
    if (kind === 'glb') {
      new T.GLTFExporter().parse(v.track.root, (res) => { download(new Blob([res], { type: 'model/gltf-binary' }), base + '.glb'); api.toast('Saved 3D scene (.glb).'); },
        (err) => api.toast('GLB export failed: ' + (err && err.message || err)), { binary: true });
      return;
    }
    if (kind === 'stl') {
      // STL convention is Z-up: rotate the Y-up scene so slicers and GitHub show it the right way up.
      const wrap = new T.Group(); wrap.rotation.x = Math.PI / 2; wrap.add(v.track.root.clone()); wrap.updateMatrixWorld(true);
      const data = new T.STLExporter().parse(wrap, { binary: true });
      download(new Blob([data], { type: 'model/stl' }), base + '-preview.stl');
      api.toast('Saved STL preview mesh — drop it in a GitHub repo to view it in 3D.');
    }
  }

  /* ----- open / close ----- */
  function onKey(e) {
    if (!V || !V.open) return;
    if (e.target && e.target.type === 'range' && /Arrow/.test(e.key)) { e.stopPropagation(); return; }
    const k = e.key;
    if (k === 'Escape') { if (!ui.exportMenu.hidden) ui.exportMenu.hidden = true; else if (V.ride) { stopRide(V); setView(V, V.view); } else close(); }
    else if (k === '1') setView(V, 'iso'); else if (k === '2') setView(V, 'top'); else if (k === '3') setView(V, 'side');
    else if (k === 'r' || k === 'R') V.ride ? (stopRide(V), setView(V, V.view)) : startRide(V, V.api);
    else if (k === 'e' || k === 'E') { V.explode = V.explode > 0 ? 0 : 0.6; ui.explode.value = Math.round(V.explode * 100); applyExplode(V); }
    else if (!(e.ctrlKey || e.metaKey)) { e.stopPropagation(); return; }
    else return; // let Ctrl/Cmd shortcuts through (copy, reload…)
    e.preventDefault(); e.stopPropagation();
  }
  function close() {
    if (!V) return;
    stopRide(V); V.open = false; cancelAnimationFrame(V.raf);
    if (V.unsub) { V.unsub(); V.unsub = null; }
    ui.el.hidden = true; ui.exportMenu.hidden = true;
    disposeTrack(V);
    document.documentElement.style.overflow = '';
  }

  function wire(api) {
    ui.close.onclick = close;
    ui.views.forEach((b) => (b.onclick = () => setView(V, b.dataset.view)));
    ui.ride.onclick = () => (V.ride ? (stopRide(V), setView(V, V.view)) : startRide(V, api));
    ui.explode.oninput = () => { V.explode = ui.explode.value / 100; applyExplode(V); };
    ui.exportBtn.onclick = (e) => { e.stopPropagation(); ui.exportMenu.hidden = !ui.exportMenu.hidden; ui.exportBtn.setAttribute('aria-expanded', String(!ui.exportMenu.hidden)); };
    ui.exportMenu.onclick = (e) => { const b = e.target.closest('[data-x]'); if (!b) return; ui.exportMenu.hidden = true; exportAs(V, api, b.dataset.x); };
    ui.el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.v3d-menu')) ui.exportMenu.hidden = true; });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { if (V && V.open) resize(V); });
    V.renderer.domElement.addEventListener('pointerdown', () => { if (V.ride) { stopRide(V); setView(V, V.view); } });
  }

  async function open(api) {
    const u = buildUI();
    u.el.hidden = false; u.msg.hidden = false; u.msg.textContent = 'Loading 3D view…'; u.hud.textContent = '';
    document.documentElement.style.overflow = 'hidden';
    let T;
    try { T = await loadLib(); }
    catch (e) { u.msg.textContent = e.message; return; }
    if (!V) {
      V = makeViewer(T, u);
      if (!V) { u.msg.innerHTML = 'Your browser couldn’t start WebGL, which the 3D view needs.<br>Try another browser, or turn on hardware acceleration.'; return; }
      V.api = api; wire(api);
    }
    V.api = api; V.open = true;
    resize(V);
    rebuild(V, api, false);
    V.unsub = api.on('change', () => { V.dirty = true; });
    V.renderer.domElement.focus();
    cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(loop);
  }

  TinyTMT.addons.register({
    id: 'view3d',
    label: 'View in 3D',
    icon: '🧊',
    run: (api) => { open(api).catch((e) => { console.error(e); api.toast('3D view error: ' + e.message); }); },
    init() { // warm the cache when the browser is idle so the first open is instant
      const warm = () => { if (!document.getElementById('tinytmt-three-src')) { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = LIB_URL; document.head.appendChild(l); } };
      'requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2500);
    }
  });
  // Exposed for tests / other add-ons.
  window.TinyTMTView3D = { open: () => open(TinyTMT.api), close, get state() { return V; } };
})();
