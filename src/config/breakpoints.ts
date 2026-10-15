/**
 * Responsive breakpoint configuration for Indotek Pro
 * Mobile-first approach: 360px base, tablet 768px, desktop 1024px
 */

export const BREAKPOINTS = {
  xs: 360,
  sm: 390,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export const MEDIA_QUERIES = {
  xs: `(min-width: ${BREAKPOINTS.xs}px)`,
  sm: `(min-width: ${BREAKPOINTS.sm}px)`,
  md: `(min-width: ${BREAKPOINTS.md}px)`,
  lg: `(min-width: ${BREAKPOINTS.lg}px)`,
  xl: `(min-width: ${BREAKPOINTS.xl}px)`,
  maxMd: `(max-width: ${BREAKPOINTS.md - 1}px)`,
  maxLg: `(max-width: ${BREAKPOINTS.lg - 1}px)`,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
export type MediaQuery = keyof typeof MEDIA_QUERIES;
