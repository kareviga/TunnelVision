import type { ParamDef, DiscreteClass } from '../types'

export const PARAMS: Record<string, ParamDef> = {
  none:     { label: '— None —',      unit: '',     dataKey: 'tbm', field: 'fpi',    min: 0,     max: 1 },
  thrust:   { label: 'Thrust Force',  unit: 'kN',   dataKey: 'tbm', field: 'thrust', min: 1526,  max: 14290 },
  torque:   { label: 'Torque',        unit: 'MNm',  dataKey: 'tbm', field: 'torque', min: 0.4,   max: 3.02 },
  rpm:      { label: 'RPM',           unit: 'rpm',  dataKey: 'tbm', field: 'rpm',    min: 2.0,   max: 8.2 },
  pen_rev:  { label: 'Pen mm/rev',    unit: 'mm/r', dataKey: 'tbm', field: 'pen_rev',min: 0,     max: 23.4 },
  pen_hr:   { label: 'Pen m/h',       unit: 'm/h',  dataKey: 'tbm', field: 'pen_hr', min: 0,     max: 6.8 },
  fpi:      { label: 'FPI',           unit: 'kN/c', dataKey: 'tbm', field: 'fpi',    min: 0,     max: 77 },
  xrf_S:    { label: 'S',             unit: '%',    dataKey: 'xrf', field: 'S',      min: 0.12,  max: 1.23 },
  xrf_U:    { label: 'U',             unit: '%',    dataKey: 'xrf', field: 'U',      min: 0,     max: 0.03 },
  xrf_NPAP: { label: 'NP:AP',         unit: '',     dataKey: 'xrf', field: 'NP_AP',  min: 0.07,  max: 16.9 },
  xrf_FeS:  { label: 'Fe:S',          unit: '',     dataKey: 'xrf', field: 'Fe_S',   min: 0.38,  max: 7.16 },
  xrf_Ca:   { label: 'Ca',            unit: '%',    dataKey: 'xrf', field: 'Ca',     min: 0.27,  max: 12.4 },
  xrf_Fe:   { label: 'Fe',            unit: '%',    dataKey: 'xrf', field: 'Fe',     min: 0.90,  max: 6.71 },
  xrf_Al:   { label: 'Al',            unit: '%',    dataKey: 'xrf', field: 'Al',     min: 0.01,  max: 7.90 },
  xrf_K:    { label: 'K',             unit: '%',    dataKey: 'xrf', field: 'K',      min: 0.08,  max: 3.47 },
  xrf_Si:   { label: 'Si',            unit: '%',    dataKey: 'xrf', field: 'Si',     min: 0,     max: 17.7 },
  xrf_Ti:   { label: 'Ti',            unit: '%',    dataKey: 'xrf', field: 'Ti',     min: 0.007, max: 0.59 },
  xrf_Mg:   { label: 'Mg',            unit: '%',    dataKey: 'xrf', field: 'Mg',     min: 0.07,  max: 3.07 },
}

export const TBM_PARAMS = ['none', 'thrust', 'torque', 'rpm', 'pen_rev', 'pen_hr', 'fpi']
export const XRF_PARAMS = ['xrf_S', 'xrf_U', 'xrf_NPAP', 'xrf_FeS', 'xrf_Ca', 'xrf_Fe', 'xrf_Al', 'xrf_K', 'xrf_Si', 'xrf_Ti', 'xrf_Mg']

export const RAMP: [number, string][] = [
  [0, '#0055ff'], [0.25, '#00ccdd'], [0.5, '#aaff00'], [0.75, '#ff8800'], [1, '#ff0000'],
]

export const FPI_RAMP: [number, string][] = [
  [0, '#8b0000'], [10/60, '#cc0000'], [15/60, '#cc0000'], [20/60, '#ff6600'],
  [25/60, '#ffcc00'], [35/60, '#22c55e'], [45/60, '#3b82f6'], [1.0, '#0a1a5c'],
]

