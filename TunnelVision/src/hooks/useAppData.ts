import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import type {
  AppData, AlignPoint, ProfilePoint, TBMRecord, XRFRecord, GroutRecord, DrillHole,
  ManometerSensor, PiezometerSensor,
  AlignmentRow, TBMRow, XRFRow, PregroutingRow,
  ManometerPositionRow, ManometerDataRow, PiezometerPositionRow,
} from '../types'

interface DrillHoleRow {
  Advance: number
  'Hole No': string | number
  hole_length: number
  inleakage: number
}
import { parseDateStr } from '../utils/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BASE = (import.meta as any).env?.BASE_URL ?? '/'

function csvUrl(name: string) {
  return `${BASE}data/${name}`
}

async function loadCSV<T>(url: string, opts?: Papa.ParseConfig): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
      dynamicTyping: true,
      ...opts,
      complete: r => resolve(r.data as T[]),
      error: reject,
    })
  })
}

// ── Wide-format piezometer CSV parser ─────────────────────────────────────────
// File has 6 metadata rows, then "Time;SensorName[kPa] (avg);..." header on row 7,
// then a blank row, then daily data rows.

function parsePiezoDate(s: string): number {
  // "YYYY-MM-DD HH:MM:SS" → unix seconds
  if (!s) return 0
  const t = s.trim().replace(' ', 'T')
  const ms = new Date(t).getTime()
  return isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

function extractSensorName(col: string): string {
  // "Geonor - NVO - 14218:  PZ1502[kPa] (avg)" → "PZ1502"
  const m = col.match(/:\s*(.+?)\s*\[kPa\]/)
  return m ? m[1].trim() : ''
}

async function loadPiezoData(url: string): Promise<Map<string, Array<[number, number]>>> {
  const res = await fetch(url)
  if (!res.ok) return new Map()
  const raw = await res.text()
  const text = raw.replace(/^\uFEFF/, '')          // strip BOM
  const lines = text.split(/\r?\n/)
  const headerIdx = lines.findIndex(l => l.startsWith('Time;'))
  if (headerIdx < 0) return new Map()

  // Extract column names from header
  const cols = lines[headerIdx].split(';')
  const sensorNames = cols.slice(1).map(extractSensorName)

  // Build empty series arrays
  const seriesMap = new Map<string, Array<[number, number]>>()
  sensorNames.forEach(n => { if (n) seriesMap.set(n, []) })

  // Parse data rows (skip the blank row right after header)
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(';')
    const ts = parsePiezoDate(parts[0])
    if (!ts) continue
    for (let j = 1; j < parts.length && j - 1 < sensorNames.length; j++) {
      const name = sensorNames[j - 1]
      if (!name) continue
      const v = parseFloat(parts[j])
      if (isNaN(v)) continue
      seriesMap.get(name)!.push([ts, v])
    }
  }

  return seriesMap
}

// Normalise a position ID to match data column sensor names
function normalisePiezoId(id: string): string[] {
  const s = id.trim()
  const candidates = [s]
  // "2101PZ" → "PZ2101"
  if (/\d+PZ$/i.test(s)) candidates.push('PZ' + s.replace(/PZ$/i, ''))
  // "362-1" → "PZ362-1", "PZP362-1"
  candidates.push('PZ' + s, 'PZP' + s)
  return candidates
}

// ── Per-chainage alignment lookup ─────────────────────────────────────────────

function buildAlignMap(rows: AlignmentRow[]): Map<number, AlignmentRow> {
  const m = new Map<number, AlignmentRow>()
  for (const r of rows) m.set(r.ring, r)
  return m
}

function findAlignByChain(rows: AlignmentRow[], ch: number): AlignmentRow | undefined {
  let best: AlignmentRow | undefined
  let bd = Infinity
  for (const r of rows) {
    const d = Math.abs(r.chainage - ch)
    if (d < bd) { bd = d; best = r }
    if (r.chainage > ch + 200) break
  }
  return best
}

