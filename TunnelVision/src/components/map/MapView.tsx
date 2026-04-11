import { useState } from 'react'
import { MapPanel } from './MapPanel'
import { LeafletMap } from './LeafletMap'
import type { AppData } from '../../types'
import styles from './MapView.module.css'

interface Props { data: AppData | null }

export function MapView({ data }: Props) {
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <div className={`${styles.mapView} ${panelOpen ? styles.panelOpen : ''}`} style={{ position: 'relative' }}>
      <div className={styles.workspace}>
        {/* Desktop: panel inline. Mobile: panel as overlay */}
        <div className={`${styles.panelOverlay} ${panelOpen ? styles.open : ''}`}>
          <MapPanel data={data} />
        </div>
        <LeafletMap data={data} />
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
