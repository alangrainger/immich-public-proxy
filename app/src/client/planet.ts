// Little-planet view for a 360 photo: the equirectangular image drawn through a
// stereographic projection looking straight down, in a WebGL2 shader. Pannellum
// has no such projection. Drag to spin, drag up / down, wheel or pinch to zoom.

const VERTEX = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}'

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D t;
uniform vec2 res;
uniform float yaw, zoom;
out vec4 o;
void main(){
  vec2 q = (gl_FragCoord.xy - .5 * res) / min(res.x, res.y) * 2. / zoom;
  float r2 = dot(q, q);
  vec3 d = vec3(2. * q, 1. - r2) / (1. + r2);
  vec3 w = vec3(d.x, -d.z, d.y);
  vec2 uv = vec2((atan(w.x, w.z) + yaw) / 6.2831853 + .5, asin(clamp(w.y, -1., 1.)) / 3.1415927 + .5);
  vec2 a = vec2(fract(uv.x), uv.y), b = vec2(fract(uv.x + .5) - .5, uv.y);
  bool useA = fwidth(a.x) < fwidth(b.x);
  vec2 ax = dFdx(a), bx = dFdx(b), ay = dFdy(a), by = dFdy(b);
  o = textureGrad(t, a, useA ? ax : bx, useA ? ay : by);
}`

// Keeps the texture within the memory of a phone
const MAX_TEXTURE_WIDTH = 8192
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3

export interface Planet {
  show: () => void
  hide: () => void
  destroy: () => void
}

/**
 * `urls` are tried in order until one loads (full size, then the preview).
 * Returns null when the browser has no WebGL2. `speed` is read every frame and
 * is in degrees per second (negative turns the other way); `idleMs` is how long
 * the view waits after the last touch before it resumes spinning.
 */
export function createPlanet (canvas: HTMLCanvasElement, urls: string[], speed: () => number, idleMs: number): Planet | null {
  const gl = canvas.getContext('webgl2')
  if (!gl) return null

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type) as WebGLShader
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }
  const program = gl.createProgram() as WebGLProgram
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const uniform = (name: string) => gl.getUniformLocation(program, name)

  const texture = gl.createTexture()
  let ready = false
  let visible = false
  let yaw = 0
  let zoom = 0.55
  let last = 0
  let lastInput = 0
  const pointers = new Map<number, { x: number, y: number }>()

  const image = new Image()
  image.onload = () => {
    let source: TexImageSource = image
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), MAX_TEXTURE_WIDTH)
    if (image.naturalWidth > max) {
      const small = document.createElement('canvas')
      small.width = max
      small.height = max >> 1
      small.getContext('2d')?.drawImage(image, 0, 0, small.width, small.height)
      source = small
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    ready = true
  }
  const sources = [...urls]
  image.onerror = () => {
    const next = sources.shift()
    if (next) image.src = next
  }
  image.src = sources.shift() as string

  const frame = (now: number) => {
    if (!visible) return
    const dt = (now - last) / 1000
    last = now
    if (!pointers.size && speed() && Date.now() - lastInput > idleMs) yaw -= speed() * Math.PI / 180 * dt
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.floor(canvas.clientWidth * ratio)
    const h = Math.floor(canvas.clientHeight * ratio)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (ready) {
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uniform('res'), w, h)
      gl.uniform1f(uniform('yaw'), yaw)
      gl.uniform1f(uniform('zoom'), zoom)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    requestAnimationFrame(frame)
  }

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  canvas.onpointerdown = e => {
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    lastInput = Date.now()
  }
  canvas.onpointermove = e => {
    const p = pointers.get(e.pointerId)
    if (!p) return
    if (pointers.size === 2) {
      const before = pinchDistance()
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      zoom = clampZoom(zoom * pinchDistance() / before)
    } else {
      yaw -= (e.clientX - p.x) * 0.005
      zoom = clampZoom(zoom * Math.exp(-(e.clientY - p.y) * 0.004))
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
  }
  canvas.onpointerup = canvas.onpointercancel = e => {
    pointers.delete(e.pointerId)
    lastInput = Date.now()
  }
  canvas.onwheel = e => {
    e.preventDefault()
    zoom = clampZoom(zoom * Math.exp(-e.deltaY * 0.001))
    lastInput = Date.now()
  }

  return {
    show () {
      canvas.style.display = 'block'
      visible = true
      last = performance.now()
      lastInput = Date.now()
      requestAnimationFrame(frame)
    },
    hide () {
      visible = false
      canvas.style.display = 'none'
    },
    destroy () {
      visible = false
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}
