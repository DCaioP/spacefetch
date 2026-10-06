// Where the body and the panel go. Side by side: the body at the panel's height
// on the left, the panel against the right edge, and sky filling the way between,
// however wide the screen. Stacked (body over panel, both centered) on a narrow
// and tall terminal such as the vertical monitor. Squeezed side by side as a last resort.
import { canvasSize } from './canvas'
import { BASE_HEIGHT, BASE_WIDTH } from './shaders'

const GAP = 3
/** Rows kept free under the block, for the prompt. */
const PROMPT_ROWS = 2
/** Columns left between the panel and the right edge. */
const RIGHT_MARGIN = 1

export type Layout = {
  mode: 'side' | 'stacked'
  scale: number
  /** Cells of sky across: the body plus the stars around it. */
  fieldWidth: number
}

export function planLayout(columns: number, rows: number, panelWidth: number, panelHeight: number): Layout {
  const scale = (panelHeight * 2) / BASE_HEIGHT
  const room = columns - panelWidth - GAP - RIGHT_MARGIN
  if (room >= BASE_WIDTH * scale) return { mode: 'side', scale, fieldWidth: room }

  const stackScale = Math.min(scale, columns / BASE_WIDTH)
  const stackedHeight = canvasSize(stackScale).rows + 1 + panelHeight + PROMPT_ROWS
  if (stackedHeight <= rows) return { mode: 'stacked', scale: stackScale, fieldWidth: canvasSize(stackScale).columns }

  const squeezed = Math.max(1, room / BASE_WIDTH)

  return { mode: 'side', scale: squeezed, fieldWidth: canvasSize(squeezed).columns }
}

/** The block's lines from one frame of the field and the panel. */
export function compose(layout: Layout, art: string[], panel: string[], panelWidth: number, columns: number): string[] {
  const blank = (width: number) => ' '.repeat(Math.max(0, width))

  if (layout.mode === 'stacked') {
    const artLeft = blank(Math.floor((columns - layout.fieldWidth) / 2))
    const panelLeft = blank(Math.floor((columns - panelWidth) / 2))

    return [...art.map(line => artLeft + line), '', ...panel.map(line => panelLeft + line)]
  }

  const height = Math.max(art.length, panel.length)
  const artTop = Math.floor((height - art.length) / 2)
  const panelTop = Math.floor((height - panel.length) / 2)
  const lines: string[] = []
  for (let i = 0; i < height; i += 1) {
    lines.push(`${art[i - artTop] ?? blank(layout.fieldWidth)}${blank(GAP)}${panel[i - panelTop] ?? ''}`)
  }

  return lines
}
