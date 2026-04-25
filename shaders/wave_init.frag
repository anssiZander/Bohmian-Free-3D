#version 300 es
precision highp float;

uniform ivec3 uSimRes;

uniform float uHBAR;
uniform float uMass;
uniform float uP0;
uniform float uDT;

uniform vec3  uPacketPosFrac;
uniform float uPacketSigmaPx;

out vec4 fragColor;

float sqr(float x){ return x*x; }
vec2 cis(float a){ return vec2(cos(a), sin(a)); }
float kineticEnergy(){ return 0.5 * sqr(uP0) / uMass; }

ivec3 atlasToVoxel(ivec2 atlasPx) {
  int z = atlasPx.y / uSimRes.y;
  int y = atlasPx.y - z * uSimRes.y;
  return ivec3(atlasPx.x, y, z);
}

vec2 schrodingerRHS(vec2 psi, vec2 lapPsi){
  float cLap = uHBAR / (2.0 * uMass);
  return vec2(-cLap * lapPsi.y,
               cLap * lapPsi.x);
}

bool isInterior(vec3 xPx) {
  vec3 maxP = vec3(uSimRes - ivec3(1));
  return all(greaterThan(xPx, vec3(0.0))) && all(lessThan(xPx, maxP));
}

vec2 initialPacketAtPx(vec3 xPx, float t){
  if (!isInterior(xPx)) return vec2(0.0);

  vec3 x0 = uPacketPosFrac * vec3(uSimRes - ivec3(1));
  vec3 d  = xPx - x0;

  float amp = exp(-dot(d, d) / (2.0 * sqr(uPacketSigmaPx)));

  float k  = uP0 / uHBAR;
  vec3 dir = vec3(1.0, 0.0, 0.0);
  float phaseSpace = k * dot(dir, d);
  float phaseTime  = -kineticEnergy() * t / uHBAR;
  return amp * cis(phaseSpace + phaseTime);
}

void main() {
  ivec3 p = atlasToVoxel(ivec2(gl_FragCoord.xy));
  vec3 xPx = vec3(p);

  if (!isInterior(xPx)) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 psi0 = initialPacketAtPx(xPx, 0.0);

  vec2 lapX = (
    -initialPacketAtPx(xPx + vec3( 2.0, 0.0, 0.0), 0.0)
    + 16.0 * initialPacketAtPx(xPx + vec3( 1.0, 0.0, 0.0), 0.0)
    - 30.0 * psi0
    + 16.0 * initialPacketAtPx(xPx + vec3(-1.0, 0.0, 0.0), 0.0)
    - initialPacketAtPx(xPx + vec3(-2.0, 0.0, 0.0), 0.0)
  ) / 12.0;
  vec2 lapY = (
    -initialPacketAtPx(xPx + vec3(0.0,  2.0, 0.0), 0.0)
    + 16.0 * initialPacketAtPx(xPx + vec3(0.0,  1.0, 0.0), 0.0)
    - 30.0 * psi0
    + 16.0 * initialPacketAtPx(xPx + vec3(0.0, -1.0, 0.0), 0.0)
    - initialPacketAtPx(xPx + vec3(0.0, -2.0, 0.0), 0.0)
  ) / 12.0;
  vec2 lapZ = (
    -initialPacketAtPx(xPx + vec3(0.0, 0.0,  2.0), 0.0)
    + 16.0 * initialPacketAtPx(xPx + vec3(0.0, 0.0,  1.0), 0.0)
    - 30.0 * psi0
    + 16.0 * initialPacketAtPx(xPx + vec3(0.0, 0.0, -1.0), 0.0)
    - initialPacketAtPx(xPx + vec3(0.0, 0.0, -2.0), 0.0)
  ) / 12.0;
  vec2 lap0 = lapX + lapY + lapZ;

  vec2 rhs0 = schrodingerRHS(psi0, lap0);
  vec2 psiPrev = psi0 - uDT * rhs0;

  fragColor = vec4(psi0, psiPrev);
}
