import PptxGenJS from 'pptxgenjs';
import type { Block, SemanticDoc } from '@folio/core';
import { printFonts, printPalette } from '@folio/ui/tokens';

/**
 * Slide decks in the "paper and ink" look: paper background, Georgia ink
 * titles, a thin slides-tab bar on the right edge and a small lesson footer.
 */

type Slide = Extract<Block, { t: 'slide' }>;
type PptSlide = PptxGenJS.Slide;

const MASTER = 'FOLIO_PAPER';
const W = 13.333;
const H = 7.5;
const LEFT = 0.8;
const TEXT_W = W - LEFT - 1.0;
const TAB_W = 0.12;

interface Faces {
  title: string;
  body: string;
  ui: string;
  lang: string;
}

function faces(doc: SemanticDoc): Faces {
  if (doc.language === 'zh-CN') {
    return { title: printFonts.zhHeading, body: printFonts.zhBody, ui: printFonts.zhBody, lang: 'zh-CN' };
  }
  return { title: printFonts.heading, body: printFonts.body, ui: printFonts.ui, lang: 'en-US' };
}

function defineMaster(pptx: PptxGenJS, f: Faces): void {
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: printPalette.paper },
    objects: [
      { rect: { x: W - TAB_W, y: 0, w: TAB_W, h: H, fill: { color: printPalette.tab.slides }, line: { type: 'none' } } },
      { line: { x: LEFT, y: H - 0.72, w: W - LEFT - 0.8, h: 0, line: { color: printPalette.rule, width: 0.75 } } },
    ],
    slideNumber: { x: W - 1.6, y: H - 0.62, w: 0.8, h: 0.34, fontFace: f.ui, fontSize: 11, color: printPalette.ink2, align: 'right' },
  });
}

function footer(slide: PptSlide, f: Faces, lesson: string): void {
  if (!lesson) return;
  slide.addText(lesson, {
    x: LEFT,
    y: H - 0.62,
    w: W - LEFT - 2.6,
    h: 0.34,
    fontFace: f.ui,
    fontSize: 11,
    color: printPalette.ink2,
    lang: f.lang,
    margin: 0,
    valign: 'middle',
  });
}

function bulletRuns(items: string[], f: Faces, size: number, lettered: boolean): PptxGenJS.TextProps[] {
  return items.map((text) => ({
    text,
    options: {
      bullet: lettered ? { type: 'number', numberType: 'alphaUcPeriod' } : { indent: 22 },
      fontFace: f.body,
      fontSize: size,
      color: printPalette.ink2,
      lang: f.lang,
      paraSpaceAfter: 10,
      breakLine: true,
    },
  }));
}

function titleSlide(slide: PptSlide, s: Slide, f: Faces): void {
  slide.addText(s.title, {
    x: LEFT, y: 1.6, w: TEXT_W, h: 2.4, fontFace: f.title, fontSize: 48, color: printPalette.ink,
    valign: 'bottom', fit: 'shrink', lang: f.lang, margin: 0,
  });
  slide.addShape('line', { x: LEFT, y: 4.25, w: 1.4, h: 0, line: { color: printPalette.tab.slides, width: 2 } });
  if (s.bullets.length) {
    slide.addText(s.bullets.join('\n'), {
      x: LEFT, y: 4.5, w: TEXT_W, h: 1.8, fontFace: f.body, fontSize: 22, color: printPalette.ink2,
      valign: 'top', fit: 'shrink', lang: f.lang, margin: 0, paraSpaceAfter: 6,
    });
  }
}

function bulletsSlide(slide: PptSlide, s: Slide, f: Faces): void {
  slide.addText(s.title, {
    x: LEFT, y: 0.55, w: TEXT_W, h: 1.1, fontFace: f.title, fontSize: 32, color: printPalette.ink,
    valign: 'bottom', fit: 'shrink', lang: f.lang, margin: 0,
  });
  if (s.bullets.length) {
    slide.addText(bulletRuns(s.bullets, f, 22, false), {
      x: LEFT, y: 1.95, w: TEXT_W, h: 4.6, valign: 'top', fit: 'shrink', margin: 0,
    });
  }
}

function questionSlide(slide: PptSlide, s: Slide, f: Faces): void {
  slide.addText(s.title, {
    x: LEFT, y: 0.9, w: TEXT_W, h: 2.3, fontFace: f.title, fontSize: 36, color: printPalette.ink,
    valign: 'middle', fit: 'shrink', lang: f.lang, margin: 0,
  });
  if (s.bullets.length) {
    slide.addText(bulletRuns(s.bullets, f, 24, true), {
      x: LEFT + 0.3, y: 3.5, w: TEXT_W - 0.3, h: 3.0, valign: 'top', fit: 'shrink', margin: 0,
    });
  }
}

function quoteSlide(slide: PptSlide, s: Slide, f: Faces): void {
  slide.addText(s.title, {
    x: LEFT + 0.6, y: 1.2, w: TEXT_W - 1.2, h: 3.4, fontFace: f.title, fontSize: 38, italic: true,
    color: printPalette.ink, valign: 'middle', fit: 'shrink', lang: f.lang, margin: 0,
  });
  if (s.bullets.length) {
    slide.addText(s.bullets.join('\n'), {
      x: LEFT + 0.6, y: 4.8, w: TEXT_W - 1.2, h: 1.4, fontFace: f.body, fontSize: 20, color: printPalette.ink2,
      align: 'right', valign: 'top', fit: 'shrink', lang: f.lang, margin: 0,
    });
  }
}

const LAYOUTS: Record<Slide['layout'], (slide: PptSlide, s: Slide, f: Faces) => void> = {
  title: titleSlide,
  bullets: bulletsSlide,
  question: questionSlide,
  quote: quoteSlide,
};

/** Some pptxgenjs builds return a Node Buffer or ArrayBuffer; normalise to a plain Uint8Array. */
function toBytes(out: string | ArrayBuffer | Blob | Uint8Array): Uint8Array {
  if (out instanceof Uint8Array) return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  throw new Error('The slide deck could not be written.');
}

/**
 * A 16:9 deck with one slide per slide block. Speaker notes come from the
 * block's notes, which only the teacher copy carries. A deck with no slides
 * gets a single title slide so the file still opens.
 */
export async function renderPptx(doc: SemanticDoc): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  const f = faces(doc);
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = doc.subtitle ? `${doc.subtitle} · ${doc.title}` : doc.title;
  pptx.subject = doc.title;
  pptx.theme = { headFontFace: f.title, bodyFontFace: f.body };
  defineMaster(pptx, f);
  let slides = doc.blocks.filter((b): b is Slide => b.t === 'slide');
  if (!slides.length) {
    slides = [{ t: 'slide', n: 1, layout: 'title', title: doc.title, bullets: doc.subtitle ? [doc.subtitle] : [], lesson: '' }];
  }
  for (const s of slides) {
    const slide = pptx.addSlide({ masterName: MASTER });
    LAYOUTS[s.layout](slide, s, f);
    footer(slide, f, s.lesson);
    if (s.notes) slide.addNotes(s.notes);
  }
  return toBytes(await pptx.write({ outputType: 'uint8array', compression: true }));
}
