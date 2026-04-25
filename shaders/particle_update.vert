#version 300 es
precision highp float;
precision highp sampler2D;

layout(location=0) in vec4 aState;
out vec4 vState;

uniform sampler2D uState;
uniform ivec3 uSimRes;

uniform float uHBAR;
uniform float uMass;
uniform float uDT;
uniform float uSpinS;

uniform float uRhoMin;
uniform float uVelClamp;

ivec2 voxelToAtlas(ivec3 p) {
  return ivec2(p.x, p.y + p.z * uSimRes.y);
}

vec2 fetchPsiVoxel(ivec3 p) {
  if (p.x < 0 || p.y < 0 || p.z < 0 ||
      p.x >= uSimRes.x || p.y >= uSimRes.y || p.z >= uSimRes.z) {
    return vec2(0.0);
  }
  return texelFetch(uState, voxelToAtlas(p), 0).rg;
}

vec2 samplePsiTrilinear(vec3 xPx) {
  vec3 x = xPx;
  vec3 x0 = floor(x);
  vec3 f = x - x0;
  ivec3 p000 = ivec3(x0);
  ivec3 p100 = p000 + ivec3(1, 0, 0);
  ivec3 p010 = p000 + ivec3(0, 1, 0);
  ivec3 p110 = p000 + ivec3(1, 1, 0);
  ivec3 p001 = p000 + ivec3(0, 0, 1);
  ivec3 p101 = p000 + ivec3(1, 0, 1);
  ivec3 p011 = p000 + ivec3(0, 1, 1);
  ivec3 p111 = p000 + ivec3(1, 1, 1);

  vec2 c000 = fetchPsiVoxel(p000);
  vec2 c100 = fetchPsiVoxel(p100);
  vec2 c010 = fetchPsiVoxel(p010);
  vec2 c110 = fetchPsiVoxel(p110);
  vec2 c001 = fetchPsiVoxel(p001);
  vec2 c101 = fetchPsiVoxel(p101);
  vec2 c011 = fetchPsiVoxel(p011);
  vec2 c111 = fetchPsiVoxel(p111);

  vec2 c00 = mix(c000, c100, f.x);
  vec2 c10 = mix(c010, c110, f.x);
  vec2 c01 = mix(c001, c101, f.x);
  vec2 c11 = mix(c011, c111, f.x);
  vec2 c0 = mix(c00, c10, f.y);
  vec2 c1 = mix(c01, c11, f.y);
  return mix(c0, c1, f.z);
}

vec3 schrodingerVelocity(vec2 psi, vec2 dpsidx, vec2 dpsidy, vec2 dpsidz, float rhoEff) {
  float a = psi.x;
  float b = psi.y;

  float jx = (uHBAR / uMass) * (a * dpsidx.y - b * dpsidx.x);
  float jy = (uHBAR / uMass) * (a * dpsidy.y - b * dpsidy.x);
  float jz = (uHBAR / uMass) * (a * dpsidz.y - b * dpsidz.x);

  return vec3(jx, jy, jz) / rhoEff;
}

vec3 pauliSpinCorrection(float rhoEff, vec3 gradRho) {
  vec3 spinDir = vec3(0.0, 0.0, 1.0);
  return uSpinS * (uHBAR / uMass) * cross(gradRho, spinDir) / rhoEff;
}

