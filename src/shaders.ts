// The token-space bodies, freed from its 14×8 grid: every shader takes the pixel's
// center in base units (0..14 across, 0..8 down) as a float, so the canvas can
// sample it at any scale.
import { clamp, mix, shade } from './color'
import type { Body } from './zones'

export const BASE_WIDTH = 14
export const BASE_HEIGHT = 8

const CENTER_X = BASE_WIDTH / 2
const CENTER_Y = BASE_HEIGHT / 2

/** A pixel's color as 0xRRGGBB, or null where space shows through. */
export type Pixel = number | null
type Shader = (px: number, py: number, t: number) => Pixel

/** A stable pseudo-random value in [0, 1) for a lattice point. */
export function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453

  return s - Math.floor(s)
}

/** Longitude and latitude of a pixel on a sphere of radius `r`, turned by `spin`. */
function surface(dx: number, dy: number, r: number, spin: number): { lon: number; lat: number } {
  const half = Math.sqrt(Math.max(r * r - dy * dy, 0.0001))

  return { lon: Math.asin(clamp(dx / half, -1, 1)) + spin, lat: dy / r }
}

/** Lit from the upper left, darker toward the far limb. */
function light(dx: number, dy: number, r: number): number {
  return 0.5 + 0.5 * clamp(-(dx / r) * 0.8 - (dy / r) * 0.35 + 0.35, -1, 1)
}

/** A small moon on a tilted orbit, hidden while it passes behind its planet. */
function moon(px: number, py: number, t: number, speed: number, r: number): Pixel {
  const a = t * speed
  const mx = CENTER_X + Math.cos(a) * 6.2
  const my = CENTER_Y + Math.sin(a) * 1.7
  const isBehind = Math.sin(a) < 0 && Math.hypot(px - CENTER_X, py - CENTER_Y) < r
  const d = Math.hypot(px - mx, py - my)
  if (isBehind || d >= 0.8) return null

  return shade(0xc9c9d6, light(px - mx, py - my, 0.8))
}

/** Smooth value noise in [0, 1): `hash` on the lattice, eased in between. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux

  return top + (bottom - top) * uy
}

const SUN_RADIUS = 2.55
/** The corona stops short of the frame's top and bottom, which sit 4 units from the center. */
const CORONA_REACH = 1.35

/**
 * The Sun: a disc darkening toward its limb with granulation boiling across it,
 * and a corona that fades outward in fine, slowly shifting filaments.
 */
const sun: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const d = Math.hypot(dx, dy)
  const r = SUN_RADIUS + 0.05 * Math.sin(t * 0.25)

  if (d < r) {
    const limb = Math.sqrt(1 - (d / r) ** 2)
    const cells = noise(dx * 2.2 + t * 0.06, dy * 2.2 - t * 0.04)
    const heat = clamp(limb * 0.85 + (cells - 0.5) * 0.35, 0, 1)

    return heat > 0.55 ? mix(0xffd23a, 0xfffbe6, (heat - 0.55) / 0.45) : mix(0xe0480a, 0xffd23a, heat / 0.55)
  }

  const out = (d - r) / CORONA_REACH
  if (out >= 1) return null

  const angle = Math.atan2(dy, dx)
  const wisps = noise(angle * 4 + t * 0.05, d * 0.8 - t * 0.12) * 0.6 + noise(angle * 11 - t * 0.03, t * 0.08) * 0.4
  const glow = (1 - out) ** 1.6 * (0.45 + 0.75 * wisps)
  if (glow < 0.28) return null

  return mix(0x5a1800, 0xff9a1a, clamp((glow - 0.28) / 0.7, 0, 1))
}

/** Mercury to Mars: a rusty world turning, polar caps, and a moon going round. */
const rocky: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const r = 3.2
  const moonlight = moon(px, py, t, 0.11, r)
  if (moonlight !== null) return moonlight
  if (Math.hypot(dx, dy) >= r) return null

  const { lon, lat } = surface(dx, dy, r, t * 0.07)
  const terrain = Math.sin(lon * 3.1) * Math.cos(lat * 4.2) + 0.6 * Math.sin(lon * 5.3 + lat * 2.1)
  const ground = terrain > 0.7 ? 0x8b2e0b : terrain > -0.2 ? 0xc1440e : 0xe27b58
  const color = Math.abs(lat) > 0.82 ? 0xf2e6dc : ground

  return shade(color, light(dx, dy, r))
}

