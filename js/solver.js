/*
 * TinyTMT auto-loop solver. Pure function, no DOM, no dependencies — runs in a Web Worker
 * (created from this function's source) or on the main thread as a fallback.
 *
 * Problem: find a sequence of pieces that leaves pose START and arrives exactly at pose TARGET.
 *
 * Method (see README → Auto loop):
 *  1. Turn plans: every curve angle is a multiple of 15°, so headings are discrete. Enumerate curve
 *     sequences (iterative deepening) whose total turn equals the required heading change.
 *  2. Lengths: with the curves fixed, the heading of every straight "gap" between curves is known,
 *     so closing the position is a small linear problem: residual = Σ gapLength · direction.
 *     Gaps sharing a heading merge; we solve for 0–3 distinct directions, snapping each length
 *     to a sum of available straight pieces (precomputed).
 *  3. Rank by piece count, adapters used and leftover gap.
 *
 * Units: mm and degrees. Heading 0 = +x, positive = clockwise on screen (y down). Curve dir +1 = right.
 */
(function (root) {
  function core(P) {
    var t0 = Date.now(), D2R = Math.PI / 180, tol = P.tol || 1.2;
    function norm(a) { a %= 360; if (a < 0) a += 360; return a; }
    function rot(x, y, a) { var r = a * D2R, c = Math.cos(r), s = Math.sin(r); return { x: x * c - y * s, y: x * s + y * c }; }

    // ---- achievable straight runs: every multiset of straight pieces up to maxPieces, keyed by length
    var straights = P.straights.slice().sort(function (a, b) { return b.length - a.length; });
    var Lmax = straights.length ? straights[0].length : 0;
    var byKey = new Map();
    var zero = { len: 0, pieces: [], n: 0, adapters: 0 };
    byKey.set(0, zero);
    var frontier = [zero];
    var maxRun = Math.min(P.maxPieces, 10);
    for (var k = 1; k <= maxRun && straights.length; k++) {
      var next = [];
      for (var f = 0; f < frontier.length; f++) {
        var base = frontier[f];
        for (var si = 0; si < straights.length; si++) {
          var st = straights[si];
          var len = base.len + st.length;
          if (len > P.maxGap) continue;
          var key = Math.round(len * 100);
          var ad = base.adapters + (st.adapter ? 1 : 0);
          var ex = byKey.get(key);
          if (ex && (ex.n < k || (ex.n === k && ex.adapters <= ad))) continue;
          var e = { len: len, pieces: base.pieces.concat([st]).sort(function (a, b) { return b.length - a.length; }), n: k, adapters: ad };
          byKey.set(key, e); next.push(e);
        }
      }
      frontier = next;
    }
    var runs = Array.from(byKey.values()).sort(function (a, b) { return a.len - b.len; });
    var runLens = new Float64Array(runs.map(function (r) { return r.len; }));
    var coarse = runs.filter(function (r) { return r.n <= 2 && r.len > 0; });
    function near(g, win) {
      var out = [];
      if (g < -win) return out;
      var lo = 0, hi = runLens.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (runLens[mid] < g) lo = mid + 1; else hi = mid; }
      for (var i = Math.max(0, lo - 2); i <= Math.min(runLens.length - 1, lo + 1); i++) if (Math.abs(runLens[i] - g) <= win) out.push(runs[i]);
      return out;
    }

    // ---- curve options
    var curves = [];
    P.curves.forEach(function (c) {
      var R = c.ir + P.W / 2, t = c.angle * D2R;
      [1, -1].forEach(function (dir) {
        curves.push({ id: c.id, angle: c.angle, dir: dir, lx: R * Math.sin(t), ly: dir * (R - R * Math.cos(t)), da: dir * c.angle, pref: c.pref ? 1 : 0 });
      });
    });
    var maxAng = curves.reduce(function (m, c) { return Math.max(m, c.angle); }, 0);

    var S = P.start, T = P.target, startH = norm(S.a), targetH = norm(T.a);
    var results = new Map(), best = Infinity, evals = 0, nodes = 0, timedOut = false;
    var seq = [], gapsH = [startH], Dx = 0, Dy = 0;

    function record(assign, err) {
      // assign: map gapIndex -> run
      var items = [], count = seq.length, adapters = 0, curveScore = 0;
      for (var gi = 0; gi <= seq.length; gi++) {
        var run = assign[gi];
        if (run) { run.pieces.forEach(function (p) { items.push({ id: p.id, dir: 1 }); }); count += run.n; adapters += run.adapters; }
        if (gi < seq.length) { items.push({ id: seq[gi].id, dir: seq[gi].dir }); curveScore += seq[gi].pref ? 0 : 1; }
      }
      if (count > P.maxPieces || count === 0) return;
      var sig = items.map(function (it) { return it.id + (it.dir < 0 ? 'L' : 'R'); }).join(',');
      var score = count * 10 + adapters * 6 + curveScore * 5 + err * 2;
      var prev = results.get(sig);
      if (!prev || prev.score > score) results.set(sig, { items: items, count: count, adapters: adapters, err: err, score: score });
    }

    function evaluate() {
      evals++;
      var Rx = T.x - S.x - Dx, Ry = T.y - S.y - Dy;
      var resid = Math.hypot(Rx, Ry);
      if (resid <= tol) { record({}, resid); best = Math.min(best, resid); }
      // distinct gap directions
      var dirs = [], seen = {};
      for (var i = 0; i < gapsH.length; i++) {
        var hk = Math.round(gapsH[i] * 1000);
        if (seen[hk] !== undefined) continue;
        seen[hk] = dirs.length;
        var u = rot(1, 0, gapsH[i]);
        dirs.push({ gi: i, ux: u.x, uy: u.y });
      }
      var win = tol * 4;
      // one direction
      for (var a = 0; a < dirs.length; a++) {
        var d = dirs[a], g = Rx * d.ux + Ry * d.uy, perp = Math.abs(Rx * d.uy - Ry * d.ux);
        if (g < -tol) continue;
        var cand = near(g, Math.max(win, 30));
        for (var c = 0; c < cand.length; c++) {
          var err = Math.hypot(perp, g - cand[c].len);
          if (err < best) best = err;
          if (err <= tol) { var as = {}; as[d.gi] = cand[c]; record(as, err); }
        }
      }
      // two directions (exact 2x2 solve), optionally after fixing a third from the coarse list
      function pair(rx, ry, A, B, extra) {
        var det = A.ux * B.uy - A.uy * B.ux;
        if (Math.abs(det) < 1e-6) return;
        var ga = (rx * B.uy - ry * B.ux) / det, gb = (A.ux * ry - A.uy * rx) / det;
        if (ga < -tol || gb < -tol) return;
        var ca = near(ga, win), cb = near(gb, win);
        for (var i = 0; i < ca.length; i++) for (var j = 0; j < cb.length; j++) {
          var ex = rx - ca[i].len * A.ux - cb[j].len * B.ux, ey = ry - ca[i].len * A.uy - cb[j].len * B.uy;
          var err = Math.hypot(ex, ey);
          if (err < best) best = err;
          if (err <= tol) { var as = {}; as[A.gi] = ca[i]; as[B.gi] = cb[j]; if (extra) as[extra.gi] = extra.run; record(as, err); }
        }
      }
      for (var p = 0; p < dirs.length; p++) for (var q = p + 1; q < dirs.length; q++) pair(Rx, Ry, dirs[p], dirs[q]);
      if (dirs.length >= 3 && seq.length >= 2) {
        for (var w = 0; w < dirs.length; w++) {
          var W3 = dirs[w];
          for (var ci = 0; ci < coarse.length; ci++) {
            var run = coarse[ci], rx = Rx - run.len * W3.ux, ry = Ry - run.len * W3.uy;
            for (var p2 = 0; p2 < dirs.length; p2++) {
              if (p2 === w) continue;
              for (var q2 = p2 + 1; q2 < dirs.length; q2++) { if (q2 === w) continue; pair(rx, ry, dirs[p2], dirs[q2], { gi: W3.gi, run: run }); }
            }
          }
        }
      }
    }

    function dfs(h, depth, M) {
      if (timedOut) return;
      if ((++nodes & 1023) === 0 && Date.now() - t0 > P.timeLimit) { timedOut = true; return; }
      var diff = norm(targetH - h), dd = Math.min(diff, 360 - diff);
      if (depth === M) { if (dd < 1e-6) evaluate(); return; }
      if (dd > maxAng * (M - depth) + 1e-6) return;
      for (var i = 0; i < curves.length; i++) {
        var c = curves[i], r = rot(c.lx, c.ly, h), nh = norm(h + c.da);
        seq.push(c); gapsH.push(nh); Dx += r.x; Dy += r.y;
        dfs(nh, depth + 1, M);
        seq.pop(); gapsH.pop(); Dx -= r.x; Dy -= r.y;
        if (timedOut) return;
      }
    }
    var depthReached = -1;
    for (var M = 0; M <= P.maxCurves && !timedOut; M++) {
      dfs(startH, 0, M);
      if (!timedOut) depthReached = M;
      // any plan with more curves has at least M+1 pieces: stop once that can't beat the best found
      var minCount = Infinity;
      results.forEach(function (r) { if (r.count < minCount) minCount = r.count; });
      if (M + 1 > minCount + (P.slack == null ? 0 : P.slack)) break;
    }
    var list = Array.from(results.values()).sort(function (a, b) { return a.score - b.score; }).slice(0, P.maxResults || 80);
    return { results: list, nearest: isFinite(best) ? best : null, timedOut: timedOut, evals: evals, nodes: nodes, depthReached: depthReached, ms: Date.now() - t0, runs: runs.length };
  }

  /** Run in a Web Worker built from this function's source (works from file:// and single-file builds). */
  function solveAsync(params) {
    return new Promise(function (resolve, reject) {
      var worker;
      try {
        var src = 'var core = (' + core.toString() + ');\nself.onmessage = function (e) { try { self.postMessage({ ok: true, out: core(e.data) }); } catch (err) { self.postMessage({ ok: false, error: String(err) }); } };';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      } catch (e) {
        // Fallback: main thread (brief freeze) when workers are unavailable.
        try { resolve(core(params)); } catch (err) { reject(err); }
        return;
      }
      var timer = setTimeout(function () { worker.terminate(); reject(new Error('timeout')); }, params.timeLimit + 4000);
      worker.onmessage = function (e) { clearTimeout(timer); worker.terminate(); e.data.ok ? resolve(e.data.out) : reject(new Error(e.data.error)); };
      worker.onerror = function (e) { clearTimeout(timer); worker.terminate(); try { resolve(core(params)); } catch (err) { reject(err); } };
      solveAsync.cancel = function () { clearTimeout(timer); worker.terminate(); reject(new Error('cancelled')); };
      worker.postMessage(params);
    });
  }

  root.TinyTMTSolver = { core: core, solveAsync: solveAsync };
})(typeof window !== 'undefined' ? window : globalThis);
