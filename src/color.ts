/** Colors as 0xRRGGBB, and the escapes that paint them. */

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

export function rgb(r: number, g: number, b: number): number {
  return (Math.round(clamp(r, 0, 255)) << 16) | (Math.round(clamp(g, 0, 255)) << 8) | Math.round(clamp(b, 0, 255))
}

export function mix(from: number, to: number, k: number): number {
  const a = channels(from)
  const b = channels(to)
  const w = clamp(k, 0, 1)

  return rgb(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w)
}

export function shade(color: number, k: number): number {
  const [r, g, b] = channels(color)

  return rgb(r * k, g * k, b * k)
}

export function fg(color: number): string {
  const [r, g, b] = channels(color)

  return `\x1b[38;2;${r};${g};${b}m`
}

export function bg(color: number): string {
  const [r, g, b] = channels(color)

  return `\x1b[48;2;${r};${g};${b}m`
}

export const RESET = '\x1b[0m'
export const BOLD = '\x1b[1m'
