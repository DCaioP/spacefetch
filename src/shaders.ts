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

/** A small moon's orbit (tilted, so it reads as a flat ellipse) and its look. */
type Orbit = { speed: number; width: number; height: number; size: number; lumps: number; color: number }

/** A small, lumpy moon going round, hidden while it passes behind its planet. */
function moon(px: number, py: number, t: number, orbit: Orbit, r: number): Pixel {
  const a = t * orbit.speed
  const dx = px - (CENTER_X + Math.cos(a) * orbit.width)
  const dy = py - (CENTER_Y + Math.sin(a) * orbit.height)
  const d = Math.hypot(dx, dy)
  const isBehind = Math.sin(a) < 0 && Math.hypot(px - CENTER_X, py - CENTER_Y) < r
  // The edge wobbles with the angle, so a small moon looks like a rock, not a coin.
  const edge = orbit.size * (1 + orbit.lumps * (noise(dx / (d || 1) * 1.6 + 4, dy / (d || 1) * 1.6 + 4) - 0.5))
  if (isBehind || d >= edge) return null

  return shade(mix(orbit.color, shade(orbit.color, 0.6), noise(dx * 5 + 2, dy * 5)), light(dx, dy, orbit.size))
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

/** Octaves of `noise`, each finer and fainter: rough terrain, tangled cloud. */
function fbm(x: number, y: number, octaves: number): number {
  let sum = 0
  let weight = 0.5
  let total = 0
  for (let i = 0; i < octaves; i += 1) {
    sum += noise(x * 2 ** i + i * 17.3, y * 2 ** i + i * 9.1) * weight
    total += weight
    weight /= 2
  }

  return sum / total
}

/** An angle folded into (-π, π]. */
function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
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

const MARS_RADIUS = 3.05
const PHOBOS: Orbit = { speed: 0.15, width: 4.3, height: 1.15, size: 0.42, lumps: 0.35, color: 0x9a8b80 }
const DEIMOS: Orbit = { speed: -0.06, width: 6.2, height: 1.9, size: 0.3, lumps: 0.25, color: 0xb9aa9c }

/** Craters on a lon/lat lattice: darker floors, sunlit rims; 0 where there is none. */
function crater(lon: number, lat: number): number {
  const u = lon * 2.6
  const v = lat * 3.4
  const cellU = Math.floor(u)
  const cellV = Math.floor(v)
  if (hash(cellU + 31, cellV) < 0.8) return 0

  const size = 0.14 + 0.22 * hash(cellU, cellV + 5)
  const gap = Math.hypot(u - cellU - 0.2 - 0.6 * hash(cellU, cellV + 9), v - cellV - 0.2 - 0.6 * hash(cellU + 3, cellV)) / size

  return gap < 0.75 ? -1 : gap < 1 ? 1 : 0
}

/**
 * Mercury to Mars: a rust-red world turning, dark plains, a great canyon, craters,
 * polar caps, dust storms drifting over it, and Phobos and Deimos going round.
 */
const rocky: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const r = MARS_RADIUS
  const moonlight = moon(px, py, t, PHOBOS, r) ?? moon(px, py, t, DEIMOS, r)
  if (moonlight !== null) return moonlight

  const d = Math.hypot(dx, dy)
  const lit = light(dx, dy, r)
  if (d >= r) {
    // A thin dusty haze on the sunlit limb.
    const haze = clamp(1 - (d - r) / 0.22, 0, 1) * (lit - 0.45) * 2
    return haze > 0.25 ? mix(0x3a1408, 0xe88a5a, haze) : null
  }

  const { lon, lat } = surface(dx, dy, r, t * 0.045)
  let color = mix(0xa8401a, 0xe58448, fbm(lon * 1.5 + 3, lat * 2.8, 4))
  const plains = fbm(lon * 0.9 + 40, lat * 1.7 + 7, 3)
  if (plains > 0.54) color = mix(color, 0x4a1c0e, clamp((plains - 0.54) / 0.1, 0, 1) * 0.8)

  const reach = wrap(lon - 0.9)
  if (reach > -0.8 && reach < 0.7 && Math.abs(lat + 0.08 - 0.05 * Math.sin(reach * 5)) < 0.04) color = mix(color, 0x34120a, 0.65)
  const pit = crater(lon, lat)
  if (pit !== 0) color = pit < 0 ? shade(color, 0.86) : mix(color, 0xf2a070, 0.22)

  const storm = noise(lon * 2.4 - t * 0.02, lat * 5 + 2)
  if (storm > 0.66) color = mix(color, 0xf0b088, (storm - 0.66) * 2)
  if (Math.abs(lat) > 0.86) color = mix(color, 0xfff4ec, clamp((Math.abs(lat) - 0.86) / 0.06, 0, 1))

  return shade(color, 0.1 + 0.98 * lit ** 1.3)
}

