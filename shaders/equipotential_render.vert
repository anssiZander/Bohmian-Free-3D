#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform ivec3 uSimRes;
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform float uBoxScale;
uniform int uLevelCount;
uniform int uSubdiv;
uniform float uLogRhoMax;
uniform float uLogRhoStep;
uniform float uRhoFloor;
uniform float uFloorZ;
uniform float uLineWidthPx;

out vec3 vColor;
out float vAlpha;
out float vLineCoordPx;

ivec2 voxelToAtlas(ivec3 p) {
  return ivec2(p.x, p.y + p.z * uSimRes.y);
}

float gridLogRho(ivec2 xy, int z) {
  ivec2 q = clamp(xy, ivec2(0), uSimRes.xy - ivec2(1));
  int sliceZ = clamp(z, 0, uSimRes.z - 1);
  vec2 psi = texelFetch(uState, voxelToAtlas(ivec3(q, sliceZ)), 0).rg;
  return log(max(dot(psi, psi), uRhoFloor));
}

mat4 logRhoPatch(ivec2 base, int z) {
  return mat4(
    gridLogRho(base + ivec2(-1, -1), z),
    gridLogRho(base + ivec2(-1,  0), z),
    gridLogRho(base + ivec2(-1,  1), z),
    gridLogRho(base + ivec2(-1,  2), z),
    gridLogRho(base + ivec2( 0, -1), z),
    gridLogRho(base + ivec2( 0,  0), z),
    gridLogRho(base + ivec2( 0,  1), z),
    gridLogRho(base + ivec2( 0,  2), z),
    gridLogRho(base + ivec2( 1, -1), z),
    gridLogRho(base + ivec2( 1,  0), z),
    gridLogRho(base + ivec2( 1,  1), z),
    gridLogRho(base + ivec2( 1,  2), z),
    gridLogRho(base + ivec2( 2, -1), z),
    gridLogRho(base + ivec2( 2,  0), z),
    gridLogRho(base + ivec2( 2,  1), z),
    gridLogRho(base + ivec2( 2,  2), z)
  );
}

float cubic(float a, float b, float c, float d, float t) {
  float p = (d - c) - (a - b);
  float q = (a - b) - p;
  float r = c - a;
  float s = b;
  return ((p * t + q) * t + r) * t + s;
}

float cubicDeriv(float a, float b, float c, float d, float t) {
  float p = (d - c) - (a - b);
  float q = (a - b) - p;
  float r = c - a;
  return (3.0 * p * t + 2.0 * q) * t + r;
}

float bicubicLogRho(mat4 samples, vec2 f) {
  float row0 = cubic(samples[0][0], samples[1][0], samples[2][0], samples[3][0], f.x);
  float row1 = cubic(samples[0][1], samples[1][1], samples[2][1], samples[3][1], f.x);
  float row2 = cubic(samples[0][2], samples[1][2], samples[2][2], samples[3][2], f.x);
  float row3 = cubic(samples[0][3], samples[1][3], samples[2][3], samples[3][3], f.x);
  float smoothValue = cubic(row0, row1, row2, row3, f.y);
  float linearValue = mix(
    mix(samples[1][1], samples[2][1], f.x),
    mix(samples[1][2], samples[2][2], f.x),
    f.y
  );
  return mix(linearValue, smoothValue, 0.72);
}

