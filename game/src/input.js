// Ridge Runner — input.
// Keyboard and mouse, as the bounty asks. Arrows / WASD fly the plane,
// Shift and Ctrl work the throttle, C swaps the camera, M toggles mouse
// steering, B drops the mail, R resets to the runway, P pauses, 1-3 pick a
// sortie. Mouse steering: hold the left button and move — the plane banks
// and pitches toward the cursor.

function makeInput(canvas) {
  const keys = {};
  const mouse = { x: 0, y: 0, down: false, active: false, steerX: 0, steerY: 0 };
  const pressed = {}; // edge-triggered keys, consumed by the game each frame

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!keys[e.key]) pressed[e.key] = true;
    keys[e.key] = true;
  }
  function onKeyUp(e) { keys[e.key] = false; }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width;
    mouse.y = (e.clientY - r.top) / r.height;
    if (mouse.down) {
      mouse.steerX = clamp((mouse.x - 0.5) * 2, -1, 1);
      mouse.steerY = clamp((mouse.y - 0.5) * 2, -1, 1);
    }
  }
  function onMouseDown(e) {
    mouse.down = true;
    mouse.active = true;
    onMouseMove(e);
  }
  function onMouseUp() {
    mouse.down = false;
    mouse.steerX = 0; mouse.steerY = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  function down(...names) { return names.some((n) => keys[n]); }

  // Returns the frame's control vector, and clears edge-triggered presses.
  function read() {
    let pitch = 0, roll = 0, yaw = 0, throttleDelta = 0;
    if (down('ArrowUp', 'w', 'W')) pitch += 1;
    if (down('ArrowDown', 's', 'S')) pitch -= 1;
    if (down('ArrowLeft', 'a', 'A')) roll -= 1;
    if (down('ArrowRight', 'd', 'D')) roll += 1;
    if (down('q', 'Q')) yaw -= 1;
    if (down('e', 'E')) yaw += 1;
    if (down('Shift')) throttleDelta += 1;
    if (down('Control')) throttleDelta -= 1;
    if (down('+', '=')) throttleDelta += 1;
    if (down('-', '_')) throttleDelta -= 1;
    if (mouse.down) {
      roll += mouse.steerX;
      pitch -= mouse.steerY;
    }
    const out = {
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      yaw: clamp(yaw, -1, 1),
      throttleDelta: clamp(throttleDelta, -1, 1),
      brake: down(' '),
      camera: !!pressed['c'] || !!pressed['C'],
      mouseSteer: !!pressed['m'] || !!pressed['M'],
      drop: !!pressed['b'] || !!pressed['B'],
      reset: !!pressed['r'] || !!pressed['R'],
      pause: !!pressed['p'] || !!pressed['P'],
      mission: pressed['1'] ? 1 : pressed['2'] ? 2 : pressed['3'] ? 3 : 0,
      anyKey: Object.keys(pressed).length > 0,
    };
    for (const k in pressed) delete pressed[k];
    return out;
  }

  return { read, keys, mouse };
}
