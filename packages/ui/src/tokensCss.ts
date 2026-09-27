import { color, font, layout, motion, radius, shadow, size, tab, type Pair } from './tokens';

/** Renders tokens.ts as CSS custom properties plus a Tailwind @theme block. */

function vars(mode: keyof Pair): string[] {
  const lines = Object.entries(color).map(([name, v]) => `  --folio-${name}: ${v[mode]};`);
  lines.push(...Object.entries(tab).map(([name, v]) => `  --folio-tab-${name}: ${v[mode]};`));
  lines.push(...Object.entries(shadow).map(([name, v]) => `  --folio-shadow-${name}: ${v[mode]};`));
  lines.push(`  color-scheme: ${mode};`);
  return lines;
}

export function renderTokens(): string {
  const lineHeights: Record<number, number> = { 12: 16, 13: 18, 14: 20, 16: 24, 17: 28, 18: 26, 22: 30, 28: 36, 36: 44, 48: 54, 64: 68 };
  const theme = [
    '  --color-*: initial;',
    ...Object.keys(color).map((name) => `  --color-${name}: var(--folio-${name});`),
    ...Object.keys(tab).map((name) => `  --color-tab-${name}: var(--folio-tab-${name});`),
    '  --font-*: initial;',
    ...Object.entries(font).map(([name, v]) => `  --font-${name}: ${v};`),
    '  --text-*: initial;',
    ...Object.values(size).flatMap((px) => [`  --text-${px}: ${px}px;`, `  --text-${px}--line-height: ${lineHeights[px]}px;`]),
    '  --radius-*: initial;',
    `  --radius-control: ${radius.control}px;`,
    `  --radius-sheet: ${radius.sheet}px;`,
    `  --radius-full: ${radius.round}px;`,
    '  --shadow-*: initial;',
    ...Object.keys(shadow).map((name) => `  --shadow-${name}: var(--folio-shadow-${name});`),
    `  --ease-ink: ${motion.ease};`,
    ...Object.entries(layout).map(([name, px]) => `  --container-${name}: ${px}px;`),
  ];
  const motionVars = Object.entries(motion)
    .filter(([k]) => k !== 'ease')
    .map(([k, v]) => `  --motion-${k}: ${v}ms;`);
  return [
    '/* Generated from tokens.ts by `pnpm tokens`. Do not edit by hand. */',
    '',
    ':root {',
    ...vars('light'),
    ...motionVars,
    `  --motion-ease: ${motion.ease};`,
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    "  :root:not([data-theme='light']) {",
    ...vars('dark').map((l) => `  ${l}`),
    '  }',
    '}',
    '',
    ":root[data-theme='dark'] {",
    ...vars('dark'),
    '}',
    '',
    '/* Paper is white: printing always uses the light palette, whatever the theme. */',
    '@media print {',
    '  :root:root:root {',
    ...vars('light').map((l) => `  ${l}`),
    '  }',
    '}',
    '',
    '@theme inline {',
    ...theme,
    '}',
    '',
  ].join('\n');
}
