import { useState, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { PARAMS, TBM_PARAMS, XRF_PARAMS, getDefaultClasses, GROUT_PARAMS, GROUT_PARAM_KEYS, RING_TYPE_COLORS } from '../../data/params'
import { discreteRampCSS, rampCSS, FPI_RAMP, RAMP } from '../../utils/color'
import type { AppData, LayerKey, DiscreteClass } from '../../types'
import styles from './MapPanel.module.css'

const LAYER_META: Record<LayerKey, { label: string; color: string; defaultColor: string; hasAttr?: boolean }> = {
  piezos:  { label: 'Piezometers',          color: '#f472b6',                                              defaultColor: '#f472b6' },
  mano:    { label: 'Manometers',           color: '#fb923c',                                              defaultColor: '#fb923c' },
  tunnel:  { label: 'Tunnel body',          color: 'rgba(0,212,255,.5)',                                   defaultColor: '#00d4ff' },
  center:  { label: 'Centreline',           color: '#00d4ff',                                              defaultColor: '#00d4ff' },
  rings:   { label: 'Ring types',           color: 'linear-gradient(to right,#22c55e,#eab308,#111,#ef4444)', defaultColor: '#22c55e' },
  grout:   { label: 'Drilling & grouting',  color: '#818cf8',                                              defaultColor: '#818cf8', hasAttr: true },
  markers: { label: 'CH markers',           color: '#888888',                                              defaultColor: '#888888' },
}

interface Props { data: AppData | null }

function Section({ title, sub, children, defaultOpen = true }: {
  title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.ps}>
      <button className={styles.sectionHdr} onClick={() => setOpen(o => !o)}>
        <span className={styles.pt} style={{ margin: 0 }}>{title}{sub && <span className={styles.ptSub}> {sub}</span>}</span>
        <span className={styles.chevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

export function MapPanel({ data: _data }: Props) {
  const channels        = useStore(s => s.channels)
  const updateChannel   = useStore(s => s.updateChannel)
  const layerVis        = useStore(s => s.layerVis)
  const toggleLayer     = useStore(s => s.toggleLayer)
  const layerOrder      = useStore(s => s.layerOrder)
  const setLayerOrder   = useStore(s => s.setLayerOrder)
  const layerStyles     = useStore(s => s.layerStyles)
  const updateLayerStyle = useStore(s => s.updateLayerStyle)
  const barOpacity      = useStore(s => s.barOpacity)
  const setBarOpacity   = useStore(s => s.setBarOpacity)

  const [scaleOpen, setScaleOpen] = useState<'right' | 'left' | null>(null)
  const [layerEdit, setLayerEdit] = useState<LayerKey | null>(null)

  const dragKey   = useRef<LayerKey | null>(null)
  const dragOver  = useRef<LayerKey | null>(null)

  function onDragStart(key: LayerKey) { dragKey.current = key }
  function onDragEnter(key: LayerKey) { dragOver.current = key }
  function onDragEnd() {
    const from = dragKey.current, to = dragOver.current
    dragKey.current = null; dragOver.current = null
    if (!from || !to || from === to) return
    const next = [...layerOrder]
    const fi = next.indexOf(from), ti = next.indexOf(to)
    next.splice(fi, 1); next.splice(ti, 0, from)
    setLayerOrder(next as LayerKey[])
  }

  function rampPreviewStyle(side: 'right' | 'left') {
    const ch = channels[side]
    if (ch.discrete && ch.classes?.length) return discreteRampCSS(ch.classes)
    if (ch.param === 'fpi') return rampCSS(FPI_RAMP, ch.inverted)
    return rampCSS(RAMP, ch.inverted)
  }

  function renderChannelCard(side: 'right' | 'left') {
    const ch  = channels[side]
    const def = PARAMS[ch.param] ?? PARAMS.none
    const paramKeys = ch.group === 'tbm' ? TBM_PARAMS : XRF_PARAMS
    const editorOpen = scaleOpen === side

    return (
      <div className={`${styles.channelCard} ${styles[side]}`} key={side}>
        <div className={styles.chHeader}>
          <div className={styles.chTitle}>{side === 'right' ? '▶ Right' : '◀ Left'}</div>
          <div className={`${styles.visToggle} ${ch.visible ? styles.on : ''}`}
            onClick={() => updateChannel(side, { visible: !ch.visible })} />
        </div>
        <div className={styles.groupTabs}>
          {(['tbm','xrf'] as const).map(g => (
            <div key={g} className={`${styles.gtab} ${ch.group === g ? styles.active : ''}`}
              onClick={() => updateChannel(side, { group: g, param: g === 'tbm' ? TBM_PARAMS[0] : XRF_PARAMS[0] })}
            >{g.toUpperCase()}</div>
          ))}
        </div>
        <select className={styles.paramSelect} value={ch.param}
          onChange={e => updateChannel(side, { param: e.target.value })}>
          {paramKeys.map(k => {
            const p = PARAMS[k]
            return <option key={k} value={k}>{p.label}{p.unit ? ` (${p.unit})` : ''}</option>
          })}
        </select>
        <button className={`${styles.rampBtn} ${editorOpen ? styles.rampBtnOpen : ''}`}
          onClick={() => setScaleOpen(editorOpen ? null : side)} title="Click to edit scale">
          <div className={styles.rampPreview} style={{ background: rampPreviewStyle(side) }} />
          <span className={styles.rampChevron}>{editorOpen ? '▴' : '▾'}</span>
        </button>
        {editorOpen && (
          <div className={styles.scaleEditor}>
            <div className={styles.scaleEditorRow}>
              <span className={styles.scaleLbl}>Mode</span>
              <button className={`${styles.modeBtn} ${ch.discrete ? styles.on : ''}`}
                onClick={() => {
                  const next = !ch.discrete
                  updateChannel(side, { discrete: next, classes: next && (!ch.classes?.length) ? getDefaultClasses(ch.param) : ch.classes })
                }}>DISCRETE</button>
            </div>
            {!ch.discrete && (
              <div className={styles.scaleRow}>
                <span className={styles.scaleLbl}>Min</span>
                <input className={styles.scaleInp} type="number" step="any" value={ch.scaleMin}
                  onChange={e => updateChannel(side, { scaleMin: parseFloat(e.target.value) || 0 })} />
                <span className={styles.scaleLbl}>Max</span>
                <input className={styles.scaleInp} type="number" step="any" value={ch.scaleMax}
                  onChange={e => updateChannel(side, { scaleMax: parseFloat(e.target.value) || 1 })} />
                <button className={styles.autoBtn}
                  onClick={() => updateChannel(side, { scaleMin: def.min, scaleMax: def.max, inverted: false })}>AUTO</button>
              </div>
            )}
            {ch.discrete && (
              <div className={styles.classEditor}>
                <div className={styles.classHeader}>
                  <span style={{width:44}}>From</span><span style={{width:44}}>To</span><span style={{width:22}}>Col</span>
                </div>
                {(ch.classes ?? []).map((cls, i) => {
                  const isLast = i === (ch.classes?.length ?? 0) - 1
                  return (
                    <div key={i} className={styles.classRow}>
                      <input className={styles.classFrom} type="number" step="any" value={cls.from}
                        onChange={e => { const next=[...(ch.classes??[])]; next[i]={...cls,from:parseFloat(e.target.value)||0}; updateChannel(side,{classes:next}) }} />
                      <input className={styles.classTo} type="number" step="any" value={isLast?'':cls.to} disabled={isLast} style={isLast?{opacity:0.4}:{}}
                        onChange={e => { const next=[...(ch.classes??[])]; next[i]={...cls,to:parseFloat(e.target.value)||0}; updateChannel(side,{classes:next}) }} />
                      <input className={styles.classColor} type="color" value={cls.color}
                        onChange={e => { const next=[...(ch.classes??[])]; next[i]={...cls,color:e.target.value}; updateChannel(side,{classes:next}) }} />
                      <button className={styles.classDel}
                        onClick={() => { if((ch.classes?.length??0)<=1)return; const next=(ch.classes??[]).filter((_,j)=>j!==i); next[next.length-1]={...next[next.length-1],to:Infinity}; updateChannel(side,{classes:next}) }}>×</button>
                    </div>
                  )
                })}
                <button className={styles.addClassBtn} onClick={() => {
                  const cls=ch.classes??[]; const last=cls[cls.length-1]
                  const newFrom=last?(isFinite(last.to)?last.to:last.from+10):0
                  const next:DiscreteClass[]=[...cls]
                  if(last)next[next.length-1]={...last,to:newFrom}
                  next.push({from:newFrom,to:Infinity,color:'#3b82f6'})
                  updateChannel(side,{classes:next})
                }}>+ Add class</button>
              </div>
            )}
            <div className={styles.barLenRow}>
              <div className={styles.barLenLbl}>Bar length</div>
              <input type="range" className={styles.sl} min={10} max={400} value={ch.maxLen}
                onChange={e => updateChannel(side, { maxLen: parseInt(e.target.value) })} />
              <span className={styles.scaleLbl}>{ch.maxLen}m</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <Section title="Display Channels" defaultOpen={true}>
        {renderChannelCard('right')}
        {renderChannelCard('left')}
      </Section>

      <Section title="Display" defaultOpen={true}>
        <div className={styles.opacityRow}>
          <div className={styles.opacityLbl}>Bar opacity</div>
          <input type="range" className={styles.sl} min={10} max={100} value={Math.round(barOpacity * 100)}
            onChange={e => setBarOpacity(parseInt(e.target.value) / 100)} />
          <div className={styles.opacityVal}>{Math.round(barOpacity * 100)}%</div>
        </div>
      </Section>

      <Section title="Layers" sub="drag to reorder" defaultOpen={true}>
        <ul className={styles.layerList}>
          {layerOrder.map(key => {
            const l = LAYER_META[key]
            if (!l) return null
            const isEditing = layerEdit === key
            const ls = layerStyles[key]
            return (
              <li key={key} className={`${styles.layerItem} ${layerVis[key] ? styles.active : ''}`}
                draggable onDragStart={() => onDragStart(key)} onDragEnter={() => onDragEnter(key)}
                onDragEnd={onDragEnd} onDragOver={e => e.preventDefault()}>

                {/* Main row — everything on one line */}
                <div className={styles.layerRow}>
                  <span className={styles.dragHandle}>⠿</span>
                  <button
                    className={`${styles.layerEditBtn} ${isEditing ? styles.layerEditBtnActive : ''}`}
                    onClick={e => { e.stopPropagation(); setLayerEdit(isEditing ? null : key) }}
                    title="Edit layer style"
                  >✎</button>
                  <div className={`${styles.toggle} ${layerVis[key] ? styles.on : ''}`} onClick={() => toggleLayer(key)} />
                  <button className={styles.layerRowBtn} onClick={() => toggleLayer(key)}>
                    <div className={styles.layerSwatch} style={{ background: l.color }} />
                    <div className={styles.layerLabel}>{l.label}</div>
                  </button>
                </div>

                {/* Inline editor — full width below the row */}
                {isEditing && (
                  <div className={styles.layerEditor}>
                    {/* Opacity */}
                    <div className={styles.leRow}>
                      <span className={styles.leLbl}>Opacity</span>
                      <input type="range" className={styles.sl} min={0} max={100} value={Math.round(ls.opacity * 100)}
                        onChange={e => updateLayerStyle(key, { opacity: parseInt(e.target.value) / 100 })} />
                      <span className={styles.leVal}>{Math.round(ls.opacity * 100)}%</span>
                    </div>
                    {/* Color override */}
                    {key !== 'rings' && (
                      <div className={styles.leRow}>
                        <span className={styles.leLbl}>Color</span>
                        <input type="color" value={ls.color ?? l.defaultColor}
                          onChange={e => updateLayerStyle(key, { color: e.target.value })}
                          style={{ width: 36, height: 22, padding: 1, border: '1px solid var(--border2)', borderRadius: 3, cursor:'pointer', background:'none' }} />
                        <button className={styles.autoBtn} style={{ fontSize: 8 }}
                          onClick={() => updateLayerStyle(key, { color: undefined })}>RESET</button>
                      </div>
                    )}
                    {/* Per ring-type colors */}
                    {key === 'rings' && (
                      <div className={styles.ringTypeGrid}>
                        {Object.entries(RING_TYPE_COLORS).map(([rt, defaultCol]) => (
                          <div key={rt} className={styles.ringTypeRow}>
                            <span className={styles.ringTypeLbl}>{rt}</span>
                            <input type="color"
                              value={ls.ringTypeColors?.[rt] ?? defaultCol}
                              onChange={e => updateLayerStyle(key, {
                                ringTypeColors: { ...(ls.ringTypeColors ?? {}), [rt]: e.target.value }
                              })}
                              style={{ width: 36, height: 22, padding: 1, border: '1px solid var(--border2)', borderRadius: 3, cursor:'pointer', background:'none' }} />
                            <button className={styles.autoBtn} style={{ fontSize: 8 }}
                              onClick={() => {
                                const next = { ...(ls.ringTypeColors ?? {}) }
                                delete next[rt]
                                updateLayerStyle(key, { ringTypeColors: Object.keys(next).length ? next : undefined })
                              }}>RESET</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Attribute selector for grout */}
                    {l.hasAttr && (
                      <div className={styles.leRow}>
                        <span className={styles.leLbl}>Color by</span>
                        <select className={styles.paramSelect} style={{ marginBottom: 0 }}
                          value={ls.attribute ?? 'inleakage'}
                          onChange={e => updateLayerStyle(key, { attribute: e.target.value })}
                          onClick={e => e.stopPropagation()}>
                          {GROUT_PARAM_KEYS.map(k => {
                            const p = GROUT_PARAMS[k]
                            return <option key={k} value={k}>{p.label}{p.unit ? ` (${p.unit})` : ''}</option>
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}
