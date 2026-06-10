import { useStore, type ViewId } from '../../store/useStore'
import styles from './ViewSwitcher.module.css'

const TABS: { id: ViewId; label: string }[] = [
  { id: 'map',     label: 'Map View' },
  { id: 'profile', label: 'Profile View' },
  { id: '3d',      label: '3D View' },
  { id: 'reports', label: 'Reports' },
  { id: 'summary', label: 'Section Summary' },
]

export function ViewSwitcher() {
  const activeView = useStore(s => s.activeView)
  const setView    = useStore(s => s.setView)

  return (
    <div className={styles.switcher}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`${styles.tab} ${activeView === tab.id ? styles.active : ''}`}
          onClick={() => setView(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
