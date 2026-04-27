const canvas = document.getElementById("c");
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true, stencil: false });
if (!gl) throw new Error("WebGL2 not available.");

gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);

const extFloatRT = gl.getExtension("EXT_color_buffer_float");
if (!extFloatRT) {
  alert("EXT_color_buffer_float missing. Use Chrome/Edge/Firefox desktop.\nThis demo needs float render targets.");
  throw new Error("Missing EXT_color_buffer_float");
}

const maxAtlasSide = Math.min(
  gl.getParameter(gl.MAX_TEXTURE_SIZE),
  gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
);
const MAX_SIM_RES = Math.max(32, Math.min(128, Math.floor(Math.sqrt(maxAtlasSide))));

const params = {
  simRes: Math.min(96, MAX_SIM_RES),
  stepsPerFrame: 8,
  boxScale: 2.5,
  cameraProjection: 0,

  hbar: 6.0,
  mass: 1.0,
  p0: 2.5,
  dt: 0.006,

  packetX: 0.35,
  packetY: 0.5,
  packetZ: 0.5,
  packetSigma: 10.0,

  nParticles: 500,
  rhoMin: 1e-6,
  velClamp: 80.0,
  spinS: 0.5,

  cloudGain: .25,
  cloudGamma: 0.55,
  cloudLowBoost: 0.5,
  cloudCutoff: 0.003,
  cloudPointSize: 80.,
  showPhase: 0,
  showCloud: 1,
  showEquipotentials: 0,

  showParticles: 1,
  dotSize: 8.0,
  dotSigma: 0.28,
  dotGain: 2.0,

  showTrail: 0,
  trailHalfLife: 1.0,
  trailVisGain: 0.5,
  trailVisGamma: 1,
  trailStampGain: 0.45,
  trailWidth: 8.0,
  trailBlendMode: 2,
  densityScale: 0.5,

  paletteId: 4,
};

const PALETTE_NAMES = [
  "Nebula",
  "Synthwave",
  "Viridis-ish",
  "Inferno-ish",
  "Ice",
  "Plasma Drift",
  "Arctic Aurora",
  "Solar Flare",
  "Cosmic Dust",
  "Neon Noir",
  "Pastel Mirage"
];

const GUIDING_MODE_NAMES = [
  "Pauli spin (+z)"
];

const EQUIPOTENTIAL_LEVEL_COUNT = 9;
const EQUIPOTENTIAL_LOG_RHO_MAX = -0.45;
const EQUIPOTENTIAL_LOG_RHO_STEP = 0.83;
const EQUIPOTENTIAL_SUBDIV = 3;
const EQUIPOTENTIAL_LINE_WIDTH_PX = 3.0;

let paused = false;

const controls = document.getElementById("controls");
const statsEl = document.getElementById("stats");
const viewGizmo = document.getElementById("viewGizmo");
const viewButtons = {
  XY: document.getElementById("viewXY"),
  XZ: document.getElementById("viewXZ"),
  YZ: document.getElementById("viewYZ"),
};

function fmt(v) {
  const av = Math.abs(v);
  if (av >= 1000 || (av > 0 && av < 0.01)) return v.toExponential(2);
  return v.toFixed(3).replace(/\.?0+$/, "");
}

function addSlider(key, label, min, max, step, onChange = null) {
  const row = document.createElement("div");
  row.className = "row";

  const lab = document.createElement("label");
  lab.textContent = label;

  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = params[key];

  const val = document.createElement("div");
  val.className = "val";
  val.textContent = fmt(params[key]);

  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    params[key] = v;
    val.textContent = fmt(v);
  });
  input.addEventListener("change", () => onChange && onChange());

  row.appendChild(lab);
  row.appendChild(input);
  row.appendChild(val);
  controls.appendChild(row);
}

function addToggleInt(key, label) {
  const row = document.createElement("div");
  row.className = "row";
  const lab = document.createElement("label");
  lab.textContent = label;

  const btn = document.createElement("button");
  btn.style.flex = "1";
  btn.textContent = params[key] ? "ON" : "OFF";
  btn.addEventListener("click", () => {
    params[key] = params[key] ? 0 : 1;
    btn.textContent = params[key] ? "ON" : "OFF";
  });

  const val = document.createElement("div");
  val.className = "val";
  val.textContent = "";

  row.appendChild(lab);
  row.appendChild(btn);
  row.appendChild(val);
  controls.appendChild(row);
}

function addCycleButton(key, label, values, onChange = null) {
  const row = document.createElement("div");
  row.className = "row";

  const lab = document.createElement("label");
  lab.textContent = label;

  const btn = document.createElement("button");
  btn.style.flex = "1";

  const sync = () => {
    btn.textContent = values[params[key] | 0] ?? values[0];
  };

  sync();
  btn.addEventListener("click", () => {
    params[key] = (params[key] + 1) % values.length;
    sync();
    if (onChange) onChange(params[key] | 0);
  });

  const val = document.createElement("div");
  val.className = "val";
  val.textContent = "";

  row.appendChild(lab);
  row.appendChild(btn);
  row.appendChild(val);
  controls.appendChild(row);
  return { button: btn, sync };
}

function addSectionHeader(label) {
  const header = document.createElement("div");
  header.style.marginTop = "12px";
  header.style.marginBottom = "8px";
  header.style.fontSize = "11px";
  header.style.fontWeight = "700";
  header.style.color = "#aaa";
  header.style.textTransform = "uppercase";
  header.style.letterSpacing = "1px";
  header.textContent = label;
  controls.appendChild(header);
}

addSlider("simRes", "grid size", 32, MAX_SIM_RES, 4, () => rebuildSimulation());
addSlider("stepsPerFrame", "Steps/frame", 1, 30, 1);
const cameraProjectionControl = addCycleButton("cameraProjection", "camera view", ["Perspective", "Orthographic"], () => {
  activeOrthoView = null;
  syncCameraUi();
  requestTrailClear();
});

