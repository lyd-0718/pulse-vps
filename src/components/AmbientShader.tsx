import { useEffect, useRef } from "react";

export type ShaderPreset = "silk-mesh" | "soft-dunes" | "lagoon-mist";

interface AmbientShaderProps {
  preset: ShaderPreset;
}

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;

varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform int u_mode;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.52;
  mat2 rot = mat2(0.82, 0.57, -0.57, 0.82);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 1.92;
    a *= 0.48;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 p = vec2((uv.x - 0.5) * aspect * 0.72 + 0.5, uv.y * 0.85);
  p += (u_mouse - 0.5) * 0.035;

  float t = u_time * 0.16;

  vec2 warp = vec2(
    fbm(p * 1.15 + vec2(t, -t * 0.7)),
    fbm(p * 1.15 + vec2(-t * 0.8 + 4.1, t * 0.65 + 2.3))
  );
  float field = fbm(p * 1.1 + warp * 1.15 + vec2(t * 0.45, -t * 0.35));
  float sweep = smoothstep(0.0, 1.0, 0.5 + 0.5 * sin((p.x * 1.35 + p.y * 0.85) * 2.2 + warp.x * 2.0 - t * 1.3));
  float cornerGlow = smoothstep(1.15, 0.05, length(uv - vec2(0.14, 0.88)));
  float bottomGlow = smoothstep(1.1, 0.0, length(uv - vec2(0.86, 0.12)));

  vec3 col;
  if (u_mode == 0) {
    // Anodized Cool Mist & Optical Silk — tonal separation so ceramic glass cards pop crisply
    vec3 cBase  = vec3(0.875, 0.896, 0.930);
    vec3 cSky   = vec3(0.755, 0.822, 0.925);
    vec3 cSlate = vec3(0.818, 0.810, 0.918);
    vec3 cWarm  = vec3(0.922, 0.862, 0.832);

    col = mix(cBase, cSky, smoothstep(0.14, 0.84, field) * 0.78);
    col = mix(col, cSlate, smoothstep(0.24, 0.88, warp.y * sweep) * 0.56);
    col = mix(col, cWarm, bottomGlow * (0.44 + 0.34 * warp.x) * 0.62);
    col = mix(col, vec3(0.935, 0.948, 0.972), cornerGlow * 0.34);
  } else if (u_mode == 1) {
    // Warm Travertine & Brushed Champagne
    vec3 cStone = vec3(0.902, 0.886, 0.864);
    vec3 cSand  = vec3(0.875, 0.824, 0.768);
    vec3 cRose  = vec3(0.888, 0.808, 0.812);
    vec3 cSlate = vec3(0.798, 0.818, 0.872);

    col = mix(cStone, cSand, smoothstep(0.16, 0.84, field) * 0.70);
    col = mix(col, cRose, smoothstep(0.26, 0.86, sweep * warp.y) * 0.50);
    col = mix(col, cSlate, bottomGlow * (0.38 + 0.34 * warp.x) * 0.54);
    col = mix(col, vec3(0.942, 0.932, 0.918), cornerGlow * 0.38);
  } else {
    // Glacier Slate & Celadon Glass
    vec3 cMist  = vec3(0.865, 0.904, 0.916);
    vec3 cAqua  = vec3(0.720, 0.850, 0.842);
    vec3 cAzure = vec3(0.715, 0.812, 0.918);
    vec3 cCloud = vec3(0.928, 0.945, 0.955);

    col = mix(cMist, cAzure, smoothstep(0.16, 0.84, field) * 0.74);
    col = mix(col, cAqua, smoothstep(0.24, 0.86, sweep * (0.4 + warp.x * 0.6)) * 0.64);
    col = mix(col, cCloud, cornerGlow * 0.40);
  }

  float grain = (hash21(gl_FragCoord.xy + fract(u_time) * 13.0) - 0.5) * 0.022;
  col = clamp(col + grain, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function AmbientShader({ preset }: AmbientShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<number>(0);
  const drawOnceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    modeRef.current = preset === "silk-mesh" ? 0 : preset === "soft-dunes" ? 1 : 2;
    drawOnceRef.current?.();
  }, [preset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uMode = gl.getUniformLocation(prog, "u_mode");

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    let targetMx = 0.5;
    let targetMy = 0.5;
    let mx = 0.5;
    let my = 0.5;
    const start = performance.now();

    const renderFrame = (elapsedSec: number) => {
      gl.uniform1f(uTime, elapsedSec);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1i(uMode, modeRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      renderFrame(reduceMotion ? 1.5 : (performance.now() - start) * 0.001);
    };

    drawOnceRef.current = () => renderFrame(reduceMotion ? 1.5 : (performance.now() - start) * 0.001);

    const onMove = (e: PointerEvent) => {
      if (reduceMotion) return;
      targetMx = e.clientX / Math.max(1, window.innerWidth);
      targetMy = 1.0 - e.clientY / Math.max(1, window.innerHeight);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);

    let rafId = 0;
    let lastDraw = 0;
    let lastMode = -1;

    const frame = (now: number) => {
      if (reduceMotion) return;
      rafId = requestAnimationFrame(frame);
      if (document.hidden) return;
      const modeChanged = modeRef.current !== lastMode;
      if (!modeChanged && now - lastDraw < 34) return;
      lastDraw = now;
      lastMode = modeRef.current;
      mx += (targetMx - mx) * 0.06;
      my += (targetMy - my) * 0.06;
      renderFrame((now - start) * 0.001);
    };

    const onMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      cancelAnimationFrame(rafId);
      if (reduceMotion) {
        mx = 0.5;
        my = 0.5;
        renderFrame(1.5);
      } else {
        rafId = requestAnimationFrame(frame);
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    resize();
    if (!reduceMotion) {
      rafId = requestAnimationFrame(frame);
    }

    return () => {
      drawOnceRef.current = null;
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
