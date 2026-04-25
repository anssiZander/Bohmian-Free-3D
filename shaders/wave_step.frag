#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uState;
uniform ivec3 uSimRes;

uniform float uHBAR;
uniform float uMass;
uniform float uDT;

out vec4 fragColor;

ivec2 voxelToAtlas(ivec3 p) {
  return ivec2(p.x, p.y + p.z * uSimRes.y);
}

ivec3 atlasToVoxel(ivec2 atlasPx) {
  int z = atlasPx.y / uSimRes.y;
  int y = atlasPx.y - z * uSimRes.y;
  return ivec3(atlasPx.x, y, z);
}

vec2 fetchPsi(ivec3 q){
  if (q.x < 0 || q.y < 0 || q.z < 0 ||
      q.x >= uSimRes.x || q.y >= uSimRes.y || q.z >= uSimRes.z) {
    return vec2(0.0);
  }
  return texelFetch(uState, voxelToAtlas(q), 0).rg;
}

vec2 schrodingerRHS(vec2 psi, vec2 lapPsi){
  float cLap = uHBAR / (2.0 * uMass);
  return vec2(-cLap * lapPsi.y,
               cLap * lapPsi.x);
}

bool isBoundary(ivec3 p) {
  return p.x <= 0 || p.y <= 0 || p.z <= 0 ||
         p.x >= uSimRes.x - 1 ||
         p.y >= uSimRes.y - 1 ||
         p.z >= uSimRes.z - 1;
}

void main() {
  ivec3 p = atlasToVoxel(ivec2(gl_FragCoord.xy));
  ivec2 a = voxelToAtlas(p);

  if (isBoundary(p)) {
    fragColor = vec4(0.0);
    return;
  }

  vec4 s = texelFetch(uState, a, 0);
  vec2 psi     = s.rg;
  vec2 psiPrev = s.ba;

  vec2 lapX = (
    -fetchPsi(p + ivec3( 2, 0, 0))
    + 16.0 * fetchPsi(p + ivec3( 1, 0, 0))
    - 30.0 * psi
    + 16.0 * fetchPsi(p + ivec3(-1, 0, 0))
    - fetchPsi(p + ivec3(-2, 0, 0))
  ) / 12.0;
  vec2 lapY = (
    -fetchPsi(p + ivec3(0,  2, 0))
    + 16.0 * fetchPsi(p + ivec3(0,  1, 0))
    - 30.0 * psi
    + 16.0 * fetchPsi(p + ivec3(0, -1, 0))
    - fetchPsi(p + ivec3(0, -2, 0))
  ) / 12.0;
  vec2 lapZ = (
    -fetchPsi(p + ivec3(0, 0,  2))
    + 16.0 * fetchPsi(p + ivec3(0, 0,  1))
    - 30.0 * psi
    + 16.0 * fetchPsi(p + ivec3(0, 0, -1))
    - fetchPsi(p + ivec3(0, 0, -2))
  ) / 12.0;
  vec2 lapPsi = lapX + lapY + lapZ;

  vec2 rhs = schrodingerRHS(psi, lapPsi);
  vec2 psiNext = psiPrev + 2.0 * uDT * rhs;

  fragColor = vec4(psiNext, psi);
}
