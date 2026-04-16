import { create } from 'zustand'
import type { ChannelState, LayerKey, ProfLayerKey, ThreeDLayerKey } from '../types'
import { getDefaultClasses, PARAMS } from '../data/params'

export interface LayerStyle {
  opacity: number    // 0–1 fill opacity
  color?: string     // optional color override (null = use default)
  attribute?: string // for grout: which attribute to color by
  ringTypeColors?: Record<string, string> // for rings: per-type color overrides
}

export interface PiezAnnotation {
  normalTs: number; normalVal: number   // baseline / normal pressure
  dropTs: number;   dropVal: number     // start of pressure drop
  recoveryTs: number; recoveryVal: number  // start of recovery
}

export type ViewId = 'map' | 'profile' | '3d' | 'graphs'

function makeChannel(param: string, scaleMin: number, scaleMax: number, discrete: boolean): ChannelState {
  return {
    param, group: 'tbm', visible: true,
    scaleMin, scaleMax, inverted: false,
    maxLen: 80, discrete,
    classes: discrete ? getDefaultClasses(param) : null,
  }
}

const DEFAULT_LAYER_VIS: Record<LayerKey, boolean> = {
  tunnel: false, center: true, markers: true, rings: true,
  grout: true, piezos: true, mano: false,
}

const DEFAULT_LAYER_STYLES: Record<LayerKey, LayerStyle> = {
  tunnel:  { opacity: 0.22 },
  center:  { opacity: 1 },
  markers: { opacity: 1 },
  rings:   { opacity: 1 },
  grout:   { opacity: 1, attribute: 'inleakage' },
  piezos:  { opacity: 1 },
  mano:    { opacity: 1 },
}

interface AppStore {
  // Views
  activeView: ViewId
  setView: (v: ViewId) => void

  // Date / playback
  currentTs: number
  tsMin: number
  tsMax: number
  setCurrentTs: (ts: number) => void
  setTsBounds: (min: number, max: number) => void

  // Channels (map view)
  channels: Record<'right' | 'left', ChannelState>
  updateChannel: (side: 'right' | 'left', patch: Partial<ChannelState>) => void

  // Map layers
  layerVis: Record<LayerKey, boolean>
  toggleLayer: (key: LayerKey) => void
  layerOrder: LayerKey[]
  setLayerOrder: (order: LayerKey[]) => void

  // Layer styles (opacity, color override, attribute)
  layerStyles: Record<LayerKey, LayerStyle>
  updateLayerStyle: (key: LayerKey, patch: Partial<LayerStyle>) => void

  // Map opacity (bar charts)
  barOpacity: number
  setBarOpacity: (v: number) => void

  // Basemap
  basemap: 'voyager' | 'dark' | 'sat'
  setBasemap: (b: 'voyager' | 'dark' | 'sat') => void

  // Selected sensor (for chart popup)
  selectedSensor: { type: 'piezometer' | 'manometer'; id: string } | null
  setSelectedSensor: (s: { type: 'piezometer' | 'manometer'; id: string } | null) => void

  // Slider dragging state — map skips expensive redraws while true
  isSliding: boolean
  setIsSliding: (v: boolean) => void

  // Zoom-to-TBM trigger (increment to fire)
  zoomToTBMTick: number
  triggerZoomToTBM: () => void

  // Piezometer annotations (stored per sensor ID)
  piezAnnotations: Record<string, PiezAnnotation>
  setPiezAnnotation: (id: string, patch: Partial<PiezAnnotation>) => void
  clearPiezAnnotation: (id: string) => void

  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void

  // Profile view
  profChannel: ChannelState
  updateProfChannel: (patch: Partial<ChannelState>) => void
  profLayers: Record<ProfLayerKey, boolean>
  toggleProfLayer: (k: ProfLayerKey) => void

  // 3D view
  threedLayers: Record<ThreeDLayerKey, boolean>
  toggleThreedLayer: (k: ThreeDLayerKey) => void

  // PNG export trigger (increment to fire in active view)
  exportPNGTick: number
  triggerExportPNG: () => void
}

