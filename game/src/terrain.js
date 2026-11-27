// Ridge Runner — terrain.
// Builds the Crestline Valley once: a seeded heightmap, a river, a lake, flat
// fields, the Alder Field runway, the village and the pine forest. The mesh is
// split into chunks so the renderer can cull what the camera cannot see.

function makeTerrain() {
  const noise = makeNoise2D(20261126);
  const rng = makeRng(77);
  const half = RR.WORLD_SIZE / 2;
  const cells = RR.GRID_CELLS;
  const cell = RR.CELL;
  const N = cells + 1;

  // ---- River path: a gentle S-curve running north-south -------------------
  function riverX(z) {
    return 420 * Math.sin(z * 0.00045) + 180 * Math.sin(z * 0.0013 + 1.7) - 260;
  }
  function riverDist(x, z) { return Math.abs(x - riverX(z)); }

  // ---- Lake: an ellipse in the north-west ----------------------------------
  const LAKE = { x: -1050, z: -950, rx: 380, rz: 300, waterY: 26 };
  function inLake(x, z) {
    const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
    return dx * dx + dz * dz < 1;
  }

  // ---- Fields: patchwork rectangles on the valley floor --------------------
  const fields = [];
  for (let i = 0; i < 16; i++) {
    fields.push({
      x: -900 + rng() * 1700, z: -400 + rng() * 1100,
      w: 120 + rng() * 220, d: 90 + rng() * 180,
      color: i % 2 ? RR.COLORS.fieldA : RR.COLORS.fieldB,
    });
  }

  // ---- Raw height ------------------------------------------------------------
  function rawHeight(x, z) {
    const nx = (x + half) / RR.WORLD_SIZE, nz = (z + half) / RR.WORLD_SIZE;
    const rolling = noise.fbm(nx * 3.1, nz * 3.1, 4);
    const detail = noise.fbm(nx * 9.0 + 5, nz * 9.0 + 5, 3);
    let h = 24 + rolling * 95 + detail * 22;
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
    const m = clamp((edge - 0.55) / 0.45, 0, 1);
    h += m * m * RR.MOUNTAIN_HEIGHT * (0.55 + 0.45 * noise.fbm(nx * 2 + 11, nz * 2 + 3, 3));
    // River carves a channel.
    const rd = riverDist(x, z);
    if (rd < 60) h = Math.min(h, 6 + rd * 0.55);
    // Lake basin.
    if (inLake(x, z)) h = Math.min(h, 20);
    // Runway apron: flat.
    const rw = RR.RUNWAY;
    const dx = x - rw.x, dz = z - rw.z;
    const along = Math.abs(dx), across = Math.abs(dz);
    if (along < rw.length / 2 + 90 && across < rw.width / 2 + 110) {
      const w = smoothstep(0, 1, 1 - Math.max(
        (along - rw.length / 2) / 90, (across - rw.width / 2) / 110));
      h = lerp(h, rw.elevation, clamp(w, 0, 1));
    }
    return h;
  }
  function smoothstep(a, b, t) {
    const u = clamp((t - a) / (b - a), 0, 1);
    return u * u * (3 - 2 * u);
  }

  // ---- Heightmap grid ----------------------------------------------------------
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      H[j * N + i] = rawHeight(-half + i * cell, -half + j * cell);
    }
  }
  function heightAt(x, z) {
    const gx = clamp((x + half) / cell, 0, cells - 0.001);
    const gz = clamp((z + half) / cell, 0, cells - 0.001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = H[j * N + i], b = H[j * N + i + 1];
    const c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }

  // ---- Colour helpers ---------------------------------------------------------
  function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t) | 0, lerp(a[1], b[1], t) | 0, lerp(a[2], b[2], t) | 0];
  }
  const GRASS_LO = hexToRgb(RR.COLORS.grassLow);
  const GRASS_HI = hexToRgb(RR.COLORS.grassHigh);
  const ROCK = hexToRgb(RR.COLORS.rock);
  const SNOW = hexToRgb(RR.COLORS.snow);
  const RIVER_C = hexToRgb(RR.COLORS.river);

  function groundColor(x, z, h) {
    // Water first.
    if (inLake(x, z) && h <= LAKE.waterY + 1) return hexToRgb(RR.COLORS.lake);
    if (riverDist(x, z) < 14 && h < 14) return RIVER_C;
    // Altitude bands.
    let c;
    if (h > 400) c = mixRgb(ROCK, SNOW, clamp((h - 400) / 120, 0, 1));
    else if (h > 240) c = mixRgb(GRASS_HI, ROCK, clamp((h - 240) / 160, 0, 1));
    else c = mixRgb(GRASS_LO, GRASS_HI, clamp(h / 240, 0, 1));
    // Field patchwork.
    for (const f of fields) {
      if (Math.abs(x - f.x) < f.w / 2 && Math.abs(z - f.z) < f.d / 2) {
        return mixRgb(c, hexToRgb(f.color), 0.75);
      }
    }
    return c;
  }

  // ---- Terrain chunks (8x8 cells each) ---------------------------------------
  const CHUNK = 8;
  const chunks = [];
  for (let cj = 0; cj < cells / CHUNK; cj++) {
    for (let ci = 0; ci < cells / CHUNK; ci++) {
      const tris = [];
      const x0 = -half + ci * CHUNK * cell, z0 = -half + cj * CHUNK * cell;
      for (let j = 0; j < CHUNK; j++) {
        for (let i = 0; i < CHUNK; i++) {
          const gi = ci * CHUNK + i, gj = cj * CHUNK + j;
          const xA = -half + gi * cell, zA = -half + gj * cell;
          const xB = xA + cell, zB = zA + cell;
          const h00 = H[gj * N + gi], h10 = H[gj * N + gi + 1];
          const h01 = H[(gj + 1) * N + gi], h11 = H[(gj + 1) * N + gi + 1];
          const cx = (xA + xB) / 2, cz = (zA + zB) / 2;
          const ch = (h00 + h10 + h01 + h11) / 4;
          const col = groundColor(cx, cz, ch);
          const n = (noise.noise(gi * 0.7, gj * 0.7) - 0.5) * 14;
          const c = [clamp(col[0] + n, 0, 255) | 0, clamp(col[1] + n, 0, 255) | 0, clamp(col[2] + n, 0, 255) | 0];
          tris.push(xA, h00, zA, xA, h01, zB, xB, h10, zA, c[0], c[1], c[2]);
          tris.push(xB, h10, zA, xA, h01, zB, xB, h11, zB, c[0], c[1], c[2]);
        }
      }
      chunks.push({
        cx: x0 + (CHUNK * cell) / 2, cz: z0 + (CHUNK * cell) / 2,
        radius: CHUNK * cell * 0.75, tris: new Float32Array(tris),
      });
    }
  }

  // ---- Static features: runway, town, forest, lake surface ------------------
  // Each triangle: 9 coords + 3 colour bytes, same layout as chunk tris.
  const statics = [];
  function tri(ax, ay, az, bx, by, bz, cx, cy, cz, hex) {
    const c = hexToRgb(hex);
    statics.push(ax, ay, az, bx, by, bz, cx, cy, cz, c[0], c[1], c[2]);
  }
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, hex) {
    tri(ax, ay, az, cx, cy, cz, bx, by, bz, hex);
    tri(ax, ay, az, dx, dy, dz, cx, cy, cz, hex);
  }
  function box(x, z, w, d, h, wallHex, roofHex) {
    const y0 = heightAt(x, z), y1 = y0 + h;
    const hw = w / 2, hd = d / 2;
    // Four walls (as two triangles each, only front-facing ones survive culling
    // at draw time, so emit all four sides).
    quad(x - hw, y0, z - hd, x + hw, y0, z - hd, x + hw, y1, z - hd, x - hw, y1, z - hd, wallHex);
    quad(x + hw, y0, z + hd, x - hw, y0, z + hd, x - hw, y1, z + hd, x + hw, y1, z + hd, wallHex);
    quad(x - hw, y0, z + hd, x - hw, y0, z - hd, x - hw, y1, z - hd, x - hw, y1, z + hd, wallHex);
    quad(x + hw, y0, z - hd, x + hw, y0, z + hd, x + hw, y1, z + hd, x + hw, y1, z - hd, wallHex);
    // Pyramid roof.
    const apex = [x, y1 + h * 0.45, z];
    tri(x - hw, y1, z - hd, apex[0], apex[1], apex[2], x + hw, y1, z - hd, roofHex);
    tri(x + hw, y1, z + hd, apex[0], apex[1], apex[2], x - hw, y1, z + hd, roofHex);
    tri(x - hw, y1, z + hd, apex[0], apex[1], apex[2], x - hw, y1, z - hd, roofHex);
    tri(x + hw, y1, z - hd, apex[0], apex[1], apex[2], x + hw, y1, z + hd, roofHex);
  }

  // Runway strip + markings.
  (function buildRunway() {
    const rw = RR.RUNWAY;
    const y = rw.elevation + 0.4;
    const hl = rw.length / 2, hw = rw.width / 2;
    quad(rw.x - hl, y, rw.z - hw, rw.x + hl, y, rw.z - hw, rw.x + hl, y, rw.z + hw, rw.x - hl, y, rw.z + hw, RR.COLORS.runway);
    // Centre dashes.
    for (let d = -hl + 30; d < hl - 10; d += 46) {
      quad(rw.x + d, y + 0.15, rw.z - 1.6, rw.x + d + 24, y + 0.15, rw.z - 1.6,
        rw.x + d + 24, y + 0.15, rw.z + 1.6, rw.x + d, y + 0.15, rw.z + 1.6, RR.COLORS.runwayMark);
    }
    // Threshold bars at both ends.
    for (const s of [-1, 1]) {
      const tx = rw.x + s * (hl - 18);
      quad(tx - 8, y + 0.15, rw.z - hw + 4, tx + 8, y + 0.15, rw.z - hw + 4,
        tx + 8, y + 0.15, rw.z + hw - 4, tx - 8, y + 0.15, rw.z + hw - 4, RR.COLORS.runwayMark);
    }
  })();

  // Village: jittered grid of houses south of the runway.
  (function buildTown() {
    const t = RR.TOWN;
    for (let i = 0; i < t.blocks; i++) {
      const gx = (i % 7) - 3, gz = Math.floor(i / 7) - 2;
      const x = t.x + gx * 34 + (rng() - 0.5) * 14;
      const z = t.z + gz * 30 + (rng() - 0.5) * 12;
      if (Math.abs(x - RR.RUNWAY.x) < 420 && Math.abs(z - RR.RUNWAY.z) < 90) continue;
      box(x, z, 10 + rng() * 8, 9 + rng() * 7, 6 + rng() * 7, RR.COLORS.townWall, RR.COLORS.townRoof);
    }
  })();

  // Pine forest: cones on trunks, kept clear of runway, town and river.
  const trees = [];
  (function buildForest() {
    let placed = 0, tries = 0;
    while (placed < 260 && tries < 3000) {
      tries++;
      const x = (rng() * 2 - 1) * (half - 200);
      const z = (rng() * 2 - 1) * (half - 200);
      const h = heightAt(x, z);
      if (h > 260 || h < 30) continue;
      if (Math.abs(x - RR.RUNWAY.x) < 460 && Math.abs(z - RR.RUNWAY.z) < 130) continue;
      if (Math.abs(x - RR.TOWN.x) < 170 && Math.abs(z - RR.TOWN.z) < 130) continue;
      if (riverDist(x, z) < 30 || inLake(x, z)) continue;
      const s = 5 + rng() * 7;
      const y0 = h;
      // Trunk (thin box, two quads are enough at this scale).
      quad(x - 0.5, y0, z - 0.5, x + 0.5, y0, z - 0.5, x + 0.5, y0 + s * 0.35, z - 0.5, x - 0.5, y0 + s * 0.35, z - 0.5, RR.COLORS.treeTrunk);
      // Cone: four pyramid faces, each facing out and up.
      const apex = [x, y0 + s, z];
      const r = s * 0.45, yb = y0 + s * 0.3;
      tri(x - r, yb, z + r, x + r, yb, z + r, apex[0], apex[1], apex[2], RR.COLORS.tree);
      tri(x + r, yb, z - r, x - r, yb, z - r, apex[0], apex[1], apex[2], RR.COLORS.tree);
      tri(x + r, yb, z + r, x + r, yb, z - r, apex[0], apex[1], apex[2], RR.COLORS.tree);
      tri(x - r, yb, z - r, x - r, yb, z + r, apex[0], apex[1], apex[2], RR.COLORS.tree);
      trees.push({ x, z, h });
      placed++;
    }
  })();

  // Lake surface: a flat 20-gon at water level.
  (function buildLake() {
    const seg = 20, y = LAKE.waterY;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      tri(LAKE.x, y, LAKE.z,
        LAKE.x + Math.cos(a1) * LAKE.rx, y, LAKE.z + Math.sin(a1) * LAKE.rz,
        LAKE.x + Math.cos(a0) * LAKE.rx, y, LAKE.z + Math.sin(a0) * LAKE.rz, RR.COLORS.lake);
    }
  })();

  return {
    heightAt, chunks, statics: new Float32Array(statics),
    riverX, riverDist, inLake, lake: LAKE, fields,
  };
}
