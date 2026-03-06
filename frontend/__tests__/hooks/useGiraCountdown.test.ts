/**
 * Tests for useGiraCountdown hook
 */
import { renderHook, act } from '@testing-library/react';
import { useGiraCountdown } from '@/hooks/useGiraCountdown';

// Use fake timers
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useGiraCountdown', () => {
  describe('upcoming state', () => {
    it('returns upcoming when before start time', () => {
      const start = new Date(Date.now() + 3600000).toISOString(); // 1h from now
      const end = new Date(Date.now() + 7200000).toISOString(); // 2h from now

      const { result } = renderHook(() => useGiraCountdown(start, end));

      expect(result.current.status).toBe('upcoming');
      expect(result.current.isOpen).toBe(false);
      expect(result.current.isClosed).toBe(false);
      expect(result.current.timeRemaining).toBeGreaterThan(0);
    });

    it('timeRemaining counts down to start', () => {
      const start = new Date(Date.now() + 3600000).toISOString();
      const end = new Date(Date.now() + 7200000).toISOString();

      const { result } = renderHook(() => useGiraCountdown(start, end));
      const initial = result.current.timeRemaining;

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.timeRemaining).toBeLessThanOrEqual(initial);
    });
  });

  describe('open state', () => {
    it('returns open when within window', () => {
      const start = new Date(Date.now() - 1800000).toISOString(); // 30min ago
      const end = new Date(Date.now() + 1800000).toISOString(); // 30min from now

      const { result } = renderHook(() => useGiraCountdown(start, end));

      expect(result.current.status).toBe('open');
      expect(result.current.isOpen).toBe(true);
      expect(result.current.isClosed).toBe(false);
      expect(result.current.timeRemaining).toBeGreaterThan(0);
    });

    it('percentRemaining is between 0-100 when open', () => {
      const start = new Date(Date.now() - 1800000).toISOString();
      const end = new Date(Date.now() + 1800000).toISOString();

      const { result } = renderHook(() => useGiraCountdown(start, end));

      expect(result.current.percentRemaining).toBeGreaterThanOrEqual(0);
      expect(result.current.percentRemaining).toBeLessThanOrEqual(100);
    });
  });

  describe('closed state', () => {
    it('returns closed when past end time', () => {
      const start = new Date(Date.now() - 7200000).toISOString(); // 2h ago
      const end = new Date(Date.now() - 3600000).toISOString(); // 1h ago

      const { result } = renderHook(() => useGiraCountdown(start, end));

      expect(result.current.status).toBe('closed');
      expect(result.current.isOpen).toBe(false);
      expect(result.current.isClosed).toBe(true);
      expect(result.current.timeRemaining).toBe(0);
    });

    it('percentRemaining is 0 when closed', () => {
      const start = new Date(Date.now() - 7200000).toISOString();
      const end = new Date(Date.now() - 3600000).toISOString();

      const { result } = renderHook(() => useGiraCountdown(start, end));

      expect(result.current.percentRemaining).toBe(0);
    });
  });

  describe('timer cleanup', () => {
    it('clears interval on unmount', () => {
      const clearSpy = jest.spyOn(global, 'clearInterval');
      const start = new Date(Date.now() + 3600000).toISOString();
      const end = new Date(Date.now() + 7200000).toISOString();

      const { unmount } = renderHook(() => useGiraCountdown(start, end));
      unmount();

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });
});
