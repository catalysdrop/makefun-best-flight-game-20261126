// Ridge Runner — the Kestrel K-2 bush plane.
// Flight model (arcade, but honest): lift needs speed, banking turns the nose,
// the wing stalls below minimum speed, and the ground is unforgiving. The
// model is a Cessna-172-style high-wing plane built from shaded triangles:
// a lofted rounded fuselage, dihedral wing with struts, tailplane + fin,
// and fixed tricycle gear.

function makePlane(terrain) {
  const P = RR.PLANE;
  const state = {
    x: RR.RUNWAY.x - RR.RUNWAY.length / 2 + 40, // parked at the west threshold
    y: RR.RUNWAY.elevation + 1.2,
    z: RR.RUNWAY.z,
    heading: Math.PI / 2,      // facing east, down the runway
    pitch: 0, roll: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    fuel: P.startFuel,
    airborne: false,
    crashed: false,
    landed: false,
    propAngle: 0,
    gearDown: true,
  };

  function reset() {
    state.x = RR.RUNWAY.x - RR.RUNWAY.length / 2 + 40;
    state.y = RR.RUNWAY.elevation + 1.2;
    state.z = RR.RUNWAY.z;
    state.heading = Math.PI / 2;
    state.pitch = 0; state.roll = 0;
    state.speed = 0; state.throttle = 0;
    state.verticalSpeed = 0;
    state.fuel = P.startFuel;
    state.airborne = false; state.crashed = false; state.landed = false;
    state.propAngle = 0;
  }

  // input: { pitch: -1..1 (pull up positive), roll: -1..1, yaw: -1..1,
  //          throttleDelta: -1..1, brake: bool }
  function update(dt, input) {
    if (state.crashed) return;
    state.throttle = clamp(state.throttle + input.throttleDelta * dt * 0.9, 0, P.maxThrottle);
    if (state.fuel <= 0) state.throttle = 0;

    // Attitude follows the stick, eased toward it.
    const targetPitch = input.pitch * 0.42;
    const targetRoll = input.roll * 0.85;
    state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 2.2);
    state.roll += (targetRoll - state.roll) * Math.min(1, dt * 2.6);
    state.heading = wrapAngle(state.heading + input.yaw * P.yawRate * dt
      - Math.sin(state.roll) * P.turnCoordination * dt * (state.speed / P.cruiseSpeed));

    // Speed: thrust minus drag, plus a little help from gravity in a dive.
    const thrust = state.throttle * P.accel;
    const drag = P.drag * state.speed * state.speed;
    const slope = -Math.sin(state.pitch) * P.gravity * 0.6;
    state.speed = Math.max(0, state.speed + (thrust - drag + slope) * dt);
    if (input.brake && !state.airborne) state.speed = Math.max(0, state.speed - 26 * dt);

    // Lift: enough speed and the wing flies; below stall speed it sinks.
    const liftFactor = clamp(state.speed / P.minFlySpeed, 0, 1.6);
    const climbRate = Math.sin(state.pitch) * state.speed * liftFactor;
    const sinkRate = state.airborne && state.speed < P.minFlySpeed
      ? (P.minFlySpeed - state.speed) * 0.55 : 0;
    state.verticalSpeed = climbRate - sinkRate;

    // Move.
    const dirX = Math.sin(state.heading), dirZ = Math.cos(state.heading);
    state.x += dirX * Math.cos(state.pitch) * state.speed * dt;
    state.z += dirZ * Math.cos(state.pitch) * state.speed * dt;
    state.y += state.verticalSpeed * dt;

    // Fuel.
    state.fuel = Math.max(0, state.fuel - state.throttle * P.fuelBurn * dt);

    // Ground.
    const ground = terrain.heightAt(state.x, state.z);
    const onRunway = Math.abs(state.x - RR.RUNWAY.x) < RR.RUNWAY.length / 2
      && Math.abs(state.z - RR.RUNWAY.z) < RR.RUNWAY.width / 2;
    const groundY = onRunway ? RR.RUNWAY.elevation + 1.2 : ground + 1.2;
    if (state.y <= groundY) {
      state.y = groundY;
      const hardLanding = state.verticalSpeed < -7;
      const badAttitude = Math.abs(state.roll) > 0.5 || Math.abs(state.pitch) > 0.35;
      if (state.airborne && (hardLanding || badAttitude) && !onRunway) {
        state.crashed = true;
      } else if (state.airborne && onRunway && state.speed < 30 && state.verticalSpeed > -6) {
        state.landed = true;
      }
      if (state.speed > 4 && !state.airborne) {
        // Rolling on the ground: keep it on the strip, scrub speed on grass.
        if (!onRunway) state.speed = Math.max(0, state.speed - 9 * dt);
      }
      state.verticalSpeed = 0;
      state.airborne = false;
      state.pitch *= 0.9;
      state.roll *= 0.9;
    } else if (state.speed > P.minFlySpeed) {
      state.airborne = true;
      state.landed = false;
    }

    // World bounds: turn the plane gently back inside.
    const m = RR.WORLD_SIZE / 2 - 60;
    if (Math.abs(state.x) > m || Math.abs(state.z) > m) {
      state.heading = wrapAngle(state.heading + Math.PI * dt * 0.4);
    }

    state.propAngle += dt * (4 + state.throttle * 42);
  }

  // ---- Aircraft model: triangles in plane-local space ----------------------
  // Forward is +Z, up is +Y, right is +X. A Cessna-172-style high-wing bush
  // plane: the fuselage is a loft of octagonal cross-sections (rounded, not
  // a box), with a tapered nose + spinner cone, a high wing with dihedral
  // and struts, a tailplane + fin, and fixed tricycle gear. Built once,
  // shaded flat by the sun, transformed per frame. Every triangle is wound
  // so its normal points outward — the renderer culls back faces.
  const RED = [200, 55, 45], WHITE = [244, 241, 234], DARK = [44, 47, 54],
    GLASS = [90, 160, 210], YELLOW = [238, 198, 64], GREEN = [46, 190, 110];
  const MODEL = (function buildModel() {
    const t = [];
    function tri(a, b, c, col) { t.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col[0], col[1], col[2]); }
    function quad(a, b, c, d, col) { tri(a, b, c, col); tri(a, c, d, col); }
    // Same quad mirrored across the X axis. Mirroring flips the winding, so
    // the vertex order is reversed to keep the normal pointing outward.
    function mirrorQuad(a, b, c, d, col) {
      const m = (p) => [-p[0], p[1], p[2]];
      quad(m(a), m(d), m(c), m(b), col);
    }
    function mirrorTri(a, b, c, col) {
      const m = (p) => [-p[0], p[1], p[2]];
      tri(m(a), m(c), m(b), col);
    }
    // One quad on both sides (a face on the right + its mirror on the left).
    function bothSides(a, b, c, d, col) { quad(a, b, c, d, col); mirrorQuad(a, b, c, d, col); }
    // A thin plate visible from both faces (struts, gear legs).
    function doubleQuad(a, b, c, d, col) { quad(a, b, c, d, col); quad(a, d, c, b, col); }
    function plateBoth(a, b, c, d, col) {
      doubleQuad(a, b, c, d, col);
      const m = (p) => [-p[0], p[1], p[2]];
      doubleQuad(m(a), m(b), m(c), m(d), col);
    }

    // ---- Fuselage loft ------------------------------------------------------
    // Rings from tail tip to nose. 8 points per ring, theta from +X toward
    // +Y (counter-clockwise seen from ahead), so the loft quads wind outward.
    const RINGS = [
      { z: -3.00, cy: 0.32, rx: 0.05, ry: 0.08 },
      { z: -2.70, cy: 0.30, rx: 0.16, ry: 0.20 },
      { z: -2.20, cy: 0.26, rx: 0.26, ry: 0.30 },
      { z: -1.60, cy: 0.22, rx: 0.36, ry: 0.40 },
      { z: -0.90, cy: 0.18, rx: 0.44, ry: 0.47 },
      { z: -0.20, cy: 0.16, rx: 0.48, ry: 0.50 },
      { z:  0.60, cy: 0.15, rx: 0.49, ry: 0.51 },
      { z:  1.10, cy: 0.14, rx: 0.47, ry: 0.48 },
      { z:  1.70, cy: 0.12, rx: 0.44, ry: 0.44 },
      { z:  2.40, cy: 0.10, rx: 0.40, ry: 0.40 },
      { z:  2.95, cy: 0.08, rx: 0.32, ry: 0.32 },
      { z:  3.30, cy: 0.06, rx: 0.18, ry: 0.18 },
    ];
    const SIDES = 8;
    const LOFT = RINGS.map((r) => {
      const pts = [];
      for (let k = 0; k < SIDES; k++) {
        const th = (k / SIDES) * Math.PI * 2;
        pts.push([r.rx * Math.cos(th), r.cy + r.ry * Math.sin(th), r.z]);
      }
      return pts;
    });
    // Segment i (between ring i and i+1), side k (theta k*45..(k+1)*45 deg):
    // red tail cone, red belly (sides 5 and 6), otherwise white.
    for (let i = 0; i < LOFT.length - 1; i++) {
      const a = LOFT[i], b = LOFT[i + 1];
      for (let k = 0; k < SIDES; k++) {
        const k2 = (k + 1) % SIDES;
        const col = (i <= 1 || k === 5 || k === 6) ? RED : WHITE;
        quad(a[k], a[k2], b[k2], b[k], col);
      }
    }
    // Tail cap: fan to the centre of the tail-tip ring.
    const tailC = [0, RINGS[0].cy, RINGS[0].z];
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      tri(tailC, LOFT[0][k2], LOFT[0][k], RED);
    }
    // Spinner cone: fan from the nose tip to the last ring.
    const noseTip = [0, RINGS[RINGS.length - 1].cy, 3.56];
    const noseRing = LOFT[LOFT.length - 1];
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      tri(noseTip, noseRing[k], noseRing[k2], RED);
    }

    // Point on the fuselage surface at height z, angle theta (radians from
    // +X toward +Y), pushed `out` metres along the radial direction.
    function surfacePoint(z, theta, out) {
      let i = 0;
      while (i < RINGS.length - 2 && RINGS[i + 1].z < z) i++;
      const a = RINGS[i], b = RINGS[i + 1];
      const f = clamp((z - a.z) / (b.z - a.z), 0, 1);
      const cy = lerp(a.cy, b.cy, f), rx = lerp(a.rx, b.rx, f), ry = lerp(a.ry, b.ry, f);
      const c = Math.cos(theta), s = Math.sin(theta);
      return [(rx + out) * c, cy + (ry + out) * s, z];
    }

    // Red cheatline: a thin band hugging each fuselage side.
    function cheatline(centerTheta) {
      const ths = [centerTheta - 0.38, centerTheta, centerTheta + 0.38];
      const zs = [-2.20, -1.60, -0.90, -0.20, 0.60, 1.10, 1.70, 2.40];
      const secs = zs.map((z) => ths.map((th) => surfacePoint(z, th, 0.014)));
      for (let i = 0; i < secs.length - 1; i++) {
        for (let k = 0; k < ths.length - 1; k++) {
          quad(secs[i][k], secs[i][k + 1], secs[i + 1][k + 1], secs[i + 1][k], RED);
        }
      }
    }
    cheatline(0);
    cheatline(Math.PI);

    // Windshield: glass strip across the top of the cabin nose.
    (function windshield() {
      const ths = [0.96, Math.PI / 2, Math.PI - 0.96];
      const zs = [0.95, 1.25, 1.60];
      const secs = zs.map((z) => ths.map((th) => surfacePoint(z, th, 0.015)));
      for (let i = 0; i < secs.length - 1; i++) {
        for (let k = 0; k < ths.length - 1; k++) {
          quad(secs[i][k], secs[i][k + 1], secs[i + 1][k + 1], secs[i + 1][k], GLASS);
        }
      }
    })();

    // Side windows, hugging the cabin facets (front pair + rear pair).
    function sideWindow(z0, z1, th0, th1) {
      const a = surfacePoint(z0, th0, 0.015), b = surfacePoint(z0, th1, 0.015);
      const c = surfacePoint(z1, th1, 0.015), d = surfacePoint(z1, th0, 0.015);
      bothSides(a, b, c, d, GLASS);
    }
    sideWindow(0.30, 1.05, 0.21, 0.66);
    sideWindow(-0.55, 0.15, 0.21, 0.66);

    // ---- Main wing (high wing, slight dihedral) ---------------------------
    // Right half-wing is written out; the left half mirrors it. Top white,
    // bottom red, leading edge white, trailing edge red, tip red.
    bothSides([0.45, 0.70, 0.55], [4.6, 0.98, 0.35], [4.6, 0.98, -0.45], [0.45, 0.70, -0.65], WHITE);
    bothSides([0.45, 0.61, -0.65], [4.6, 0.89, -0.45], [4.6, 0.89, 0.35], [0.45, 0.61, 0.55], RED);
    bothSides([0.45, 0.61, 0.55], [4.6, 0.89, 0.35], [4.6, 0.98, 0.35], [0.45, 0.70, 0.55], WHITE);
    bothSides([0.45, 0.70, -0.65], [4.6, 0.98, -0.45], [4.6, 0.89, -0.45], [0.45, 0.61, -0.65], RED);
    bothSides([4.6, 0.89, 0.35], [4.6, 0.89, -0.45], [4.6, 0.98, -0.45], [4.6, 0.98, 0.35], RED);
    // Wing struts: thin plates from the lower fuselage to the wing.
    plateBoth([0.32, -0.12, 0.55], [2.62, 0.76, 0.18], [2.62, 0.76, -0.02], [0.32, -0.12, 0.28], DARK);

    // ---- Tail ----------------------------------------------------------------
    // Horizontal stabilizer (same construction as the wing, smaller).
    bothSides([0.15, 0.46, -2.15], [1.85, 0.52, -2.30], [1.85, 0.52, -2.85], [0.15, 0.46, -2.90], WHITE);
    bothSides([0.15, 0.38, -2.90], [1.85, 0.44, -2.85], [1.85, 0.44, -2.30], [0.15, 0.38, -2.15], RED);
    bothSides([0.15, 0.38, -2.15], [1.85, 0.44, -2.30], [1.85, 0.52, -2.30], [0.15, 0.46, -2.15], WHITE);
    bothSides([0.15, 0.46, -2.90], [1.85, 0.52, -2.85], [1.85, 0.44, -2.85], [0.15, 0.38, -2.90], RED);
    bothSides([1.85, 0.44, -2.30], [1.85, 0.44, -2.85], [1.85, 0.52, -2.85], [1.85, 0.52, -2.30], RED);
    // Vertical fin: swept plate, red with a white tip.
    bothSides([0.06, 0.45, -2.00], [0.06, 0.45, -2.95], [0.06, 1.45, -2.90], [0.06, 1.50, -2.75], RED);
    quad([0.06, 1.50, -2.75], [-0.06, 1.50, -2.75], [-0.06, 0.45, -2.00], [0.06, 0.45, -2.00], RED);
    quad([-0.06, 0.45, -2.95], [-0.06, 1.45, -2.90], [0.06, 1.45, -2.90], [0.06, 0.45, -2.95], RED);
    quad([0.06, 1.45, -2.90], [-0.06, 1.45, -2.90], [-0.06, 1.50, -2.75], [0.06, 1.50, -2.75], WHITE);

    // ---- Fixed tricycle gear --------------------------------------------------
    // Wheels: hexagonal tubes (axis along X), dark.
    function wheel(cx, cy, cz, r, w) {
      const secs = [];
      for (const dx of [-w / 2, w / 2]) {
        const ring = [];
        for (let k = 0; k < 6; k++) {
          const ph = (k / 6) * Math.PI * 2;
          ring.push([cx + dx, cy + r * Math.cos(ph), cz + r * Math.sin(ph)]);
        }
        secs.push(ring);
      }
      for (let k = 0; k < 6; k++) {
        const k2 = (k + 1) % 6;
        quad(secs[0][k], secs[0][k2], secs[1][k2], secs[1][k], DARK);
      }
      const c0 = [cx - w / 2, cy, cz], c1 = [cx + w / 2, cy, cz];
      for (let k = 0; k < 6; k++) {
        const k2 = (k + 1) % 6;
        tri(c1, secs[1][k], secs[1][k2], DARK);
        tri(c0, secs[0][k2], secs[0][k], DARK);
      }
    }
    wheel(0.55, -1.02, 0.95, 0.16, 0.12);
    wheel(-0.55, -1.02, 0.95, 0.16, 0.12);
    wheel(0, -1.02, 2.55, 0.13, 0.10);
    // Main legs: splayed struts from the belly to the main axles.
    plateBoth([0.30, -0.25, 1.02], [0.55, -1.02, 1.02], [0.55, -1.02, 0.88], [0.30, -0.25, 0.88], DARK);
    // Nose leg: vertical strut to the nose wheel.
    plateBoth([0.06, -0.30, 2.62], [0.06, -1.02, 2.62], [0.06, -1.02, 2.48], [0.06, -0.30, 2.48], DARK);

    // ---- Nav lights ------------------------------------------------------------
    // Green right tip, red left tip, white tail (proud of the surface).
    tri([4.62, 0.93, 0.30], [4.62, 0.93, -0.40], [4.62, 0.99, -0.05], GREEN);
    mirrorTri([4.62, 0.93, 0.30], [4.62, 0.93, -0.40], [4.62, 0.99, -0.05], RED);
    tri([0.00, 0.34, -3.02], [0.09, 0.22, -3.02], [-0.09, 0.22, -3.02], WHITE);

    return new Float32Array(t);
  })();

  // Propeller blades (drawn rotated around the nose axis). Tapered blades
  // with yellow tips, double-sided so they read from the chase view too.
  const PROP = (function buildProp() {
    const t = [];
    function tri(a, b, c, col) { t.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col[0], col[1], col[2]); }
    function quad(a, b, c, d, col) { tri(a, b, c, col); tri(a, c, d, col); }
    function doubleQuad(a, b, c, d, col) { quad(a, b, c, d, col); quad(a, d, c, b, col); }
    // One blade: dark shank with a yellow tip. sign +1: blade up; -1: down.
    function blade(sign) {
      const z = 3.56;
      const y0 = sign * 0.10, y1 = sign * 1.18, y2 = sign * 1.45;
      doubleQuad([-0.09, y0, z], [0.09, y0, z], [0.06, y1, z], [-0.06, y1, z], DARK);
      doubleQuad([-0.06, y1, z], [0.06, y1, z], [0.05, y2, z], [-0.05, y2, z], YELLOW);
    }
    blade(1);
    blade(-1);
    return new Float32Array(t);
  })();

  return { state, update, reset, MODEL, PROP };
}
