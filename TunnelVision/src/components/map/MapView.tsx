import { useEffect, useRef, useState } from 'react'
import { MapPanel } from './MapPanel'
import { LeafletMap } from './LeafletMap'
import { useStore } from '../../store/useStore'
import type { AppData } from '../../types'
import styles from './MapView.module.css'

interface Props { data: AppData | null }

export function MapView({ data }: Props) {
  const [panelOpen, setPanelOpen] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const exportPNGTick   = useStore(s => s.exportPNGTick)
  const activeView      = useStore(s => s.activeView)

  useEffect(() => {
    if (exportPNGTick === 0 || activeView !== 'map') return
    async function run() {
      const el = mapContainerRef.current; if (!el) return
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        useCORS: true, allowTaint: true, backgroundColor: null,
        scale: window.devicePixelRatio || 1,
      })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `MapView_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.png`
      a.click()
    }
    run()
  }, [exportPNGTick])

  return (
    <div className={`${styles.mapView} ${panelOpen ? styles.panelOpen : ''}`} style={{ position: 'relative' }}>
      <div className={styles.workspace}>
        {/* Desktop: panel inline. Mobile: panel as overlay */}
        <div className={`${styles.panelOverlay} ${panelOpen ? styles.open : ''}`}>
          <MapPanel data={data} />
        </div>
        <div ref={mapContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <LeafletMap data={data} />
        </div>
      </div>

      {/* Tap-outside backdrop (mobile only, when panel open) */}
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 540,
            background: 'rgba(0,0,0,0.45)',
          }}
          className={styles.backdrop}
        />
      )}

      {/* Mobile-only hamburger toggle */}
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
