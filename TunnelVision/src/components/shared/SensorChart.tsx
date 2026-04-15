import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { PiezAnnotation } from '../../store/useStore'
import { fmtDate } from '../../utils/format'
import type { AppData, ManometerSensor, PiezometerSensor } from '../../types'

// ── Haversine distance (metres) ───────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Build TBM distance series ─────────────────────────────────────────────────
function buildDistSeries(
  sensorTs: number[],
  sensorLat: number, sensorLon: number,
  tbm: AppData['tbm'],
): Array<[number, number]> {
  if (!tbm.length) return []
  const result: Array<[number, number]> = []
  for (const ts of sensorTs) {
    let tbmRec = tbm[0]
    for (const t of tbm) {
      if (t.ts <= ts) tbmRec = t
      else break
    }
    const dist = haversine(sensorLat, sensorLon, tbmRec.lat, tbmRec.lon)
    result.push([ts, dist])
  }
  return result
}

// ── TBM chainage at a given timestamp ─────────────────────────────────────────
function chainageAtTs(ts: number, tbm: AppData['tbm']): number | null {
  if (!tbm.length) return null
  let rec = tbm[0]
  for (const t of tbm) {
    if (t.ts <= ts) rec = t
    else break
  }
  return rec.ch
}

// ── Chart drawing ─────────────────────────────────────────────────────────────
const ML = 62, MR = 72, MT = 28, MB = 52

type AnnotMode = 'normal' | 'drop' | 'recovery' | null

const ANNOT_COLORS: Record<NonNullable<AnnotMode>, string> = {
  normal: '#e2e8f0',
  drop: '#f97316',
  recovery: '#22c55e',
}

interface ChartColors {
  bg: string; border: string; border2: string; text3: string; textMuted: string
}

function getChartColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement)
  return {
    bg:        cs.getPropertyValue('--bg2').trim()    || '#0d1117',
    border:    cs.getPropertyValue('--border').trim() || '#1e2a38',
    border2:   cs.getPropertyValue('--border2').trim()|| '#2a3a50',
    text3:     cs.getPropertyValue('--text3').trim()  || '#7090a8',
    textMuted: cs.getPropertyValue('--text3').trim()  || '#3a5068',
  }
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  valueSeries: Array<[number, number]>,
  distSeries: Array<[number, number]>,
  valueLabel: string,
  valueUnit: string,
  currentTs: number,
  viewTs: { min: number; max: number },
  colors: ChartColors,
  annotation?: Partial<PiezAnnotation>,
  hoverPt?: { ts: number; val: number; color: string } | null,
  crosshairTs?: number | null,
) {
  const cw = w - ML - MR
  const ch = h - MT - MB

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, w, h)

  if (!valueSeries.length) {
    ctx.fillStyle = colors.text3
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('No data available for this sensor', w / 2, h / 2)
    return
  }

  // ── Data ranges ────────────────────────────────────────────────────────────
  const tsMin = viewTs.min, tsMax = viewTs.max
  const vAll  = valueSeries.filter(p => p[0] >= tsMin && p[0] <= tsMax).map(p => p[1])
  const vMin  = Math.min(0, vAll.length ? Math.min(...vAll) : 0)
  const vMax  = (vAll.length ? Math.max(...vAll) : 1) * 1.1 || 1

  const dAll  = distSeries.filter(p => p[0] >= tsMin && p[0] <= tsMax).map(p => p[1])
  const dMax  = (dAll.length ? Math.max(...dAll) : 1000) * 1.1 || 1000

  const tsSpan = tsMax - tsMin || 1

  function cx(ts: number) { return ML + ((ts - tsMin) / tsSpan) * cw }
  function cy(v: number)  { return MT + ch - ((v - vMin) / (vMax - vMin)) * ch }
  function cyd(d: number) { return MT + ch - (d / dMax) * ch }

  // ── Grid ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  const yTicks = 5
  for (let i = 0; i <= yTicks; i++) {
    const y = MT + (ch / yTicks) * i
    ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + cw, y); ctx.stroke()
  }

  // ── Distance line (right axis, secondary) ─────────────────────────────────
  if (distSeries.length) {
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    distSeries.forEach(([ts, d], i) => {
      const x = cx(ts), y = cyd(d)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ── Value line (left axis, primary) ───────────────────────────────────────
  ctx.strokeStyle = '#00d4ff'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  valueSeries.forEach(([ts, v], i) => {
    const x = cx(ts), y = cy(v)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // ── Annotation vertical lines ─────────────────────────────────────────────
  const annotDefs: Array<{ key: keyof PiezAnnotation; valKey: keyof PiezAnnotation; color: string; label: string }> = [
    { key: 'normalTs',   valKey: 'normalVal',   color: 'var(--text)', label: 'Normal'   },
    { key: 'dropTs',     valKey: 'dropVal',     color: '#f97316', label: 'Drop'     },
    { key: 'recoveryTs', valKey: 'recoveryVal', color: '#22c55e', label: 'Recovery' },
  ]
  if (annotation) {
    for (const { key, valKey, color, label } of annotDefs) {
      const ts  = annotation[key]  as number | undefined
      const val = annotation[valKey] as number | undefined
      if (!ts) continue
      const x = cx(ts)
      if (x < ML - 2 || x > ML + cw + 2) continue
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.globalAlpha = 0.85
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + ch); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      ctx.fillStyle = color
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = x < ML + cw * 0.6 ? 'left' : 'right'
      ctx.fillText(label, x + (x < ML + cw * 0.6 ? 3 : -3), MT + 10)

      if (val !== undefined) {
        const y = cy(val)
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = colors.bg
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  // ── Hover preview dot ─────────────────────────────────────────────────────
  if (hoverPt) {
    const hx = cx(hoverPt.ts)
    const hy = cy(hoverPt.val)
    if (hx >= ML && hx <= ML + cw) {
      // Vertical hairline
      ctx.strokeStyle = hoverPt.color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      ctx.setLineDash([2, 3])
      ctx.beginPath(); ctx.moveTo(hx, MT); ctx.lineTo(hx, MT + ch); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      // Outer ring
      ctx.beginPath()
      ctx.arc(hx, hy, 7, 0, Math.PI * 2)
      ctx.strokeStyle = hoverPt.color
      ctx.lineWidth = 2
      ctx.stroke()
      // Inner fill
      ctx.beginPath()
      ctx.arc(hx, hy, 3, 0, Math.PI * 2)
      ctx.fillStyle = hoverPt.color
      ctx.fill()
      // Value label
      ctx.fillStyle = hoverPt.color
      ctx.font = '10px monospace'
      ctx.textAlign = hx < ML + cw / 2 ? 'left' : 'right'
      ctx.fillText(
        hoverPt.val.toFixed(1),
        hx + (hx < ML + cw / 2 ? 10 : -10),
        hy - 8,
      )
    }
  }

  // ── Current time vertical line ────────────────────────────────────────────
  if (currentTs >= tsMin && currentTs <= tsMax) {
    const x = cx(currentTs)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + ch); ctx.stroke()
    ctx.setLineDash([])

    if (x > ML + 10 && x < ML + cw - 10) {
      const d = new Date(currentTs * 1000)
      const dateLabel = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
      ctx.fillStyle = '#ef4444'
      ctx.font = '10px monospace'
      ctx.textAlign = x < ML + cw / 2 ? 'left' : 'right'
      ctx.fillText(dateLabel, x + (x < ML + cw / 2 ? 4 : -4), MT + 14)
    }
  }

  // ── Crosshair (mouse hover, no annotation mode) ───────────────────────────
  if (crosshairTs !== null && crosshairTs !== undefined) {
    const x = cx(crosshairTs)
    if (x >= ML && x <= ML + cw) {
      ctx.strokeStyle = colors.text3
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.6
      ctx.setLineDash([2, 3])
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + ch); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      const d = new Date(crosshairTs * 1000)
      const label = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
      ctx.fillStyle = colors.text3
      ctx.font = '10px monospace'
      ctx.textAlign = x < ML + cw / 2 ? 'left' : 'right'
      ctx.fillText(label, x + (x < ML + cw / 2 ? 4 : -4), MT + ch - 4)
    }
  }

  // ── Axes ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = colors.border2
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ML, MT); ctx.lineTo(ML, MT + ch); ctx.lineTo(ML + cw, MT + ch)
  ctx.stroke()

  // ── Y axis labels (left = value) ──────────────────────────────────────────
  ctx.fillStyle = '#00d4ff'
  ctx.font = '10px monospace'
  ctx.textAlign = 'right'
  for (let i = 0; i <= yTicks; i++) {
    const v = vMin + ((vMax - vMin) / yTicks) * (yTicks - i)
    const y = MT + (ch / yTicks) * i
    ctx.fillText(v.toFixed(v > 100 ? 0 : 1), ML - 6, y + 4)
  }
  ctx.save()
  ctx.translate(14, MT + ch / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillText(`${valueLabel} (${valueUnit})`, 0, 0)
  ctx.restore()

  // ── Y axis labels (right = distance) ──────────────────────────────────────
  if (distSeries.length) {
    ctx.fillStyle = '#f59e0b'
    ctx.textAlign = 'left'
    for (let i = 0; i <= yTicks; i++) {
      const d = (dMax / yTicks) * (yTicks - i)
      const y = MT + (ch / yTicks) * i
      ctx.fillText((d / 1000).toFixed(1), ML + cw + 6, y + 4)
    }
    ctx.save()
    ctx.translate(w - 12, MT + ch / 2)
    ctx.rotate(Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('Dist TBM (km)', 0, 0)
    ctx.restore()
  }

  // ── X axis ticks + labels ─────────────────────────────────────────────────
  const daySpan = tsSpan / 86400
  const nTicks = Math.min(8, Math.max(3, Math.floor(cw / 80)))
  ctx.fillStyle = colors.text3
  ctx.textAlign = 'center'
  ctx.font = '10px monospace'
  for (let i = 0; i <= nTicks; i++) {
    const ts = tsMin + (tsSpan / nTicks) * i
    const x  = cx(ts)
    ctx.strokeStyle = colors.border2
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, MT + ch); ctx.lineTo(x, MT + ch + 4); ctx.stroke()
    const d = new Date(ts * 1000)
    const label = daySpan > 60
      ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      : `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`
    ctx.fillText(label, x, MT + ch + 16)
  }

  // ── Legend ─────────────────────────────────────────────────────────────────
  const lx = ML + cw - 10
  ctx.textAlign = 'right'
  ctx.font = '10px monospace'
  ctx.fillStyle = '#00d4ff'
  ctx.fillText(`● ${valueLabel} (${valueUnit})`, lx, MT - 10)
  if (distSeries.length) {
    ctx.fillStyle = '#f59e0b'
    ctx.fillText('– – Dist TBM (km)', lx - 160, MT - 10)
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const zoomBtnStyle: React.CSSProperties = {
  width: 24, height: 24, background: 'var(--bg3)', border: '1px solid var(--border2)',
  borderRadius: 3, color: 'var(--text3)', cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
}

function annotBtnStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '4px 12px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
    borderRadius: 3, border: `1px solid ${active ? color : 'var(--border2)'}`,
    background: active ? color + '22' : 'var(--bg3)',
    color: active ? color : 'var(--text3)',
    letterSpacing: 0.5,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

function nearestValue(series: Array<[number, number]>, ts: number): [number, number] | null {
  let best: [number, number] | null = null
  let bd = Infinity
  for (const pt of series) {
    const dt = Math.abs(pt[0] - ts)
    if (dt < bd) { bd = dt; best = pt }
  }
  return best
}

function pxToTs(clientX: number, rect: DOMRect, viewTs: { min: number; max: number }): number {
  const px = clientX - rect.left - ML
  const chartW = rect.width - ML - MR
  return viewTs.min + (Math.max(0, Math.min(chartW, px)) / chartW) * (viewTs.max - viewTs.min)
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { data: AppData }

export function SensorChart({ data }: Props) {
  const selectedSensor      = useStore(s => s.selectedSensor)
  const setSelectedSensor   = useStore(s => s.setSelectedSensor)
  const currentTs           = useStore(s => s.currentTs)
  const piezAnnotations     = useStore(s => s.piezAnnotations)
  const setPiezAnnotation   = useStore(s => s.setPiezAnnotation)
  const clearPiezAnnotation = useStore(s => s.clearPiezAnnotation)
  const theme               = useStore(s => s.theme)
  const canvasRef           = useRef<HTMLCanvasElement>(null)
  const canvasWrapRef       = useRef<HTMLDivElement>(null)
  const winRef              = useRef<HTMLDivElement>(null)

  // ── Floating window position & drag ───────────────────────────────────────
  const [pos, setPos] = useState(() => ({
    x: Math.max(20, Math.round((window.innerWidth  - 680) / 2)),
    y: Math.max(20, Math.round((window.innerHeight - 460) / 2)),
  }))
  const dragState = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragState.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 200, dragState.current.startLeft + e.clientX - dragState.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 60,  dragState.current.startTop  + e.clientY - dragState.current.startY)),
      })
    }
    function onUp() { dragState.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const [annotMode, setAnnotMode] = useState<AnnotMode>(null)

  // Refs so touch/mouse handlers always see current values without stale closures
  const annotModeRef = useRef<AnnotMode>(null)
  annotModeRef.current = annotMode

  const hoverRef     = useRef<{ ts: number; val: number } | null>(null)
  const crosshairRef = useRef<number | null>(null)

  const sensor: ManometerSensor | PiezometerSensor | null = selectedSensor
    ? selectedSensor.type === 'manometer'
      ? data.manometers.find(m => m.id === selectedSensor.id) ?? null
      : data.piezometers.find(p => p.id === selectedSensor.id) ?? null
    : null

  const isMano = selectedSensor?.type === 'manometer'
  const isPiez = selectedSensor?.type === 'piezometer'

  const annotation: Partial<PiezAnnotation> | undefined =
    isPiez && sensor ? piezAnnotations[sensor.id] : undefined

  // ── Build series ───────────────────────────────────────────────────────────
  let valueSeries: Array<[number, number]> = []
  let valueLabel = '', valueUnit = ''
  if (sensor && isMano) {
    const m = sensor as ManometerSensor
    valueSeries = m.series.map(([ts, bar]) => [ts, bar])
    valueLabel = 'Pressure'; valueUnit = 'bar'
  } else if (sensor) {
    const p = sensor as PiezometerSensor
    valueSeries = p.series
    valueLabel = 'Pressure'; valueUnit = 'kPa'
  }

  const sensorTs = valueSeries.map(p => p[0])
  const distSeries = sensor
    ? buildDistSeries(sensorTs, sensor.lat, sensor.lon, data.tbm)
    : []

  // ── View state (time window) ───────────────────────────────────────────────
  const fullTsMin = valueSeries.length ? valueSeries[0][0] : 0
  const fullTsMax = valueSeries.length ? valueSeries[valueSeries.length - 1][0] : 1
  const viewRef   = useRef({ min: fullTsMin, max: fullTsMax })
  const dragRef   = useRef<{ x: number; min: number; max: number } | null>(null)
  const touchRef  = useRef<{ x: number; min: number; max: number; dist: number } | null>(null)
  // Also keep valueSeries accessible in touch handlers via ref
  const valueSeriesRef = useRef(valueSeries)
  valueSeriesRef.current = valueSeries

  // Reset view when sensor changes; clear annotation mode
  useEffect(() => {
    viewRef.current = { min: fullTsMin, max: fullTsMax }
    hoverRef.current = null
    crosshairRef.current = null
    setAnnotMode(null)
  }, [selectedSensor, fullTsMin, fullTsMax])

  // ── Draw ───────────────────────────────────────────────────────────────────
  const draw = useCallback((hover?: { ts: number; val: number; color: string } | null, crosshair?: number | null) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr  = window.devicePixelRatio || 1
    const wrap = canvasWrapRef.current
    const cssW = wrap ? wrap.clientWidth  : canvas.getBoundingClientRect().width
    const cssH = wrap ? wrap.clientHeight : canvas.getBoundingClientRect().height
    if (cssW < 10 || cssH < 10) return
    canvas.width  = cssW * dpr
    canvas.height = cssH * dpr
    ctx.scale(dpr, dpr)
    const mode = annotModeRef.current
    const hoverPt = hover !== undefined ? hover
      : (hoverRef.current && mode ? { ...hoverRef.current, color: ANNOT_COLORS[mode] } : null)
    const ch = crosshair !== undefined ? crosshair : crosshairRef.current
    drawChart(
      ctx, cssW, cssH,
      valueSeries, distSeries, valueLabel, valueUnit,
      currentTs, viewRef.current, getChartColors(), annotation, hoverPt, ch,
    )
  }, [valueSeries, distSeries, valueLabel, valueUnit, currentTs, annotation, theme])

  useEffect(() => { draw() }, [draw])

  // ── Place annotation at nearest point ─────────────────────────────────────
  function placeAnnotation(ts: number) {
    const mode = annotModeRef.current
    if (!mode || !sensor || isMano) return
    const pt = nearestValue(valueSeriesRef.current, ts)
    if (!pt) return
    if (mode === 'normal')   setPiezAnnotation(sensor.id, { normalTs: pt[0],   normalVal: pt[1] })
    if (mode === 'drop')     setPiezAnnotation(sensor.id, { dropTs: pt[0],     dropVal: pt[1] })
    if (mode === 'recovery') setPiezAnnotation(sensor.id, { recoveryTs: pt[0], recoveryVal: pt[1] })
    hoverRef.current = null
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function onMouseMove(e: React.MouseEvent) {
    const mode = annotModeRef.current
    if (mode) {
      // Hover preview — find nearest point and redraw
      if (!canvasRef.current || !valueSeriesRef.current.length) return
      const rect = canvasRef.current.getBoundingClientRect()
      const ts = pxToTs(e.clientX, rect, viewRef.current)
      const pt = nearestValue(valueSeriesRef.current, ts)
      if (pt) {
        hoverRef.current = { ts: pt[0], val: pt[1] }
        draw({ ts: pt[0], val: pt[1], color: ANNOT_COLORS[mode] })
      }
      return
    }
    // Crosshair when not dragging
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const ts = pxToTs(e.clientX, rect, viewRef.current)
    crosshairRef.current = ts

    // Pan drag
    if (dragRef.current) {
      const chartW = rect.width - ML - MR
      const span = dragRef.current.max - dragRef.current.min
      const dx = ((e.clientX - dragRef.current.x) / chartW) * span
      viewRef.current = {
        min: Math.max(fullTsMin, dragRef.current.min - dx),
        max: Math.min(fullTsMax, dragRef.current.max - dx),
      }
    }
    draw(null, ts)
  }

  function onMouseDown(e: React.MouseEvent) {
    if (annotModeRef.current) return
    dragRef.current = { x: e.clientX, min: viewRef.current.min, max: viewRef.current.max }
  }

  function onMouseUp() { dragRef.current = null }

  function onMouseLeave() {
    dragRef.current = null
    hoverRef.current = null
    crosshairRef.current = null
    draw(null, null)
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (!annotModeRef.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const ts = pxToTs(e.clientX, rect, viewRef.current)
    placeAnnotation(ts)
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const v = viewRef.current
    const span = v.max - v.min
    const factor = e.deltaY > 0 ? 1.2 : 0.83
    const newSpan = Math.max(86400 * 7, Math.min(fullTsMax - fullTsMin, span * factor))
    const mid = (v.min + v.max) / 2
    viewRef.current = {
      min: Math.max(fullTsMin, mid - newSpan / 2),
      max: Math.min(fullTsMax, mid + newSpan / 2),
    }
    draw(null)
  }

  // ── Touch pan + pinch zoom + annotation tap (non-passive) ─────────────────
  useEffect(() => {
    const elRaw = canvasRef.current
    if (!elRaw) return
    const el: HTMLCanvasElement = elRaw

    function touchDist(e: TouchEvent) {
      if (e.touches.length < 2) return 0
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      return Math.sqrt(dx*dx + dy*dy)
    }

    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      const v = viewRef.current
      touchRef.current = {
        x: e.touches.length === 1 ? e.touches[0].clientX : (e.touches[0].clientX + e.touches[1].clientX) / 2,
        min: v.min, max: v.max,
        dist: touchDist(e),
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      const t = touchRef.current
      if (!t) return
      const rect = el.getBoundingClientRect()
      const mode = annotModeRef.current

      if (mode && e.touches.length === 1) {
        // Annotation preview — show hover dot as finger slides
        const ts = pxToTs(e.touches[0].clientX, rect, viewRef.current)
        const pt = nearestValue(valueSeriesRef.current, ts)
        if (pt) {
          hoverRef.current = { ts: pt[0], val: pt[1] }
          // Inline draw with hover to avoid dependency issues
          const canvas = canvasRef.current; if (!canvas) return
          const ctx = canvas.getContext('2d'); if (!ctx) return
          const dpr = window.devicePixelRatio || 1
          const wrap2 = canvasWrapRef.current
          const iW = wrap2 ? wrap2.clientWidth  : rect.width
          const iH = wrap2 ? wrap2.clientHeight : rect.height
          canvas.width  = iW * dpr
          canvas.height = iH * dpr
          ctx.scale(dpr, dpr)
          drawChart(
            ctx, iW, iH,
            valueSeriesRef.current, distSeries, valueLabel, valueUnit,
            currentTs, viewRef.current, getChartColors(), annotation,
            { ts: pt[0], val: pt[1], color: ANNOT_COLORS[mode] },
          )
        }
        return
      }

      const chartW = rect.width - ML - MR
      const span = t.max - t.min

      if (e.touches.length === 1) {
        const dx = ((e.touches[0].clientX - t.x) / chartW) * span
        viewRef.current = {
          min: Math.max(fullTsMin, t.min - dx),
          max: Math.min(fullTsMax, t.max - dx),
        }
      } else {
        const newDist = touchDist(e)
        if (t.dist === 0 || newDist === 0) return
        const factor = t.dist / newDist
        const newSpan = Math.max(86400 * 7, Math.min(fullTsMax - fullTsMin, span * factor))
        const mid = (t.min + t.max) / 2
        viewRef.current = {
          min: Math.max(fullTsMin, mid - newSpan / 2),
          max: Math.min(fullTsMax, mid + newSpan / 2),
        }
        touchRef.current = { ...t, dist: newDist, min: viewRef.current.min, max: viewRef.current.max }
      }

      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d'); if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const wrap3 = canvasWrapRef.current
      const tW = wrap3 ? wrap3.clientWidth  : rect.width
      const tH = wrap3 ? wrap3.clientHeight : rect.height
      canvas.width  = tW * dpr
      canvas.height = tH * dpr
      ctx.scale(dpr, dpr)
      drawChart(
        ctx, tW, tH,
        valueSeriesRef.current, distSeries, valueLabel, valueUnit,
        currentTs, viewRef.current, getChartColors(), annotation, null,
      )
    }

    function onTouchEnd(e: TouchEvent) {
      e.preventDefault()
      const mode = annotModeRef.current
      if (mode && e.changedTouches.length > 0 && e.touches.length === 0) {
        // Finger lifted — place annotation at hover position
        const rect = el.getBoundingClientRect()
        const ts = pxToTs(e.changedTouches[0].clientX, rect, viewRef.current)
        placeAnnotation(ts)
      }
      if (e.touches.length === 0) {
        touchRef.current = null
        hoverRef.current = null
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distSeries, valueLabel, valueUnit, currentTs, annotation, fullTsMin, fullTsMax])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedSensor(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setSelectedSensor])

  if (!selectedSensor) return null

  const title = sensor
    ? isMano
      ? `${(sensor as ManometerSensor).name} (CH ${(sensor as ManometerSensor).ch.toFixed(0)}m)`
      : `PZ ${sensor.id}${(sensor as PiezometerSensor).sensorName ? ' — ' + (sensor as PiezometerSensor).sensorName : ''}`
    : selectedSensor.id

  const subtitle = sensor
    ? isMano
      ? `Manometer · ${(sensor as ManometerSensor).elev.toFixed(1)} m a.s.l.`
      : `${(sensor as PiezometerSensor).method} · ${(sensor as PiezometerSensor).soilClass} · depth ${(sensor as PiezometerSensor).depth}m`
    : ''

  const currentDateLabel = fmtDate(currentTs)

  const currentDist = (() => {
    if (!distSeries.length) return null
    let best: [number, number] | null = null, bd = Infinity
    for (const [ts, d] of distSeries) {
      const dt = Math.abs(ts - currentTs)
      if (dt < bd) { bd = dt; best = [ts, d] }
    }
    return best ? best[1] : null
  })()

  // ── Annotation summary data ────────────────────────────────────────────────
  const hasAnnot = annotation && (annotation.normalTs || annotation.dropTs || annotation.recoveryTs)
  const affectedPeriod = annotation?.dropTs && annotation?.recoveryTs
    ? annotation.recoveryTs - annotation.dropTs : null

  const dropCh     = annotation?.dropTs     ? chainageAtTs(annotation.dropTs,     data.tbm) : null
  const recoveryCh = annotation?.recoveryTs ? chainageAtTs(annotation.recoveryTs, data.tbm) : null
  const affectedStretch = dropCh !== null && recoveryCh !== null ? recoveryCh - dropCh : null

  // Observe canvas wrapper size and redraw on resize
  useEffect(() => {
    const el = canvasWrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(el)
    return () => ro.disconnect()
  }, [draw])

  const canvasStyle: React.CSSProperties = {
    width: '100%', height: '100%', display: 'block', borderRadius: 3,
    cursor: annotMode ? 'crosshair' : 'grab',
  }

  return (
    <div
      ref={winRef}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        width: 680, minWidth: 340, minHeight: 280,
        zIndex: 3000,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,.7)',
        display: 'flex', flexDirection: 'column',
        resize: 'both', overflow: 'auto',
      }}
    >
      {/* ── Drag handle / title bar ── */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '10px 14px 8px', flexShrink: 0,
          cursor: 'move', userSelect: 'none',
          borderBottom: '1px solid var(--border)',
        }}
        onMouseDown={e => {
          e.preventDefault()
          dragState.current = { startX: e.clientX, startY: e.clientY, startLeft: pos.x, startTop: pos.y }
        }}
      >
        <div>
          <div style={{ color: '#00d4ff', fontFamily: 'var(--cond)', fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
            {title}
          </div>
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 2 }}>
            {subtitle}
          </div>
          <div style={{ color: '#ef4444', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 2 }}>
            ▌ {currentDateLabel}
            {currentDist !== null && (
              <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                ⟷ {currentDist < 1000
                  ? `${Math.round(currentDist)} m to TBM`
                  : `${(currentDist / 1000).toFixed(1)} km to TBM`}
              </span>
            )}
          </div>
        </div>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setSelectedSensor(null)}
          style={{
            background: 'transparent', border: '1px solid var(--border2)',
            borderRadius: 3, color: 'var(--text3)', cursor: 'pointer',
            fontSize: 16, lineHeight: 1, padding: '2px 8px', fontFamily: 'monospace', flexShrink: 0,
          }}
        >×</button>
      </div>

      {/* ── Canvas area — fills remaining space ── */}
      <div ref={canvasWrapRef} style={{ flex: 1, position: 'relative', minHeight: 160, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={canvasStyle}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onClick={onCanvasClick}
        />
        <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
          <button onClick={() => { const s = viewRef.current.max - viewRef.current.min; const m = (viewRef.current.min + viewRef.current.max) / 2; viewRef.current = { min: Math.max(fullTsMin, m - s * 0.6), max: Math.min(fullTsMax, m + s * 0.6) }; draw(null) }} style={zoomBtnStyle}>+</button>
          <button onClick={() => { const s = viewRef.current.max - viewRef.current.min; const m = (viewRef.current.min + viewRef.current.max) / 2; viewRef.current = { min: Math.max(fullTsMin, m - s * 0.85), max: Math.min(fullTsMax, m + s * 0.85) }; draw(null) }} style={zoomBtnStyle}>−</button>
          <button onClick={() => { viewRef.current = { min: fullTsMin, max: fullTsMax }; draw(null) }} style={zoomBtnStyle}>⊡</button>
        </div>
        <div style={{ position: 'absolute', bottom: 6, left: ML, fontSize: 9, fontFamily: 'monospace', color: 'var(--text3)', opacity: 0.6, pointerEvents: 'none' }}>
          {annotMode ? 'hover to preview · click/tap to place' : 'scroll/pinch to zoom · drag to pan'}
        </div>
      </div>

      {/* ── Bottom content (annotations, table) — scrollable ── */}
      <div style={{ flexShrink: 0, padding: '0 14px 12px', overflowY: 'auto', maxHeight: 260 }}>

        {/* Annotation toolbar — piezometers only */}
        {isPiez && (
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
            marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
          }}>
            <span style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: 10, marginRight: 2 }}>MARK:</span>
            <button style={annotBtnStyle(annotMode === 'normal',   '#e2e8f0')} onClick={() => setAnnotMode(m => m === 'normal'   ? null : 'normal')}>⊕ Normal</button>
            <button style={annotBtnStyle(annotMode === 'drop',     '#f97316')} onClick={() => setAnnotMode(m => m === 'drop'     ? null : 'drop')}>⊕ Start drop</button>
            <button style={annotBtnStyle(annotMode === 'recovery', '#22c55e')} onClick={() => setAnnotMode(m => m === 'recovery' ? null : 'recovery')}>⊕ Recovery</button>
            {hasAnnot && (
              <button style={{ ...annotBtnStyle(false, '#ef4444'), marginLeft: 'auto' }}
                onClick={() => { if (sensor) clearPiezAnnotation(sensor.id) }}>✕ Clear</button>
            )}
          </div>
        )}

        {/* Annotation summary table */}
        {isPiez && hasAnnot && (
          <div style={{
            marginTop: 10, fontFamily: 'monospace', fontSize: 11,
            border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  <th style={{ padding: '5px 10px', color: 'var(--text3)', fontWeight: 400, textAlign: 'left',  fontSize: 10 }}>Marker</th>
                  <th style={{ padding: '5px 10px', color: 'var(--text3)', fontWeight: 400, textAlign: 'left',  fontSize: 10 }}>Date</th>
                  <th style={{ padding: '5px 10px', color: 'var(--text3)', fontWeight: 400, textAlign: 'right', fontSize: 10 }}>Chainage (m)</th>
                  <th style={{ padding: '5px 10px', color: 'var(--text3)', fontWeight: 400, textAlign: 'right', fontSize: 10 }}>Pressure (kPa)</th>
                </tr>
              </thead>
              <tbody>
                {annotation?.normalTs && (
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 10px', color: 'var(--text)' }}>Normal</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{fmtDate(annotation.normalTs)}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text)', textAlign: 'right' }}>
                      {chainageAtTs(annotation.normalTs, data.tbm)?.toFixed(0) ?? '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--text)', textAlign: 'right' }}>{annotation.normalVal?.toFixed(1)}</td>
                  </tr>
                )}
                {annotation?.dropTs && (
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 10px', color: '#f97316' }}>Start drop</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{fmtDate(annotation.dropTs)}</td>
                    <td style={{ padding: '5px 10px', color: '#f97316', textAlign: 'right' }}>
                      {dropCh?.toFixed(0) ?? '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: '#f97316', textAlign: 'right' }}>{annotation.dropVal?.toFixed(1)}</td>
                  </tr>
                )}
                {annotation?.recoveryTs && (
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 10px', color: '#22c55e' }}>Start recovery</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{fmtDate(annotation.recoveryTs)}</td>
                    <td style={{ padding: '5px 10px', color: '#22c55e', textAlign: 'right' }}>
                      {recoveryCh?.toFixed(0) ?? '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: '#22c55e', textAlign: 'right' }}>{annotation.recoveryVal?.toFixed(1)}</td>
                  </tr>
                )}
                {(affectedPeriod !== null || affectedStretch !== null) && (
                  <tr style={{ borderTop: '1px solid var(--border2)', background: 'var(--bg3)' }}>
                    <td style={{ padding: '5px 10px', color: '#f59e0b' }}>Affected</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>
                      {affectedPeriod !== null ? fmtDuration(affectedPeriod) : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: '#f59e0b', textAlign: 'right' }}>
                      {affectedStretch !== null ? `${affectedStretch.toFixed(0)} m` : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--text3)', textAlign: 'right' }}>
                      {annotation?.dropVal !== undefined && annotation?.recoveryVal !== undefined
                        ? `Δ ${(annotation.dropVal - annotation.recoveryVal).toFixed(1)}`
                        : '—'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