export const DEFAULT_CLASSES: Record<string, DiscreteClass[]> = {
  fpi: [
    { from: 0,  to: 10,       color: '#7f0000' }, { from: 10, to: 15, color: '#cc0000' },
    { from: 15, to: 20,       color: '#ff6600' }, { from: 20, to: 30, color: '#ffcc00' },
    { from: 30, to: 40,       color: '#22c55e' }, { from: 40, to: 60, color: '#3b82f6' },
    { from: 60, to: Infinity, color: '#0a1a5c' },
  ],
  thrust: [
    { from: 0,     to: 4000,     color: '#1e3a5f' }, { from: 4000,  to: 7000,     color: '#2563eb' },
    { from: 7000,  to: 10000,    color: '#22c55e' }, { from: 10000, to: 12000,    color: '#f59e0b' },
    { from: 12000, to: Infinity, color: '#dc2626' },
  ],
  torque: [
    { from: 0,   to: 0.8,     color: '#1e3a5f' }, { from: 0.8, to: 1.5,     color: '#2563eb' },
    { from: 1.5, to: 2.2,     color: '#22c55e' }, { from: 2.2, to: 2.7,     color: '#f59e0b' },
    { from: 2.7, to: Infinity, color: '#dc2626' },
  ],
  rpm: [
    { from: 0, to: 3, color: '#1e3a5f' }, { from: 3, to: 5, color: '#22c55e' },
    { from: 5, to: 7, color: '#f59e0b' }, { from: 7, to: Infinity, color: '#dc2626' },
  ],
  pen_rev: [
    { from: 0, to: 4,         color: '#1e3a5f' }, { from: 4,  to: 8,         color: '#2563eb' },
    { from: 8, to: 14,        color: '#22c55e' }, { from: 14, to: 18,        color: '#f59e0b' },
    { from: 18, to: Infinity, color: '#dc2626' },
  ],
  pen_hr: [
    { from: 0,   to: 1,        color: '#1e3a5f' }, { from: 1,   to: 2,        color: '#2563eb' },
    { from: 2,   to: 3.5,      color: '#22c55e' }, { from: 3.5, to: 5,        color: '#f59e0b' },
    { from: 5,   to: Infinity, color: '#dc2626' },
  ],
}

export function getDefaultClasses(param: string): DiscreteClass[] {
  if (DEFAULT_CLASSES[param]) return DEFAULT_CLASSES[param].map(c => ({ ...c }))
  const def = PARAMS[param]
  if (def?.dataKey === 'xrf') {
    const range = def.max - def.min
    return [
      { from: def.min,              to: def.min + range * 0.33, color: '#1e3a5f' },
      { from: def.min + range*0.33, to: def.min + range * 0.66, color: '#22c55e' },
      { from: def.min + range*0.66, to: Infinity,                color: '#dc2626' },
    ]
  }
  return [{ from: 0, to: Infinity, color: '#3b82f6' }]
}

// ── Grout attribute catalogue ─────────────────────────────────────────────────

export interface GroutParamDef {
  label: string
  unit: string
  field: string   // keyof GroutRecord
  max: number
}

export const GROUT_PARAMS: Record<string, GroutParamDef> = {
  inleakage: { label: 'Inleakage',     unit: 'L/min', field: 'inleakage', max: 200  },
  injVol:    { label: 'Inj. volume',   unit: 'L',     field: 'injVol',    max: 5000 },
  cement:    { label: 'Cement qty',    unit: 'kg',    field: 'cement',    max: 3000 },
  drillM:    { label: 'Drillmeters',   unit: 'm',     field: 'drillM',    max: 500  },
  duration:  { label: 'Duration',      unit: 'min',   field: 'duration',  max: 600  },
  packers:   { label: 'Packers',       unit: '',      field: 'packers',   max: 20   },
}

export const GROUT_PARAM_KEYS = ['inleakage', 'injVol', 'cement', 'drillM', 'duration', 'packers']

export const RING_TYPE_COLORS: Record<string, string> = {
  'C1-R1': '#22c55e',
  'C2-R2': '#eab308',
  'C2-R2b': '#111111',
  'C2-R3': '#ef4444',
}

export const GROUT_RAMP: [number, string][] = [
  [0, '#1a237e'], [0.2, '#0288d1'], [0.4, '#26a69a'], [0.6, '#f9a825'], [0.8, '#e64a19'], [1, '#b71c1c'],
]
