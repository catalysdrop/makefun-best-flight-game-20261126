// Ridge Runner — configuration.
// One place for every tuning number: world size, physics, missions, colours.
// No code in here reads the network or the environment; it only holds values.

const RR = {};

// ---- World ---------------------------------------------------------------
RR.WORLD_SIZE = 4096;            // metres, square terrain centred on (0, 0)
RR.GRID_CELLS = 80;              // heightmap cells per side (81 x 81 vertices)
RR.CELL = RR.WORLD_SIZE / RR.GRID_CELLS;
RR.SEA_LEVEL = 0;                // lowest valley floor
RR.MOUNTAIN_HEIGHT = 520;        // highest peaks
RR.FOG_NEAR = 900;               // fog starts (m)
RR.FOG_FAR = 2600;               // fog fully hides (m)
RR.VIEW_DISTANCE = 2400;         // chunk cull distance (m)

// ---- Runway (Alder Field) -------------------------------------------------
RR.RUNWAY = {
  x: 0, z: 120,                  // centre of the strip
  length: 700, width: 34,
  headingDeg: 90,                // east-west strip
  elevation: 42,                 // flattened ground height there
};

// ---- Rings (Sortie 1: the valley ring run) --------------------------------
RR.RINGS = [
  { x: 350,  y: 150, z: 120,  r: 26 },
  { x: 700,  y: 190, z: -260, r: 26 },
  { x: 950,  y: 240, z: -780, r: 24 },
  { x: 620,  y: 300, z: -1250, r: 24 },
  { x: 60,   y: 260, z: -1500, r: 26 },
  { x: -520, y: 200, z: -1180, r: 26 },
];

// ---- Mail drop zone (Sortie 2) --------------------------------------------
RR.DROP_ZONE = { x: -260, z: 620, r: 70 };

// ---- Town (Alder village, south of the runway) ------------------------------
RR.TOWN = { x: -80, z: 560, blocks: 42 };

// ---- Plane (Kestrel K-2 bush plane) -----------------------------------------
RR.PLANE = {
  maxSpeed: 92,                  // m/s
  cruiseSpeed: 55,
  minFlySpeed: 26,               // below this the wing stalls
  maxThrottle: 1,
  accel: 14,                     // m/s^2 at full throttle
  drag: 0.012,
  pitchRate: 0.9,                // rad/s at full deflection
  rollRate: 1.7,
  yawRate: 0.35,
  turnCoordination: 0.55,        // how much bank turns the nose
  gravity: 9.81,
  fuelCapacity: 100,
  fuelBurn: 0.55,                // per second at full throttle
  startFuel: 100,
};

// ---- Camera -----------------------------------------------------------------
RR.CAMERA = {
  chaseDistance: 15,
  chaseHeight: 4.5,
  cockpitOffset: { x: 0, y: 1.05, z: 1.6 },
  fovDeg: 68,
};

// ---- Scoring ------------------------------------------------------------------
RR.SCORE = { ring: 100, drop: 150, landing: 250, touchdownBonus: 100 };

// ---- Palette ------------------------------------------------------------------
RR.COLORS = {
  skyTop: '#2f6fd0',
  skyHorizon: '#cfe6f7',
  sun: '#fff3c4',
  grassLow: '#5da24a',
  grassHigh: '#7fae56',
  fieldA: '#c9a86a',
  fieldB: '#8fae4e',
  rock: '#8d8a86',
  snow: '#f2f6fa',
  river: '#3f8fd2',
  lake: '#4a97d8',
  runway: '#3c3f45',
  runwayMark: '#f5f5f0',
  townRoof: '#b4552d',
  townWall: '#d8cfc0',
  tree: '#2e6b34',
  treeTrunk: '#6b4a2a',
  planeRed: '#c8372d',
  planeWhite: '#f4f1ea',
  planeDark: '#2c2f36',
  ring: '#ffb400',
  ringNext: '#ffd94d',
  hud: '#7dffce',
};
