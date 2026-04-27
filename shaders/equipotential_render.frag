#version 300 es
precision highp float;
precision highp int;

uniform float uLineWidthPx;

in vec3 vColor;
in float vAlpha;
in float vLineCoordPx;
out vec4 fragColor;

void main() {
  float halfWidthPx = max(0.5, 0.5 * uLineWidthPx);
  float aaPx = 1.25;
  float edge = 1.0 - smoothstep(halfWidthPx, halfWidthPx + aaPx, abs(vLineCoordPx));
  fragColor = vec4(vColor, vAlpha * edge);
}
