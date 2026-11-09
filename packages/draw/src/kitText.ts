/*! Minicharts by April Zhu (https://april-zhu.com/minicharts). MIT License, Copyright (c) 2026 April Zhu. Exploded-view conventions adapted from diagram-design by Cathryn Lavery (MIT). Gaegu and Young Serif: SIL Open Font License 1.1. */
/**
 * The kit as text, and the two hands as data: about 450 KB, so it is its own module, loaded only where a drawing is
 * drawn or a drawing call is written. Nothing on the first page imports it.
 */
export { ENGINE, EXAMPLES, TYPES, KIT } from './vendor/minicharts/kit';
export { GAEGU, YOUNG_SERIF } from './vendor/fonts';
