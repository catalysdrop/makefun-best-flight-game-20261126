// Ridge Runner — the Kestrel K-2 bush plane.
// Flight model (arcade, but honest): lift needs speed, banking turns the nose,
// the wing stalls below minimum speed, and the ground is unforgiving. The
// model itself is a small set of shaded triangles built from the same palette.

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
  // Forward is +Z, up is +Y, right is +X. Built once, transformed per frame.
  const RED = [200, 55, 45], WHITE = [244, 241, 234], DARK = [44, 47, 54], GLASS = [90, 160, 210];
  const MODEL = (function buildModel() {
    const t = [];
    function tri(a, b, c, col) { t.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col[0], col[1], col[2]); }
    function quad(a, b, c, d, col) { tri(a, b, c, col); tri(a, c, d, col); }
    // Fuselage: a tapered box, nose at +Z.
    const nose = [0, 0.15, 3.4], tail = [0, 0.35, -2.6];
    quad([-0.55, -0.25, -2.6], [0.55, -0.25, -2.6], [0.55, 0.55, -2.6], [-0.55, 0.55, -2.6], RED);   // tail face
    quad([-0.55, -0.25, 3.0], [0.55, -0.25, 3.0], [0.55, 0.35, 3.0], [-0.55, 0.35, 3.0], WHITE);     // nose face
    quad([-0.55, -0.25, -2.6], [-0.55, -0.25, 3.0], [-0.55, 0.35, 3.0], [-0.55, 0.55, -2.6], RED);    // left side
    quad([0.55, -0.25, 3.0], [0.55, -0.25, -2.6], [0.55, 0.55, -2.6], [0.55, 0.35, 3.0], RED);        // right side
    quad([-0.55, 0.55, -2.6], [-0.55, 0.35, 3.0], [0.55, 0.35, 3.0], [0.55, 0.55, -2.6], WHITE);      // top
    quad([-0.55, -0.25, 3.0], [-0.55, -0.25, -2.6], [0.55, -0.25, -2.6], [0.55, -0.25, 3.0], DARK);   // belly
    // Windshield + side windows (glass band).
    quad([-0.5, 0.36, 1.4], [0.5, 0.36, 1.4], [0.42, 0.72, 0.7], [-0.42, 0.72, 0.7], GLASS);
    quad([-0.55, 0.0, 0.6], [-0.55, 0.0, 1.8], [-0.5, 0.62, 1.55], [-0.5, 0.62, 0.75], GLASS);
    quad([0.55, 0.0, 1.8], [0.55, 0.0, 0.6], [0.5, 0.62, 0.75], [0.5, 0.62, 1.55], GLASS);
    // Main wing (high wing) + struts.
    quad([-4.6, 0.55, 0.4], [4.6, 0.55, 0.4], [4.6, 0.62, -0.5], [-4.6, 0.62, -0.5], WHITE);
    quad([-4.6, 0.62, -0.5], [4.6, 0.62, -0.5], [4.6, 0.55, 0.4], [-4.6, 0.55, 0.4], RED);
    tri([-0.5, 0.55, 0.3], [-0.5, -0.2, 0.9], [-0.42, -0.2, 0.9], DARK);
    tri([0.5, 0.55, 0.3], [0.42, -0.2, 0.9], [0.5, -0.2, 0.9], DARK);
    // Tailplane + fin.
    quad([-1.7, 0.45, -2.5], [1.7, 0.45, -2.5], [1.7, 0.5, -3.0], [-1.7, 0.5, -3.0], WHITE);
    quad([-0.06, 0.5, -2.2], [0.06, 0.5, -2.2], [0.06, 1.5, -2.9], [-0.06, 1.5, -2.9], RED);
    tri([0, 1.5, -2.9], [0.06, 0.5, -2.2], [-0.06, 0.5, -2.2], RED);
    // Landing gear: two wheels.
    tri([-0.5, -0.25, 1.2], [-0.5, -0.85, 1.2], [-0.42, -0.85, 1.2], DARK);
    tri([0.5, -0.25, 1.2], [0.42, -0.85, 1.2], [0.5, -0.85, 1.2], DARK);
    // Propeller: two blades, spun by propAngle at draw time (kept separate).
    return new Float32Array(t);
  })();

  // Propeller blades (drawn rotated around the nose axis).
  const PROP = (function buildProp() {
    const t = [];
    function tri(a, b, c, col) { t.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col[0], col[1], col[2]); }
    tri([-0.08, 0.2, 3.55], [0.08, 0.2, 3.55], [0.08, 1.5, 3.55], DARK);
    tri([-0.08, 0.2, 3.55], [0.08, 1.5, 3.55], [-0.08, 1.5, 3.55], DARK);
    tri([-0.08, -1.5, 3.55], [0.08, -1.5, 3.55], [0.08, -0.2, 3.55], DARK);
    tri([-0.08, -1.5, 3.55], [0.08, -0.2, 3.55], [-0.08, -0.2, 3.55], DARK);
    return new Float32Array(t);
  })();

  return { state, update, reset, MODEL, PROP };
}