const GAS_RADIUS = 2.6
/** The ring's ellipse on screen: half-width, half-height, and how much it leans. */
const RING_WIDTH = 6.8
const RING_HEIGHT = 1.75
const RING_LEAN = 0.12
const RING_INNER = 0.47
const CASSINI = [0.74, 0.775] as const
/** Where the planet's shadow falls across the ring: away from the light, upper left. */
const SHADOW_DIRECTION = [0.8, -0.6] as const
const METEORS = 4
const METEOR_CYCLE = 44
/** Fractions of a meteor's cycle spent falling, then flaring where it hit. */
const METEOR_FALL = 0.32
const METEOR_FLASH = 0.16
const METEOR_TRAIL = 16
/** How much of its path, as a fraction, each step of the trail reaches back. */
const METEOR_STEP = 0.028

/** Ring-plane coordinates of a screen point: `rho` 1 at the outer edge, `phi` round it. */
function ringPlane(dx: number, dy: number): { x: number; y: number; rho: number; phi: number; isFront: boolean } {
  const tilt = dy - dx * RING_LEAN
  const x = dx
  const y = (tilt / RING_HEIGHT) * RING_WIDTH

  return { x, y, rho: Math.hypot(x, y) / RING_WIDTH, phi: Math.atan2(y, x), isFront: tilt > 0 }
}

/**
 * The ring's dusty light: hundreds of ringlets, the Cassini gap, a faint inner
 * ring, and clumps that orbit faster toward the planet.
 */
function ringLight(rho: number, phi: number, t: number): Pixel {
  if (rho < RING_INNER || rho > 1) return null
  // Thinner than a pixel where the ring is foreshortened: dark dust, not a hole.
  if (rho > CASSINI[0] && rho < CASSINI[1]) return 0x241b15

  const ringlets = 0.6 + 0.4 * noise(rho * 42, 3.7) + 0.2 * (noise(rho * 120, 8.1) - 0.5)
  // Kepler: the inner ring laps the outer one, so the clumps shear as they go round.
  const orbit = phi - t * 0.08 * rho ** -1.5
  const clumps = noise(Math.cos(orbit) * 7 + 5, Math.sin(orbit) * 7 + rho * 16)
  const faint = rho < 0.6 ? 0.6 : 1
  const edge = clamp((1 - rho) / 0.06, 0, 1) * clamp((rho - RING_INNER) / 0.05, 0, 1)
  const density = ringlets * (0.5 + 0.75 * clumps) * faint * (0.4 + 0.6 * edge)
  // Bright motes of ice riding the ringlets, so the turning shows even where the ring is smooth.
  const turn = orbit / (Math.PI * 2)
  if (hash(Math.floor(rho * 60), Math.floor((turn - Math.floor(turn)) * 80)) > 0.96) return mix(0xd8c4a0, 0xfff8ec, clumps + 0.4)
  if (density < 0.2 && rho < 0.6) return null

  return mix(0x2e241c, 0xead8b8, clamp((density - 0.15) / 0.9, 0, 1))
}

/** True where the planet stands between the light and this point of the ring. */
function inPlanetShadow(x: number, y: number): boolean {
  const along = x * SHADOW_DIRECTION[0] + y * SHADOW_DIRECTION[1]
  const across = Math.abs(-x * SHADOW_DIRECTION[1] + y * SHADOW_DIRECTION[0])

  return along > 0 && across < GAS_RADIUS * 0.95
}

/** A point along a fall: from `start` through a bend to `end`, at `s` in [0, 1]. */
function bezier(s: number, start: number, bend: number, end: number): number {
  return (1 - s) * (1 - s) * start + 2 * (1 - s) * s * bend + s * s * end
}

