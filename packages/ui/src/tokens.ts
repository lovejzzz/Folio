import type { MaterialKind } from '@folio/core';

/**
 * Every visual value in Folio lives here. `scripts/build-tokens.ts` turns
 * this file into CSS custom properties and a Tailwind @theme block, and the
 * exporters read the light palette so printed files match the screen.
 */

export interface Pair {
  light: string;
  dark: string;
}

export const color = {
  desk: { light: '#F3F0E8', dark: '#141512' },
  paper: { light: '#FCFBF7', dark: '#1C1D19' },
  /** A sunken surface inside paper: wells, code, table heads. */
  well: { light: '#F6F3EC', dark: '#22231F' },
  ink: { light: '#1E1C17', dark: '#ECE8DF' },
  'ink-2': { light: '#5C584F', dark: '#B3AEA3' },
  /** Hints and placeholders at large sizes only. */
  'ink-3': { light: '#8A857A', dark: '#807B71' },
  rule: { light: '#E3DED3', dark: '#2E2F2A' },
  'rule-strong': { light: '#CFC8BA', dark: '#45463F' },
  /** Boundaries of inputs and other controls: 3:1 against paper and well. */
  field: { light: '#928C7F', dark: '#75716A' },
  accent: { light: '#2B46C4', dark: '#8FA3FF' },
  'accent-ink': { light: '#FFFFFF', dark: '#11152E' },
  'accent-tint': { light: '#EDF0FC', dark: '#23284A' },
  good: { light: '#37704E', dark: '#7CC39A' },
  attention: { light: '#94600E', dark: '#E0B060' },
  'attention-tint': { light: '#FBF1DE', dark: '#3A2F17' },
  critical: { light: '#B23C2B', dark: '#F08C7C' },
  'critical-tint': { light: '#FBE9E5', dark: '#3D1F1A' },
  highlight: { light: 'rgb(255 233 138 / 0.55)', dark: 'rgb(217 185 58 / 0.28)' },
  scrim: { light: 'rgb(30 28 23 / 0.04)', dark: 'rgb(0 0 0 / 0.35)' },
} satisfies Record<string, Pair>;

export type ColorToken = keyof typeof color;

/** Binder tabs: equal-lightness, low-chroma hues so no material shouts. */
export const tab: Record<MaterialKind, Pair> = {
  map: { light: '#5B6B7F', dark: '#7D8CA0' },
  syllabus: { light: '#4E5FB0', dark: '#8494E3' },
  plan: { light: '#2F8078', dark: '#4FA79E' },
  slides: { light: '#C0673F', dark: '#D98560' },
  assignments: { light: '#B38A2E', dark: '#CCA24A' },
  rubrics: { light: '#7C8A3E', dark: '#9AAA55' },
  discussions: { light: '#8A5A93', dark: '#B07FB9' },
  quiz: { light: '#B0546B', dark: '#D27990' },
  study: { light: '#3E7FA8', dark: '#62A2CC' },
  faq: { light: '#9A7B5C', dark: '#B8997A' },
};

export const font = {
  // 'Folio Math' is Source Serif 4 cut to letters and combining marks: the web subsets lack U+0302,
  // so a hat (β̂, û) came from another font and sat off its letter. It loads only for such a cluster.
  display: "'Instrument Serif', 'Folio Math', 'Noto Serif SC', 'Songti SC', serif",
  reading: "'Source Serif 4 Variable', 'Source Serif 4', 'Folio Math', 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', Georgia, serif",
  ui: "'Instrument Sans Variable', 'Instrument Sans', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

/** Type scale in px, roughly 1.25. Nothing smaller than 12. */
/** 17 is the reading size on sheets. */
export const size = { 12: 12, 13: 13, 14: 14, 16: 16, 17: 17, 18: 18, 22: 22, 28: 28, 36: 36, 48: 48, 64: 64 };

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96 };

export const radius = { control: 6, sheet: 10, round: 9999 };

export const shadow = {
  /** Includes the sheet's hairline edge, so sheets never need a border as well. */
  sheet: {
    light: '0 0 0 1px rgb(30 28 23 / 0.07), 0 1px 2px rgb(30 28 23 / 0.05), 0 3px 8px rgb(30 28 23 / 0.04)',
    dark: '0 0 0 1px rgb(255 255 255 / 0.06), 0 1px 3px rgb(0 0 0 / 0.5)',
  },
  overlay: { light: '0 12px 32px rgb(30 28 23 / 0.14), 0 2px 6px rgb(30 28 23 / 0.06)', dark: '0 12px 32px rgb(0 0 0 / 0.55)' },
};

/** Fixed widths: the printed sheet, the lesson rail, the drawer. */
/** `landscape` is the sheet turned on its side (A4: 720 × 297/210), for wide tables such as rubrics. */
export const layout = { sheet: 720, landscape: 1020, slide: 960, rail: 208, drawer: 400 };

export const motion = {
  quick: 120,
  settle: 200,
  reveal: 320,
  ripple: 600,
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
};

/** The light palette as plain hex without '#', for docx and pptx writers. */
export const printPalette = {
  ink: color.ink.light.slice(1),
  ink2: color['ink-2'].light.slice(1),
  rule: color.rule.light.slice(1),
  well: color.well.light.slice(1),
  paper: color.paper.light.slice(1),
  accent: color.accent.light.slice(1),
  tab: Object.fromEntries(Object.entries(tab).map(([k, v]) => [k, v.light.slice(1)])) as Record<MaterialKind, string>,
};

export const printFonts = {
  heading: 'Georgia',
  body: 'Georgia',
  ui: 'Arial',
  /** Code marked with backticks; ships with Office on Windows and Mac. */
  mono: 'Consolas',
  zhHeading: 'SimSun',
  zhBody: 'SimSun',
};
