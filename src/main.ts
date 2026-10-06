#!/usr/bin/env bun
// spacefetch: a token-space body (at random, or the one asked for), animated beside
// the system info.
//
//   spacefetch [--zone Z] [--percent N] [--seconds S]   animate in the foreground, keep the last frame
//   spacefetch --static [--clear]                       one frame; --clear puts it at the top of a clean screen
//   spacefetch --loop [--shell PID] [--seconds S]       keep animating the block at the top of the screen,
//                                                       in the background, while the prompt below takes input
//
// `--loop` assumes the block sits at row 1, where `--static --clear` drew it. spacefetch.zsh runs the two.
import { writeSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { renderBody } from './canvas'
import { renderPanel } from './panel'
import { compose, planLayout } from './layout'
import { memoryPercent, readSysinfo } from './sysinfo'
import { BODIES, type Body, zoneOf, zoneOfBody } from './zones'

const PANEL_WIDTH = 48
const FPS = 30
/** The background loop shares the terminal with the shell; fewer frames, less to write. */
const LOOP_FPS = 20
/** The mod advances its sprites 8 times a second; `t` keeps that pace whatever the fps. */
const TICKS_PER_SECOND = 8
/** Past this an idle first prompt stops animating, so a forgotten terminal does not spin forever. */
const LOOP_SECONDS = 600

const { values } = parseArgs({
  options: {
    zone: { type: 'string' },
    percent: { type: 'string' },
    seconds: { type: 'string' },
    static: { type: 'boolean', default: false },
    clear: { type: 'boolean', default: false },
    loop: { type: 'boolean', default: false },
    shell: { type: 'string' },
  },
})

if (values.zone !== undefined && !BODIES.includes(values.zone as Body)) {
  console.error(`unknown zone "${values.zone}"; one of: ${BODIES.join(', ')}`)
  process.exit(1)
}

const [entries, measured] = await Promise.all([readSysinfo(), memoryPercent()])
const percent = values.percent !== undefined ? Number(values.percent) : measured
// --zone wins; --percent alone picks by that fill; otherwise a body at random.
const zone =
  values.zone !== undefined ? zoneOfBody(values.zone as Body)
  : values.percent !== undefined ? zoneOf(percent)
  : zoneOfBody(BODIES[Math.floor(Math.random() * BODIES.length)]!)
const panel = renderPanel(zone, percent, entries, PANEL_WIDTH)

const columns = process.stdout.columns ?? 120
const layout = planLayout(columns, process.stdout.rows ?? 40, PANEL_WIDTH, panel.length)

function frame(t: number): string[] {
  return compose(layout, renderBody(zone.body, t, layout.scale, layout.fieldWidth), panel, PANEL_WIDTH, columns)
}

/** One write per frame: the kernel never interleaves a single tty write with the shell's. */
function write(text: string) {
  writeSync(1, text)
}

/** Synchronized output, so the terminal swaps the frame whole. */
function synchronized(text: string): string {
  return `\x1b[?2026h${text}\x1b[?2026l`
}

/** Runs `step` at `fps` until `seconds` pass or `isDone` says so. */
async function animate(fps: number, seconds: number, step: (t: number) => void, isDone = () => false) {
  const start = performance.now()
  while (performance.now() - start < seconds * 1000 && !isDone()) {
    step(((performance.now() - start) / 1000) * TICKS_PER_SECOND)
    await Bun.sleep(1000 / fps)
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

if (values.loop) {
  // Save the cursor wherever the shell left it, paint the block from row 1, put the cursor back.
  let isStopped = false
  process.on('SIGTERM', () => (isStopped = true))
  process.on('SIGHUP', () => (isStopped = true))
  const shell = values.shell !== undefined ? Number(values.shell) : undefined
  const isDone = () => isStopped || (shell !== undefined && !isAlive(shell))

  await animate(LOOP_FPS, Number(values.seconds ?? LOOP_SECONDS), t => {
    // Erase BEFORE painting: after a full-width line the cursor rests on the last column,
    // and an erase there would wipe the panel's right border.
    const lines = frame(t).map((line, i) => `\x1b[${i + 1};1H\x1b[2K${line}`)
    try {
      write(synchronized(`\x1b7${lines.join('')}\x1b8`))
    } catch {
      // The terminal is gone (window closed): nothing left to draw on.
      isStopped = true
    }
  }, isDone)
  process.exit(0)
}

let height = 0

function draw(t: number) {
  const lines = frame(t)
  const back = height > 0 ? `\x1b[${height}A\r` : ''
  write(synchronized(back + lines.map(line => `\x1b[2K${line}`).join('\n') + '\n'))
  height = lines.length
}

if (values.clear) write('\x1b[H\x1b[2J')

if (values.static || !process.stdout.isTTY) {
  draw(0)
} else {
  const finish = () => {
    write('\x1b[?25h')
    process.exit(0)
  }
  write('\x1b[?25l')
  process.on('SIGINT', finish)
  await animate(FPS, Number(values.seconds ?? 3), draw)
  finish()
}
