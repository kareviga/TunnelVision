import type { AppData } from '../types'
import { fmtDate, formatCH } from './format'

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function exportTBM(data: AppData): void {
  const header = ['Chainage','Ring','Date','Thrust (kN)','Torque (MNm)','RPM','Pen mm/rev','Pen m/h','FPI (kN/c)','Ring Type','Lat','Lon']
  const rows = data.tbm.map(t => [
    formatCH(t.ch), String(t.ring), fmtDate(t.ts),
    String(t.thrust), String(t.torque), String(t.rpm),
    String(t.pen_rev), String(t.pen_hr), String(t.fpi),
    t.ringType, String(t.lat), String(t.lon),
  ])
  downloadCSV('tbm_export.csv', [header, ...rows])
}

export function exportGrout(data: AppData): void {
  const header = ['Chainage','Date','Screen Length (m)','Drill Type','Inleakage (L/min)','Injection Vol (L)','Cement (kg)','Drill Metres','Capacity (m/hr)','Duration (hr)','Packers']
  const rows = data.grout.map(g => [
    formatCH(g.ch), fmtDate(g.ts), String(g.screenLen), g.drillType,
    String(g.inleakage), String(g.injVol), String(g.cement),
    String(g.drillM), String(g.capacity), String(g.duration), String(g.packers),
  ])
  downloadCSV('grouting_export.csv', [header, ...rows])
}

export function exportXRF(data: AppData): void {
  const header = ['Chainage','Ring','S','U','NP:AP','Fe:S','Ca','Fe','Al','K','Si','Ti','Mg']
  const rows = data.xrf.map(x => [
    formatCH(x.ch), String(x.ring),
    String(x.S), String(x.U), String(x.NP_AP), String(x.Fe_S),
    String(x.Ca), String(x.Fe), String(x.Al), String(x.K),
    String(x.Si), String(x.Ti), String(x.Mg),
  ])
  downloadCSV('xrf_export.csv', [header, ...rows])
}

export async function exportXLSX(data: AppData): Promise<void> {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  const tbmHeader = ['Chainage','Ring','Date','Thrust kN','Torque MNm','RPM','Pen mm/rev','Pen m/h','FPI kN/c','Ring Type']
  const tbmRows   = data.tbm.map(t => [formatCH(t.ch), t.ring, fmtDate(t.ts), t.thrust, t.torque, t.rpm, t.pen_rev, t.pen_hr, t.fpi, t.ringType])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tbmHeader, ...tbmRows]), 'TBM')

  const groutHeader = ['Chainage','Date','Screen m','Drill Type','Inleakage L/min','Vol L','Cement kg']
  const groutRows   = data.grout.map(g => [formatCH(g.ch), fmtDate(g.ts), g.screenLen, g.drillType, g.inleakage, g.injVol, g.cement])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([groutHeader, ...groutRows]), 'Grouting')

  const xrfHeader = ['Chainage','Ring','S','U','NP:AP','Fe:S','Ca','Fe','Al','K','Si','Ti','Mg']
  const xrfRows   = data.xrf.map(x => [formatCH(x.ch), x.ring, x.S, x.U, x.NP_AP, x.Fe_S, x.Ca, x.Fe, x.Al, x.K, x.Si, x.Ti, x.Mg])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([xrfHeader, ...xrfRows]), 'XRF')

  XLSX.writeFile(wb, 'tunnelvision_export.xlsx')
}
