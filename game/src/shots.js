// Ridge Runner — screenshot staging.
// ?shot=cover|ring|cockpit|landing puts the plane, the camera and the HUD in
// a fixed, flattering pose so the screenshots are real renders of the game
// in a repeatable state. The main loop renders one frame and stops.

function setupShot(game, name) {
  const p = game.plane.state;
  const g = game.state;
  g.phase = 'flying';
  g.camera = 'chase';
  g.score = 0;
  g.ringsHit = 0;
  g.nextRing = 0;
  g.timeLeft = 240;
  g.elapsed = 0;

  function place(x, y, z, heading, pitch, roll, speed, throttle) {
    p.x = x; p.y = y; p.z = z;
    p.heading = heading; p.pitch = pitch; p.roll = roll;
    p.speed = speed; p.throttle = throttle;
    p.airborne = true; p.crashed = false; p.landed = false;
    p.fuel = 78;
    p.propAngle = 0.6;
    p.verticalSpeed = 0;
  }

  if (name === 'cover') {
    // Chase view on the run-in to ring 1, runway and village below.
    place(150, 175, 320, 2.30, -0.04, 0.10, 55, 0.72);
    g.score = 100;
    g.ringsHit = 1;
    g.nextRing = 1;
    g.timeLeft = 232;
    game.say('Ring 2 ahead — hold her steady through the valley.', 99);
  } else if (name === 'ring') {
    // About to thread ring 3 between the peaks.
    place(880, 232, -640, 2.68, -0.02, -0.12, 58, 0.78);
    g.score = 200;
    g.ringsHit = 2;
    g.nextRing = 2;
    g.timeLeft = 198;
    game.say('Ring 3 dead ahead — thread the needle!', 99);
  } else if (name === 'cockpit') {
    // Cockpit view on final approach, runway lights ahead.
    place(-420, 108, 120, Math.PI / 2, -0.06, 0.0, 48, 0.45);
    g.camera = 'cockpit';
    g.score = 600;
    g.ringsHit = 6;
    g.nextRing = 6;
    g.timeLeft = 121;
    game.say('Final approach — Alder Field, runway in sight.', 99);
  } else if (name === 'landing') {
    // Wheels kissing the strip, sortie complete.
    place(120, RR.RUNWAY.elevation + 1.4, 120, Math.PI / 2, 0.05, 0.0, 24, 0.18);
    p.airborne = false;
    p.landed = true;
    g.phase = 'landed';
    g.score = 850;
    g.best = 850;
    g.ringsHit = 6;
    g.nextRing = 6;
    g.timeLeft = 96;
    game.say('Landed clean on Alder Field! +250 — sortie complete.', 99);
  } else {
    // Unknown shot: a plain chase view over the valley.
    place(0, 260, 500, 0.6, -0.05, 0.1, 55, 0.7);
  }
  return true;
}