/** Jupiter to Saturn: amber bands drifting under a cyan ring with a glint running round it. */
const gasGiant: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const r = 2.7
  const tilt = dy - dx * 0.12
  const rho = Math.hypot(dx / 6.7, tilt / 1.5)
  const isRing = rho > 0.6 && rho < 1 && (rho < 0.79 || rho > 0.85)
  const glint = Math.cos(Math.atan2(tilt / 1.5, dx / 6.7) - t * 0.22) > 0.96
  const ring = glint ? 0xeaffff : mix(0x00e5ff, 0x00799e, (rho - 0.6) / 0.4)
  const d = Math.hypot(dx, dy)

  if (isRing && (tilt > 0 || d >= r)) return ring
  if (d >= r) return null

  const { lon, lat } = surface(dx, dy, r, t * 0.1)
  const band = Math.sin(lat * 7.5 + 0.35 * Math.sin(lon * 2))
  const color = band > 0.45 ? 0xf5deb3 : band > -0.35 ? 0xffbf00 : 0xb5651d

  return shade(color, 0.55 + 0.45 * Math.sqrt(1 - (d / r) ** 2))
}

/** Uranus to Neptune: deep blue bands, a dark storm and white streaks going round. */
const iceGiant: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const r = 3.2
  const moonlight = moon(px, py, t, -0.09, r)
  if (moonlight !== null) return moonlight
  if (Math.hypot(dx, dy) >= r) return null

  const { lon, lat } = surface(dx, dy, r, t * 0.12)
  const phase = Math.atan2(Math.sin(lon), Math.cos(lon))
  let color = mix(0x1b3fa8, 0x2f6bff, 0.5 + 0.5 * Math.sin(lat * 5 + 0.4))
  if (Math.abs(phase - 0.6) < 0.4 && Math.abs(lat - 0.3) < 0.2) color = 0x0d1f5c
  if (Math.abs(lat + 0.45) < 0.15 && Math.sin(lon * 4) > 0.55) color = 0xdde8ff

  return shade(color, light(dx, dy, r))
}

/** The Kuiper Belt: a comet bobbing along, its tail streaming particles behind it. */
const comet: Shader = (px, py, t) => {
  const hx = 10.5 + 0.7 * Math.sin(t * 0.09)
  const hy = 3.5 + 0.6 * Math.sin(t * 0.13)
  const dx = px - hx
  const dy = py - hy
  const d = Math.hypot(dx, dy)

  if (d < 1) return 0xffffff
  if (d < 1.7) return mix(0xffffff, 0xffb3ff, (d - 1) / 0.7)
  if (dx >= 0 || Math.abs(dy) >= -dx * 0.32 + 0.6) return null

  const k = -dx / hx
  // Short horizontal streaks flowing back along the tail, not single dots.
  const particle = hash(Math.floor((px + t * 0.9) * 1.5), Math.floor(py * 4))

  return particle > 0.3 + k * 0.55 ? mix(0xff00ff, 0x5a1a8c, k) : null
}

/** The shadow, the photon ring hugging it, and the accretion disk around both. */
const HORIZON = 1.25
const PHOTON_RING = 0.28
const DISK_INNER = 1.9
const DISK_OUTER = 6.5
/** The disk's tilt: how flat its ellipse looks from here. */
const DISK_TILT = 0.18
/** The far side of the disk, bent by the hole into an arc over the top. */
const ARC_WIDTH = 0.85
const CLUMPS = 3
const CLUMP_LIFE = 70

/**
 * The disk's own light at radius `rho` and angle `phi` of its plane: hot white
 * inside fading to deep red outside, turbulence the inner orbits shear into
 * spirals (they turn faster), and the side coming at us beamed brighter.
 */
