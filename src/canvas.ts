// Rasterizes a body into terminal lines: two pixels per cell with half-blocks,
// in true color, the body at the left of a field of sky `width` cells wide.
import { RESET, bg, fg } from './color'
import { BASE_HEIGHT, BASE_WIDTH, SHADERS } from './shaders'
import { skyCell } from './sky'
import type { Body } from './zones'

const UPPER_HALF = '▀'
const LOWER_HALF = '▄'

/** How many cells a body takes at a given scale (base pixels per base unit). */
export function canvasSize(scale: number): { columns: number; rows: number } {
  return { columns: Math.round(BASE_WIDTH * scale), rows: Math.round((BASE_HEIGHT * scale) / 2) }
}

/**
 * One frame at time `t` (8 per second, as in the mod), one string per row: the
 * body at `scale` on the left, sky across the rest of `width`.
 */
export function renderBody(body: Body, t: number, scale: number, width: number): string[] {
  const shader = SHADERS[body]
  const { columns: bodyColumns, rows } = canvasSize(scale)
  const columns = Math.max(width, bodyColumns)
  const sample = (column: number, pixelRow: number) =>
    column < bodyColumns ? shader((column + 0.5) / scale, (pixelRow + 0.5) / scale, t) : null
  const lines: string[] = []

  // A color escape only where the color changes: a wide field is mostly dark sky.
  for (let row = 0; row < rows; row += 1) {
    let line = ''
    let fore: number | null = null
    let back: number | null = null
    const paint = (glyph: string, nextFore: number | null, nextBack: number | null) => {
      if (nextBack !== back) line += nextBack === null ? '\x1b[49m' : bg(nextBack)
      if (nextFore !== fore && nextFore !== null) line += fg(nextFore)
      back = nextBack
      fore = nextFore ?? fore
      line += glyph
    }
    for (let column = 0; column < columns; column += 1) {
      const top = sample(column, row * 2)
      const bottom = sample(column, row * 2 + 1)
      if (top !== null) {
        paint(UPPER_HALF, top, bottom)
      } else if (bottom !== null) {
        paint(LOWER_HALF, bottom, null)
      } else {
        const lit = skyCell(column, row, t, columns, rows)
        if (lit === null) paint(' ', null, null)
        else paint(lit[0], lit[1], null)
      }
    }
    lines.push(line + RESET)
  }

  return lines
}