/** Distance from a point to the segment between two others. */
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const lx = bx - ax
  const ly = by - ay
  const k = clamp(((x - ax) * lx + (y - ay) * ly) / (lx * lx + ly * ly || 1), 0, 1)

  return Math.hypot(x - ax - lx * k, y - ay - ly * k)
}

/** Fiery meteors arcing down onto the planet, each flaring where it strikes. */
function meteors(dx: number, dy: number, t: number): Pixel {
  for (let k = 0; k < METEORS; k += 1) {
    const shifted = t / METEOR_CYCLE + k / METEORS
    const cycle = Math.floor(shifted)
    const age = shifted - cycle
    if (age >= METEOR_FALL + METEOR_FLASH) continue

    const aim = hash(cycle, k + 7) * Math.PI * 2
    const reach = GAS_RADIUS * (0.2 + 0.65 * hash(k + 3, cycle))
    const endX = Math.cos(aim) * reach
    const endY = Math.sin(aim) * reach
    if (age >= METEOR_FALL) {
      const flash = (age - METEOR_FALL) / METEOR_FLASH
      const glow = (1 - Math.hypot(dx - endX, dy - endY) / (0.3 + 0.9 * flash)) * (1 - flash) * 1.4
      if (glow > 0.15) return mix(0xd02a08, 0xfff2c0, glow)
      continue
    }

    const from = -Math.PI / 2 + (hash(cycle * 1.3, k * 2.1) - 0.5) * 2.6
    const startX = Math.cos(from) * 8
    const startY = Math.sin(from) * 6.5
    const curl = (hash(k, cycle + 0.5) - 0.5) * 5
    const bendX = (startX + endX) / 2 - (endY - startY) * curl * 0.15
    const bendY = (startY + endY) / 2 + (endX - startX) * curl * 0.15
    const head = (age / METEOR_FALL) ** 1.3
    let x = bezier(head, startX, bendX, endX)
    let y = bezier(head, startY, bendY, endY)
    if (Math.hypot(dx - x, dy - y) < 0.24) return 0xfff8e6
    for (let i = 1; i < METEOR_TRAIL; i += 1) {
      const s = head - i * METEOR_STEP
      if (s < 0) break
      const nextX = bezier(s, startX, bendX, endX)
      const nextY = bezier(s, startY, bendY, endY)
      const fade = i / (METEOR_TRAIL - 1)
      if (toSegment(dx, dy, x, y, nextX, nextY) < 0.17 * (1 - fade) + 0.05) {
        return fade < 0.2 ? mix(0xffe7a0, 0xff9a30, fade / 0.2) : mix(0xff6a10, 0x5a0e00, (fade - 0.2) / 0.8)
      }
      x = nextX
      y = nextY
    }
  }

  return null
}

/** Jupiter's face: turbulent bands turning at their own speeds, and the Great Red Spot. */
function jovianSurface(dx: number, dy: number, t: number): number {
  const { lon, lat } = surface(dx, dy, GAS_RADIUS, 0)
  const turned = lon + t * (0.06 + 0.02 * Math.sin(lat * 9))
  const swirl = noise(turned * 2.2 + 11, lat * 7)
  const detail = noise(turned * 6, lat * 26) - 0.5
  const band = Math.sin(lat * 10 + (swirl - 0.5) * 1.8 + 0.35 * Math.sin(turned * 3 + lat * 5)) + detail * 0.4
  let color =
    band > 0.3 ? mix(0xe4bf94, 0xfaf0dc, (band - 0.3) / 0.9)
    : band > -0.3 ? mix(0xc0703a, 0xe4bf94, (band + 0.3) / 0.6)
    : mix(0x6e3218, 0xc0703a, (band + 1.2) / 0.9)

  const spot = Math.atan2(Math.sin(turned - 1), Math.cos(turned - 1))
  const oval = (spot / 0.42) ** 2 + ((lat - 0.2) / 0.11) ** 2
  if (oval < 1) color = mix(0xb83c22, mix(0xe08a5a, 0xb83c22, oval), noise(spot * 9, lat * 30 - t * 0.05) * 0.6)
  if (Math.abs(lat) > 0.72) color = mix(color, 0x7a5a44, (Math.abs(lat) - 0.72) / 0.28)

  return color
}

