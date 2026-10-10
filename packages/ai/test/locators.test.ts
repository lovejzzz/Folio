import { describe, expect, it } from 'vitest';
import { unsourcedLocators, withoutUnsourced } from '../src/locators';

describe('where a material sends its reader', () => {
  const brief = 'Principles of microeconomics. Textbook: Mankiw, Principles of Microeconomics, chapters 4 and 5 in the first two weeks. Readings at https://openstax.org/details/books/principles-economics-3e.';
  it('finds the chapters, dotted sections, pages and addresses the teacher did not give', () => {
    const text = 'Read chapters 4 and 5 of Mankiw, then Section 6.2 (pp. 112–118) and ch. 7; see https://example.org/elasticity and https://openstax.org/details/books/principles-economics-3e. In Section 8 of the safety sheet, find the gloves. Problem 3 on page 2 of the worksheet.';
    // What the brief holds is the teacher's; a bare "Section 8" or "page 2" is a part of the document in hand.
    expect(unsourcedLocators(text, brief)).toEqual(['Section 6.2', 'pp. 112–118', 'ch. 7', 'https://example.org/elasticity']);
  });
  it('puts a place to fill where one stood, and leaves the rest as written', () => {
    expect(withoutUnsourced('Before class: Mankiw, ch. 7, pp. 140-152. Also chapters 4 and 5.', brief)).toBe('Before class: Mankiw, (chapter to confirm), (pages to confirm). Also chapters 4 and 5.');
    expect(withoutUnsourced('Nothing to find here in 3 steps.', brief)).toBe('Nothing to find here in 3 steps.');
  });
});
