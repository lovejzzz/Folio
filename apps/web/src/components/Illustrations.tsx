/** Single-weight ink line drawings for empty states; accent is the only colour. */
export function EmptySheets() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none" aria-hidden className="text-ink-3">
      <path d="M44 22h58l14 14v70H44z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" transform="rotate(-6 80 64)" />
      <path d="M50 18h58l14 14v70H50z" className="fill-paper" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M108 18v14h14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M62 46h36M62 56h44M62 66h28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="119" y="50" width="9" height="16" rx="2" className="fill-accent" />
    </svg>
  );
}
