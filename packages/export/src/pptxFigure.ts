import type PptxGenJS from 'pptxgenjs';
import { framePng, problemText, stillFigure } from '@folio/figures';
import { plainText, type Block } from '@folio/core';
import { printPalette } from '@folio/ui/tokens';

type Slide = Extract<Block, { t: 'slide' }>;
type Figure = Extract<NonNullable<Slide['visual']>, { kind: 'figure' }>;
type PptSlide = ReturnType<PptxGenJS['addSlide']>;

export interface FigureFaces {
  title: string;
  body: string;
  lang: string;
}

const LEFT = 0.8;
const WIDTH = 13.333 - LEFT - 1.0;

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function titled(slide: PptSlide, text: string, f: FigureFaces): void {
  slide.addText(plainText(text), { x: LEFT, y: 0.45, w: WIDTH, h: 0.9, fontFace: f.title, fontSize: 28, color: printPalette.ink, valign: 'bottom', fit: 'shrink', lang: f.lang, margin: 0 });
}

/**
 * A demonstration in a deck, which cannot move: a slide for each picture of the search, in order, with the step's
 * sentence under it, and a last slide with the table of steps. The pictures are made from the model, not taken of a
 * screen. `add` gives the next slide of the deck; the first keeps the speaker notes.
 */
export function figureSlides(add: () => PptSlide, s: Slide, figure: Figure, f: FigureFaces): void {
  const still = stillFigure(figure);
  const first = add();
  if (s.notes) first.addNotes(plainText(s.notes));
  if (still.problem) {
    titled(first, s.title, f);
    first.addText(problemText(still.problem), { x: LEFT, y: 1.8, w: WIDTH, h: 1, fontFace: f.body, fontSize: 18, color: printPalette.ink2, valign: 'top', lang: f.lang, margin: 0 });
    return;
  }
  const h = 4.1;
  const w = (h * still.width) / still.height;
  still.frames.forEach((frame, i) => {
    const slide = i ? add() : first;
    titled(slide, still.frames.length > 1 ? `${s.title} (${i + 1}/${still.frames.length})` : s.title, f);
    slide.addImage({ data: `image/png;base64,${base64(framePng(frame.svg))}`, x: LEFT + (WIDTH - w) / 2, y: 1.45, w, h, altText: frame.caption });
    slide.addText(frame.caption, { x: LEFT, y: 5.6, w: WIDTH, h: 1.0, fontFace: f.body, fontSize: 16, color: printPalette.ink, align: 'center', valign: 'top', fit: 'shrink', lang: f.lang, margin: 0 });
  });
  if (!still.table.rows.length) return;
  const last = add();
  titled(last, s.title, f);
  const cell = (text: string, head: boolean) => ({ text, options: { bold: head, fontFace: f.body, fontSize: 13, color: printPalette.ink, fill: { color: head ? printPalette.well : printPalette.paper }, valign: 'middle' as const } });
  const share = [0.07, 0.43, 0.16, 0.12, 0.22];
  last.addTable([still.table.columns.map((c) => cell(c, true)), ...still.table.rows.map((r) => r.map((c) => cell(c, false)))], { x: LEFT, y: 1.6, w: WIDTH, colW: share.map((p) => p * WIDTH), border: { type: 'solid', pt: 0.75, color: printPalette.rule }, margin: 0.08 });
}
