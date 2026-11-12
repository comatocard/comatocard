precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @label Content */
uniform sampler2D u_content;

/**
 * @label Period (s)
 * @default 1.5
 * @range 0.5, 4
 */
uniform float u_period;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec4 base = texture2D(u_content, uv);
  float sweep = fract(u_time / u_period) * 1.6 - 0.3;
  float d = uv.x - sweep;
  float band = exp(-d * d * 60.0) * 0.55;
  gl_FragColor = vec4(base.rgb + band * base.a, base.a);
}
