import { useState } from 'react'
import styles from './LoginScreen.module.css'

// SHA-256 hashes of the passwords (pre-computed, never store plain text)
const CREDENTIALS: Record<string, string> = {
  admin: '55711a637df67a096d3921856bea73a98dd2080c75b96095faa919bce6857716',
  guest: '6b93ccba414ac1d0ae1e77f3fac560c748a6701ed6946735a49d463351518e16',
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface Props {
  onLogin: (user: string) => void
}

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const hash     = await sha256hex(password)
      const expected = CREDENTIALS[username.toLowerCase()]

      if (expected && hash === expected) {
        sessionStorage.setItem('tv_user', username.toLowerCase())
        onLogin(username.toLowerCase())
      } else {
        setError('Invalid username or password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoHex} />
          <div className={styles.logoText}>TUNNEL<span>VISION</span></div>
        </div>

        <p className={styles.sub}>Enter your credentials to continue</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Username</label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.btn} disabled={loading || !username || !password}>
            {loading ? 'Checking…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
