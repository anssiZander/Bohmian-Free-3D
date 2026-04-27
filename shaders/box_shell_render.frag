#version 300 es
precision highp float;

uniform vec3 uCameraEye;
uniform vec3 uBoxCenter;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;

out vec4 fragColor;

float edgeMask(vec2 uv) {
  vec2 edge = min(uv, 1.0 - uv);
  return 1.0 - smoothstep(0.012, 0.085, min(edge.x, edge.y));
}

float latticeMask(vec2 uv) {
  vec2 g = abs(fract(uv * 4.0) - 0.5);
  return 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
}

void main() {
  vec3 cameraAxis = normalize(uCameraEye - uBoxCenter);
  vec3 fromCenter = normalize(vWorldPos - uBoxCenter);
  float cameraSide = dot(fromCenter, cameraAxis);
  float frontFace = smoothstep(0.04, 0.72, cameraSide);
  float backFace = smoothstep(0.02, 0.86, -cameraSide);
  float sideFace = 1.0 - smoothstep(0.0, 0.72, abs(cameraSide));

  vec3 viewDir = normalize(uCameraEye - vWorldPos);
  float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 1.8);
  float edge = edgeMask(vUv);
  float lattice = latticeMask(vUv);

  float frontVisibility = mix(1.0, 0.18, frontFace);
  float panelAlpha = (0.014 + 0.12 * backFace + 0.032 * sideFace) * frontVisibility;
  float edgeAlpha = edge * (0.04 + 0.22 * backFace + 0.055 * sideFace) * mix(1.0, 0.35, frontFace);
  float latticeAlpha = lattice * (0.007 + 0.018 * backFace) * mix(1.0, 0.25, frontFace);
  float rimAlpha = rim * (0.01 + 0.035 * backFace) * frontVisibility;
  float alpha = panelAlpha + edgeAlpha + latticeAlpha + rimAlpha;

  vec3 nearColor = vec3(0.035, 0.12, 0.16);
  vec3 sideColor = vec3(0.10, 0.32, 0.34);
  vec3 backColor = vec3(0.31, 0.58, 0.50);
  vec3 edgeColor = vec3(0.62, 0.95, 0.78);
  vec3 rimColor = vec3(0.24, 0.62, 0.78);

  vec3 color = mix(nearColor, sideColor, sideFace);
  color = mix(color, backColor, backFace);
  color += edgeColor * edge * (0.34 + 0.42 * backFace) * mix(1.0, 0.45, frontFace);
  color += rimColor * rim * 0.18;

  if (alpha < 0.002) discard;
  fragColor = vec4(color, alpha);
}
