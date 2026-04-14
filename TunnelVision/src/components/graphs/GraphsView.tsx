import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { AppData, TBMRecord, XRFRecord, GroutRecord } from '../../types'
import { PARAMS, GROUT_PARAMS } from '../../data/params'
import { useStore } from '../../store/useStore'
import styles from './GraphsView.module.css'

// ── Series config ─────────────────────────────────────────────────────────────

type SeriesSource = 'tbm' | 'xrf' | 'grout'

const SERIES_COLORS = [
  '#00d4ff','#f97316','#22c55e','#a78bfa','#f43f5e',
  '#facc15','#34d399','#fb923c','#60a5fa','#e879f9',
]

interface SeriesCfg {
  id: string
  source: SeriesSource
  field: string
  label: string
  unit: string
  color: string
  visible: boolean
  axisIdx: number    // 0 = left, 1 = right
}

// All selectable fields per source
const SOURCE_FIELDS: Record<SeriesSource, { value: string; label: string; unit: string }[]> = {
  tbm: [
    { value: 'fpi',     label: 'FPI',           unit: 'kN/c' },
    { value: 'thrust',  label: 'Thrust',         unit: 'kN'   },
    { value: 'torque',  label: 'Torque',         unit: 'MNm'  },
    { value: 'rpm',     label: 'RPM',            unit: 'rpm'  },
    { value: 'pen_rev', label: 'Pen mm/rev',     unit: 'mm/r' },
    { value: 'pen_hr',  label: 'Pen m/h',        unit: 'm/h'  },
  ],
  xrf: [
    { value: 'S',     label: 'XRF S',    unit: '%'  },
    { value: 'U',     label: 'XRF U',    unit: '%'  },
    { value: 'NP_AP', label: 'XRF NP:AP', unit: '' },
    { value: 'Fe_S',  label: 'XRF Fe:S', unit: ''   },
    { value: 'Ca',    label: 'XRF Ca',   unit: '%'  },
    { value: 'Fe',    label: 'XRF Fe',   unit: '%'  },
    { value: 'Al',    label: 'XRF Al',   unit: '%'  },
    { value: 'K',     label: 'XRF K',    unit: '%'  },
    { value: 'Si',    label: 'XRF Si',   unit: '%'  },
    { value: 'Ti',    label: 'XRF Ti',   unit: '%'  },
    { value: 'Mg',    label: 'XRF Mg',   unit: '%'  },
  ],
  grout: [
    { value: 'inleakage', label: 'Inleakage',   unit: 'L/min' },
    { value: 'injVol',    label: 'Inj. volume',  unit: 'L'     },
    { value: 'cement',    label: 'Cement',        unit: 'kg'    },
    { value: 'drillM',    label: 'Drillmeters',   unit: 'm'     },
    { value: 'capacity',  label: 'Capacity',      unit: 'm/hr'  },
    { value: 'duration',  label: 'Duration',      unit: 'min'   },
    { value: 'packers',   label: 'Packers',       unit: ''      },
  ],
}

// ── Extract (ch, value) pairs from data ───────────────────────────────────────

function extractPoints(
  data: AppData, source: SeriesSource, field: string, chMin: number, chMax: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  if (source === 'tbm') {
    for (const r of data.tbm) {
      if (r.ch < chMin || r.ch > chMax) continue
      const v = (r as unknown as Record<string, number>)[field]
      if (v === undefined || isNaN(v)) continue
      pts.push([r.ch, v])
    }
  } else if (source === 'xrf') {
    for (const r of data.xrf) {
      if (r.ch < chMin || r.ch > chMax) continue
      const v = (r as unknown as Record<string, number>)[field]
      if (v === undefined || isNaN(v)) continue
      pts.push([r.ch, v])
    }
  } else {
    for (const r of data.grout) {
      if (r.ch < chMin || r.ch > chMax) continue
      const v = (r as unknown as Record<string, number>)[field]
      if (v === undefined || isNaN(v)) continue
      pts.push([r.ch, v])
    }
  }
  pts.sort((a, b) => a[0] - b[0])
  return pts
}

// ── Chart canvas renderer ─────────────────────────────────────────────────────

const PL = 68, PR = 68, PT = 36, PB = 48

