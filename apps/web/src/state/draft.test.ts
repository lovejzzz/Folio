import { describe, expect, it } from 'vitest';
import { looksLikeSyllabus, ownSyllabus } from './draft';

describe('which attached file is the course’s own syllabus', () => {
  const files = [{ title: 'Bell schedule' }, { title: 'BIO 110 syllabus' }];

  it('is what the model read, even when it read that none is', () => {
    expect(ownSyllabus({ syllabus: 'BIO 110 syllabus' }, files)).toBe('BIO 110 syllabus');
    expect(ownSyllabus({ syllabus: '' }, files)).toBeUndefined();
  });

  it('is told by its name only when the files could not be read', () => {
    expect(ownSyllabus(null, files)).toBe('BIO 110 syllabus');
    expect(ownSyllabus(null, [{ title: 'Bell schedule' }, { title: 'Lab schedule' }])).toBeUndefined();
    expect(looksLikeSyllabus('Course schedule, fall')).toBe(true);
  });
});
