import { describe, expect, it } from 'vitest';
import { markedForStudents, unsourcedLocators, withUnsourcedMarked } from '../src/locators';

describe('where a material sends its reader', () => {
  const brief = 'Principles of microeconomics. Textbook: Mankiw, Principles of Microeconomics, chapters 4 and 5 in the first two weeks. Readings at https://openstax.org/details/books/principles-economics-3e.';
  it('finds the chapters, dotted sections, pages and addresses the teacher did not give', () => {
    const text = 'Read chapters 4 and 5 of Mankiw, then Section 6.2 (pp. 112–118) and ch. 7; see https://example.org/elasticity and https://openstax.org/details/books/principles-economics-3e. In Section 8 of the safety sheet, find the gloves. Problem 3 on page 2 of the worksheet.';
    // What the brief holds is the teacher's; a bare "Section 8" or "page 2" is a part of the document in hand.
    expect(unsourcedLocators(text, brief)).toEqual(['Section 6.2', 'pp. 112–118', 'ch. 7', 'https://example.org/elasticity']);
  });
  it('takes a chapter with its sections as one place', () => {
    // Marked in the middle, "ch. 10.2–10.3" came out as "ch. 10 (to confirm).2–10.3".
    expect(withUnsourcedMarked('Campbell Biology, ch. 10.2–10.3', brief)).toBe('Campbell Biology, ch. 10.2–10.3 (to confirm)');
    expect(withUnsourcedMarked('Campbell Biology, ch. 10.2–10.3', `${brief} Campbell Biology, ch. 10.2–10.3.`)).toBe('Campbell Biology, ch. 10.2–10.3');
  });
  it('marks one where students read it, once, and leaves what only the teacher reads', () => {
    expect(withUnsourcedMarked('Before class: Mankiw, ch. 7, pp. 140-152. Also chapters 4 and 5.', brief)).toBe('Before class: Mankiw, ch. 7 (to confirm), pp. 140-152 (to confirm). Also chapters 4 and 5.');
    expect(withUnsourcedMarked('Mankiw, ch. 7 (to confirm) and ch. 7 again.', brief)).toBe('Mankiw, ch. 7 (to confirm) and ch. 7 (to confirm) again.');
    const slides = { slides: [{ title: 'Read ch. 9', bullets: ['Section 9.1'], notes: 'From ch. 9, where the argument is fullest.' }] };
    expect(markedForStudents(slides, brief)).toEqual({ slides: [{ title: 'Read ch. 9 (to confirm)', bullets: ['Section 9.1 (to confirm)'], notes: 'From ch. 9, where the argument is fullest.' }] });
  });
});
