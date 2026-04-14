import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../../store/useStore'
import { formatCH } from '../../utils/format'
import { valToColor, groutValToRGB } from '../../utils/color'
import { PARAMS } from '../../data/params'
import type { AppData, ProfParam } from '../../types'
import styles from './ProfileView.module.css'

const GROUT_MAX = 160

const PROF_PARAMS: Record<ProfParam, { label: string; color: string; field: string; unit: string; max: number }> = {
  fpi:    { label:'FPI',          color:'#f59e0b', field:'fpi',    unit:'kN/c', max:77 },
  thrust: { label:'Thrust',       color:'#f97316', field:'thrust', unit:'kN',   max:14290 },
  torque: { label:'Torque',       color:'#a855f7', field:'torque', unit:'MNm',  max:3.02 },
  pen_hr: { label:'Pen m/h',      color:'#22c55e', field:'pen_hr', unit:'m/h',  max:6.8 },
}

interface Props { data: AppData | null }

export function ProfileView({ data }: Props) {
  const profParam        = useStore(s => s.profParam)
  const setProfParam     = useStore(s => s.setProfParam)
  const profLayers       = useStore(s => s.profLayers)
  const toggleProfLayer  = useStore(s => s.toggleProfLayer)
  const currentTs        = useStore(s => s.currentTs)
  const channels         = useStore(s => s.channels)
  const zoomToTBMTick    = useStore(s => s.zoomToTBMTick)

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const viewRef    = useRef({ chMin: 0, chMax: 11092, eMin: -60, eMax: 120 })
  const isDragging = useRef(false)
  const dragStart  = useRef({ x: 0, chMin: 0, chMax: 0 })

  const [vExag, setVExag] = useState(1)

  // ── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback((vExagOverride?: number) => {
    const ve = vExagOverride ?? vExag
    const canvas = canvasRef.current
    if (!canvas || !data?.profile.length) return
    const wrap = wrapRef.current!
    canvas.width  = wrap.clientWidth
    canvas.height = wrap.clientHeight
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    if (W < 10 || H < 10) return

    const PL=64, PR=24, PT=32, PB=44
    const PW=W-PL-PR, PH=H-PT-PB
    const { chMin, chMax, eMin, eMax } = viewRef.current

    const pts = data.profile.filter(p => p.ch >= chMin-50 && p.ch <= chMax+50)
    if (!pts.length) return

    const scaleH = PW / (chMax - chMin)           // horizontal fills width
    const scaleV = scaleH * ve                     // vertical = horizontal × exaggeration
    const usedH  = (eMax - eMin) * scaleV
    const offY   = (PH - usedH) / 2
    const cx = (ch: number) => PL + (ch - chMin) * scaleH
    const cy = (el: number) => PT + offY + (eMax - el) * scaleV

    // Background
    ctx.fillStyle = '#080a0e'
    ctx.fillRect(0, 0, W, H)

    // Underground fill
    ctx.fillStyle = '#0d1117'
    ctx.beginPath()
    pts.forEach((p, i) => i===0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    ctx.lineTo(cx(pts[pts.length-1].ch), PT+PH)
    ctx.lineTo(cx(pts[0].ch), PT+PH)
    ctx.closePath(); ctx.fill()

    // Grid
    ctx.strokeStyle = '#151c28'; ctx.lineWidth = 0.8
    const eStep = (eMax-eMin) > 150 ? 50 : 25
    for (let e = Math.ceil(eMin/eStep)*eStep; e <= eMax; e += eStep) {
      const y = cy(e); if (y < PT || y > PT+PH) continue
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL+PW, y); ctx.stroke()
      ctx.fillStyle = '#3a4a5a'; ctx.font = '9px Share Tech Mono'; ctx.textAlign = 'right'
      ctx.fillText(e+'m', PL-4, y+3)
    }
    const span = chMax - chMin
    const chStep = span>8000?2000 : span>4000?1000 : span>2000?500 : 200
    for (let ch = Math.ceil(chMin/chStep)*chStep; ch <= chMax; ch += chStep) {
      const x = cx(ch); if (x < PL || x > PL+PW) continue
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT+PH); ctx.stroke()
      ctx.fillStyle = '#3a4a5a'; ctx.font = '9px Share Tech Mono'; ctx.textAlign = 'center'
      ctx.fillText(formatCH(ch), x, PT+PH+14)
    }

    // Sea level
    if (cy(0) > PT && cy(0) < PT+PH) {
      ctx.strokeStyle = 'rgba(30,80,180,0.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([6,4])
      ctx.beginPath(); ctx.moveTo(PL, cy(0)); ctx.lineTo(PL+PW, cy(0)); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = 'rgba(30,80,180,0.45)'; ctx.font = '8px Share Tech Mono'; ctx.textAlign = 'left'
      ctx.fillText('0m', PL+3, cy(0)-3)
    }
    ctx.setLineDash([])

    // Soil layer
    if (profLayers.soil) {
      ctx.fillStyle = 'rgba(160,120,70,0.30)'
      ctx.beginPath()
      pts.forEach((p,i) => i===0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
      for (let i = pts.length-1; i >= 0; i--) {
        const sb = pts[i].soilBaseElev != null ? Math.min(pts[i].soilBaseElev, pts[i].surfaceElev) : pts[i].surfaceElev
        ctx.lineTo(cx(pts[i].ch), cy(sb))
      }
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(140,100,50,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([4,3])
      ctx.beginPath()
      pts.forEach((p,i) => {
        const sb = p.soilBaseElev != null ? Math.min(p.soilBaseElev, p.surfaceElev) : p.surfaceElev
        i===0 ? ctx.moveTo(cx(p.ch), cy(sb)) : ctx.lineTo(cx(p.ch), cy(sb))
      })
      ctx.stroke(); ctx.setLineDash([])
    }

    // Rock layer
    if (profLayers.rock) {
      const ROCK_BOT = -10
      ctx.fillStyle = 'rgba(90,110,140,0.28)'
      ctx.beginPath()
      pts.forEach((p,i) => {
        const sb = p.soilBaseElev != null ? Math.min(p.soilBaseElev, p.surfaceElev) : p.surfaceElev
        i===0 ? ctx.moveTo(cx(p.ch), cy(sb)) : ctx.lineTo(cx(p.ch), cy(sb))
      })
      for (let i = pts.length-1; i >= 0; i--) ctx.lineTo(cx(pts[i].ch), cy(ROCK_BOT))
      ctx.closePath(); ctx.fill()
    }

    // Surface line
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.8; ctx.setLineDash([])
    ctx.beginPath()
    pts.forEach((p,i) => i===0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    ctx.stroke()

    // Grout screens
    if (profLayers.grout) {
      const vg = data.grout.filter(g => g.ts <= currentTs && g.ch >= chMin-50 && g.ch <= chMax+50)
      for (const g of vg) {
        let tunEl: number | null = null
        for (const p of data.profile) { if (p.ch >= g.ch) { tunEl = p.tunnelElev; break } }
        if (tunEl === null) continue
        const x0 = cx(g.ch - 6), x1 = cx(g.ch - 6 + g.screenLen)
        const sHW = 3.54, eHW = 3.54 + g.screenLen * Math.tan(8 * Math.PI / 180)
        const [r, gr, b] = groutValToRGB(g.inleakage, GROUT_MAX)
        ctx.fillStyle = `rgba(${r},${gr},${b},0.5)`; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.4
        ctx.beginPath()
        ctx.moveTo(x0, cy(tunEl+sHW)); ctx.lineTo(x1, cy(tunEl+eHW))
        ctx.lineTo(x1, cy(tunEl-eHW)); ctx.lineTo(x0, cy(tunEl-sHW))
        ctx.closePath(); ctx.fill(); ctx.stroke()
      }
    }

    // TBM coloured band
    const visTBM = data.tbm.filter(t => t.ts <= currentTs && t.ch >= chMin-50 && t.ch <= chMax+50)
    const pcfg = PROF_PARAMS[profParam]
    const paramDef = PARAMS[profParam]
    const chState = channels.right  // use right channel state for coloring
    if (visTBM.length > 1) {
      for (let i = 0; i < visTBM.length - 1; i++) {
        const t = visTBM[i]
        const val = (t as unknown as Record<string,number>)[pcfg.field]
        if (!val || val <= 0) continue
        const color = valToColor(val, chState)
        const tEl = t.lat  // tunnel elev from profile
        let tunEl: number | null = null
        for (const p of data.profile) { if (p.ch >= t.ch) { tunEl = p.tunnelElev; break } }
        if (tunEl === null) continue
        const r = 3.54
        const x0 = cx(t.ch), x1 = cx(visTBM[i+1].ch)
        ctx.fillStyle = color
        ctx.fillRect(x0, cy(tunEl+r), x1-x0, cy(tunEl-r)-cy(tunEl+r))
      }
    }

    // Manometers — only those behind the TBM at currentTs
    if (profLayers.mano) {
      const visTbm = data.tbm.filter(t => t.ts <= currentTs)
      const tbmCh  = visTbm.length ? visTbm[visTbm.length - 1].ch : -Infinity
      for (const m of data.manometers) {
        if (m.ch > tbmCh) continue                          // ahead of TBM
        if (m.ch < chMin - 50 || m.ch > chMax + 50) continue
        const recent = m.series.filter(s => s[0] <= currentTs).at(-1)
        if (!recent) continue
        const pressure = recent[1]                           // bar
        const rawPElev = m.elev + pressure * 10.2           // 1 bar ≈ 10.2 m water column
        // Clamp to surface elevation at this chainage
        let surfaceElev = rawPElev
        for (const p of data.profile) {
          if (p.ch >= m.ch) { surfaceElev = p.surfaceElev; break }
        }
        const pElev = Math.min(rawPElev, surfaceElev)
        const x = cx(m.ch)
        ctx.beginPath()
        ctx.arc(x, cy(pElev), 4, 0, Math.PI * 2)
        ctx.fillStyle = '#60a5fa'
        ctx.fill()
        ctx.strokeStyle = '#1e3a5f'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // Legend box
    const pcol = pcfg.color
    ctx.fillStyle = 'rgba(10,12,16,0.8)'; ctx.fillRect(PL+8, PT+6, 130, 20)
    ctx.fillStyle = pcol; ctx.font = '10px Share Tech Mono'
    ctx.textAlign = 'left'; ctx.fillText(`${pcfg.label} (${pcfg.unit})`, PL+14, PT+19)
  }, [data, currentTs, profParam, profLayers, channels, vExag])

  // Resize + redraw on mount / resize
  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => { draw() }, [draw])

  // Zoom to TBM
  useEffect(() => {
    if (!zoomToTBMTick || !data?.tbm.length) return
    const vis  = data.tbm.filter(t => t.ts <= currentTs)
    const last = vis.length ? vis[vis.length - 1] : data.tbm[0]
    if (!last) return
    const span = 800
    const v = viewRef.current
    viewRef.current = { ...v, chMin: last.ch - span / 2, chMax: last.ch + span / 2 }
    draw()
  }, [zoomToTBMTick])

  // Wheel zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const v = viewRef.current
    const span = v.chMax - v.chMin
    const delta = e.deltaY > 0 ? 1.15 : 0.87
    const newSpan = Math.max(500, Math.min(11100, span * delta))
    const mid = (v.chMin + v.chMax) / 2
    viewRef.current = { ...v, chMin: mid - newSpan/2, chMax: mid + newSpan/2 }
    draw()
  }

  function onMouseDown(e: React.MouseEvent) {
    isDragging.current = true
    dragStart.current = { x: e.clientX, chMin: viewRef.current.chMin, chMax: viewRef.current.chMax }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current || !canvasRef.current) return
    const v = viewRef.current
    const PW = canvasRef.current.width - 64 - 24
    const scale = (v.chMax - v.chMin) / PW
    const dx = (e.clientX - dragStart.current.x) * scale
    viewRef.current = {
      ...v,
      chMin: dragStart.current.chMin - dx,
      chMax: dragStart.current.chMax - dx,
    }
    draw()
  }

  function onMouseUp() { isDragging.current = false }

  // ── Touch handlers (pinch-zoom + pan) — must be non-passive to preventDefault ──
  const touchStartRef = useRef<{ x: number; chMin: number; chMax: number; dist: number } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
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
      if (e.touches.length === 1) {
        touchStartRef.current = { x: e.touches[0].clientX, chMin: v.chMin, chMax: v.chMax, dist: 0 }
      } else {
        touchStartRef.current = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, chMin: v.chMin, chMax: v.chMax, dist: touchDist(e) }
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      const ts = touchStartRef.current
      if (!ts || !canvasRef.current) return
      const v = viewRef.current
      const PW = canvasRef.current.width - 64 - 24

      if (e.touches.length === 1) {
        // Pan
        const scale = (ts.chMax - ts.chMin) / PW
        const dx = (e.touches[0].clientX - ts.x) * scale
        viewRef.current = { ...v, chMin: ts.chMin - dx, chMax: ts.chMax - dx }
      } else {
        // Pinch zoom
        const newDist = touchDist(e)
        if (ts.dist === 0 || newDist === 0) return
        const factor = ts.dist / newDist
        const span = ts.chMax - ts.chMin
        const newSpan = Math.max(500, Math.min(11100, span * factor))
        const mid = (ts.chMin + ts.chMax) / 2
        viewRef.current = { ...v, chMin: mid - newSpan/2, chMax: mid + newSpan/2 }
        // Update dist reference for smooth continuous pinch
        touchStartRef.current = { ...ts, dist: newDist, chMin: viewRef.current.chMin, chMax: viewRef.current.chMax }
      }
      draw()
    }

    function onTouchEnd(e: TouchEvent) {
      e.preventDefault()
      if (e.touches.length === 0) touchStartRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [draw])

  // Init view from data
  useEffect(() => {
    if (data?.profile.length) {
      const pts = data.profile
      const chMin = pts[0].ch, chMax = pts[pts.length-1].ch
      const eArr  = pts.flatMap(p => [p.tunnelElev, p.surfaceElev]).filter(e => isFinite(e))
      const eMin  = Math.min(...eArr) - 15
      const eMax  = Math.max(...eArr) + 15
      viewRef.current = { chMin, chMax, eMin, eMax }
      draw()
    }
  }, [data])

  const profParamKeys = Object.keys(PROF_PARAMS) as ProfParam[]

  return (
    <div className={styles.profileWrap}>
      {/* Header */}
      <div className={styles.profileHeader}>
        <span className={styles.headerLbl}>PARAMETER</span>
        {profParamKeys.map(k => (
          <button
            key={k}
            className={`${styles.paramBtn} ${profParam===k ? styles.active : ''}`}
            onClick={() => setProfParam(k)}
          >
            <div className={styles.dot} style={{ background: PROF_PARAMS[k].color }} />
            {PROF_PARAMS[k].label}
          </button>
        ))}
        <div style={{ marginLeft:16, display:'flex', gap:10, alignItems:'center' }}>
          <span className={styles.headerLbl}>LAYERS</span>
          {(['grout','piezos','mano','soil','rock'] as const).map(k => (
            <div key={k} className={styles.layerItem} onClick={() => toggleProfLayer(k)}>
              <div className={`${styles.profToggle} ${profLayers[k] ? styles.on : ''}`} />
              <span className={styles.layerLbl}>{k.charAt(0).toUpperCase()+k.slice(1)}</span>
            </div>
          ))}
        </div>
        <div className={styles.cursorInfo}>Scroll/pinch to zoom · Drag to pan</div>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className={styles.canvasWrap}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <canvas ref={canvasRef} style={{ display:'block', cursor:'crosshair', width:'100%', height:'100%' }} />

        {/* Vertical exaggeration slider */}
        <div className={styles.vExagWrap}>
          <span className={styles.vExagLbl}>{vExag}×</span>
          <input
            type="range"
            min={1} max={20} step={0.5}
            value={vExag}
            onChange={e => setVExag(Number(e.target.value))}
            className={styles.vExagSlider}
            title={`Vertical exaggeration: ${vExag}×`}
          />
          <span className={styles.vExagTag}>V.EXAG</span>
        </div>
      </div>
    </div>
  )
}
