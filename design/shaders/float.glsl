precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @label Content */
uniform sampler2D u_content;

/**
 * @label Lift (px)
 * @default 10
 * @range 0, 40
 */
uniform float u_lift;

/**
 * @label Period (s)
 * @default 5
 * @range 1, 12
 */
uniform float u_period;

/**
 * @label Tilt (deg)
 * @default 3
 * @range 0, 12
 */
uniform float u_tilt;

/**
 * @label Phase
 * @default 0
 * @range 0, 6.283
 */
uniform float u_phase;

void main() {
  float t = u_time * 6.2831853 / u_period + u_phase;
  vec2 center = u_resolution * 0.5;
  float angle = radians(u_tilt) * sin(t * 0.5);
  vec2 p = gl_FragCoord.xy - center;
  p = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * p;
  p.y -= u_lift * sin(t);
  gl_FragColor = texture2D(u_content, (p + center) / u_resolution);
}