addSectionHeader("Physical Parameters");
addSlider("p0", "momentum p", 0., 6.0, 0.1, () => resetAll());
addSlider("dt", "dt", 0.002, 0.02, 0.002);
addSlider("packetX", "packet start x", 0.15, 0.75, 0.01, () => resetAll());
addSlider("packetSigma", "packet sigma", 4.0, 14.0, 0.5, () => resetAll());
addSlider("spinS", "spin strength", 0.0, 2.0, 0.5);
addSlider("nParticles", "particle count", 1, 5001, 100, () => rebuildParticles());

addSectionHeader("Visual Parameters");
addToggleInt("showCloud", "density cloud");
addToggleInt("showPhase", "show phase");
addToggleInt("showEquipotentials", "spin contours");
addSlider("cloudGain", "cloud density", 0.1, 2.0, 0.1);
addSlider("cloudPointSize", "cloud point size", 20, 100.0, 10);
addToggleInt("showParticles", "show particles");
addSlider("dotSize", "particle size", 2.0, 16.0, 0.5);
addSlider("dotGain", "particle brightness", 0.1, 5.0, 0.1);

addToggleInt("showTrail", "draw trails");
addSlider("trailHalfLife", "trail half-life", .1, 10.0, .1);
addSlider("trailVisGain", "trail gain", 0.1, 1.0, 0.1);
addSlider("trailVisGamma", "trail gamma", 0.4, 2.0, 0.05);
addSlider("trailWidth", "trail width", 1, 15.0, 1);

document.getElementById("reset").onclick = () => resetAll();
document.getElementById("pause").onclick = (e) => {
  paused = !paused;
  e.target.textContent = paused ? "Resume" : "Pause";
};
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") resetAll();
  if (e.key === " ") paused = !paused;
});

const uiBody = document.getElementById("uibody");
const minBtn = document.getElementById("minui");
minBtn.textContent = "-";

let uiMinimized = false;
minBtn.onclick = () => {
  uiMinimized = !uiMinimized;
  uiBody.style.display = uiMinimized ? "none" : "block";
  minBtn.textContent = uiMinimized ? "+" : "-";
};

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(src);
    throw new Error(gl.getShaderInfoLog(sh));
  }
  return sh;
}

function link(vs, fs, tfVaryings = null) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (tfVaryings) gl.transformFeedbackVaryings(prog, tfVaryings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog));
  }
  return prog;
}

function makeTexFloat32(w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

function makeTexRGBA16F(w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

function makeFBO(tex) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (ok !== gl.FRAMEBUFFER_COMPLETE) throw new Error("FBO incomplete: " + ok);
  return f;
}

function u(prog, name) { return gl.getUniformLocation(prog, name); }

async function loadText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
  return await r.text();
}

const SH = {};
async function loadShaders() {
  const base = "./shaders/";
  const files = [
    "fullscreen.vert",
    "wave_init.frag",
    "wave_step.frag",
    "cloud_render.vert",
    "cloud_render.frag",
    "equipotential_render.vert",
    "equipotential_render.frag",
    "box_shell_render.vert",
    "box_shell_render.frag",
    "particle_update.vert",
    "particle_update.frag",
    "particle_render.vert",
    "particle_render.frag",
    "particle_stamp.frag",
    "density_step.frag",
    "density_render.frag",
    "line_render.vert",
    "line_render.frag",
  ];
  await Promise.all(files.map(async (f) => { SH[f] = await loadText(base + f); }));
}

let progWaveInit, progWaveStep;
let progCloudView, progEquipotentialView, progBoxShellView, progLineView;
let progPartUpdate, progPartView, progPartStamp;
let progDensityStep, progDensityRender;

let U = {};

