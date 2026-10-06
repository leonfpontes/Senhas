import '@testing-library/jest-dom';

// jsdom doesn't provide a global fetch. A few pages call raw fetch() directly
// (ViaCEP/OpenStreetMap lookups, bypassing apiClient since these are third-party
// APIs) — give tests a safe no-op default so those effects don't crash the suite.
if (typeof global.fetch !== 'function') {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  );
}

// ── Polyfills exigidos pelo Radix (Select/Command/Popover) e pelo kit em jsdom ──────────────
// Radix Select/Command chamam hasPointerCapture/releasePointerCapture e scrollIntoView, que o
// jsdom não implementa; ResizeObserver é usado pelo Radix e pelo ResponsiveContainer do Recharts.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverPolyfill {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverPolyfill;
    global.ResizeObserver = ResizeObserverPolyfill;
  }
  // matchMedia: `useMediaQuery` (DataTable modo cartão) e `useIsMobile` (Sidebar). Padrão: não
  // casa com nada (= desktop). Testes de mobile sobrescrevem `window.matchMedia`.
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
}
