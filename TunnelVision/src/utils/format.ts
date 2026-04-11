const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_U = MONTHS.map(m => m.toUpperCase())

export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000)
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDateShort(ts: number): string {
  const d = new Date(ts * 1000)
  return `${MONTHS_U[d.getMonth()]} ${d.getFullYear()}`
}

export function formatCH(ch: number): string {
  const km = Math.floor(ch / 1000)
  const m  = Math.round(ch % 1000)
  return `${km}+${String(m).padStart(3,'0')}`
}

/** Parse "DD.MM.YYYY HH:MM", "DD.MM.YYYY", or "YYYY-MM-DD[ HH:MM:SS]" → unix timestamp (seconds) */
export function parseDateStr(s: string): number {
  if (!s || !s.trim()) return 0
  const t = s.trim()
  // ISO-style: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const ts = Math.floor(new Date(t.replace(' ', 'T')).getTime() / 1000)
    return isNaN(ts) ? 0 : ts
  }
  // Norwegian DD.MM.YYYY HH:MM or DD.MM.YYYY
  const [datePart, timePart] = t.split(' ')
  const [d, mo, y] = datePart.split('.').map(Number)
  const [h=0, mi=0] = (timePart || '').split(':').map(Number)
  const ts = Math.floor(new Date(y, mo-1, d, h, mi).getTime() / 1000)
  return isNaN(ts) ? 0 : ts
}