vec2 bicubicGradLogRho(mat4 samples, vec2 f) {
  float row0 = cubic(samples[0][0], samples[1][0], samples[2][0], samples[3][0], f.x);
  float row1 = cubic(samples[0][1], samples[1][1], samples[2][1], samples[3][1], f.x);
  float row2 = cubic(samples[0][2], samples[1][2], samples[2][2], samples[3][2], f.x);
  float row3 = cubic(samples[0][3], samples[1][3], samples[2][3], samples[3][3], f.x);
  float dx0 = cubicDeriv(samples[0][0], samples[1][0], samples[2][0], samples[3][0], f.x);
  float dx1 = cubicDeriv(samples[0][1], samples[1][1], samples[2][1], samples[3][1], f.x);
  float dx2 = cubicDeriv(samples[0][2], samples[1][2], samples[2][2], samples[3][2], f.x);
  float dx3 = cubicDeriv(samples[0][3], samples[1][3], samples[2][3], samples[3][3], f.x);
  vec2 smoothGrad = vec2(
    cubic(dx0, dx1, dx2, dx3, f.y),
    cubicDeriv(row0, row1, row2, row3, f.y)
  );

  vec2 linearGrad = vec2(
    mix(samples[2][1] - samples[1][1], samples[2][2] - samples[1][2], f.y),
    mix(samples[1][2] - samples[1][1], samples[2][2] - samples[2][1], f.x)
  );
  return mix(linearGrad, smoothGrad, 0.72);
}

bool crossesLevel(float a, float b, float level) {
  return (a < level && b >= level) || (b < level && a >= level);
}

vec2 edgeCrossing(vec2 pa, vec2 pb, float va, float vb, float level) {
  float denom = vb - va;
  float t = (abs(denom) < 1e-8) ? 0.5 : clamp((level - va) / denom, 0.0, 1.0);
  return mix(pa, pb, t);
}

void addCrossing(inout int count, inout vec2 c0, inout vec2 c1, inout vec2 c2, inout vec2 c3, vec2 p) {
  if (count == 0) {
    c0 = p;
  } else if (count == 1) {
    c1 = p;
  } else if (count == 2) {
    c2 = p;
  } else if (count == 3) {
    c3 = p;
  }
  count++;
}

vec2 pickCrossing(int index, vec2 c0, vec2 c1, vec2 c2, vec2 c3) {
  if (index == 0) return c0;
  if (index == 1) return c1;
  if (index == 2) return c2;
  return c3;
}

vec3 contourColor(float t) {
  vec3 inner = vec3(0.74, 0.88, 0.58);
  vec3 mid = vec3(0.25, 0.76, 0.70);
  vec3 outer = vec3(0.18, 0.42, 0.58);
  if (t < 0.48) return mix(inner, mid, smoothstep(0.0, 0.48, t));
  return mix(mid, outer, smoothstep(0.48, 1.0, t));
}

