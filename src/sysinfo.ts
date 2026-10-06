// System info from fastfetch in pipe mode ("Key: value" per line), plus the
// memory fill read straight from /proc, which picks the zone.

export type Entry = { key: string; value: string }

const MODULES = [
  'OS', 'Host', 'Kernel', 'Uptime', 'Packages', 'Shell', 'Display', 'CPU', 'GPU',
  'Memory', 'Swap', 'Disk', 'WM', 'WMTheme', 'Cursor', 'Terminal', 'TerminalFont', 'LocalIp',
]

/** fastfetch's long keys, shortened to fit the panel's key column. */
const SHORT_KEYS: Record<string, string> = {
  'Window Manager': 'WM',
  'WM Theme': 'Theme',
  'Terminal Font': 'Font',
  'Local IP': 'IP',
}

export async function readSysinfo(): Promise<Entry[]> {
  const process = Bun.spawn(['fastfetch', '-c', 'none', '--pipe', '-l', 'none', '-s', MODULES.join(':')], {
    stdout: 'pipe',
    stderr: 'ignore',
  })
  const text = await new Response(process.stdout).text()

  return text
    .split('\n')
    .map(line => line.match(/^([^:]+):\s(.*)$/))
    .filter(match => match !== null)
    .map(([, rawKey, value]) => {
      // "Display (LU28R55)" → "Display"; the parenthesis is detail the value already carries.
      const key = rawKey!.replace(/\s*\(.*\)$/, '')

      // "[External]" and "- ext4" are fastfetch's footnotes; they only force a wrap.
      const clean = value!.replace(/\s*\[[^\]]*\]/g, '').replace(/\s+-\s+\w+$/, '').trim()

      return { key: SHORT_KEYS[key] ?? key, value: clean }
    })
}

/** Used memory as a whole percentage, the same reading fastfetch reports. */
export async function memoryPercent(): Promise<number> {
  const meminfo = await Bun.file('/proc/meminfo').text()
  const read = (name: string) => Number(meminfo.match(new RegExp(`^${name}:\\s+(\\d+)`, 'm'))?.[1] ?? 0)
  const total = read('MemTotal')

  return total > 0 ? Math.round(((total - read('MemAvailable')) / total) * 100) : 0
}
