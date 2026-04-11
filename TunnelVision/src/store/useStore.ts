import { create } from 'zustand'
import type { ChannelState, LayerKey, ProfParam, ProfLayerKey } from '../types'
import { getDefaultClasses, PARAMS } from '../data/params'

export type ViewId = 'map' | 'profile' | '3d'

function makeChannel(param: string, scaleMin: number, scaleMax: number, discrete: boolean): ChannelState {
  return {
    param, group: 'tbm', visible: true,
    scaleMin, scaleMax, inverted: false,
    maxLen: 80, discrete,
    classes: discrete ? getDefaultClasses(param) : null,
  }
}

const DEFAULT_LAYER_VIS: Record<LayerKey, boolean> = {
  tunnel: true, center: true, markers: true, rings: true,
  grout: true, piezos: true, mano: false,
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

  // Map opacity
  barOpacity: number
  setBarOpacity: (v: number) => void

  // Basemap
  basemap: 'voyager' | 'dark' | 'sat'
  setBasemap: (b: 'voyager' | 'dark' | 'sat') => void

  // Grout param
  groutParam: string
  setGroutParam: (p: string) => void

  // Selected sensor (for chart popup)
  selectedSensor: { type: 'piezometer' | 'manometer'; id: string } | null
  setSelectedSensor: (s: { type: 'piezometer' | 'manometer'; id: string } | null) => void

  // Zoom-to-TBM trigger (increment to fire)
  zoomToTBMTick: number
  triggerZoomToTBM: () => void

  // Profile view
  profParam: ProfParam
  setProfParam: (p: ProfParam) => void
  profLayers: Record<ProfLayerKey, boolean>
  toggleProfLayer: (k: ProfLayerKey) => void
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
      // If param changed, reset classes & scale
      if (patch.param && patch.param !== s.channels[side].param) {
        const def = PARAMS[patch.param]
        ch.scaleMin = def?.min ?? 0
        ch.scaleMax = def?.max ?? 1
        if (ch.discrete) ch.classes = getDefaultClasses(patch.param)
      }
      return { channels: { ...s.channels, [side]: ch } }
    }),

  layerVis: { ...DEFAULT_LAYER_VIS },
  toggleLayer: key =>
    set(s => ({ layerVis: { ...s.layerVis, [key]: !s.layerVis[key] } })),
  layerOrder: ['piezos', 'mano', 'tunnel', 'center', 'rings', 'grout', 'markers'],
  setLayerOrder: order => set({ layerOrder: order }),

  barOpacity: 0.8,
  setBarOpacity: v => set({ barOpacity: v }),

  basemap: 'voyager',
  setBasemap: b => set({ basemap: b }),

  groutParam: 'inleakage',
  setGroutParam: p => set({ groutParam: p }),

  selectedSensor: null,
  setSelectedSensor: s => set({ selectedSensor: s }),

  zoomToTBMTick: 0,
  triggerZoomToTBM: () => set(s => ({ zoomToTBMTick: s.zoomToTBMTick + 1 })),

  profParam: 'fpi',
  setProfParam: p => set({ profParam: p }),
  profLayers: { grout: true, piezos: true, mano: true, soil: true, rock: true },
  toggleProfLayer: k =>
    set(s => ({ profLayers: { ...s.profLayers, [k]: !s.profLayers[k] } })),
}))
