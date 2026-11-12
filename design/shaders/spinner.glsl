precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Color
 * @color
 * @default #111316
 */
uniform vec3 u_color;

/**
 * @label Turns per second
 * @default 1.4
 * @range 0.2, 4
 */
uniform float u_speed;

/**
 * @label Thickness
 * @default 0.16
 * @range 0.05, 0.5
 */
uniform float u_thickness;

void main() {
  vec2 p = (gl_FragCoord.xy - u_resolution * 0.5) / (min(u_resolution.x, u_resolution.y) * 0.5);
  float r = length(p);
  float ring = smoothstep(1.0, 0.96, r) * smoothstep(1.0 - u_thickness - 0.04, 1.0 - u_thickness, r);
  float a = atan(p.y, p.x) / 6.2831853 + 0.5;
  float head = fract(u_time * u_speed);
  float tail = fract(head - a);
  float alpha = ring * smoothstep(0.0, 0.75, 1.0 - tail) * step(tail, 0.75);
  float track = ring * 0.12;
  float o = max(alpha, track);
  gl_FragColor = vec4(u_color * o, o);
}
