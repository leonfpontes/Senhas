/**
 * useMediaQuery — `window.matchMedia` como estado React, seguro para SSR (começa em `false`
 * e só lê a media query no cliente, então não há divergência de hidratação).
 *
 *   const isMobile = useMediaQuery('(max-width: 639px)');
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export default useMediaQuery;
