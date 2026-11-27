// Ridge Runner — the HUD.
// Everything the pilot reads: artificial horizon, airspeed and altitude tapes,
// heading compass, throttle and fuel, ring counter, score and mission text.
// In cockpit view a lit instrument panel is drawn along the bottom.

function makeHud(canvas) {
  const ctx = canvas.getContext('2d');

  function text(str, x, y, size, color, align, weight) {
    ctx.font = (weight || '600') + ' ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#eafff3';
    ctx.fillText(str, x, y);
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(8, 20, 16, ${alpha === undefined ? 0.55 : alpha})`;
    ctx.strokeStyle = 'rgba(125, 255, 206, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  // ---- Artificial horizon -------------------------------------------------------
  function drawHorizon(cx, cy, r, pitch, roll) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-roll);
    const pitchPx = clamp(pitch, -0.6, 0.6) * r * 1.4;
    // Sky half.
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-r, -r + pitchPx, r * 2, r);
    // Ground half.
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r, pitchPx, r * 2, r);
    // Horizon line.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r, pitchPx); ctx.lineTo(r, pitchPx); ctx.stroke();
    // Pitch ladder.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (const d of [-0.3, -0.15, 0.15, 0.3]) {
      const yy = pitchPx + d * r * 1.4;
      ctx.beginPath(); ctx.moveTo(-r * 0.45, yy); ctx.lineTo(r * 0.45, yy); ctx.stroke();
    }
    ctx.restore();
    // Fixed wings marker.
    ctx.strokeStyle = RR.COLORS.hud;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r - 8, cy); ctx.lineTo(cx - r * 0.35, cy);
    ctx.moveTo(cx + r * 0.35, cy); ctx.lineTo(cx + r + 8, cy);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = RR.COLORS.hud; ctx.fill();
    ctx.strokeStyle = 'rgba(125,255,206,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  // ---- Vertical tape (airspeed left, altitude right) -----------------------------
  function drawTape(x, y, w, h, value, unit, step, format) {
    panel(x, y, w, h, 0.5);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const centre = y + h / 2;
    const pxPerUnit = h / (step * 6);
    const base = Math.floor(value / step) * step;
    for (let v = base - step * 3; v <= base + step * 3; v += step) {
      const yy = centre - (v - value) * pxPerUnit;
      if (yy < y + 4 || yy > y + h - 4) continue;
      ctx.strokeStyle = 'rgba(234,255,243,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w - 14, yy); ctx.lineTo(x + w - 4, yy); ctx.stroke();
      text(format(v), x + w - 18, yy, 11, '#eafff3', 'right');
    }
    ctx.restore();
    // Centre readout.
    ctx.fillStyle = '#0b2e1e';
    ctx.fillRect(x - 4, centre - 12, w + 8, 24);
    ctx.strokeStyle = RR.COLORS.hud;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 4, centre - 12, w + 8, 24);
    text(format(value) + ' ' + unit, x + w / 2, centre, 13, RR.COLORS.hud, 'center', '700');
  }

  // ---- Heading compass -------------------------------------------------------------
  function drawCompass(cx, y, w, headingDeg) {
    panel(cx - w / 2, y, w, 30, 0.5);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2, y, w, 30); ctx.clip();
    const pxPerDeg = w / 120;
    for (let d = Math.floor((headingDeg - 60) / 10) * 10; d <= headingDeg + 60; d += 10) {
      const dd = ((d % 360) + 360) % 360;
      const xx = cx + (wrapDeg(d - headingDeg)) * pxPerDeg;
      ctx.strokeStyle = 'rgba(234,255,243,0.6)';
      ctx.beginPath(); ctx.moveTo(xx, y + 18); ctx.lineTo(xx, y + 26); ctx.stroke();
      const label = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd);
      text(label, xx, y + 10, 11, '#eafff3', 'center');
    }
    ctx.restore();
    // Centre caret + readout.
    ctx.fillStyle = RR.COLORS.hud;
    ctx.beginPath();
    ctx.moveTo(cx - 6, y + 30); ctx.lineTo(cx + 6, y + 30); ctx.lineTo(cx, y + 38); ctx.closePath(); ctx.fill();
    text(Math.round(headingDeg) + '°', cx, y + 50, 13, RR.COLORS.hud, 'center', '700');
  }
  function wrapDeg(d) {
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  // ---- Round gauge (cockpit panel) ----------------------------------------------------
  function drawGauge(cx, cy, r, value, max, label, unit) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#10181c';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,214,120,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Tick marks.
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const x1 = cx + Math.cos(a) * (r - 3), y1 = cy + Math.sin(a) * (r - 3);
      const x2 = cx + Math.cos(a) * (r - 9), y2 = cy + Math.sin(a) * (r - 9);
      ctx.strokeStyle = 'rgba(234,255,243,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // Needle.
    const a = Math.PI * 0.75 + clamp(value / max, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = '#ffd678';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); ctx.stroke();
    ctx.fillStyle = '#ffd678';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    text(label, cx, cy + r * 0.55, 10, '#eafff3', 'center');
    text(Math.round(value) + ' ' + unit, cx, cy - r * 0.55, 10, '#ffd678', 'center', '700');
  }

  // ---- Main draw ---------------------------------------------------------------------
  // s: { speedKts, altFt, headingDeg, pitch, roll, throttle, fuel, rpm,
  //      ringsHit, ringsTotal, score, timeLeft, mission, message, camera }
  function draw(s, W, H) {
    const hud = RR.COLORS.hud;
    // Top bar: mission + score + timer.
    panel(10, 10, 300, 44, 0.5);
    text('RIDGE RUNNER', 22, 26, 15, hud, 'left', '800');
    text(s.mission, 22, 43, 12, '#eafff3', 'left');
    panel(W - 220, 10, 210, 44, 0.5);
    text('SCORE ' + s.score, W - 206, 26, 14, hud, 'left', '700');
    text('TIME ' + s.timeLeft, W - 206, 43, 12, '#eafff3', 'left');

    // Compass.
    drawCompass(W / 2, 12, 260, s.headingDeg);

    // Tapes.
    drawTape(14, H / 2 - 110, 74, 220, s.speedKts, 'kt', 10, (v) => String(Math.round(v)));
    drawTape(W - 88, H / 2 - 110, 74, 220, s.altFt, 'ft', 100, (v) => String(Math.round(v)));

    // Cockpit instrument panel (drawn before the corner panels so they sit
    // on top of it instead of under it).
    if (s.camera === 'cockpit') {
      const py = H - 128;
      ctx.fillStyle = 'rgba(16, 20, 26, 0.92)';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, py + 40);
      ctx.quadraticCurveTo(W / 2, py - 26, W, py + 40);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,120,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, py + 40);
      ctx.quadraticCurveTo(W / 2, py - 26, W, py + 40);
      ctx.stroke();
      drawGauge(W / 2 - 190, H - 62, 40, s.speedKts, 180, 'AIRSPEED', 'kt');
      drawGauge(W / 2 - 95, H - 62, 40, s.altFt, 3000, 'ALT', 'ft');
      drawGauge(W / 2, H - 62, 40, s.rpm, 100, 'RPM', '%');
      drawGauge(W / 2 + 95, H - 62, 40, s.headingDeg, 360, 'HDG', '°');
      drawGauge(W / 2 + 190, H - 62, 40, s.fuel, 100, 'FUEL', '%');
    }

    // Artificial horizon (lower centre; raised in cockpit view so the panel
    // does not cut it in half).
    drawHorizon(W / 2, s.camera === 'cockpit' ? H - 200 : H - 108, 62, s.pitch, s.roll);

    // Throttle + fuel (bottom left).
    panel(14, H - 84, 150, 70, 0.5);
    text('THR', 26, H - 66, 11, hud, 'left', '700');
    ctx.fillStyle = 'rgba(234,255,243,0.2)';
    ctx.fillRect(66, H - 72, 84, 10);
    ctx.fillStyle = hud;
    ctx.fillRect(66, H - 72, 84 * clamp(s.throttle, 0, 1), 10);
    text('FUEL', 26, H - 38, 11, s.fuel < 25 ? '#ff9a7a' : hud, 'left', '700');
    ctx.fillStyle = 'rgba(234,255,243,0.2)';
    ctx.fillRect(66, H - 44, 84, 10);
    ctx.fillStyle = s.fuel < 25 ? '#ff9a7a' : hud;
    ctx.fillRect(66, H - 44, 84 * clamp(s.fuel / 100, 0, 1), 10);

    // Rings (bottom right).
    panel(W - 164, H - 84, 150, 70, 0.5);
    text('RINGS', W - 152, H - 66, 11, hud, 'left', '700');
    text(s.ringsHit + ' / ' + s.ringsTotal, W - 152, H - 40, 20, '#eafff3', 'left', '800');
    const ringDots = [];
    for (let i = 0; i < s.ringsTotal; i++) ringDots.push(i < s.ringsHit ? '●' : '○');
    text(ringDots.join(' '), W - 152, H - 18, 11, '#ffd678', 'left');

    // Message banner.
    if (s.message) {
      const mw = Math.min(520, W - 40);
      panel(W / 2 - mw / 2, 78, mw, 36, 0.65);
      text(s.message, W / 2, 96, 15, hud, 'center', '700');
    }
  }

  return { draw };
}
