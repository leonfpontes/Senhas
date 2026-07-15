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
