precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @label Content */
uniform sampler2D u_content;

/**
 * @label Speed (px/s)
 * @default 40
 * @range 0, 200
 */
uniform float u_speed;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float shift = u_time * u_speed / u_resolution.x;
  uv.x = fract(uv.x + shift);
  gl_FragColor = texture2D(u_content, uv);
}
