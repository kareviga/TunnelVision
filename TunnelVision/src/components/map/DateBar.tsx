import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { fmtDate, formatCH } from '../../utils/format'
import type { AppData } from '../../types'
import styles from './DateBar.module.css'

const TICK_MS  = 80
const THROTTLE = 60   // ms between store updates while dragging

interface Props { data: AppData | null }

export function DateBar({ data }: Props) {
  const currentTs      = useStore(s => s.currentTs)
  const tsMin          = useStore(s => s.tsMin)
  const tsMax          = useStore(s => s.tsMax)
  const setTs          = useStore(s => s.setCurrentTs)
  const triggerZoomToTBM = useStore(s => s.triggerZoomToTBM)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed]     = useState(4)

  const playRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const tsRef        = useRef(currentTs)
  const lastUpd      = useRef(0)
  const sliderRef    = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const dragging     = useRef(false)

  tsRef.current = currentTs

  // Keep slider in sync with store when NOT dragging (playback / step buttons)
  useEffect(() => {
    if (dragging.current) return
    const el = sliderRef.current
    if (!el || !tsMax || tsMax <= tsMin) return
    const v = Math.round(((currentTs - tsMin) / (tsMax - tsMin)) * 10000)
    el.value = String(v)
    updateGradient(el, v / 100)
  }, [currentTs, tsMin, tsMax])

  // Playback
  useEffect(() => {
    if (!playing) { if (playRef.current) clearInterval(playRef.current); return }
    playRef.current = setInterval(() => {
      const next = tsRef.current + speed * 86400
      if (next >= tsMax) { setTs(tsMax); setPlaying(false) }
      else               { setTs(next) }
    }, TICK_MS)
    return () => { if (playRef.current) clearInterval(playRef.current) }
  }, [playing, speed, tsMax])

  function togglePlay() {
    if (currentTs >= tsMax && !playing) setTs(tsMin)
    setPlaying(p => !p)
  }

  // ── Uncontrolled slider ────────────────────────────────────────────────────
  function updateGradient(el: HTMLInputElement, pct: number) {
    el.style.background = `linear-gradient(to right,#0088aa ${pct}%,#253040 ${pct}%)`
  }

  function handleInput(e: React.FormEvent<HTMLInputElement>) {
    const el  = e.currentTarget
    const v   = parseInt(el.value)
    const pct = v / 100
    updateGradient(el, pct)
    dragging.current = true
    const ts  = Math.round(tsMin + (v / 10000) * (tsMax - tsMin))
    const now = Date.now()
    if (now - lastUpd.current >= THROTTLE) {
      lastUpd.current = now
      setTs(ts)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v  = parseInt(e.target.value)
    const ts = Math.round(tsMin + (v / 10000) * (tsMax - tsMin))
    setTs(ts)
    lastUpd.current = Date.now()
    setTimeout(() => { dragging.current = false }, 50)
  }

  // ── Day step ───────────────────────────────────────────────────────────────
  function stepDay(delta: number) {
    const next = Math.max(tsMin, Math.min(tsMax, currentTs + delta * 86400))
    setTs(next)
  }

  // ── Date picker ────────────────────────────────────────────────────────────
  function openDatePicker() {
    dateInputRef.current?.showPicker?.()
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return
    const ts = Math.floor(new Date(e.target.value + 'T12:00:00').getTime() / 1000)
    setTs(Math.max(tsMin, Math.min(tsMax, ts)))
  }

  function tsToDateInput(ts: number) {
    const d = new Date(ts * 1000)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const tbm  = data?.tbm ?? []
  const vis  = tbm.filter(t => t.ts <= currentTs)
  const last = vis.length ? vis[vis.length-1] : tbm[0]
  const ticks = buildTicks(tsMin, tsMax)
  const initPct = tsMax > tsMin ? ((currentTs - tsMin) / (tsMax - tsMin)) * 100 : 0

  return (
    <div className={styles.dateBar}>
      <div className={styles.topRow}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button className={styles.playBtn} onClick={togglePlay}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className={styles.stepBtn} onClick={() => stepDay(-1)} title="Back 1 day">‹</button>

          <div style={{ position:'relative' }}>
            <div className={styles.dateDisplay} onClick={openDatePicker} title="Click to pick date">
              {fmtDate(currentTs).toUpperCase()}
            </div>
            <input
              ref={dateInputRef}
              type="date"
              className={styles.dateInput}
              value={tsToDateInput(currentTs)}
              min={tsToDateInput(tsMin)}
              max={tsToDateInput(tsMax)}
              onChange={handleDateChange}
            />
          </div>

          <button className={styles.stepBtn} onClick={() => stepDay(1)} title="Forward 1 day">›</button>

          <div className={styles.dateMeta}>
            <div>RING <span>{last?.ring.toLocaleString() ?? '—'}</span></div>
            <div>CH <span>{last ? formatCH(last.ch) : '—'}</span></div>
            <div className={styles.metaHideMobile}>EXCAVATED <span>{last ? `${Math.round(last.ch - (tbm[0]?.ch ?? 0))}m` : '—'}</span></div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span className={styles.speedLbl}>SPEED</span>
          {[1, 4, 12, 52].map(s => (
            <button key={s} className={`${styles.speedBtn} ${speed===s ? styles.active : ''}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
          <button className={styles.zoomTBMBtn} onClick={triggerZoomToTBM} title="Zoom to TBM">
            ⊙ TBM
          </button>
        </div>
      </div>

      <div className={styles.sliderSection}>
        {/* Uncontrolled range — no React value binding, DOM manipulated directly */}
        <input
          ref={sliderRef}
          type="range"
          className={styles.slider}
          min={0} max={10000}
          defaultValue={Math.round(initPct * 100)}
          style={{ background:`linear-gradient(to right,#0088aa ${initPct}%,#253040 ${initPct}%)` }}
          onInput={handleInput}
          onChange={handleChange}
        />
        <div className={styles.tickWrap}>
          {ticks.map((t, i) => (
            <div key={i} className={styles.tick} style={{ left:`${t.pct}%` }}>{t.label}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function buildTicks(tsMin: number, tsMax: number) {
  const ticks: { pct: number; label: string }[] = []
  if (!tsMin || !tsMax) return ticks
  const d = new Date(tsMin * 1000); d.setDate(1); d.setHours(0,0,0,0)
  const end = new Date(tsMax * 1000)
  while (d <= end) {
    const mo = d.getMonth()
    if (mo === 0 || mo === 6) {
      const ts  = d.getTime() / 1000
      const pct = ((ts - tsMin) / (tsMax - tsMin)) * 100
      ticks.push({ pct, label: mo === 0 ? String(d.getFullYear()) : '' })
    }
    d.setMonth(d.getMonth() + 1)
  }
  return ticks
}
