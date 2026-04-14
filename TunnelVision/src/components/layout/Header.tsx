import { useStore } from '../../store/useStore'
import { fmtDateShort } from '../../utils/format'
import type { AppData } from '../../types'
import styles from './Header.module.css'

interface Props { data: AppData | null }

export function Header({ data }: Props) {
  const currentTs   = useStore(s => s.currentTs)
  const theme       = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const tbm = data?.tbm ?? []
  const vis  = tbm.filter(t => t.ts <= currentTs)
  const last = vis.length ? vis[vis.length - 1] : tbm[0]

  return (
    <header className={styles.header}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoHex} />
        <div className={styles.logoText}>TUNNEL<span>VISION</span></div>
      </div>

      {/* Desktop: theme toggle only */}
      <div className={styles.right}>
        <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle light/dark mode">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>

      {/* Mobile second line */}
      <div className={styles.mobileInfo}>
        <div className={styles.mobileInfoItem}>
          <span className={styles.liveDot} />
          RING {last ? last.ring.toLocaleString() : '—'}
        </div>
        <div className={styles.mobileInfoItem}>
          {currentTs ? fmtDateShort(currentTs) : '—'}
        </div>
        <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle light/dark mode">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}
