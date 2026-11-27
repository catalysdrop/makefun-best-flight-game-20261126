// Ridge Runner — boot and main loop.
// Builds the valley, starts the render loop, chases the plane with a smoothed
// camera, and draws the HUD. With ?shot= it stages one frozen frame instead.

(function () {
  const canvas = document.getElementById('game');
  const renderer = makeRenderer(canvas);
  const hud = makeHud(canvas);
  const terrain = makeTerrain();
  const game = makeGame(terrain);
  const input = makeInput(canvas);

  const params = new URLSearchParams(location.search);
  const shotName = params.get('shot');
  const frozen = !!shotName;

  function resize() {
    renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // Smoothed camera state.
  const cam = {
    pos: { x: 0, y: 120, z: 0 },
    yaw: 0, pitch: 0, roll: 0,
    snapped: false,
  };

  // Debug handle (harmless in production): lets a screenshot probe inspect
  // the live scene without changing it.
  window.__rr = { renderer, terrain, game, cam };

  function updateCamera(dt) {
    const p = game.plane.state;
    const speed = frozen ? 1 : Math.min(1, dt * 4);
    if (game.state.camera === 'cockpit') {
      // Eyes in the cockpit, looking where the nose points.
      const fwd = [Math.sin(p.heading), 0, Math.cos(p.heading)];
      const target = {
        x: p.x + fwd[0] * 1.4,
        y: p.y + 1.0,
        z: p.z + fwd[2] * 1.4,
      };
      cam.pos.x = lerp(cam.pos.x, target.x, speed);
      cam.pos.y = lerp(cam.pos.y, target.y, speed);
      cam.pos.z = lerp(cam.pos.z, target.z, speed);
      cam.yaw = p.heading;
      cam.pitch = p.pitch * 0.9;
      cam.roll = p.roll * 0.9;
    } else {
      // Chase: behind, above, and a little to the side, so the fuselage
      // and nose read as a 3/4 view instead of a flat silhouette.
      const back = 15, up = 4.5, side = 4.5;
      const fwd = [Math.sin(p.heading), 0, Math.cos(p.heading)];
      const right = [Math.cos(p.heading), 0, -Math.sin(p.heading)];
      const target = {
        x: p.x - fwd[0] * back + right[0] * side,
        y: p.y + up,
        z: p.z - fwd[2] * back + right[2] * side,
      };
      const look = { x: p.x + fwd[0] * 12, y: p.y + 1, z: p.z + fwd[2] * 12 };
      const dx = look.x - target.x, dy = look.y - target.y, dz = look.z - target.z;
      cam.pos.x = lerp(cam.pos.x, target.x, speed);
      cam.pos.y = lerp(cam.pos.y, target.y, speed);
      cam.pos.z = lerp(cam.pos.z, target.z, speed);
      cam.yaw = lerpAngle(cam.yaw, Math.atan2(dx, dz), speed);
      cam.pitch = lerpAngle(cam.pitch, Math.atan2(dy, Math.hypot(dx, dz)), speed);
      cam.roll = lerpAngle(cam.roll, p.roll * 0.45, speed);
    }
    if (frozen && !cam.snapped) {
      // First frozen frame: snap the camera exactly onto the target.
      cam.snapped = true;
      updateCamera(1);
    }
  }

  function render() {
    updateCamera(1 / 60);
    const basis = renderer.cameraBasis(cam.pos, cam.yaw, cam.pitch, cam.roll);
    renderer.drawSky(basis);
    // Terrain chunks in view.
    for (const chunk of terrain.chunks) {
      if (!renderer.chunkVisible(basis, chunk)) continue;
      renderer.pushTris(basis, chunk.tris);
    }
    // Runway, village, forest and lake (one static triangle list).
    renderer.pushTris(basis, terrain.statics);
    // The plane (not in cockpit view — you are sitting in it).
    if (game.state.camera !== 'cockpit') renderer.drawPlane(basis, game.plane);
    renderer.flushTris();
    // Rings are drawn on top as glowing circles.
    for (let i = 0; i < RR.RINGS.length; i++) {
      if (i < game.state.nextRing && game.state.mission === 1) continue;
      renderer.drawRing(basis, RR.RINGS[i], i === game.state.nextRing);
    }
    // Drop-zone marker for sortie 2.
    if (game.state.mission === 2 && !game.state.dropDone) {
      const dz = RR.DROP_ZONE;
      const p = renderer.project(basis, dz.x, 60, dz.z);
      if (p) {
        const ctx = canvas.getContext('2d');
        const r = Math.max(6, (dz.r * renderer.focal) / p.d);
        ctx.strokeStyle = 'rgba(255, 214, 120, 0.9)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd678';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MAIL DROP', p.x, p.y - r - 10);
      }
    }
    // HUD.
    const s = game.hudState();
    hud.draw(s, renderer.width, renderer.height);
    // Menu overlay.
    if (game.state.phase === 'menu') drawMenu();
    if (game.state.phase === 'crashed') drawEnd('CRASHED', '#ff9a7a');
    if (game.state.phase === 'landed') drawEnd('SORTIE COMPLETE', RR.COLORS.hud);
  }

  function drawMenu() {
    const ctx = canvas.getContext('2d');
    const W = renderer.width, H = renderer.height;
    ctx.fillStyle = 'rgba(6, 18, 14, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eafff3';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('RIDGE RUNNER', W / 2, H / 2 - 120);
    ctx.fillStyle = RR.COLORS.hud;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('A bush-pilot courier over Crestline Valley', W / 2, H / 2 - 82);
    ctx.fillStyle = '#eafff3';
    ctx.font = '400 16px system-ui, sans-serif';
    const lines = [
      '1 — Ring Run: thread 6 valley rings, then land on Alder Field.',
      '2 — Mail Drop: drop the sack over Alder village (B), then land.',
      '3 — Touchdown: take off, fly one circuit, land cleanly.',
      '',
      'Arrows / WASD — fly · Shift / Ctrl — throttle · Q / E — rudder',
      'Space — brake · C — camera · M — mouse steering · B — drop mail · R — reset',
      '',
      'Fuel is limited and the timer runs. Mind the mountains.',
    ];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 44 + i * 26));
    ctx.fillStyle = RR.COLORS.hud;
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText('Press 1, 2 or 3 to fly — or any key for Ring Run', W / 2, H / 2 + 168);
  }

  function drawEnd(title, color) {
    const ctx = canvas.getContext('2d');
    const W = renderer.width, H = renderer.height;
    ctx.fillStyle = 'rgba(6, 18, 14, 0.55)';
    ctx.fillRect(0, H / 2 - 92, W, 150);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 44);
    ctx.fillStyle = '#eafff3';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('Score ' + game.state.score + '  ·  Best ' + game.state.best, W / 2, H / 2 - 2);
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillText('Press R to fly again, or 1 / 2 / 3 for another sortie', W / 2, H / 2 + 28);
  }

  let last = performance.now();
  let paused = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const inp = input.read();
    game.audio.resume();
    if (inp.pause) paused = !paused;
    if (!paused) game.update(dt, inp);
    render();
    if (!frozen) requestAnimationFrame(frame);
  }

  if (frozen) {
    setupShot(game, shotName);
    // One settled frame, then stop. No loop, no drift.
    game.update(0, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, brake: false,
      camera: false, mouseSteer: false, drop: false, reset: false, pause: false,
      mission: 0, anyKey: false });
    render();
    document.title = 'Ridge Runner — shot ' + shotName;
  } else {
    requestAnimationFrame(frame);
  }
})();
