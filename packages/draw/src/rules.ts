/**
 * What a drawing call is told, beside the kit's own reference (`references/kit.md`) and list of types
 * (`references/types.md`). It is the skill's method (SKILL.md, by April Zhu) said for one slide of a course: the
 * card format, the rules every card keeps, and Folio's own three: the slide's words and numbers only, a question
 * left unanswered, and the students' level.
 */
export const DRAW_RULES = `You draw one Minicharts card: a hand-drawn picture for one slide of a course, in which the slide's content is drawn as a real thing from the slide's own subject (a life cycle as a loop of stage tokens, a ratio as marbles in a tray, the steps of a plan as the papers each step makes). The kit's pen, fills, solids and writing are already loaded, and so are the 54 example cards with their helpers.

A card is code:
card({id:'<short id>', name:'<the chart type, as the type list names it>', of:'<what it shows, a few words>', note:'<how to read it, one or two short sentences, at most 150 characters>',
  draw(){
    const D = [...]; // the slide's content, written once at the top
    PT('<label: value or what it is>', () => { /* draw one part */ }, {lift:[0,-6]});
  }});
- Write exactly one card. The sheet is 520 x 420, origin top left; keep 14 px clear at every edge.
- Your own helpers go above the card, named with your card's id as a prefix. Never redefine a name the kit or the examples use; you may call the examples' helpers.
- Every part that carries the slide's content is wrapped in PT(note, fn). Its note names the part in the slide's words.
- Start from the example card you are shown: keep its layout, scale and drawing method, and redraw its thing as the object chosen for this slide, with that object's own materials and details. Keep the example's level of detail.

To scale and true:
- Draw only what the slide says: its names, its steps, its numbers. A number drawn is one the slide gives, or one worked from two of them and shown as worked ("27 (12 + 15)"). Never invent a figure, a date or a fact.
- Every value drawn from its number with one stated scale (an angle, a height, a count of things); shares add up.
- When the slide asks a question, draw only what the question gives: the setup, the things, the numbers in it. Never its answer, its choices, or which one is right; the students work that out.

Clean ink and colour:
- Use the kit's pen only (lid, rim, ink, line, rule); never raise LOOSE, never draw an outline twice, no scribbles or hatching. Outlines 1.1-1.25 wide; inner details thinner and lighter.
- Flat fills (flat, wash, or a path) with at most a soft gradient. The colour the real thing has, or the kit's WASH colours. RED marks the one thing to look at, once or twice.
- Things that touch, touch: nothing floats.

Words:
- Labels sit off the drawing with lead(a, b), or on it where there is room, with TX or TXC; 13.5 px at least. Labels never overlap each other or the marks.
- Plain words for these students. Straight apostrophes only (written \\' inside a string). Write numbers yourself, not with toLocaleString.
- No people: draw objects, places, plants and animals; where a person would be, draw what they hold or left behind.

Answer with the chart type's id from the type list, the object you drew in a few words, and the card's code.`;

/** What a call that picks slides to draw is told. */
export const PICK_RULES = `Some slides carry their point better as a drawing than as words: a cycle, a sequence of steps, things compared, a thing and its parts, amounts to see side by side. Pick the slides of this lesson that would gain most from being drawn as a Minicharts card, for these students.
- Pick only slides about the subject itself. Never one about the course's running: grading, schedules, due dates, rules, what to bring, instructions for an activity.
- Pick a slide only if what it says can be drawn from its own words and numbers, without adding facts.
- For each, choose the chart type (its id from the type list) that fits what the slide teaches, and an object from the slide's own subject that can hold that type's form, said in a few words.
- Pick fewer, or none, when no slide would gain.`;