vec3 guidingVelocity(vec3 xPx) {
  vec2 psi = samplePsiTrilinear(xPx);
  vec2 psiE = samplePsiTrilinear(xPx + vec3(1.0, 0.0, 0.0));
  vec2 psiW = samplePsiTrilinear(xPx + vec3(-1.0, 0.0, 0.0));
  vec2 psiN = samplePsiTrilinear(xPx + vec3(0.0, 1.0, 0.0));
  vec2 psiS = samplePsiTrilinear(xPx + vec3(0.0, -1.0, 0.0));
  vec2 psiU = samplePsiTrilinear(xPx + vec3(0.0, 0.0, 1.0));
  vec2 psiD = samplePsiTrilinear(xPx + vec3(0.0, 0.0, -1.0));
  vec2 psiE2 = samplePsiTrilinear(xPx + vec3(2.0, 0.0, 0.0));
  vec2 psiW2 = samplePsiTrilinear(xPx + vec3(-2.0, 0.0, 0.0));
  vec2 psiN2 = samplePsiTrilinear(xPx + vec3(0.0, 2.0, 0.0));
  vec2 psiS2 = samplePsiTrilinear(xPx + vec3(0.0, -2.0, 0.0));
  vec2 psiU2 = samplePsiTrilinear(xPx + vec3(0.0, 0.0, 2.0));
  vec2 psiD2 = samplePsiTrilinear(xPx + vec3(0.0, 0.0, -2.0));

  vec2 dpsidx = (-psiE2 + 8.0 * psiE - 8.0 * psiW + psiW2) / 12.0;
  vec2 dpsidy = (-psiN2 + 8.0 * psiN - 8.0 * psiS + psiS2) / 12.0;
  vec2 dpsidz = (-psiU2 + 8.0 * psiU - 8.0 * psiD + psiD2) / 12.0;

  float rho = dot(psi, psi);
  float rhoEff = max(rho, uRhoMin);

  vec3 v = schrodingerVelocity(psi, dpsidx, dpsidy, dpsidz, rhoEff);

  float rhoE = dot(psiE, psiE);
  float rhoW = dot(psiW, psiW);
  float rhoN = dot(psiN, psiN);
  float rhoS = dot(psiS, psiS);
  float rhoU = dot(psiU, psiU);
  float rhoD = dot(psiD, psiD);
  float rhoE2 = dot(psiE2, psiE2);
  float rhoW2 = dot(psiW2, psiW2);
  float rhoN2 = dot(psiN2, psiN2);
  float rhoS2 = dot(psiS2, psiS2);
  float rhoU2 = dot(psiU2, psiU2);
  float rhoD2 = dot(psiD2, psiD2);
  vec3 gradRho = vec3(
    -rhoE2 + 8.0 * rhoE - 8.0 * rhoW + rhoW2,
    -rhoN2 + 8.0 * rhoN - 8.0 * rhoS + rhoS2,
    -rhoU2 + 8.0 * rhoU - 8.0 * rhoD + rhoD2
  ) / 12.0;
  v += pauliSpinCorrection(rhoEff, gradRho);

  float sp = length(v);
  if (sp > uVelClamp) v *= (uVelClamp / sp);

  return v;
}

float reflectCoord(float x, float lo, float hi) {
  if (hi <= lo) return 0.5 * (lo + hi);
  float width = hi - lo;
  float period = 2.0 * width;
  float y = mod(x - lo, period);
  return lo + ((y <= width) ? y : period - y);
}

vec3 reflectIntoBox(vec3 xPx) {
  vec3 maxX = vec3(uSimRes - ivec3(1));
  vec3 lo = vec3(0.001);
  vec3 hi = maxX - vec3(0.001);
  return vec3(
    reflectCoord(xPx.x, lo.x, hi.x),
    reflectCoord(xPx.y, lo.y, hi.y),
    reflectCoord(xPx.z, lo.z, hi.z)
  );
}

void main() {
  vec3 x = aState.xyz;
  float alive = aState.w;

  if (alive < 0.5) {
    vState = aState;
    gl_Position = vec4(-2.0);
    return;
  }

  x = reflectIntoBox(x);
  vec3 v1 = guidingVelocity(x);
  vec3 xm = reflectIntoBox(x + 0.5 * uDT * v1);
  vec3 v2 = guidingVelocity(xm);
  vec3 xh = reflectIntoBox(x + 0.5 * uDT * v2);
  vec3 v3 = guidingVelocity(xh);
  vec3 xe = reflectIntoBox(x + uDT * v3);
  vec3 v4 = guidingVelocity(xe);
  vec3 xn = reflectIntoBox(x + (uDT / 6.0) * (v1 + 2.0 * v2 + 2.0 * v3 + v4));

  vState = vec4(xn, 1.0);
  gl_Position = vec4(-2.0);
}
