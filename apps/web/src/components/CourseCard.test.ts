import { describe, expect, it } from 'vitest';
import { sheetsFor } from './CourseCard';

describe('a course card’s stack', () => {
  it('grows with the course: none for an outline, one for a unit, three for a year', () => {
    expect([0, 1, 4, 7, 8, 12, 19, 20, 36].map(sheetsFor)).toEqual([0, 1, 1, 1, 2, 2, 2, 3, 3]);
  });
});
