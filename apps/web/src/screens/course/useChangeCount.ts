import { attentionItems, staleItems } from '@folio/core';
import { useCourse } from '../../state/session';

/** How many things are waiting in the Changes drawer. */
export function useChangeCount(): number {
  const course = useCourse();
  return attentionItems(course).length + staleItems(course).length;
}
