import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { PARAMS, TBM_PARAMS, getDefaultClasses } from '../../data/params'
import { discreteRampCSS, rampCSS, FPI_RAMP, RAMP } from '../../utils/color'
import type { DiscreteClass } from '../../types'
import mpStyles from '../map/MapPanel.module.css'
import styles from './ProfilePanel.module.css'

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={mpStyles.ps}>
      <button className={mpStyles.sectionHdr} onClick={() => setOpen(o => !o)}>
        <span className={mpStyles.pt} style={{ margin: 0 }}>{title}</span>
        <span className={mpStyles.chevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className={mpStyles.sectionBody}>{children}</div>}
    </div>
  )
}

export function ProfilePanel() {
  const profChannel       = useStore(s => s.profChannel)
  const updateProfChannel = useStore(s => s.updateProfChannel)
  const profLayers        = useStore(s => s.profLayers)
  const toggleProfLayer   = useStore(s => s.toggleProfLayer)

  const [scaleOpen, setScaleOpen] = useState(false)

  const paramDef = PARAMS[profChannel.param] ?? PARAMS.fpi
  const paramKeys = TBM_PARAMS.filter(k => k !== 'none')

  function rampPreviewStyle() {
    if (profChannel.discrete && profChannel.classes?.length) return discreteRampCSS(profChannel.classes)
    if (profChannel.param === 'fpi') return rampCSS(FPI_RAMP, profChannel.inverted)
    return rampCSS(RAMP, profChannel.inverted)
  }

  return (
    <div className={mpStyles.panel}>

      {/* Parameter */}
      <Section title="Parameter">
        <select
          className={mpStyles.paramSelect}
          value={profChannel.param}
          onChange={e => updateProfChannel({ param: e.target.value })}
        >
          {paramKeys.map(k => {
            const p = PARAMS[k]
            return <option key={k} value={k}>{p.label}{p.unit ? ` (${p.unit})` : ''}</option>
          })}
        </select>

        {/* Ramp preview toggle */}
        <button
          className={`${mpStyles.rampBtn} ${scaleOpen ? mpStyles.rampBtnOpen : ''}`}
          onClick={() => setScaleOpen(o => !o)}
          title="Edit colour scale"
        >
          <div className={mpStyles.rampPreview} style={{ background: rampPreviewStyle() }} />
          <span className={mpStyles.rampChevron}>{scaleOpen ? '▴' : '▾'}</span>
        </button>

        {/* Scale editor */}
        {scaleOpen && (
          <div className={mpStyles.scaleEditor} style={{ marginTop: 6 }}>
            <div className={mpStyles.scaleEditorRow}>
              <span className={mpStyles.scaleLbl}>Mode</span>
              <button
                className={`${mpStyles.modeBtn} ${profChannel.discrete ? mpStyles.on : ''}`}
                onClick={() => {
                  const next = !profChannel.discrete
                  updateProfChannel({
                    discrete: next,
                    classes: next && !profChannel.classes?.length ? getDefaultClasses(profChannel.param) : profChannel.classes,
                  })
                }}
              >DISCRETE</button>
            </div>

            {!profChannel.discrete && (
              <div className={mpStyles.scaleRow}>
                <span className={mpStyles.scaleLbl}>Min</span>
                <input className={mpStyles.scaleInp} type="number" step="any" value={profChannel.scaleMin}
                  onChange={e => updateProfChannel({ scaleMin: parseFloat(e.target.value) || 0 })} />
                <span className={mpStyles.scaleLbl}>Max</span>
                <input className={mpStyles.scaleInp} type="number" step="any" value={profChannel.scaleMax}
                  onChange={e => updateProfChannel({ scaleMax: parseFloat(e.target.value) || 1 })} />
                <button className={mpStyles.autoBtn}
                  onClick={() => updateProfChannel({ scaleMin: paramDef.min, scaleMax: paramDef.max, inverted: false })}>
                  AUTO
                </button>
              </div>
            )}

            {profChannel.discrete && (
              <div className={mpStyles.classEditor}>
                <div className={mpStyles.classHeader}>
                  <span style={{width:44}}>From</span>
                  <span style={{width:44}}>To</span>
                  <span style={{width:22}}>Col</span>
                </div>
                {(profChannel.classes ?? []).map((cls, i) => {
                  const isLast = i === (profChannel.classes?.length ?? 0) - 1
                  return (
                    <div key={i} className={mpStyles.classRow}>
                      <input className={mpStyles.classFrom} type="number" step="any" value={cls.from}
                        onChange={e => {
                          const next = [...(profChannel.classes ?? [])]
                          next[i] = { ...cls, from: parseFloat(e.target.value) || 0 }
                          updateProfChannel({ classes: next })
                        }} />
                      <input className={mpStyles.classTo} type="number" step="any"
                        value={isLast ? '' : cls.to} disabled={isLast}
                        style={isLast ? { opacity: 0.4 } : {}}
                        onChange={e => {
                          const next = [...(profChannel.classes ?? [])]
                          next[i] = { ...cls, to: parseFloat(e.target.value) || 0 }
                          updateProfChannel({ classes: next })
                        }} />
                      <input className={mpStyles.classColor} type="color" value={cls.color}
                        onChange={e => {
                          const next = [...(profChannel.classes ?? [])]
                          next[i] = { ...cls, color: e.target.value }
                          updateProfChannel({ classes: next })
                        }} />
                      <button className={mpStyles.classDel}
                        onClick={() => {
                          if ((profChannel.classes?.length ?? 0) <= 1) return
                          const next = (profChannel.classes ?? []).filter((_, j) => j !== i)
                          next[next.length-1] = { ...next[next.length-1], to: Infinity }
                          updateProfChannel({ classes: next })
                        }}>×</button>
                    </div>
                  )
                })}
                <button className={mpStyles.addClassBtn}
                  onClick={() => {
                    const cls = profChannel.classes ?? []
                    const last = cls[cls.length-1]
                    const newFrom = last ? (isFinite(last.to) ? last.to : last.from + 10) : 0
                    const next: DiscreteClass[] = [...cls]
                    if (last) next[next.length-1] = { ...last, to: newFrom }
                    next.push({ from: newFrom, to: Infinity, color: '#3b82f6' })
                    updateProfChannel({ classes: next })
                  }}>+ Add class</button>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Layers */}
      <Section title="Layers">
        <ul className={styles.layerList}>
          {(['grout','mano','soil','rock'] as const).map(k => {
            const labels: Record<string,string> = { grout:'Drilling & grouting', mano:'Manometers', soil:'Soil', rock:'Rock' }
            const colors: Record<string,string> = { grout:'#818cf8', mano:'#60a5fa', soil:'rgba(160,120,70,.6)', rock:'rgba(90,110,140,.6)' }
            return (
              <li key={k} className={styles.layerItem} onClick={() => toggleProfLayer(k)}>
                <div className={`${styles.toggle} ${profLayers[k] ? styles.on : ''}`} />
                <div className={styles.swatch} style={{ background: colors[k] }} />
                <span className={styles.layerLbl}>{labels[k]}</span>
              </li>
            )
          })}
        </ul>
      </Section>

    </div>
  )
}
