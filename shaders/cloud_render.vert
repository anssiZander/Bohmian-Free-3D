#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uState;
uniform ivec3 uSimRes;
uniform mat4 uViewProj;
uniform float uBoxScale;
uniform float uCloudGain;
uniform float uCloudGamma;
uniform float uCloudLowBoost;
uniform float uCloudCutoff;
uniform float uPointSize;
uniform int uShowPhase;
uniform float uCameraDistance;
uniform int uCameraProjection;

out float vAlpha;
out float vPhase;
out float vIntensity;

ivec2 voxelToAtlas(ivec3 p) {
  return ivec2(p.x, p.y + p.z * uSimRes.y);
}

void main() {
  int sx = uSimRes.x;
  int sy = uSimRes.y;
  int slice = sx * sy;
  int id = gl_VertexID;
  int z = id / slice;
  int rem = id - z * slice;
  int y = rem / sx;
  int x = rem - y * sx;
  ivec3 p = ivec3(x, y, z);

  vec2 psi = texelFetch(uState, voxelToAtlas(p), 0).rg;
  float rho = dot(psi, psi);
  float intensity = 1.0 - exp(-uCloudGain * rho);
  intensity = pow(clamp(intensity, 0.0, 1.0), uCloudGamma);
  intensity = mix(intensity, pow(intensity, 0.52), clamp(uCloudLowBoost, 0.0, 1.0));

  vIntensity = intensity;
  vPhase = atan(psi.y, psi.x);
  vAlpha = 0.24 * intensity;

  if (intensity < uCloudCutoff) {
    vAlpha = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec4 clip = uViewProj * vec4(vec3(p) * uBoxScale, 1.0);
  gl_Position = clip;
  float viewScale = clamp(160.0 / max(1.0, clip.w), 0.35, 2.3);
  if (uCameraProjection == 1) {
    viewScale = clamp(160.0 / max(1.0, uCameraDistance), 0.35, 2.3);
  }
  gl_PointSize = uPointSize * viewScale * mix(0.65, 1.45, intensity);
}
