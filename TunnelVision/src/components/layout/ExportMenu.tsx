import { useState, useRef, useEffect } from 'react'
import { exportTBM, exportGrout, exportXRF, exportXLSX } from '../../utils/export'
import type { AppData } from '../../types'
import styles from './ExportMenu.module.css'

interface Props { data: AppData | null }

export function ExportMenu({ data }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!data) return null

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.btn} onClick={() => setOpen(o => !o)}>
        ↓ EXPORT
      </button>
      {open && (
        <div className={styles.menu}>
          <button onClick={() => { exportTBM(data); setOpen(false) }}>TBM Data (CSV)</button>
          <button onClick={() => { exportGrout(data); setOpen(false) }}>Grouting (CSV)</button>
          <button onClick={() => { exportXRF(data); setOpen(false) }}>XRF Data (CSV)</button>
          <div className={styles.divider} />
          <button onClick={() => { exportXLSX(data); setOpen(false) }}>All Data (XLSX)</button>
        </div>
      )}
    </div>
  )
}
