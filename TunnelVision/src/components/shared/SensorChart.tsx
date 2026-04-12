import React, { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store/useStore'
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
// Returns [[ts, distanceMetres], ...] aligned to the sensor timestamps
function buildDistSeries(
  sensorTs: number[],
  sensorLat: number, sensorLon: number,
  tbm: AppData['tbm'],
): Array<[number, number]> {
  if (!tbm.length) return []
  const result: Array<[number, number]> = []
  for (const ts of sensorTs) {
    // Find latest TBM record at or before this timestamp
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

// ── Chart drawing ─────────────────────────────────────────────────────────────
const ML = 62, MR = 72, MT = 28, MB = 52

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  valueSeries: Array<[number, number]>,
  distSeries: Array<[number, number]>,
  valueLabel: string,
  valueUnit: string,
  currentTs: number,
  viewTs: { min: number; max: number },
) {
  const cw = w - ML - MR
  const ch = h - MT - MB

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, w, h)

  if (!valueSeries.length) {
    ctx.fillStyle = '#7090a8'
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

  const dAll  = distSeries.map(p => p[1])
  const dMax  = Math.max(...dAll) * 1.1 || 1000

  const tsSpan = tsMax - tsMin || 1

  function cx(ts: number) { return ML + ((ts - tsMin) / tsSpan) * cw }
  function cy(v: number)  { return MT + ch - ((v - vMin) / (vMax - vMin)) * ch }
  function cyd(d: number) { return MT + ch - (d / dMax) * ch }

  // ── Grid ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1e2a38'
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

  // ── Current time vertical line ────────────────────────────────────────────
  if (currentTs >= tsMin && currentTs <= tsMax) {
    const x = cx(currentTs)
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + ch); ctx.stroke()
    ctx.setLineDash([])

    // Label current value
    let closestV: number | null = null, bestDt = Infinity
    for (const [ts, v] of valueSeries) {
      const dt = Math.abs(ts - currentTs)
      if (dt < bestDt) { bestDt = dt; closestV = v }
    }
    if (closestV !== null && x > ML + 30 && x < ML + cw - 30) {
      ctx.fillStyle = '#22c55e'
      ctx.font = '10px monospace'
      ctx.textAlign = x < ML + cw / 2 ? 'left' : 'right'
      ctx.fillText(`${closestV.toFixed(1)} ${valueUnit}`, x + (x < ML + cw / 2 ? 4 : -4), MT + 14)
    }
  }

  // ── Axes ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#2a3a50'
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
  ctx.fillStyle = '#7090a8'
  ctx.textAlign = 'center'
  ctx.font = '10px monospace'
  for (let i = 0; i <= nTicks; i++) {
    const ts = tsMin + (tsSpan / nTicks) * i
    const x  = cx(ts)
    ctx.strokeStyle = '#2a3a50'
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

const zoomBtnStyle: React.CSSProperties = {
  width: 24, height: 24, background: 'rgba(15,18,24,.9)', border: '1px solid #253040',
  borderRadius: 3, color: '#7090a8', cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { data: AppData }

export function SensorChart({ data }: Props) {
  const selectedSensor    = useStore(s => s.selectedSensor)
  const setSelectedSensor = useStore(s => s.setSelectedSensor)
  const currentTs         = useStore(s => s.currentTs)
  const canvasRef         = useRef<HTMLCanvasElement>(null)

  const sensor: ManometerSensor | PiezometerSensor | null = selectedSensor
    ? selectedSensor.type === 'manometer'
      ? data.manometers.find(m => m.id === selectedSensor.id) ?? null
      : data.piezometers.find(p => p.id === selectedSensor.id) ?? null
    : null

  const isMano = selectedSensor?.type === 'manometer'

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

  // Reset view when sensor changes
  useEffect(() => {
    viewRef.current = { min: fullTsMin, max: fullTsMax }
  }, [selectedSensor, fullTsMin, fullTsMax])

  // ── Draw ───────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    drawChart(ctx, rect.width, rect.height, valueSeries, distSeries, valueLabel, valueUnit, currentTs, viewRef.current)
  }, [valueSeries, distSeries, valueLabel, valueUnit, currentTs])

  useEffect(() => { draw() }, [draw])

  // ── Mouse wheel zoom ───────────────────────────────────────────────────────
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
    draw()
  }

  // ── Mouse drag pan ─────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, min: viewRef.current.min, max: viewRef.current.max }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current || !canvasRef.current) return
    const cw = canvasRef.current.getBoundingClientRect().width - ML - MR
    const span = dragRef.current.max - dragRef.current.min
    const dx = ((e.clientX - dragRef.current.x) / cw) * span
    const newMin = Math.max(fullTsMin, dragRef.current.min - dx)
    const newMax = Math.min(fullTsMax, dragRef.current.max - dx)
    viewRef.current = { min: newMin, max: newMax }
    draw()
  }
  function onMouseUp() { dragRef.current = null }

  // ── Touch pan + pinch zoom (non-passive) ──────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

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
      if (!t || !canvasRef.current) return
      const cw = canvasRef.current.getBoundingClientRect().width - ML - MR
      const span = t.max - t.min

      if (e.touches.length === 1) {
        const dx = ((e.touches[0].clientX - t.x) / cw) * span
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
      draw()
    }

    function onTouchEnd(e: TouchEvent) {
      e.preventDefault()
      if (e.touches.length === 0) touchRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [draw, fullTsMin, fullTsMax])

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

  // Distance to TBM at currentTs
  const currentDist = (() => {
    if (!distSeries.length) return null
    let best: [number, number] | null = null
    let bd = Infinity
    for (const [ts, d] of distSeries) {
      const dt = Math.abs(ts - currentTs)
      if (dt < bd) { bd = dt; best = [ts, d] }
    }
    return best ? best[1] : null
  })()

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
      }}
      onClick={e => { if (e.target === e.currentTarget) setSelectedSensor(null) }}
    >
      <div style={{
        background: '#0d1117', border: '1px solid #1e2a38',
        borderRadius: 6, padding: '16px 18px',
        width: 'min(760px, 94vw)', boxShadow: '0 8px 32px rgba(0,0,0,.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ color: '#00d4ff', fontFamily: 'var(--cond)', fontSize: 15, fontWeight: 600, letterSpacing: 1 }}>
              {title}
            </div>
            <div style={{ color: '#7090a8', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 2 }}>
              {subtitle}
            </div>
            <div style={{ color: '#22c55e', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 2 }}>
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
            onClick={() => setSelectedSensor(null)}
            style={{
              background: 'transparent', border: '1px solid #2a3a50',
              borderRadius: 3, color: '#7090a8', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, padding: '2px 8px',
              fontFamily: 'monospace',
            }}
          >×</button>
        </div>

        {/* Canvas chart */}
        <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 300, display: 'block', borderRadius: 3, cursor: 'grab' }}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            display: 'flex', gap: 4,
          }}>
            <button onClick={() => { const span = viewRef.current.max - viewRef.current.min; const mid = (viewRef.current.min + viewRef.current.max) / 2; viewRef.current = { min: Math.max(fullTsMin, mid - span * 0.6), max: Math.min(fullTsMax, mid + span * 0.6) }; draw() }}
              style={zoomBtnStyle}>+</button>
            <button onClick={() => { const span = viewRef.current.max - viewRef.current.min; const mid = (viewRef.current.min + viewRef.current.max) / 2; viewRef.current = { min: Math.max(fullTsMin, mid - span * 0.85), max: Math.min(fullTsMax, mid + span * 0.85) }; draw() }}
              style={zoomBtnStyle}>−</button>
            <button onClick={() => { viewRef.current = { min: fullTsMin, max: fullTsMax }; draw() }}
              style={zoomBtnStyle}>⊡</button>
          </div>
          <div style={{ position: 'absolute', bottom: 6, left: ML, fontSize: 9, fontFamily: 'monospace', color: '#3a5068', pointerEvents: 'none' }}>
            scroll/pinch to zoom · drag to pan
          </div>
        </div>
      </div>
    </div>
  )
}
