import { useStore } from '../../store/useStore'
import type { ThreeDLayerKey } from '../../types'
import mpStyles from '../map/MapPanel.module.css'
import styles from '../profile/ProfilePanel.module.css'

const LAYER_META: { key: ThreeDLayerKey; label: string; color: string }[] = [
  { key: 'tunnel',     label: 'Tunnel',       color: '#00d4ff' },
  { key: 'tbm',        label: 'TBM',          color: '#cccccc' },
  { key: 'rings',      label: 'Ring outlines', color: 'rgba(0,212,255,0.4)' },
  { key: 'terrain',    label: 'Terrain',       color: 'rgba(100,140,100,0.7)' },
  { key: 'piezos',     label: 'Piezometers',  color: '#f472b6' },
  { key: 'drillholes', label: 'Drill holes',   color: '#93c5fd' },
]

export function ThreeDPanel() {
  const threedLayers      = useStore(s => s.threedLayers)
  const toggleThreedLayer = useStore(s => s.toggleThreedLayer)

  return (
    <div className={mpStyles.panel}>
      <div className={mpStyles.ps}>
        <div className={mpStyles.sectionHdr} style={{ pointerEvents: 'none' }}>
          <span className={mpStyles.pt} style={{ margin: 0 }}>Layers</span>
        </div>
        <div className={mpStyles.sectionBody}>
          <ul className={styles.layerList}>
            {LAYER_META.map(({ key, label, color }) => (
              <li key={key} className={styles.layerItem} onClick={() => toggleThreedLayer(key)}>
                <div className={`${styles.toggle} ${threedLayers[key] ? styles.on : ''}`} />
                <div className={styles.swatch} style={{ background: color }} />
                <span className={styles.layerLbl}>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
