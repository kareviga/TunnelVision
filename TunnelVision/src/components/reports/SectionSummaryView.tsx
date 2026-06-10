import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import type { AppData } from '../../types'
import { formatCH, fmtDate } from '../../utils/format'
import { DEFAULT_CLASSES, RING_TYPE_COLORS } from '../../data/params'
import { groutAttrColor } from '../../utils/color'
import { TUNNEL_R } from '../../utils/geo'
import styles from './SectionSummaryView.module.css'

interface Props { data: AppData | null }

function sum(arr: number[])    { return arr.reduce((a, b) => a + b, 0) }
function avg(arr: number[])    { return arr.length ? sum(arr) / arr.length : 0 }
function med(arr: number[])    {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2
}

function fpiColor(v: number) {
  for (const c of DEFAULT_CLASSES.fpi) if (v >= c.from && v < c.to) return c.color
  return '#94a3b8'
}
function leakColor(v: number) {
  if (v <= 0) return '#94a3b8'
  if (v < 5)  return '#22c55e'
  if (v < 20) return '#eab308'
  if (v < 50) return '#f97316'
  return '#ef4444'
}

const LEAK_BINS = [
  { lbl: '0',    min: 0,    max: 0.01,    color: '#94a3b8' },
  { lbl: '< 5',  min: 0.01, max: 5,       color: '#22c55e' },
  { lbl: '5–20', min: 5,    max: 20,      color: '#eab308' },
  { lbl: '20–50',min: 20,   max: 50,      color: '#f97316' },
  { lbl: '> 50', min: 50,   max: Infinity,color: '#ef4444' },
]

function KPI({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiValue} style={small ? { fontSize: 11 } : {}}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  )
}

