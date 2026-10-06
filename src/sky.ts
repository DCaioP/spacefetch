// The space behind the body: drifting dust stars, a few far stars that sparkle,
// and now and then a shooting star crossing the field.
import { mix, shade } from './color'
import { hash } from './shaders'

/** Single braille dots: a star anywhere inside its cell. */
const STAR_DOTS = ['⠁', '⠂', '⠄', '⠈', '⠐', '⠠', '⡀', '⢀'] as const
const STAR_DENSITY = 0.05
const STAR_COLOR = 0xc8d0ff

/** Far stars: fixed in place, rare, breathing from a dot to a four-point star. */
const SPARKLE_DENSITY = 0.006
const SPARKLE_GLYPHS = ['·', '✧', '✦'] as const

/** Each lane may throw a meteor once per `period` ticks (8 ticks a second). */
const METEOR_LANES = [
  { period: 26, offset: 0 },
  { period: 41, offset: 13 },
] as const
const METEOR_LIFE = 9
const METEOR_SPEED = 3.2
const METEOR_TRAIL = 7
/** Rows dropped per column travelled: a shallow fall from right to left. */
const METEOR_SLOPE = 0.22

export type SkyCell = [glyph: string, color: number]

/** A dust star, drifting left a column every four frames and twinkling. */
function dust(column: number, row: number, t: number): SkyCell | null {
  const drift = column + Math.floor(t / 4)
  const seed = hash(drift, row * 7 + 3)
  if (seed > STAR_DENSITY) return null

  const dot = STAR_DOTS[Math.floor(hash(drift, row + 11) * STAR_DOTS.length)]!
  const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.6 + seed * 600))

  return [dot, shade(STAR_COLOR, twinkle)]
}

function sparkle(column: number, row: number, t: number): SkyCell | null {
  const seed = hash(column * 3 + 1, row * 5 + 2)
  if (seed > SPARKLE_DENSITY) return null

  const breath = 0.5 + 0.5 * Math.sin(t * 0.35 + seed * 9000)
  const glyph = SPARKLE_GLYPHS[Math.min(2, Math.floor(breath * 3))]!

  return [glyph, mix(0x8890c0, 0xffffff, breath)]
}

/** The cell of a lane's meteor, if its head or trail passes through this one now. */
function meteor(column: number, row: number, t: number, width: number, rows: number): SkyCell | null {
  for (const { period, offset } of METEOR_LANES) {
    const cycle = Math.floor((t + offset) / period)
    const age = t + offset - cycle * period
    if (age > METEOR_LIFE || hash(cycle, period) < 0.35) continue

    const startColumn = width * (0.45 + 0.5 * hash(cycle, period + 1))
    const startRow = rows * 0.6 * hash(cycle, period + 2)
    const head = startColumn - age * METEOR_SPEED
    const behind = column - head
    if (behind < 0 || behind > METEOR_TRAIL) continue
    if (row !== Math.round(startRow + (startColumn - column) * METEOR_SLOPE)) continue

    // Bright at the head, fading along the trail and as the meteor burns out.
    const fade = (1 - behind / METEOR_TRAIL) * (1 - age / (METEOR_LIFE + 1))

    return [behind < 1 ? '━' : '─', mix(0x30365a, 0xffffff, fade)]
  }

  return null
}

/** What space shows at this cell of a field `width` × `rows`, or null for empty. */
export function skyCell(column: number, row: number, t: number, width: number, rows: number): SkyCell | null {
  return meteor(column, row, t, width, rows) ?? sparkle(column, row, t) ?? dust(column, row, t)
}
