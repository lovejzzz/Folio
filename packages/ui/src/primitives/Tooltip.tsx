import type { ReactElement, ReactNode } from 'react';
import { Tooltip as AriaTooltip, TooltipTrigger } from 'react-aria-components';

/** Keyboard- and touch-reachable tooltip; the trigger must be focusable. */
export function Tooltip({ content, children, delay = 500 }: { content: ReactNode; children: ReactElement; delay?: number }) {
  return (
    <TooltipTrigger delay={delay} closeDelay={80}>
      {children}
      <AriaTooltip
        offset={6}
        className="rounded-control bg-ink px-2 py-1 font-ui text-12 text-paper shadow-overlay data-entering:animate-fade-in"
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
