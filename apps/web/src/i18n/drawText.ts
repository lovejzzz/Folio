/**
 * The words of drawn slide pictures: on the slide, under it, and in Settings. Kept apart from the words every page
 * loads: only a course with slides open, or the settings, read them.
 */
export const drawText = {
  drawing: 'Drawing the picture…',
  failed: 'This picture could not be drawn. The slide’s words stand without it.',
  alt: (of: string, parts: string[]) => [of, ...parts].filter(Boolean).join('; '),
  saveSvg: 'Save as SVG',
  savePng: 'Save as PNG',
  remove: 'Remove the picture',
  redraw: 'Draw it again',
  drawThis: 'Draw this slide',
  drawHint: 'What to draw, if you have an idea (optional)',
  drawHintExample: 'e.g. as marbles in a tray, or as a loop',
  drawCost: 'One AI request, about as much as writing a slide.',
  working: 'Drawing…',
  noDrawing: 'Nothing on this slide could be drawn from its own words.',
  credit: 'Drawn with Minicharts by April Zhu',
  setting: {
    name: 'Draw pictures for slides',
    note: 'While a lesson is written, the AI draws up to two of its slides as pictures of their own subject: a life cycle as a loop of stages, a ratio as marbles in a tray. Each picture is one more AI request, so it is off unless you turn it on. You can always draw a single slide from under it.',
    about: 'What does this do?',
    demoAlt: 'An example: three life cycles (bean, butterfly, frog) drawn as loops of stages.',
    demoCaption: 'A slide’s table of three life cycles, drawn as three loops.',
  },
};
