import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { LoginScreen } from './components/layout/LoginScreen'
import './index.css'

document.documentElement.setAttribute('data-theme', 'light')

function Root() {
  const [user, setUser] = useState<string | null>(
    sessionStorage.getItem('tv_user'),
  )

  if (!user) return <LoginScreen onLogin={setUser} />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
