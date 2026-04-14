import { RAMP, FPI_RAMP, GROUT_RAMP } from '../data/params'
export { RAMP, FPI_RAMP }
import type { ChannelState, DiscreteClass } from '../types'

function h2r(h: string): [number, number, number] {
  h = h.replace('#', '')
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

export function lerpColor(c0: string, c1: string, f: number): string {
  const a = h2r(c0), b = h2r(c1)
  return `rgb(${Math.round(a[0]+f*(b[0]-a[0]))},${Math.round(a[1]+f*(b[1]-a[1]))},${Math.round(a[2]+f*(b[2]-a[2]))})`
}

function sampleRamp(ramp: [number, string][], t: number): string {
  t = Math.max(0, Math.min(1, t))
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i][0]) {
      const [t0, c0] = ramp[i-1], [t1, c1] = ramp[i]
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
      return lerpColor(c0, c1, f)
    }
  }
  return ramp[ramp.length-1][1]
}

function discreteColor(v: number, classes: DiscreteClass[]): string {
  for (const cls of classes) {
    if (v >= cls.from && v < cls.to) return cls.color
  }
  return classes[classes.length-1].color
}

export function valToColor(v: number, ch: ChannelState): string {
  if (ch.discrete && ch.classes?.length) return discreteColor(v, ch.classes)
  if (ch.param === 'fpi') {
    const t = Math.max(0, Math.min(1, v / 60))
    const ramp = ch.inverted ? [...FPI_RAMP].reverse() as [number,string][] : FPI_RAMP
    return sampleRamp(ramp, t)
  }
  let t = ch.scaleMax === ch.scaleMin ? 0
    : Math.max(0, Math.min(1, (v - ch.scaleMin) / (ch.scaleMax - ch.scaleMin)))
  if (ch.inverted) t = 1 - t
  return sampleRamp(RAMP, t)
}

export function rampCSS(ramp: [number, string][], inverted = false): string {
  const r = inverted ? [...ramp].reverse() : ramp
  return `linear-gradient(to right,${r.map(s => s[1]).join(',')})`
}

export function discreteRampCSS(classes: DiscreteClass[]): string {
  const w = 100 / classes.length
  const stops = classes.map((cls,i) => `${cls.color} ${i*w}%,${cls.color} ${(i+1)*w}%`).join(',')
  return `linear-gradient(to right,${stops})`
}

export function groutValToRGB(val: number, max: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, val / max))
  const color = sampleRamp(GROUT_RAMP, t)
  const m = color.match(/\d+/g)!
  return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])]
}

// White → light blue → blue → dark blue (matches map view grout coloring)
const GROUT_COLOR_STOPS: [number, [number, number, number]][] = [
  [0,   [255, 255, 255]],
  [5,   [173, 216, 230]],
  [50,  [30,  100, 220]],
  [200, [5,   10,  80 ]],
]
export function groutAttrColor(val: number): string {
  if (!val || val <= 0) return '#ffffff'
  const stops = GROUT_COLOR_STOPS
  if (val >= stops[stops.length - 1][0]) {
    const [r, g, b] = stops[stops.length - 1][1]
    return `rgb(${r},${g},${b})`
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i], [v1, c1] = stops[i + 1]
    if (val <= v1) {
      const t = (val - v0) / (v1 - v0)
      return `rgb(${Math.round(c0[0]+(c1[0]-c0[0])*t)},${Math.round(c0[1]+(c1[1]-c0[1])*t)},${Math.round(c0[2]+(c1[2]-c0[2])*t)})`
    }
  }
  return '#ffffff'
}
