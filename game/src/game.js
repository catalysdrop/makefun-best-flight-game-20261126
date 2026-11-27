// Ridge Runner — the game itself.
// Three sorties over Crestline Valley, one plane, one valley:
//   1 — Ring Run: thread all six valley rings, then land.
//   2 — Mail Drop: drop the mail sack over Alder village, then land.
//   3 — Touchdown: take off, circle once, and land cleanly on Alder Field.
// Fuel, a timer and the wind are the decisions; a hard landing ends the day.

function makeGame(terrain) {
  const plane = makePlane(terrain);
  const audio = makeAudio();
  const state = {
    phase: 'menu', // menu | flying | landed | crashed | done
    mission: 1,
    score: 0,
    ringsHit: 0,
    nextRing: 0,
    dropped: false,
    dropDone: false,
    timeLeft: 300,
    message: '',
    messageUntil: 0,
    elapsed: 0,
    mouseSteer: false,
    camera: 'chase', // chase | cockpit
    best: 0,
  };

  const MISSIONS = {
    1: { name: 'Sortie 1 — Ring Run', goal: 'Thread all 6 rings, then land on Alder Field.' },
    2: { name: 'Sortie 2 — Mail Drop', goal: 'Drop the mail over Alder village (B), then land.' },
    3: { name: 'Sortie 3 — Touchdown', goal: 'Take off, fly one circuit, land cleanly.' },
  };

  function say(msg, seconds) {
    state.message = msg;
    state.messageUntil = state.elapsed + (seconds || 3.5);
  }

  function startMission(n) {
    state.mission = n;
    state.score = 0;
    state.ringsHit = 0;
    state.nextRing = 0;
    state.dropped = false;
    state.dropDone = false;
    state.timeLeft = 300;
    state.elapsed = 0;
    plane.reset();
    state.phase = 'flying';
    say(MISSIONS[n].name + ' — ' + MISSIONS[n].goal, 5);
  }

  function ringPassed() {
    const ring = RR.RINGS[state.nextRing];
    if (!ring) return;
    const dx = plane.state.x - ring.x, dy = plane.state.y - ring.y, dz = plane.state.z - ring.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < ring.r) {
      state.ringsHit++;
      state.nextRing++;
      state.score += RR.SCORE.ring;
      audio.ringChime();
      if (state.nextRing >= RR.RINGS.length) {
        say('All rings! Now land on Alder Field for +' + RR.SCORE.landing + '.', 4);
      } else {
        say('Ring ' + state.ringsHit + ' of ' + RR.RINGS.length + '! +' + RR.SCORE.ring, 2.5);
      }
    }
  }

  function checkDrop() {
    if (state.mission !== 2 || state.dropped) return;
    const dz = RR.DROP_ZONE;
    const dx = plane.state.x - dz.x, dzz = plane.state.z - dz.z;
    if (Math.sqrt(dx * dx + dzz * dzz) < dz.r && plane.state.airborne && plane.state.y < 260) {
      state.dropped = true;
      state.dropDone = true;
      state.score += RR.SCORE.drop;
      audio.dropThud();
      say('Mail delivered over Alder village! +' + RR.SCORE.drop + ' — now land.', 4);
    }
  }

  function finishLanding() {
    if (state.phase !== 'flying') return;
    state.phase = 'landed';
    const bonus = state.mission === 1 && state.ringsHit === RR.RINGS.length
      ? RR.SCORE.landing : state.mission === 2 && state.dropDone
        ? RR.SCORE.landing : state.mission === 3 ? RR.SCORE.landing : 50;
    state.score += bonus;
    audio.landingBeep();
    say('Landed clean on Alder Field! +' + bonus + ' — sortie complete.', 6);
    if (state.score > state.best) state.best = state.score;
  }

  function crash() {
    if (state.phase !== 'flying') return;
    state.phase = 'crashed';
    audio.crashThud();
    say('Crashed! Press R to try again.', 6);
  }

  function update(dt, input) {
    state.elapsed += dt;
    if (state.message && state.elapsed > state.messageUntil) state.message = '';

    if (state.phase === 'menu') {
      if (input.mission) startMission(input.mission);
      else if (input.anyKey) startMission(1);
      return;
    }
    if (state.phase === 'landed' || state.phase === 'crashed') {
      if (input.reset) startMission(state.mission);
      if (input.mission) startMission(input.mission);
      return;
    }

    // Flying.
    if (input.camera) state.camera = state.camera === 'chase' ? 'cockpit' : 'chase';
    if (input.mouseSteer) {
      state.mouseSteer = !state.mouseSteer;
      say(state.mouseSteer ? 'Mouse steering ON — hold left button and move.' : 'Mouse steering OFF.', 2.5);
    }
    if (input.reset) { startMission(state.mission); return; }
    if (input.mission) { startMission(input.mission); return; }

    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft <= 0) {
      say('Out of time! Press R to fly again.', 5);
      state.phase = 'crashed';
      return;
    }

    plane.update(dt, input);
    audio.update(plane.state.throttle, plane.state.speed, plane.state.airborne);

    if (state.mission === 1) ringPassed();
    if (state.mission === 2 && input.drop) {
      // A manual drop only counts over the village; a wild drop wastes the sack.
      checkDrop();
      if (!state.dropped) say('Not over the village yet — the sack would be lost.', 2.5);
    }
    if (plane.state.landed) finishLanding();
    if (plane.state.crashed) crash();
    if (plane.state.fuel <= 0 && plane.state.airborne) {
      say('Fuel empty! Glide her down — gently.', 3);
    }
  }

  function hudState() {
    const p = plane.state;
    const headingDeg = ((radToDeg(p.heading) % 360) + 360) % 360;
    return {
      speedKts: p.speed * 1.944,
      altFt: (p.y - RR.RUNWAY.elevation) * 3.281,
      headingDeg,
      pitch: p.pitch,
      roll: p.roll,
      throttle: p.throttle,
      fuel: p.fuel,
      rpm: p.throttle * 100,
      ringsHit: state.ringsHit,
      ringsTotal: RR.RINGS.length,
      score: state.score,
      timeLeft: Math.ceil(state.timeLeft) + 's',
      mission: MISSIONS[state.mission].name,
      message: state.message,
      camera: state.camera,
    };
  }

  return {
    state, plane, audio, MISSIONS,
    startMission, update, hudState, say,
  };
}
