/** Which celestial body draws a zone. */
export type Body = 'sun' | 'rocky' | 'gas' | 'ice' | 'comet' | 'hole'

/** A region of the map: where a given fill (memory, here) sits, from the Sun outward. */
export type Zone = {
  body: Body
  name: string
  region: string
  color: number
}

/** Same map as the token-space mod; each zone holds the fills below `below`. */
const ZONES: readonly (Zone & { below: number })[] = [
  { below: 15, body: 'sun', name: 'Solar Core', region: 'The Sun', color: 0xffe600 },
  { below: 30, body: 'rocky', name: 'Inner Planets', region: 'Mercury-Mars', color: 0xff8c00 },
  { below: 50, body: 'gas', name: 'Gas Giants', region: 'Jupiter-Saturn', color: 0xffbf00 },
  { below: 70, body: 'ice', name: 'Ice Giants', region: 'Uranus-Neptune', color: 0x2f6bff },
  { below: 90, body: 'comet', name: 'Kuiper Belt', region: 'Deep Space', color: 0xff00ff },
  { below: Infinity, body: 'hole', name: 'Black Hole', region: 'Event Horizon', color: 0xff1e1e },
]

export const BODIES: readonly Body[] = ZONES.map(zone => zone.body)

export function zoneOf(percent: number): Zone {
  return ZONES.find(zone => percent < zone.below) ?? ZONES[ZONES.length - 1]!
}

export function zoneOfBody(body: Body): Zone {
  return ZONES.find(zone => zone.body === body)!
}
