import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MARK_ANGLES, MARK_PAGE, markTransform } from '../../../packages/ui/src/domain/mark';
import { color } from '../../../packages/ui/src/tokens';

/**
 * Makes the icons from the mark: favicon.svg (light and dark), apple-touch-icon.png, and the mark in og.png.
 * Run after changing the mark: `pnpm brand` (PW_CHROMIUM points at a Chromium when Playwright's isn't installed).
 */

const PUBLIC = (name: string) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const FILLS = ['mark-back', 'mark-mid', 'accent'] as const;

/** The three pages; `edge` draws each in the colour behind it so they stay apart. */
function pages(fill: (i: number) => string, edge?: string): string {
  return MARK_ANGLES.map((angle, i) => {
    const turn = markTransform(angle);
    const stroke = edge ? ` stroke="${edge}" stroke-width="1.5" stroke-linejoin="round"` : '';
    return `<rect x="${MARK_PAGE.x}" y="${MARK_PAGE.y}" width="${MARK_PAGE.width}" height="${MARK_PAGE.height}" rx="${MARK_PAGE.rx}"${turn ? ` transform="${turn}"` : ''} ${fill(i)}${stroke}/>`;
  }).join('');
}

function favicon(): string {
  const rule = (mode: 'light' | 'dark') => FILLS.map((f, i) => `.p${i}{fill:${color[f][mode]}}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>${rule('light')}@media (prefers-color-scheme:dark){${rule('dark')}}</style>
  ${pages((i) => `class="p${i}"`)}
</svg>
`;
}

const lightMark = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${pages((i) => `fill="${color[FILLS[i]!].light}"`, color.desk.light)}</svg>`;

/** The app icon: the mark on the desk colour, as a phone shows it on its home screen. */
async function touchIcon(page: import('@playwright/test').Page): Promise<void> {
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(`<body style="margin:0;background:${color.desk.light};display:grid;place-items:center;height:180px">${lightMark(136)}</body>`);
  writeFileSync(PUBLIC('apple-touch-icon.png'), await page.screenshot());
}

/** The share image keeps its layout; only the mark beside the wordmark is drawn anew. */
async function shareImage(page: import('@playwright/test').Page): Promise<void> {
  const og = `data:image/png;base64,${readFileSync(PUBLIC('og.png')).toString('base64')}`;
  await page.setViewportSize({ width: 1200, height: 630 });
  // Sent as text: tsx names the functions it compiles, and the page has no helper for that.
  const draw = `(async () => {
    const load = (src) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(img); img.src = src; });
    const canvas = Object.assign(document.createElement('canvas'), { width: 1200, height: 630 });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(await load(${JSON.stringify(og)}), 0, 0);
    // The mark's square, left of the wordmark: cleared to the desk, then the mark.
    ctx.fillStyle = ${JSON.stringify(color.desk.light)};
    ctx.fillRect(78, 74, 56, 56);
    ctx.drawImage(await load(${JSON.stringify(`data:image/svg+xml;base64,${Buffer.from(lightMark(52)).toString('base64')}`)}), 80, 76, 52, 52);
    return canvas.toDataURL('image/png').split(',')[1];
  })()`;
  const png = (await page.evaluate(draw)) as string;
  writeFileSync(PUBLIC('og.png'), Buffer.from(png, 'base64'));
}

writeFileSync(PUBLIC('favicon.svg'), favicon());
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
await touchIcon(page);
await shareImage(page);
await browser.close();
process.stdout.write('Wrote favicon.svg, apple-touch-icon.png and og.png\n');
