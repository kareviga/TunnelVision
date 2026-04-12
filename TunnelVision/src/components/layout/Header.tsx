import { useStore } from '../../store/useStore'
import { fmtDateShort, formatCH } from '../../utils/format'
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

      {/* Desktop stats */}
      <div className={styles.right}>
        <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle light/dark mode">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <div className={styles.stat}>
          <div className={styles.val}>CH 175 → 11,092m · Ø7.08m</div>
          <div>ALIGNMENT</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.val}>
            <span className={styles.liveDot} />
            RING {last ? last.ring.toLocaleString() : '—'}
          </div>
          <div>TBM POSITION</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.val}>{currentTs ? fmtDateShort(currentTs) : '—'}</div>
          <div>CURRENT DATE</div>
        </div>
        {last && (
          <div className={styles.stat}>
            <div className={styles.val}>{formatCH(last.ch)}</div>
            <div>CHAINAGE</div>
          </div>
        )}
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
