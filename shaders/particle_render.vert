#version 300 es
precision highp float;

layout(location=0) in vec4 aState;
uniform ivec3 uSimRes;
uniform mat4 uViewProj;
uniform float uBoxScale;
uniform float uPointSize;
uniform int uNumParticles;
uniform float uTrailWidth;
uniform vec3 uCameraEye;
uniform float uCameraDistance;
uniform int uCameraProjection;
out float vAlive;
out float vParticleId;
out float vTrailDepthFade;

void main(){
  vAlive = aState.w;
  vParticleId = float(gl_VertexID) / max(1.0, float(uNumParticles));
  vTrailDepthFade = 1.0;

  if (vAlive < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec3 maxP = vec3(uSimRes - ivec3(1));
  vec3 p = clamp(aState.xyz, vec3(0.0), maxP);
  vec3 worldPos = p * uBoxScale;
  vec4 clip = uViewProj * vec4(worldPos, 1.0);
  gl_Position = clip;
  float sceneRadius = 0.5 * length(maxP * uBoxScale);
  float distToCamera = distance(worldPos, uCameraEye);
  float depthT = smoothstep(uCameraDistance - sceneRadius, uCameraDistance + sceneRadius, distToCamera);
  vTrailDepthFade = mix(1.0, 0.62, depthT);

  float size = uPointSize;
  if (uTrailWidth > 0.0) size = uTrailWidth;
  float viewScale = clamp(180.0 / max(1.0, clip.w), 0.45, 2.4);
  if (uCameraProjection == 1) {
    viewScale = clamp(180.0 / max(1.0, uCameraDistance), 0.45, 2.4);
  }
  gl_PointSize = size * viewScale;
}