void hideVertex() {
  vColor = vec3(0.0);
  vAlpha = 0.0;
  vLineCoordPx = 0.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

void main() {
  int levelCount = max(1, uLevelCount);
  int subdiv = max(1, uSubdiv);
  int cellsX = max(1, uSimRes.x - 1);
  int cellsY = max(1, uSimRes.y - 1);
  int subcellsPerCell = subdiv * subdiv;

  int quadVertex = gl_VertexID % 6;
  int segmentId = gl_VertexID / 6;
  int segmentInSubcell = segmentId % 2;
  int subcellLevelId = segmentId / 2;
  int levelId = subcellLevelId % levelCount;
  int subcellId = subcellLevelId / levelCount;
  int localSubcellId = subcellId % subcellsPerCell;
  int cellId = subcellId / subcellsPerCell;
  int x = cellId % cellsX;
  int y = cellId / cellsX;
  int subX = localSubcellId % subdiv;
  int subY = localSubcellId / subdiv;

  if (uSimRes.x < 2 || uSimRes.y < 2 || uSimRes.z < 1 || y >= cellsY) {
    hideVertex();
    return;
  }

  int z = (uSimRes.z - 1) / 2;
  float level = uLogRhoMax - float(levelId) * uLogRhoStep;
  float invSubdiv = 1.0 / float(subdiv);
  vec2 subBase = vec2(float(subX), float(subY)) * invSubdiv;
  vec2 cellBase = vec2(float(x), float(y));

  mat4 samples = logRhoPatch(ivec2(x, y), z);

  vec2 f00 = subBase;
  vec2 f10 = subBase + vec2(invSubdiv, 0.0);
  vec2 f11 = subBase + vec2(invSubdiv, invSubdiv);
  vec2 f01 = subBase + vec2(0.0, invSubdiv);

  float v00 = bicubicLogRho(samples, f00);
  float v10 = bicubicLogRho(samples, f10);
  float v11 = bicubicLogRho(samples, f11);
  float v01 = bicubicLogRho(samples, f01);

  vec2 g00 = cellBase + f00;
  vec2 g10 = cellBase + f10;
  vec2 g11 = cellBase + f11;
  vec2 g01 = cellBase + f01;

  int count = 0;
  vec2 c0 = vec2(0.0);
  vec2 c1 = vec2(0.0);
  vec2 c2 = vec2(0.0);
  vec2 c3 = vec2(0.0);

  if (crossesLevel(v00, v10, level)) addCrossing(count, c0, c1, c2, c3, edgeCrossing(g00, g10, v00, v10, level));
  if (crossesLevel(v10, v11, level)) addCrossing(count, c0, c1, c2, c3, edgeCrossing(g10, g11, v10, v11, level));
  if (crossesLevel(v11, v01, level)) addCrossing(count, c0, c1, c2, c3, edgeCrossing(g11, g01, v11, v01, level));
  if (crossesLevel(v01, v00, level)) addCrossing(count, c0, c1, c2, c3, edgeCrossing(g01, g00, v01, v00, level));

  int firstCrossing = segmentInSubcell * 2;
  if (count < firstCrossing + 2) {
    hideVertex();
    return;
  }

  vec2 aGrid = pickCrossing(firstCrossing, c0, c1, c2, c3);
  vec2 bGrid = pickCrossing(firstCrossing + 1, c0, c1, c2, c3);
  vec2 segment = bGrid - aGrid;
  if (dot(segment, segment) < 1e-8) {
    hideVertex();
    return;
  }

  bool useB = quadVertex == 1 || quadVertex == 4 || quadVertex == 5;
  bool usePositiveSide = quadVertex == 2 || quadVertex == 3 || quadVertex == 5;
  float side = usePositiveSide ? 1.0 : -1.0;
  vec2 gridPos = useB ? bGrid : aGrid;

  vec2 localPos = clamp(gridPos - cellBase, vec2(0.0), vec2(1.0));
  float gradMag = length(bicubicGradLogRho(samples, localPos));
  float gradLight = smoothstep(0.025, 0.42, gradMag);

  float denom = max(1.0, float(levelCount - 1));
  float levelT = float(levelId) / denom;
  vec3 baseColor = contourColor(levelT);
  vColor = baseColor * mix(0.38, 1.18, gradLight);
  vAlpha = mix(0.045, mix(0.52, 0.30, levelT), pow(gradLight, 0.75));

  vec4 clipA = uViewProj * vec4(vec3(aGrid * uBoxScale, uFloorZ), 1.0);
  vec4 clipB = uViewProj * vec4(vec3(bGrid * uBoxScale, uFloorZ), 1.0);
  vec4 clip = useB ? clipB : clipA;

  vec2 ndcA = clipA.xy / max(1e-6, clipA.w);
  vec2 ndcB = clipB.xy / max(1e-6, clipB.w);
  vec2 screenDir = (ndcB - ndcA) * uViewport;
  float screenLen = length(screenDir);
  if (screenLen < 1e-4) {
    hideVertex();
    return;
  }

  vec2 normalPx = vec2(-screenDir.y, screenDir.x) / screenLen;
  float halfWidthPx = max(0.5, 0.5 * uLineWidthPx);
  float aaPx = 1.25;
  float outerHalfWidthPx = halfWidthPx + aaPx;
  vec2 ndcOffset = normalPx * side * outerHalfWidthPx * 2.0 / max(uViewport, vec2(1.0));

  vLineCoordPx = side * outerHalfWidthPx;
  clip.xy += ndcOffset * clip.w;
  gl_Position = clip;
}
