/* Blueprint-style PNG renderer (also used for library thumbnails). */
(function (root) {
  const BG = '#0f4c81', INK = '#ffffff', FAINT = 'rgba(255,255,255,0.10)', MID = 'rgba(255,255,255,0.28)';
  const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace';

  function bounds(derived) {
    const ws = derived.workspace;
    let x0 = ws.x0, y0 = ws.y0, x1 = ws.x1, y1 = ws.y1;
    derived.pieces.forEach((d) => d.outline.forEach((q) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }));
    return { x0, y0, x1, y1 };
  }

  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); }

  function drawTrack(ctx, derived, s, mini) {
    [...derived.pieces].sort((a, b) => Math.max(a.z0, a.z1) - Math.max(b.z0, b.z1)).forEach((d) => {
      poly(ctx, d.outline); ctx.closePath();
      ctx.fillStyle = d.z0 > 0.5 || d.z1 > 0.5 ? 'rgba(255,214,120,0.22)' : 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, (mini ? 0.6 : 1.2) / s * (mini ? 1 : 1)); ctx.strokeStyle = MID; ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(d.wallT, (mini ? 1 : 2) / s);
      [d.railL, d.railR].forEach((r) => { poly(ctx, r); ctx.stroke(); });
      if (!mini) {
        ctx.setLineDash([6 / s, 6 / s]); ctx.lineWidth = 1 / s; ctx.strokeStyle = MID; poly(ctx, d.center); ctx.stroke(); ctx.setLineDash([]);
        if (d.part.rise) { // chevrons uphill
          const m = d.center[Math.floor(d.center.length * 0.22)], up = d.part.rise > 0 ? 1 : -1;
          const a = d.headingMid * Math.PI / 180, L = d.W * 0.22;
          ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(a); ctx.strokeStyle = '#ffd678'; ctx.lineWidth = 2 / s;
          for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo((k * L * 0.8) - up * L * 0.4, -L); ctx.lineTo(k * L * 0.8 + up * L * 0.4, 0); ctx.lineTo((k * L * 0.8) - up * L * 0.4, L); ctx.stroke(); }
          ctx.restore();
        }
      }
    });
    if (!mini) {
      // labels
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      derived.pieces.forEach((d) => {
        const m = d.center[Math.floor(d.center.length / 2)];
        ctx.save(); ctx.translate(m.x, m.y); ctx.scale(1 / s, 1 / s);
        ctx.font = `600 11px ${MONO}`; ctx.fillText(d.shortLabel, 0, 0);
        if (d.z1 > 0.5 || d.z0 > 0.5) { ctx.font = `10px ${MONO}`; ctx.fillStyle = '#ffd678'; ctx.fillText(`z${Math.round(d.z0)}→${Math.round(d.z1)}`, 0, 13); ctx.fillStyle = INK; }
        ctx.restore();
      });
      // open ends
      derived.openConnectors.forEach((c) => { ctx.beginPath(); ctx.arc(c.x, c.y, 6 / s, 0, Math.PI * 2); ctx.fillStyle = '#ffd678'; ctx.fill(); });
    }
  }

  function render(derived, design, settings, opts) {
    opts = opts || {};
    const mini = !!opts.mini;
    const ws = derived.workspace;
    const b = bounds(derived);
    const pad = mini ? 60 : 180; // mm
    const bx0 = b.x0 - pad, by0 = b.y0 - pad, bw = b.x1 - b.x0 + 2 * pad, bh = b.y1 - b.y0 + 2 * pad;
    const maxW = mini ? (opts.width || 320) : 2400, maxH = mini ? (opts.width || 320) * 0.75 : 1800;
    const s = Math.min(maxW / bw, maxH / bh);
    const drawW = Math.round(bw * s), drawH = Math.round(bh * s);
    const sideW = mini ? 0 : 720, headH = mini ? 0 : 0;
    const bomRows = derived.bom.rows;
    const sideNeeded = 470 + bomRows.length * 26 + 120;
    const W = drawW + sideW, H = Math.max(drawH, mini ? 0 : sideNeeded) + headH;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

    // world transform
    ctx.save();
    ctx.translate(0, headH + (H - headH - drawH) / 2);
    ctx.scale(s, s); ctx.translate(-bx0, -by0);
    // grid
    const g = settings.gridSize, major = g * settings.majorEvery;
    if (!mini) {
      ctx.lineWidth = 1 / s;
      for (let x = Math.floor(bx0 / g) * g; x <= bx0 + bw; x += g) { ctx.strokeStyle = Math.abs(x % major) < 1e-6 ? MID : FAINT; ctx.beginPath(); ctx.moveTo(x, by0); ctx.lineTo(x, by0 + bh); ctx.stroke(); }
      for (let y = Math.floor(by0 / g) * g; y <= by0 + bh; y += g) { ctx.strokeStyle = Math.abs(y % major) < 1e-6 ? MID : FAINT; ctx.beginPath(); ctx.moveTo(bx0, y); ctx.lineTo(bx0 + bw, y); ctx.stroke(); }
    }
    // workspace
    ctx.strokeStyle = INK; ctx.lineWidth = (mini ? 1 : 2.5) / s; ctx.setLineDash([12 / s, 6 / s]);
    ctx.strokeRect(ws.x0, ws.y0, ws.x1 - ws.x0, ws.y1 - ws.y0); ctx.setLineDash([]);
    if (!mini) {
      // dimension lines
      ctx.lineWidth = 1.2 / s; ctx.strokeStyle = INK; ctx.fillStyle = INK;
      const off = 70;
      const dim = (x0, y0, x1, y1, label, vertical) => {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const tick = 12;
        [[x0, y0], [x1, y1]].forEach(([x, y]) => { ctx.beginPath(); if (vertical) { ctx.moveTo(x - tick, y); ctx.lineTo(x + tick, y); } else { ctx.moveTo(x, y - tick); ctx.lineTo(x, y + tick); } ctx.stroke(); });
        ctx.save(); ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); if (vertical) ctx.rotate(-Math.PI / 2);
        ctx.scale(1 / s, 1 / s); ctx.font = `600 14px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(label, 0, -4); ctx.restore();
      };
      dim(ws.x0, ws.y0 - off, ws.x1, ws.y0 - off, `${Math.round(ws.x1 - ws.x0)} mm`, false);
      dim(ws.x0 - off, ws.y0, ws.x0 - off, ws.y1, `${Math.round(ws.y1 - ws.y0)} mm`, true);
    }
    drawTrack(ctx, derived, s, mini);
    ctx.restore();

    if (!mini) drawSide(ctx, drawW, 0, sideW, H, derived, design, settings, s);
    return cv;
  }

  function drawSide(ctx, x, y, w, h, derived, design, settings, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x + 20, y + 20, w - 40, h - 40);
    let cy = y + 60; const lx = x + 44, rx = x + w - 44;
    ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `700 13px ${MONO}`; ctx.globalAlpha = 0.7; ctx.fillText('TINYTMT TRACK DESIGNER · SALVAGEGARDEN MAKERSPACE', lx, cy); ctx.globalAlpha = 1;
    cy += 44; ctx.font = `700 30px ${MONO}`;
    wrap(ctx, design.title.toUpperCase(), lx, cy, w - 88, 36).forEach((line, i) => ctx.fillText(line, lx, cy + i * 36));
    cy += 36 * wrap(ctx, design.title.toUpperCase(), lx, cy, w - 88, 36).length + 10;
    hr(ctx, lx, rx, cy); cy += 30;
    const st = derived.stats;
    const kv = [
      ['TRACK LENGTH', `${(st.length / 1000).toFixed(2)} m`],
      ['PIECES', `${st.pieces} track + ${st.supports} supports`],
      ['EST. PRINT TIME', fmtTime(st.minutes)],
      ['EST. PETG', `${Math.round(st.grams)} g  (${st.filamentM.toFixed(0)} m Ø${settings.filamentDiameter})`],
      ['WORKSPACE', `${settings.workspaceW} × ${settings.workspaceH} mm`],
      ['LAYOUT', `${st.openEnds === 0 && st.pieces ? 'closed loop' : st.openEnds + ' open ends'}${st.collisions ? ' · ' + st.collisions + ' overlaps' : ''}`],
      ['DATE', new Date().toISOString().slice(0, 10)]
    ];
    ctx.font = `14px ${MONO}`;
    kv.forEach(([k, v]) => { ctx.globalAlpha = 0.65; ctx.fillText(k, lx, cy); ctx.globalAlpha = 1; ctx.textAlign = 'right'; ctx.fillText(v, rx, cy); ctx.textAlign = 'left'; cy += 26; });
    cy += 6; hr(ctx, lx, rx, cy); cy += 32;
    ctx.font = `700 16px ${MONO}`; ctx.fillText('BILL OF MATERIALS — 3D PRINTED PARTS', lx, cy); cy += 28;
    ctx.font = `12px ${MONO}`; ctx.globalAlpha = 0.65;
    ctx.fillText('QTY', lx, cy); ctx.fillText('PART', lx + 56, cy); ctx.textAlign = 'right'; ctx.fillText('g EACH', rx - 120, cy); ctx.fillText('g TOTAL', rx, cy); ctx.textAlign = 'left'; ctx.globalAlpha = 1; cy += 8;
    hr(ctx, lx, rx, cy, 0.4); cy += 20;
    ctx.font = `14px ${MONO}`;
    derived.bom.rows.forEach((r) => {
      ctx.fillText(String(r.qty).padStart(3, ' '), lx, cy);
      let name = r.name + (r.width === 'double' ? ' [DBL]' : '');
      while (ctx.measureText(name).width > w - 88 - 56 - 200 && name.length > 4) name = name.slice(0, -2) + '…';
      ctx.fillText(name, lx + 56, cy);
      ctx.textAlign = 'right'; ctx.fillText(String(Math.round(r.gramsEach)), rx - 120, cy); ctx.fillText(String(Math.round(r.gramsTotal)), rx, cy); ctx.textAlign = 'left';
      cy += 26;
    });
    if (!derived.bom.rows.length) { ctx.globalAlpha = 0.6; ctx.fillText('(no parts yet)', lx, cy); ctx.globalAlpha = 1; cy += 26; }
    // scale bar
    const by = y + h - 70; const len = 500 * s;
    ctx.fillStyle = INK; ctx.font = `12px ${MONO}`;
    for (let i = 0; i < 5; i++) { ctx.globalAlpha = i % 2 ? 0.35 : 1; ctx.fillRect(lx + (len / 5) * i, by, len / 5, 8); }
    ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(lx, by, len, 8);
    ctx.fillText('0', lx - 3, by + 26); ctx.fillText('500 mm', lx + len - 24, by + 26);
    ctx.globalAlpha = 0.6; ctx.fillText('Estimates only — verify in your slicer.', lx, by - 16); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }

  function hr(ctx, x0, x1, y, a) { ctx.save(); ctx.globalAlpha = a || 0.8; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
  function wrap(ctx, text, x, y, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach((wd) => { const t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; });
    if (cur) lines.push(cur); return lines.slice(0, 3);
  }
  function fmtTime(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; }

  root.TinyTMTBlueprint = { render, fmtTime };
})(window);