function buildPrograms() {
  const vsFull = compile(gl.VERTEX_SHADER, SH["fullscreen.vert"]);

  progWaveInit   = link(vsFull, compile(gl.FRAGMENT_SHADER, SH["wave_init.frag"]));
  progWaveStep   = link(vsFull, compile(gl.FRAGMENT_SHADER, SH["wave_step.frag"]));

  progCloudView = link(
    compile(gl.VERTEX_SHADER, SH["cloud_render.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["cloud_render.frag"])
  );
  progEquipotentialView = link(
    compile(gl.VERTEX_SHADER, SH["equipotential_render.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["equipotential_render.frag"])
  );
  progBoxShellView = link(
    compile(gl.VERTEX_SHADER, SH["box_shell_render.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["box_shell_render.frag"])
  );

  progPartUpdate = link(
    compile(gl.VERTEX_SHADER, SH["particle_update.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["particle_update.frag"]),
    ["vState"]
  );
  progPartView = link(
    compile(gl.VERTEX_SHADER, SH["particle_render.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["particle_render.frag"])
  );
  progPartStamp = link(
    compile(gl.VERTEX_SHADER, SH["particle_render.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["particle_stamp.frag"])
  );

  progDensityStep = link(vsFull, compile(gl.FRAGMENT_SHADER, SH["density_step.frag"]));
  progDensityRender = link(vsFull, compile(gl.FRAGMENT_SHADER, SH["density_render.frag"]));
  progLineView = link(
    compile(gl.VERTEX_SHADER, SH["line_render.vert"]),
    compile(gl.FRAGMENT_SHADER, SH["line_render.frag"])
  );

  U.waveInit = {
    uSimRes: u(progWaveInit, "uSimRes"),
    uHBAR: u(progWaveInit, "uHBAR"),
    uMass: u(progWaveInit, "uMass"),
    uP0: u(progWaveInit, "uP0"),
    uDT: u(progWaveInit, "uDT"),
    uPacketPosFrac: u(progWaveInit, "uPacketPosFrac"),
    uPacketSigmaPx: u(progWaveInit, "uPacketSigmaPx"),
  };

  U.waveStep = {
    uState: u(progWaveStep, "uState"),
    uSimRes: u(progWaveStep, "uSimRes"),
    uHBAR: u(progWaveStep, "uHBAR"),
    uMass: u(progWaveStep, "uMass"),
    uDT: u(progWaveStep, "uDT"),
  };

  U.partUpdate = {
    uState: u(progPartUpdate, "uState"),
    uSimRes: u(progPartUpdate, "uSimRes"),
    uHBAR: u(progPartUpdate, "uHBAR"),
    uMass: u(progPartUpdate, "uMass"),
    uDT: u(progPartUpdate, "uDT"),
    uSpinS: u(progPartUpdate, "uSpinS"),
    uRhoMin: u(progPartUpdate, "uRhoMin"),
    uVelClamp: u(progPartUpdate, "uVelClamp"),
  };

  U.cloudView = {
    uState: u(progCloudView, "uState"),
    uSimRes: u(progCloudView, "uSimRes"),
    uViewProj: u(progCloudView, "uViewProj"),
    uBoxScale: u(progCloudView, "uBoxScale"),
    uCloudGain: u(progCloudView, "uCloudGain"),
    uCloudGamma: u(progCloudView, "uCloudGamma"),
    uCloudLowBoost: u(progCloudView, "uCloudLowBoost"),
    uCloudCutoff: u(progCloudView, "uCloudCutoff"),
    uPointSize: u(progCloudView, "uPointSize"),
    uShowPhase: u(progCloudView, "uShowPhase"),
    uPaletteId: u(progCloudView, "uPaletteId"),
    uCameraDistance: u(progCloudView, "uCameraDistance"),
    uCameraProjection: u(progCloudView, "uCameraProjection"),
  };

  U.equipotentialView = {
    uState: u(progEquipotentialView, "uState"),
    uSimRes: u(progEquipotentialView, "uSimRes"),
    uViewProj: u(progEquipotentialView, "uViewProj"),
    uViewport: u(progEquipotentialView, "uViewport"),
    uBoxScale: u(progEquipotentialView, "uBoxScale"),
    uLevelCount: u(progEquipotentialView, "uLevelCount"),
    uSubdiv: u(progEquipotentialView, "uSubdiv"),
    uLogRhoMax: u(progEquipotentialView, "uLogRhoMax"),
    uLogRhoStep: u(progEquipotentialView, "uLogRhoStep"),
    uRhoFloor: u(progEquipotentialView, "uRhoFloor"),
    uFloorZ: u(progEquipotentialView, "uFloorZ"),
    uLineWidthPx: u(progEquipotentialView, "uLineWidthPx"),
  };

  U.boxShellView = {
    uViewProj: u(progBoxShellView, "uViewProj"),
    uCameraEye: u(progBoxShellView, "uCameraEye"),
    uBoxCenter: u(progBoxShellView, "uBoxCenter"),
  };

  U.partView = {
    uSimRes: u(progPartView, "uSimRes"),
    uViewProj: u(progPartView, "uViewProj"),
    uBoxScale: u(progPartView, "uBoxScale"),
    uPointSize: u(progPartView, "uPointSize"),
    uDotSigma: u(progPartView, "uDotSigma"),
    uDotGain: u(progPartView, "uDotGain"),
    uCameraEye: u(progPartView, "uCameraEye"),
    uCameraDistance: u(progPartView, "uCameraDistance"),
    uCameraProjection: u(progPartView, "uCameraProjection"),
  };

  U.partStamp = {
    uSimRes: u(progPartStamp, "uSimRes"),
    uViewProj: u(progPartStamp, "uViewProj"),
    uBoxScale: u(progPartStamp, "uBoxScale"),
    uPointSize: u(progPartStamp, "uPointSize"),
    uDotSigma: u(progPartStamp, "uDotSigma"),
    uDotGain: u(progPartStamp, "uDotGain"),
    uStampGain: u(progPartStamp, "uStampGain"),
    uNumParticles: u(progPartStamp, "uNumParticles"),
    uTrailWidth: u(progPartStamp, "uTrailWidth"),
    uCameraEye: u(progPartStamp, "uCameraEye"),
    uCameraDistance: u(progPartStamp, "uCameraDistance"),
    uCameraProjection: u(progPartStamp, "uCameraProjection"),
  };

  U.densityStep = {
    uPrev: u(progDensityStep, "uPrev"),
    uFade: u(progDensityStep, "uFade"),
  };

  U.densityRender = {
    uDensity: u(progDensityRender, "uDensity"),
    uGain: u(progDensityRender, "uGain"),
    uGamma: u(progDensityRender, "uGamma"),
    uPaletteId: u(progDensityRender, "uPaletteId"),
    uBlendMode: u(progDensityRender, "uBlendMode"),
  };

  U.lineView = {
    uViewProj: u(progLineView, "uViewProj"),
    uColor: u(progLineView, "uColor"),
  };
}

const vaoEmpty = gl.createVertexArray();

let simW = 0, simH = 0, simD = 0;
let waveTexW = 0, waveTexH = 0, voxelCount = 0;
let texA = null, texB = null, fboA = null, fboB = null, flip = 0;

let particleSrc = null, particleDst = null, vaoParticles = null, tf = null;
let boxBuffer = null, vaoBox = null, boxVertexCount = 0;
let boxShellBuffer = null, vaoBoxShell = null, boxShellVertexCount = 0;

let densW = 0, densH = 0;
let densTexA = null, densTexB = null, densFboA = null, densFboB = null, densFlip = 0;
let trailClearPending = false;

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

function deleteTextureAndFbo(tex, fbo) {
  if (tex) gl.deleteTexture(tex);
  if (fbo) gl.deleteFramebuffer(fbo);
}

function deleteWaveTargets() {
  deleteTextureAndFbo(texA, fboA);
  deleteTextureAndFbo(texB, fboB);
  texA = texB = fboA = fboB = null;
}

function deleteDensityTargets() {
  deleteTextureAndFbo(densTexA, densFboA);
  deleteTextureAndFbo(densTexB, densFboB);
  densTexA = densTexB = densFboA = densFboB = null;
}

function worldFromGrid(p) {
  return [
    p[0] * params.boxScale,
    p[1] * params.boxScale,
    p[2] * params.boxScale,
  ];
}

function vec3Sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function mat4Perspective(fovyRad, aspect, near, far) {
  const f = 1 / Math.tan(fovyRad * 0.5);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function mat4Orthographic(left, right, bottom, top, near, far) {
  const out = new Float32Array(16);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

function mat4LookAt(eye, center, up) {
  const z = vec3Normalize(vec3Sub(eye, center));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  const out = new Float32Array(16);

  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -vec3Dot(x, eye);
  out[13] = -vec3Dot(y, eye);
  out[14] = -vec3Dot(z, eye);
  out[15] = 1;
  return out;
}

function mat4Mul(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function boxCenterWorld() {
  return worldFromGrid([
    0.5 * (simW - 1),
    0.5 * (simH - 1),
    0.5 * (simD - 1),
  ]);
}

const cameraOrbit = {
  yaw: -2.22,
  pitch: 0.43,
  distance: 1,
};
const cameraTarget = {
  yaw: cameraOrbit.yaw,
  pitch: cameraOrbit.pitch,
  distance: cameraOrbit.distance,
};
const CAMERA_EASE = 0.1;
const ORTHO_VIEWS = {
  XY: { yaw: -Math.PI * 0.5, pitch: Math.PI * 0.5 },
  XZ: { yaw: -Math.PI * 0.5, pitch: 0 },
  YZ: { yaw: 0, pitch: 0 },
};

let activeOrthoView = null;

let orbitPointer = null;
let orbitLastX = 0;
let orbitLastY = 0;

function requestTrailClear() {
  trailClearPending = true;
}

function clampCameraPitch(pitch) {
  const halfPi = Math.PI * 0.5;
  return Math.max(-halfPi, Math.min(halfPi, pitch));
}

function cameraDistanceBounds() {
  const n = Math.max(simW, simH, simD) * params.boxScale;
  return {
    n,
    min: 0.65 * n,
    max: 5.0 * n,
  };
}

function clampCameraDistance(distance) {
  const bounds = cameraDistanceBounds();
  if (!Number.isFinite(distance) || distance <= 1) return 2.15 * bounds.n;
  return Math.max(bounds.min, Math.min(bounds.max, distance));
}

function syncCameraUi() {
  cameraProjectionControl.sync();
  for (const [key, btn] of Object.entries(viewButtons)) {
    if (!btn) continue;
    btn.classList.toggle("selected", params.cameraProjection === 1 && activeOrthoView === key);
  }
}

function setCameraProjection(mode) {
  const nextMode = mode ? 1 : 0;
  if (params.cameraProjection !== nextMode) {
    params.cameraProjection = nextMode;
    requestTrailClear();
  }
  if (nextMode === 0) activeOrthoView = null;
  syncCameraUi();
}

function selectOrthoView(key) {
  const view = ORTHO_VIEWS[key];
  if (!view) return;
  activeOrthoView = key;
  setCameraProjection(1);
  cameraTarget.yaw = view.yaw;
  cameraTarget.pitch = view.pitch;
  requestTrailClear();
  syncCameraUi();
}

function disableOrthoModeFromOrbit() {
  if (activeOrthoView === null) return;
  activeOrthoView = null;
  setCameraProjection(0);
}

function syncCameraTargetToCurrent() {
  cameraTarget.yaw = cameraOrbit.yaw;
  cameraTarget.pitch = cameraOrbit.pitch;
  cameraTarget.distance = cameraOrbit.distance;
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function updateCameraEasing() {
  const prevYaw = cameraOrbit.yaw;
  const prevPitch = cameraOrbit.pitch;
  const prevDistance = cameraOrbit.distance;
  const targetDistance = clampCameraDistance(cameraTarget.distance);
  cameraTarget.distance = targetDistance;

  cameraOrbit.yaw += shortestAngleDelta(cameraOrbit.yaw, cameraTarget.yaw) * CAMERA_EASE;
  cameraOrbit.pitch += (cameraTarget.pitch - cameraOrbit.pitch) * CAMERA_EASE;
  cameraOrbit.distance += (targetDistance - cameraOrbit.distance) * CAMERA_EASE;

  if (Math.abs(shortestAngleDelta(cameraOrbit.yaw, cameraTarget.yaw)) < 1e-5) cameraOrbit.yaw = cameraTarget.yaw;
  if (Math.abs(cameraOrbit.pitch - cameraTarget.pitch) < 1e-5) cameraOrbit.pitch = cameraTarget.pitch;
  if (Math.abs(cameraOrbit.distance - targetDistance) < 1e-3) cameraOrbit.distance = targetDistance;

  return Math.abs(shortestAngleDelta(prevYaw, cameraOrbit.yaw)) > 1e-7 ||
    Math.abs(prevPitch - cameraOrbit.pitch) > 1e-7 ||
    Math.abs(prevDistance - cameraOrbit.distance) > 1e-5;
}

for (const [key, btn] of Object.entries(viewButtons)) {
  if (btn) btn.addEventListener("click", () => selectOrthoView(key));
}
syncCameraUi();

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  orbitPointer = e.pointerId;
  orbitLastX = e.clientX;
  orbitLastY = e.clientY;
  syncCameraTargetToCurrent();
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (orbitPointer !== e.pointerId) return;
  const dx = e.clientX - orbitLastX;
  const dy = e.clientY - orbitLastY;
  orbitLastX = e.clientX;
  orbitLastY = e.clientY;
  if (dx === 0 && dy === 0) return;

  disableOrthoModeFromOrbit();
  const prevYaw = cameraTarget.yaw;
  const prevPitch = cameraTarget.pitch;
  cameraTarget.yaw -= dx * 0.006;
  cameraTarget.pitch = clampCameraPitch(cameraTarget.pitch + dy * 0.006);
  if (cameraTarget.yaw !== prevYaw || cameraTarget.pitch !== prevPitch) requestTrailClear();
});

canvas.addEventListener("pointerup", (e) => {
  if (orbitPointer !== e.pointerId) return;
  canvas.releasePointerCapture(e.pointerId);
  orbitPointer = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (orbitPointer !== e.pointerId) return;
  canvas.releasePointerCapture(e.pointerId);
  orbitPointer = null;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoom = Math.exp(e.deltaY * 0.001);
  const prevDistance = cameraTarget.distance;
  cameraTarget.distance = clampCameraDistance(cameraTarget.distance * zoom);
  if (cameraTarget.distance !== prevDistance) requestTrailClear();
}, { passive: false });

function cameraFrame() {
  const target = boxCenterWorld();
  const n = Math.max(simW, simH, simD) * params.boxScale;
  cameraOrbit.distance = clampCameraDistance(cameraOrbit.distance);
  cameraTarget.distance = clampCameraDistance(cameraTarget.distance);

  const cp = Math.cos(cameraOrbit.pitch);
  const eye = [
    target[0] + cameraOrbit.distance * cp * Math.cos(cameraOrbit.yaw),
    target[1] + cameraOrbit.distance * cp * Math.sin(cameraOrbit.yaw),
    target[2] + cameraOrbit.distance * Math.sin(cameraOrbit.pitch),
  ];
  const sp = Math.sin(cameraOrbit.pitch);
  const up = [
    -sp * Math.cos(cameraOrbit.yaw),
    -sp * Math.sin(cameraOrbit.yaw),
    cp,
  ];
  const aspect = Math.max(1e-3, canvas.width / Math.max(1, canvas.height));
  const view = mat4LookAt(eye, target, up);
  const fovy = 45 * Math.PI / 180;
  let proj;
  if ((params.cameraProjection | 0) === 1) {
    const halfH = Math.tan(fovy * 0.5) * cameraOrbit.distance;
    const halfW = halfH * aspect;
    proj = mat4Orthographic(-halfW, halfW, -halfH, halfH, 0.04 * n, 8.0 * n);
  } else {
    proj = mat4Perspective(fovy, aspect, 0.04 * n, 8.0 * n);
  }
  return {
    viewProj: mat4Mul(proj, view),
    eye,
    distance: cameraOrbit.distance,
  };
}

function cameraBasis() {
  const cp = Math.cos(cameraOrbit.pitch);
  const sp = Math.sin(cameraOrbit.pitch);
  const back = vec3Normalize([
    cp * Math.cos(cameraOrbit.yaw),
    cp * Math.sin(cameraOrbit.yaw),
    sp,
  ]);
  const upHint = [
    -sp * Math.cos(cameraOrbit.yaw),
    -sp * Math.sin(cameraOrbit.yaw),
    cp,
  ];
  const right = vec3Normalize(vec3Cross(upHint, back));
  const up = vec3Cross(back, right);
  return { right, up, back };
}

function drawViewGizmo() {
  if (!viewGizmo) return;

  const rect = viewGizmo.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (viewGizmo.width !== w || viewGizmo.height !== h) {
    viewGizmo.width = w;
    viewGizmo.height = h;
  }

  const ctx = viewGizmo.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const basis = cameraBasis();
  const origin = [rect.width * 0.46, rect.height * 0.58];
  const len = Math.min(rect.width, rect.height) * 0.33;
  const axes = [
    { label: "X", color: "#ff5b5b", dir: [1, 0, 0] },
    { label: "Y", color: "#58d26f", dir: [0, 1, 0] },
    { label: "Z", color: "#58a6ff", dir: [0, 0, 1] },
  ].map((axis) => {
    const sx = vec3Dot(axis.dir, basis.right);
    const sy = vec3Dot(axis.dir, basis.up);
    const depth = vec3Dot(axis.dir, basis.back);
    return { ...axis, x: sx * len, y: -sy * len, depth };
  }).sort((a, b) => a.depth - b.depth);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.beginPath();
  ctx.arc(origin[0], origin[1], 2.4, 0, Math.PI * 2);
  ctx.fill();

  for (const axis of axes) {
    const x0 = origin[0];
    const y0 = origin[1];
    const x1 = x0 + axis.x;
    const y1 = y0 + axis.y;
    const angle = Math.atan2(axis.y, axis.x);
    const alpha = 0.62 + 0.38 * ((axis.depth + 1) * 0.5);

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = axis.color;
    ctx.fillStyle = axis.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(angle - 0.55) * 7, y1 - Math.sin(angle - 0.55) * 7);
    ctx.lineTo(x1 - Math.cos(angle + 0.55) * 7, y1 - Math.sin(angle + 0.55) * 7);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(axis.label, x1 + Math.cos(angle) * 9, y1 + Math.sin(angle) * 9);
  }
}

function setWaveInitUniforms() {
  gl.uniform3i(U.waveInit.uSimRes, simW, simH, simD);
  gl.uniform1f(U.waveInit.uHBAR, params.hbar);
  gl.uniform1f(U.waveInit.uMass, params.mass);
  gl.uniform1f(U.waveInit.uP0, params.p0);
  gl.uniform1f(U.waveInit.uDT, params.dt);

  gl.uniform3f(U.waveInit.uPacketPosFrac, params.packetX, params.packetY, params.packetZ);
  gl.uniform1f(U.waveInit.uPacketSigmaPx, params.packetSigma);
}

function setWaveStepUniforms(srcTex) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(U.waveStep.uState, 0);

  gl.uniform3i(U.waveStep.uSimRes, simW, simH, simD);
  gl.uniform1f(U.waveStep.uHBAR, params.hbar);
  gl.uniform1f(U.waveStep.uMass, params.mass);
  gl.uniform1f(U.waveStep.uDT, params.dt);
}

function resetWave() {
  gl.bindVertexArray(vaoEmpty);
  gl.viewport(0, 0, waveTexW, waveTexH);

  gl.useProgram(progWaveInit);
  setWaveInitUniforms();

  gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  flip = 0;
}

function waveStep() {
  const src = flip ? texB : texA;
  const dst = flip ? fboA : fboB;

  gl.useProgram(progWaveStep);
  setWaveStepUniforms(src);

  gl.bindVertexArray(vaoEmpty);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
  gl.viewport(0, 0, waveTexW, waveTexH);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  flip = 1 - flip;
}

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function rebuildParticles() {
  const n = Math.floor(params.nParticles);

  if (particleSrc) gl.deleteBuffer(particleSrc);
  if (particleDst) gl.deleteBuffer(particleDst);
  if (vaoParticles) gl.deleteVertexArray(vaoParticles);
  if (tf) gl.deleteTransformFeedback(tf);

  particleSrc = gl.createBuffer();
  particleDst = gl.createBuffer();

  const data = new Float32Array(n * 4);

  const sigma1D = params.packetSigma / Math.sqrt(2);
  const x0 = params.packetX * (simW - 1);
  const y0 = params.packetY * (simH - 1);
  const z0 = params.packetZ * (simD - 1);

  for (let i = 0; i < n; i++) {
    let x = x0 + randn() * sigma1D;
    let y = y0 + randn() * sigma1D;
    let z = z0 + randn() * sigma1D;
    x = Math.max(0, Math.min(simW - 1, x));
    y = Math.max(0, Math.min(simH - 1, y));
    z = Math.max(0, Math.min(simD - 1, z));
    data[i * 4 + 0] = x;
    data[i * 4 + 1] = y;
    data[i * 4 + 2] = z;
    data[i * 4 + 3] = 1.0;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, particleSrc);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, particleDst);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

  vaoParticles = gl.createVertexArray();
  gl.bindVertexArray(vaoParticles);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleSrc);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  gl.bindVertexArray(null);

  tf = gl.createTransformFeedback();
}

function particleUpdate() {
  const n = Math.floor(params.nParticles);
  const waveTex = flip ? texB : texA;

  gl.useProgram(progPartUpdate);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, waveTex);
  gl.uniform1i(U.partUpdate.uState, 0);

  gl.uniform3i(U.partUpdate.uSimRes, simW, simH, simD);
  gl.uniform1f(U.partUpdate.uHBAR, params.hbar);
  gl.uniform1f(U.partUpdate.uMass, params.mass);
  gl.uniform1f(U.partUpdate.uDT, params.dt);
  gl.uniform1f(U.partUpdate.uSpinS, params.spinS);

  gl.uniform1f(U.partUpdate.uRhoMin, params.rhoMin);
  gl.uniform1f(U.partUpdate.uVelClamp, params.velClamp);

  gl.bindVertexArray(vaoParticles);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, particleDst);

  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, n);
  gl.endTransformFeedback();

  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.disable(gl.RASTERIZER_DISCARD);

  [particleSrc, particleDst] = [particleDst, particleSrc];
  gl.bindBuffer(gl.ARRAY_BUFFER, particleSrc);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  gl.bindVertexArray(null);
}

const LN2 = Math.log(2);
function fadeFromHalfLife(halfLife, dtTotal) {
  if (halfLife <= 0) return 0.0;
  return Math.exp(-LN2 * (dtTotal / halfLife));
}

function rebuildDensity() {
  deleteDensityTargets();

  densW = Math.max(64, Math.floor(canvas.width * params.densityScale));
  densH = Math.max(64, Math.floor(canvas.height * params.densityScale));

  densTexA = makeTexRGBA16F(densW, densH);
  densTexB = makeTexRGBA16F(densW, densH);
  densFboA = makeFBO(densTexA);
  densFboB = makeFBO(densTexB);
  densFlip = 0;

  clearDensity();
}

function clearDensity() {
  if (!densFboA || !densFboB) {
    trailClearPending = false;
    return;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, densFboA);
  gl.viewport(0, 0, densW, densH);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindFramebuffer(gl.FRAMEBUFFER, densFboB);
  gl.viewport(0, 0, densW, densH);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  densFlip = 0;
  trailClearPending = false;
}

function densityStepAndStamp() {
  const dtTotal = params.dt * Math.floor(params.stepsPerFrame);
  const camera = cameraFrame();
  const viewProj = camera.viewProj;
  const sizeScale = densW / Math.max(1, canvas.width);

  const src = densFlip ? densTexB : densTexA;
  const dstFbo = densFlip ? densFboA : densFboB;

  const fade = fadeFromHalfLife(params.trailHalfLife, dtTotal);

  gl.useProgram(progDensityStep);
  gl.bindVertexArray(vaoEmpty);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
  gl.viewport(0, 0, densW, densH);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.uniform1i(U.densityStep.uPrev, 0);
  gl.uniform1f(U.densityStep.uFade, fade);

  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.colorMask(true, false, false, false);

  gl.useProgram(progPartStamp);
  gl.bindVertexArray(vaoParticles);

  gl.uniform3i(U.partStamp.uSimRes, simW, simH, simD);
  gl.uniformMatrix4fv(U.partStamp.uViewProj, false, viewProj);
  gl.uniform1f(U.partStamp.uBoxScale, params.boxScale);
  gl.uniform1f(U.partStamp.uPointSize, params.dotSize * sizeScale);
  gl.uniform1f(U.partStamp.uDotSigma, params.dotSigma);
  gl.uniform1f(U.partStamp.uDotGain, params.dotGain);
  gl.uniform1f(U.partStamp.uStampGain, params.trailStampGain);
  gl.uniform1i(U.partStamp.uNumParticles, params.nParticles);
  gl.uniform1f(U.partStamp.uTrailWidth, params.trailWidth * sizeScale);
  gl.uniform3fv(U.partStamp.uCameraEye, camera.eye);
  gl.uniform1f(U.partStamp.uCameraDistance, camera.distance);
  gl.uniform1i(U.partStamp.uCameraProjection, params.cameraProjection | 0);

  gl.drawArrays(gl.POINTS, 0, Math.floor(params.nParticles));

  gl.colorMask(true, true, true, true);
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(null);

  densFlip = 1 - densFlip;
}

function equipotentialVertexCount() {
  if (simW < 2 || simH < 2) return 0;
  const subcellsPerCell = EQUIPOTENTIAL_SUBDIV * EQUIPOTENTIAL_SUBDIV;
  return (simW - 1) * (simH - 1) * subcellsPerCell * EQUIPOTENTIAL_LEVEL_COUNT * 12;
}

function render() {
  const waveTex = flip ? texB : texA;
  const densTex = densFlip ? densTexB : densTexA;
  const camera = cameraFrame();
  const viewProj = camera.viewProj;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.clearColor(0.005, 0.008, 0.012, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (params.showCloud) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);

    gl.useProgram(progCloudView);
    gl.bindVertexArray(vaoEmpty);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    gl.uniform1i(U.cloudView.uState, 0);
    gl.uniform3i(U.cloudView.uSimRes, simW, simH, simD);
    gl.uniformMatrix4fv(U.cloudView.uViewProj, false, viewProj);
    gl.uniform1f(U.cloudView.uBoxScale, params.boxScale);
    gl.uniform1f(U.cloudView.uCloudGain, params.cloudGain);
    gl.uniform1f(U.cloudView.uCloudGamma, params.cloudGamma);
    gl.uniform1f(U.cloudView.uCloudLowBoost, params.cloudLowBoost);
    gl.uniform1f(U.cloudView.uCloudCutoff, params.cloudCutoff);
    gl.uniform1f(U.cloudView.uPointSize, params.cloudPointSize);
    gl.uniform1i(U.cloudView.uShowPhase, params.showPhase);
    gl.uniform1i(U.cloudView.uPaletteId, params.paletteId | 0);
    gl.uniform1f(U.cloudView.uCameraDistance, camera.distance);
    gl.uniform1i(U.cloudView.uCameraProjection, params.cameraProjection | 0);

    gl.drawArrays(gl.POINTS, 0, voxelCount);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  if (params.showTrail) {
    gl.enable(gl.BLEND);

    if (params.trailBlendMode === 0) {

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    } else if (params.trailBlendMode === 1) {

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_COLOR);
    } else if (params.trailBlendMode === 2) {

      gl.blendFunc(gl.ONE, gl.ONE);

    }

    gl.useProgram(progDensityRender);
    gl.bindVertexArray(vaoEmpty);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, densTex);
    gl.uniform1i(U.densityRender.uDensity, 0);

    gl.uniform1f(U.densityRender.uGain, params.trailVisGain);
    gl.uniform1f(U.densityRender.uGamma, params.trailVisGamma);
    gl.uniform1i(U.densityRender.uPaletteId, params.paletteId | 0);
    gl.uniform1i(U.densityRender.uBlendMode, params.trailBlendMode | 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.disable(gl.BLEND);
  }

  if (vaoBoxShell && boxShellVertexCount > 0) {
    const boxCenter = boxCenterWorld();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.useProgram(progBoxShellView);
    gl.bindVertexArray(vaoBoxShell);
    gl.uniformMatrix4fv(U.boxShellView.uViewProj, false, viewProj);
    gl.uniform3fv(U.boxShellView.uCameraEye, camera.eye);
    gl.uniform3fv(U.boxShellView.uBoxCenter, boxCenter);
    gl.drawArrays(gl.TRIANGLES, 0, boxShellVertexCount);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  if (vaoBox && boxVertexCount > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progLineView);
    gl.bindVertexArray(vaoBox);
    gl.uniformMatrix4fv(U.lineView.uViewProj, false, viewProj);
    gl.uniform4f(U.lineView.uColor, 0.38, 0.72, 0.68, 0.22);
    gl.drawArrays(gl.LINES, 0, boxVertexCount);
    gl.disable(gl.BLEND);
  }

  if (params.showEquipotentials) {
    const vertexCount = equipotentialVertexCount();
    if (vertexCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.useProgram(progEquipotentialView);
      gl.bindVertexArray(vaoEmpty);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, waveTex);
      gl.uniform1i(U.equipotentialView.uState, 0);
      gl.uniform3i(U.equipotentialView.uSimRes, simW, simH, simD);
      gl.uniformMatrix4fv(U.equipotentialView.uViewProj, false, viewProj);
      gl.uniform2f(U.equipotentialView.uViewport, canvas.width, canvas.height);
      gl.uniform1f(U.equipotentialView.uBoxScale, params.boxScale);
      gl.uniform1i(U.equipotentialView.uLevelCount, EQUIPOTENTIAL_LEVEL_COUNT);
      gl.uniform1i(U.equipotentialView.uSubdiv, EQUIPOTENTIAL_SUBDIV);
      gl.uniform1f(U.equipotentialView.uLogRhoMax, EQUIPOTENTIAL_LOG_RHO_MAX);
      gl.uniform1f(U.equipotentialView.uLogRhoStep, EQUIPOTENTIAL_LOG_RHO_STEP);
      gl.uniform1f(U.equipotentialView.uRhoFloor, params.rhoMin);
      gl.uniform1f(U.equipotentialView.uFloorZ, 0.0);
      gl.uniform1f(U.equipotentialView.uLineWidthPx, EQUIPOTENTIAL_LINE_WIDTH_PX);

      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  if (params.showParticles) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(progPartView);
    gl.bindVertexArray(vaoParticles);

    gl.uniform3i(U.partView.uSimRes, simW, simH, simD);
    gl.uniformMatrix4fv(U.partView.uViewProj, false, viewProj);
    gl.uniform1f(U.partView.uBoxScale, params.boxScale);
    gl.uniform1f(U.partView.uPointSize, params.dotSize);
    gl.uniform1f(U.partView.uDotSigma, params.dotSigma);
    gl.uniform1f(U.partView.uDotGain, params.dotGain);
    gl.uniform3fv(U.partView.uCameraEye, camera.eye);
    gl.uniform1f(U.partView.uCameraDistance, camera.distance);
    gl.uniform1i(U.partView.uCameraProjection, params.cameraProjection | 0);

    gl.drawArrays(gl.POINTS, 0, Math.floor(params.nParticles));

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}

function guidingModeLabel() {
  return GUIDING_MODE_NAMES[0];
}

function updateStats() {
  const lambda = params.p0 > 1e-6 ? (2 * Math.PI * params.hbar / params.p0) : Infinity;
  const lambdaText = Number.isFinite(lambda) ? fmt(lambda) : "inf";
  const quality = lambda < 8 ? ` <span style="color:#ffb347">under-resolved</span>` : "";
  statsEl.innerHTML = `<b>Physics</b>: ${guidingModeLabel()} &nbsp; <b>Grid</b>: ${simW}^3 &nbsp; <b>Particles</b>: ${Math.floor(params.nParticles)} &nbsp; <b>lambda</b>: ${lambdaText}${quality}`;
}

function rebuildBoxGeometry() {
  if (boxBuffer) gl.deleteBuffer(boxBuffer);
  if (vaoBox) gl.deleteVertexArray(vaoBox);
  if (boxShellBuffer) gl.deleteBuffer(boxShellBuffer);
  if (vaoBoxShell) gl.deleteVertexArray(vaoBoxShell);

  const x0 = 0, y0 = 0, z0 = 0;
  const x1 = simW - 1, y1 = simH - 1, z1 = simD - 1;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const edges = [
    0, 1, 1, 2, 2, 3, 3, 0,
    4, 5, 5, 6, 6, 7, 7, 4,
    0, 4, 1, 5, 2, 6, 3, 7,
  ];
  const verts = new Float32Array(edges.length * 3);
  for (let i = 0; i < edges.length; i++) {
    const p = corners[edges[i]];
    verts[i * 3 + 0] = p[0] * params.boxScale;
    verts[i * 3 + 1] = p[1] * params.boxScale;
    verts[i * 3 + 2] = p[2] * params.boxScale;
  }

  boxVertexCount = edges.length;
  boxBuffer = gl.createBuffer();
  vaoBox = gl.createVertexArray();
  gl.bindVertexArray(vaoBox);
  gl.bindBuffer(gl.ARRAY_BUFFER, boxBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  gl.bindVertexArray(null);

  const shellVerts = [];
  const pushShellVertex = (corner, normal, uv) => {
    shellVerts.push(
      corner[0] * params.boxScale,
      corner[1] * params.boxScale,
      corner[2] * params.boxScale,
      normal[0],
      normal[1],
      normal[2],
      uv[0],
      uv[1]
    );
  };
  const pushFace = (a, b, c, d, normal) => {
    const uvA = [0, 0], uvB = [1, 0], uvC = [1, 1], uvD = [0, 1];
    pushShellVertex(corners[a], normal, uvA);
    pushShellVertex(corners[b], normal, uvB);
    pushShellVertex(corners[c], normal, uvC);
    pushShellVertex(corners[a], normal, uvA);
    pushShellVertex(corners[c], normal, uvC);
    pushShellVertex(corners[d], normal, uvD);
  };

  pushFace(0, 1, 2, 3, [0, 0, -1]);
  pushFace(4, 7, 6, 5, [0, 0, 1]);
  pushFace(0, 3, 7, 4, [-1, 0, 0]);
  pushFace(1, 5, 6, 2, [1, 0, 0]);
  pushFace(0, 4, 5, 1, [0, -1, 0]);
  pushFace(3, 2, 6, 7, [0, 1, 0]);

  boxShellVertexCount = shellVerts.length / 8;
  boxShellBuffer = gl.createBuffer();
  vaoBoxShell = gl.createVertexArray();
  gl.bindVertexArray(vaoBoxShell);
  gl.bindBuffer(gl.ARRAY_BUFFER, boxShellBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shellVerts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  gl.bindVertexArray(null);
}

function rebuildSimulation() {
  resizeCanvas();

  const n = Math.max(32, Math.min(MAX_SIM_RES, Math.floor(params.simRes)));
  params.simRes = n;
  simW = n;
  simH = n;
  simD = n;
  waveTexW = simW;
  waveTexH = simH * simD;
  voxelCount = simW * simH * simD;
  cameraOrbit.distance = 2.15 * Math.max(simW, simH, simD) * params.boxScale;
  cameraTarget.distance = cameraOrbit.distance;

  deleteWaveTargets();
  texA = makeTexFloat32(waveTexW, waveTexH);
  texB = makeTexFloat32(waveTexW, waveTexH);
  fboA = makeFBO(texA);
  fboB = makeFBO(texB);
  flip = 0;

  resetWave();
  rebuildParticles();
  rebuildBoxGeometry();
  rebuildDensity();
}

function resetAll() {
  resetWave();
  rebuildParticles();
  clearDensity();
}

window.addEventListener("resize", () => {
  if (resizeCanvas()) rebuildDensity();
});

async function main() {
  await loadShaders();
  buildPrograms();
  rebuildSimulation();
  updateStats();

  params.trailHalfLife*=0.99;

  requestAnimationFrame(function loop() {
    if (resizeCanvas()) rebuildDensity();

    if (updateCameraEasing()) requestTrailClear();
    drawViewGizmo();

    if (trailClearPending) clearDensity();

    if (!paused) {
      const steps = Math.floor(params.stepsPerFrame);
      for (let i = 0; i < steps; i++) {
        waveStep();
        particleUpdate();
      }
      if (params.showTrail) densityStepAndStamp();
    }

    render();
    updateStats();
    requestAnimationFrame(loop);
  });
}

main().catch(err => {
  console.error(err);
  alert(String(err));
});
