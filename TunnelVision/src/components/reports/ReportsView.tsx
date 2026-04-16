import { useState, useMemo } from 'react'
import type { AppData, GroutRecord, TBMRecord } from '../../types'
import { fmtDate, formatCH } from '../../utils/format'
import { RING_TYPE_COLORS } from '../../data/params'
import styles from './ReportsView.module.css'

interface Props { data: AppData | null }

type FilterMode = 'date' | 'chainage' | 'ring'
type ReportType = 'pregrouting' | 'tbm'

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoToTs(s: string): number {
  if (!s) return 0
  return Math.floor(new Date(s).getTime() / 1000)
}
function tsToIso(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}
function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0) }
function avg(arr: number[]) { return arr.length ? sum(arr) / arr.length : 0 }
function median(arr: number[]) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function leakColor(val: number): string {
  if (val <= 0)  return '#94a3b8'
  if (val < 5)   return '#22c55e'
  if (val < 20)  return '#eab308'
  if (val < 50)  return '#f97316'
  return '#ef4444'
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      background: bg, color, borderRadius: 3, padding: '1px 7px',
      fontSize: 9, fontFamily: 'var(--cond)', letterSpacing: 1, textTransform: 'uppercase',
    }}>{label}</span>
  )
}

// ── Pre-grouting report ───────────────────────────────────────────────────────
function PregroutReport({ records }: { records: GroutRecord[] }) {
  if (!records.length) return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>🔍</div>
      <span>No grouting records found for the selected range.</span>
    </div>
  )

  const grouted      = records.filter(r => r.injVol > 0 || r.cement > 0)
  const drillOnly    = records.filter(r => r.injVol <= 0 && r.cement <= 0)
  const totalDrillM  = sum(records.map(r => r.drillM))
  const totalCement  = sum(records.map(r => r.cement))
  const totalVol     = sum(records.map(r => r.injVol))
  const maxLeak      = Math.max(...records.map(r => r.inleakage), 0)
  const avgLeak      = avg(records.filter(r => r.inleakage > 0).map(r => r.inleakage))
  const totalDuration = sum(records.map(r => r.duration))
  const chValues     = records.map(r => r.ch)
  const tsValues     = records.map(r => r.ts)
  const tsStart      = Math.min(...tsValues)
  const tsEnd        = Math.max(...tsValues)
  const sorted       = [...records].sort((a, b) => a.ch - b.ch)
  const leakMax      = maxLeak || 1
  const volMax       = Math.max(...grouted.map(r => r.injVol), 1)

  const leakBins = [
    { lbl: '0 L/min', min: 0,    max: 0.01,    color: '#94a3b8' },
    { lbl: '< 5',     min: 0.01, max: 5,        color: '#22c55e' },
    { lbl: '5–20',    min: 5,    max: 20,        color: '#eab308' },
    { lbl: '20–50',   min: 20,   max: 50,        color: '#f97316' },
    { lbl: '> 50',    min: 50,   max: Infinity,  color: '#ef4444' },
  ]
  const binCounts = leakBins.map(b => records.filter(r => r.inleakage >= b.min && r.inleakage < b.max).length)
  const binMax = Math.max(...binCounts, 1)

  function exportCSV() {
    const header = ['Chainage','Date','Screen (m)','Drill type','Drill (m)',
      'Inleakage (L/min)','Vol (L)','Cement (kg)','Duration (h)','Packers']
    const rows = sorted.map(r => [
      formatCH(r.ch), fmtDate(r.ts), String(r.screenLen), r.drillType,
      r.drillM.toFixed(1), r.inleakage.toFixed(1), r.injVol.toFixed(0),
      r.cement.toFixed(0), r.duration.toFixed(1), String(r.packers),
    ])
    downloadCSV(`pregrouting_${tsToIso(tsStart)}_${tsToIso(tsEnd)}.csv`, [header, ...rows])
  }

  return (
    <div className={styles.report}>
      <div className={styles.reportHeader}>
        <div>
          <div className={styles.reportTitle}>Pre-Grouting Report</div>
          <div className={styles.reportMeta}>
            Period: {fmtDate(tsStart)} – {fmtDate(tsEnd)}<br />
            Chainage: {formatCH(Math.min(...chValues))} – {formatCH(Math.max(...chValues))}<br />
            Generated: {fmtDate(Math.floor(Date.now() / 1000))}
          </div>
        </div>
        <div className={styles.exportRow}>
          <button className={styles.exportBtn} onClick={exportCSV}>↓ CSV</button>
          <button className={styles.exportBtn} onClick={() => window.print()}>⎙ Print</button>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <KPI value={records.length} label="Screens total" />
        <KPI value={grouted.length} label="Screens grouted" />
        <KPI value={drillOnly.length} label="Drill-only" />
        <KPI value={totalDrillM.toFixed(0)} unit="m" label="Drill metres" />
        <KPI value={(totalVol/1000).toFixed(1)} unit="m³" label="Injection volume" />
        <KPI value={(totalCement/1000).toFixed(1)} unit="t" label="Cement used" />
        <KPI value={avgLeak.toFixed(1)} unit="L/min" label="Avg inleakage" color={leakColor(avgLeak)} />
        <KPI value={maxLeak.toFixed(1)} unit="L/min" label="Max inleakage" color={leakColor(maxLeak)} />
        <KPI value={totalDuration.toFixed(0)} unit="h" label="Total work time" />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Inleakage Distribution</div>
        <div className={styles.chartArea}>
          <div className={styles.chartTitle}>NUMBER OF SCREENS PER INLEAKAGE CATEGORY</div>
          <div className={styles.barChart}>
            {leakBins.map((b, i) => (
              <div key={i} className={styles.barRow}>
                <div className={styles.barLbl}>{b.lbl}</div>
                <div className={styles.barBg}><div className={styles.barFill} style={{ width: `${(binCounts[i]/binMax)*100}%`, background: b.color }} /></div>
                <div className={styles.barNum}>{binCounts[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {grouted.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Injection Volume per Screen</div>
          <div className={styles.chartArea}>
            <div className={styles.chartTitle}>INJECTION VOLUME (L) PER CHAINAGE</div>
            <div className={styles.barChart}>
              {grouted.sort((a,b) => a.ch-b.ch).map((r, i) => (
                <div key={i} className={styles.barRow}>
                  <div className={styles.barLbl}>{formatCH(r.ch)}</div>
                  <div className={styles.barBg}><div className={styles.barFill} style={{ width: `${(r.injVol/volMax)*100}%`, background: 'var(--accent)' }} /></div>
                  <div className={styles.barNum}>{r.injVol.toFixed(0)} L</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Screen Details</div>
        <div className={styles.tableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>Chainage</th><th>Date</th><th>Type</th>
                <th className={styles.right}>Screen (m)</th><th className={styles.right}>Drill (m)</th>
                <th>Inleakage</th><th className={styles.right}>Vol (L)</th>
                <th className={styles.right}>Cement (kg)</th><th className={styles.right}>Time (h)</th>
                <th className={styles.right}>Packers</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const isDrill = r.injVol <= 0 && r.cement <= 0
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{formatCH(r.ch)}</td>
                    <td className={styles.muted}>{fmtDate(r.ts)}</td>
                    <td><Badge label={isDrill ? 'Drill only' : 'Grouted'} color={isDrill ? '#ef4444' : 'var(--accent)'} bg={isDrill ? 'rgba(239,68,68,.12)' : 'rgba(0,136,170,.12)'} /></td>
                    <td className={styles.right}>{r.screenLen.toFixed(1)}</td>
                    <td className={styles.right}>{r.drillM.toFixed(1)}</td>
                    <td>
                      <div className={styles.leakBar}>
                        <div className={styles.leakBarBg}><div className={styles.leakBarFill} style={{ width: `${Math.min(100,(r.inleakage/leakMax)*100)}%`, background: leakColor(r.inleakage) }} /></div>
                        <span className={styles.leakVal} style={{ color: leakColor(r.inleakage) }}>{r.inleakage > 0 ? r.inleakage.toFixed(1) : '—'}</span>
                      </div>
                    </td>
                    <td className={styles.right}>{r.injVol > 0 ? r.injVol.toFixed(0) : '—'}</td>
                    <td className={styles.right}>{r.cement > 0 ? r.cement.toFixed(0) : '—'}</td>
                    <td className={styles.right}>{r.duration > 0 ? r.duration.toFixed(1) : '—'}</td>
                    <td className={styles.right}>{r.packers > 0 ? r.packers : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── TBM Production report ─────────────────────────────────────────────────────
function TBMReport({ records }: { records: TBMRecord[] }) {
  if (!records.length) return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>🔍</div>
      <span>No TBM records found for the selected range.</span>
    </div>
  )

  const sorted   = [...records].sort((a, b) => a.ch - b.ch)
  const tsValues = records.map(r => r.ts)
  const tsStart  = Math.min(...tsValues)
  const tsEnd    = Math.max(...tsValues)
  const chStart  = Math.min(...records.map(r => r.ch))
  const chEnd    = Math.max(...records.map(r => r.ch))
  const meters   = chEnd - chStart
  const rings    = records.length

  // Ring type breakdown
  const ringTypes = ['C1-R1', 'C2-R2', 'C2-R2b', 'C2-R3']
  const ringTypeCounts = Object.fromEntries(
    ringTypes.map(rt => [rt, records.filter(r => r.ringType === rt).length])
  )
  const otherTypes = [...new Set(records.map(r => r.ringType))].filter(rt => !ringTypes.includes(rt))
  for (const rt of otherTypes) ringTypeCounts[rt] = records.filter(r => r.ringType === rt).length
  const allTypes = [...ringTypes, ...otherTypes].filter(rt => ringTypeCounts[rt] > 0)

  // Duration: span in calendar days
  const calDays = Math.max(1, Math.round((tsEnd - tsStart) / 86400))

  // Advance rate
  const mPerDay  = meters / calDays
  const mPerWeek = mPerDay * 7
  const ringsPerDay = rings / calDays

  // TBM parameter stats — filter valid (>0) values
  function paramStats(arr: number[]) {
    const v = arr.filter(x => x > 0)
    return { avg: avg(v), median: median(v), min: Math.min(...v, 0), max: Math.max(...v, 0), n: v.length }
  }

  const fpiStats    = paramStats(records.map(r => r.fpi))
  const thrustStats = paramStats(records.map(r => r.thrust))
  const torqueStats = paramStats(records.map(r => r.torque))
  const rpmStats    = paramStats(records.map(r => r.rpm))
  const penRevStats = paramStats(records.map(r => r.pen_rev))
  const penHrStats  = paramStats(records.map(r => r.pen_hr))

  // Daily production chart — group by calendar day
  const dayMap = new Map<string, number>()
  for (const r of records) {
    const day = tsToIso(r.ts)
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1)
  }
  const days = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const maxRingsDay = Math.max(...days.map(d => d[1]), 1)

  // FPI histogram (bins of 10)
  const fpiBins: { lbl: string; count: number }[] = []
  for (let lo = 0; lo < 80; lo += 10) {
    fpiBins.push({
      lbl: `${lo}–${lo+10}`,
      count: records.filter(r => r.fpi >= lo && r.fpi < lo + 10).length,
    })
  }
  const fpiMax = Math.max(...fpiBins.map(b => b.count), 1)

  function exportCSV() {
    const header = ['Ring','Chainage','Date','Ring type','Thrust (kN)','Torque (MNm)',
      'RPM','Pen mm/rev','Pen m/h','FPI (kN/c)']
    const rows = sorted.map(r => [
      String(r.ring), formatCH(r.ch), fmtDate(r.ts), r.ringType,
      r.thrust.toFixed(0), r.torque.toFixed(2), r.rpm.toFixed(1),
      r.pen_rev.toFixed(1), r.pen_hr.toFixed(2), r.fpi.toFixed(1),
    ])
    downloadCSV(`tbm_production_${tsToIso(tsStart)}_${tsToIso(tsEnd)}.csv`, [header, ...rows])
  }

  const RING_COLORS: Record<string, string> = {
    'C1-R1': '#22c55e', 'C2-R2': '#eab308', 'C2-R2b': '#94a3b8', 'C2-R3': '#ef4444',
  }

  return (
    <div className={styles.report}>
      <div className={styles.reportHeader}>
        <div>
          <div className={styles.reportTitle}>TBM Production Report</div>
          <div className={styles.reportMeta}>
            Period: {fmtDate(tsStart)} – {fmtDate(tsEnd)} ({calDays} days)<br />
            Chainage: {formatCH(chStart)} – {formatCH(chEnd)}<br />
            Generated: {fmtDate(Math.floor(Date.now() / 1000))}
          </div>
        </div>
        <div className={styles.exportRow}>
          <button className={styles.exportBtn} onClick={exportCSV}>↓ CSV</button>
          <button className={styles.exportBtn} onClick={() => window.print()}>⎙ Print</button>
        </div>
      </div>

      {/* Production KPIs */}
      <div className={styles.kpiGrid}>
        <KPI value={meters.toFixed(1)} unit="m" label="Metres excavated" />
        <KPI value={rings} label="Rings installed" />
        <KPI value={mPerDay.toFixed(1)} unit="m/day" label="Advance rate" />
        <KPI value={mPerWeek.toFixed(1)} unit="m/week" label="Weekly rate" />
        <KPI value={ringsPerDay.toFixed(1)} unit="r/day" label="Rings per day" />
        <KPI value={calDays} unit="days" label="Period length" />
      </div>

      {/* Ring type breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Ring Type Distribution</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {allTypes.map(rt => {
            const count = ringTypeCounts[rt]
            const pct = ((count / rings) * 100).toFixed(1)
            const color = RING_TYPE_COLORS[rt] ?? '#94a3b8'
            return (
              <div key={rt} className={styles.kpiCard} style={{ borderLeft: `3px solid ${color}` }}>
                <div className={styles.kpiValue} style={{ color }}>{count}</div>
                <div className={styles.kpiLabel}>{rt} · {pct}%</div>
              </div>
            )
          })}
        </div>
        <div className={styles.chartArea}>
          <div className={styles.chartTitle}>RINGS PER TYPE</div>
          <div className={styles.barChart}>
            {allTypes.map(rt => {
              const count = ringTypeCounts[rt]
              const color = RING_TYPE_COLORS[rt] ?? '#94a3b8'
              return (
                <div key={rt} className={styles.barRow}>
                  <div className={styles.barLbl}>{rt}</div>
                  <div className={styles.barBg}><div className={styles.barFill} style={{ width: `${(count/rings)*100}%`, background: color }} /></div>
                  <div className={styles.barNum}>{count} ({((count/rings)*100).toFixed(0)}%)</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Daily production */}
      {days.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Daily Production</div>
          <div className={styles.chartArea}>
            <div className={styles.chartTitle}>RINGS INSTALLED PER DAY</div>
            <div className={styles.barChart}>
              {days.map(([day, count], i) => (
                <div key={i} className={styles.barRow}>
                  <div className={styles.barLbl} style={{ fontSize: 8 }}>{day.slice(5)}</div>
                  <div className={styles.barBg}><div className={styles.barFill} style={{ width: `${(count/maxRingsDay)*100}%`, background: 'var(--accent)' }} /></div>
                  <div className={styles.barNum}>{count} rings</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TBM Parameters */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>TBM Parameters</div>
        <div className={styles.tableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>Parameter</th><th>Unit</th>
                <th className={styles.right}>Avg</th>
                <th className={styles.right}>Median</th>
                <th className={styles.right}>Min</th>
                <th className={styles.right}>Max</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'FPI',          unit: 'kN/c', s: fpiStats    },
                { label: 'Thrust',       unit: 'kN',   s: thrustStats },
                { label: 'Torque',       unit: 'MNm',  s: torqueStats },
                { label: 'RPM',          unit: 'rev/min', s: rpmStats },
                { label: 'Penetration',  unit: 'mm/rev', s: penRevStats },
                { label: 'Pen rate',     unit: 'm/h',  s: penHrStats  },
              ].map(({ label, unit, s }) => (
                <tr key={label}>
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  <td className={styles.muted}>{unit}</td>
                  <td className={styles.right}>{s.avg.toFixed(2)}</td>
                  <td className={styles.right}>{s.median.toFixed(2)}</td>
                  <td className={styles.right}>{s.min.toFixed(2)}</td>
                  <td className={styles.right}>{s.max.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FPI distribution */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>FPI Distribution</div>
        <div className={styles.chartArea}>
          <div className={styles.chartTitle}>NUMBER OF RINGS PER FPI RANGE (kN/c)</div>
          <div className={styles.barChart}>
            {fpiBins.filter(b => b.count > 0).map((b, i) => (
              <div key={i} className={styles.barRow}>
                <div className={styles.barLbl}>{b.lbl}</div>
                <div className={styles.barBg}><div className={styles.barFill} style={{ width: `${(b.count/fpiMax)*100}%`, background: 'var(--accent2)' }} /></div>
                <div className={styles.barNum}>{b.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ring detail table */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Ring Details</div>
        <div className={styles.tableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>Ring</th><th>Chainage</th><th>Date</th><th>Type</th>
                <th className={styles.right}>Thrust (kN)</th>
                <th className={styles.right}>Torque (MNm)</th>
                <th className={styles.right}>RPM</th>
                <th className={styles.right}>Pen (mm/rev)</th>
                <th className={styles.right}>Pen (m/h)</th>
                <th className={styles.right}>FPI</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const rtColor = RING_TYPE_COLORS[r.ringType] ?? '#94a3b8'
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.ring}</td>
                    <td>{formatCH(r.ch)}</td>
                    <td className={styles.muted}>{fmtDate(r.ts)}</td>
                    <td>
                      <Badge
                        label={r.ringType}
                        color={rtColor}
                        bg={`${rtColor}22`}
                      />
                    </td>
                    <td className={styles.right}>{r.thrust > 0 ? r.thrust.toFixed(0) : '—'}</td>
                    <td className={styles.right}>{r.torque > 0 ? r.torque.toFixed(2) : '—'}</td>
                    <td className={styles.right}>{r.rpm > 0 ? r.rpm.toFixed(1) : '—'}</td>
                    <td className={styles.right}>{r.pen_rev > 0 ? r.pen_rev.toFixed(1) : '—'}</td>
                    <td className={styles.right}>{r.pen_hr > 0 ? r.pen_hr.toFixed(2) : '—'}</td>
                    <td className={styles.right}>{r.fpi > 0 ? r.fpi.toFixed(1) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Shared KPI card ───────────────────────────────────────────────────────────
function KPI({ value, unit, label, color }: { value: string | number; unit?: string; label: string; color?: string }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiValue} style={color ? { color } : {}}>
        {value}{unit && <span className={styles.kpiUnit}> {unit}</span>}
      </div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  )
}

// ── CSV download helper ───────────────────────────────────────────────────────
function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Filter helper ─────────────────────────────────────────────────────────────
function applyFilter<T extends { ts: number; ch: number }>(
  records: T[],
  snap: { mode: FilterMode; from: string; to: string },
  ringToCh: Map<number, number>,
): T[] {
  if (snap.mode === 'date') {
    const tsFrom = isoToTs(snap.from)
    const tsTo   = isoToTs(snap.to) + 86400
    return records.filter(r => r.ts >= tsFrom && r.ts <= tsTo)
  }
  if (snap.mode === 'chainage') {
    const from = parseFloat(snap.from), to = parseFloat(snap.to)
    return records.filter(r => r.ch >= from && r.ch <= to)
  }
  // ring mode — convert ring bounds to chainage
  const rFrom = parseInt(snap.from), rTo = parseInt(snap.to)
  const chA = ringToCh.get(rFrom) ?? 0
  const chB = ringToCh.get(rTo)   ?? Infinity
  const chLo = Math.min(chA, chB), chHi = Math.max(chA, chB)
  return records.filter(r => r.ch >= chLo && r.ch <= chHi)
}

// ── Filter helper for TBM (ring-based) ───────────────────────────────────────
function applyFilterTBM(
  records: TBMRecord[],
  snap: { mode: FilterMode; from: string; to: string },
): TBMRecord[] {
  if (snap.mode === 'date') {
    const tsFrom = isoToTs(snap.from)
    const tsTo   = isoToTs(snap.to) + 86400
    return records.filter(r => r.ts >= tsFrom && r.ts <= tsTo)
  }
  if (snap.mode === 'chainage') {
    const from = parseFloat(snap.from), to = parseFloat(snap.to)
    return records.filter(r => r.ch >= from && r.ch <= to)
  }
  // ring mode — direct ring number filter
  const rFrom = parseInt(snap.from), rTo = parseInt(snap.to)
  const lo = Math.min(rFrom, rTo), hi = Math.max(rFrom, rTo)
  return records.filter(r => r.ring >= lo && r.ring <= hi)
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function ReportsView({ data }: Props) {
  const [reportType, setReportType] = useState<ReportType>('tbm')
  const [filterMode, setFilterMode] = useState<FilterMode>('date')

  const defaultEnd   = data ? tsToIso(data.tsMax) : ''
  const defaultStart = data ? tsToIso(data.tsMax - 7 * 86400) : ''
  const [dateFrom, setDateFrom] = useState(defaultStart)
  const [dateTo,   setDateTo]   = useState(defaultEnd)

  const [chFrom, setChFrom] = useState(data ? String(Math.round(data.chMin)) : '0')
  const [chTo,   setChTo]   = useState(data ? String(Math.round(data.chMax)) : '9999')

  const tbmRings = data?.tbm ?? []
  const ringMin = tbmRings.length ? Math.min(...tbmRings.map(r => r.ring)) : 1
  const ringMax = tbmRings.length ? Math.max(...tbmRings.map(r => r.ring)) : 9999
  const [ringFrom, setRingFrom] = useState(String(ringMin))
  const [ringTo,   setRingTo]   = useState(String(ringMax))

  const [generated, setGenerated] = useState(false)
  const [filterSnap, setFilterSnap] = useState<{ mode: FilterMode; from: string; to: string } | null>(null)

  const ringToCh = useMemo(() => {
    const m = new Map<number, number>()
    for (const t of data?.tbm ?? []) m.set(t.ring, t.ch)
    return m
  }, [data])

  const filteredGrout = useMemo(() => {
    if (!data || !filterSnap) return []
    return applyFilter(data.grout, filterSnap, ringToCh)
  }, [data, filterSnap, ringToCh])

  const filteredTBM = useMemo(() => {
    if (!data || !filterSnap) return []
    return applyFilterTBM(data.tbm, filterSnap)
  }, [data, filterSnap])

  function generate() {
    setFilterSnap(
      filterMode === 'date'     ? { mode: filterMode, from: dateFrom, to: dateTo } :
      filterMode === 'chainage' ? { mode: filterMode, from: chFrom,   to: chTo   } :
                                  { mode: filterMode, from: ringFrom,  to: ringTo }
    )
    setGenerated(true)
  }

  const REPORT_TYPES: { id: ReportType; icon: string; label: string; sub: string }[] = [
    { id: 'tbm',        icon: '⚙',  label: 'TBM Production', sub: 'Rings, advance rate, parameters' },
    { id: 'pregrouting',icon: '🔩', label: 'Pre-Grouting',   sub: 'Screens, injection, inleakage'   },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarSection}>
          <div className={styles.sidebarTitle}>Report Type</div>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              className={`${styles.reportBtn} ${reportType === rt.id ? styles.active : ''}`}
              onClick={() => { setReportType(rt.id); setGenerated(false) }}
            >
              <span className={styles.reportIcon}>{rt.icon}</span>
              <div>
                <div className={styles.reportLabel}>{rt.label}</div>
                <div className={styles.reportSub}>{rt.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div className={styles.sidebarSection}>
          <div className={styles.sidebarTitle}>Filter</div>
          <div className={styles.modeToggle}>
            {(['date','chainage','ring'] as FilterMode[]).map(m => (
              <button key={m} className={`${styles.modeBtn} ${filterMode === m ? styles.on : ''}`} onClick={() => setFilterMode(m)}>
                {m === 'date' ? 'Date' : m === 'chainage' ? 'CH' : 'Ring'}
              </button>
            ))}
          </div>

          {filterMode === 'date' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From</label>
                <input type="date" className={styles.filterInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To</label>
                <input type="date" className={styles.filterInput} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          {filterMode === 'chainage' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From chainage (m)</label>
                <input type="number" className={styles.filterInput} value={chFrom} onChange={e => setChFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To chainage (m)</label>
                <input type="number" className={styles.filterInput} value={chTo} onChange={e => setChTo(e.target.value)} />
              </div>
            </>
          )}
          {filterMode === 'ring' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From ring</label>
                <input type="number" className={styles.filterInput} value={ringFrom} onChange={e => setRingFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To ring</label>
                <input type="number" className={styles.filterInput} value={ringTo} onChange={e => setRingTo(e.target.value)} />
              </div>
            </>
          )}

          <button className={styles.generateBtn} onClick={generate} disabled={!data}>
            Generate Report
          </button>
        </div>
      </div>

      <div className={styles.main}>
        {!generated || !data ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <span>Select a report type and filter, then click Generate Report.</span>
          </div>
        ) : reportType === 'tbm' ? (
          <TBMReport records={filteredTBM} />
        ) : (
          <PregroutReport records={filteredGrout} />
        )}
      </div>
    </div>
  )
}
