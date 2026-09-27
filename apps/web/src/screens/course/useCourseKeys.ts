import { useEffect } from 'react';
import { redo, undo } from '../../state/edit';
import { useUi } from '../../state/ui';
import { isTyping } from './isTyping';

/** ⌘K opens the command bar; ⌘Z and ⇧⌘Z undo and redo when not typing in a field. */
export function useCourseKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        useUi.getState().setCommandOpen(!useUi.getState().commandOpen);
      } else if ((key === 'z' || key === 'y') && !isTyping(e.target)) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
