/* Obstacle insert markings, drawn in a piece's local frame (entry at origin, heading +x, units mm). */
(function (root) {
  function draw(ctx, part, W, opts) {
    if (!part || !part.obstacle) return;
    const L = part.length, wallT = opts.wallT || 3, px = opts.px || 1, col = opts.color || '#333';
    const inner = W / 2 - wallT, mid = L / 2;
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2 * px, 1);
    switch (part.obstacle) {
      case 'doorway': {
        const lane = opts.laneWidth || 115, n = Math.max(6, (W - 2 * wallT - (W - 2 * wallT) * 90 / lane) / 2);
        ctx.fillRect(mid - 20, -inner, 40, n); ctx.fillRect(mid - 20, inner - n, 40, n);
        break;
      }
      case 'sill': ctx.globalAlpha = 0.85; ctx.fillRect(mid - 6, -inner, 12, 2 * inner); break;
      case 'rough': {
        ctx.globalAlpha = 0.7;
        for (let x = 25; x <= L - 25; x += 18) for (let y = -inner + 9; y <= inner - 9; y += 18) {
          const o = ((Math.round(x / 18) % 2) * 9);
          ctx.beginPath(); ctx.arc(x, y + o > inner - 4 ? y : y + o, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'kerb': {
        ctx.globalAlpha = 0.25; ctx.fillRect(mid - 40, -inner, 80, 2 * inner); ctx.globalAlpha = 1;
        ctx.strokeRect(mid - 40, -inner, 80, 2 * inner);
        ctx.save(); ctx.beginPath(); ctx.rect(mid - 40, -inner, 80, 2 * inner); ctx.clip();
        ctx.beginPath(); for (let k = -2 * inner; k < 80 + 2 * inner; k += 14) { ctx.moveTo(mid - 40 + k, -inner); ctx.lineTo(mid - 40 + k + 2 * inner, inner); } ctx.stroke(); ctx.restore();
        break;
      }
      case 'slope': {
        ctx.globalAlpha = 0.85;
        [L * 0.25, L * 0.5, L * 0.75].forEach((x) => {
          ctx.beginPath(); ctx.moveTo(x, -inner * 0.7); ctx.lineTo(x, inner * 0.7);
          ctx.moveTo(x - 9, inner * 0.7 - 12); ctx.lineTo(x, inner * 0.7); ctx.lineTo(x + 9, inner * 0.7 - 12); ctx.stroke();
        });
        break;
      }
    }
    ctx.restore();
  }
  root.TinyTMTMarks = { draw };
})(window);
