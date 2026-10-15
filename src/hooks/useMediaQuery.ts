import { useState, useEffect } from 'react';
import { MEDIA_QUERIES } from '../config/breakpoints';

/**
 * React hook for responsive media query detection using window.matchMedia API
 * @param query - CSS media query string
 * @returns boolean indicating if query matches
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
};

/**
 * Hook to detect mobile viewport (<768px)
 */
export const useIsMobile = () => useMediaQuery(MEDIA_QUERIES.maxMd);

/**
 * Hook to detect tablet viewport (768px-1023px)
 */
export const useIsTablet = () => {
  const isAboveMd = useMediaQuery(MEDIA_QUERIES.md);
  const isBelowLg = useMediaQuery(MEDIA_QUERIES.maxLg);
  return isAboveMd && isBelowLg;
};

/**
 * Hook to detect desktop viewport (≥1024px)
 */
export const useIsDesktop = () => useMediaQuery(MEDIA_QUERIES.lg);