export const useStore = create<AppStore>((set, get) => ({
  activeView: 'map',
  setView: v => set({ activeView: v }),

  currentTs: 0,
  tsMin: 0,
  tsMax: 0,
  setCurrentTs: ts => set({ currentTs: ts }),
  setTsBounds: (min, max) => set({ tsMin: min, tsMax: max, currentTs: max }),

  channels: {
    right: makeChannel('fpi',   0, 77,  true),
    left:  makeChannel('none',  0, 1,   false),
  },
  updateChannel: (side, patch) =>
    set(s => {
      const ch = { ...s.channels[side], ...patch }
      if (patch.param && patch.param !== s.channels[side].param) {
        const def = PARAMS[patch.param]
        ch.scaleMin = def?.min ?? 0
        ch.scaleMax = def?.max ?? 1
        if (ch.discrete) ch.classes = getDefaultClasses(patch.param)
      }
      const result: Partial<typeof s> = { channels: { ...s.channels, [side]: ch } }
      // Sync scale to profChannel when right channel and same param
      if (side === 'right') {
        const scaleKeys = ['scaleMin','scaleMax','discrete','classes','inverted'] as const
        const hasScale = scaleKeys.some(k => k in patch)
        if (hasScale && s.profChannel.param === ch.param) {
          const sp: Partial<ChannelState> = {}
          scaleKeys.forEach(k => { if (k in patch) (sp as Record<string,unknown>)[k] = ch[k] })
          result.profChannel = { ...s.profChannel, ...sp }
        }
      }
      return result
    }),

  layerVis: { ...DEFAULT_LAYER_VIS },
  toggleLayer: key =>
    set(s => ({ layerVis: { ...s.layerVis, [key]: !s.layerVis[key] } })),
  layerOrder: ['piezos', 'mano', 'tunnel', 'center', 'rings', 'grout', 'markers'],
  setLayerOrder: order => set({ layerOrder: order }),

  layerStyles: { ...DEFAULT_LAYER_STYLES },
  updateLayerStyle: (key, patch) =>
    set(s => ({ layerStyles: { ...s.layerStyles, [key]: { ...s.layerStyles[key], ...patch } } })),

  barOpacity: 0.8,
  setBarOpacity: v => set({ barOpacity: v }),

  basemap: 'voyager',
  setBasemap: b => set({ basemap: b }),

  selectedSensor: null,
  setSelectedSensor: s => set({ selectedSensor: s }),

  isSliding: false,
  setIsSliding: v => set({ isSliding: v }),

  zoomToTBMTick: 0,
  triggerZoomToTBM: () => set(s => ({ zoomToTBMTick: s.zoomToTBMTick + 1 })),

  piezAnnotations: {},
  setPiezAnnotation: (id, patch) => set(s => ({
    piezAnnotations: { ...s.piezAnnotations, [id]: { ...s.piezAnnotations[id], ...patch } as PiezAnnotation },
  })),
  clearPiezAnnotation: id => set(s => {
    const next = { ...s.piezAnnotations }
    delete next[id]
    return { piezAnnotations: next }
  }),

  theme: 'light',
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),

  profChannel: makeChannel('fpi', 0, 77, true),
  updateProfChannel: (patch) =>
    set(s => {
      let prof = { ...s.profChannel, ...patch }
      if (patch.param && patch.param !== s.profChannel.param) {
        if (s.channels.right.param === patch.param) {
          const { scaleMin, scaleMax, discrete, classes, inverted } = s.channels.right
          prof = { ...prof, scaleMin, scaleMax, discrete, classes, inverted }
        } else {
          const def = PARAMS[patch.param]
          prof.scaleMin = def?.min ?? 0
          prof.scaleMax = def?.max ?? 1
          if (prof.discrete) prof.classes = getDefaultClasses(patch.param)
        }
      }
      const result: Partial<typeof s> = { profChannel: prof }
      // Sync scale to right channel when same param
      const scaleKeys = ['scaleMin','scaleMax','discrete','classes','inverted'] as const
      const hasScale = scaleKeys.some(k => k in patch)
      if (hasScale && s.channels.right.param === prof.param) {
        const sp: Partial<ChannelState> = {}
        scaleKeys.forEach(k => { if (k in patch) (sp as Record<string,unknown>)[k] = prof[k] })
        result.channels = { ...s.channels, right: { ...s.channels.right, ...sp } }
      }
      return result
    }),
  profLayers: { grout: true, mano: true, soil: true, rock: true },
  toggleProfLayer: k =>
    set(s => ({ profLayers: { ...s.profLayers, [k]: !s.profLayers[k] } })),

  threedLayers: { tunnel: true, tbm: true, rings: true, terrain: true, piezos: true, drillholes: true },
  toggleThreedLayer: k =>
    set(s => ({ threedLayers: { ...s.threedLayers, [k]: !s.threedLayers[k] } })),

  exportPNGTick: 0,
  triggerExportPNG: () => set(s => ({ exportPNGTick: s.exportPNGTick + 1 })),
}))
