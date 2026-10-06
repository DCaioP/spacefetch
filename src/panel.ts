// The info box beside the body, drawn in the zone's color, with long values
// wrapped under their key.
import { BOLD, RESET, fg, mix } from './color'
import type { Entry } from './sysinfo'
import type { Zone } from './zones'

const KEY_WIDTH = 9
const VALUE_TEXT = 0xd8d8e0
const MUTED = 0x8a8a96
/** The frame sits back: the zone's color, mostly sunk into the dark. */
const FRAME_DIM = 0.7
/** Keys keep a hint of the zone, lifted toward the value text. */
const KEY_TINT = 0.45

function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (Bun.stringWidth(candidate) <= width) {
      current = candidate
      continue
    }
    if (current !== '') lines.push(current)
    current = word
    while (Bun.stringWidth(current) > width) {
      lines.push(current.slice(0, width))
      current = current.slice(width)
    }
  }
  if (current !== '') lines.push(current)

  return lines.length > 0 ? lines : ['']
}

function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - Bun.stringWidth(Bun.stripANSI(text))))
}

/** A bar of the memory fill, tinted from the zone's color to white at the tip. */
function gauge(percent: number, width: number, color: number): string {
  const filled = Math.round((percent / 100) * width)
  let bar = ''
  for (let i = 0; i < width; i += 1) {
    bar += i < filled ? fg(mix(color, 0xffffff, (i / width) * 0.5)) + '─' : fg(0x3a3a44) + '─'
  }

  return bar + RESET
}

/** The panel's lines, each exactly `width` cells wide. `entries` empty means still loading. */
export function renderPanel(zone: Zone, percent: number, entries: Entry[], width: number): string[] {
  const color = fg(zone.color)
  const frame = fg(mix(zone.color, 0x000000, FRAME_DIM))
  const key = fg(mix(zone.color, VALUE_TEXT, KEY_TINT))
  const inner = width - 4
  const valueWidth = inner - KEY_WIDTH - 2
  const row = (content: string) => `${frame}│${RESET} ${pad(content, inner)} ${frame}│${RESET}`
  const lines = [
    `${frame}╭${'─'.repeat(width - 2)}╮${RESET}`,
    row(`${color}${BOLD}${zone.name}${RESET} ${fg(MUTED)}· ${zone.region}${RESET}`),
    row(`${gauge(percent, inner - 9, zone.color)} ${fg(MUTED)}RAM ${String(percent).padStart(3)}%${RESET}`),
    row(''),
  ]

  if (entries.length === 0) lines.push(row(`${fg(MUTED)}scanning…${RESET}`))
  for (const { key: name, value } of entries) {
    wrap(value, valueWidth).forEach((part, i) => {
      const label = i === 0 ? `${key}${name.padEnd(KEY_WIDTH)}${RESET}` : ' '.repeat(KEY_WIDTH)
      lines.push(row(`${label}  ${fg(VALUE_TEXT)}${part}${RESET}`))
    })
  }
  lines.push(`${frame}╰${'─'.repeat(width - 2)}╯${RESET}`)

  return lines
}