function renderChart(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  allPts: Array<{ cfg: SeriesCfg; pts: Array<[number, number]> }>,
  viewCh: { min: number; max: number },
  crosshairCh: number | null,
  currentTbmCh: number | null,
) {
  const cw = w - PL - PR
  const ch = h - PT - PB

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117'
  ctx.fillRect(0, 0, w, h)

  if (!allPts.length) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text3').trim() || '#3a5068'
    ctx.font = '13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Add a series from the panel on the right', w / 2, h / 2)
    return
  }

  const chMin = viewCh.min, chMax = viewCh.max
  const chSpan = chMax - chMin || 1

  function cx(v: number) { return PL + ((v - chMin) / chSpan) * cw }

  // Build per-axis value ranges from visible series in view
  const axisRanges: Array<{ min: number; max: number }> = [
    { min: Infinity, max: -Infinity },
    { min: Infinity, max: -Infinity },
  ]
  for (const { cfg, pts } of allPts) {
    if (!cfg.visible) continue
    const inView = pts.filter(p => p[0] >= chMin && p[0] <= chMax)
    if (!inView.length) continue
    const vals = inView.map(p => p[1])
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const ax = axisRanges[cfg.axisIdx]
    ax.min = Math.min(ax.min, lo)
    ax.max = Math.max(ax.max, hi)
  }
  for (const ax of axisRanges) {
    if (!isFinite(ax.min)) { ax.min = 0; ax.max = 1 }
    if (ax.min === ax.max) { ax.min -= 1; ax.max += 1 }
    const pad = (ax.max - ax.min) * 0.08
    ax.min = Math.min(0, ax.min - pad)
    ax.max = ax.max + pad
  }

  function cy(v: number, axIdx: number) {
    const ax = axisRanges[axIdx]
    return PT + ch - ((v - ax.min) / (ax.max - ax.min)) * ch
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#1e2a38'
  ctx.lineWidth = 1
  const yTicks = 5
  for (let i = 0; i <= yTicks; i++) {
    const y = PT + (ch / yTicks) * i
    ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + cw, y); ctx.stroke()
  }

  // ── Current TBM position ──────────────────────────────────────────────────
  if (currentTbmCh !== null && currentTbmCh >= chMin && currentTbmCh <= chMax) {
    const x = cx(currentTbmCh)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.7
    ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + ch); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ef4444'
    ctx.font = '9px monospace'
    ctx.textAlign = x < PL + cw * 0.8 ? 'left' : 'right'
    ctx.fillText('TBM', x + (x < PL + cw * 0.8 ? 3 : -3), PT + 10)
  }

  // ── Series lines / bars ───────────────────────────────────────────────────
  for (const { cfg, pts } of allPts) {
    if (!cfg.visible || !pts.length) continue
    const isGrout = cfg.source === 'grout'

    ctx.strokeStyle = cfg.color
    ctx.fillStyle = cfg.color
    ctx.lineWidth = 1.5

    if (isGrout) {
      // Bar chart for grouting
      const barW = Math.max(2, cw / (pts.length + 1) * 0.6)
      for (const [chv, val] of pts) {
        if (chv < chMin || chv > chMax) continue
        const x = cx(chv)
        const yTop = cy(val, cfg.axisIdx)
        const yBot = cy(axisRanges[cfg.axisIdx].min, cfg.axisIdx)
        ctx.globalAlpha = 0.75
        ctx.fillRect(x - barW / 2, yTop, barW, yBot - yTop)
        ctx.globalAlpha = 1
      }
    } else {
      ctx.beginPath()
      let first = true
      for (const [chv, val] of pts) {
        const x = cx(chv), y = cy(val, cfg.axisIdx)
        first ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        first = false
      }
      ctx.stroke()
    }
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────
  if (crosshairCh !== null && crosshairCh >= chMin && crosshairCh <= chMax) {
    const x = cx(crosshairCh)
    ctx.strokeStyle = '#7090a8'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5
    ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + ch); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // Value readouts per series
    ctx.font = '10px monospace'
    let labelY = PT + 14
    for (const { cfg, pts } of allPts) {
      if (!cfg.visible || !pts.length) continue
      let closest: [number, number] | null = null, bd = Infinity
      for (const p of pts) { const d = Math.abs(p[0] - crosshairCh); if (d < bd) { bd = d; closest = p } }
      if (!closest || bd > chSpan * 0.05) continue
      ctx.fillStyle = cfg.color
      ctx.textAlign = x < PL + cw / 2 ? 'left' : 'right'
      ctx.fillText(
        `${cfg.label}: ${closest[1].toFixed(closest[1] < 10 ? 2 : 1)} ${cfg.unit}`,
        x + (x < PL + cw / 2 ? 6 : -6), labelY
      )
      labelY += 13
    }

    // Chainage label at bottom
    ctx.fillStyle = '#7090a8'
    ctx.textAlign = x < PL + cw / 2 ? 'left' : 'right'
    ctx.font = '10px monospace'
    ctx.fillText(`CH ${crosshairCh.toFixed(0)} m`, x + (x < PL + cw / 2 ? 4 : -4), PT + ch - 4)
  }

  // ── Axes ──────────────────────────────────────────────────────────────────
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border2').trim() || '#2a3a50'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PL, PT); ctx.lineTo(PL, PT + ch); ctx.lineTo(PL + cw, PT + ch)
  ctx.stroke()
  if (allPts.some(s => s.cfg.visible && s.cfg.axisIdx === 1)) {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border2').trim() || '#2a3a50'
    ctx.beginPath(); ctx.moveTo(PL + cw, PT); ctx.lineTo(PL + cw, PT + ch); ctx.stroke()
  }

  // Left y-axis ticks
  const leftSeries = allPts.filter(s => s.cfg.visible && s.cfg.axisIdx === 0)
  const leftColor = leftSeries[0]?.cfg.color ?? '#7090a8'
  ctx.fillStyle = leftColor; ctx.font = '10px monospace'; ctx.textAlign = 'right'
  for (let i = 0; i <= yTicks; i++) {
    const v = axisRanges[0].min + ((axisRanges[0].max - axisRanges[0].min) / yTicks) * (yTicks - i)
    const y = PT + (ch / yTicks) * i
    ctx.fillText(v.toFixed(Math.abs(v) < 10 ? 1 : 0), PL - 6, y + 4)
  }
  // Right y-axis ticks
  const rightSeries = allPts.filter(s => s.cfg.visible && s.cfg.axisIdx === 1)
  if (rightSeries.length) {
    const rightColor = rightSeries[0].cfg.color
    ctx.fillStyle = rightColor; ctx.textAlign = 'left'
    for (let i = 0; i <= yTicks; i++) {
      const v = axisRanges[1].min + ((axisRanges[1].max - axisRanges[1].min) / yTicks) * (yTicks - i)
      const y = PT + (ch / yTicks) * i
      ctx.fillText(v.toFixed(Math.abs(v) < 10 ? 1 : 0), PL + cw + 6, y + 4)
    }
  }

  // X-axis ticks
  const nTicks = Math.min(10, Math.max(4, Math.floor(cw / 70)))
  ctx.fillStyle = '#7090a8'; ctx.textAlign = 'center'; ctx.font = '10px monospace'
  for (let i = 0; i <= nTicks; i++) {
    const v = chMin + (chSpan / nTicks) * i
    const x = cx(v)
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border2').trim() || '#2a3a50'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, PT + ch); ctx.lineTo(x, PT + ch + 4); ctx.stroke()
    ctx.fillText(`${v.toFixed(0)} m`, x, PT + ch + 16)
  }

  // X-axis label
  ctx.fillStyle = '#4a6070'; ctx.textAlign = 'center'; ctx.font = '10px monospace'
  ctx.fillText('Chainage (m)', PL + cw / 2, PT + ch + 34)
}

