// Ridge Runner — the renderer.
// A small software 3D renderer on a 2D canvas: sky, sun and clouds, then
// every triangle the camera can see, shaded by the sun, fogged by distance,
// painted far-to-near. No library, no WebGL, no network.

function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, F = 800; // focal length in pixels
  const TAN_HALF = Math.tan(degToRad(RR.CAMERA.fovDeg) / 2);

  function resize(w, h) {
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    F = (h / 2) / TAN_HALF;
  }

  // Camera basis from yaw (heading), pitch, roll. Returns {pos, right, up, fwd}.
  function cameraBasis(pos, yaw, pitch, roll) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // Forward (before roll): (sin yaw * cos pitch, sin pitch, cos yaw * cos pitch)
    let fwd = [sy * cp, sp, cy * cp];
    // Right = up0 x fwd, normalised.
    let right = [cy * cp, 0, -sy * cp];
    const rl = Math.hypot(right[0], right[1], right[2]) || 1;
    right = [right[0] / rl, right[1] / rl, right[2] / rl];
    // Up = fwd x right.
    let up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ];
    // Roll around the forward axis.
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2 = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
    const u2 = [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr];
    return { pos, right: r2, up: u2, fwd };
  }

  function toCamera(cam, x, y, z) {
    const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
    return [
      dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2],
      dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2],
      dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2],
    ];
  }

  function project(cam, x, y, z) {
    const c = toCamera(cam, x, y, z);
    if (c[2] < 0.6) return null;
    return { x: W / 2 + (c[0] * F) / c[2], y: H / 2 - (c[1] * F) / c[2], d: c[2] };
  }

  // ---- Sky ------------------------------------------------------------------
  const SUN_DIR = [0.45, 0.62, 0.55]; // where the sun sits (normalised-ish)
  const CLOUDS = (function () {
    const rng = makeRng(4242);
    const list = [];
    for (let i = 0; i < 14; i++) {
      list.push({
        x: (rng() * 2 - 1) * 1800, y: 420 + rng() * 160, z: (rng() * 2 - 1) * 1800,
        rx: 120 + rng() * 160, ry: 26 + rng() * 22,
      });
    }
    return list;
  })();

  function drawSky(cam) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, RR.COLORS.skyTop);
    g.addColorStop(0.62, RR.COLORS.skyHorizon);
    g.addColorStop(1, '#e8f1f8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun.
    const sunAt = project(cam, cam.pos.x + SUN_DIR[0] * 3000, cam.pos.y + SUN_DIR[1] * 3000, cam.pos.z + SUN_DIR[2] * 3000);
    if (sunAt) {
      const glow = ctx.createRadialGradient(sunAt.x, sunAt.y, 4, sunAt.x, sunAt.y, 90);
      glow.addColorStop(0, 'rgba(255,243,196,0.95)');
      glow.addColorStop(0.35, 'rgba(255,240,180,0.45)');
      glow.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sunAt.x, sunAt.y, 90, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = RR.COLORS.sun;
      ctx.beginPath(); ctx.arc(sunAt.x, sunAt.y, 22, 0, Math.PI * 2); ctx.fill();
    }
    // Clouds (soft billboards).
    for (const c of CLOUDS) {
      const p = project(cam, c.x, c.y, c.z);
      if (!p) continue;
      const s = F / p.d;
      const rx = c.rx * s, ry = c.ry * s;
      if (rx < 2) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x - rx * 0.5, p.y + ry * 0.25, rx * 0.6, ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + rx * 0.55, p.y + ry * 0.2, rx * 0.65, ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Triangle soup ----------------------------------------------------------
  // A draw list entry: [depth, x1, y1, x2, y2, x3, y3, r, g, b]
  const drawList = [];
  const HORIZON = [207, 230, 247];

  function fogMix(r, g, b, depth) {
    const t = clamp((depth - RR.FOG_NEAR) / (RR.FOG_FAR - RR.FOG_NEAR), 0, 1);
    return [
      Math.round(lerp(r, HORIZON[0], t)),
      Math.round(lerp(g, HORIZON[1], t)),
      Math.round(lerp(b, HORIZON[2], t)),
    ];
  }

  function clipNear(poly, near) {
    // Sutherland–Hodgman against the near plane (camera-space z >= near).
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
      const curIn = cur[2] >= near, prevIn = prev[2] >= near;
      if (curIn) {
        if (!prevIn) out.push(intersectNear(prev, cur, near));
        out.push(cur);
      } else if (prevIn) {
        out.push(intersectNear(prev, cur, near));
      }
    }
    return out;
  }
  function intersectNear(p, q, near) {
    const t = (near - p[2]) / (q[2] - p[2]);
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, near];
  }

  function pushTri(cam, ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b) {
    // Backface cull in world space: normal facing away from the camera.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (ax + bx + cx) / 3 - cam.pos.x;
    const my = (ay + by + cy) / 3 - cam.pos.y;
    const mz = (az + bz + cz) / 3 - cam.pos.z;
    if (nx * mx + ny * my + nz * mz > 0) return; // facing away
    // Sun shading from the face normal.
    const nl = Math.hypot(nx, ny, nz) || 1;
    const sun = clamp((nx * SUN_DIR[0] + ny * SUN_DIR[1] + nz * SUN_DIR[2]) / nl * 0.5 + 0.72, 0.45, 1.15);
    // Camera space, then clip against the near plane so triangles that
    // straddle it (the ground right under a low camera, the runway) still
    // draw instead of vanishing whole.
    const NEAR = 0.6;
    const poly = clipNear([
      toCamera(cam, ax, ay, az), toCamera(cam, bx, by, bz), toCamera(cam, cx, cy, cz),
    ], NEAR);
    if (poly.length < 3) return;
    // Project the clipped polygon and fan-triangulate it.
    const pts = [];
    let depthSum = 0;
    for (const v of poly) {
      pts.push(W / 2 + (v[0] * F) / v[2], H / 2 - (v[1] * F) / v[2]);
      depthSum += v[2];
    }
    const depth = depthSum / poly.length;
    const col = fogMix(
      clamp(r * sun, 0, 255) | 0, clamp(g * sun, 0, 255) | 0, clamp(b * sun, 0, 255) | 0, depth);
    for (let i = 1; i + 1 < pts.length; i += 2) {
      drawList.push(depth, pts[0], pts[1], pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3],
        col[0], col[1], col[2]);
    }
  }

  function pushTris(cam, tris) {
    for (let i = 0; i < tris.length; i += 12) {
      pushTri(cam, tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5],
        tris[i + 6], tris[i + 7], tris[i + 8], tris[i + 9], tris[i + 10], tris[i + 11]);
    }
  }

  function flushTris() {
    // Sort far-to-near by depth (stride 10).
    const n = drawList.length / 10;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((a, b) => drawList[b * 10] - drawList[a * 10]);
    for (const k of idx) {
      const o = k * 10;
      ctx.fillStyle = `rgb(${drawList[o + 7]},${drawList[o + 8]},${drawList[o + 9]})`;
      ctx.beginPath();
      ctx.moveTo(drawList[o + 1], drawList[o + 2]);
      ctx.lineTo(drawList[o + 3], drawList[o + 4]);
      ctx.lineTo(drawList[o + 5], drawList[o + 6]);
      ctx.closePath();
      ctx.fill();
    }
    drawList.length = 0;
  }

  // ---- Plane ------------------------------------------------------------------
  function planeMatrix(state) {
    const ch = Math.cos(state.heading), sh = Math.sin(state.heading);
    const cp = Math.cos(-state.pitch), sp = Math.sin(-state.pitch);
    const cr = Math.cos(-state.roll), sr = Math.sin(-state.roll);
    // R = Ry(heading) * Rx(-pitch) * Rz(-roll)
    // Rx(-p): y' = y cp - z sp ; z' = y sp + z cp  (with cp=cos(-p), sp=sin(-p))
    // Rz(-r): x' = x cr - y sr ; y' = x sr + y cr
    // Compose: first Rz, then Rx, then Ry.
    function apply(x, y, z) {
      let X = x * cr - y * sr, Y = x * sr + y * cr, Z = z;
      const Y2 = Y * cp - Z * sp, Z2 = Y * sp + Z * cp;
      Y = Y2; Z = Z2;
      const X3 = X * ch + Z * sh, Z3 = -X * sh + Z * ch;
      return [state.x + X3, state.y + Y, state.z + Z3];
    }
    return apply;
  }

  function drawPlane(cam, plane) {
    const apply = planeMatrix(plane.state);
    const m = plane.MODEL;
    for (let i = 0; i < m.length; i += 12) {
      const a = apply(m[i], m[i + 1], m[i + 2]);
      const b = apply(m[i + 3], m[i + 4], m[i + 5]);
      const c = apply(m[i + 6], m[i + 7], m[i + 8]);
      pushTri(cam, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], m[i + 9], m[i + 10], m[i + 11]);
    }
    // Propeller, spun around the nose axis.
    const pa = plane.state.propAngle;
    const cs = Math.cos(pa), sn = Math.sin(pa);
    const pr = plane.PROP;
    for (let i = 0; i < pr.length; i += 12) {
      // Rotate blade points around Z in local space before the plane matrix.
      function rot(x, y, z) {
        const X = x * cs - y * sn, Y = x * sn + y * cs;
        return apply(X, Y, z);
      }
      const a = rot(pr[i], pr[i + 1], pr[i + 2]);
      const b = rot(pr[i + 3], pr[i + 4], pr[i + 5]);
      const c = rot(pr[i + 6], pr[i + 7], pr[i + 8]);
      pushTri(cam, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], pr[i + 9], pr[i + 10], pr[i + 11]);
    }
  }

  // ---- Rings ------------------------------------------------------------------
  function drawRing(cam, ring, isNext) {
    const p = project(cam, ring.x, ring.y, ring.z);
    if (!p) return;
    const radiusPx = (ring.r * F) / p.d;
    if (radiusPx < 3) return;
    const col = isNext ? RR.COLORS.ringNext : RR.COLORS.ring;
    ctx.lineWidth = Math.max(2, radiusPx * 0.16);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(p.x, p.y, radiusPx, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, radiusPx * 0.07);
    ctx.beginPath(); ctx.arc(p.x, p.y, radiusPx, 0, Math.PI * 2); ctx.stroke();
    // Beacon dot at the ring's centre.
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, radiusPx * 0.06), 0, Math.PI * 2); ctx.fill();
  }

  function chunkVisible(cam, chunk) {
    const c = toCamera(cam, chunk.cx, 0, chunk.cz);
    const depth = c[2];
    if (depth + chunk.radius < 1) return false;
    // Screen half-width/height in world units at this depth.
    const halfW = (depth + chunk.radius) * TAN_HALF * (W / H);
    const halfH = (depth + chunk.radius) * TAN_HALF;
    if (Math.abs(c[0]) > halfW + chunk.radius) return false;
    if (Math.abs(c[1]) > halfH + chunk.radius) return false;
    return true;
  }

  return {
    resize, drawSky, cameraBasis, project, pushTris, flushTris, drawPlane,
    drawRing, chunkVisible, toCamera,
    get width() { return W; }, get height() { return H; }, get focal() { return F; },
  };
}
