precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @label Content */
uniform sampler2D u_content;

/**
 * @label Interval (s)
 * @default 6
 * @range 2, 20
 */
uniform float u_interval;

/**
 * @label Strength
 * @default 0.22
 * @range 0, 1
 */
uniform float u_strength;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec4 base = texture2D(u_content, uv);
  float cycle = mod(u_time, u_interval) / 1.4;
  float sweep = cycle * 2.4 - 0.7;
  float d = (uv.x + (1.0 - uv.y) * 0.45) - sweep;
  float band = exp(-d * d * 90.0) * step(cycle, 1.0);
  gl_FragColor = vec4(base.rgb + band * u_strength * base.a, base.a);
}
