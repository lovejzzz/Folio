import type { MaterialKind } from '@folio/core';
import type { ReactNode } from 'react';

/**
 * The ten material icons, drawn on a 20 px grid at a 1.5 px stroke to sit
 * beside Lucide. Each shape names its material without colour.
 */
const paths: Record<MaterialKind, ReactNode> = {
  map: (
    <>
      <path d="M3 5.5 7.5 4l5 1.5L17 4v10.5L12.5 16l-5-1.5L3 16z" />
      <path d="M7.5 4v10.5M12.5 5.5V16" />
    </>
  ),
  syllabus: (
    <>
      <path d="M5 3h7.5L15 5.5V17H5z" />
      <path d="M7.5 8h5M7.5 10.75h5M7.5 13.5h3" />
    </>
  ),
  plan: (
    <>
      <circle cx="6" cy="5.5" r="1.25" />
      <circle cx="6" cy="10" r="1.25" />
      <circle cx="6" cy="14.5" r="1.25" />
      <path d="M9.5 5.5H16M9.5 10H14M9.5 14.5H15" />
    </>
  ),
  slides: (
    <>
      <rect x="3" y="4" width="14" height="9.5" rx="1" />
      <path d="M10 13.5V16M7 16.5h6" />
    </>
  ),
  assignments: (
    <>
      <path d="M7 4H5v13h10V4h-2" />
      <rect x="7" y="3" width="6" height="2.5" rx="0.75" />
      <path d="m7.5 11 1.75 1.75L12.75 9" />
    </>
  ),
  rubrics: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1" />
      <path d="M3 8h14M3 12h14M8 4v12" />
    </>
  ),
  discussions: (
    <>
      <path d="M3 4.5h9v6H7L4.5 12.5v-2H3z" />
      <path d="M12 7.5h5v6h-1.5v2L13 13.5H9v-3" />
    </>
  ),
  quiz: (
    <>
      <rect x="3" y="3.5" width="4" height="4" rx="0.75" />
      <path d="m3.75 13.25 1.25 1.25 2.25-2.5" />
      <path d="M10 5.5h7M10 13.5h7" />
    </>
  ),
  study: (
    <>
      <path d="M10 5.5C8.5 4.25 6 3.75 3 4v11c3-.25 5.5.25 7 1.5 1.5-1.25 4-1.75 7-1.5V4c-3-.25-5.5.25-7 1.5z" />
      <path d="M10 5.5v11" />
    </>
  ),
  faq: (
    <>
      <path d="M3.5 4h13v9.5h-7l-3.5 3v-3H3.5z" />
      <path d="M8.5 7.25a1.6 1.6 0 1 1 2.25 1.45c-.5.25-.75.6-.75 1.05v.25M10 11.75v.01" />
    </>
  ),
};

export function MaterialIcon({ kind, size = 18, className }: { kind: MaterialKind; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {paths[kind]}
    </svg>
  );
}
