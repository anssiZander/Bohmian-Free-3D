#version 300 es
precision highp float;
precision highp int;

in float vAlpha;
in float vPhase;
in float vIntensity;
out vec4 fragColor;

uniform int uShowPhase;
uniform int uPaletteId;

vec3 palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d)
{
  return a + b * cos(6.283185 * (c * t + d));
}

void getPaletteParams(int id, out vec3 a, out vec3 b, out vec3 c, out vec3 d)
{
  if(id==0){ a=vec3(0.05,0.03,0.08); b=vec3(0.85,0.65,0.95); c=vec3(1.0); d=vec3(0.00,0.20,0.55); }
  else if(id==1){ a=vec3(0.02,0.01,0.05); b=vec3(1.00,0.35,1.00); c=vec3(1.0); d=vec3(0.05,0.10,0.75); }
  else if(id==2){ a=vec3(0.10,0.18,0.14); b=vec3(0.70,0.90,0.55); c=vec3(1.0); d=vec3(0.15,0.45,0.75); }
  else if(id==3){ a=vec3(0.08,0.02,0.01); b=vec3(1.00,0.65,0.25); c=vec3(1.0); d=vec3(0.05,0.15,0.30); }
  else if(id==4){ a=vec3(0.02,0.06,0.10); b=vec3(0.65,0.95,1.00); c=vec3(1.0); d=vec3(0.10,0.30,0.60); }
  else if(id==5){ a=vec3(0.08,0.06,0.02); b=vec3(1.00,0.90,0.40); c=vec3(1.0); d=vec3(0.08,0.18,0.28); }
  else if(id==6){ a=vec3(0.03,0.07,0.03); b=vec3(0.50,1.00,0.65); c=vec3(1.0); d=vec3(0.10,0.35,0.55); }
  else if(id==7){ a=vec3(0.07,0.05,0.02); b=vec3(1.00,0.85,0.20); c=vec3(1.0); d=vec3(0.00,0.10,0.20); }
  else if(id==8){ a=vec3(0.07,0.02,0.04); b=vec3(1.00,0.55,0.30); c=vec3(1.0); d=vec3(0.05,0.25,0.45); }
  else { a=vec3(0.02,0.03,0.08); b=vec3(0.35,1.00,1.00); c=vec3(1.0); d=vec3(0.05,0.35,0.55); }
}

void main(){
  if (vAlpha <= 0.0) discard;

  vec2 p = gl_PointCoord - vec2(0.5);
  float r = length(p);
  if (r > 0.5) discard;

  float edge = smoothstep(0.5, 0.18, r);
  float blur = exp(-16.0 * r * r);
  float a = vAlpha * edge * blur;

  vec3 A, B, C, D;
  getPaletteParams(uPaletteId, A, B, C, D);
  float phaseT = fract((vPhase + 3.14159265) / 6.2831853);
  vec3 phaseCol = palette(phaseT, A, B, C, D);
  vec3 densityCol = mix(
    vec3(0.05, 0.22, 0.46),
    vec3(0.58, 0.95, 1.00),
    smoothstep(0.08, 0.95, vIntensity)
  );
  vec3 col = (uShowPhase == 1) ? phaseCol : densityCol;
  col *= 0.35 + 1.15 * vIntensity;

  fragColor = vec4(col * a, a);
}