// ── Ring-type colour index ────────────────────────────────────────────────────
const RING_TYPE_MAP: Record<string, number> = { 'C1-R1': 0, 'C2-R2': 1, 'C2-R2b': 2, 'C2-R3': 3 }

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [alignRaw, tbmRaw, xrfRaw, groutRaw, manoPos, manoData, piezPos, piezSeriesMap, drillRaw] = await Promise.all([
          loadCSV<AlignmentRow>(csvUrl('tunnel_alignment.csv')),
          loadCSV<TBMRow>(csvUrl('tbm_data.csv')),
          loadCSV<XRFRow>(csvUrl('xrf_data.csv')),
          loadCSV<PregroutingRow>(csvUrl('pregrouting_data.csv')),
          loadCSV<ManometerPositionRow>(csvUrl('manometer_position.csv')),
          loadCSV<ManometerDataRow>(csvUrl('manometer_data.csv')),
          loadCSV<PiezometerPositionRow>(csvUrl('piezometer_position.csv')),
          loadPiezoData(csvUrl('piezometer_data.csv')),
          loadCSV<DrillHoleRow>(csvUrl('drill_holes_data.csv')),
        ])

        if (cancelled) return

        const alignByRing = buildAlignMap(alignRaw)

        // ── Alignment / profile ─────────────────────────────────────────────
        const alignment: AlignPoint[] = alignRaw.map(r => ({
          ch: r.chainage, lat: r.lat, lon: r.lon,
          easting: r.easting, northing: r.northing,
          dir: r.tunnel_dir,
          tunnelElev: r.tunnel_elev, surfaceElev: r.surface_elev, soilBaseElev: r.soil_base_elev,
        }))

        const profile: ProfilePoint[] = alignRaw.map(r => ({
          ch: r.chainage, tunnelElev: r.tunnel_elev,
          surfaceElev: r.surface_elev, soilBaseElev: r.soil_base_elev, soilDepth: r.soil_depth,
        }))

        // ── TBM ────────────────────────────────────────────────────────────
        const tbm: TBMRecord[] = tbmRaw
          .map(r => {
            const al = alignByRing.get(r.ring) ?? findAlignByChain(alignRaw, r.chainage)
            if (!al) return null
            const ts = parseDateStr(r.timestamp)
            return {
              ch: r.chainage, ring: r.ring,
              thrust: r['Total Advance Force (kN)' as keyof TBMRow] as number ?? 0,
              torque: r['Torque (MNm)' as keyof TBMRow] as number ?? 0,
              rpm: r['Cutterhead Rotation (rev/min)' as keyof TBMRow] as number ?? 0,
              pen_rev: r['Penetration (mm/rev)' as keyof TBMRow] as number ?? 0,
              pen_hr: r['Penetration (m/h)' as keyof TBMRow] as number ?? 0,
              fpi: r['FPI' as keyof TBMRow] as number ?? 0,
              lat: al.lat, lon: al.lon, dir: al.tunnel_dir,
              ts, ringTypeIdx: RING_TYPE_MAP[r.ring_type] ?? 0,
              ringType: r.ring_type ?? 'C1-R1',
            } as TBMRecord
          })
          .filter((r): r is TBMRecord => r !== null && r.ts > 0)

        // Sort by timestamp then chainage
        tbm.sort((a, b) => a.ts - b.ts || a.ch - b.ch)

        // ── XRF ────────────────────────────────────────────────────────────
        const xrf: XRFRecord[] = xrfRaw
          .map(r => {
            const al = alignByRing.get(r.ring) ?? findAlignByChain(alignRaw, r.chainage)
            if (!al) return null
            return {
              ch: r.chainage, ring: r.ring, lat: al.lat, lon: al.lon, dir: al.tunnel_dir,
              S: r.S ?? 0, U: r.U ?? 0, NP_AP: r['NP:AP' as keyof XRFRow] as number ?? 0,
              Fe_S: r['Fe:S' as keyof XRFRow] as number ?? 0,
              Ca: r.Ca ?? 0, Fe: r.Fe ?? 0, Al: r.Al ?? 0,
              K: r.K ?? 0, Si: r.Si ?? 0, Ti: r.Ti ?? 0, Mg: r.Mg ?? 0,
            } as XRFRecord
          })
          .filter((r): r is XRFRecord => r !== null)

        // ── Grouting ──────────────────────────────────────────────────────
        const grout: GroutRecord[] = groutRaw
          .map(r => {
            const al = findAlignByChain(alignRaw, r.chainage)
            if (!al) return null
            const ts = parseDateStr(r.date)
            return {
              ch: r.chainage,
              screenLen: r.screen_length_m ?? 24,
              lat: al.lat, lon: al.lon, dir: al.tunnel_dir,
              ts, inleakage: r.inleakage_l_per_min ?? 0,
              injVol: r.injection_volume_litres ?? 0,
              cement: r.injection_qty_kg ?? 0,
              drillM: r.total_drillmeters ?? 0,
              capacity: r.capacity ?? 0,
              duration: r.totel_time ?? 0,  // CSV has typo "totel_time"
              packers: r.packers ?? 0,
              drillType: r.drill_type ?? '',
            } as GroutRecord
          })
          .filter((r): r is GroutRecord => r !== null && r.ts > 0)

        // ── Manometers ────────────────────────────────────────────────────
        // Build time series per sensor
        const manoSeriesMap = new Map<string, Array<[number, number, number]>>()
        for (const d of manoData) {
          const ts = parseDateStr(d.date)
          if (!ts) continue
          const arr = manoSeriesMap.get(d.manometer_id) ?? []
          arr.push([ts, d.pressure_bar ?? 0, d.pressure_elev ?? 0])
          manoSeriesMap.set(d.manometer_id, arr)
        }

        const manometers: ManometerSensor[] = manoPos
          .map(p => {
            const al = findAlignByChain(alignRaw, p.chainage_m)
            if (!al) return null
            const series = manoSeriesMap.get(p.manometer_id) ?? []
            series.sort((a, b) => a[0] - b[0])
            return {
              id: p.manometer_id, name: p.name, ch: p.chainage_m,
              elev: p.manometer_elev, lat: al.lat, lon: al.lon, series,
            } as ManometerSensor
          })
          .filter((m): m is ManometerSensor => m !== null)

        // ── Piezometers ───────────────────────────────────────────────────
        const piezometers: PiezometerSensor[] = piezPos
          .filter(p => p.lat && p.lon)
          .map(p => {
            const posId = String(p.id)
            // Find matching series from wide-format data file
            let sensorName = ''
            let series: Array<[number, number]> = []
            for (const candidate of normalisePiezoId(posId)) {
              if (piezSeriesMap.has(candidate)) {
                sensorName = candidate
                series = piezSeriesMap.get(candidate)!
                series.sort((a, b) => a[0] - b[0])
                break
              }
            }
            return {
              id: posId, lat: p.lat, lon: p.lon,
              method: p.method ?? '', depth: p.depth ?? 0,
              soilClass: p.soil_classification ?? '',
              sensorName, series,
            }
          })

        // ── Drill holes ───────────────────────────────────────────────────
        const drillHoles = drillRaw
          .filter(r => {
            const n = typeof r['Hole No'] === 'number'
              ? r['Hole No']
              : parseInt(String(r['Hole No']))
            return !isNaN(n) && n >= 1 && n <= 24
          })
          .map(r => ({
            advance: r.Advance,
            holeNo: typeof r['Hole No'] === 'number'
              ? r['Hole No']
              : parseInt(String(r['Hole No'])),
            length: r.hole_length ?? 0,
            inleakage: r.inleakage ?? 0,
          }))

        // ── Bounds ────────────────────────────────────────────────────────
        const tsArr = tbm.map(t => t.ts).filter(t => t > 0)
        const chArr = tbm.map(t => t.ch)

        if (cancelled) return

        setData({
          tbm, xrf, grout, drillHoles, alignment, profile, manometers, piezometers,
          tsMin: Math.min(...tsArr),
          tsMax: Math.max(...tsArr),
          chMin: Math.min(...chArr),
          chMax: Math.max(...chArr),
        })
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { data, error }
}