/**
 * Jupiter to Saturn: a banded giant with its red spot inside a broad dusty ring,
 * the planet's shadow across the ring, an amber moon going round, and meteors
 * streaking down in fire.
 */
const gasGiant: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const d = Math.hypot(dx, dy)

  const meteor = meteors(dx, dy, t)
  if (meteor !== null) return meteor

  const a = t * 0.07
  const moonX = Math.cos(a) * 6.3
  const moonY = Math.sin(a) * 2.9 - 0.4
  const isMoonFront = Math.sin(a) > 0
  const moonGap = Math.hypot(dx - moonX, dy - moonY)
  const moonlight = moonGap < 0.75 ? shade(mix(0xf0b040, 0xb06a20, noise(dx * 3, dy * 3)), light(dx - moonX, dy - moonY, 0.75)) : null
  if (moonlight !== null && isMoonFront) return moonlight

  const plane = ringPlane(dx, dy)
  const ring = ringLight(plane.rho, plane.phi, t)
  const ringLit = ring !== null && inPlanetShadow(plane.x, plane.y) && !plane.isFront ? shade(ring, 0.28) : ring
  if (ringLit !== null && (plane.isFront || d >= GAS_RADIUS)) return ringLit

  if (d < GAS_RADIUS) {
    // The ring's own shadow, cast down across the face just under the front arc.
    const above = ringPlane(dx + 0.2, dy - 0.35)
    const isRingShadow = above.isFront && ringLight(above.rho, above.phi, t) !== null
    const lit = clamp(0.2 + 0.9 * light(dx, dy, GAS_RADIUS), 0, 1) * Math.sqrt(1 - (d / GAS_RADIUS) ** 2) ** 0.25

    return shade(jovianSurface(dx, dy, t), isRingShadow ? lit * 0.45 : lit)
  }

  return moonlight
}

const ICE_RADIUS = 3.35
const BUBBLES = 7
/** Ticks for a bubble to rise from the south to the north of the face. */
const BUBBLE_RISE = 220

/** A bubble trapped in the ice, rising slowly as the world turns: its color, or null. */
function bubble(dx: number, dy: number, spin: number, t: number): Pixel {
  const r = ICE_RADIUS
  for (let k = 0; k < BUBBLES; k += 1) {
    const rise = t / BUBBLE_RISE + hash(k, 2)
    const lat = 0.75 - (rise - Math.floor(rise)) * 1.5
    const facing = hash(k, 1) * Math.PI * 2 - spin
    if (Math.cos(facing) < 0.3) continue
    const size = 0.28 + 0.2 * hash(k, 3)
    const bx = Math.sin(facing) * Math.sqrt(1 - lat * lat) * r
    const gap = Math.hypot(dx - bx, dy - lat * r) / size
    if (gap >= 1) continue
    if (Math.hypot(dx - bx + size * 0.35, dy - lat * r + size * 0.35) < size * 0.32) return 0xffffff

    return gap > 0.7 ? 0x2f7d98 : mix(0xbfeaf6, 0x5fb0c8, gap)
  }

  return null
}

/**
 * Uranus to Neptune: a world of glassy ice, swirls of white cloud winding across
 * its blues, bubbles rising inside, a bright glint and a frosty rim.
 */
