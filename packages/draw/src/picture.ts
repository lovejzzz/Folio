import { SHEET, type Drawn } from './program';

/**
 * A drawn card as one SVG that stands alone: the sheet's paper, the kit's styles for its writing and parts, and,
 * when asked, the two hands it writes in, carried inside as data. A picture made this way looks the same as an
 * <img>, on a canvas, or in a deck, and asks the network for nothing. Motion is left out: a slide holds still.
 */

export const PAPER = '#fbf6ec';

// From the skill's page (assets/page.html): the hand for names and values, the serif for the headline number.
const STYLE = `text{font-family:Gaegu,"Young Serif",sans-serif}text.it,text.cap{font-family:Gaegu,sans-serif;font-size-adjust:.43}text.it{letter-spacing:.3px}text.cap{letter-spacing:1px}text.ser{font-family:"Young Serif",Georgia,serif}.mv{animation:none}`;

const face = (name: string, base64: string): string => `@font-face{font-family:"${name}";src:url(data:font/woff2;base64,${base64}) format("woff2")}`;

export interface Fonts {
  GAEGU: string;
  YOUNG_SERIF: string;
}

/** The card as one SVG, `scale` times the sheet in pixels. */
export function pictureOf(drawn: Pick<Drawn, 'body' | 'name' | 'of'>, fonts?: Fonts, scale = 2): string {
  const faces = fonts ? face('Gaegu', fonts.GAEGU) + face('Young Serif', fonts.YOUNG_SERIF) : '';
  const label = `${drawn.name}: ${drawn.of}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="${SHEET.w * scale}" height="${SHEET.h * scale}" role="img" aria-label="${label}"><style>${faces}${STYLE}</style><rect width="${SHEET.w}" height="${SHEET.h}" fill="${PAPER}"/>${drawn.body}</svg>`;
}
