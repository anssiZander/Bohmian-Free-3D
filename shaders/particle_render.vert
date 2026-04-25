#version 300 es
precision highp float;

layout(location=0) in vec4 aState;
uniform ivec3 uSimRes;
uniform mat4 uViewProj;
uniform float uBoxScale;
uniform float uPointSize;
uniform int uNumParticles;
uniform float uTrailWidth;
out float vAlive;
out float vParticleId;

void main(){
  vAlive = aState.w;
  vParticleId = float(gl_VertexID) / max(1.0, float(uNumParticles));

  if (vAlive < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec3 maxP = vec3(uSimRes - ivec3(1));
  vec3 p = clamp(aState.xyz, vec3(0.0), maxP);
  vec4 clip = uViewProj * vec4(p * uBoxScale, 1.0);
  gl_Position = clip;

  float size = uPointSize;
  if (uTrailWidth > 0.0) size = uTrailWidth;
  float perspective = clamp(180.0 / max(1.0, clip.w), 0.45, 2.4);
  gl_PointSize = size * perspective;
}