export function SectionSummaryView({ data }: Props) {
  const chMin = data ? Math.round(data.chMin) : 0
  const chMax = data ? Math.round(data.chMax) : 9999

  const [sliderFrom, setSliderFrom] = useState(chMin)
  const [sliderTo,   setSliderTo]   = useState(chMax)
  const [committed,  setCommitted]  = useState<{ from: number; to: number } | null>(null)

  const topWrapRef  = useRef<HTMLDivElement>(null)
  const profWrapRef = useRef<HTMLDivElement>(null)
  const topRef      = useRef<HTMLCanvasElement>(null)
  const profRef     = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (data) {
      const f = Math.round(data.chMin), t = Math.round(data.chMax)
      setSliderFrom(f); setSliderTo(t)
    }
  }, [data])

  // ── Plan / top-view canvas ────────────────────────────────────────────────
  const drawTop = useCallback(() => {
    const canvas = topRef.current, wrap = topWrapRef.current
    if (!canvas || !wrap || !data?.alignment.length) return
    const dpr = window.devicePixelRatio || 1
    const W = wrap.clientWidth, H = wrap.clientHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const cs = getComputedStyle(document.documentElement)
    ctx.fillStyle = cs.getPropertyValue('--bg2').trim() || '#0d1117'
    ctx.fillRect(0, 0, W, H)

    const al = data.alignment
    const xs = al.map(a => a.easting),  ys = al.map(a => a.northing)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    const y0 = Math.min(...ys), y1 = Math.max(...ys)
    const PAD = 24
    const sx = (W - PAD*2) / Math.max(x1 - x0, 1)
    const sy = (H - PAD*2) / Math.max(y1 - y0, 1)
    const sc = Math.min(sx, sy)
    const ox = PAD + ((W - PAD*2) - (x1 - x0) * sc) / 2
    const oy = PAD + ((H - PAD*2) - (y1 - y0) * sc) / 2
    const px = (e: number) => ox + (e - x0) * sc
    const py = (n: number) => H - oy - (n - y0) * sc

    // Full alignment (dim)
    ctx.strokeStyle = 'rgba(0,212,255,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([])
    ctx.beginPath()
    al.forEach((a, i) => i === 0 ? ctx.moveTo(px(a.easting), py(a.northing)) : ctx.lineTo(px(a.easting), py(a.northing)))
    ctx.stroke()

    // Selected range highlight
    const sel = al.filter(a => a.ch >= sliderFrom && a.ch <= sliderTo)
    if (sel.length > 1) {
      ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 3
      ctx.beginPath()
      sel.forEach((a, i) => i === 0 ? ctx.moveTo(px(a.easting), py(a.northing)) : ctx.lineTo(px(a.easting), py(a.northing)))
      ctx.stroke()

      // Endpoint labels
      ctx.fillStyle = 'rgba(0,212,255,0.65)'; ctx.font = '9px Share Tech Mono'; ctx.textAlign = 'center'
      const fa = sel[0], la = sel[sel.length - 1]
      ctx.fillText(formatCH(fa.ch), px(fa.easting), py(fa.northing) - 7)
      ctx.fillText(formatCH(la.ch), px(la.easting), py(la.northing) - 7)
    }

    // Grout screens (committed range only)
    if (committed) {
      const vg = data.grout.filter(g => g.ch >= committed.from && g.ch <= committed.to)
      for (const g of vg) {
        const ap = al.find(a => a.ch >= g.ch) ?? al[al.length - 1]
        const isDrill = (!g.injVol || g.injVol <= 0) && (!g.cement || g.cement <= 0)
        ctx.beginPath()
        ctx.arc(px(ap.easting), py(ap.northing), 3.5, 0, Math.PI * 2)
        ctx.fillStyle = isDrill ? '#ef4444' : groutAttrColor(g.inleakage)
        ctx.fill()
      }
    }
  }, [data, sliderFrom, sliderTo, committed])

  // ── Profile canvas ────────────────────────────────────────────────────────
  const drawProfile = useCallback(() => {
    const canvas = profRef.current, wrap = profWrapRef.current
    if (!canvas || !wrap || !data?.profile.length) return
    const dpr = window.devicePixelRatio || 1
    const W = wrap.clientWidth, H = wrap.clientHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const cs = getComputedStyle(document.documentElement)
    ctx.fillStyle = cs.getPropertyValue('--bg2').trim() || '#0d1117'
    ctx.fillRect(0, 0, W, H)

    const PL=48, PR=10, PT=10, PB=24
    const PW=W-PL-PR, PH=H-PT-PB
    const from = sliderFrom, to = sliderTo

    const pts = data.profile.filter(p => p.ch >= from - 20 && p.ch <= to + 20)
    if (pts.length < 2) return

    const eArr = pts.flatMap(p => [p.tunnelElev - TUNNEL_R - 3, p.surfaceElev + 3]).filter(isFinite)
    const eMin = Math.min(...eArr), eMax = Math.max(...eArr)
    const scH = PW / Math.max(to - from, 1)
    const scV = PH / Math.max(eMax - eMin, 1)
    const cx = (ch: number) => PL + (ch - from) * scH
    const cy = (el: number) => PT + (eMax - el) * scV

    // Surface fill
    ctx.fillStyle = cs.getPropertyValue('--bg').trim() || '#080a0e'
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    ctx.lineTo(cx(pts[pts.length-1].ch), PT+PH); ctx.lineTo(cx(pts[0].ch), PT+PH)
    ctx.closePath(); ctx.fill()

    // Soil layer
    ctx.fillStyle = 'rgba(160,120,70,0.22)'
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    for (let i = pts.length-1; i >= 0; i--) {
      const sb = pts[i].soilBaseElev != null ? Math.min(pts[i].soilBaseElev, pts[i].surfaceElev) : pts[i].surfaceElev
      ctx.lineTo(cx(pts[i].ch), cy(sb))
    }
    ctx.closePath(); ctx.fill()

    // Tunnel bore (grey fill)
    ctx.fillStyle = 'rgba(40,60,80,0.55)'
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.ch), cy(p.tunnelElev+TUNNEL_R)) : ctx.lineTo(cx(p.ch), cy(p.tunnelElev+TUNNEL_R)))
    for (let i = pts.length-1; i >= 0; i--) ctx.lineTo(cx(pts[i].ch), cy(pts[i].tunnelElev-TUNNEL_R))
    ctx.closePath(); ctx.fill()

    // FPI color overlay (committed range)
    if (committed) {
      const tbm = data.tbm.filter(t => t.ch >= committed.from && t.ch <= committed.to)
      for (let i = 0; i < tbm.length - 1; i++) {
        const t = tbm[i]; if (!t.fpi || t.fpi <= 0) continue
        let tEl: number | null = null
        for (const p of data.profile) { if (p.ch >= t.ch) { tEl = p.tunnelElev; break } }
        if (tEl === null) continue
        ctx.fillStyle = fpiColor(t.fpi)
        ctx.fillRect(cx(t.ch), cy(tEl+TUNNEL_R), cx(tbm[i+1].ch)-cx(t.ch), cy(tEl-TUNNEL_R)-cy(tEl+TUNNEL_R))
      }
    }

    // Tunnel bore outlines
    ctx.strokeStyle = 'rgba(100,160,220,0.4)'; ctx.lineWidth = 0.8
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.ch), cy(p.tunnelElev+TUNNEL_R)) : ctx.lineTo(cx(p.ch), cy(p.tunnelElev+TUNNEL_R)))
    ctx.stroke()
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.ch), cy(p.tunnelElev-TUNNEL_R)) : ctx.lineTo(cx(p.ch), cy(p.tunnelElev-TUNNEL_R)))
    ctx.stroke()

    // Grout screens (committed range)
    if (committed) {
      const fanRad = 8 * Math.PI / 180
      const vg = data.grout.filter(g => g.ch >= committed.from && g.ch <= committed.to)
      for (const g of vg) {
        let tEl: number | null = null
        for (const p of data.profile) { if (p.ch >= g.ch) { tEl = p.tunnelElev; break } }
        if (tEl === null) continue
        const isDrill = (!g.injVol || g.injVol <= 0) && (!g.cement || g.cement <= 0)
        const x0 = cx(g.ch-6), x1 = cx(g.ch-6+g.screenLen)
        const eHW = TUNNEL_R + g.screenLen * Math.tan(fanRad)
        ctx.fillStyle = groutAttrColor(isDrill ? 0 : g.inleakage)
        ctx.strokeStyle = isDrill ? '#ef4444' : 'rgba(80,80,80,0.5)'; ctx.lineWidth = isDrill ? 1 : 0.4
        if (isDrill) ctx.setLineDash([3,2])
        ctx.beginPath()
        ctx.moveTo(x0, cy(tEl+TUNNEL_R)); ctx.lineTo(x1, cy(tEl+eHW))
        ctx.lineTo(x1, cy(tEl-eHW)); ctx.lineTo(x0, cy(tEl-TUNNEL_R))
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // Surface line
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.3; ctx.setLineDash([])
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.ch), cy(p.surfaceElev)) : ctx.lineTo(cx(p.ch), cy(p.surfaceElev)))
    ctx.stroke()

    // Axis labels
    ctx.fillStyle = '#3a4a5a'; ctx.font = '8px Share Tech Mono'
    ctx.textAlign = 'center'
    ctx.fillText(formatCH(from), PL, PT+PH+16)
    ctx.fillText(formatCH(to),   PL+PW, PT+PH+16)
    ctx.textAlign = 'right'
    const eStep = (eMax - eMin) > 80 ? 50 : 25
    for (let e = Math.ceil(eMin/eStep)*eStep; e <= eMax; e += eStep) {
      const y = cy(e); if (y < PT || y > PT+PH) continue
      ctx.fillStyle = '#3a4a5a'; ctx.fillText(e+'m', PL-4, y+3)
      ctx.strokeStyle = 'rgba(80,100,120,0.15)'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL+PW, y); ctx.stroke()
    }
  }, [data, sliderFrom, sliderTo, committed])

  useEffect(() => { drawTop(); drawProfile() }, [drawTop, drawProfile])

  useEffect(() => {
    const ro = new ResizeObserver(() => { drawTop(); drawProfile() })
    if (topWrapRef.current)  ro.observe(topWrapRef.current)
    if (profWrapRef.current) ro.observe(profWrapRef.current)
    return () => ro.disconnect()
  }, [drawTop, drawProfile])

  // ── Computed summaries (committed range) ──────────────────────────────────
  const tbmSel   = useMemo(() => !committed || !data ? [] : data.tbm.filter(t => t.ch >= committed.from && t.ch <= committed.to), [committed, data])
  const groutSel = useMemo(() => !committed || !data ? [] : data.grout.filter(g => g.ch >= committed.from && g.ch <= committed.to), [committed, data])

  if (!data) return <div className={styles.loading}>LOADING DATA…</div>

  const tbmChStart = tbmSel.length ? Math.min(...tbmSel.map(r => r.ch)) : 0
  const tbmChEnd   = tbmSel.length ? Math.max(...tbmSel.map(r => r.ch)) : 0

  return (
    <div className={styles.page}>

      {/* ── LEFT: data summary ── */}
      <div className={styles.summaryPanel}>
        {!committed ? (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>⊡</div>
            <div>Select a chainage range and press<br />Refresh to see summary data.</div>
          </div>
        ) : (
          <>
            <div className={styles.summaryHeader}>
              <div className={styles.summaryTitle}>Section Summary</div>
              <div className={styles.summaryRange}>{formatCH(committed.from)} – {formatCH(committed.to)}</div>
              <div className={styles.summaryMeta}>{Math.round(committed.to - committed.from)} m section</div>
            </div>

            {/* TBM */}
            <div className={styles.summarySection}>
              <div className={styles.summarySectionTitle}>TBM Data</div>
              {tbmSel.length === 0 ? <div className={styles.noData}>No TBM data in range</div> : (
                <>
                  <div className={styles.kpiRow}>
                    <KPI label="Rings" value={tbmSel.length} />
                    <KPI label="Metres" value={`${(tbmChEnd - tbmChStart).toFixed(0)} m`} />
                  </div>
                  <div className={styles.kpiRow}>
                    <KPI label="From" value={fmtDate(Math.min(...tbmSel.map(r => r.ts)))} small />
                    <KPI label="To"   value={fmtDate(Math.max(...tbmSel.map(r => r.ts)))} small />
                  </div>

                  <div className={styles.subsectionTitle}>Ring Types</div>
                  <div className={styles.ringTypeRow}>
                    {(['C1-R1','C2-R2','C2-R2b','C2-R3'] as const).map(rt => {
                      const n = tbmSel.filter(r => r.ringType === rt).length
                      if (!n) return null
                      const col = RING_TYPE_COLORS[rt] ?? '#94a3b8'
                      return (
                        <div key={rt} className={styles.ringTypePill} style={{ borderColor: col }}>
                          <span style={{ color: col }}>{n}</span>
                          <span className={styles.ringTypeLbl}>{rt}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className={styles.subsectionTitle}>FPI Distribution (kN/c)</div>
                  {DEFAULT_CLASSES.fpi.map((cls, i) => {
                    const n   = tbmSel.filter(r => r.fpi >= cls.from && r.fpi < cls.to).length
                    const pct = tbmSel.length ? (n / tbmSel.length) * 100 : 0
                    const lbl = cls.to === Infinity ? `≥${cls.from}` : `${cls.from}–${cls.to}`
                    return (
                      <div key={i} className={styles.miniBarRow}>
                        <div className={styles.miniBarLbl}>{lbl}</div>
                        <div className={styles.miniBarBg}><div className={styles.miniBarFill} style={{ width: `${pct}%`, background: cls.color }} /></div>
                        <div className={styles.miniBarNum}>{n}</div>
                      </div>
                    )
                  })}

                  <div className={styles.subsectionTitle}>Parameters</div>
                  <div className={styles.paramTable}>
                    {[
                      { label: 'FPI',    unit: 'kN/c',   vals: tbmSel.map(r => r.fpi).filter(v => v > 0) },
                      { label: 'Thrust', unit: 'kN',     vals: tbmSel.map(r => r.thrust).filter(v => v > 0) },
                      { label: 'Torque', unit: 'MNm',    vals: tbmSel.map(r => r.torque).filter(v => v > 0) },
                      { label: 'RPM',    unit: 'r/min',  vals: tbmSel.map(r => r.rpm).filter(v => v > 0) },
                      { label: 'Pen.',   unit: 'mm/rev', vals: tbmSel.map(r => r.pen_rev).filter(v => v > 0) },
                    ].map(({ label, unit, vals }) => (
                      <div key={label} className={styles.paramRow}>
                        <div className={styles.paramLabel}>{label}<span className={styles.paramUnit}> {unit}</span></div>
                        <div className={styles.paramStat}>avg {avg(vals).toFixed(1)}</div>
                        <div className={styles.paramStat}>med {med(vals).toFixed(1)}</div>
                        <div className={styles.paramStat}>max {vals.length ? Math.max(...vals).toFixed(1) : '—'}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Pre-grouting */}
            <div className={styles.summarySection}>
              <div className={styles.summarySectionTitle}>Pre-Grouting</div>
              {groutSel.length === 0 ? <div className={styles.noData}>No grouting data in range</div> : (
                <>
                  <div className={styles.kpiRow}>
                    <KPI label="Screens"   value={groutSel.length} />
                    <KPI label="Grouted"   value={groutSel.filter(g => g.injVol > 0 || g.cement > 0).length} />
                    <KPI label="Drill only" value={groutSel.filter(g => g.injVol <= 0 && g.cement <= 0).length} />
                  </div>
                  <div className={styles.kpiRow}>
                    <KPI label="Drill m"   value={`${sum(groutSel.map(r => r.drillM)).toFixed(0)} m`} />
                    <KPI label="Inj. vol"  value={`${(sum(groutSel.map(r => r.injVol))/1000).toFixed(1)} m³`} />
                    <KPI label="Cement"    value={`${(sum(groutSel.map(r => r.cement))/1000).toFixed(1)} t`} />
                  </div>

                  <div className={styles.subsectionTitle}>Inleakage Distribution</div>
                  {LEAK_BINS.map((b, i) => {
                    const n   = groutSel.filter(r => r.inleakage >= b.min && r.inleakage < b.max).length
                    const pct = groutSel.length ? (n / groutSel.length) * 100 : 0
                    return (
                      <div key={i} className={styles.miniBarRow}>
                        <div className={styles.miniBarLbl}>{b.lbl}</div>
                        <div className={styles.miniBarBg}><div className={styles.miniBarFill} style={{ width: `${pct}%`, background: b.color }} /></div>
                        <div className={styles.miniBarNum}>{n}</div>
                      </div>
                    )
                  })}

                  <div className={styles.subsectionTitle}>Totals</div>
                  <div className={styles.paramTable}>
                    {(() => {
                      const vals = groutSel.filter(r => r.inleakage > 0).map(r => r.inleakage)
                      const maxL = Math.max(...groutSel.map(r => r.inleakage), 0)
                      const avgL = avg(vals)
                      return [
                        { label: 'Avg inleakage', val: `${avgL.toFixed(1)} L/min`,  col: leakColor(avgL) },
                        { label: 'Max inleakage', val: `${maxL.toFixed(1)} L/min`,  col: leakColor(maxL) },
                        { label: 'Work time',     val: `${sum(groutSel.map(r => r.duration)).toFixed(0)} h`, col: undefined },
                        { label: 'Packers total', val: String(sum(groutSel.map(r => r.packers))), col: undefined },
                      ]
                    })().map(({ label, val, col }) => (
                      <div key={label} className={styles.paramRow}>
                        <div className={styles.paramLabel}>{label}</div>
                        <div className={styles.paramStat} style={col ? { color: col } : {}}>{val}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: visuals + controls ── */}
      <div className={styles.vizPanel}>
        <div className={styles.vizLabel}>PLAN VIEW</div>
        <div ref={topWrapRef} className={styles.topWrap}>
          <canvas ref={topRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>

        <div className={styles.vizLabel}>PROFILE VIEW</div>
        <div ref={profWrapRef} className={styles.profWrap}>
          <canvas ref={profRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>

        <div className={styles.sliderPanel}>
          <div className={styles.sliderRow}>
            <span className={styles.sliderLabel}>From CH</span>
            <input
              type="range" className={styles.slider}
              min={chMin} max={chMax} step={1} value={sliderFrom}
              onChange={e => setSliderFrom(Math.min(Number(e.target.value), sliderTo - 10))}
            />
            <span className={styles.sliderVal}>{formatCH(sliderFrom)}</span>
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.sliderLabel}>To CH</span>
            <input
              type="range" className={styles.slider}
              min={chMin} max={chMax} step={1} value={sliderTo}
              onChange={e => setSliderTo(Math.max(Number(e.target.value), sliderFrom + 10))}
            />
            <span className={styles.sliderVal}>{formatCH(sliderTo)}</span>
          </div>
          <button className={styles.refreshBtn} onClick={() => setCommitted({ from: sliderFrom, to: sliderTo })}>
            ↻  Refresh
          </button>
        </div>
      </div>

    </div>
  )
}