const iceGiant: Shader = (px, py, t) => {
  const dx = px - CENTER_X
  const dy = py - CENTER_Y
  const r = ICE_RADIUS
  const d = Math.hypot(dx, dy)
  const lit = light(dx, dy, r)
  if (d >= r) {
    const halo = (1 - (d - r) / 0.3) * lit
    return halo > 0.3 ? mix(0x0b2a3a, 0x8fe4f8, halo) : null
  }

  const spin = t * 0.05
  const { lon, lat } = surface(dx, dy, r, spin)
  const swirl = fbm(lon * 1.3 + 5, lat * 2.2, 3)
  const cloud = 0.5 + 0.5 * Math.sin(lat * 7 + swirl * 6 + Math.sin(lon * 1.5) * 0.6) + (fbm(lon * 2, lat * 12, 3) - 0.5) * 0.5
  let color = mix(0xd4eef8, 0x23718c, clamp((lat + 0.55) / 1.35, 0, 1))
  if (cloud > 0.7) color = mix(color, 0xf6fdff, clamp((cloud - 0.7) / 0.3, 0, 1) * 0.9)
  else if (cloud < 0.25) color = mix(color, 0x17536a, (0.25 - cloud) * 2.4)

  const inside = bubble(dx, dy, spin, t)
  if (inside === 0xffffff) return inside
  let out = shade(inside ?? color, 0.35 + 0.72 * lit)
  // A glint where the light strikes the glass, and the rim catching it.
  const glint = clamp(1 - Math.hypot(dx + r * 0.42, dy + r * 0.55) / (r * 0.42), 0, 1) ** 2
  out = mix(out, 0xffffff, glint * 0.85)

  return mix(out, 0xa8f0ff, (d / r) ** 6 * 0.55)
}

const KUIPER_OBJECTS = 5
/** The ion tail points straight away from the Sun, off to the left and a little up. */
const ION_TAIL = [-Math.cos(0.12), -Math.sin(0.12)] as const

/** Icy rocks of the belt drifting past behind the comet. */
function kuiperObject(px: number, py: number, t: number): Pixel {
  for (let k = 0; k < KUIPER_OBJECTS; k += 1) {
    const size = 0.22 + 0.26 * hash(k, 5)
    const travel = t * 0.02 * (0.6 + hash(k, 4)) + hash(k, 6) * 17
    const dx = px - (15.5 - (travel - Math.floor(travel / 17) * 17))
    const dy = py - (0.8 + hash(k, 7) * 6.4 + 0.25 * Math.sin(t * 0.02 + k))
    const d = Math.hypot(dx, dy)
    if (d >= size * (1 + 0.3 * (noise(dx / (d || 1) * 1.5 + k * 5, dy / (d || 1) * 1.5) - 0.5))) continue

    return shade(mix(0x9aa8c4, 0x585e7a, noise(dx * 5 + k, dy * 5)), 0.15 + 0.9 * light(dx, dy, size))
  }

  return null
}

/**
 * The Kuiper Belt: a comet with a glowing coma, a straight blue ion tail and a
 * broad curved dust tail streaming particles, icy rocks of the belt drifting by.
 */
const comet: Shader = (px, py, t) => {
  const hx = 10.4 + 0.6 * Math.sin(t * 0.07)
  const hy = 3.4 + 0.5 * Math.sin(t * 0.11)
  const dx = px - hx
  const dy = py - hy
  const d = Math.hypot(dx, dy)

  if (d < 0.4) return mix(0xffffff, 0xffe6ff, d / 0.4)
  const coma = Math.max(1 - d / 1.8, 0) ** 2 * (0.8 + 0.4 * noise(dx / d * 2 + t * 0.15, dy / d * 2))
  if (coma > 0.22) return mix(0x7a1aa8, 0xfff0ff, (coma - 0.22) / 0.55)

  const rock = kuiperObject(px, py, t)
  if (rock !== null) return rock

  const along = dx * ION_TAIL[0] + dy * ION_TAIL[1]
  const across = -dx * ION_TAIL[1] + dy * ION_TAIL[0]
  if (along <= 0) return null
  const fade = clamp(along / hx, 0, 1)

  if (Math.abs(across) < 0.1 + along * 0.03) {
    const streamer = noise(along * 1.4 - t * 0.5, across * 14 + 3)
    if (streamer > 0.2 + fade * 0.55) return mix(0xc0b4ff, 0x2a1a80, fade)
  }

  // The dust tail lags behind the comet's path, so it bends away from the ion tail.
  const off = across + along * along * 0.03
  const width = 0.35 + along * 0.17
  if (Math.abs(off) >= width) return null
  const body = (1 - Math.abs(off) / width) * (1 - fade) ** 0.7
  // Short streaks flowing back along the tail, not single dots.
  const particle = hash(Math.floor((along + t * 0.9) * 1.6), Math.floor(across * 4))
  const glow = body * 0.85 + particle * 0.4

  return glow > 0.55 ? mix(0xff4fd8, 0x4a0f6a, fade + (1 - body) * 0.3) : null
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
