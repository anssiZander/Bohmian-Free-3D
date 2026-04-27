#version 300 es
precision highp float;

layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;

uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;

void main() {
  vWorldPos = aPosition;
  vNormal = normalize(aNormal);
  vUv = aUv;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