function diskLight(rho: number, phi: number, t: number): Pixel {
  if (rho < DISK_INNER || rho > DISK_OUTER) return null

  const heat = 1 - (rho - DISK_INNER) / (DISK_OUTER - DISK_INNER)
  const orbit = phi - t * 0.5 * (DISK_INNER / rho) ** 1.5
  const streaks = noise(Math.cos(orbit) * 2.6 + 9, Math.sin(orbit) * 2.6 + rho * 2.4)
  const beaming = 1 + 0.5 * -Math.cos(phi)
  const glow = heat ** 0.8 * (0.45 + 0.75 * streaks) * beaming
  // The outer edge frays instead of ending in a clean ellipse.
  if (glow < 0.12) return null

  const color =
    glow > 0.8 ? mix(0xffd27a, 0xfff6e8, (glow - 0.8) / 0.5)
    : glow > 0.4 ? mix(0xff6a00, 0xffd27a, (glow - 0.4) / 0.4)
    : mix(0x4a0800, 0xff6a00, (glow - 0.12) / 0.28)

  // A hint of blue-white on the approaching side, of ember on the receding one.
  return beaming > 1.2 ? mix(color, 0xe8f0ff, (beaming - 1.2) * 0.35) : color
}

/** Hot clumps of matter spiralling in, flaring white, gone at the horizon. */
function infall(u: number, v: number, t: number): Pixel {
  for (let k = 0; k < CLUMPS; k += 1) {
    const shifted = t + k * (CLUMP_LIFE / CLUMPS)
    const cycle = Math.floor(shifted / CLUMP_LIFE)
    const age = (shifted - cycle * CLUMP_LIFE) / CLUMP_LIFE
    const rho = DISK_OUTER * 0.85 - (DISK_OUTER * 0.85 - HORIZON) * age ** 1.6
    const phi = hash(cycle, k) * Math.PI * 2 + age * 9
    const cu = Math.cos(phi) * rho
    const cv = Math.sin(phi) * rho
    if (Math.hypot(u - cu, (v - cv) * 0.6) < 0.32 + 0.2 * age) return mix(0xffb070, 0xffffff, age)
  }

  return null
}

/**
 * The Black Hole, after Gargantua: a black shadow ringed by photons, the near
 * half of a tilted disk crossing in front of it, the far half lensed into an arc
 * over the top (and faintly under), all of it turning, and clumps falling in.
 */
const blackHole: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const d = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  // The disk's own plane: x as is, y stretched back out of the tilt.
  const v = dy / DISK_TILT
  const rho = Math.hypot(dx, v)
  const phi = Math.atan2(v, dx)

  // Near half of the disk, in front of everything.
  if (dy >= 0) {
    const clump = infall(dx, v, t)
    if (clump !== null && rho > DISK_INNER * 0.7) return clump
    const near = diskLight(rho, phi, t)
    if (near !== null) return near
  }

  if (d < HORIZON) return 0x000000

  const ringOut = d - HORIZON
  if (ringOut < PHOTON_RING) {
    const shimmer = 0.75 + 0.25 * Math.sin(angle * 5 - t * 1.1) * Math.sin(angle * 2 + t * 0.4)
    const side = 1 + 0.25 * -Math.cos(angle)

    return mix(0xff8a2a, 0xfff4dc, clamp(shimmer * side - 0.3, 0, 1))
  }

  // The far half, lensed: each radius of the arc shows a ring of the disk behind.
  const arcOut = (ringOut - PHOTON_RING) / ARC_WIDTH
  if (arcOut < 1 && dy < 0.2) {
    const seen = diskLight(DISK_INNER + arcOut * (DISK_OUTER - DISK_INNER) * 0.4, angle, t)
    if (seen !== null) return shade(seen, 1 - arcOut * 0.6)
  }
  // ...and a thin secondary image of it under the shadow.
  if (dy > 0 && ringOut < PHOTON_RING + 0.22) {
    const seen = diskLight(DISK_INNER + 0.4, -angle, t)
    if (seen !== null) return shade(seen, 0.55)
  }

  // The far half of the disk itself, where the shadow does not hide it.
  if (dy < 0) {
    const far = diskLight(rho, phi, t)
    if (far !== null) return shade(far, 0.8)
  }

  return null
}

export const SHADERS: Record<Body, Shader> = { sun, rocky, gas: gasGiant, ice: iceGiant, comet, hole: blackHole }
