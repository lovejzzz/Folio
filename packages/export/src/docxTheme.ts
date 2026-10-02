import {
  AlignmentType,
  BorderStyle,
  LevelFormat,
  convertMillimetersToTwip,
  type IBorderOptions,
  type IFontAttributesProperties,
  type INumberingOptions,
  type IStylesOptions,
} from 'docx';
import type { Language } from '@folio/core';
import { printFonts, printPalette } from '@folio/ui/tokens';

/**
 * The look of every Word file Folio writes: Georgia on light paper, ink
 * headings, hairline rules. Colours come from the print palette only.
 */

export const MARGIN = convertMillimetersToTwip(22);

/** US Letter for English, A4 for Chinese: what each classroom's printer holds. */
export function pageSize(language: Language): { width: number; height: number } {
  return language === 'zh-CN' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 };
}

export function contentWidth(language: Language): number {
  return pageSize(language).width - 2 * MARGIN;
}

export type FontRole = 'heading' | 'body';

/** Latin face for ascii/hAnsi, and an East Asian face for Chinese courses. */
export function fontFor(language: Language, role: FontRole): IFontAttributesProperties {
  const latin = role === 'heading' ? printFonts.heading : printFonts.body;
  if (language !== 'zh-CN') return { ascii: latin, hAnsi: latin, cs: latin };
  const cjk = role === 'heading' ? printFonts.zhHeading : printFonts.zhBody;
  return { ascii: latin, hAnsi: latin, cs: latin, eastAsia: cjk };
}

export const hairline: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: printPalette.rule };

/** Half-points, as Word counts font sizes. */
export const SIZE = { body: 22, lead: 25, small: 18, h1: 40, h2: 30, h3: 25, h4: 23 };

/** 1.35 line spacing in Word's 240ths. */
const LINE = Math.round(240 * 1.35);

function heading(language: Language, size: number, before: number, bold: boolean) {
  return {
    run: { font: fontFor(language, 'heading'), size, bold, color: printPalette.ink },
    paragraph: { spacing: { before, after: 120, line: 276 }, keepNext: true, keepLines: true },
  };
}

export function documentStyles(language: Language): IStylesOptions {
  const zh = language === 'zh-CN';
  const body = {
    run: {
      font: fontFor(language, 'body'),
      size: SIZE.body,
      color: printPalette.ink,
      ...(zh ? { language: { value: 'zh-CN', eastAsia: 'zh-CN' } } : {}),
    },
    paragraph: { spacing: { line: LINE, after: 120 } },
  };
  return {
    // The headings are based on Normal and followed by it, so it has to exist: without it, Pages carried a
    // heading's bold and size on into the plain paragraphs after it.
    paragraphStyles: [{ id: 'Normal', name: 'Normal', quickFormat: true, ...body }],
    default: {
      document: body,
      heading1: heading(language, SIZE.h1, 0, false),
      heading2: heading(language, SIZE.h2, 360, false),
      heading3: heading(language, SIZE.h3, 280, true),
      heading4: heading(language, SIZE.h4, 200, true),
    },
  };
}

export const BULLETS = 'folio-bullets';
export const NUMBERS = 'folio-numbers';

export function numbering(): INumberingOptions {
  const indent = { left: 567, hanging: 340 };
  return {
    config: [
      {
        reference: BULLETS,
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent }, run: { color: printPalette.ink2 } },
          },
        ],
      },
      {
        reference: NUMBERS,
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent } },
          },
        ],
      },
    ],
  };
}
