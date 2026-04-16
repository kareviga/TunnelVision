import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../../store/useStore'
import { formatCH } from '../../utils/format'
import { valToColor, groutAttrColor } from '../../utils/color'
import { PARAMS } from '../../data/params'
import { TUNNEL_R } from '../../utils/geo'
import type { AppData } from '../../types'
import { ProfilePanel } from './ProfilePanel'
import styles from './ProfileView.module.css'

interface Props { data: AppData | null }

interface HitResult {
  type: 'mano'
  id: string
  name: string
  ch: number
  pressure: number
  x: number
  y: number
}

export function ProfileView({ data }: Props) {
  const profChannel       = useStore(s => s.profChannel)
  const profLayers        = useStore(s => s.profLayers)
  const currentTs         = useStore(s => s.currentTs)
  const zoomToTBMTick     = useStore(s => s.zoomToTBMTick)
  const theme             = useStore(s => s.theme)
  const setSelectedSensor = useStore(s => s.setSelectedSensor)
  const exportPNGTick     = useStore(s => s.exportPNGTick)
  const activeView        = useStore(s => s.activeView)

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const viewRef    = useRef({ chMin: 0, chMax: 11092, eMin: -60, eMax: 120 })
  const isDragging = useRef(false)
  const dragStart  = useRef({ x: 0, chMin: 0, chMax: 0 })

  const [vExag, setVExag]       = useState(1)
  const [panelOpen, setPanelOpen] = useState(false)
  const [tooltip, setTooltip]   = useState<HitResult | null>(null)

  const paramDef = PARAMS[profChannel.param] ?? PARAMS.fpi

  // ── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback((vExagOverride?: number) => {
    const ve = vExagOverride ?? vExag
    const canvas = canvasRef.current
    if (!canvas || !data?.profile.length) return
    const wrap = wrapRef.current!
    const dpr  = window.devicePixelRatio || 1
    const cssW = wrap.clientWidth
    const cssH = wrap.clientHeight
    canvas.width  = cssW * dpr
    canvas.height = cssH * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const W = cssW, H = cssH
    if (W < 10 || H < 10) return

    const PL=64, PR=24, PT=32, PB=44
    const PW=W-PL-PR, PH=H-PT-PB
    const { chMin, chMax, eMin, eMax } = viewRef.current

    const pts = data.profile.filter(p => p.ch >= chMin-50 && p.ch <= chMax+50)
    if (!pts.length) return

    const scaleH = PW / (chMax - chMin)
    const scaleV = scaleH * ve
    const usedH  = (eMax - eMin) * scaleV
    const offY   = (PH - usedH) / 2
    const cx = (ch: number) => PL + (ch - chMin) * scaleH
    const cy = (el: number) => PT + offY + (eMax - el) * scaleV

    const cs = getComputedStyle(document.documentElement)
    const bgColor  = cs.getPropertyValue('--bg').trim()  || '#080a0e'
    const bg2Color = cs.getPropertyValue('--bg2').trim() || '#0d1117'
    const borderColor = cs.getPropertyValue('--border').trim() || '#151c28'

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = bg2Color
    ctx.beginPath()
    pts.forEach((p, i) => i===0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    ctx.lineTo(cx(pts[pts.length-1].ch), PT+PH)
    ctx.lineTo(cx(pts[0].ch), PT+PH)
    ctx.closePath(); ctx.fill()

    ctx.strokeStyle = borderColor; ctx.lineWidth = 0.8
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

    if (cy(0) > PT && cy(0) < PT+PH) {
      ctx.strokeStyle = 'rgba(30,80,180,0.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([6,4])
      ctx.beginPath(); ctx.moveTo(PL, cy(0)); ctx.lineTo(PL+PW, cy(0)); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = 'rgba(30,80,180,0.45)'; ctx.font = '8px Share Tech Mono'; ctx.textAlign = 'left'
      ctx.fillText('0m', PL+3, cy(0)-3)
    }
    ctx.setLineDash([])

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

    if (profLayers.rock) {
      ctx.fillStyle = 'rgba(90,110,140,0.28)'
      ctx.beginPath()
      pts.forEach((p,i) => {
        const sb = p.soilBaseElev != null ? Math.min(p.soilBaseElev, p.surfaceElev) : p.surfaceElev
        i===0 ? ctx.moveTo(cx(p.ch), cy(sb)) : ctx.lineTo(cx(p.ch), cy(sb))
      })
      for (let i = pts.length-1; i >= 0; i--) ctx.lineTo(cx(pts[i].ch), cy(-10))
      ctx.closePath(); ctx.fill()
    }

    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.8; ctx.setLineDash([])
    ctx.beginPath()
    pts.forEach((p,i) => i===0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    ctx.stroke()

    if (profLayers.grout) {
      const fanRad = 8 * Math.PI / 180
      const vg = data.grout.filter(g => g.ts <= currentTs && g.ch >= chMin-50 && g.ch <= chMax+50)
      for (const g of vg) {
        let tunEl: number | null = null
        for (const p of data.profile) { if (p.ch >= g.ch) { tunEl = p.tunnelElev; break } }
        if (tunEl === null) continue
        const isDrillingOnly = (!g.injVol || g.injVol <= 0) && (!g.cement || g.cement <= 0)
        const fillColor = groutAttrColor(isDrillingOnly ? 0 : g.inleakage)
        const x0 = cx(g.ch - 6), x1 = cx(g.ch - 6 + g.screenLen)
        const sHW = TUNNEL_R, eHW = TUNNEL_R + g.screenLen * Math.tan(fanRad)
        ctx.fillStyle = fillColor
        ctx.strokeStyle = isDrillingOnly ? '#ef4444' : '#555'
        ctx.lineWidth   = isDrillingOnly ? 1.5 : 0.5
        if (isDrillingOnly) ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(x0, cy(tunEl+sHW)); ctx.lineTo(x1, cy(tunEl+eHW))
        ctx.lineTo(x1, cy(tunEl-eHW)); ctx.lineTo(x0, cy(tunEl-sHW))
        ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    if (profChannel.param !== 'none') {
      const field = paramDef.field as string
      const visTBM = data.tbm.filter(t => t.ts <= currentTs && t.ch >= chMin-50 && t.ch <= chMax+50)
      if (visTBM.length > 1) {
        for (let i = 0; i < visTBM.length - 1; i++) {
          const t = visTBM[i]
          const val = (t as unknown as Record<string,number>)[field]
          if (!val || val <= 0) continue
          const color = valToColor(val, profChannel)
          let tunEl: number | null = null
          for (const p of data.profile) { if (p.ch >= t.ch) { tunEl = p.tunnelElev; break } }
          if (tunEl === null) continue
          const x0 = cx(t.ch), x1 = cx(visTBM[i+1].ch)
          ctx.fillStyle = color
          ctx.fillRect(x0, cy(tunEl+TUNNEL_R), x1-x0, cy(tunEl-TUNNEL_R)-cy(tunEl+TUNNEL_R))
        }
      }
    }

    if (profLayers.mano) {
      const visTbm = data.tbm.filter(t => t.ts <= currentTs)
      const tbmCh  = visTbm.length ? visTbm[visTbm.length - 1].ch : -Infinity
      for (const m of data.manometers) {
        if (m.ch > tbmCh) continue
        if (m.ch < chMin - 50 || m.ch > chMax + 50) continue
        const recent = m.series.filter(s => s[0] <= currentTs).at(-1)
        if (!recent) continue
        const pressure = recent[1]
        const rawPElev = m.elev + pressure * 10.2
        let surfaceElev = rawPElev
        for (const p of data.profile) { if (p.ch >= m.ch) { surfaceElev = p.surfaceElev; break } }
        const pElev = Math.min(rawPElev, surfaceElev)
        const x = cx(m.ch)
        ctx.beginPath(); ctx.arc(x, cy(pElev), 4, 0, Math.PI * 2)
        ctx.fillStyle = '#60a5fa'; ctx.fill()
        ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1; ctx.stroke()
      }
    }

    const tbmAll = data.tbm.filter(t => t.ts <= currentTs)
    if (tbmAll.length) {
      const last = tbmAll[tbmAll.length - 1]
      let tunEl: number | null = null
      for (const p of data.profile) { if (p.ch >= last.ch) { tunEl = p.tunnelElev; break } }
      if (tunEl !== null) {
        const TBM_SEGS: [number, string, string][] = [
          [1.0,  '#111111', '#444444'],
          [4.9,  '#e8e8e8', '#aaaaaa'],
          [12.9, '#d8d8d8', '#aaaaaa'],
          [5.9,  '#c8c8c8', '#aaaaaa'],
        ]
        let curCh = last.ch
        for (const [len, fill, stroke] of TBM_SEGS) {
          const x0 = cx(curCh), x1 = cx(curCh - len)
          ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.rect(Math.min(x0,x1), cy(tunEl+TUNNEL_R), Math.abs(x1-x0), cy(tunEl-TUNNEL_R)-cy(tunEl+TUNNEL_R))
          ctx.fill(); ctx.stroke()
          curCh -= len
        }
        // cutterhead face ring only (no filled circle)
        const r = Math.abs(cy(tunEl - TUNNEL_R) - cy(tunEl + TUNNEL_R)) / 2
        ctx.beginPath(); ctx.arc(cx(last.ch), cy(tunEl), r, 0, Math.PI * 2)
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }, [data, currentTs, profChannel, profLayers, vExag, theme, paramDef])

  // ── Hit test manometers ────────────────────────────────────────────────────
  function hitTestMano(cssX: number, cssY: number): HitResult | null {
    if (!data || !profLayers.mano || !canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const PL=64, PR=24, PT=32, PB=44
    const PW=W-PL-PR, PH=H-PT-PB
    const { chMin, chMax, eMin, eMax } = viewRef.current
    const scaleH = PW / (chMax - chMin)
    const scaleV = scaleH * vExag
    const usedH  = (eMax - eMin) * scaleV
    const offY   = (PH - usedH) / 2
    const cx = (ch: number) => PL + (ch - chMin) * scaleH
    const cy = (el: number) => PT + offY + (eMax - el) * scaleV
    const visTbm = data.tbm.filter(t => t.ts <= currentTs)
    const tbmCh  = visTbm.length ? visTbm[visTbm.length - 1].ch : -Infinity
    let best: HitResult | null = null, bestDist = 16
    for (const m of data.manometers) {
      if (m.ch > tbmCh || m.ch < chMin - 50 || m.ch > chMax + 50) continue
      const recent = m.series.filter(s => s[0] <= currentTs).at(-1)
      if (!recent) continue
      const pressure = recent[1]
      const rawPElev = m.elev + pressure * 10.2
      let surfaceElev = rawPElev
      for (const p of data.profile) { if (p.ch >= m.ch) { surfaceElev = p.surfaceElev; break } }
      const pElev = Math.min(rawPElev, surfaceElev)
      const dx = cssX - cx(m.ch), dy = cssY - cy(pElev)
      const dist = Math.sqrt(dx*dx + dy*dy)
      if (dist < bestDist) { bestDist = dist; best = { type:'mano', id:m.id, name:m.name, ch:m.ch, pressure, x:cx(m.ch), y:cy(pElev) } }
    }
    return best
  }

  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!zoomToTBMTick || !data?.tbm.length) return
    const vis  = data.tbm.filter(t => t.ts <= currentTs)
    const last = vis.length ? vis[vis.length - 1] : data.tbm[0]
    if (!last) return
    viewRef.current = { ...viewRef.current, chMin: last.ch - 400, chMax: last.ch + 400 }
    draw()
  }, [zoomToTBMTick])

  useEffect(() => {
    if (exportPNGTick === 0 || activeView !== 'profile') return
    const canvas = canvasRef.current; if (!canvas) return
    const v = viewRef.current
    const fmt = (ch: number) => String(Math.round(ch))
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `Profile_CH${fmt(v.chMin)}-${fmt(v.chMax)}.png`
    a.click()
  }, [exportPNGTick])

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const v = viewRef.current
    const span = v.chMax - v.chMin
    const delta = e.deltaY > 0 ? 1.15 : 0.87
    const newSpan = Math.max(150, Math.min(11100, span * delta))
    const mid = (v.chMin + v.chMax) / 2
    viewRef.current = { ...v, chMin: mid - newSpan/2, chMax: mid + newSpan/2 }
    draw()
  }

  function onMouseDown(e: React.MouseEvent) {
    setTooltip(null); isDragging.current = true
    dragStart.current = { x: e.clientX, chMin: viewRef.current.chMin, chMax: viewRef.current.chMax }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const relX = e.clientX - rect.left, relY = e.clientY - rect.top
    if (!isDragging.current) setTooltip(hitTestMano(relX, relY))
    if (!isDragging.current) return
    const v = viewRef.current
    const PW = canvasRef.current.width / (window.devicePixelRatio || 1) - 64 - 24
    const scale = (v.chMax - v.chMin) / PW
    const dx = (e.clientX - dragStart.current.x) * scale
    viewRef.current = { ...v, chMin: dragStart.current.chMin - dx, chMax: dragStart.current.chMax - dx }
    draw()
  }

  function onMouseUp() { isDragging.current = false }

  function onCanvasClick(e: React.MouseEvent) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const hit = hitTestMano(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) setSelectedSensor({ type: 'manometer', id: hit.id })
  }

  const touchStartRef = useRef<{ x: number; chMin: number; chMax: number; dist: number } | null>(null)

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    function touchDist(e: TouchEvent) {
      if (e.touches.length < 2) return 0
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      return Math.sqrt(dx*dx + dy*dy)
    }
    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      const v = viewRef.current
      touchStartRef.current = e.touches.length === 1
        ? { x: e.touches[0].clientX, chMin: v.chMin, chMax: v.chMax, dist: 0 }
        : { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, chMin: v.chMin, chMax: v.chMax, dist: touchDist(e) }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      const ts = touchStartRef.current; if (!ts || !canvasRef.current) return
      const v = viewRef.current
      const rect = canvasRef.current.getBoundingClientRect()
      const PW = rect.width - 64 - 24
      if (e.touches.length === 1) {
        const scale = (ts.chMax - ts.chMin) / PW
        const dx = (e.touches[0].clientX - ts.x) * scale
        viewRef.current = { ...v, chMin: ts.chMin - dx, chMax: ts.chMax - dx }
      } else {
        const newDist = touchDist(e); if (!ts.dist || !newDist) return
        const factor = ts.dist / newDist
        const newSpan = Math.max(150, Math.min(11100, (ts.chMax - ts.chMin) * factor))
        const mid = (ts.chMin + ts.chMax) / 2
        viewRef.current = { ...v, chMin: mid - newSpan/2, chMax: mid + newSpan/2 }
        touchStartRef.current = { ...ts, dist: newDist, chMin: viewRef.current.chMin, chMax: viewRef.current.chMax }
      }
      draw()
    }
    function onTouchEnd(e: TouchEvent) {
      e.preventDefault()
      if (e.touches.length === 0) {
        if (e.changedTouches.length > 0 && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect()
          const hit = hitTestMano(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top)
          if (hit) setSelectedSensor({ type: 'manometer', id: hit.id })
        }
        touchStartRef.current = null
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
  }, [draw])

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

  return (
    <div className={`${styles.profileView} ${panelOpen ? styles.panelOpen : ''}`}>
      <div className={styles.workspace}>

        {/* Left panel — desktop inline, mobile overlay */}
        <div className={`${styles.panelOverlay} ${panelOpen ? styles.open : ''}`}>
          <ProfilePanel />
        </div>

        {/* Canvas area */}
        <div
          ref={wrapRef}
          className={styles.canvasWrap}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { isDragging.current = false; setTooltip(null) }}
          onClick={onCanvasClick}
        >
          <canvas
            ref={canvasRef}
            style={{ display:'block', cursor: tooltip ? 'pointer' : 'crosshair', width:'100%', height:'100%' }}
          />

          {tooltip && (
            <div className={styles.profileTooltip} style={{ left: tooltip.x + 10, top: Math.max(8, tooltip.y - 36) }}>
              <div className={styles.ttName}>{tooltip.name || tooltip.id}</div>
              <div className={styles.ttVal}>{tooltip.pressure.toFixed(2)} bar · CH {tooltip.ch.toFixed(0)} m</div>
              <div className={styles.ttHint}>Click to open chart</div>
            </div>
          )}

          {/* Zoom controls */}
          <div style={{ position:'absolute', top:10, right:10, display:'flex', flexDirection:'column', gap:3, zIndex:10 }}>
            {([
              ['+', () => {
                const v = viewRef.current; const span = v.chMax - v.chMin; const mid = (v.chMin+v.chMax)/2
                viewRef.current = { ...v, chMin: mid-span*0.42, chMax: mid+span*0.42 }; draw()
              }],
              ['−', () => {
                const v = viewRef.current; const span = v.chMax - v.chMin; const mid = (v.chMin+v.chMax)/2
                const newSpan = Math.min(11100, span*1.4)
                viewRef.current = { ...v, chMin: mid-newSpan/2, chMax: mid+newSpan/2 }; draw()
              }],
              ['⊡', () => {
                if (!data?.profile.length) return
                const pts = data.profile
                viewRef.current = { ...viewRef.current, chMin: pts[0].ch, chMax: pts[pts.length-1].ch }; draw()
              }],
            ] as [string, () => void][]).map(([label, fn], i) => (
              <button key={i} onClick={fn} style={{
                width:30, height:30, background:'var(--bg3)', border:'1px solid var(--border2)',
                borderRadius:4, color:'var(--text)', fontSize: label==='⊡' ? 10 : 16,
                cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'var(--mono)',
              }}>{label}</button>
            ))}
          </div>

          {/* Vertical exaggeration slider */}
          <div className={styles.vExagWrap}>
            <span className={styles.vExagLbl}>{vExag}×</span>
            <input
              type="range" min={1} max={20} step={0.5} value={vExag}
              onChange={e => { const v = Number(e.target.value); setVExag(v); draw(v) }}
              className={styles.vExagSlider}
              title={`Vertical exaggeration: ${vExag}×`}
            />
            <span className={styles.vExagTag}>V.EXAG</span>
          </div>
        </div>
      </div>

      {/* Tap-outside backdrop (mobile only) */}
      {panelOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setPanelOpen(false)}
          style={{ position:'absolute', inset:0, zIndex:540, background:'rgba(0,0,0,0.45)' }}
        />
      )}

      {/* Mobile panel toggle */}
      <button
        className={styles.panelToggle}
        onClick={() => setPanelOpen(o => !o)}
        aria-label="Toggle panel"
      >
        {panelOpen ? '✕' : '☰'}
      </button>
    </div>
  )
}
