import { useEffect } from 'react'
import { useAppData } from './hooks/useAppData'
import { useStore } from './store/useStore'
import { Header } from './components/layout/Header'
import { ViewSwitcher } from './components/layout/ViewSwitcher'
import { MapView } from './components/map/MapView'
import { DateBar } from './components/map/DateBar'
import { ProfileView } from './components/profile/ProfileView'
import { ThreeDView } from './components/threed/ThreeDView'
import { GraphsView } from './components/graphs/GraphsView'
import { SensorChart } from './components/shared/SensorChart'

export function App() {
  const { data, error } = useAppData()
  const activeView  = useStore(s => s.activeView)
  const setTsBounds = useStore(s => s.setTsBounds)

  // Initialise time bounds once data is loaded
  useEffect(() => {
    if (data) setTsBounds(data.tsMin, data.tsMax)
  }, [data])

  if (error) {
    return (
      <div style={{
        flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--mono)', color:'#f87171', fontSize:13, textAlign:'center', padding:40,
      }}>
        Failed to load data:<br /><span style={{color:'var(--text2)',marginTop:8,display:'block'}}>{error}</span>
      </div>
    )
  }

  return (
    <>
      <Header data={data} />

      <ViewSwitcher />

      {/* Loading overlay */}
      {!data && (
        <div style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'var(--mono)', color:'var(--accent)', fontSize:12, letterSpacing:2,
        }}>
          <span style={{ animation:'pulse 1.5s infinite' }}>LOADING DATA…</span>
        </div>
      )}

      {/* Views */}
      {data && (
        <>
          <div style={{ display: activeView === 'map'     ? 'flex' : 'none', flex:1, flexDirection:'column', overflow:'hidden', minHeight:0 }}>
            <MapView data={data} />
          </div>
          <div style={{ display: activeView === 'profile' ? 'flex' : 'none', flex:1, flexDirection:'column', overflow:'hidden', minHeight:0 }}>
            <ProfileView data={data} />
          </div>
          <div style={{ display: activeView === '3d'      ? 'flex' : 'none', flex:1, flexDirection:'column', overflow:'hidden', minHeight:0 }}>
            <ThreeDView data={data} />
          </div>
          <div style={{ display: activeView === 'graphs'  ? 'flex' : 'none', flex:1, flexDirection:'column', overflow:'hidden', minHeight:0 }}>
            <GraphsView data={data} />
          </div>
        </>
      )}

      {/* Date bar — always visible below all views */}
      {data && <DateBar data={data} />}

      {/* Sensor chart modal — rendered on top of all views */}
      {data && <SensorChart data={data} />}
    </>
  )
}
