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

/** The Latin faces every page shows before anything else: the display serif, the interface sans and the reading serif. */
const FIRST_PAINT = /^assets\/(instrument-serif-latin-400-normal|instrument-sans-latin-wdth-normal|source-serif-4-latin-opsz-normal)-[\w-]+\.woff2$/;

/**
 * Preload the faces the first screen needs. Otherwise the browser finds them only once the stylesheet is parsed,
 * and the home page heading is drawn in a fallback face and then redrawn.
 */
export function preloadFonts(): Plugin {
  return {
    name: 'folio:preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return;
        return Object.keys(ctx.bundle)
          .filter((file) => FIRST_PAINT.test(file))
          .map((file) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head' as const }));
      },
    },
  };
}