// ── Component ─────────────────────────────────────────────────────────────────

let _uid = 0
function uid() { return String(++_uid) }

interface Props { data: AppData }

export function GraphsView({ data }: Props) {
  const currentTs  = useStore(s => s.currentTs)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)

  const [series, setSeries]     = useState<SeriesCfg[]>([])
  const [panelOpen, setPanelOpen] = useState(true)

  // Add-series form state
  const [addSource, setAddSource] = useState<SeriesSource>('tbm')
  const [addField,  setAddField]  = useState('fpi')
  const [addAxis,   setAddAxis]   = useState(0)

  // Chainage range view
  const fullChMin = data.chMin
  const fullChMax = data.chMax
  const viewRef   = useRef({ min: fullChMin, max: fullChMax })
  const dragRef   = useRef<{ x: number; min: number; max: number } | null>(null)
  const crosshairRef = useRef<number | null>(null)

  // Current TBM chainage
  const currentTbmCh = useMemo(() => {
    const vis = data.tbm.filter(t => t.ts <= currentTs)
    return vis.length ? vis[vis.length - 1].ch : null
  }, [data.tbm, currentTs])

  // Pre-compute all series points
  const allPts = useMemo(() =>
    series.map(cfg => ({
      cfg,
      pts: extractPoints(data, cfg.source, cfg.field, fullChMin - 50, fullChMax + 50),
    })),
    [series, data, fullChMin, fullChMax]
  )

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback((crosshair?: number | null) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width  * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const ch = crosshair !== undefined ? crosshair : crosshairRef.current
    renderChart(ctx, rect.width, rect.height, allPts, viewRef.current, ch, currentTbmCh)
  }, [allPts, currentTbmCh])

  useEffect(() => { draw() }, [draw])

  // Resize observer
  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [draw])

  // ── Chainage-to-pixel ──────────────────────────────────────────────────────
  function pxToCh(clientX: number): number {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const px = clientX - rect.left - PL
    const chartW = rect.width - PL - PR
    const v = viewRef.current
    return v.min + (Math.max(0, Math.min(chartW, px)) / chartW) * (v.max - v.min)
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function onMouseMove(e: React.MouseEvent) {
    const ch = pxToCh(e.clientX)
    crosshairRef.current = ch
    if (dragRef.current && canvasRef.current) {
      const chartW = canvasRef.current.getBoundingClientRect().width - PL - PR
      const span = dragRef.current.max - dragRef.current.min
      const dx = ((e.clientX - dragRef.current.x) / chartW) * span
      viewRef.current = {
        min: Math.max(fullChMin, dragRef.current.min - dx),
        max: Math.min(fullChMax, dragRef.current.max - dx),
      }
    }
    draw(ch)
  }
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, min: viewRef.current.min, max: viewRef.current.max }
  }
  function onMouseUp() { dragRef.current = null }
  function onMouseLeave() {
    dragRef.current = null; crosshairRef.current = null; draw(null)
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const v = viewRef.current
    const span = v.max - v.min
    const factor = e.deltaY > 0 ? 1.2 : 0.83
    const newSpan = Math.max(200, Math.min(fullChMax - fullChMin, span * factor))
    const mid = (v.min + v.max) / 2
    viewRef.current = {
      min: Math.max(fullChMin, mid - newSpan / 2),
      max: Math.min(fullChMax, mid + newSpan / 2),
    }
    draw(crosshairRef.current)
  }

  // ── Touch pan + pinch ─────────────────────────────────────────────────────
  useEffect(() => {
    const elRaw = canvasRef.current; if (!elRaw) return
    const el: HTMLCanvasElement = elRaw
    type TR = { x: number; min: number; max: number; dist: number }
    const touchRef = { current: null as TR | null }

    function tdist(e: TouchEvent) {
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
        min: v.min, max: v.max, dist: tdist(e),
      }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      const t = touchRef.current; if (!t) return
      const rect = el.getBoundingClientRect()
      const chartW = rect.width - PL - PR
      const span = t.max - t.min
      if (e.touches.length === 1) {
        const dx = ((e.touches[0].clientX - t.x) / chartW) * span
        viewRef.current = {
          min: Math.max(fullChMin, t.min - dx),
          max: Math.min(fullChMax, t.max - dx),
        }
      } else {
        const nd = tdist(e); if (!nd) return
        const factor = t.dist / nd
        const newSpan = Math.max(200, Math.min(fullChMax - fullChMin, span * factor))
        const mid = (t.min + t.max) / 2
        viewRef.current = {
          min: Math.max(fullChMin, mid - newSpan / 2),
          max: Math.min(fullChMax, mid + newSpan / 2),
        }
        touchRef.current = { ...t, dist: nd, min: viewRef.current.min, max: viewRef.current.max }
      }
      draw(null)
    }
    function onTouchEnd(e: TouchEvent) {
      e.preventDefault(); if (!e.touches.length) touchRef.current = null
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [draw, fullChMin, fullChMax])

  // ── Add / remove series ───────────────────────────────────────────────────
  function addSeries() {
    const fieldDefs = SOURCE_FIELDS[addSource]
    const fd = fieldDefs.find(f => f.value === addField) ?? fieldDefs[0]
    const color = SERIES_COLORS[series.length % SERIES_COLORS.length]
    setSeries(prev => [...prev, {
      id: uid(), source: addSource, field: fd.value,
      label: fd.label, unit: fd.unit,
      color, visible: true, axisIdx: addAxis,
    }])
  }
  function removeSeries(id: string) { setSeries(prev => prev.filter(s => s.id !== id)) }
  function toggleVisible(id: string) {
    setSeries(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
  }
  function updateColor(id: string, color: string) {
    setSeries(prev => prev.map(s => s.id === id ? { ...s, color } : s))
  }
  function moveAxis(id: string, axisIdx: number) {
    setSeries(prev => prev.map(s => s.id === id ? { ...s, axisIdx } : s))
  }

  const fieldOptions = SOURCE_FIELDS[addSource]

  return (
    <div className={styles.wrap}>
      {/* Chart area */}
      <div ref={wrapRef} className={styles.chartWrap}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onWheel={onWheel}
        />
        {/* Zoom controls */}
        <div className={styles.zoomBtns}>
          <button onClick={() => { const s=viewRef.current.max-viewRef.current.min, m=(viewRef.current.min+viewRef.current.max)/2; viewRef.current={min:Math.max(fullChMin,m-s*0.6),max:Math.min(fullChMax,m+s*0.6)}; draw(null) }}>+</button>
          <button onClick={() => { const s=viewRef.current.max-viewRef.current.min, m=(viewRef.current.min+viewRef.current.max)/2; viewRef.current={min:Math.max(fullChMin,m-s*0.85),max:Math.min(fullChMax,m+s*0.85)}; draw(null) }}>−</button>
          <button onClick={() => { viewRef.current={min:fullChMin,max:fullChMax}; draw(null) }}>⊡</button>
        </div>
        <div className={styles.hint}>scroll/pinch to zoom · drag to pan</div>
      </div>

      {/* Side panel */}
      <div className={`${styles.panel} ${panelOpen ? styles.panelOpen : styles.panelClosed}`}>
        <button className={styles.panelToggle} onClick={() => setPanelOpen(p => !p)}>
          {panelOpen ? '›' : '‹'}
        </button>

        {panelOpen && (
          <>
            <div className={styles.panelTitle}>SERIES</div>

            {/* Add series form */}
            <div className={styles.addForm}>
              <div className={styles.formRow}>
                <label className={styles.lbl}>Source</label>
                <select
                  className={styles.sel}
                  value={addSource}
                  onChange={e => { setAddSource(e.target.value as SeriesSource); setAddField(SOURCE_FIELDS[e.target.value as SeriesSource][0].value) }}
                >
                  <option value="tbm">TBM</option>
                  <option value="xrf">XRF</option>
                  <option value="grout">Grouting</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.lbl}>Field</label>
                <select className={styles.sel} value={addField} onChange={e => setAddField(e.target.value)}>
                  {fieldOptions.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.lbl}>Axis</label>
                <select className={styles.sel} value={addAxis} onChange={e => setAddAxis(Number(e.target.value))}>
                  <option value={0}>Left</option>
                  <option value={1}>Right</option>
                </select>
              </div>
              <button className={styles.addBtn} onClick={addSeries}>+ Add series</button>
            </div>

            {/* Series list */}
            <div className={styles.seriesList}>
              {series.length === 0 && (
                <div className={styles.empty}>No series added yet</div>
              )}
              {series.map(s => (
                <div key={s.id} className={styles.seriesItem}>
                  <div className={styles.seriesTop}>
                    <div
                      className={styles.colorSwatch}
                      style={{ background: s.color }}
                      title="Click to change color"
                    >
                      <input
                        type="color" value={s.color}
                        onChange={e => updateColor(s.id, e.target.value)}
                        className={styles.colorInput}
                      />
                    </div>
                    <span className={`${styles.seriesName} ${!s.visible ? styles.dimmed : ''}`}>
                      {s.label}
                      <span className={styles.seriesUnit}>{s.unit ? ` (${s.unit})` : ''}</span>
                    </span>
                    <div className={styles.seriesActions}>
                      <button
                        className={`${styles.axisBtn} ${s.axisIdx === 0 ? styles.axisBtnActive : ''}`}
                        onClick={() => moveAxis(s.id, 0)} title="Left axis">L</button>
                      <button
                        className={`${styles.axisBtn} ${s.axisIdx === 1 ? styles.axisBtnActive : ''}`}
                        onClick={() => moveAxis(s.id, 1)} title="Right axis">R</button>
                      <button
                        className={`${styles.visBtn} ${s.visible ? styles.visBtnOn : ''}`}
                        onClick={() => toggleVisible(s.id)}
                        title={s.visible ? 'Hide' : 'Show'}
                      >
                        {s.visible ? '●' : '○'}
                      </button>
                      <button className={styles.removeBtn} onClick={() => removeSeries(s.id)} title="Remove">×</button>
                    </div>
                  </div>
                  <div className={styles.seriesMeta}>{s.source.toUpperCase()} · {s.axisIdx === 0 ? 'Left axis' : 'Right axis'}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
