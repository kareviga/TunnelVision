import { useState, useMemo } from 'react'
import type { AppData, GroutRecord } from '../../types'
import { fmtDate, formatCH, parseDateStr } from '../../utils/format'
import styles from './ReportsView.module.css'

interface Props { data: AppData | null }

type FilterMode = 'date' | 'chainage' | 'ring'

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoToTs(s: string): number {
  if (!s) return 0
  return Math.floor(new Date(s).getTime() / 1000)
}

function tsToIso(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function leakColor(val: number): string {
  if (val <= 0)  return '#94a3b8'
  if (val < 5)   return '#22c55e'
  if (val < 20)  return '#eab308'
  if (val < 50)  return '#f97316'
  return '#ef4444'
}

function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0) }
function avg(arr: number[]) { return arr.length ? sum(arr) / arr.length : 0 }

// ── Pre-grouting report ───────────────────────────────────────────────────────
function PregroutReport({ records, data }: { records: GroutRecord[]; data: AppData }) {
  if (!records.length) return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>🔍</div>
      <span>No grouting records found for the selected range.</span>
    </div>
  )

  // ── Compute KPIs ──────────────────────────────────────────────────────────
  const screens      = records.length
  const grouted      = records.filter(r => r.injVol > 0 || r.cement > 0)
  const drillOnly    = records.filter(r => r.injVol <= 0 && r.cement <= 0)
  const totalDrillM  = sum(records.map(r => r.drillM))
  const totalCement  = sum(records.map(r => r.cement))
  const totalVol     = sum(records.map(r => r.injVol))
  const maxLeak      = Math.max(...records.map(r => r.inleakage))
  const avgLeak      = avg(records.filter(r => r.inleakage > 0).map(r => r.inleakage))
  const totalDuration = sum(records.map(r => r.duration))
  const chValues     = records.map(r => r.ch)
  const chStart      = Math.min(...chValues)
  const chEnd        = Math.max(...chValues)
  const tsValues     = records.map(r => r.ts)
  const tsStart      = Math.min(...tsValues)
  const tsEnd        = Math.max(...tsValues)

  // ── Per-screen table ──────────────────────────────────────────────────────
  const sorted = [...records].sort((a, b) => a.ch - b.ch)
  const leakMax = maxLeak || 1

  // ── Inleakage distribution chart ─────────────────────────────────────────
  const leakBins = [
    { lbl: '0 L/min',    min: 0,  max: 0.01, color: '#94a3b8' },
    { lbl: '< 5',        min: 0.01, max: 5,  color: '#22c55e' },
    { lbl: '5–20',       min: 5,  max: 20,   color: '#eab308' },
    { lbl: '20–50',      min: 20, max: 50,   color: '#f97316' },
    { lbl: '> 50',       min: 50, max: Infinity, color: '#ef4444' },
  ]
  const binCounts = leakBins.map(b =>
    records.filter(r => r.inleakage >= b.min && r.inleakage < b.max).length
  )
  const binMax = Math.max(...binCounts, 1)

  // ── Injection volume per screen ───────────────────────────────────────────
  const volMax = Math.max(...grouted.map(r => r.injVol), 1)

  // ── Export handlers ───────────────────────────────────────────────────────
  function exportCSV() {
    const header = ['Chainage','Date','Screen length (m)','Drill type','Drill metres',
      'Inleakage (L/min)','Injection vol (L)','Cement (kg)','Duration (h)','Packers']
    const rows = sorted.map(r => [
      formatCH(r.ch), fmtDate(r.ts), String(r.screenLen), r.drillType,
      r.drillM.toFixed(1), r.inleakage.toFixed(1), r.injVol.toFixed(0),
      r.cement.toFixed(0), r.duration.toFixed(1), String(r.packers),
    ])
    const csv = [header, ...rows].map(row =>
      row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `pregrouting_${tsToIso(tsStart)}_${tsToIso(tsEnd)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportPrint() { window.print() }

  return (
    <div className={styles.report}>
      {/* Header */}
      <div className={styles.reportHeader}>
        <div>
          <div className={styles.reportTitle}>Pre-Grouting Report</div>
          <div className={styles.reportMeta}>
            Period: {fmtDate(tsStart)} – {fmtDate(tsEnd)}<br />
            Chainage: {formatCH(chStart)} – {formatCH(chEnd)}<br />
            Generated: {fmtDate(Math.floor(Date.now() / 1000))}
          </div>
        </div>
        <div className={styles.exportRow}>
          <button className={styles.exportBtn} onClick={exportCSV}>↓ CSV</button>
          <button className={styles.exportBtn} onClick={exportPrint}>⎙ Print</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{screens}</div>
          <div className={styles.kpiLabel}>Screens total</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{grouted.length}</div>
          <div className={styles.kpiLabel}>Screens grouted</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{drillOnly.length}</div>
          <div className={styles.kpiLabel}>Drill-only screens</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{totalDrillM.toFixed(0)}<span className={styles.kpiUnit}> m</span></div>
          <div className={styles.kpiLabel}>Total drill metres</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{(totalVol / 1000).toFixed(1)}<span className={styles.kpiUnit}> m³</span></div>
          <div className={styles.kpiLabel}>Injection volume</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{(totalCement / 1000).toFixed(1)}<span className={styles.kpiUnit}> t</span></div>
          <div className={styles.kpiLabel}>Cement used</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue} style={{ color: leakColor(avgLeak) }}>{avgLeak.toFixed(1)}<span className={styles.kpiUnit}> L/min</span></div>
          <div className={styles.kpiLabel}>Avg inleakage</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue} style={{ color: leakColor(maxLeak) }}>{maxLeak.toFixed(1)}<span className={styles.kpiUnit}> L/min</span></div>
          <div className={styles.kpiLabel}>Max inleakage</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiValue}>{totalDuration.toFixed(0)}<span className={styles.kpiUnit}> h</span></div>
          <div className={styles.kpiLabel}>Total work time</div>
        </div>
      </div>

      {/* Inleakage distribution */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Inleakage Distribution</div>
        <div className={styles.chartArea}>
          <div className={styles.chartTitle}>NUMBER OF SCREENS PER INLEAKAGE CATEGORY</div>
          <div className={styles.barChart}>
            {leakBins.map((b, i) => (
              <div key={i} className={styles.barRow}>
                <div className={styles.barLbl}>{b.lbl}</div>
                <div className={styles.barBg}>
                  <div className={styles.barFill} style={{
                    width: `${(binCounts[i] / binMax) * 100}%`,
                    background: b.color,
                  }} />
                </div>
                <div className={styles.barNum}>{binCounts[i]} screens</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Injection volumes */}
      {grouted.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Injection Volume per Screen</div>
          <div className={styles.chartArea}>
            <div className={styles.chartTitle}>INJECTION VOLUME (L) PER CHAINAGE</div>
            <div className={styles.barChart}>
              {grouted.sort((a, b) => a.ch - b.ch).map((r, i) => (
                <div key={i} className={styles.barRow}>
                  <div className={styles.barLbl}>{formatCH(r.ch)}</div>
                  <div className={styles.barBg}>
                    <div className={styles.barFill} style={{
                      width: `${(r.injVol / volMax) * 100}%`,
                      background: 'var(--accent)',
                    }} />
                  </div>
                  <div className={styles.barNum}>{r.injVol.toFixed(0)} L</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Screen Details</div>
        <div className={styles.tableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>Chainage</th>
                <th>Date</th>
                <th>Type</th>
                <th className={styles.right}>Screen (m)</th>
                <th className={styles.right}>Drill (m)</th>
                <th>Inleakage</th>
                <th className={styles.right}>Vol (L)</th>
                <th className={styles.right}>Cement (kg)</th>
                <th className={styles.right}>Time (h)</th>
                <th className={styles.right}>Packers</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const isDrillOnly = r.injVol <= 0 && r.cement <= 0
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{formatCH(r.ch)}</td>
                    <td className={styles.muted}>{fmtDate(r.ts)}</td>
                    <td>
                      <span style={{
                        background: isDrillOnly ? 'rgba(239,68,68,.12)' : 'rgba(0,136,170,.12)',
                        color: isDrillOnly ? '#ef4444' : 'var(--accent)',
                        borderRadius: 3, padding: '1px 6px', fontSize: 9,
                        fontFamily: 'var(--cond)', letterSpacing: 1, textTransform: 'uppercase',
                      }}>
                        {isDrillOnly ? 'Drill only' : 'Grouted'}
                      </span>
                    </td>
                    <td className={styles.right}>{r.screenLen.toFixed(1)}</td>
                    <td className={styles.right}>{r.drillM.toFixed(1)}</td>
                    <td>
                      <div className={styles.leakBar}>
                        <div className={styles.leakBarBg}>
                          <div className={styles.leakBarFill} style={{
                            width: `${Math.min(100, (r.inleakage / leakMax) * 100)}%`,
                            background: leakColor(r.inleakage),
                          }} />
                        </div>
                        <span className={styles.leakVal} style={{ color: leakColor(r.inleakage) }}>
                          {r.inleakage > 0 ? r.inleakage.toFixed(1) : '—'}
                        </span>
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

// ── Main view ─────────────────────────────────────────────────────────────────
export function ReportsView({ data }: Props) {
  const [reportType, setReportType] = useState<'pregrouting'>('pregrouting')
  const [filterMode, setFilterMode] = useState<FilterMode>('date')

  // Date filter
  const defaultEnd   = data ? tsToIso(data.tsMax) : ''
  const defaultStart = data ? tsToIso(data.tsMax - 7 * 86400) : ''
  const [dateFrom, setDateFrom] = useState(defaultStart)
  const [dateTo,   setDateTo]   = useState(defaultEnd)

  // Chainage filter
  const [chFrom, setChFrom] = useState(data ? String(Math.round(data.chMin)) : '0')
  const [chTo,   setChTo]   = useState(data ? String(Math.round(data.chMax)) : '9999')

  // Ring filter
  const rings = data?.tbm ?? []
  const ringMin = rings.length ? Math.min(...rings.map(r => r.ring)) : 1
  const ringMax = rings.length ? Math.max(...rings.map(r => r.ring)) : 9999
  const [ringFrom, setRingFrom] = useState(String(ringMin))
  const [ringTo,   setRingTo]   = useState(String(ringMax))

  const [generated, setGenerated] = useState(false)
  const [filterSnap, setFilterSnap] = useState<{ mode: FilterMode; from: string; to: string } | null>(null)

  // Build ring→ch lookup
  const ringToCh = useMemo(() => {
    const m = new Map<number, number>()
    for (const t of data?.tbm ?? []) m.set(t.ring, t.ch)
    return m
  }, [data])

  const filtered = useMemo(() => {
    if (!data || !filterSnap) return []
    const grout = data.grout
    if (filterSnap.mode === 'date') {
      const tsFrom = isoToTs(filterSnap.from)
      const tsTo   = isoToTs(filterSnap.to) + 86400
      return grout.filter(r => r.ts >= tsFrom && r.ts <= tsTo)
    }
    if (filterSnap.mode === 'chainage') {
      const from = parseFloat(filterSnap.from)
      const to   = parseFloat(filterSnap.to)
      return grout.filter(r => r.ch >= from && r.ch <= to)
    }
    // ring
    const rFrom = parseInt(filterSnap.from)
    const rTo   = parseInt(filterSnap.to)
    const chFrom2 = ringToCh.get(rFrom) ?? 0
    const chTo2   = ringToCh.get(rTo)   ?? Infinity
    return grout.filter(r => r.ch >= Math.min(chFrom2, chTo2) && r.ch <= Math.max(chFrom2, chTo2))
  }, [data, filterSnap, ringToCh])

  function generate() {
    const snap = filterMode === 'date'     ? { mode: filterMode, from: dateFrom, to: dateTo }
               : filterMode === 'chainage' ? { mode: filterMode, from: chFrom,   to: chTo }
               :                             { mode: filterMode, from: ringFrom,  to: ringTo }
    setFilterSnap(snap)
    setGenerated(true)
  }

  return (
    <div className={styles.page}>
      {/* Sidebar */}
      <div className={styles.sidebar}>

        {/* Report type selection */}
        <div className={styles.sidebarSection}>
          <div className={styles.sidebarTitle}>Report Type</div>
          <button
            className={`${styles.reportBtn} ${reportType === 'pregrouting' ? styles.active : ''}`}
            onClick={() => { setReportType('pregrouting'); setGenerated(false) }}
          >
            <span className={styles.reportIcon}>🔩</span>
            <div>
              <div className={styles.reportLabel}>Pre-Grouting</div>
              <div className={styles.reportSub}>Screens, injection, inleakage</div>
            </div>
          </button>
        </div>

        {/* Filter */}
        <div className={styles.sidebarSection}>
          <div className={styles.sidebarTitle}>Filter</div>

          <div className={styles.modeToggle}>
            {(['date','chainage','ring'] as FilterMode[]).map(m => (
              <button
                key={m}
                className={`${styles.modeBtn} ${filterMode === m ? styles.on : ''}`}
                onClick={() => setFilterMode(m)}
              >
                {m === 'date' ? 'Date' : m === 'chainage' ? 'CH' : 'Ring'}
              </button>
            ))}
          </div>

          {filterMode === 'date' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From</label>
                <input type="date" className={styles.filterInput}
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To</label>
                <input type="date" className={styles.filterInput}
                  value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </>
          )}

          {filterMode === 'chainage' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From chainage (m)</label>
                <input type="number" className={styles.filterInput}
                  value={chFrom} onChange={e => setChFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To chainage (m)</label>
                <input type="number" className={styles.filterInput}
                  value={chTo} onChange={e => setChTo(e.target.value)} />
              </div>
            </>
          )}

          {filterMode === 'ring' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>From ring</label>
                <input type="number" className={styles.filterInput}
                  value={ringFrom} onChange={e => setRingFrom(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>To ring</label>
                <input type="number" className={styles.filterInput}
                  value={ringTo} onChange={e => setRingTo(e.target.value)} />
              </div>
            </>
          )}

          <button
            className={styles.generateBtn}
            onClick={generate}
            disabled={!data}
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Report area */}
      <div className={styles.main}>
        {!generated || !data ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <span>Select a report type and filter, then click Generate Report.</span>
          </div>
        ) : (
          <PregroutReport records={filtered} data={data} />
        )}
      </div>
    </div>
  )
}
