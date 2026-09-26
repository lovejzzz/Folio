import type { Plugin } from 'vite';

const UNUSED_SUBSETS = /-(cyrillic|cyrillic-ext|greek|greek-ext|vietnamese|math|symbols)-/;

/**
 * Trim Fontsource stylesheets at build time: keep only the woff2 files
 * (every supported browser reads them) and drop script subsets Folio never
 * shows. Chinese still loads on demand, subset by subset, via unicode-range.
 */
export function trimFonts(): Plugin {
  return {
    name: 'folio:trim-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource(-variable)?\/.+\.css$/.test(id)) return null;
      const blocks = code.split(/(?=\/\* [^*]+ \*\/\s*@font-face)/);
      const kept = blocks
        .filter((block) => {
          const name = block.match(/^\/\* ([^*]+) \*\//)?.[1] ?? '';
          return !UNUSED_SUBSETS.test(`${name}-`);
        })
        .map((block) => block.replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, ''));
      return { code: kept.join(''), map: null };
    },
  };
}
