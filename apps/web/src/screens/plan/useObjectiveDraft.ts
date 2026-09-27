import { cmd, newId } from '@folio/core';
import { useState } from 'react';
import { edit } from '../../state/edit';

/**
 * "Add objective" opens an empty line with the caret in it. The objective is
 * added only once something is typed, so a blank one never reaches the course
 * (or marks anything built from the objectives out of date).
 */
export function useObjectiveDraft(lessonId: string) {
  const [open, setOpen] = useState(false);
  return {
    open,
    start: () => setOpen(true),
    close: () => setOpen(false),
    commit: (text: string) => {
      if (text.trim()) edit([cmd('objective.add', { objective: { id: newId('o'), text }, lessonId })], { key: 'addedObjective' });
    },
  };
}
