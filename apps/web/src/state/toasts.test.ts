import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast, useToasts } from './toasts';

describe('toasts', () => {
  afterEach(() => {
    vi.useRealTimers();
    useToasts.setState({ toasts: [] });
  });

  it('replaces a toast with the same key instead of stacking', () => {
    toast({ key: 'build', message: 'Course ready. 20 items need a look.', duration: 0 });
    toast({ message: 'Saved' });
    toast({ key: 'build', message: 'Course ready. 27 items need a look.', duration: 0 });
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['Saved', 'Course ready. 27 items need a look.']);
  });

  it('pauses while held and dismisses after release', () => {
    vi.useFakeTimers();
    const id = toast({ message: 'Hello', duration: 1000 });
    useToasts.getState().hold(id);
    vi.advanceTimersByTime(5000);
    expect(useToasts.getState().toasts).toHaveLength(1);
    useToasts.getState().release(id);
    vi.advanceTimersByTime(1000);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('keeps word of something gone wrong until it is closed', () => {
    vi.useFakeTimers();
    toast({ message: 'Saved' });
    toast({ message: 'Your changes couldn’t be saved.', tone: 'critical' });
    vi.advanceTimersByTime(60_000);
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['Your changes couldn’t be saved.']);
  });
});
