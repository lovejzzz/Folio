# Minicharts kit (vendored)

`kit.ts` holds, as text, four files of the Minicharts skill by April Zhu (https://april-zhu.com/minicharts,
downloaded 2026-11-09), MIT (see `LICENSE` and `NOTICE.md`): `assets/engine.js` (the pen, wash, solids and chart
kit), `assets/examples.js` (the 54 example drawings, whose helpers a drawing may call), `references/types.md` and
`references/kit.md` (what the drawing call is shown). Nothing is changed. The page, run script and checker of the
skill are not copied: Folio draws a card in its own frame and checks it itself.

To update: put the new skill folder somewhere, run `node scripts/vendor-minicharts.mjs <folder>`, and run the draw
package's tests.
