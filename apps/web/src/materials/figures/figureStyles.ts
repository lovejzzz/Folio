import { FIGURE_CSS } from '@folio/figures';

let adopted = false;

/**
 * The figures' own styles, added to the page once, as a stylesheet object: the site's policy takes no <style> written
 * into the page, and is not loosened for this. The rules are the Anatomy kit's, scoped under its `.iso` class.
 */
export function adoptFigureStyles(): void {
  if (adopted || typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in document)) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(FIGURE_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  adopted = true;
}
