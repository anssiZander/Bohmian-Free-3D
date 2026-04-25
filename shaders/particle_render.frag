#version 300 es
precision highp float;

in float vAlive;
out vec4 fragColor;

uniform float uDotSigma;
uniform float uDotGain;

void main(){
  if(vAlive < 0.5) discard;

  vec2 p = gl_PointCoord - vec2(0.5);
  float r = length(p);
  if(r > 0.5) discard;

  float edge = smoothstep(0.5, 0.42, r);
  float s = max(uDotSigma, 1e-4);
  float blur = exp(-(r * r) / s);
  float a = clamp(uDotGain * blur * edge, 0.0, 0.85);

  vec3 col = vec3(1.0, 0.92, 0.16);
  fragColor = vec4(col, a);
}
