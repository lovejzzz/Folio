import type PptxGenJS from 'pptxgenjs';
import { plainText, type Block } from '@folio/core';
import { printPalette } from '@folio/ui/tokens';

type Visual = NonNullable<Extract<Block, { t: 'slide' }>['visual']>;
type Steps = Extract<Visual, { kind: 'steps' }>;
type Compare = Extract<Visual, { kind: 'compare' }>;
interface Faces {
  title: string;
  body: string;
  ui: string;
  lang: string;
}
interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A chain of steps as shapes and text of PowerPoint's own: a frame a step with its number, name and line, an arrow
 * between. A teacher can move, restyle or reword any of it there, as with the tables and charts.
 */
export function stepsOnSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, v: Steps, f: Faces, area: Area): void {
  const n = v.steps.length;
  const gap = 0.42;
  const w = (area.w - gap * (n - 1)) / n;
  // As tall as a name and a line or two need, no taller: a frame mostly empty read as a form to fill in.
  const h = v.steps.some((s) => s.detail) ? 1.9 : 1.2;
  const size = n > 4 ? 16 : 18;
  // A third of the way down the room it has: under the title, and not against it.
  const at = { ...area, y: area.y + (area.h - h) / 3 };
  v.steps.forEach((s, i) => {
    const x = at.x + i * (w + gap);
    slide.addShape(pptx.ShapeType.roundRect, { x, y: at.y, w, h, rectRadius: 0.08, fill: { color: printPalette.paper }, line: { color: printPalette.ink, width: 1.5 } });
    slide.addText(
      [
        { text: String(i + 1), options: { fontFace: f.ui, fontSize: size - 2, bold: true, color: printPalette.tab.slides, breakLine: true } },
        { text: plainText(s.title), options: { fontFace: f.ui, fontSize: size, bold: true, color: printPalette.ink, breakLine: Boolean(s.detail) } },
        ...(s.detail ? [{ text: plainText(s.detail), options: { fontFace: f.body, fontSize: size - 4, color: printPalette.ink2 } }] : []),
      ],
      { x: x + 0.14, y: at.y + 0.1, w: w - 0.28, h: h - 0.2, valign: 'middle', fit: 'shrink', lang: f.lang, margin: 0 },
    );
    if (i < n - 1) slide.addText('→', { x: x + w, y: at.y + h / 2 - 0.25, w: gap, h: 0.5, align: 'center', valign: 'middle', fontFace: f.ui, fontSize: 20, bold: true, color: printPalette.ink, margin: 0 });
  });
  if (v.cycle) slide.addText(f.lang === 'zh-CN' ? `然后回到“${plainText(v.steps[0]?.title ?? '')}”。` : `Then back to “${plainText(v.steps[0]?.title ?? '')}”.`, { x: at.x, y: at.y + h + 0.1, w: at.w, h: 0.4, fontFace: f.ui, fontSize: 13, color: printPalette.ink2, margin: 0, lang: f.lang });
}

/** Things side by side: a column each, its name over a heavy rule, its points under, and the question asked of them across the foot. */
export function compareOnSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, v: Compare, f: Faces, at: Area): void {
  const n = v.sides.length;
  const gap = 0.45;
  const w = (at.w - gap * (n - 1)) / n;
  // The columns are as tall as their points, so what is asked of them stands right under and not at the foot of the slide.
  const rows = Math.max(1, ...v.sides.map((s) => s.points.length));
  const h = Math.min(at.h - (v.ask ? 0.75 : 0), 0.95 + rows * 0.5);
  v.sides.forEach((s, i) => {
    const x = at.x + i * (w + gap);
    slide.addText(plainText(s.title), { x, y: at.y, w, h: 0.6, fontFace: f.ui, fontSize: 18, bold: true, color: printPalette.ink, valign: 'bottom', fit: 'shrink', lang: f.lang, margin: 0 });
    slide.addShape(pptx.ShapeType.line, { x, y: at.y + 0.68, w, h: 0, line: { color: i === 0 ? printPalette.tab.slides : printPalette.ink, width: 2.25 } });
    if (s.points.length) slide.addText(s.points.map((p, k) => ({ text: plainText(p), options: { breakLine: k < s.points.length - 1, paraSpaceAfter: 8 } })), { x, y: at.y + 0.82, w, h: h - 0.82, fontFace: f.body, fontSize: 16, color: printPalette.ink, valign: 'top', fit: 'shrink', lang: f.lang, margin: 0 });
  });
  if (v.ask) slide.addText(plainText(v.ask), { x: at.x, y: at.y + h + 0.25, w: at.w, h: 0.6, fontFace: f.ui, fontSize: 18, bold: true, color: printPalette.ink, valign: 'top', fit: 'shrink', lang: f.lang, margin: 0 });
}
